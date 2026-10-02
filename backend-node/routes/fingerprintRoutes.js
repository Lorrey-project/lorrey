const express = require("express");
const router = express.Router();
const FingerprintEnrollment = require("../models/FingerprintEnrollment");
const FingerprintDevice = require("../models/FingerprintDevice");
const FingerprintAuditLog = require("../models/FingerprintAuditLog");
const User = require("../models/User");
const TruckContact = require("../models/TruckContact");
const FingerprintService = require("../services/fingerprintService");
const auth = require("../middleware/authMiddleware");

// ── 1. GET /fingerprint/stats — Overview Statistics ──────────────────────────
router.get("/stats", auth, async (req, res) => {
    try {
        const [driversCount, officeCount, siteCount, devCount, activeDevices, auditCountToday] = await Promise.all([
            FingerprintEnrollment.distinct("subjectId", { subjectType: "DRIVER", status: "ACTIVE" }),
            FingerprintEnrollment.distinct("subjectId", { subjectType: "OFFICE_MEMBER", status: "ACTIVE" }),
            FingerprintEnrollment.distinct("subjectId", { subjectType: "SITE_MEMBER", status: "ACTIVE" }),
            FingerprintEnrollment.distinct("subjectId", { subjectType: "DEVELOPER", status: "ACTIVE" }),
            FingerprintDevice.countDocuments({ status: "ONLINE" }),
            FingerprintAuditLog.countDocuments({
                timestamp: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            })
        ]);

        res.json({
            success: true,
            stats: {
                totalDrivers: driversCount.length,
                totalOfficeMembers: officeCount.length,
                totalSiteMembers: siteCount.length,
                totalDevelopers: devCount.length,
                activeDevices,
                todayAuditEvents: auditCountToday
            }
        });
    } catch (err) {
        console.error("Error in /fingerprint/stats:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 2. GET /fingerprint/enrolled — Search & Filter Enrolled Identities ───────
router.get("/enrolled", auth, async (req, res) => {
    try {
        const {
            subjectType,
            status,
            search = "",
            driverType,
            page = 0,
            limit = 50
        } = req.query;

        const query = {};
        if (subjectType && subjectType !== "ALL") {
            query.subjectType = subjectType;
        }
        if (status && status !== "ALL") {
            query.status = status;
        }
        if (driverType && driverType !== "ALL") {
            query.driverType = driverType;
        }

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), "i");
            query.$or = [
                { subjectName: regex },
                { subjectId: regex },
                { mobile: regex },
                { licenseNo: regex },
                { assignedVehicle: regex }
            ];
        }

        const skip = parseInt(page) * parseInt(limit);
        const [records, total] = await Promise.all([
            FingerprintEnrollment.find(query)
                .sort({ updatedAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            FingerprintEnrollment.countDocuments(query)
        ]);

        res.json({
            success: true,
            records,
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (err) {
        console.error("Error in /fingerprint/enrolled:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 3. GET /fingerprint/candidates — Existing Staff/Drivers to Enroll ────────
router.get("/candidates", auth, async (req, res) => {
    try {
        const { type } = req.query; // 'DRIVER' | 'OFFICE_MEMBER' | 'SITE_MEMBER' | 'DEVELOPER'

        let candidates = [];

        if (type === "OFFICE_MEMBER" || type === "SITE_MEMBER") {
            const roleFilter = type === "OFFICE_MEMBER" ? ["OFFICE", "HEAD_OFFICE", "BRINDA SHYAM", "JEET PANJA"] : ["SITE"];
            const users = await User.find({ role: { $in: roleFilter } }).select("name email role _id").lean();
            
            // Check existing enrollments
            const enrolledUserIds = await FingerprintEnrollment.find({
                subjectType: type,
                status: "ACTIVE"
            }).distinct("userId");

            candidates = users.map(u => ({
                id: u._id,
                name: u.name || u.email.split("@")[0],
                email: u.email,
                role: u.role,
                isEnrolled: enrolledUserIds.some(id => id && id.toString() === u._id.toString())
            }));

        } else if (type === "DEVELOPER") {
            // Preset list of active Developer identities
            candidates = [
                { id: "DEV-000001", name: "Developer 1 (Lead Systems)", email: "dev1@lorrey.internal", role: "DEVELOPER" },
                { id: "DEV-000002", name: "Developer 2 (Backend Core)", email: "dev2@lorrey.internal", role: "DEVELOPER" },
                { id: "DEV-000003", name: "Developer 3 (Biometrics & SDK)", email: "dev3@lorrey.internal", role: "DEVELOPER" },
                { id: "DEV-000004", name: "Developer 4 (QA / Security)", email: "dev4@lorrey.internal", role: "DEVELOPER" }
            ];
            const enrolledDevs = await FingerprintEnrollment.find({
                subjectType: "DEVELOPER",
                status: "ACTIVE"
            }).distinct("subjectId");

            candidates = candidates.map(c => ({
                ...c,
                isEnrolled: enrolledDevs.includes(c.id)
            }));

        } else if (type === "DRIVER") {
            // Fetch known drivers from TruckContact collection
            const contacts = await TruckContact.find()
                .select("driver_name license_no truck_no contact_no")
                .limit(100)
                .lean();

            const enrolledDrivers = await FingerprintEnrollment.find({
                subjectType: "DRIVER",
                status: "ACTIVE"
            }).distinct("subjectName");

            const enrolledNamesSet = new Set(enrolledDrivers.map(n => n.toLowerCase().trim()));

            candidates = contacts
                .filter(c => c.driver_name && c.driver_name.trim())
                .map(c => ({
                    id: c._id,
                    name: c.driver_name.trim(),
                    licenseNo: c.license_no || "",
                    assignedVehicle: c.truck_no || "",
                    mobile: c.contact_no || "",
                    isEnrolled: enrolledNamesSet.has(c.driver_name.toLowerCase().trim())
                }));
        }

        res.json({ success: true, candidates });
    } catch (err) {
        console.error("Error in /fingerprint/candidates:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 4. POST /fingerprint/enroll — Central Enrollment Route ───────────────────
router.post("/enroll", auth, async (req, res) => {
    try {
        const {
            subjectId,
            subjectType,
            subjectName,
            userId,
            driverType,
            mobile,
            licenseNo,
            assignedVehicle,
            fingerPosition = "RIGHT_THUMB",
            rawTemplate,
            qualityScore = 88,
            deviceId = "USB-SCANNER-01",
            metadata = {}
        } = req.body;

        if (!subjectType || !subjectName) {
            return res.status(400).json({ success: false, error: "subjectType and subjectName are required." });
        }

        // Panel origin
        const enrolledPanel = req.user?.role === "SITE" ? "SITE" : "OFFICE";
        const enrolledBy = req.user?.name || req.user?.email || "Admin";
        const enrolledByRole = req.user?.role || "OFFICE";

        // Call service
        const result = await FingerprintService.enroll({
            subjectId,
            subjectType,
            subjectName,
            userId,
            driverType: subjectType === "DRIVER" ? (driverType || "PERMANENT") : null,
            mobile: mobile || "",
            licenseNo: licenseNo || "",
            assignedVehicle: assignedVehicle || "",
            fingerPosition,
            rawTemplate: rawTemplate || `TEMPLATE_SIG_${crypto.randomBytes(32).toString("hex")}`,
            qualityScore: Number(qualityScore) || 88,
            deviceId,
            enrolledBy,
            enrolledByRole,
            enrolledPanel,
            metadata
        });

        res.status(201).json({
            success: true,
            message: result.isReEnrollment ? "Fingerprint re-enrolled successfully." : "Fingerprint identity enrolled successfully.",
            data: result
        });

    } catch (err) {
        console.error("Error in /fingerprint/enroll:", err);
        res.status(400).json({ success: false, error: err.message });
    }
});

// ── 5. POST /fingerprint/temporary-driver — Fast Temp Driver Enrollment ───────
router.post("/temporary-driver", auth, async (req, res) => {
    try {
        const {
            driverName,
            mobile = "",
            licenseNo = "",
            assignedVehicle = "",
            rawTemplate,
            qualityScore = 85,
            deviceId = "USB-SCANNER-01",
            transactionId = null
        } = req.body;

        if (!driverName || !driverName.trim()) {
            return res.status(400).json({ success: false, error: "Temporary driver name is required." });
        }

        const enrolledPanel = req.user?.role === "SITE" ? "SITE" : "OFFICE";
        const enrolledBy = req.user?.name || req.user?.email || "Site User";
        const enrolledByRole = req.user?.role || "SITE";

        const result = await FingerprintService.createTemporaryDriver({
            driverName: driverName.trim(),
            mobile,
            licenseNo,
            assignedVehicle,
            rawTemplate: rawTemplate || `TEMP_DRIVER_SIG_${crypto.randomBytes(32).toString("hex")}`,
            qualityScore: Number(qualityScore) || 85,
            deviceId,
            enrolledBy,
            enrolledByRole,
            enrolledPanel,
            transactionId
        });

        res.status(201).json({
            success: true,
            message: "Temporary driver registered and enrolled successfully.",
            data: result
        });

    } catch (err) {
        console.error("Error in /fingerprint/temporary-driver:", err);
        res.status(400).json({ success: false, error: err.message });
    }
});

// ── 6. POST /fingerprint/verify-identity — Match Candidate Scan ──────────────
router.post("/verify-identity", auth, async (req, res) => {
    try {
        const {
            candidateTemplate,
            subjectId,
            subjectType,
            allowedSubjectTypes,
            deviceId = "DEFAULT_SCANNER",
            transactionId = null
        } = req.body;

        if (!candidateTemplate) {
            return res.status(400).json({ success: false, error: "Candidate biometric scan is required." });
        }

        const panel = req.user?.role === "SITE" ? "SITE" : "OFFICE";
        const performedBy = req.user?.name || req.user?.email || "User";

        const result = await FingerprintService.matchCandidate({
            candidateTemplate,
            subjectId,
            subjectType,
            allowedSubjectTypes,
            deviceId,
            performedBy,
            panel,
            transactionId
        });

        if (!result.matched) {
            return res.status(400).json({ success: false, error: result.reason || "Fingerprint verification failed." });
        }

        res.json({
            success: true,
            verified: true,
            data: result
        });

    } catch (err) {
        console.error("Error in /fingerprint/verify-identity:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 7. PUT /fingerprint/status/:id — Toggle Active/Disabled ──────────────────
router.put("/status/:id", auth, async (req, res) => {
    try {
        const { status } = req.body;
        if (!["ACTIVE", "DISABLED"].includes(status)) {
            return res.status(400).json({ success: false, error: "Invalid status value." });
        }

        const enrollment = await FingerprintEnrollment.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        if (!enrollment) {
            return res.status(404).json({ success: false, error: "Enrollment record not found." });
        }

        await FingerprintService.recordAudit({
            action: status === "ACTIVE" ? "TEMPLATE_ENABLE" : "TEMPLATE_DISABLE",
            subjectId: enrollment.subjectId,
            subjectType: enrollment.subjectType,
            subjectName: enrollment.subjectName,
            panel: req.user?.role === "SITE" ? "SITE" : "OFFICE",
            performedBy: req.user?.name || req.user?.email || "Admin",
            userRole: req.user?.role || "ADMIN",
            details: { newStatus: status }
        });

        res.json({ success: true, enrollment });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 8. DELETE /fingerprint/:id — Remove Enrollment ───────────────────────────
router.delete("/:id", auth, async (req, res) => {
    try {
        const enrollment = await FingerprintEnrollment.findByIdAndDelete(req.params.id);
        if (!enrollment) {
            return res.status(404).json({ success: false, error: "Enrollment record not found." });
        }

        await FingerprintService.recordAudit({
            action: "TEMPLATE_DISABLE",
            subjectId: enrollment.subjectId,
            subjectType: enrollment.subjectType,
            subjectName: enrollment.subjectName,
            panel: req.user?.role === "SITE" ? "SITE" : "OFFICE",
            performedBy: req.user?.name || req.user?.email || "Admin",
            userRole: req.user?.role || "ADMIN",
            details: { action: "DELETED_ENROLLMENT" }
        });

        res.json({ success: true, message: "Fingerprint enrollment removed." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 9. GET /fingerprint/devices — List Registered Scanners ───────────────────
router.get("/devices", auth, async (req, res) => {
    try {
        const devices = await FingerprintService.getDevices();
        res.json({ success: true, devices });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 10. POST /fingerprint/devices/register — Register/Heartbeat Scanner ──────
router.post("/devices/register", auth, async (req, res) => {
    try {
        const { deviceId, status = "ONLINE", panel = "ALL" } = req.body;
        if (!deviceId) return res.status(400).json({ success: false, error: "deviceId is required" });

        const dev = await FingerprintService.updateDeviceStatus(deviceId, status, panel);
        res.json({ success: true, device: dev });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── 11. GET /fingerprint/audit-logs — Biometric Audit Trail ──────────────────
router.get("/audit-logs", auth, async (req, res) => {
    try {
        const {
            action,
            subjectType,
            search = "",
            page = 0,
            limit = 50
        } = req.query;

        const query = {};
        if (action && action !== "ALL") query.action = action;
        if (subjectType && subjectType !== "ALL") query.subjectType = subjectType;

        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), "i");
            query.$or = [
                { subjectName: regex },
                { subjectId: regex },
                { performedBy: regex },
                { transactionId: regex },
                { reason: regex }
            ];
        }

        const skip = parseInt(page) * parseInt(limit);
        const [logs, total] = await Promise.all([
            FingerprintAuditLog.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            FingerprintAuditLog.countDocuments(query)
        ]);

        res.json({
            success: true,
            logs,
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
