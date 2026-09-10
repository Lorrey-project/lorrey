const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const gstAttachUpload = require('../middleware/gstAttachUpload');
const { getIO } = require('../socket');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

const optionalAuth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      // invalid token, proceed anyway
    }
  }
  next();
};

const getCollection = () => mongoose.connection.db.collection('printing_stationary');

// ── GET /printing-stationary ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const col = getCollection();
    const entries = await col.find({}).sort({ 'SL NO': 1 }).toArray();
    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /printing-stationary ───────────────────────────────────────────────
router.post('/', optionalAuth, async (req, res) => {
  try {
    const col = getCollection();
    const count = await col.countDocuments();
    const slNo = req.body['SL NO'] || (count + 1);
    
    const doc = {
      'SL NO': slNo,
      purchase_item_name: req.body.purchase_item_name || '',
      date: req.body.date || new Date().toISOString().split('T')[0],
      amount: req.body.amount || '',
      reason: req.body.reason || '',
      bill_pdf_url: req.body.bill_pdf_url || '',
      bill_pdf_name: req.body.bill_pdf_name || '',
      created_at: new Date()
    };

    const result = await col.insertOne(doc);
    const newEntry = { _id: result.insertedId, ...doc };

    const io = getIO();
    if (io) io.emit('printingStationaryUpdates', { action: 'create', entry: newEntry });

    res.status(201).json({ success: true, entry: newEntry });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ── PUT /printing-stationary/bulk-update ────────────────────────────────────
router.put('/bulk-update', optionalAuth, async (req, res) => {
  try {
    const col = getCollection();
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    const bulkOps = updates.map(u => {
      const { id, changes } = u;
      const setObj = {};
      if (changes['SL NO'] !== undefined) setObj['SL NO'] = Number(changes['SL NO']);
      if (changes.purchase_item_name !== undefined) setObj.purchase_item_name = String(changes.purchase_item_name);
      if (changes.date !== undefined) setObj.date = String(changes.date);
      if (changes.amount !== undefined) setObj.amount = changes.amount;
      if (changes.reason !== undefined) setObj.reason = String(changes.reason);
      if (changes.bill_pdf_url !== undefined) setObj.bill_pdf_url = String(changes.bill_pdf_url);
      if (changes.bill_pdf_name !== undefined) setObj.bill_pdf_name = String(changes.bill_pdf_name);

      setObj.updated_at = new Date();

      return {
        updateOne: {
          filter: { _id: new ObjectId(id) },
          update: { $set: setObj }
        }
      };
    });

    const result = await col.bulkWrite(bulkOps, { ordered: false });

    const io = getIO();
    if (io) io.emit('printingStationaryUpdates', { action: 'bulkUpdate' });

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── DELETE /printing-stationary/bulk-delete ─────────────────────────────────
router.delete('/bulk-delete', optionalAuth, async (req, res) => {
  try {
    const col = getCollection();
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Provide an array of ids to delete.' });
    }

    const objectIds = ids.map(id => new ObjectId(id));
    const result = await col.deleteMany({ _id: { $in: objectIds } });

    const io = getIO();
    if (io) io.emit('printingStationaryUpdates', { action: 'bulkDelete', ids });

    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /printing-stationary/attach/:rowId ─────────────────────────────────
router.post('/attach/:rowId', optionalAuth, (req, res, next) => {
  gstAttachUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });
    const col = getCollection();
    const { rowId } = req.params;
    const url = req.file.location || `/uploads/${req.file.filename}`;
    const fileName = req.file.originalname || 'invoice_bill.pdf';

    await col.updateOne(
      { _id: new ObjectId(rowId) },
      { $set: { bill_pdf_url: url, bill_pdf_name: fileName, updated_at: new Date() } }
    );

    const io = getIO();
    if (io) io.emit('printingStationaryUpdates', { action: 'attach', rowId, url, fileName });

    res.json({ success: true, url, fileName });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /printing-stationary/detach/:rowId ───────────────────────────────
router.delete('/detach/:rowId', optionalAuth, async (req, res) => {
  try {
    const col = getCollection();
    const { rowId } = req.params;

    await col.updateOne(
      { _id: new ObjectId(rowId) },
      { $unset: { bill_pdf_url: '', bill_pdf_name: '' }, $set: { updated_at: new Date() } }
    );

    const io = getIO();
    if (io) io.emit('printingStationaryUpdates', { action: 'detach', rowId });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
