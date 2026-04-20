import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import html2pdf from 'html2pdf.js';
import LorryHireSlipDocument from './LorryHireSlipDocument';
import FuelSlipDocument from './FuelSlipDocument';
import { buildGcnDataFromInvoice } from './LorryHireSlipReview';
import { API_URL } from '../config';

export default function AutoPdfRegenerator({ invoiceId, onComplete }) {
    const [invoiceData, setInvoiceData] = useState(null);
    const [ready, setReady] = useState(false);
    const lorryRef = useRef(null);
    const fuelRef = useRef(null);

    useEffect(() => {
        if (!invoiceId) return;
        const load = async () => {
            try {
                const token = localStorage.getItem('token');
                // Fetch full data from backend endpoint mapping
                const res = await axios.get(`${API_URL}/invoice/lorry-data/${invoiceId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setInvoiceData(res.data);
            } catch (err) {
                console.error("AutoPdfRegenerator failed to fetch invoice data:", err);
                if (onComplete) onComplete(false);
            }
        };
        load();
    }, [invoiceId, onComplete]);

    useEffect(() => {
        if (invoiceData) {
            // Delay rendering briefly to allow DOM mapping of components visually
            const t = setTimeout(() => setReady(true), 1200);
            return () => clearTimeout(t);
        }
    }, [invoiceData]);

    useEffect(() => {
        if (ready && lorryRef.current && fuelRef.current) {
            const generateAndUpload = async () => {
                try {
                    const token = localStorage.getItem('token');
                    const slipData = invoiceData.lorry_hire_slip_data || {};
                    const gcnData = invoiceData.gcn_data || {};
                    const slipNo = slipData.lorry_hire_slip_no || String(Math.floor(100000 + Math.random() * 900000));
                    
                    const dLtr_comp = Number(slipData.diesel_litres) || 0;
                    const dRate_comp = Number(slipData.diesel_rate) || 0;
                    const dAdv_comp = dLtr_comp * dRate_comp;
                    const lAdv_comp = Number(slipData.loading_advance) || 0;
                    const tAdv_comp = lAdv_comp + dAdv_comp;

                    // Generate Lorry Hire Slip
                    const lorryBlob = await html2pdf().set({
                        margin: 0, filename: `lorry_slip.pdf`, image: { type: 'jpeg', quality: 1.0 },
                        html2canvas: { scale: 3, useCORS: true, logging: false }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    }).from(lorryRef.current).outputPdf('blob');

                    const lorryForm = new FormData();
                    lorryForm.append('softcopy', lorryBlob, `lorry_hire_slip_${slipNo}.pdf`);
                    lorryForm.append('invoice_id', invoiceId);
                    lorryForm.append('slip_data', JSON.stringify({
                        ...slipData,
                        lorry_hire_slip_no: slipNo,
                        diesel_advance: dAdv_comp,
                        total_advance: tAdv_comp
                    }));
                    await axios.post(`${API_URL}/invoice/lorry-hire-slip-softcopy`, lorryForm, { 
                        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` } 
                    });

                    // Generate Fuel Credit Slip
                    const fuelBlob = await html2pdf().set({
                        margin: 0, filename: `fuel_slip.pdf`, image: { type: 'jpeg', quality: 1.0 },
                        html2canvas: { scale: 3, useCORS: true, logging: false }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    }).from(fuelRef.current).outputPdf('blob');
                    
                    const fuelForm = new FormData();
                    fuelForm.append('softcopy', fuelBlob, `fuel_slip_${invoiceId}.pdf`);
                    fuelForm.append('invoice_id', invoiceId);
                    await axios.post(`${API_URL}/invoice/fuel-slip-softcopy`, fuelForm, { 
                        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` } 
                    });

                    console.log(`[AutoPdfRegenerator] Successfully regenerated slips for ${invoiceId}`);
                    if (onComplete) onComplete(true);
                } catch (e) {
                    console.error("[AutoPdfRegenerator] Generation error:", e);
                    if (onComplete) onComplete(false);
                }
            };
            generateAndUpload();
        }
    }, [ready, invoiceData, invoiceId, onComplete]);

    if (!invoiceData) return null;

    const gcnData = { ...buildGcnDataFromInvoice(invoiceData), ...invoiceData.gcn_data };
    const slipData = invoiceData.lorry_hire_slip_data || {};
    const slNo = slipData.lorry_hire_slip_no || '';
    const flNo = slipData.fuel_slip_no || '';
    const lAdv = Number(slipData.loading_advance) || 0;
    const dLtr = Number(slipData.diesel_litres) || 0;
    const dRate = Number(slipData.diesel_rate) || 0;
    const dAdv = dLtr * dRate;
    const tAdv = lAdv + dAdv;

    const autoFuelData = {
        stationName: slipData.station_name || 'SAPTAGIRI AUTOMOBILES',
        stationAddress: 'Panagarh',
        lorrySlipNo: slNo,
        qty: dLtr,
        rate: dRate,
        amount: dAdv
    };

    const dummyQr = "regen_qr_payload";

    return (
        <div style={{ position: 'fixed', top: '-20000px', left: '-20000px', opacity: 0, pointerEvents: 'none', zIndex: -9999 }}>
            <div ref={lorryRef} style={{ width: '210mm', minHeight: '297mm', background: '#fff' }}>
                <LorryHireSlipDocument
                    gcnData={gcnData} slipNo={slNo} fuelSlipNo={flNo}
                    loadingAdv={lAdv} dieselLtrs={dLtr} dieselRate={dRate} dieselAdv={dAdv.toFixed(2)} totalAdv={tAdv.toFixed(2)}
                />
            </div>
            <div ref={fuelRef} style={{ width: '210mm', minHeight: '297mm', background: '#fff' }}>
                <FuelSlipDocument
                    data={invoiceData} fuelData={autoFuelData} hsdSlipNo={flNo} slipDate={new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}
                    amountWords="" qrPayload={dummyQr}
                />
            </div>
        </div>
    );
}
