const crypto = require("crypto");
const FingerprintEnrollment = require("../models/FingerprintEnrollment");
const FingerprintDevice = require("../models/FingerprintDevice");
const FingerprintAuditLog = require("../models/FingerprintAuditLog");
const User = require("../models/User");

// Encryption key for biometric templates at rest
const BIOMETRIC_SECRET = process.env.BIOMETRIC_SECRET || "d1pal1-4ss0c1at3s-b10m3tr1c-s3cur1ty-k3y-2026";
const ENCRYPTION_KEY = crypto.createHash("sha256").update(BIOMETRIC_SECRET).digest();
const IV_LENGTH = 16;

/**
 * Encrypts a biometric template string
 */
function encryptTemplate(rawTemplate) {
    if (!rawTemplate) return "";
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(typeof rawTemplate === "string" ? rawTemplate : JSON.stringify(rawTemplate), "utf8", "hex");
    encrypted += cipher.final("hex");
    return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts a biometric template string (used strictly internally during server-side matching)
 */
function decryptTemplate(encryptedData) {
    if (!encryptedData || !encryptedData.includes(":")) return "";
    try {
        const [ivHex, encryptedText] = encryptedData.split(":");
        const iv = Buffer.from(ivHex, "hex");
        const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch (err) {
        console.error("Biometric decryption error:", err);
        return "";
    }
}

/**
 * Computes deterministic SHA-256 hash of a template to enable duplicate detection
 */
function hashTemplate(templateData) {
    const raw = typeof templateData === "string" ? templateData : JSON.stringify(templateData);
    return crypto.createHash("sha256").update(raw.trim().toLowerCase()).digest("hex");
}

/**
 * Generates the next sequential unique stable subject ID
 */
async function generateUniqueSubjectId(subjectType, driverType = null) {
    let prefix = "EMP";
    if (subjectType === "DRIVER") {
        prefix = driverType === "TEMPORARY" ? "TEMP-DRV" : "DRV";
    } else if (subjectType === "SITE_MEMBER") {
        prefix = "SITE";
    } else if (subjectType === "DEVELOPER") {
        prefix = "DEV";
    } else if (subjectType === "OFFICE_MEMBER") {
        prefix = "EMP";
    }

    const count = await FingerprintEnrollment.countDocuments({
        subjectType,
        ...(driverType ? { driverType } : {})
    });

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const padded = String(count + 1).padStart(4, "0");
    return `${prefix}-${padded}-${randomSuffix}`;
}

/**
 * Generates next sequential enrollment ID
 */
function generateEnrollmentId() {
    return `ENR-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * Writes an immutable audit entry
 */
async function recordAuditLog({
    action,
    subjectId = "",
    subjectType = "UNKNOWN",
    subjectName = "",
    transactionId = null,
    panel = "OFFICE",
    performedBy,
    userRole = "USER",
    deviceId = "DEFAULT_SCANNER",
    success = true,
    reason = "",
    details = {}
}) {
    try {
        const audit = new FingerprintAuditLog({
            auditId: `AUD-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
            action,
            subjectId,
            subjectType,
            subjectName,
            transactionId,
            panel,
            performedBy: performedBy || "SYSTEM",
            userRole,
            deviceId,
            success,
            reason,
            details: {
                ...details,
                timestamp: new Date()
            }
        });
        await audit.save();
        return audit;
    } catch (err) {
        console.error("Audit log error:", err);
    }
}

/**
 * Service Methods
 */
const FingerprintService = {
    /**
     * Check if a duplicate active fingerprint already exists for a different subject
     */
    async checkDuplicate(templateHash, currentSubjectId = null) {
        const existing = await FingerprintEnrollment.findOne({
            templateHash,
            status: "ACTIVE"
        }).select("subjectId subjectType subjectName");

        if (existing && existing.subjectId !== currentSubjectId) {
            return {
                isDuplicate: true,
                existingSubjectId: existing.subjectId,
                existingType: existing.subjectType
            };
        }
        return { isDuplicate: false };
    },

    /**
     * Enrolls or updates an authorized fingerprint identity
     */
    async enroll({
        subjectId,
        subjectType,
        subjectName,
        userId = null,
        driverType = null,
        mobile = "",
        licenseNo = "",
        assignedVehicle = "",
        fingerPosition = "RIGHT_THUMB",
        rawTemplate,
        passkeyCredentialId = null,
        passkeyPublicKey = null,
        passkeyCounter = 0,
        qualityScore = 88,
        deviceId = "USB-SCANNER-01",
        enrolledBy,
        enrolledByRole = "ADMIN",
        enrolledPanel = "OFFICE",
        metadata = {}
    }) {
        if (!subjectType || !subjectName || (!rawTemplate && !passkeyCredentialId)) {
            throw new Error("Missing required enrollment fields: subjectType, subjectName, template");
        }

        if (qualityScore < 50) {
            throw new Error(`Fingerprint capture quality too low (${qualityScore}%). Minimum required is 50%. Please scan again.`);
        }

        const templatePayload = rawTemplate || passkeyCredentialId;
        const templateHash = hashTemplate(templatePayload);

        // Check duplicate fingerprint across all identities
        const dupCheck = await this.checkDuplicate(templateHash, subjectId);
        if (dupCheck.isDuplicate) {
            await recordAuditLog({
                action: "DUPLICATE_FINGERPRINT_REJECTED",
                subjectType,
                subjectName,
                panel: enrolledPanel,
                performedBy: enrolledBy,
                userRole: enrolledByRole,
                deviceId,
                success: false,
                reason: "This fingerprint is already enrolled for an existing active identity.",
                details: { subjectType }
            });
            throw new Error("This fingerprint is already enrolled for an existing active identity.");
        }

        let finalSubjectId = subjectId;
        if (!finalSubjectId) {
            finalSubjectId = await generateUniqueSubjectId(subjectType, driverType);
        }

        const encryptedTemplate = encryptTemplate(templatePayload);
        const enrollmentId = generateEnrollmentId();

        // Check if this specific subject + finger position is already enrolled (re-enrollment)
        let enrollment = await FingerprintEnrollment.findOne({
            subjectId: finalSubjectId,
            fingerPosition
        });

        const isReEnrollment = Boolean(enrollment);

        if (enrollment) {
            enrollment.subjectName = subjectName.trim();
            enrollment.userId = userId;
            enrollment.driverType = driverType;
            enrollment.mobile = mobile;
            enrollment.licenseNo = licenseNo;
            enrollment.assignedVehicle = assignedVehicle ? assignedVehicle.trim().toUpperCase() : "";
            enrollment.fingerprintTemplate = encryptedTemplate;
            enrollment.templateHash = templateHash;
            enrollment.passkeyCredentialId = passkeyCredentialId;
            if (passkeyPublicKey) enrollment.passkeyPublicKey = passkeyPublicKey;
            enrollment.passkeyCounter = passkeyCounter;
            enrollment.qualityScore = qualityScore;
            enrollment.status = "ACTIVE";
            enrollment.deviceId = deviceId;
            enrollment.enrolledBy = enrolledBy;
            enrollment.enrolledByRole = enrolledByRole;
            enrollment.enrolledPanel = enrolledPanel;
            enrollment.enrolledAt = new Date();
            enrollment.metadata = metadata;
            await enrollment.save();
        } else {
            enrollment = new FingerprintEnrollment({
                enrollmentId,
                subjectId: finalSubjectId,
                subjectType,
                subjectName: subjectName.trim(),
                userId,
                driverType,
                mobile,
                licenseNo,
                assignedVehicle: assignedVehicle ? assignedVehicle.trim().toUpperCase() : "",
                fingerPosition,
                fingerprintTemplate: encryptedTemplate,
                templateHash,
                passkeyCredentialId,
                passkeyPublicKey,
                passkeyCounter,
                qualityScore,
                status: "ACTIVE",
                deviceId,
                enrolledBy,
                enrolledByRole,
                enrolledPanel,
                enrolledAt: new Date(),
                metadata
            });
            await enrollment.save();
        }

        // Audit logging
        await recordAuditLog({
            action: isReEnrollment ? "RE_ENROLLMENT" : "ENROLLMENT",
            subjectId: finalSubjectId,
            subjectType,
            subjectName: subjectName.trim(),
            panel: enrolledPanel,
            performedBy: enrolledBy,
            userRole: enrolledByRole,
            deviceId,
            success: true,
            details: {
                enrollmentId: enrollment.enrollmentId,
                fingerPosition,
                qualityScore,
                driverType
            }
        });

        return {
            enrollmentId: enrollment.enrollmentId,
            subjectId: enrollment.subjectId,
            subjectType: enrollment.subjectType,
            subjectName: enrollment.subjectName,
            driverType: enrollment.driverType,
            fingerPosition: enrollment.fingerPosition,
            status: enrollment.status,
            qualityScore: enrollment.qualityScore,
            enrolledAt: enrollment.enrolledAt,
            enrolledPanel: enrollment.enrolledPanel,
            isReEnrollment
        };
    },

    /**
     * Matches a candidate scan against enrolled records
     */
    async matchCandidate({
        candidateTemplate,
        subjectId = null,
        subjectType = null,
        allowedSubjectTypes = null,
        deviceId = "DEFAULT_SCANNER",
        performedBy = "SYSTEM",
        panel = "OFFICE",
        transactionId = null
    }) {
        if (!candidateTemplate) {
            throw new Error("No candidate fingerprint data provided for verification.");
        }

        const candidateHash = hashTemplate(candidateTemplate);

        const query = { status: "ACTIVE" };
        if (subjectId) {
            query.subjectId = subjectId;
        }
        if (subjectType) {
            query.subjectType = subjectType;
        } else if (allowedSubjectTypes && allowedSubjectTypes.length > 0) {
            query.subjectType = { $in: allowedSubjectTypes };
        }

        // Retrieve candidates with their template hash
        const enrollments = await FingerprintEnrollment.find(query)
            .select("+fingerprintTemplate subjectId subjectType subjectName driverType licenseNo assignedVehicle mobile fingerPosition templateHash qualityScore");

        if (!enrollments || enrollments.length === 0) {
            await recordAuditLog({
                action: "FAILED_VERIFICATION",
                subjectId: subjectId || "",
                subjectType: subjectType || "UNKNOWN",
                panel,
                performedBy,
                deviceId,
                transactionId,
                success: false,
                reason: "No active fingerprint enrollment found matching criteria."
            });
            return { matched: false, reason: "No active fingerprint enrollment found." };
        }

        // Exact hash match or template comparison
        let matchedEnrollment = null;
        for (const enr of enrollments) {
            if (enr.templateHash === candidateHash) {
                matchedEnrollment = enr;
                break;
            }
            // If decrypted matching is needed for complex template structures
            const decrypted = decryptTemplate(enr.fingerprintTemplate);
            if (decrypted && (decrypted === candidateTemplate || decrypted.includes(candidateTemplate) || candidateTemplate.includes(decrypted))) {
                matchedEnrollment = enr;
                break;
            }
        }

        if (!matchedEnrollment) {
            await recordAuditLog({
                action: "FAILED_VERIFICATION",
                subjectId: subjectId || "",
                subjectType: subjectType || "UNKNOWN",
                panel,
                performedBy,
                deviceId,
                transactionId,
                success: false,
                reason: "Fingerprint biometric scan did not match enrolled template."
            });
            return { matched: false, reason: "Fingerprint biometric did not match." };
        }

        // Update last verified timestamp
        await FingerprintEnrollment.updateOne(
            { _id: matchedEnrollment._id },
            { $set: { lastVerifiedAt: new Date() } }
        );

        await recordAuditLog({
            action: "VERIFICATION",
            subjectId: matchedEnrollment.subjectId,
            subjectType: matchedEnrollment.subjectType,
            subjectName: matchedEnrollment.subjectName,
            panel,
            performedBy,
            deviceId,
            transactionId,
            success: true,
            details: {
                fingerPosition: matchedEnrollment.fingerPosition,
                driverType: matchedEnrollment.driverType
            }
        });

        return {
            matched: true,
            subjectId: matchedEnrollment.subjectId,
            subjectType: matchedEnrollment.subjectType,
            subjectName: matchedEnrollment.subjectName,
            driverType: matchedEnrollment.driverType,
            fingerPosition: matchedEnrollment.fingerPosition,
            licenseNo: matchedEnrollment.licenseNo,
            assignedVehicle: matchedEnrollment.assignedVehicle,
            verifiedAt: new Date()
        };
    },

    /**
     * Creates a Temporary Driver with instant enrollment
     */
    async createTemporaryDriver({
        driverName,
        mobile = "",
        licenseNo = "",
        assignedVehicle = "",
        rawTemplate,
        qualityScore = 85,
        deviceId = "USB-SCANNER-01",
        enrolledBy,
        enrolledByRole = "SITE",
        enrolledPanel = "SITE",
        transactionId = null
    }) {
        if (!driverName || !driverName.trim()) {
            throw new Error("Temporary Driver Name is required.");
        }

        const subjectId = await generateUniqueSubjectId("DRIVER", "TEMPORARY");

        const enrollmentResult = await this.enroll({
            subjectId,
            subjectType: "DRIVER",
            subjectName: driverName.trim(),
            driverType: "TEMPORARY",
            mobile,
            licenseNo,
            assignedVehicle,
            fingerPosition: "RIGHT_THUMB",
            rawTemplate,
            qualityScore,
            deviceId,
            enrolledBy,
            enrolledByRole,
            enrolledPanel,
            metadata: {
                isTemporary: true,
                createdDuringTransaction: transactionId
            }
        });

        await recordAuditLog({
            action: "TEMPORARY_DRIVER_CREATION",
            subjectId,
            subjectType: "DRIVER",
            subjectName: driverName.trim(),
            panel: enrolledPanel,
            performedBy: enrolledBy,
            userRole: enrolledByRole,
            deviceId,
            transactionId,
            success: true,
            details: {
                subjectId,
                assignedVehicle,
                licenseNo
            }
        });

        return {
            success: true,
            driverId: subjectId,
            driverName: driverName.trim(),
            driverType: "TEMPORARY",
            enrollmentId: enrollmentResult.enrollmentId
        };
    },

    /**
     * Get list of connected/registered devices
     */
    async getDevices() {
        let devices = await FingerprintDevice.find().sort({ lastSeenAt: -1 }).lean();
        if (!devices || devices.length === 0) {
            // Seed standard production scanners if empty
            const standardDevices = [
                {
                    deviceId: "DEV-USB-MANTRA-01",
                    deviceName: "Mantra MFS100 USB Biometric Scanner",
                    deviceType: "USB",
                    model: "Mantra MFS100 Optical Sensor",
                    panel: "ALL",
                    status: "ONLINE"
                },
                {
                    deviceId: "DEV-OTG-MORPHO-01",
                    deviceName: "MorphoSmart MSO 1300 E3 OTG Scanner",
                    deviceType: "OTG",
                    model: "Morpho Optic FVP",
                    panel: "SITE",
                    status: "ONLINE"
                },
                {
                    deviceId: "DEV-WEBAUTHN-PLATFORM",
                    deviceName: "Platform Biometrics (Touch ID / Windows Hello)",
                    deviceType: "WEBAUTHN",
                    model: "FIDO2 / WebAuthn Biometric Subsystem",
                    panel: "ALL",
                    status: "ONLINE"
                }
            ];
            devices = await FingerprintDevice.insertMany(standardDevices);
        }
        return devices;
    },

    /**
     * Record device heartbeat / status
     */
    async updateDeviceStatus(deviceId, status = "ONLINE", panel = "ALL") {
        return await FingerprintDevice.findOneAndUpdate(
            { deviceId },
            { $set: { status, lastSeenAt: new Date(), panel } },
            { upsert: true, new: true }
        );
    },

    recordAudit: recordAuditLog
};

module.exports = FingerprintService;
