import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  Box,
  Button,
  Typography,
  Container,
  Paper,
  Divider,
  Alert,
  CircularProgress,
  Card,
  CardHeader,
  CardContent,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import RestoreIcon from "@mui/icons-material/Restore";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PrintIcon from "@mui/icons-material/Print";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import DocumentScannerIcon from "@mui/icons-material/DocumentScanner";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import axios from "axios";
import html2pdf from "html2pdf.js";
import { io } from "socket.io-client";
import { API_URL } from "../config";

const SOCKET_URL = import.meta.env.VITE_SOCKET_IO_URL || API_URL;
const socket = io('/', { autoConnect: true });

import { toIndianWords } from "../utils/toIndianWords";
import InvoiceDetails from "./InvoiceDetails";
import SellerDetails from "./SellerDetails";
import BuyerDetails from "./BuyerDetails";
import SupplyDetails from "./SupplyDetails";
import ItemsTable from "./ItemsTable";
import EwbDetails from "./EwbDetails";
import PremiumLoadingOverlay from "./PremiumLoadingOverlay";
import TaxInvoice from "./TaxInvoice";
import GCNDocument from "./GCNDocument";
import LorryHireSlipReview from "./LorryHireSlipReview";
import FuelSlipReview from "./FuelSlipReview";
import CameraCaptureDialog from "./CameraCaptureDialog";

export default function InvoiceForm({ onBack }) {
  const { logout } = useAuth();
  const [formData, setFormData] = useState(null);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMode, setProcessingMode] = useState("upload");
  const [showInvoice, setShowInvoice] = useState(false);
  const [showGCN, setShowGCN] = useState(false);
  const [showLorrySlip, setShowLorrySlip] = useState(false);
  const [showFuelSlip, setShowFuelSlip] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isScanTriggered, setIsScanTriggered] = useState(false);
  const [zoom, setZoom] = useState(window.innerWidth < 600 ? 0.40 : 1.0);
  const ZOOM_STEP = 0.15;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3.0;
  const zoomIn = () => setZoom(z => +(Math.min(z + ZOOM_STEP, ZOOM_MAX).toFixed(2)));
  const zoomOut = () => setZoom(z => +(Math.max(z - ZOOM_STEP, ZOOM_MIN).toFixed(2)));
  const zoomReset = () => setZoom(window.innerWidth < 600 ? 0.40 : 1.0);
  const handleScannerCapture = (file) => {
    setIsScannerOpen(false);
    handleFileUpload({ target: { files: [file] } });
  };

  const handlePhysicalScan = async () => {
    setIsScanTriggered(true);
    setIsProcessing(true);
    setProcessingMode("upload");
    setStatus({ type: "info", message: "🖨️ Commanding your HP scanner... Place the document on the scanner and wait." });
    try {
      const token = localStorage.getItem("token");
      await axios.post(`${API_URL}/invoice/scan-now`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Result comes back via socket.io (scanner_document_processed)
    } catch (error) {
      setIsProcessing(false);
      const errMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      if (error.response?.status === 401) {
        setStatus({ type: "error", message: "⚠️ Session expired. Please log out and log back in, then try scanning again." });
      } else {
        setStatus({ type: "error", message: `Scanner error: ${errMsg}. Run: brew install sane-backends` });
      }
    } finally {
      setIsScanTriggered(false);
    }
  };

  // Auto-calculate Unloading Charges (30 * MT) only if destination state is West Bengal.
  // If destination state is anything else, fix unloading charges to 0.
  useEffect(() => {
    const destState = formData?.supply_details?.destination_state?.toLowerCase() || '';
    if (destState === 'west bengal') {
      const qtyStr = formData?.items?.[0]?.quantity;
      if (qtyStr) {
        const qty = parseFloat(qtyStr);
        if (!isNaN(qty)) {
          const calc = (qty * 30).toFixed(2);
          if (formData.nt_details?.unloading_charges !== calc) {
            setFormData(prev => ({
              ...prev,
              nt_details: { ...prev?.nt_details, unloading_charges: calc }
            }));
          }
        }
      }
    } else if (destState && destState !== 'west bengal') {
      // Non-WB destination: fix unloading charges to 0
      if (formData.nt_details?.unloading_charges !== '0') {
        setFormData(prev => ({
          ...prev,
          nt_details: { ...prev?.nt_details, unloading_charges: '0' }
        }));
      }
    }
  }, [formData?.supply_details?.destination_state, formData?.items]);

  // Auto-calculate Amount in Words when Net Payable changes
  useEffect(() => {
    const netPayableStr = formData?.amount_summary?.net_payable;
    if (netPayableStr) {
      const amt = parseFloat(netPayableStr);
      if (!isNaN(amt)) {
        const words = toIndianWords(amt);
        if (formData.amount_summary?.amount_in_words !== words) {
          setFormData(prev => ({
            ...prev,
            amount_summary: { ...prev?.amount_summary, amount_in_words: words }
          }));
        }
      }
    }
  }, [formData?.amount_summary?.net_payable]);

  // Refs for unified print/download
  const taxInvoiceRef = useRef(null);
  const gcnRef = useRef(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    let element = null;
    let filename = "document.pdf";

    if (showGCN) {
      element = gcnRef.current;
      filename = `gcn_${formData.invoice_details?.invoice_number || 'draft'}.pdf`;
    } else if (showInvoice) {
      element = taxInvoiceRef.current;
      filename = `invoice_${formData.invoice_details?.invoice_number || 'draft'}.pdf`;
    }

    if (element) {
      try {
        setStatus({ type: "info", message: "Preparing high-quality PDF. Please wait..." });
        const opt = {
          margin: 0,
          filename: filename,
          image: { type: 'jpeg', quality: 1.0 },
          html2canvas: { scale: 3, useCORS: true, logging: false },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        await html2pdf().set(opt).from(element).save();
        setStatus({ type: "success", message: "✅ Download started successfully!" });
      } catch (err) {
        console.error("Download error:", err);
        setStatus({ type: "error", message: "❌ Download failed: " + err.message });
      }
    } else {
      setStatus({
        type: "error",
        message: "Document reference not found. This usually happens if the preview is still loading. Please wait a moment and try again."
      });
    }
  };

  const ADDON_OPTIONS = [
    { label: "GPS Device", amount: 1500 },
    { label: "RFID Tag", amount: 100 },
    { label: "RFID Tag Reassurance", amount: 100 },
    { label: "Fastag", amount: 200 },
  ];

  const getEmptySchema = () => ({
    invoice_details: {},
    seller_details: {},
    buyer_details: {},
    consignee_details: {},
    supply_details: {},
    items: [],
    tax_details: {},
    amount_summary: {},
    ewb_details: {},
    addon_charges: [],
  });

  const handleAddAddon = () => {
    const usedTypes = (formData.addon_charges || []).map(c => c.type);
    const nextOpt = ADDON_OPTIONS.find(o => !usedTypes.includes(o.label));
    if (!nextOpt) return; // all 4 already added
    setFormData(prev => ({
      ...prev,
      addon_charges: [...(prev.addon_charges || []), { type: nextOpt.label, amount: nextOpt.amount }]
    }));
  };

  const handleAddonChange = (index, selectedLabel) => {
    const opt = ADDON_OPTIONS.find(o => o.label === selectedLabel);
    setFormData(prev => {
      const updated = [...(prev.addon_charges || [])];
      updated[index] = { type: opt.label, amount: opt.amount };
      return { ...prev, addon_charges: updated };
    });
  };

  const handleRemoveAddon = (index) => {
    setFormData(prev => {
      const updated = [...(prev.addon_charges || [])];
      updated.splice(index, 1);
      return { ...prev, addon_charges: updated };
    });
  };

  useEffect(() => {
    setFormData(getEmptySchema());
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isDragActive) setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  useEffect(() => {
    const onStatus = (data) => {
      setProcessingMode("upload");
      setIsProcessing(true);
      setStatus({ type: "info", message: data.message });
    };

    const onError = (data) => {
      setIsProcessing(false);
      setStatus({ type: "error", message: data.error });
    };

    const onProcessed = (data) => {
      setFormData({
        _id: data.invoice_id,
        ...getEmptySchema(),
        ...data.ai_data.invoice_data,
      });
      setErrors({});
      setStatus({
        type: "success",
        message: "Scanning complete! AI Extraction finished, please review the fields below.",
      });
      setIsProcessing(false);
    };

    socket.on("scanner_status", onStatus);
    socket.on("scanner_error", onError);
    socket.on("scanner_document_processed", onProcessed);

    return () => {
      socket.off("scanner_status", onStatus);
      socket.off("scanner_error", onError);
      socket.off("scanner_document_processed", onProcessed);
    };
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload({ target: { files: e.dataTransfer.files } });
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      setStatus({
        type: "error",
        message: "Please upload a valid image or PDF document.",
      });
      setTimeout(() => setStatus(null), 4000);
      return;
    }

    setProcessingMode("upload");
    setIsProcessing(true);
    setStatus(null);

    const data = new FormData();
    data.append("invoice", file);

    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(`${API_URL}/invoice/upload`, data, {
        headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` },
      });

      const invoiceId = response.data.invoice_id;
      setFormData({
        _id: invoiceId,
        ...getEmptySchema(),
        ...response.data.ai_data.invoice_data,
      });
      setErrors({});
      setStatus({
        type: "success",
        message: "Document processed! AI Extraction complete, please review the fields below.",
      });
      // Removed immediate setShowInvoice(true) to allow user review
    } catch (error) {
      console.error("Error connecting to upload pipeline:", error);
      setStatus({
        type: "error",
        message: error.response?.data?.message || error.response?.data?.error || "Failed to process document through the AI Worker pipeline.",
      });
    } finally {
      setIsProcessing(false);
      event.target.value = null;
    }
  };

  const handleChange = (section, field, value) => {
    setFormData((prev) => {
      if (section === "items") {
        return { ...prev, items: value };
      }
      return { ...prev, [section]: { ...prev[section], [field]: value } };
    });
    if (errors[section]?.[field]) {
      setErrors((prev) => ({
        ...prev,
        [section]: { ...prev[section], [field]: null },
      }));
    }
  };

  const handleReset = () => {
    setFormData(getEmptySchema());
    setErrors({});
    setStatus(null);
    setShowInvoice(false);
    setShowGCN(false);
    setShowLorrySlip(false);
    setShowFuelSlip(false);
  };

  const validate = () => {
    const newErrors = {};
    let isValid = true;
    const checkRegex = (val, regex) => val && regex.test(val);
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    const pinRegex = /^[1-9][0-9]{5}$/;

    if (formData.seller_details) {
      newErrors.seller_details = {};
      if (formData.seller_details.seller_gstin && !checkRegex(formData.seller_details.seller_gstin, gstinRegex)) {
        newErrors.seller_details.seller_gstin = "Invalid GSTIN";
        isValid = false;
      }
      if (formData.seller_details.seller_pan && !checkRegex(formData.seller_details.seller_pan, panRegex)) {
        newErrors.seller_details.seller_pan = "Invalid PAN";
        isValid = false;
      }
      if (formData.seller_details.seller_pincode && !checkRegex(formData.seller_details.seller_pincode, pinRegex)) {
        newErrors.seller_details.seller_pincode = "Invalid Pincode";
        isValid = false;
      }
    }

    if (formData.buyer_details) {
      newErrors.buyer_details = {};
      if (formData.buyer_details.buyer_gstin && !checkRegex(formData.buyer_details.buyer_gstin, gstinRegex)) {
        newErrors.buyer_details.buyer_gstin = "Invalid GSTIN";
        isValid = false;
      }
      if (formData.buyer_details.buyer_pan && !checkRegex(formData.buyer_details.buyer_pan, panRegex)) {
        newErrors.buyer_details.buyer_pan = "Invalid PAN";
        isValid = false;
      }
      if (formData.buyer_details.buyer_pincode && !checkRegex(formData.buyer_details.buyer_pincode, pinRegex)) {
        newErrors.buyer_details.buyer_pincode = "Invalid Pincode";
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSave = async () => {
    if (validate()) {
      setProcessingMode("save");
      setIsProcessing(true);
      try {
        const token = localStorage.getItem("token");
        await axios.post(`${API_URL}/invoice/approve`, {
          invoice_id: formData?._id,
          corrected_data: formData,
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });

        // Crucial: fetch the officially generated sequential GCN NO (e.g., DAC/26-27/1)
        try {
          const updated = await axios.get(`${API_URL}/invoice/lorry-data/${formData._id}`, { headers: { Authorization: `Bearer ${token}` } });
          if (updated.data?.gcn_data?.gcn_no) {
            setFormData(prev => ({ ...prev, gcn_data: { ...prev.gcn_data, gcn_no: updated.data.gcn_data.gcn_no } }));
          }
        } catch (e) {
          console.error("Failed to fetch assigned GCN No", e);
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
        setStatus({
          type: "success",
          message: "Final invoice data saved to database successfully!",
        });
        setTimeout(() => setShowInvoice(true), 1500);
      } catch (error) {
        console.error("Error saving final data:", error);
        setStatus({ type: "error", message: "Failed to update Database." });
      } finally {
        setIsProcessing(false);
      }
    } else {
      setStatus({
        type: "error",
        message: "Please fix the validation errors before saving.",
      });
    }
    setTimeout(() => setStatus(null), 4000);
  };

  if (!formData) return null;

  // ── Lorry Hire Slip step (after GCN) ──────────────────────────────────
  if (showLorrySlip) {
    return (
      <LorryHireSlipReview
        invoiceId={formData._id}
        onBack={() => setShowLorrySlip(false)}
        formData={formData}
        onOpenFuelSlip={() => {
          setShowLorrySlip(false);
          setShowFuelSlip(true);
        }}
      />
    );
  }

  // ── Fuel Slip step ──────────────────────────────────────────────────
  if (showFuelSlip) {
    return (
      <FuelSlipReview
        invoiceId={formData._id}
        onBack={() => setShowFuelSlip(false)}
      />
    );
  }

  if (showGCN) {
    return (
      <Box position="relative">
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1100,
            backgroundColor: '#fff',
            borderBottom: '1px solid #ddd',
            px: 3,
            py: 1.5,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
          }}
          className="no-print"
        >
          <Box display="flex" flexWrap="wrap" gap={1.5} justifyContent="space-between" alignItems="center" sx={{ width: '100%' }}>

            {/* Nav Group */}
            <Box display="flex" gap={1} sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 1, md: 1 } }}>
              <Button variant="outlined" size="small" onClick={() => setShowGCN(false)} sx={{ flex: { xs: 1, md: 'none' } }}>
                ← Invoice
              </Button>
              <Button variant="outlined" size="small" onClick={() => window.location.href = '/'} sx={{ flex: { xs: 1, md: 'none' } }}>
                🏠 Home
              </Button>
              <Button
                variant="contained" size="small" onClick={() => setShowLorrySlip(true)}
                sx={{ flex: { xs: 1, md: 'none' }, borderRadius: '8px', fontWeight: 700, background: 'linear-gradient(45deg, #f57c00, #ff9800)', boxShadow: '0 4px 12px rgba(245,124,0,0.3)', '&:hover': { background: '#e65100' } }}
              >
                🚚 Lorry Slip
              </Button>
            </Box>

            {/* Zoom Tool */}
            <Box display="flex" justifyContent="center" sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 3, md: 2 } }}>
              <Box display="flex" alignItems="center" sx={{ bgcolor: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '8px', px: 0.5, py: 0.25 }}>
                <IconButton size="small" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} sx={{ p: 0.5, width: 28, height: 28 }}><span style={{ fontSize: '1.2rem', lineHeight: 1 }}>−</span></IconButton>
                <Box onClick={zoomReset} sx={{ fontWeight: 600, fontSize: '0.85rem', width: 46, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>{Math.round(zoom * 100)}%</Box>
                <IconButton size="small" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} sx={{ p: 0.5, width: 28, height: 28 }}><span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span></IconButton>
              </Box>
            </Box>

            {/* Actions Group */}
            <Box display="flex" gap={1} sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 2, md: 3 } }}>
              <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => setShowGCN(false)} sx={{ flex: 1, borderRadius: 2 }}>Edit</Button>
              <Button variant="outlined" size="small" startIcon={<PrintIcon />} onClick={handlePrint} sx={{ flex: 1, borderRadius: 2 }}>Print</Button>
              <Button variant="contained" size="small" startIcon={<DownloadIcon />} onClick={handleDownload} sx={{ flex: 1, borderRadius: 2 }}>PDF</Button>
            </Box>

          </Box>
        </Box>
        <Box sx={{ width: '100%', height: '100svh', overflow: 'auto', backgroundColor: '#f0f0f0', p: { xs: 2, sm: 4, md: 10 }, pt: { xs: 16, sm: 14 }, textAlign: 'center', '@media print': { height: 'auto !important', overflow: 'visible !important', display: 'block !important', position: 'static !important', p: 0, pt: 0, backgroundColor: 'transparent' } }}>
          <Box sx={{ display: 'inline-block', textAlign: 'left', zoom: zoom, transition: 'zoom 0.2s cubic-bezier(0.4,0,0.2,1)', '@media print': { zoom: '1 !important', display: 'block !important' } }}>
            <GCNDocument ref={gcnRef} data={formData} />
          </Box>
        </Box>
      </Box>
    );
  }

  if (showInvoice) {
    return (
      <Box position="relative">
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1100,
            backgroundColor: '#fff',
            borderBottom: '1px solid #ddd',
            px: 3,
            py: 1.5,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
          }}
          className="no-print"
        >
          <Box display="flex" flexWrap="wrap" gap={1.5} justifyContent="space-between" alignItems="center" sx={{ width: '100%' }}>

            {/* Nav Group */}
            <Box display="flex" gap={1} sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 1, md: 1 } }}>
              <Button variant="outlined" size="small" onClick={() => window.location.href = '/'} sx={{ flex: { xs: 1, md: 'none' } }}>
                🏠 Home
              </Button>
              <Button
                variant="contained" size="small" onClick={() => setShowGCN(true)}
                sx={{ flex: { xs: 1, md: 'none' }, borderRadius: '8px', fontWeight: 700, background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 2px 8px rgba(16,185,129,0.25)', '&:hover': { background: '#047857' } }}
              >
                📋 GCN Copy
              </Button>
            </Box>

            {/* Zoom Tool */}
            <Box display="flex" justifyContent="center" sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 3, md: 2 } }}>
              <Box display="flex" alignItems="center" sx={{ bgcolor: '#f8f9fa', border: '1px solid #e2e8f0', borderRadius: '8px', px: 0.5, py: 0.25 }}>
                <IconButton size="small" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} sx={{ p: 0.5, width: 28, height: 28 }}><span style={{ fontSize: '1.2rem', lineHeight: 1 }}>−</span></IconButton>
                <Box onClick={zoomReset} sx={{ fontWeight: 600, fontSize: '0.85rem', width: 46, textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}>{Math.round(zoom * 100)}%</Box>
                <IconButton size="small" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} sx={{ p: 0.5, width: 28, height: 28 }}><span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span></IconButton>
              </Box>
            </Box>

            {/* Actions Group */}
            <Box display="flex" gap={1} sx={{ flex: { xs: '1 1 100%', md: '0 1 auto' }, order: { xs: 2, md: 3 } }}>
              <Button variant="outlined" size="small" startIcon={<EditIcon />} onClick={() => setShowInvoice(false)} sx={{ flex: 1, borderRadius: 2 }}>Edit</Button>
              <Button variant="outlined" size="small" startIcon={<PrintIcon />} onClick={handlePrint} sx={{ flex: 1, borderRadius: 2 }}>Print</Button>
              <Button variant="contained" size="small" startIcon={<DownloadIcon />} onClick={handleDownload} sx={{ flex: 1, borderRadius: 2 }}>PDF</Button>
            </Box>

          </Box>
        </Box>
        <Box sx={{ width: '100%', height: '100svh', overflow: 'auto', backgroundColor: '#f0f0f0', p: { xs: 2, sm: 4, md: 10 }, pt: { xs: 16, sm: 14 }, textAlign: 'center', '@media print': { height: 'auto !important', overflow: 'visible !important', display: 'block !important', position: 'static !important', p: 0, pt: 0, backgroundColor: 'transparent' } }}>
          <Box sx={{ display: 'inline-block', textAlign: 'left', zoom: zoom, transition: 'zoom 0.2s cubic-bezier(0.4,0,0.2,1)', '@media print': { zoom: '1 !important', display: 'block !important' } }}>
            <TaxInvoice ref={taxInvoiceRef} data={formData} />
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <>
      <CameraCaptureDialog
        open={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onCapture={handleScannerCapture}
      />
      <Container maxWidth="xl" sx={{ mt: 4, pb: 14 }}>
        <Paper
          elevation={0}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            p: { xs: 2.5, md: 6 },
            borderRadius: 2,
            border: isDragActive ? "2px dashed #1a73e8" : "1px solid #e0e0e0",
            backgroundColor: isDragActive ? "rgba(26,115,232,0.04)" : "#ffffff",
            position: "relative",
            transition: "all 0.2s ease",
            boxShadow: { xs: 'none', md: '0 4px 12px rgba(0,0,0,0.05)' }
          }}
        >
          {isDragActive && (
            <Box
              sx={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.8)',
                borderRadius: 2,
              }}
            >
              <Typography variant="h4" color="primary" fontWeight="bold">Drop document here</Typography>
            </Box>
          )}
          <PremiumLoadingOverlay isProcessing={isProcessing} mode={processingMode} />

          <Box sx={{ mb: 4 }}>
            {/* Header & Back Button */}
            <Box display="flex" alignItems="flex-start" gap={1.5} mb={2.5}>
              <IconButton
                onClick={() => window.location.href = '/'}
                disabled={isProcessing}
                sx={{ bgcolor: '#f1f5f9', color: '#334155', borderRadius: '12px', mt: 0.5, boxShadow: '0 2px 5px rgba(0,0,0,0.05)', '&:hover': { bgcolor: '#e2e8f0' } }}
              >
                <ArrowBackIcon />
              </IconButton>
              <Box>
                <Typography
                  variant="h4"
                  fontWeight="900"
                  color="primary"
                  sx={{
                    letterSpacing: '-1px',
                    fontSize: { xs: '1.5rem', md: '2.5rem' },
                    lineHeight: 1.15
                  }}
                >
                  DIPALI ASSOCIATES & CO
                </Typography>
                <Typography variant="body2" color="text.secondary" fontWeight="500" sx={{ mt: 0.5, fontSize: { xs: '0.85rem', md: '1.1rem' } }}>
                  Upload PDF or Image. AI will automatically extract data for review.
                </Typography>
              </Box>
            </Box>

            {/* Action Buttons (Scan & Upload) */}
            <Box display="flex" gap={1.5} sx={{ flexDirection: { xs: 'row', sm: 'row' }, width: '100%' }}>
              <Button
                fullWidth
                variant="contained"
                color="secondary"
                startIcon={isScanTriggered ? <CircularProgress size={16} color="inherit" /> : <DocumentScannerIcon />}
                onClick={handlePhysicalScan}
                sx={{
                  borderRadius: '12px', py: { xs: 1.2, md: 1.5 }, fontWeight: 800, fontSize: { xs: '0.9rem', md: '1rem' },
                  background: 'linear-gradient(45deg, #7b1fa2, #9c27b0)',
                  boxShadow: '0 4px 12px rgba(123,31,162,0.3)',
                  whiteSpace: 'nowrap'
                }}
                disabled={isProcessing || isScanTriggered}
              >
                {isScanTriggered ? 'Scanning...' : 'Scan'}
              </Button>
              <Button
                fullWidth
                variant="contained"
                component="label"
                startIcon={<UploadFileIcon />}
                sx={{
                  borderRadius: '12px', py: { xs: 1.2, md: 1.5 }, fontWeight: 800, fontSize: { xs: '0.9rem', md: '1rem' },
                  bgcolor: '#0052cc', '&:hover': { bgcolor: '#0043a8' },
                  boxShadow: '0 4px 12px rgba(0,82,204,0.3)',
                  whiteSpace: 'nowrap'
                }}
                disabled={isProcessing}
              >
                Upload
                <input
                  type="file"
                  hidden
                  accept="image/*, application/pdf"
                  onChange={handleFileUpload}
                />
              </Button>
            </Box>
          </Box>



          {status && (
            <Alert severity={status.type} sx={{ mb: 3 }}>
              {status.message}
            </Alert>
          )}

          <Divider sx={{ mb: 4 }} />

          <InvoiceDetails data={formData.invoice_details} errors={errors.invoice_details} onChange={handleChange} />

          <Box display="flex" flexDirection="column" gap={0}>
            <SellerDetails data={formData.seller_details} errors={errors.seller_details} onChange={handleChange} />
            <BuyerDetails data={formData.buyer_details} errors={errors.buyer_details} onChange={handleChange} />
          </Box>

          <SupplyDetails data={formData.supply_details} errors={errors.supply_details} onChange={handleChange} />
          <ItemsTable items={formData.items} amountSummary={formData.amount_summary} errors={errors.items} onChange={handleChange} />

          {(formData.invoice_details?.invoice_type === 'NT' || formData.items?.some(i => (i.description_of_product || '').toUpperCase().includes('UNLOADING'))) && (() => {
            const isWestBengal = formData?.supply_details?.destination_state?.toLowerCase() === 'west bengal';
            return (
              <Card sx={{ mb: 3, border: '2px dashed #f59e0b', bgcolor: '#fffbeb' }}>
                <CardHeader title="NT Billing Section" sx={{ bgcolor: '#fde68a' }} titleTypographyProps={{ fontWeight: 800, color: '#b45309' }} />
                <CardContent>
                  <Typography variant="body2" color="text.secondary" mb={2}>Extra details for NT (New Transport/Unloading) or NVR billing.</Typography>
                  <Box display="flex" flexDirection="column" gap={3}>
                    <TextField
                      fullWidth
                      label="Unloading Charges"
                      name="unloading_charges"
                      value={formData.nt_details?.unloading_charges || ''}
                      onChange={(e) => isWestBengal ? handleChange('nt_details', 'unloading_charges', e.target.value) : undefined}
                      variant="outlined"
                      disabled={!isWestBengal}
                      helperText={
                        isWestBengal
                          ? "Auto-calculated (30 × MT) for West Bengal routes."
                          : "Fixed at ₹0 — Unloading charges only apply for West Bengal destinations."
                      }
                      sx={{
                        '& .MuiInputBase-input.Mui-disabled': {
                          WebkitTextFillColor: '#555',
                          fontWeight: 600,
                        }
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>
            );
          })()}

          {/* ── Add on Charges ── */}
          <Card sx={{ mb: 3, border: '2px solid #e3f2fd', bgcolor: '#f8fbff' }}>
            <CardHeader
              title="Add on Charges"
              sx={{ bgcolor: '#e3f2fd' }}
              titleTypographyProps={{ fontWeight: 800, color: '#1565c0' }}
              action={
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AddCircleOutlineIcon />}
                  onClick={handleAddAddon}
                  disabled={(formData.addon_charges || []).length >= ADDON_OPTIONS.length}
                  sx={{ mr: 1, borderRadius: '8px', background: 'linear-gradient(45deg,#1565c0,#1976d2)', boxShadow: '0 3px 8px rgba(25,118,210,0.3)', '&:hover': { background: 'linear-gradient(45deg,#0d47a1,#1565c0)' }, '&.Mui-disabled': { background: '#ccc' } }}
                >
                  Add Charge
                </Button>
              }
            />
            <CardContent>
              {(!formData.addon_charges || formData.addon_charges.length === 0) ? (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                  No add-on charges added. Click "Add Charge" to add one.
                </Typography>
              ) : (
                <Box display="flex" flexDirection="column" gap={2}>
                  {formData.addon_charges.map((charge, idx) => (
                    <Box key={idx} display="flex" alignItems="center" gap={2}>
                      <FormControl sx={{ minWidth: 280 }} size="small">
                        <InputLabel>Charge Type</InputLabel>
                        <Select
                          value={charge.type}
                          label="Charge Type"
                          onChange={(e) => handleAddonChange(idx, e.target.value)}
                        >
                          {ADDON_OPTIONS.map(opt => {
                            const alreadyUsed = (formData.addon_charges || []).some((c, i) => i !== idx && c.type === opt.label);
                            return (
                              <MenuItem key={opt.label} value={opt.label} disabled={alreadyUsed}>
                                {opt.label} — ₹{opt.amount.toLocaleString()} per Truck
                              </MenuItem>
                            );
                          })}
                        </Select>
                      </FormControl>
                      <TextField
                        size="small"
                        label="Amount (₹)"
                        value={`₹${charge.amount.toLocaleString()}`}
                        inputProps={{ readOnly: true }}
                        sx={{ width: 140, '& .MuiInputBase-input': { fontWeight: 700, color: '#1565c0' } }}
                      />
                      <IconButton onClick={() => handleRemoveAddon(idx)} color="error" size="small" title="Remove">
                        <RemoveCircleOutlineIcon />
                      </IconButton>
                    </Box>
                  ))}
                  <Box sx={{ mt: 1, pt: 1.5, borderTop: '1px dashed #90caf9', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight={700} color="text.secondary">Total Add-on:</Typography>
                    <Typography variant="body1" fontWeight={900} color="primary.main">
                      ₹{(formData.addon_charges.reduce((s, c) => s + (c.amount || 0), 0)).toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>

          <EwbDetails data={formData.ewb_details} errors={errors.ewb_details} onChange={handleChange} />
        </Paper>
      </Container>

      {/* ── Fixed Bottom Actions Bar ── */}
      <Paper elevation={16} sx={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 1200, bgcolor: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(0,0,0,0.08)', p: 2, pb: { xs: 3, sm: 2 }
      }}>
        <Container maxWidth="xl" disableGutters>
          <Box display="flex" gap={2} justifyContent="center">
            <Button
              fullWidth
              variant="outlined"
              color="secondary"
              startIcon={<RestoreIcon />}
              onClick={handleReset}
              sx={{ borderRadius: '12px', fontWeight: 800, py: 1.5, maxWidth: '300px', backgroundColor: '#fff' }}
              disabled={isProcessing}
            >
              Reset
            </Button>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              sx={{ borderRadius: '12px', fontWeight: 900, py: 1.5, maxWidth: '300px', background: 'linear-gradient(45deg, #1a73e8, #1557b0)', boxShadow: '0 4px 15px rgba(26,115,232,0.4)', '&:hover': { background: '#1557b0' } }}
              disabled={isProcessing}
            >
              Save All Data
            </Button>
          </Box>
        </Container>
      </Paper>
    </>
  );
}
