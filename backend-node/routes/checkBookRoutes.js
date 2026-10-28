const express = require('express');
const router = express.Router();
const CheckBook = require('../models/CheckBook');
const checkBookUpload = require('../middleware/checkBookUpload');
const { getIO } = require('../socket');

// ── GET /check-book ──────────────────────────────────────────────────────────
// Fetch all saved check book entries
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.$or = [
        { checkNumber: { $regex: q, $options: 'i' } },
        { checkDate: { $regex: q, $options: 'i' } },
        { receivingDate: { $regex: q, $options: 'i' } },
        { remarks: { $regex: q, $options: 'i' } },
        { documentName: { $regex: q, $options: 'i' } }
      ];
    }

    const checks = await CheckBook.find(filter).sort({ createdAt: -1 });
    const totalAmount = checks.reduce((sum, c) => sum + (Number(c.checkAmount) || 0), 0);

    res.json({
      success: true,
      count: checks.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      checks
    });
  } catch (error) {
    console.error('[CheckBook] GET error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const { getCheckBookBalance } = require('../utils/checkBookHelper');

// ── GET /check-book/balance ──────────────────────────────────────────────────
// Returns dynamic balance of available vs used checks and alert thresholds
router.get('/balance', async (req, res) => {
  try {
    const balance = await getCheckBookBalance();
    res.json({
      success: true,
      ...balance
    });
  } catch (error) {
    console.error('[CheckBook] GET /balance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /check-book/check-exists/:checkNumber ─────────────────────────────────
// Verify whether a check number is already taken
router.get('/check-exists/:checkNumber', async (req, res) => {
  try {
    const checkNumber = String(req.params.checkNumber || '').trim();
    if (!checkNumber) {
      return res.json({ success: true, exists: false });
    }
    const found = await CheckBook.findOne({ checkNumber });
    res.json({
      success: true,
      exists: Boolean(found),
      check: found ? { _id: found._id, checkNumber: found.checkNumber, checkAmount: found.checkAmount, checkDate: found.checkDate, receivingDate: found.receivingDate } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /check-book/by-number/:checkNumber ────────────────────────────────────
// Search and return saved checks matching a check number
router.get('/by-number/:checkNumber', async (req, res) => {
  try {
    const rawNo = String(req.params.checkNumber || '').trim();
    if (!rawNo) {
      return res.json({ success: true, count: 0, checks: [] });
    }
    const escaped = rawNo.replace(/[^a-zA-Z0-9]/g, '\\$&');
    const searchRegex = new RegExp(`^0*${escaped}$`, 'i');

    const checks = await CheckBook.find({
      $or: [
        { checkNumber: rawNo },
        { checkNumber: { $regex: searchRegex } }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: checks.length,
      checks
    });
  } catch (error) {
    console.error('[CheckBook] by-number error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /check-book/bulk ────────────────────────────────────────────────────
// Save multiple checks together in a single operation
router.post('/bulk', (req, res, next) => {
  checkBookUpload.any()(req, res, (err) => {
    if (err) {
      console.error('[CheckBook] Multer upload error:', err);
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    let checks = [];
    if (typeof req.body.checks === 'string') {
      try {
        checks = JSON.parse(req.body.checks);
      } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid checks JSON payload.' });
      }
    } else if (Array.isArray(req.body.checks)) {
      checks = req.body.checks;
    } else if (typeof req.body.metadata === 'string') {
      try {
        checks = JSON.parse(req.body.metadata);
      } catch (e) {
        return res.status(400).json({ success: false, error: 'Invalid metadata JSON payload.' });
      }
    } else if (Array.isArray(req.body.metadata)) {
      checks = req.body.metadata;
    }

    if (!Array.isArray(checks) || checks.length === 0) {
      return res.status(400).json({ success: false, error: 'No check records provided to save.' });
    }

    const uploadedFiles = req.files || [];

    // 1. Validate every row
    const seenNumbers = new Set();
    const numbersToValidate = [];

    for (let i = 0; i < checks.length; i++) {
      const item = checks[i];
      const rowNum = i + 1;

      // Check Date validation (required)
      const checkDate = String(item.checkDate !== undefined && item.checkDate !== null ? item.checkDate : '').trim();
      if (!checkDate) {
        return res.status(400).json({ success: false, error: `Row ${rowNum}: Check Date is required.` });
      }

      // Check Number validation (must be string, preserve leading zeros)
      const checkNo = String(item.checkNumber !== undefined && item.checkNumber !== null ? item.checkNumber : '').trim();
      if (!checkNo) {
        return res.status(400).json({ success: false, error: `Row ${rowNum}: Check Number is required.` });
      }

      // Check Amount validation (must be positive number)
      const rawAmt = item.checkAmount;
      const parsedAmt = typeof rawAmt === 'number' ? rawAmt : parseFloat(String(rawAmt || '').replace(/,/g, ''));
      if (isNaN(parsedAmt) || parsedAmt <= 0) {
        return res.status(400).json({
          success: false,
          error: `Row ${rowNum} (Check #${checkNo}): Valid positive Check Amount is required.`
        });
      }

      // Receiving Date (optional on initial creation)
      const receivingDate = String(item.receivingDate !== undefined && item.receivingDate !== null ? item.receivingDate : '').trim();

      // File attachment validation
      const file = uploadedFiles.find(
        f => f.fieldname === item.fileField ||
             f.fieldname === `file_${i}` ||
             f.fieldname === `document_${i}` ||
             f.fieldname === `file_${item.fileIndex}`
      ) || uploadedFiles[item.fileIndex] || uploadedFiles[i];

      if (!file) {
        return res.status(400).json({
          success: false,
          error: `Row ${rowNum} (Check #${checkNo}): Uploaded Check File (JPEG/PNG/PDF) is required.`
        });
      }

      // Check for duplicate in current batch
      if (seenNumbers.has(checkNo)) {
        return res.status(400).json({
          success: false,
          error: `Check number "${checkNo}" is duplicated in your entry.`
        });
      }
      seenNumbers.add(checkNo);
      numbersToValidate.push(checkNo);
    }

    // 2. Check for duplicate check numbers in database
    const existingInDb = await CheckBook.find({ checkNumber: { $in: numbersToValidate } });
    if (existingInDb.length > 0) {
      const dupeNumbers = existingInDb.map(c => c.checkNumber).join(', ');
      return res.status(400).json({
        success: false,
        error: `Check number already exists: ${dupeNumbers}`
      });
    }

    // 3. Prepare docs and insert all in one operation
    const docsToInsert = checks.map((item, i) => {
      const checkNo = String(item.checkNumber).trim();
      const rawAmt = item.checkAmount;
      const parsedAmt = typeof rawAmt === 'number' ? rawAmt : parseFloat(String(rawAmt || '').replace(/,/g, ''));

      const file = uploadedFiles.find(
        f => f.fieldname === item.fileField ||
             f.fieldname === `file_${i}` ||
             f.fieldname === `document_${i}` ||
             f.fieldname === `file_${item.fileIndex}`
      ) || uploadedFiles[item.fileIndex] || uploadedFiles[i];

      const docUrl = file.location || (file.filename ? `/uploads/check_books/${file.filename}` : '');
      const docType = file.mimetype || '';
      const docName = file.originalname || `check_${checkNo}`;

      return {
        checkDate: String(item.checkDate || '').trim(),
        checkNumber: checkNo,
        checkAmount: Math.round(parsedAmt * 100) / 100,
        receivingDate: String(item.receivingDate || '').trim(),
        documentUrl: docUrl,
        documentType: docType,
        documentName: docName,
        remarks: (item.remarks || '').trim()
      };
    });

    const savedRecords = await CheckBook.insertMany(docsToInsert);

    // Emit live update
    try {
      const io = getIO();
      if (io) {
        io.emit('checkBookUpdated', { action: 'bulkCreate', count: savedRecords.length });
      }
    } catch (_) {}

    res.status(201).json({
      success: true,
      message: `Successfully saved ${savedRecords.length} check(s).`,
      count: savedRecords.length,
      checks: savedRecords
    });
  } catch (error) {
    console.error('[CheckBook] POST /bulk error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Check number already exists.' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /check-book/:id ──────────────────────────────────────────────────────
// Fetch a single check book record by ID
router.get('/:id', async (req, res) => {
  try {
    const check = await CheckBook.findById(req.params.id);
    if (!check) {
      return res.status(404).json({ success: false, error: 'Check record not found.' });
    }
    res.json({ success: true, check });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── PUT /check-book/:id ──────────────────────────────────────────────────────
// Update an existing check (with optional document replacement)
router.put('/:id', (req, res, next) => {
  checkBookUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { id } = req.params;
    const { checkNumber, checkAmount, checkDate, receivingDate, remarks } = req.body;

    const existingDoc = await CheckBook.findById(id);
    if (!existingDoc) {
      return res.status(404).json({ success: false, error: 'Check record not found.' });
    }

    const updateFields = {};

    if (checkNumber !== undefined) {
      const cleanNo = String(checkNumber).trim();
      if (!cleanNo) {
        return res.status(400).json({ success: false, error: 'Check Number cannot be empty.' });
      }

      // Check if duplicate check number exists in another record
      const dupe = await CheckBook.findOne({
        checkNumber: cleanNo,
        _id: { $ne: id }
      });
      if (dupe) {
        return res.status(400).json({
          success: false,
          error: `Check number already exists: ${cleanNo}`
        });
      }
      updateFields.checkNumber = cleanNo;
    }

    if (checkAmount !== undefined) {
      const parsedAmt = typeof checkAmount === 'number' ? checkAmount : parseFloat(String(checkAmount).replace(/,/g, ''));
      if (isNaN(parsedAmt) || parsedAmt <= 0) {
        return res.status(400).json({ success: false, error: 'Check Amount must be a positive number.' });
      }
      updateFields.checkAmount = Math.round(parsedAmt * 100) / 100;
    }

    if (checkDate !== undefined) {
      const cleanDate = String(checkDate).trim();
      if (!cleanDate) {
        return res.status(400).json({ success: false, error: 'Check Date cannot be empty.' });
      }
      updateFields.checkDate = cleanDate;
    }

    if (receivingDate !== undefined) {
      const cleanRecDate = String(receivingDate).trim();
      if (!cleanRecDate) {
        return res.status(400).json({ success: false, error: 'Receiving Date cannot be empty.' });
      }
      updateFields.receivingDate = cleanRecDate;
    }

    if (remarks !== undefined) {
      updateFields.remarks = String(remarks).trim();
    }

    if (req.file) {
      const docUrl = req.file.location || (req.file.filename ? `/uploads/check_books/${req.file.filename}` : '');
      updateFields.documentUrl = docUrl;
      updateFields.documentType = req.file.mimetype || '';
      updateFields.documentName = req.file.originalname || `check_${updateFields.checkNumber || existingDoc.checkNumber}`;
    }

    const updated = await CheckBook.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    // Emit live update
    try {
      const io = getIO();
      if (io) {
        io.emit('checkBookUpdated', { action: 'update', checkId: id });
      }
    } catch (_) {}

    res.json({
      success: true,
      message: 'Check record updated successfully.',
      check: updated
    });
  } catch (error) {
    console.error('[CheckBook] PUT error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Check number already exists.' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── PATCH /check-book/:id/confirm-receive ────────────────────────────────────
// Confirm and permanently save receivingDate from Bank Book check selection
router.patch('/:id/confirm-receive', async (req, res) => {
  try {
    const { id } = req.params;
    const { receivingDate, bankBookRowId } = req.body;

    const cleanDate = String(receivingDate || '').trim();
    if (!cleanDate) {
      return res.status(400).json({ success: false, error: 'Receiving Date is required to confirm check.' });
    }

    const updateFields = {
      receivingDate: cleanDate,
    };
    if (bankBookRowId) {
      updateFields.bankBookRowId = String(bankBookRowId).trim();
    }

    const updated = await CheckBook.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Check record not found.' });
    }

    try {
      const io = getIO();
      if (io) {
        io.emit('checkBookUpdated', { action: 'confirmReceive', checkId: id });
      }
    } catch (_) {}

    res.json({
      success: true,
      message: `Check #${updated.checkNumber} receiving date confirmed successfully.`,
      check: updated
    });
  } catch (error) {
    console.error('[CheckBook] PATCH confirm-receive error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── DELETE /check-book/:id ───────────────────────────────────────────────────
// Delete a check record permanently
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await CheckBook.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Check record not found.' });
    }

    // Emit live update
    try {
      const io = getIO();
      if (io) {
        io.emit('checkBookUpdated', { action: 'delete', checkId: id });
      }
    } catch (_) {}

    res.json({
      success: true,
      message: `Check #${deleted.checkNumber} deleted successfully.`,
      checkId: id
    });
  } catch (error) {
    console.error('[CheckBook] DELETE error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
