const os = require('os');
const path = require('path');
const chokidar = require('chokidar');
const fs = require('fs');
const axios = require('axios');
const s3 = require('../config/s3');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const Invoice = require('../models/Invoice');
const { pushToRegister } = require('./syncManager');

const WATCH_DIR = path.join(__dirname, '../../Lorrey_Scans');
const PROCESSED_DIR = path.join(WATCH_DIR, 'Processed');

function safeGetIO() {
  try { const { getIO } = require("../socket"); return getIO(); }
  catch (_) { return null; }
}

function startWatcher() {
    if (!fs.existsSync(WATCH_DIR)) {
        fs.mkdirSync(WATCH_DIR, { recursive: true });
    }
    if (!fs.existsSync(PROCESSED_DIR)) {
        fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    }

    console.log(`[ScannerWatcher] Watching for new scans in: ${WATCH_DIR}`);

    const watcher = chokidar.watch(WATCH_DIR, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        depth: 0, 
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    });

    watcher.on('add', async (filePath) => {
        if (filePath.includes('Processed')) return;

        console.log(`[ScannerWatcher] Detected new file: ${filePath}`);
        const io = safeGetIO();
        
        try {
            if (io) io.emit('scanner_status', { message: 'Physical scan detected! Processing AI...' });

            const fileBuffer = fs.readFileSync(filePath);
            const fileName = path.basename(filePath);
            const mimeType = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
            
            const key = `upload-invoice/${Date.now()}_${fileName.replace(/\s+/g, '_')}`;
            const s3Url = `https://lorreyproject.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

            await s3.send(new PutObjectCommand({
                Bucket: "lorreyproject",
                Key: key,
                Body: fileBuffer,
                ContentType: mimeType
            }));

            console.log(`[ScannerWatcher] Uploaded to S3: ${s3Url}`);

            // AI Extraction
            const aiWorkerUrl = process.env.AI_WORKER_URL || "http://127.0.0.1:5000";
            const aiResponse = await axios.post(
                `${aiWorkerUrl}/process`,
                { file: s3Url },
                { timeout: 180000 }
            );

            const aiData = aiResponse.data;
            
            const consignee_name = aiData?.invoice_data?.consignee_details?.consignee_name || '';

            const invoice = new Invoice({
                file_url: s3Url,
                ai_data: aiData,
                consignee_name,
                status: "pending"
            });
            await invoice.save();
            await pushToRegister(invoice._id.toString());

            // Move file to processed
            const destPath = path.join(PROCESSED_DIR, fileName);
            fs.renameSync(filePath, destPath);

            console.log(`[ScannerWatcher] Processing complete. Emitting socket event.`);
            
            if (io) {
                io.emit('scanner_document_processed', {
                    file_url: s3Url,
                    ai_data: aiData,
                    invoice_id: invoice._id
                });
            }

        } catch (error) {
            console.error("[ScannerWatcher] Failed:", error.response?.data || error.message);
            if (io) io.emit('scanner_error', { error: "Failed to process the requested physical scan." });
        }
    });
}

module.exports = { startWatcher };
