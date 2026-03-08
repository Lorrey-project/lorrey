require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const mongoose = require("mongoose");

const invoiceRoutes = require("./routes/invoiceRoutes");
const authRoutes = require("./routes/authRoutes");
const upload = require("./middleware/upload");
const auth = require("./middleware/authMiddleware");
const softcopyUpload = require("./middleware/softcopyUpload");
const gcnUpload = require("./middleware/gcnUpload");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);

console.log("AWS REGION:", process.env.AWS_REGION);

app.post("/upload", auth, upload.single("invoice"), async (req, res) => {
  try {
    const fileUrl = req.file.location;
    console.log("File uploaded to S3:", fileUrl);
    const response = await axios.post("https://lorrey-ai-worker.onrender.com", {
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

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
