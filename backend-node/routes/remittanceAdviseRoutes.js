const express = require('express');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const auth = require('../middleware/authMiddleware');
const remittanceUpload = require('../middleware/remittanceUpload');
const { getIO } = require('../socket');

const router = express.Router();

function getCollection() {
  return mongoose.connection.useDb('account_details').collection('remittance_advise');
}

// ── GET /remittance-advise ─────────────────────────────────────────────────
// Optional: ?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
router.get('/', auth, async (req, res) => {
  try {
    const col = getCollection();
    const filter = {};
    if (req.query.fromDate) filter.uploadDate = { $gte: req.query.fromDate };
    if (req.query.toDate)   filter.uploadDate = { ...filter.uploadDate, $lte: req.query.toDate };
    const docs = await col.find(filter).sort({ _uploaded_at: -1 }).toArray();
    res.json({ success: true, records: docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /remittance-advise/upload ─────────────────────────────────────────
// Multipart: field "file" (PDF/image) + optional body fields:
//   description, uploadDate (YYYY-MM-DD), referenceNo
router.post('/upload', auth, remittanceUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    const col = getCollection();
    const doc = {
      filename:    req.file.originalname,
      url:         req.file.location,         // S3 public URL
      mimetype:    req.file.mimetype,
      size:        req.file.size,
      description: req.body.description || '',
      uploadDate:  req.body.uploadDate  || new Date().toISOString().split('T')[0],
      referenceNo: req.body.referenceNo || '',
      _uploaded_at: new Date(),
      _uploaded_by: req.user?.username || req.user?.email || 'unknown',
    };

    const result = await col.insertOne(doc);
    const inserted = { _id: result.insertedId, ...doc };

    try {
      const io = getIO();
      if (io) io.emit('remittanceAdviseUpdate', { action: 'upload', record: inserted });
    } catch (_) {}

    console.log(`[RemittanceUpload] Saved: ${doc.filename} → ${doc.url}`);
    res.status(201).json({ success: true, record: inserted });
  } catch (err) {
    console.error('Remittance upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /remittance-advise/:id ──────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const col = getCollection();
    const result = await col.deleteOne({ _id: new ObjectId(req.params.id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Record not found.' });
    }
    try {
      const io = getIO();
      if (io) io.emit('remittanceAdviseUpdate', { action: 'delete', id: req.params.id });
    } catch (_) {}
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
