import React, { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import html2pdf from 'html2pdf.js';
import axios from 'axios';
import { Box, Typography, Paper, CircularProgress } from '@mui/material';
import { API_URL } from '../config';
import AssignmentIcon from '@mui/icons-material/Assignment';

/**
 * Pure-HTML invoice plate — no MUI Typography inside table cells for PDF consistency.
 */
const TaxInvoice = React.forwardRef(({ data }, ref) => {
    const internalRef = useRef();
    const invoiceRef = ref || internalRef;
    const [isUploading, setIsUploading] = useState(false);

    // ── Derive fields from data ─────────────────────────────────────────
    const inv = data?.invoice_details || {};
    const seller = data?.seller_details || {};
    const buyer = data?.buyer_details || {};
    const consignee = data?.consignee_details || {};
    const supply = data?.supply_details || {};
    const ewb = data?.ewb_details || {};
    const items = data?.items || [];
    const tax = data?.tax_details || {};
    const amount = data?.amount_summary || {};

    const qrPayload = JSON.stringify({
        invNo: inv.invoice_number,
        date: inv.invoice_date,
        seller: seller.seller_gstin,
        buyer: buyer.buyer_gstin,
        total: amount.net_payable
    });

    const pdfOptions = {
        margin: 0,
        filename: `invoice_${inv.invoice_number || 'draft'}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { scale: 3, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    const generatePDF = () => html2pdf().set(pdfOptions).from(invoiceRef.current).outputPdf('blob');

    const handleAutoUpload = async () => {
        if (!data?._id) return;
        setIsUploading(true);
        try {
            const pdfBlob = await generatePDF();
            const formData = new FormData();
            formData.append('softcopy', pdfBlob, `invoice_${inv.invoice_number || 'draft'}.pdf`);
            formData.append('invoice_id', data._id);
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/invoice/softcopy`, formData, {
                headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` },
            });
        } catch (e) {
            console.error('Invoice auto-upload failed:', e);
        } finally {
            setIsUploading(false);
        }
    };

    useEffect(() => { if (data?._id) handleAutoUpload(); }, [data?._id]);

    // ── Styling Constants ───────────────────────────────────────────────
    const F = { xs: '7px', sm: '8px', md: '9px', lg: '10px', xl: '11px', h: '16px' };
    const cellBase = {
        border: '1px solid #000',
        padding: '3px 5px',
        fontSize: F.md,
        verticalAlign: 'top',
        lineHeight: '1.3',
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#000',
        wordBreak: 'break-word',
    };
    const lbl = { display: 'block', fontSize: F.sm, fontWeight: '700', color: '#444', marginBottom: '2px' };
    const bold = { fontWeight: '700', fontSize: F.lg };
    const tbl = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' };

    return (
        <Box sx={{ py: 2 }}>
            {isUploading && (
                <Box display="flex" justifyContent="flex-end" px={2} mb={1} className="no-print">
                    <Box display="flex" alignItems="center" gap={1}>
                        <CircularProgress size={16} />
                        <span style={{ fontSize: '12px', color: '#666' }}>Syncing to cloud…</span>
                    </Box>
                </Box>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                @page { size: A4; margin: 0; }
                @media print {
                    .no-print { display: none !important; }
                    body { background: #fff !important; margin: 0 !important; }
                    html, body { width: 210mm; }
                    #inv-plate { width: 210mm !important; min-height: 297mm !important; padding: 10mm !important; border: none !important; box-shadow: none !important; margin: 0 !important; }
                }
            `}} />

            <Box sx={{ overflowX: 'auto', width: '100%' }}>
                <div id="inv-plate" ref={invoiceRef} style={{
                    width: '210mm',
                    minHeight: '297mm',
                    padding: '10mm',
                    backgroundColor: '#fff',
                    color: '#000',
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    boxSizing: 'border-box',
                    margin: '0 auto',
                    position: 'relative',
                    border: '1px solid #eee',
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: F.md, fontWeight: '700' }}>DUPLICATE</span>
                        <span style={{ fontSize: F.h, fontWeight: '900', letterSpacing: '2px' }}>TAX INVOICE</span>
                        <span style={{ fontSize: F.md, fontWeight: '700' }}>Original for Recipient</span>
                    </div>

                    {/* Seller + Meta */}
                    <table style={{ ...tbl, border: '1.5px solid #000' }}>
                        <tbody>
                            <tr>
                                <td style={{ ...cellBase, width: '46%', borderRight: '1px solid #000' }} rowSpan={2}>
                                    <div style={{ fontSize: F.xl, fontWeight: '900', lineHeight: '1.2', marginBottom: '3px' }}>{supply.transporter_name || "DIPALI ASSOCIATES & CO."}</div>
                                    <div style={{ fontSize: F.md, fontWeight: '700', marginBottom: '4px' }}>Fleet Owner & Transport Service Provider</div>
                                    <div style={{ fontSize: F.sm, marginBottom: '2px' }}><strong>Office:</strong> No.144, Plot No-3, Nayak Villa, Netaji Subhas Pally, Durgapur - 713201</div>
                                    <div style={{ fontSize: F.sm, marginBottom: '2px' }}><strong>Site Office:</strong> 1st Floor, Panja Hotel, Darjeeling More, Panagarh</div>
                                    <div style={{ fontSize: F.sm, marginBottom: '2px' }}><strong>Mobile:</strong> 7810935738 / 8116221063 / 9474485192</div>
                                    <div style={{ fontSize: F.sm, marginBottom: '2px' }}><strong>Email:</strong> dipaliassociates.durgapur@gmail.com</div>
                                    <div style={{ fontSize: F.sm }}><strong>GST No.:</strong> {supply.transporter_gstin || "19AATFD1733C1ZH"}</div>
                                </td>
                                <td style={{ ...cellBase, width: '27%', borderRight: '1px solid #000' }}>
                                    <span style={lbl}>Invoice No</span>
                                    <span style={bold}>{inv.invoice_number}</span>
                                </td>
                                <td style={{ ...cellBase, width: '27%' }}>
                                    <span style={lbl}>Date &amp; Time:</span>
                                    <span style={bold}>{inv.invoice_date}</span>
                                    {inv.invoice_time && <div style={{ fontSize: F.md }}>{inv.invoice_time}</div>}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ ...cellBase, borderRight: '1px solid #000' }}>
                                    <span style={lbl}>Sales Order No.:</span>
                                    <div style={{ fontSize: F.md }}>{supply.order_reference_number}</div>
                                </td>
                                <td style={{ ...cellBase, textAlign: 'center' }}>
                                    <QRCodeCanvas value={qrPayload} size={58} level="M" />
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Parties */}
                    <table style={{ ...tbl, borderLeft: '1.5px solid #000', borderRight: '1.5px solid #000' }}>
                        <tbody>
                            <tr>
                                <td style={{ ...cellBase, width: '50%', borderRight: '1px solid #000' }}>
                                    <span style={lbl}>Customer :</span>
                                    <div style={bold}>{seller.seller_name}</div>
                                    <div style={{ fontSize: F.sm, marginTop: '2px' }}>{seller.seller_address}</div>
                                    {seller.seller_pincode && <div style={{ fontSize: F.sm }}>PIN: <strong>{seller.seller_pincode}</strong></div>}
                                    <div style={{ fontSize: F.sm, marginTop: '3px' }}>GSTIN: <strong>{seller.seller_gstin}</strong></div>
                                    <div style={{ fontSize: F.sm }}>PAN: <strong>{seller.seller_pan}</strong></div>
                                </td>
                                <td style={{ ...cellBase, width: '50%' }}>
                                    <span style={lbl}>Consignee :</span>
                                    <div style={bold}>{buyer.buyer_name}</div>
                                    <div style={{ fontSize: F.sm, marginTop: '2px' }}>{buyer.buyer_address}</div>
                                    {buyer.buyer_pincode && <div style={{ fontSize: F.sm }}>PIN: <strong>{buyer.buyer_pincode}</strong></div>}
                                    {buyer.buyer_gstin && <div style={{ fontSize: F.sm, marginTop: '3px' }}>GSTIN: <strong>{buyer.buyer_gstin}</strong></div>}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Transport Details */}
                    <table style={{ ...tbl, borderLeft: '1.5px solid #000', borderRight: '1.5px solid #000' }}>
                        <tbody>
                            <tr>
                                <td style={{ ...cellBase, width: '25%', borderRight: '1px solid #000' }}>
                                    <span style={lbl}>Mode of Transport</span>
                                    <strong>{supply.mode_of_transport}</strong>
                                </td>
                                <td style={{ ...cellBase, width: '25%', borderRight: '1px solid #000' }}>
                                    <span style={lbl}>Name of Transporter</span>
                                    <strong>{supply.transporter_name}</strong>
                                </td>
                                <td style={{ ...cellBase, width: '25%', borderRight: '1px solid #000' }}>
                                    <span style={lbl}>Destination</span>
                                    <strong>{supply.destination}{supply.destination_code ? ` (${supply.destination_code})` : ''}</strong>
                                </td>
                                <td style={{ ...cellBase, width: '25%' }}>
                                    <span style={lbl}>Challan Number</span>
                                    <strong>{supply.challan_number}</strong>
                                </td>
                            </tr>
                            <tr>
                                <td style={{ ...cellBase, borderRight: '1px solid #000' }}>
                                    <span style={lbl}>Vehicle Number</span>
                                    <strong>{supply.vehicle_number}</strong>
                                </td>
                                <td style={{ ...cellBase, borderRight: '1px solid #000' }}>
                                    <span style={lbl}>Lorry Receipt No.</span>
                                    <strong>{supply.lorrey_receipt_number}</strong>
                                </td>
                                <td style={{ ...cellBase }} colSpan={2}>
                                    <span style={lbl}>Reference Number</span>
                                    <strong>{supply.reference_number || inv.reference_number}</strong>
                                </td>
                            </tr>
                            <tr>
                                <td style={{ ...cellBase, borderRight: '1px solid #000' }}>
                                    <span style={lbl}>Company's GST</span>
                                    <strong>{seller.seller_gstin}</strong>
                                </td>
                                <td style={{ ...cellBase, borderRight: '1px solid #000' }}>
                                    {supply.delivery_number && <><span style={lbl}>Delivery Number</span><strong>{supply.delivery_number}</strong></>}
                                </td>
                                <td style={{ ...cellBase }} colSpan={2}>
                                    <div><span style={lbl}>State</span><strong style={{ textTransform: 'uppercase' }}>{supply.destination_state || "WEST BENGAL"}</strong></div>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Items Table */}
                    <table style={{ ...tbl, borderLeft: '1.5px solid #000', borderRight: '1.5px solid #000', borderTop: '2px solid #000' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f2f2f2' }}>
                                <th style={{ ...cellBase, width: '12%', textAlign: 'center' }}>HSN</th>
                                <th style={{ ...cellBase, width: '33%', textAlign: 'center' }}>Description</th>
                                <th style={{ ...cellBase, width: '12%', textAlign: 'center' }}>Qty (MT)</th>
                                <th style={{ ...cellBase, width: '13%', textAlign: 'center' }}>Bags</th>
                                <th style={{ ...cellBase, width: '31%', textAlign: 'right' }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx}>
                                    <td style={{ ...cellBase, textAlign: 'center' }}>{item.hsn_code}</td>
                                    <td style={{ ...cellBase }}>
                                        <strong>{item.material_code}</strong>
                                        <div style={{ fontSize: F.sm }}>{item.description_of_product}</div>
                                    </td>
                                    <td style={{ ...cellBase, textAlign: 'center' }}>
                                        <strong>{item.quantity}</strong>
                                    </td>
                                    <td style={{ ...cellBase, textAlign: 'center' }}>
                                        <strong>{item.bags || '-'}</strong>
                                    </td>
                                    <td style={{ ...cellBase, textAlign: 'right' }}>{item.net_payable || item.taxable_value}</td>
                                </tr>
                            ))}
                            {/* Fillers */}
                            <tr style={{ height: '40px' }}>
                                <td style={cellBase} colSpan={5}></td>
                            </tr>
                            {/* Totals */}
                            <tr>
                                <td style={{ ...cellBase, border: 'none' }} colSpan={2}></td>
                                <td style={{ ...cellBase, textAlign: 'right', fontWeight: '900' }} colSpan={2}>Total Payable</td>
                                <td style={{ ...cellBase, textAlign: 'right', fontWeight: '900' }}>{amount.net_payable}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Footer */}
                    <div style={{ border: '1px solid #000', borderTop: 'none', padding: '4px 8px' }}>
                        <div style={{ fontSize: F.md }}>Amount in Words: <strong>{amount.amount_in_words}</strong></div>
                    </div>
                    <div style={{ border: '1.5px solid #000', borderTop: 'none', padding: '6px' }}>
                        <em style={{ fontSize: F.xs }}>Certified that the particulars given above are true and correct.</em>
                    </div>

                    <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ width: '60%' }}>
                            {ewb.ewb_number && (
                                <div style={{ fontSize: F.sm }}>
                                    E-Way Bill: <strong>{ewb.ewb_number}</strong>
                                    {(ewb.ewb_create_date || ewb.ewb_create_time) && (
                                        <span style={{ fontSize: F.xs, color: '#666', marginLeft: '5px' }}>
                                            (Generated: {ewb.ewb_create_date} {ewb.ewb_create_time})
                                        </span>
                                    )}
                                </div>
                            )}
                            {(ewb.ewb_valid_date || ewb.ewb_valid_time) && (
                                <div style={{ fontSize: F.sm }}>
                                    Valid Status: <strong>{ewb.ewb_valid_date}</strong> {ewb.ewb_valid_time && `at ${ewb.ewb_valid_time}`}
                                </div>
                            )}
                        </div>
                        <div style={{ width: '38%', textAlign: 'right' }}>
                            <div style={{ fontSize: F.md, fontWeight: '700' }}>For {supply.transporter_name || "DIPALI ASSOCIATES & CO."}</div>
                            <div style={{ height: '40px' }}></div>
                            <div style={{ fontSize: F.sm }}><strong>Authorized Signatory</strong></div>
                        </div>
                    </div>
                </div>
            </Box>
        </Box>
    );
});

export default TaxInvoice;
