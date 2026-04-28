import React, { useRef, useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import html2pdf from 'html2pdf.js';
import axios from 'axios';
import { Box, Button, CircularProgress, Snackbar, Alert } from '@mui/material';
import { API_URL } from '../config';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import AssignmentIcon from '@mui/icons-material/Assignment';

/**
 * GCNDocument — pixel-perfect React version of the GCN HTML template.
 *
 * Props:
 *   data  — the invoice's human_verified_data (or ai_data.invoice_data)
 *           Fields used:
 *             invoice_details.invoice_number / invoice_date
 *             seller_details.seller_name / seller_address / seller_gstin / seller_contact / seller_email
 *             buyer_details.buyer_name / buyer_address
 *             consignee_details.consignee_name / consignee_address / consignee_pincode
 *             supply_details.vehicle_number / transporter_name / destination / destination_code /
 *                            lorrey_receipt_number / bags
 *             ewb_details.ewb_number / ewb_create_date / ewb_valid_date
 *             items[0].description_of_product / quantity / taxable_value
 *   _id   — MongoDB invoice _id (for attaching upload)
 */
const GCNDocument = React.forwardRef(({ data, onUploadComplete }, ref) => {
    const internalRef = useRef();
    const gcnRef = ref || internalRef;
    const [isUploading, setIsUploading] = useState(false);
    const [snack, setSnack] = useState(null);
    const [truckContact, setTruckContact] = useState('');
    const [truckOwner, setTruckOwner] = useState('');

    // ── Derive GCN fields from invoice data ─────────────────────────────
    const inv = data?.invoice_details || {};
    const seller = data?.seller_details || {};
    const buyer = data?.buyer_details || {};
    const consignee = data?.consignee_details || {};
    const supply = data?.supply_details || {};
    const ewb = data?.ewb_details || {};
    const items = data?.items || [];
    const amount = data?.amount_summary || {};
    const firstItem = items[0] || {};

    useEffect(() => {
        const truckNo = supply.vehicle_number;
        if (!truckNo) return;
        const token = localStorage.getItem('token');
        axios.get(`${API_URL}/invoice/truck-contact/${encodeURIComponent(truckNo)}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => {
                if (res.data.found) {
                    if (res.data.contact) setTruckContact(res.data.contact);
                    if (res.data.owner) setTruckOwner(res.data.owner);
                }
            })
            .catch(() => { });
    }, [supply.vehicle_number]);

    const computeGCNNo = () => {
        if (data?.gcn_data?.gcn_no) return data.gcn_data.gcn_no;
        if (data?.lorrey_receipt_number) return data.lorrey_receipt_number;
        if (supply.lorrey_receipt_number) return supply.lorrey_receipt_number;

        const rawDate = inv.invoice_date || '';
        let fyDate = new Date();
        if (rawDate) {
            const parts = rawDate.includes('/') ? rawDate.split('/') : null;
            if (parts && parts.length === 3) {
                fyDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            } else {
                const parsed = new Date(rawDate);
                if (!isNaN(parsed)) fyDate = parsed;
            }
        }
        const month = fyDate.getMonth() + 1;
        const year = fyDate.getFullYear();
        const fyStart = month >= 4 ? year : year - 1;
        const fyShort = `${String(fyStart).slice(-2)}-${String(fyStart + 1).slice(-2)}`;
        
        return `DAC/${fyShort}/TBD`; // Prevent generating fake serial numbers
    };

    const getFullName = (name) => name === 'NVCL' ? 'NUVOCO VISTAS CORP. LTD' : name === 'NVL' ? 'NU VISTA LTD' : name;

    const gcnData = {
        gcn_no: computeGCNNo(),
        gcn_date: inv.invoice_date || new Date().toLocaleDateString('en-IN'),
        company_office_address: 'No.144, Plot No-3, Nayak Villa, Netaji Subhas Pally, Durgapur - 713201',
        company_site_office_address: '1st Floor, Panja Hotel, Darjeeling More, Panagarh',
        company_phone_number: '7810935738 / 9091418737',
        company_email: 'dipaliassociates.durgapur@gmail.com',
        company_gst: '19AATFD1733C1ZH',
        consignor_name: getFullName(seller.seller_name) || getFullName(buyer.buyer_name) || '',
        consignor_address: 'Panagarh, Panagarh Industrial Park Kotagram, Bardhaman-19, West Bengal - 713148',
        seller_gstin: seller.seller_gstin || '',
        consignee_name: getFullName(buyer.buyer_name) || '',
        consignee_address: buyer.buyer_address || consignee.consignee_address || '',
        destination: supply.destination || '',
        consignee_pincode: consignee.consignee_pincode || buyer.buyer_pincode || '',
        truck_no: supply.vehicle_number || '',
        agent_name: supply.transporter_name || '',
        invoice_no: inv.invoice_number || '',
        e_way_bill_number: ewb.ewb_number || '',
        shipment_no: supply.shipment_number || '',
        e_way_bill_creation_date: ewb.ewb_create_date || '',
        e_way_bill_creation_time: ewb.ewb_create_time || '',
        challan_number: supply.challan_number || '',
        e_way_bill_validUpto_date: ewb.ewb_valid_date || '',
        e_way_bill_validUpto_time: ewb.ewb_valid_time || '',
        material: firstItem.description_of_product || firstItem.material_code || '',
        bags: supply.bags || firstItem.bags || '',
        qty_mt: firstItem.quantity || '',
        material_value: amount.net_payable || firstItem.taxable_value || '',
    };

    const qrPayload = JSON.stringify({
        gcn_no: gcnData.gcn_no,
        gcn_date: gcnData.gcn_date,
        invoice_no: gcnData.invoice_no,
        consignor: gcnData.consignor_name,
        consignee: gcnData.consignee_name,
        destination: gcnData.destination,
        truck_no: gcnData.truck_no,
        ewb_no: gcnData.e_way_bill_number,
        qty_mt: gcnData.qty_mt,
        material_value: gcnData.material_value,
    });

    const pdfOptions = {
        margin: 0,
        filename: `gcn_${gcnData.gcn_no}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { scale: 3, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    const generatePDF = () => html2pdf().set(pdfOptions).from(gcnRef.current).outputPdf('blob');

    const handleAutoUpload = async () => {
        if (!data?._id) return;
        setIsUploading(true);
        try {
            const pdfBlob = await generatePDF();
            const formData = new FormData();
            formData.append('softcopy', pdfBlob, `gcn_${gcnData.gcn_no}.pdf`);
            formData.append('invoice_id', data._id);
            formData.append('gcn_data', JSON.stringify(gcnData));
            const token = localStorage.getItem('token');
            const res = await axios.post(`${API_URL}/invoice/gcn-softcopy`, formData, {
                headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` },
            });
            setSnack({ type: 'success', message: 'GCN copy saved to cloud successfully!' });
            if (onUploadComplete) onUploadComplete(res.data.url);
        } catch (e) {
            console.error('GCN auto-upload failed:', e);
            setSnack({ type: 'warning', message: 'GCN generated but cloud save failed. You can still download.' });
        } finally {
            setIsUploading(false);
        }
    };

    useEffect(() => { if (data?._id) handleAutoUpload(); }, [data?._id]);

    const tbl = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' };
    const tdBase = {
        border: '1px solid #000',
        padding: '2px 4px',
        fontSize: '8pt',
        verticalAlign: 'top',
        fontFamily: 'Helvetica, Arial, sans-serif',
        color: '#000',
    };
    const labelCell = { ...tdBase, background: '#e0e0e0', fontWeight: 'bold', width: '35%' };
    const grayBg = { ...tdBase, background: '#e0e0e0', fontWeight: 'bold' };
    const headerBar = {
        background: '#000', color: '#fff', textAlign: 'center',
        fontWeight: '900', fontSize: '10pt', padding: '3px 0',
        fontFamily: 'Helvetica, Arial, sans-serif',
    };

    return (
        <Box sx={{ py: 2 }}>
            {/* Status notification */}
            {isUploading && (
                <Box display="flex" justifyContent="flex-end" px={2} mb={1} className="no-print">
                    <Box display="flex" alignItems="center" gap={1}>
                        <CircularProgress size={16} />
                        <span style={{ fontSize: '12px', color: '#666' }}>Syncing to cloud…</span>
                    </Box>
                </Box>
            )}

            <Snackbar
                open={!!snack}
                autoHideDuration={5000}
                onClose={() => setSnack(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert severity={snack?.type || 'info'} onClose={() => setSnack(null)} variant="filled">
                    {snack?.message}
                </Alert>
            </Snackbar>

            <style dangerouslySetInnerHTML={{
                __html: `
                @page { size: A4; margin: 0; }
                @media print {
                    .no-print { display: none !important; }
                    body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
                    html, body { width: 210mm; height: 100%; }
                    .a4-page { width: 210mm !important; height: 280mm !important; max-height: 280mm !important; border: none !important; margin: 0 !important; padding: 2mm 10mm !important; box-sizing: border-box !important; page-break-after: always; overflow: hidden !important; transform: scale(0.92); transform-origin: top center; }
                }
                .a4-page {
                    width: 210mm;
                    height: 285mm;
                    background: #fff;
                    font-family: Helvetica, Arial, sans-serif;
                    box-sizing: border-box;
                    margin: 0 auto;
                    border: 1px solid #ddd;
                    padding: 2mm 10mm;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
            `}} />

            <Box sx={{ overflowX: 'auto', width: '100%' }}>
                <div id="gcn-wrapper" ref={gcnRef} style={{ margin: '0 auto', width: '210mm' }}>
                    
                    {/* PAGE 1: Two GCN Copies */}
                    <div className="a4-page">
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <GCNFormBlock />
                        </div>
                        <div style={{ borderTop: '1px dashed #ccc', margin: '2mm 0', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '-6px', right: '10px', background: '#fff', padding: '0 8px', fontSize: '8pt', color: '#999' }}>✂ cut here</div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <GCNFormBlock />
                        </div>
                    </div>

                    {/* PAGE 2: Two T&C Copies */}
                    <div className="a4-page">
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <TCBlock />
                        </div>
                        <div style={{ borderTop: '1px dashed #ccc', margin: '2mm 0', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '-6px', right: '10px', background: '#fff', padding: '0 8px', fontSize: '8pt', color: '#999' }}>✂ cut here</div>
                        </div>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <TCBlock />
                        </div>
                    </div>

                </div>
            </Box>
        </Box>
    );

    function GCNFormBlock() {
        return (
            <div style={{ border: '1px solid #eee' }}>
                <div style={headerBar}>GOODS CONSIGNMENT NOTE (GCN)</div>
                <table style={{ ...tbl, borderBottom: '2px solid #000' }}>
                    <tbody>
                        <tr>
                            <td style={{ ...tdBase, width: '40%', borderRight: '2px solid #000' }}>
                                <div style={{ fontSize: '14pt', fontWeight: '900' }}>DIPALI ASSOCIATES &amp; CO.</div>
                                <div style={{ fontSize: '8pt', fontWeight: 'bold' }}>Fleet Owner &amp; Transport Service Provider</div>
                                <div style={{ fontSize: '7pt', lineHeight: '1.4' }}>
                                    <b>Office:</b> {gcnData.company_office_address}<br />
                                    <b>Site:</b> {gcnData.company_site_office_address}<br />
                                    <b>Mobile:</b> {gcnData.company_phone_number}<br />
                                    <b>Email:</b> {gcnData.company_email}<br />
                                    <b>GST No.:</b> {gcnData.company_gst}
                                </div>
                            </td>
                            <td style={{ ...tdBase, width: '40%', borderRight: '2px solid #000', padding: 0 }}>
                                <table style={{ ...tbl, border: 'none' }}>
                                    <tbody>
                                        {[
                                            ['GCN No.', gcnData.gcn_no],
                                            ['Date', gcnData.gcn_date],
                                            ['From', gcnData.consignor_address],
                                            ['Destination', gcnData.destination],
                                            ['Pin', gcnData.consignee_pincode],
                                        ].map(([label, val]) => (
                                            <tr key={label}>
                                                <td style={labelCell}>{label}</td>
                                                <td style={tdBase}>{val}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </td>
                            <td style={{ ...tdBase, width: '20%', textAlign: 'center', verticalAlign: 'middle' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '4px' }}>
                                    <AssignmentIcon style={{ fontSize: '14px', color: '#555' }} />
                                    <QRCodeCanvas value={qrPayload} size={50} level="M" />
                                    <div style={{ fontSize: '6pt', color: '#555' }}>GCN QR</div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <table style={{ ...tbl, borderBottom: '2px solid #000' }}>
                    <tbody>
                        <tr><td style={grayBg} width="50%">Consignor</td><td style={grayBg} width="50%">Consignee</td></tr>
                        <tr>
                            <td style={{ ...tdBase, height: '60px' }}>
                                <b>{gcnData.consignor_name}</b><br />{gcnData.consignor_address}<br /><b>GSTIN:</b> {gcnData.seller_gstin}
                            </td>
                            <td style={{ ...tdBase, height: '60px' }}>
                                <b>{gcnData.consignee_name}</b><br />{gcnData.consignee_address}
                            </td>
                        </tr>
                    </tbody>
                </table>
                <table style={{ ...tbl, borderBottom: '2px solid #000' }}>
                    <tbody>
                        <tr>
                            <td style={grayBg}>Truck No.</td><td style={tdBase}>{gcnData.truck_no}</td>
                            <td style={grayBg}>Truck Owner</td><td style={tdBase}>{truckOwner || gcnData.agent_name}</td>
                            <td style={grayBg}>Truck Contact</td><td style={tdBase}>{truckContact}</td>
                        </tr>
                        <tr>
                            <td style={grayBg}>Invoice No.</td><td style={tdBase}>{gcnData.invoice_no}</td>
                            <td style={grayBg}>Eway Bill No.</td><td style={tdBase} colSpan={3}>{gcnData.e_way_bill_number}</td>
                        </tr>
                        <tr>
                            <td style={grayBg}>Shipment No.</td><td style={tdBase}>{gcnData.shipment_no}</td>
                            <td style={grayBg}>EWB Creation</td><td style={tdBase} colSpan={3}>
                                {gcnData.e_way_bill_creation_date} {gcnData.e_way_bill_creation_time}
                            </td>
                        </tr>
                        <tr>
                            <td style={grayBg}>Challan No.</td><td style={tdBase}>{gcnData.challan_number}</td>
                            <td style={grayBg}>EWB Validity</td><td style={tdBase} colSpan={3}>
                                {gcnData.e_way_bill_validUpto_date} {gcnData.e_way_bill_validUpto_time && `at ${gcnData.e_way_bill_validUpto_time}`}
                            </td>
                        </tr>
                    </tbody>
                </table>
                <table style={{ ...tbl, borderBottom: '2px solid #000' }}>
                    <tbody>
                        <tr>
                            <td style={{ ...grayBg, textAlign: 'center' }}>Material</td>
                            <td style={{ ...grayBg, textAlign: 'center' }}>Bags (Nos)</td>
                            <td style={{ ...grayBg, textAlign: 'center' }}>Quantity (MT)</td>
                            <td style={{ ...grayBg, textAlign: 'center' }}>Material Value (Rs.)</td>
                        </tr>
                        <tr>
                            <td style={{ ...tdBase, textAlign: 'center' }}>{gcnData.material}</td>
                            <td style={{ ...tdBase, textAlign: 'center' }}>{gcnData.bags}</td>
                            <td style={{ ...tdBase, textAlign: 'center' }}>{gcnData.qty_mt}</td>
                            <td style={{ ...tdBase, textAlign: 'center' }}>{gcnData.material_value}</td>
                        </tr>
                    </tbody>
                </table>
                <table style={tbl}>
                    <tbody>
                        <tr>
                            <td style={grayBg} width="40%">Received Material In Good Condition</td>
                            <td style={grayBg} width="30%">For Dipali Associates &amp; Co.</td>
                            <td style={grayBg} width="30%">Truck Owner / Driver Sign</td>
                        </tr>
                        <tr>
                            <td style={{ ...tdBase, height: '60px', textAlign: 'center', verticalAlign: 'bottom', paddingBottom: '6px' }}>Consignee Sign with Stamp</td>
                            <td style={{ ...tdBase, height: '60px', textAlign: 'center', verticalAlign: 'bottom', paddingBottom: '6px' }}>Authorised Signatory</td>
                            <td style={{ ...tdBase, height: '60px' }}></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    }

    function TCBlock() {
        return (
            <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '4px' }}>
                <div style={{ display: 'inline-block', border: '2px solid #000', padding: '4px 16px', fontWeight: '900', fontSize: '11pt', marginBottom: '12px' }}>TERMS &amp; CONDITION</div>
                <ul style={{ margin: '0', paddingLeft: '22px', fontSize: '9pt', lineHeight: '1.8' }}>
                    <li style={{ marginBottom: '8px' }}>This Goods Consignment Note (GCN) to be treated as a valid legal document as well as an independent agreement between Transporter and Truck Owner / Carrier / Agent for each single trip.</li>
                    <li style={{ marginBottom: '8px' }}>Upon issuance of this GCN lien on the Goods / Materials deemed to transfer from transporter to Truck owner / Carrier / Agency.</li>
                    <li style={{ marginBottom: '8px' }}>Responsibility of the material until its safe delivery to the respective consignee from the loading point shall be the Truck Owner / Carrier / Agency. In case of any loss / damage to the material, charges of such damage material at actual to be borne by the Truck Owner / Carrier / Agency. Transporter under no circumstances shall be held responsible.</li>
                    <li>Transporter shall only be liable to make freight only upon receipt of stamped &amp; signed GCN copy.</li>
                </ul>
            </div>
        );
    }
});

export default GCNDocument;
