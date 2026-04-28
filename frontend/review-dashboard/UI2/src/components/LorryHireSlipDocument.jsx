import React, { forwardRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

/**
 * LorryHireSlipDocument — A4, black & white, properly fitted.
 * Layout: 3-section header (company | meta | QR), then standard rows below.
 */
const LorryHireSlipDocument = forwardRef(({
    gcnData,
    slipNo,
    fuelSlipNo,
    loadingAdv,
    dieselLtrs,
    dieselRate = 92.02,
    dieselAdv,
    totalAdv,
}, ref) => {

    const qrPayload = JSON.stringify({
        lorry_hire_slip_no: slipNo,
        gcn_no: gcnData?.gcn_no,
        date: gcnData?.gcn_date,
        invoice_no: gcnData?.invoice_no,
        truck_no: gcnData?.truck_no,
        consignor: gcnData?.consignor_name,
        consignee: gcnData?.consignee_name,
        destination: gcnData?.destination,
        material: gcnData?.material,
        qty_mt: gcnData?.qty_mt,
        loading_advance: loadingAdv,
        diesel_litres: dieselLtrs,
        diesel_advance: dieselAdv,
        total_advance: totalAdv,
    });

    const FONT = 'Arial, Helvetica, sans-serif';
    const B = '1px solid #000';
    const BB = '2px solid #000';

    // base cell
    const td = {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#000',
        background: '#fff',
        padding: '3px 5px',
        border: B,
        verticalAlign: 'middle',
        lineHeight: '1.4',
        wordBreak: 'break-word',
    };
    // label cell (bold, light gray)
    const lbl = { ...td, fontWeight: '700', background: '#ebebeb' };
    const c = { textAlign: 'center' };
    const r = { textAlign: 'right' };
    const v = (x) => x ?? '';

    // Outer wrapper – A4 dimensions
    return (
        <div ref={ref} style={{
            width: '210mm',
            height: '297mm',
            background: '#fff',
            fontFamily: FONT,
            boxSizing: 'border-box',
            padding: '8mm 10mm',
            color: '#000',
            position: 'relative',
            overflow: 'hidden',
        }}>

            {/* ════════════════════════════════════════════════ */}
            {/* TITLE                                           */}
            {/* ════════════════════════════════════════════════ */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @page { size: A4; margin: 0; }
                @media print {
                    body { margin: 0; background: #fff; }
                    div[ref] { border: none !important; box-shadow: none !important; padding: 8mm 10mm !important; }
                }
            `}} />
            <div style={{
                border: BB,
                textAlign: 'center',
                fontSize: '16px',
                fontWeight: '1000',
                letterSpacing: '2px',
                padding: '8px 4px',
                fontFamily: FONT,
                marginBottom: '8px',
            }}>
                LORRY HIRE SLIP
            </div>

            {/* ════════════════════════════════════════════════ */}
            {/* HEADER: 3 columns — Company | Meta | QR         */}
            {/* ════════════════════════════════════════════════ */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                    <col style={{ width: '42%' }} />
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '18%' }} />
                </colgroup>
                <tbody>
                    <tr>
                        {/* ── Company block ── */}
                        <td rowSpan={6} style={{ ...td, verticalAlign: 'top', padding: '5px 7px', border: BB }}>
                            <div style={{ fontSize: '12px', fontWeight: '900', marginBottom: '3px' }}>
                                {v(gcnData?.company_name)}
                            </div>
                            <div style={{ fontSize: '8.5px', fontWeight: '600', marginBottom: '4px' }}>
                                Fleet Owner &amp; Transport Service Provider
                            </div>
                            <div style={{ fontSize: '8.5px', lineHeight: '1.55' }}>
                                <b>Site Office:</b> {v(gcnData?.company_site_office_address)}<br />
                                <b>Mobile:</b> {v(gcnData?.company_phone_number)}<br />
                                <b>Email:</b> {v(gcnData?.company_email)}<br />
                                <b>GST Reg. No.:</b> {v(gcnData?.company_gst)}
                            </div>
                        </td>

                        {/* ── Meta: Slip No ── */}
                        <td style={{ ...lbl, border: B }}>Lorry Hire Slip No.</td>

                        {/* ── QR block ── */}
                        <td rowSpan={6} style={{ ...td, ...c, verticalAlign: 'middle', border: BB, padding: '2px' }}>
                            <QRCodeCanvas value={qrPayload || 'N/A'} size={64} level="M" />
                            <div style={{ fontSize: '7px', marginTop: '1px', color: '#444' }}>SCAN FOR INFO</div>
                        </td>
                    </tr>
                    <tr>
                        <td style={{ ...td, fontFamily: 'monospace', fontWeight: '800', border: B }}>{v(slipNo)}</td>
                    </tr>
                    <tr>
                        <td style={{ ...lbl, border: B }}>GCN No.</td>
                    </tr>
                    <tr>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '8px', border: B }}>{v(gcnData?.gcn_no)}</td>
                    </tr>
                    <tr>
                        <td style={{ ...lbl, border: B }}>Date</td>
                    </tr>
                    <tr>
                        <td style={{ ...td, border: B }}>{v(gcnData?.gcn_date)}</td>
                    </tr>
                </tbody>
            </table>

            {/* ════════════════════════════════════════════════ */}
            {/* META DETAILS — From / Destination / Pin / Invoices */}
            {/* ════════════════════════════════════════════════ */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: '10px' }}>
                <colgroup>
                    <col style={{ width: '21%' }} />
                    <col style={{ width: '29%' }} />
                    <col style={{ width: '21%' }} />
                    <col style={{ width: '29%' }} />
                </colgroup>
                <tbody>
                    {[
                        ['From', gcnData?.consignor_address, 'Destination', gcnData?.destination],
                        ['Pin', gcnData?.consignee_pincode, 'Invoice No.', gcnData?.invoice_no],
                        ['Shipment No.', gcnData?.shipment_no, 'Challan No.', gcnData?.challan_number],
                    ].map(([l1, v1, l2, v2]) => (
                        <tr key={l1}>
                            <td style={lbl}>{l1}</td>
                            <td style={{ ...td, fontFamily: ['Pin', 'Invoice No.', 'Shipment No.', 'Challan No.'].includes(l1) ? 'monospace' : 'inherit', fontSize: '8.5px' }}>{v(v1)}</td>
                            <td style={lbl}>{l2}</td>
                            <td style={{ ...td, fontFamily: 'monospace', fontSize: '8.5px' }}>{v(v2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ════════════════════════════════════════════════ */}
            {/* CONSIGNOR / CONSIGNEE                           */}
            {/* ════════════════════════════════════════════════ */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: '10px' }}>
                <colgroup>
                    <col style={{ width: '50%' }} />
                    <col style={{ width: '50%' }} />
                </colgroup>
                <tbody>
                    <tr>
                        <td style={{ ...lbl, ...c }}>CONSIGNOR</td>
                        <td style={{ ...lbl, ...c }}>CONSIGNEE</td>
                    </tr>
                    <tr>
                        <td style={{ ...td, fontWeight: '700', height: '22px' }}>{v(gcnData?.consignor_name)}</td>
                        <td style={{ ...td, fontWeight: '700', height: '22px' }}>{v(gcnData?.consignee_name)}</td>
                    </tr>
                </tbody>
            </table>

            {/* ════════════════════════════════════════════════ */}
            {/* VEHICLE & EWB DETAILS                          */}
            {/* ════════════════════════════════════════════════ */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: '10px' }}>
                <colgroup>
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '19%' }} />
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '16%' }} />
                </colgroup>
                <tbody>
                    <tr>
                        <td style={lbl}>Truck No.</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontWeight: '800' }}>{v(gcnData?.truck_no)}</td>
                        <td style={lbl}>Truck Owner / Driver</td>
                        <td style={td}>{v(gcnData?.agent_name)}</td>
                        <td style={lbl}>Truck Contact</td>
                        <td style={{ ...td, fontFamily: 'monospace' }}>{v(gcnData?.owner_agent_contact)}</td>
                    </tr>
                    <tr>
                        <td style={lbl}>Engine No.</td>
                        <td style={{ ...td, fontFamily: 'monospace' }}>{v(gcnData?.engine_no)}</td>
                        <td style={lbl}>Owner / Driver Aadhaar</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '8px' }}>{v(gcnData?.owner_agent_aadhaar)}</td>
                        <td style={lbl}>RC Validity</td>
                        <td style={{ ...td, fontSize: '8.5px' }}>{v(gcnData?.rc_validity)}</td>
                    </tr>
                    <tr>
                        <td style={lbl}>Chassis No.</td>
                        <td style={{ ...td, fontFamily: 'monospace' }}>{v(gcnData?.chassis_no)}</td>
                        <td style={lbl}>Owner / Driver PAN</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '8px' }}>{v(gcnData?.owner_agent_pan)}</td>
                        <td style={lbl}>Insurance Exp</td>
                        <td style={{ ...td, fontSize: '8.5px' }}>{v(gcnData?.insurance_validity)}</td>
                    </tr>
                    <tr>
                        <td style={lbl}>Driver Name</td>
                        <td style={td}>{v(gcnData?.driver_name)}</td>
                        <td style={lbl}>Eway Bill No.</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '8.5px' }}>
                            {v(gcnData?.e_way_bill_number)}
                            {(gcnData?.e_way_bill_creation_date || gcnData?.e_way_bill_creation_time) && (
                                <div style={{ fontSize: '7px', fontWeight: '400', color: '#666' }}>
                                    Gen: {gcnData.e_way_bill_creation_date} {gcnData.e_way_bill_creation_time}
                                </div>
                            )}
                        </td>
                        <td style={lbl}>Permit / PUC</td>
                        <td style={{ ...td, fontSize: '7.5px' }}>
                            {v(gcnData?.permit)} {gcnData?.puc ? `/ ${gcnData.puc}` : ''}
                        </td>
                    </tr>
                    <tr>
                        <td style={lbl}>Driver License No.</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '8px' }}>{v(gcnData?.driver_license_no)}</td>
                        <td style={lbl}>Eway Bill Validity</td>
                        <td style={td}>
                            {v(gcnData?.e_way_bill_validUpto_date)}
                            {gcnData?.e_way_bill_validUpto_time && (
                                <span style={{ fontSize: '7px', color: '#666', marginLeft: '4px' }}>
                                    at {gcnData.e_way_bill_validUpto_time}
                                </span>
                            )}
                        </td>
                        <td style={lbl}>Fitness / Tax</td>
                        <td style={{ ...td, fontSize: '7.5px' }}>
                            {v(gcnData?.fitness_validity)} {gcnData?.road_tax_validity ? `/ ${gcnData.road_tax_validity}` : ''}
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* ════════════════════════════════════════════════ */}
            {/* MATERIAL                                        */}
            {/* ════════════════════════════════════════════════ */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: '10px' }}>
                <colgroup>
                    <col style={{ width: '35%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '25%' }} />
                </colgroup>
                <tbody>
                    <tr>
                        <td style={{ ...lbl, ...c }}>Material</td>
                        <td style={{ ...lbl, ...c }}>Bags (Nos)</td>
                        <td style={{ ...lbl, ...c }}>Quantity (MT)</td>
                        <td style={{ ...lbl, ...c }}>Material Value (Rs.)</td>
                    </tr>
                    <tr>
                        <td style={{ ...td, fontWeight: '700' }}>{v(gcnData?.material)}</td>
                        <td style={{ ...td, ...c }}>{v(gcnData?.bags)}</td>
                        <td style={{ ...td, ...c }}>{v(gcnData?.qty_mt)}</td>
                        <td style={{ ...td, ...r }}>{v(gcnData?.material_value)}</td>
                    </tr>
                </tbody>
            </table>

            {/* ════════════════════════════════════════════════ */}
            {/* NOTE  +  ADVANCE TABLE (side by side)          */}
            {/* ════════════════════════════════════════════════ */}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginTop: '10px' }}>
                <colgroup>
                    <col style={{ width: '50%' }} />
                    <col style={{ width: '30%' }} />
                    <col style={{ width: '20%' }} />
                </colgroup>
                <tbody>
                    <tr>
                        <td rowSpan={4} style={{ ...td, verticalAlign: 'top', padding: '5px 6px' }}>
                            <b style={{ fontSize: '9px' }}>Note:</b>
                            <ol style={{ margin: '3px 0 0 0', paddingLeft: '13px', fontSize: '8.5px', lineHeight: '1.7' }}>
                                <li>Signing confirms acceptance of terms &amp; conditions.</li>
                                <li>Signed GCN must be submitted within 7 days.</li>
                            </ol>
                        </td>
                        <td style={lbl}>Loading Advance (Rs.)</td>
                        <td style={{ ...td, ...r }}>{v(loadingAdv)}</td>
                    </tr>
                    <tr>
                        <td style={lbl}>Diesel (Ltrs.)</td>
                        <td style={{ ...td, ...r }}>{v(dieselLtrs)}</td>
                    </tr>
                    <tr>
                        <td style={lbl}>Fuel Slip Number</td>
                        <td style={{ ...td, ...r, fontFamily: 'monospace', fontWeight: '700' }}>{v(fuelSlipNo)}</td>
                    </tr>
                    <tr>
                        <td style={{ ...lbl, fontSize: '10px', fontWeight: '900', borderTop: BB }}>Total Advance (Rs.)</td>
                        <td style={{ ...td, ...r, fontSize: '11px', fontWeight: '900', borderTop: BB }}>{v(totalAdv)}</td>
                    </tr>
                </tbody>
            </table>

            {/* ════════════════════════════════════════════════ */}
            {/* SIGNATURES                                      */}
            {/* ════════════════════════════════════════════════ */}
            <table style={{
                width: 'calc(100% - 20mm)',
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                position: 'absolute',
                bottom: '15mm',
                left: '10mm'
            }}>
                <colgroup>
                    <col style={{ width: '50%' }} />
                    <col style={{ width: '50%' }} />
                </colgroup>
                <tbody>
                    <tr>
                        <td style={{ ...td, ...c, height: '55px', verticalAlign: 'bottom', paddingBottom: '8px', borderTop: BB, borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}>
                            Signature of Truck Owner / Driver
                        </td>
                        <td style={{ ...td, ...c, height: '55px', verticalAlign: 'bottom', paddingBottom: '8px', borderTop: BB, borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}>
                            For Dipali Associates &amp; Co.
                            <br />
                            <span style={{ fontStyle: 'italic', fontSize: '8px', color: '#444' }}>Authorised Signatory</span>
                        </td>
                    </tr>
                </tbody>
            </table>

        </div>
    );
});

LorryHireSlipDocument.displayName = 'LorryHireSlipDocument';
export default LorryHireSlipDocument;
