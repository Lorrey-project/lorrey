const express = require("express");
const router = express.Router();
const axios = require("axios");
const upload = require("../middleware/upload");
const Invoice = require("../models/Invoice");
const TruckContact = require("../models/TruckContact");
const s3 = require("../config/s3");
const { HeadObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const lorryHireSlipUpload = require("../middleware/lorryHireSlipUpload");
const fuelSlipUpload = require("../middleware/fuelSlipUpload");
const { pushToRegister, removeFromRegister } = require("../utils/syncManager");

function makeSpaceAgnosticRegex(str) {
    const stripped = str.replace(/[^a-zA-Z0-9]/g, '');
    const regexStr = stripped.split('').join('[^a-zA-Z0-9]*');
    return new RegExp(`^[^a-zA-Z0-9]*${regexStr}[^a-zA-Z0-9]*$`, 'i');
}

// DOWNLOAD PROXY
router.get("/download-proxy", async (req, res) => {
    const { url, filename } = req.query;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
        console.log(`Proxy: downloading ${url} -> ${filename}`);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 30000
        });

        res.setHeader('Content-Type', response.headers['content-type'] || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename || 'download.pdf'}"`);

        response.data.pipe(res);
    } catch (err) {
        console.error("Proxy download failed:", err.message);
        res.status(500).json({ error: "Download failed: " + err.message });
    }
});

// Calculate required fuel based on truck number and destination pincode
// Logic: truck_no -> vehicle type (wheels) -> mileage | destination -> freight_data distance -> fuel = distance / mileage
router.get("/fuel-requirement/:truck_no/:destination", async (req, res) => {
    try {
        const { truck_no, destination } = req.params;
        const invoiceSystemDb = require("mongoose").connection.useDb("invoice_system");

        // Step 1: Fetch truck contact to get vehicle type (using raw collection for correct field names)
        const truckCol = invoiceSystemDb.db.collection("Truck Contact Number");
        const truckRegex = makeSpaceAgnosticRegex(truck_no);
        const truckRecord = await truckCol.findOne({
            $or: [
                { "Truck No": { $regex: truckRegex } },
                { truck_no: { $regex: truckRegex } },
                { "Contact No\.\(Truck No\.\)": { $regex: truckRegex } }
            ]
        });

        if (!truckRecord) {
            return res.json({ found: false, error: "Truck not found in database" });
        }

        // Step 2: Extract wheel count from vehicle type (e.g. "12-wh" -> 12, "10-wh" -> 10)
        let vehicleType = truckRecord["Type of vehicle"] || truckRecord.type || truckRecord["Vehicle Type"] || truckRecord.type_of_vehicle || truckRecord.vehicle_type || "";
        
        // Intelligent fallback to find wheel count from poorly named Excel columns
        if (!vehicleType) {
            for (let key in truckRecord) {
                const lowerKey = key.toLowerCase();
                if (lowerKey.includes("type") || lowerKey.includes("wheel") || lowerKey.includes("vehicle")) {
                    const val = truckRecord[key];
                    if (typeof val === "string" && val.match(/(\d+)/)) {
                        vehicleType = val;
                        break;
                    } else if (typeof val === "number") {
                        vehicleType = val.toString();
                        break;
                    }
                }
            }
        }
        
        const wheelMatch = vehicleType.match(/(\d+)/);
        const wheels = wheelMatch ? parseInt(wheelMatch[1]) : null;

        if (!wheels) {
            return res.json({ found: true, error: `Could not determine wheel count from vehicle type: "${vehicleType}"`, vehicle_type: vehicleType });
        }

        // Step 3: Fetch mileage from wheel_mileage collection
        const wheelMileageCol = invoiceSystemDb.db.collection("wheel_mileage");
        const mileageRecord = await wheelMileageCol.findOne({ wheels: wheels });

        if (!mileageRecord) {
            return res.json({ found: true, error: `No mileage data found for ${wheels}-wheeler`, vehicle_type: vehicleType, wheels });
        }

        const mileage = mileageRecord.mileage_kmpl;

        // Step 4: Fetch distance from freight_data using destination
        // Try progressively looser matches: exact substring → strip trailing -N → word-by-word
        const freightCol = invoiceSystemDb.db.collection("freight_data");
        let freightRecord = null;

        const destTrimmed = destination.trim();

        // Attempt 1: exact substring regex
        freightRecord = await freightCol.findOne({
            "DEST ZONE DESC": { $regex: new RegExp(destTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i") }
        });

        // Attempt 2: strip trailing dash-number (e.g. "Lalmatiya Colliery-8" → "Lalmatiya Colliery")
        if (!freightRecord) {
            const stripped = destTrimmed.replace(/-\d+$/, '').trim();
            if (stripped && stripped !== destTrimmed) {
                freightRecord = await freightCol.findOne({
                    "DEST ZONE DESC": { $regex: new RegExp(stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i") }
                });
            }
        }

        // Attempt 3: match on first significant word (e.g. "LHR" or "Lalmatiya")
        if (!freightRecord) {
            const words = destTrimmed.split(/[\s\-,]+/).filter(w => w.length >= 3);
            for (const word of words) {
                freightRecord = await freightCol.findOne({
                    "DEST ZONE DESC": { $regex: new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i") }
                });
                if (freightRecord) break;
            }
        }

        if (!freightRecord) {
            return res.json({
                found: true,
                error: `No freight data found for destination: ${destination}`,
                vehicle_type: vehicleType,
                wheels,
                mileage_kmpl: mileage
            });
        }

        const distance = freightRecord["Distance"];

        // Step 5: Calculate required fuel (round-trip: distance × 2)
        const required_fuel = parseFloat(((distance * 2) / mileage).toFixed(2));

        res.json({
            found: true,
            truck_no,
            vehicle_type: vehicleType,
            wheels,
            mileage_kmpl: mileage,
            destination,
            dest_zone_desc: freightRecord["DEST ZONE DESC"],
            distance_km: distance,
            required_fuel_litres: required_fuel,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lookup truck contact by truck number
router.get("/truck-contact/:truck_no", async (req, res) => {
    try {
        const { truck_no } = req.params;
        // Case-insensitive search, strip spaces and tolerate any internal spacing
        const truckRegex = makeSpaceAgnosticRegex(truck_no);
        const record = await TruckContact.findOne({
            $or: [
                { truck_no: { $regex: truckRegex } },
                { "Truck No": { $regex: truckRegex } },
                { "Contact No.(Truck No.)": { $regex: truckRegex } }
            ]
        }).lean();
        if (!record) return res.json({ found: false });
        res.json({
            found: true,
            contact: record.contact_no || record["Contact No."] || record["DRIVER CONTACT"] || record["Driver Contact"] || "",
            owner: record.owner_name || record["Owner Name"] || "",
            pan_no: record.pan_no || record["PAN No."] || "",
            aadhar_no: record.aadhar_no || record["Aadhar No."] || "",
            driver_name: record.driver_name || record["Driver Name"] || record["DRIVER NAME"] || "",
            license_no: record.license_no || record["License No."] || record["Driver License No."] || record["DRIVER LICENSE"] || record["License No"] || "",
            address: record.address || record["Address"] || "",
            // Include other fields just in case they are needed later
            type: record.type || "",
            gst_no: record.gst_no || "",
            rc_validity: record.rc_validity || "",
            insurance_validity: record.insurance_validity || "",
            fitness_validity: record.fitness_validity || "",
            road_tax_validity: record.road_tax_validity || "",
            permit: record.permit || "",
            puc: record.puc || "",
            np_validity: record.np_validity || "",
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/upload", upload.single("invoice"), async (req, res) => {

    try {
        console.log("/upload endpoint hit");
        if (!req.file) {
            console.error("No file received in request");
            return res.status(400).json({ error: "No file uploaded" });
        }
        const fileUrl = req.file.location;
        console.log("File URL:", fileUrl);

        // Call FastAPI pipeline for AI extraction
        let aiData = null;
        try {
            const aiWorkerUrl = process.env.AI_WORKER_URL || "http://127.0.0.1:8000";
            const aiResponse = await require("axios").post(
                `${aiWorkerUrl}/process`,
                { file: fileUrl },
                { timeout: 180000 }
            );
            aiData = aiResponse.data;
            console.log("AI extraction success");
        } catch (aiErr) {
            console.error("AI extraction failed:", aiErr.message);
            return res.status(500).json({ error: "AI extraction failed", details: aiErr.message });
        }

        // Save invoice with AI data
        const consignee_name =
            aiData?.invoice_data?.consignee_details?.consignee_name || '';

        const invoice = new Invoice({
            file_url: fileUrl,
            ai_data: aiData,
            consignee_name,
            status: "pending"
        });
        await invoice.save();
        console.log("Invoice saved with _id:", invoice._id);
        
        // Propagate to Cement Register
        await pushToRegister(invoice._id.toString());
        
        res.json({
            message: "Invoice uploaded and processed",
            file_url: fileUrl,
            invoice_id: invoice._id,
            ai_data: aiData
        });
    } catch (error) {
        console.error("Error in /upload:", error);
        res.status(500).json({ error: error.message });
    }

});

// ── Physical Scanner Trigger (Universal — HP, Epson, Canon, etc.) ─────────────────────────────
// Strategy 1: scanimage with auto-detected device (works for all SANE-supported scanners)
// Strategy 2: hp-scan (HPLIP — macOS HP driver fallback)
// Setup: brew install sane-backends  (covers HP, Epson, Canon, Brother, Fujitsu, etc.)
router.post("/scan-now", async (req, res) => {
    const { exec } = require("child_process");
    const os = require("os");
    const path = require("path");

    const scanOutputPath = path.join(os.tmpdir(), `lorrey_scan_${Date.now()}.jpg`);
    const SCANIMAGE  = "/opt/homebrew/bin/scanimage";
    const HP_SCAN    = "/opt/homebrew/bin/hp-scan";

    let io = null;
    try { const { getIO } = require("../socket"); io = getIO(); } catch(_) {}
    if (io) io.emit("scanner_status", { message: "🔍 Detecting connected scanner..." });

    // Respond immediately — result arrives via socket
    res.json({ message: "Scan triggered. Watch the form update automatically when done." });

    // ── Step 1: Auto-discover connected scanner device ──
    exec(`"${SCANIMAGE}" --list-devices 2>/dev/null`, { timeout: 15000 }, (listErr, stdout) => {
        let deviceFlag = "";

        if (!listErr && stdout) {
            // Parse first device from output, e.g.:
            // device `epson2:libusb:001:003' is a Epson ...
            // device `hpaio:/usb/...' is a HP ...
            const match = stdout.match(/device `([^']+)'/);
            if (match && match[1]) {
                deviceFlag = `--device-name="${match[1]}"`;
                // Detect brand for user-friendly status message
                const devId = match[1].toLowerCase();
                const brand = devId.includes('epson') ? 'Epson'
                    : devId.includes('hp') || devId.includes('hpaio') ? 'HP'
                    : devId.includes('canon') ? 'Canon'
                    : devId.includes('brother') ? 'Brother'
                    : devId.includes('fujitsu') ? 'Fujitsu'
                    : 'Scanner';
                console.log(`[Scan] Detected ${brand} device: ${match[1]}`);
                if (io) io.emit("scanner_status", { message: `🖨️ ${brand} scanner detected! Place document and wait...` });
            } else {
                console.warn("[Scan] scanimage listed no devices, will try without --device-name");
            }
        }

        // ── Strategy 1: scanimage (SANE — universal for all brands) ──
        const saneCmd = `"${SCANIMAGE}" ${deviceFlag} --format=jpeg --resolution=300 -x 210 -y 297 --output-file="${scanOutputPath}"`;
        exec(saneCmd, { timeout: 90000 }, async (err1) => {
            if (!err1) {
                console.log("[Scan] scanimage succeeded.");
                return processScanFile(scanOutputPath, io);
            }
            console.warn("[Scan] scanimage failed:", err1.message, "→ Trying hp-scan fallback...");
            if (io) io.emit("scanner_status", { message: "🔄 Trying HP driver fallback..." });

            // ── Strategy 2: hp-scan (HPLIP — HP-specific fallback) ──
            const hpScanCmd = `"${HP_SCAN}" --res=300 --mode=gray --output="${scanOutputPath}"`;
            exec(hpScanCmd, { timeout: 90000 }, async (err2) => {
                if (!err2) {
                    console.log("[Scan] hp-scan succeeded.");
                    return processScanFile(scanOutputPath, io);
                }
                console.error("[Scan] All drivers failed.", err2.message);
                const helpMsg = [
                    "❌ No scanner detected. Please check:",
                    "1. Scanner is ON and connected via USB or network.",
                    "2. Run: brew install sane-backends",
                    "3. For Epson: Also install Epson Scan 2 driver from epson.com",
                    "4. For Canon: Install Canon IJ Scan Utility from canon.com",
                ].join(" ");
                if (io) io.emit("scanner_error", { error: helpMsg });
            });
        });
    });
});


async function processScanFile(scanOutputPath, io) {
    const fs = require("fs");
    const path = require("path");
    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    try {
        if (!fs.existsSync(scanOutputPath)) {
            if (io) io.emit("scanner_error", { error: "Scan file not created by scanner driver." });
            return;
        }

        const fileBuffer = fs.readFileSync(scanOutputPath);
        const fileName = path.basename(scanOutputPath);
        const key = `upload-invoice/${Date.now()}_scan.jpg`;
        const s3Url = `https://lorreyproject.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

        await s3.send(new PutObjectCommand({
            Bucket: "lorreyproject",
            Key: key,
            Body: fileBuffer,
            ContentType: "image/jpeg"
        }));

        console.log("[Scan] Uploaded to S3:", s3Url);
        if (io) io.emit("scanner_status", { message: "📤 Scan uploaded. Running AI extraction..." });

        const aiWorkerUrl = process.env.AI_WORKER_URL || "http://127.0.0.1:8000";
        const aiResponse = await require("axios").post(
            `${aiWorkerUrl}/process`,
            { file: s3Url },
            { timeout: 90000 }
        );
        const aiData = aiResponse.data;

        const Invoice = require("../models/Invoice");
        const { pushToRegister } = require("../utils/syncManager");
        const consignee_name = aiData?.invoice_data?.consignee_details?.consignee_name || "";
        const invoice = new Invoice({ file_url: s3Url, ai_data: aiData, consignee_name, status: "pending" });
        await invoice.save();
        await pushToRegister(invoice._id.toString());

        fs.unlinkSync(scanOutputPath);

        console.log("[Scan] Complete! Emitting to frontend.");
        if (io) io.emit("scanner_document_processed", {
            file_url: s3Url,
            ai_data: aiData,
            invoice_id: invoice._id
        });
    } catch(e) {
        console.error("[Scan] processScanFile failed:", e.message);
        if (io) io.emit("scanner_error", { error: "AI extraction or save failed: " + e.message });
    }
}

router.post("/process-ai", async (req, res) => {

    const { invoice_id, ai_data } = req.body;

    await Invoice.findByIdAndUpdate(invoice_id, {
        ai_data: ai_data
    });

    res.json({ message: "AI data saved" });

});

router.get("/pending", async (req, res) => {
    const invoices = await Invoice.find({ status: "pending" });
    res.json(invoices);
});

router.get("/all", async (req, res) => {
    try {
        const invoices = await Invoice.find().sort({ created_at: -1 }).lean();

        // Parallel check for S3 existence using SDK v3
        const verifiedInvoices = await Promise.all(invoices.map(async (inv) => {
            if (inv.softcopy_url) {
                try {
                    const url = new URL(inv.softcopy_url);
                    const key = decodeURIComponent(url.pathname.substring(1));

                    await s3.send(new HeadObjectCommand({
                        Bucket: process.env.AWS_BUCKET_NAME || "lorreyproject",
                        Key: key
                    }));

                    return { ...inv, s3_exists: true };
                } catch (err) {
                    console.warn("S3 headObject failed for", inv._id, ":", err.name || err.message);
                    return { ...inv, s3_exists: false };
                }
            }
            return { ...inv, s3_exists: false };
        }));

        res.json(verifiedInvoices);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post("/approve", async (req, res) => {

    const { invoice_id, corrected_data } = req.body;

    // Extract consignee_name from the verified data for top-level storage
    const consignee_name =
        corrected_data?.consignee_details?.consignee_name || '';

    await Invoice.findByIdAndUpdate(invoice_id, {
        human_verified_data: corrected_data,
        consignee_name,
        status: "approved"
    });

    // Sync any corrected fields to cement register
    await pushToRegister(invoice_id);

    res.json({
        message: "Invoice approved and saved"
    });

});

// GET invoice data for Lorry Hire Slip review form
router.get("/lorry-data/:id", async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id).lean();
        if (!invoice) return res.status(404).json({ error: "Invoice not found" });
        res.json(invoice);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET recent verifications for a specific pump
router.get("/pump-verifications/:pumpName", async (req, res) => {
    try {
        const { pumpName } = req.params;
        // Search for invoices verified by this pump, sorted by most recent
        const verifications = await Invoice.find({
            "lorry_hire_slip_data.station_name": pumpName,
            is_hsd_verified: true
        })
        .sort({ hsd_verified_at: -1 })
        .limit(20)
        .lean();
        
        res.json(verifications);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET stats for a specific pump (Daily total, Pending count)
router.get("/pump-stats/:pumpName", async (req, res) => {
    try {
        const { pumpName } = req.params;
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // 1. Total Litres Verified Today
        const todayVerifications = await Invoice.find({
            "lorry_hire_slip_data.station_name": pumpName,
            is_hsd_verified: true,
            hsd_verified_at: { $gte: startOfDay }
        }).lean();

        const totalLitresToday = todayVerifications.reduce((sum, inv) => 
            sum + (Number(inv.lorry_hire_slip_data?.diesel_litres) || 0), 0
        );

        // 2. Count of Pending Verifications (Slips tagged for this pump but not yet verified)
        const pendingCount = await Invoice.countDocuments({
            "lorry_hire_slip_data.station_name": pumpName,
            is_hsd_verified: { $ne: true }
        });

        res.json({
            totalLitresToday: parseFloat(totalLitresToday.toFixed(2)),
            verifiedTodayCount: todayVerifications.length,
            pendingCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Verify HSD Slip / Fuel Slip code
router.get("/verify-fuel-slip/:code", async (req, res) => {
    try {
        const { code } = req.params;
        // Search for an invoice where the generated fuel_slip_no matches exactly
        const invoice = await Invoice.findOne({
            "lorry_hire_slip_data.fuel_slip_no": code.trim()
        }).lean();

        if (!invoice) {
            return res.json({ success: false, message: "Invalid or unfound verification code" });
        }

        // If already verified, return the data without modifying DB again
        if (invoice.is_hsd_verified) {
            let truck_no_alr = invoice.human_verified_data?.supply_details?.vehicle_number
                || invoice.ai_data?.invoice_data?.supply_details?.vehicle_number
                || invoice.lorry_hire_slip_data?.truck_no
                || "Unknown Vehicle";
            return res.json({
                success: true,
                already_verified: true,
                verified_at: invoice.hsd_verified_at,
                data: {
                    invoice_id: invoice._id,
                    truck_no: truck_no_alr,
                    driver_name: invoice.gcn_data?.driver_name || "Not Available",
                    truck_owner: invoice.gcn_data?.agent_name || "Not Available",
                    diesel_litres: invoice.lorry_hire_slip_data?.diesel_litres || 0,
                    diesel_rate: invoice.lorry_hire_slip_data?.diesel_rate || 0,
                    diesel_advance: invoice.lorry_hire_slip_data?.diesel_advance || 0
                }
            });
        }

        // Mark it as verified in DB
        await Invoice.findByIdAndUpdate(invoice._id, { 
            is_hsd_verified: true,
            hsd_verified_at: new Date()
        });

        const { pushToRegister } = require("../utils/syncManager");
        // Pass override so syncManager uses is_hsd_verified:true immediately
        // (avoids race condition between findByIdAndUpdate and the fresh findById inside pushToRegister)
        await pushToRegister(invoice._id, { is_hsd_verified: true });

        // Extract required fields
        // Extract required fields - checking all common invoice patterns
        let truck_no = invoice.human_verified_data?.supply_details?.vehicle_number 
            || invoice.ai_data?.invoice_data?.supply_details?.vehicle_number
            || invoice.human_verified_data?.invoice_details?.truck_no 
            || invoice.ai_data?.invoice_data?.invoice_details?.truck_no 
            || invoice.lorry_hire_slip_data?.truck_no
            || "Unknown Vehicle";

        const diesel_litres = invoice.lorry_hire_slip_data?.diesel_litres || 0;
        const diesel_rate = invoice.lorry_hire_slip_data?.diesel_rate || 0;
        const diesel_advance = invoice.lorry_hire_slip_data?.diesel_advance || 0;

        // Prioritize data already entered on the Lorry Hire Slip / GCN forms
        let driver_name = invoice.gcn_data?.driver_name 
            || invoice.human_verified_data?.supply_details?.driver_name 
            || "Not Available";
            
        let truck_owner = invoice.gcn_data?.agent_name 
            || invoice.human_verified_data?.supply_details?.transporter_name 
            || "Not Available";

        const TruckContact = require("../models/TruckContact");
        
        if (truck_no !== "Unknown Vehicle" && (driver_name === "Not Available" || truck_owner === "Not Available")) {
            const strippedTruckNo = truck_no.replace(/[^a-zA-Z0-9]/g, ''); // "WB39A1234"
            // We'll try to find a TruckContact where "Truck No" (or "truck_no") stripped of non-alphanumerics equals strippedTruckNo
            // Use the globally defined helper
            const regexSearchStr = makeSpaceAgnosticRegex(truck_no);
            const contact = await TruckContact.findOne({
                $or: [
                    { "Truck No": { $regex: regexSearchStr } },
                    { truck_no: { $regex: regexSearchStr } }
                ]
            }).lean();

            if (contact) {
                if (driver_name === "Not Available") driver_name = contact.driver_name || contact["Driver Name"] || "Not Available";
                if (truck_owner === "Not Available") truck_owner = contact.owner_name || contact["Owner Name"] || "Not Available";
            } else {
                // Try a broader search where we fetch all and filter in JS if needed (fallback)
                const allContacts = await TruckContact.find({}, { "Truck No": 1, truck_no: 1, driver_name: 1, "Driver Name": 1, owner_name: 1, "Owner Name": 1 }).lean();
                for (const c of allContacts) {
                    const cTruck1 = String(c["Truck No"] || "").replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    const cTruck2 = String(c.truck_no || "").replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    const targetStr = strippedTruckNo.toLowerCase();
                    if (cTruck1 === targetStr || cTruck2 === targetStr) {
                        if (driver_name === "Not Available") driver_name = c.driver_name || c["Driver Name"] || "Not Available";
                        if (truck_owner === "Not Available") truck_owner = c.owner_name || c["Owner Name"] || "Not Available";
                        break;
                    }
                }
            }
        }

        res.json({
            success: true,
            data: {
                invoice_id: invoice._id,
                truck_no,
                driver_name,
                truck_owner,
                diesel_litres,
                diesel_rate,
                diesel_advance
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST — save Lorry Hire Slip PDF to S3 + persist slip data to MongoDB
router.post("/lorry-hire-slip-softcopy", lorryHireSlipUpload.single("softcopy"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { invoice_id, slip_data } = req.body;
    let parsedSlipData = {};
    try { parsedSlipData = JSON.parse(slip_data); } catch (_) { /* ignore */ }

    const updatePayload = {
        "lorry_hire_slip_data.lorry_hire_slip_no": parsedSlipData.lorry_hire_slip_no,
        "lorry_hire_slip_data.fuel_slip_no": parsedSlipData.fuel_slip_no,
        "lorry_hire_slip_data.loading_advance": Number(parsedSlipData.loading_advance) || 0,
        "lorry_hire_slip_data.diesel_litres": Number(parsedSlipData.diesel_litres) || 0,
        "lorry_hire_slip_data.diesel_rate": Number(parsedSlipData.diesel_rate) || 0,
        "lorry_hire_slip_data.diesel_advance": Number(parsedSlipData.diesel_advance) || 0,
        "lorry_hire_slip_data.total_advance": Number(parsedSlipData.total_advance) || 0,
        "lorry_hire_slip_data.estimated_required_fuel": parsedSlipData.estimated_required_fuel != null
            ? Number(parsedSlipData.estimated_required_fuel)
            : undefined,
        "lorry_hire_slip_data.lorry_hire_slip_url": req.file.location,
        "lorry_hire_slip_data.created_at": new Date(),
    };

    if (invoice_id) {
        await Invoice.findByIdAndUpdate(invoice_id, { $set: updatePayload });
        await pushToRegister(invoice_id);
    }

    res.json({ message: "Lorry Hire Slip saved successfully", url: req.file.location });
});

// POST — save Fuel Slip PDF to S3 + persist data to MongoDB
router.post("/fuel-slip-softcopy", fuelSlipUpload.single("softcopy"), async (req, res) => {
    console.log(">>> Fuel Slip Upload Hit");
    if (!req.file) {
        console.error(">>> No file uploaded in Fuel Slip request");
        return res.status(400).json({ error: "No file uploaded" });
    }

    const { invoice_id, slip_data } = req.body;
    console.log(">>> Received invoice_id:", invoice_id);
    console.log(">>> Received slip_data:", slip_data);

    let parsedSlipData = {};
    if (slip_data && slip_data !== "undefined") {
        try {
            parsedSlipData = JSON.parse(slip_data);
        } catch (e) {
            console.error(">>> Failed to parse slip_data:", e.message);
        }
    } else {
        console.warn(">>> Fuel slip uploaded without slip_data details");
    }

    const updatePayload = {
        "lorry_hire_slip_data.station_name": parsedSlipData.station_name,
        "lorry_hire_slip_data.station_address": parsedSlipData.station_address,
        "lorry_hire_slip_data.diesel_litres": Number(parsedSlipData.diesel_litres) || 0,
        "lorry_hire_slip_data.diesel_rate": Number(parsedSlipData.diesel_rate) || 0,
        "lorry_hire_slip_data.diesel_advance": Number(parsedSlipData.diesel_advance) || 0,
        "lorry_hire_slip_data.fuel_slip_url": req.file.location,
    };

    if (invoice_id) {
        try {
            const updated = await Invoice.findByIdAndUpdate(
                invoice_id,
                { $set: updatePayload },
                { returnDocument: 'after' }
            );
            if (updated) {
                console.log(">>> DB Update Success for invoice:", invoice_id);
                await pushToRegister(invoice_id);
            } else {
                console.error(">>> DB Update Failed: Document not found for ID:", invoice_id);
            }
        } catch (dbErr) {
            console.error(">>> DB Update Error:", dbErr.message);
        }
    } else {
        console.error(">>> No invoice_id provided in request body");
    }

    res.json({ message: "Fuel Slip saved successfully", url: req.file.location });
});

// DELETE invoice by ID (also removes S3 files if present)
router.delete("/:id", async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error: "Invoice not found" });

        // Helper to delete an S3 key from a URL
        const deleteS3File = async (url) => {
            if (!url) return;
            try {
                const urlObj = new URL(url);
                const key = decodeURIComponent(urlObj.pathname.slice(1));
                await s3.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME || "lorreyproject",
                    Key: key,
                }));
            } catch (e) {
                console.warn("S3 delete skipped:", e.message);
            }
        };

        await deleteS3File(invoice.softcopy_url);
        await deleteS3File(invoice.gcn_url);
        await Invoice.findByIdAndDelete(req.params.id);

        // Remove from cement register + broadcast in real-time
        await removeFromRegister(req.params.id);

        res.json({ message: "Invoice deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// BULK DELETE
router.post("/bulk-delete", async (req, res) => {
    try {
        const { ids } = req.body; // array of invoice _ids
        if (!ids || !ids.length) return res.status(400).json({ error: "No IDs provided" });

        const invoices = await Invoice.find({ _id: { $in: ids } }).lean();

        const deleteS3File = async (url) => {
            if (!url) return;
            try {
                const urlObj = new URL(url);
                const key = decodeURIComponent(urlObj.pathname.slice(1));
                await s3.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME || "lorreyproject",
                    Key: key,
                }));
            } catch (e) {
                console.warn("S3 bulk-delete skipped:", e.message);
            }
        };

        await Promise.all(invoices.flatMap(inv => [
            deleteS3File(inv.softcopy_url),
            deleteS3File(inv.gcn_url),
        ]));

        await Invoice.deleteMany({ _id: { $in: ids } });

        // Remove all corresponding cement register entries + broadcast
        await Promise.all(invoices.map(inv => removeFromRegister(inv._id.toString())));

        res.json({ message: `${invoices.length} invoices deleted` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DOWNLOAD PROXY (bypass CORS for S3)
router.get("/download-proxy", async (req, res) => {
    const { url, filename } = req.query;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
        console.log(`Proxy: downloading ${url} -> ${filename}`);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 30000
        });

        res.setHeader('Content-Type', response.headers['content-type'] || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename || 'download.pdf'}"`);

        response.data.pipe(res);
    } catch (err) {
        console.error("Proxy download failed:", err.message);
        res.status(500).json({ error: "Download failed: " + err.message });
    }
});

module.exports = router;