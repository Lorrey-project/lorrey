const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017", { dbName: 'invoice_system' })
  .then(async () => {
    console.log("Connected");
    const dateStr = "2026-07-09";
    const start = new Date(dateStr);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const invoices = await Invoice.find({ created_at: { $gte: start, $lt: end } }).lean();
    console.log(`Found ${invoices.length} invoices on ${dateStr}`);
    if (invoices.length > 0) {
        console.log("Sample:", invoices[0].status, invoices[0].created_at);
        const stats = { pending: 0, approved: 0, failed: 0 };
        invoices.forEach(i => {
           if (i.status === 'pending') stats.pending++;
           else if (i.status === 'approved') stats.approved++;
           else stats.failed++;
        });
        console.log(stats);
    }
    process.exit(0);
  });
