require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");
const http = require("http");
const { init: initSocket } = require("./socket");
const { startWatcher } = require("./utils/scannerWatcher");

const invoiceRoutes = require("./routes/invoiceRoutes");
const voucherRoutes = require("./routes/voucherRoutes");
const authRoutes = require("./routes/authRoutes");
const upload = require("./middleware/upload");
const auth = require("./middleware/authMiddleware");
const softcopyUpload = require("./middleware/softcopyUpload");
const gcnUpload = require("./middleware/gcnUpload");

const app = express();

// Plain HTTP server — no SSL
const server = http.createServer(app);
console.log("Running on HTTP (no SSL)");

initSocket(server);
startWatcher();

// Allow all frontend dev ports (5173–5176) on localhost and local network
const allowedOrigins = [
  /^http:\/\/localhost:(5173|5174|5175|5176)$/,
  /^http:\/\/192\.168\.\d+\.\d+:(5173|5174|5175|5176)$/,
  /^http:\/\/10\.\d+\.\d+\.\d+:(5173|5174|5175|5176)$/,
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, mobile apps)
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some((pattern) => pattern.test(origin));
    callback(allowed ? null : new Error(`CORS blocked: ${origin}`), allowed);
  },
  credentials: true,
}));
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/voucher", voucherRoutes);
app.use("/truck-contacts", require("./routes/truckContactRoutes"));
app.use("/cement-register", require("./routes/cementRegisterRoutes"));
app.use("/gst-portal", require("./routes/gstPortalRoutes"));
app.use("/main-cashbook", require("./routes/mainCashbookRoutes"));
app.use("/pump-payment", require("./routes/pumpPaymentRoutes"));
app.use("/party-payment", require("./routes/partyPaymentRoutes"));
app.use("/fy-details", require("./routes/financialYearRoutes"));
app.use("/account-details", require("./routes/accountDetailRoutes"));

const activePortals = {
  office: 0,
  site: 0,
  sas1: 0,
  sas2: 0
};

function getPortalId(user) {
  if (user.role === 'HEAD_OFFICE') return 'office';
  if (user.role === 'OFFICE') return 'site';
  if (user.role === 'PETROL PUMP' && user.pumpName === 'SAS-1') return 'sas1';
  if (user.role === 'PETROL PUMP' && user.pumpName === 'SAS-2') return 'sas2';
  return null;
}

app.post("/system/heartbeat", auth, (req, res) => {
  const portalId = getPortalId(req.user);
  if (portalId) activePortals[portalId] = Date.now();
  res.json({ success: true });
});

app.post("/system/portal-logout", auth, (req, res) => {
  const portalId = getPortalId(req.user);
  if (portalId) activePortals[portalId] = 0; // Immediately zero out — goes Offline right away
  res.json({ success: true });
});

app.get("/system/portal-status", (req, res) => {
  const now = Date.now();
  const timeoutMs = 2 * 60 * 1000; // 2 minutes threshold to count as offline
  
  res.json({ 
    success: true, 
    statuses: [
      { id: 'office', name: 'Head', active: (now - activePortals.office) < timeoutMs },
      { id: 'site', name: 'Site', active: (now - activePortals.site) < timeoutMs },
      { id: 'sas1', name: 'SAS-1', active: (now - activePortals.sas1) < timeoutMs },
      { id: 'sas2', name: 'SAS-2', active: (now - activePortals.sas2) < timeoutMs }
    ]
  });
});

console.log("AWS REGION:", process.env.AWS_REGION);

app.post("/upload", auth, upload.single("invoice"), async (req, res) => {
  try {
    const fileUrl = req.file.location;
    console.log("File uploaded to S3:", fileUrl);
    const aiWorkerUrl = process.env.AI_WORKER_URL || "http://127.0.0.1:8000";
    const response = await axios.post(`${aiWorkerUrl}/process`, {
      file: fileUrl
    });
    res.json({
      file_url: fileUrl,
      ai_data: response.data
    });
  } catch (error) {
    console.log(error.response?.data || error.message);
    res.status(500).json({ error: "Processing failed" });
  }
});

app.post("/invoice/softcopy", auth, softcopyUpload.single("softcopy"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { invoice_id } = req.body;
  if (invoice_id) {
    await require("./models/Invoice").findByIdAndUpdate(invoice_id, {
      softcopy_url: req.file.location
    });
  }

  res.json({ message: "Softcopy saved successfully", url: req.file.location });
});

app.post("/invoice/gcn-softcopy", auth, gcnUpload.single("softcopy"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { invoice_id, gcn_data } = req.body;
  const update = { gcn_url: req.file.location };
  if (gcn_data) {
    try { update.gcn_data = JSON.parse(gcn_data); } catch (_) { /* ignore */ }
  }

  if (invoice_id) {
    await require("./models/Invoice").findByIdAndUpdate(invoice_id, update);
  }

  res.json({ message: "GCN softcopy saved successfully", url: req.file.location });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch(err => console.error("MongoDB connection error:", err));

app.use("/invoice", auth, invoiceRoutes);

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
