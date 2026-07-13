import React, { forwardRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

/**
 * AdvanceFuelSlipDocument — Generic, static printable layout for the Advance Fuel Slip.
 * Refactored for PDF generation.
 */
const AdvanceFuelSlipDocument = forwardRef(({
    data,
    fuelData,
    hsdSlipNo,
    slipDate,
    amountWords,
    qrPayload
}, ref) => {

    const inv = data?.human_verified_data?.invoice_details || data?.ai_data?.invoice_data?.invoice_details || {};
    const supply = data?.human_verified_data?.supply_details || data?.ai_data?.invoice_data?.supply_details || {};
    const vehicleNo = supply.vehicle_number || '';

    return (
        <div id="advance-fuel-plate" ref={ref} style={{
            width: '210mm',
            minHeight: '297mm',
            background: '#fff',
            boxSizing: 'border-box',
            margin: '0 auto',
            color: '#000',
            padding: '10mm',
            position: 'relative'
        }}>
            <style dangerouslySetInnerHTML={{
                __html: `
                .fuel-table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                    font-family: 'Times New Roman', Times, serif;
                }
                .fuel-td {
                    border: 3px solid #000;
                    padding: 6px 10px;
                    font-size: 16px;
                    vertical-align: middle;
                    color: #000;
                    height: 28px;
                }
                .fuel-header {
                    font-size: 26px;
                    font-weight: 900;
                    text-align: left;
                    letter-spacing: 0.5px;
                }
                .fuel-subheader {
                    font-size: 16px;
                    font-weight: bold;
                    text-align: left;
                }
                .fuel-gray {
                    background: #e6e6e6;
                    font-weight: 900;
                    font-size: 18px;
                    text-align: center;
                    padding: 6px;
                }
                .fuel-label { font-weight: bold; width: 180px; }
                .fuel-value { font-weight: normal; }
                @page { size: A4; margin: 0; }
                @media print {
                    body { margin: 0; background: #fff; }
                    #advance-fuel-plate { border: none !important; box-shadow: none !important; padding: 10mm !important; }
                }
            `}} />

            <table className="fuel-table">
                <tbody>
                    {/* TITLE & HEADER */}
                    <tr>
                        <td colSpan="4" className="fuel-td fuel-header">DIPALI ASSOCIATES & CO.</td>
                    </tr>
                    <tr>
                        <td colSpan="4" className="fuel-td fuel-subheader">Fleet Owner & Transport Service Provider</td>
                    </tr>
                    <tr>
                        <td colSpan="4" className="fuel-td">Office: 1st Floor, Panja Hotel Darjeeling More, Panagarh</td>
                    </tr>
                    <tr>
                        <td colSpan="4" className="fuel-td" style={{ textAlign: 'left' }}><span className="fuel-label">GST Registration NO.</span> 19AATFD1733C1ZH</td>
                    </tr>
                    <tr>
                        <td colSpan="4" className="fuel-td fuel-gray">ADVANCE FUEL CREDIT SLIP</td>
                    </tr>

                    {/* STATION & SLIP DETAILS */}
                    <tr>
                        <td colSpan="1" className="fuel-td fuel-label">Address</td>
                        <td colSpan="3" className="fuel-td fuel-value">{fuelData.stationAddress}</td>
                    </tr>
                    <tr>
                        <td colSpan="1" className="fuel-td fuel-label">Advance Slip No.</td>
                        <td colSpan="3" className="fuel-td fuel-value">{hsdSlipNo}</td>
                    </tr>
                    <tr>
                        <td colSpan="1" className="fuel-td fuel-label">Fuel Slip No.</td>
                        <td colSpan="3" className="fuel-td fuel-value">{fuelData.fuelSlipNo || '---'}</td>
                    </tr>
                    <tr>
                        <td colSpan="1" className="fuel-td fuel-label">Date:</td>
                        <td colSpan="3" className="fuel-td fuel-value">{slipDate}</td>
                    </tr>
                    <tr>
                        <td colSpan="1" className="fuel-td fuel-label">Vehicle No.</td>
                        <td colSpan="3" className="fuel-td fuel-value">{fuelData.vehicleNo || vehicleNo || '---'}</td>
                    </tr>
                    <tr>
                        <td colSpan="1" className="fuel-td fuel-label">Driver Name</td>
                        <td colSpan="3" className="fuel-td fuel-value">{fuelData.driverName || '---'}</td>
                    </tr>
                    {/* ADVANCE BREAKDOWN */}
                    <tr>
                        <td className="fuel-td fuel-label" colSpan="2">Description</td>
                        <td className="fuel-td fuel-label">Details</td>
                        <td className="fuel-td fuel-label" style={{ textAlign: 'right' }}>Amount (₹)</td>
                    </tr>
                    <tr>
                        <td className="fuel-td fuel-value" colSpan="2">Diesel Qty</td>
                        <td className="fuel-td fuel-value">{fuelData.qty ? `${fuelData.qty} Ltrs` : '---'}</td>
                        <td className="fuel-td fuel-value" style={{ textAlign: 'right' }}>---</td>
                    </tr>
                    <tr>
                        <td className="fuel-td fuel-value" colSpan="2">Loading Advance</td>
                        <td className="fuel-td fuel-value">Cash Advance</td>
                        <td className="fuel-td fuel-value" style={{ textAlign: 'right' }}>{Number(fuelData.loadingAdvance || 0).toFixed(2)}</td>
                    </tr>
                    <tr style={{ background: '#f9f9f9' }}>
                        <td className="fuel-td fuel-label" colSpan="2">Total Advance Authorized</td>
                        <td className="fuel-td fuel-value">Authorized Advance</td>
                        <td className="fuel-td fuel-label" style={{ textAlign: 'right', fontSize: '18px' }}>₹{Number(fuelData.totalAdvance || 0).toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td className="fuel-td fuel-label" colSpan="1">Amount in Words</td>
                        <td className="fuel-td fuel-value" colSpan="3" style={{ textTransform: 'capitalize', fontWeight: 'bold' }}>
                            {amountWords || '---'}
                        </td>
                    </tr>

                    {/* FOOTER & SIGNATURES */}
                    <tr style={{ height: '140px' }}>
                        <td colSpan="1" className="fuel-td" style={{ padding: 0 }}>
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ borderBottom: '1px solid #000', flex: 1 }}></div>
                                <div style={{ borderBottom: '1px solid #000', flex: 1 }}></div>
                                <div style={{ borderBottom: '1px solid #000', flex: 1 }}></div>
                                <div style={{ borderBottom: '1px solid #000', flex: 1 }}></div>
                                <div style={{ borderBottom: '1px solid #000', flex: 1 }}></div>
                                <div style={{ flex: 1 }}></div>
                            </div>
                        </td>
                        <td colSpan="1" className="fuel-td fuel-qr-col" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <QRCodeCanvas value={qrPayload} size={110} level="M" />
                        </td>
                        <td colSpan="1" className="fuel-td" style={{ padding: 0 }}>
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ borderBottom: '1px solid #ccc', flex: 1 }}></div>
                                <div style={{ borderBottom: '1px solid #ccc', flex: 1 }}></div>
                                <div style={{ borderBottom: '1px solid #ccc', flex: 1 }}></div>
                                <div style={{ borderBottom: '1px solid #ccc', flex: 1 }}></div>
                                <div style={{ flex: 1 }}></div>
                            </div>
                        </td>
                        <td colSpan="1" className="fuel-td" style={{ verticalAlign: 'bottom', padding: 0 }}>
                            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                                <div style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    Digitally signed
                                </div>
                                <div style={{ flex: 1, borderTop: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="fuel-label">
                                    For Dipali Associates & Co.
                                </div>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
});

AdvanceFuelSlipDocument.displayName = 'AdvanceFuelSlipDocument';
export default AdvanceFuelSlipDocument;
