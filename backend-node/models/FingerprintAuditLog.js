const mongoose = require("mongoose");

const fingerprintAuditLogSchema = new mongoose.Schema({
    auditId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    action: {
        type: String,
        enum: [
            "ENROLLMENT",
            "RE_ENROLLMENT",
            "VERIFICATION",
            "FAILED_VERIFICATION",
            "PAYMENT_AUTHORIZATION",
            "DEVICE_ERROR",
            "TEMPLATE_UPDATE",
            "TEMPLATE_DISABLE",
            "TEMPLATE_ENABLE",
            "TEMPORARY_DRIVER_CREATION",
            "DUPLICATE_FINGERPRINT_REJECTED",
            "SESSION_EXPIRED"
        ],
        required: true,
        index: true
    },
    subjectId: {
        type: String,
        default: "",
        index: true
    },
    subjectType: {
        type: String,
        enum: ["DRIVER", "OFFICE_MEMBER", "SITE_MEMBER", "DEVELOPER", "SYSTEM", "UNKNOWN"],
        default: "UNKNOWN",
        index: true
    },
    subjectName: {
        type: String,
        default: ""
    },
    transactionId: {
        type: String,
        default: null,
        index: true
    },
    panel: {
        type: String,
        enum: ["OFFICE", "SITE", "SYSTEM"],
        default: "OFFICE"
    },
    performedBy: {
        type: String,
        required: true
    },
    userRole: {
        type: String,
        default: "USER"
    },
    deviceId: {
        type: String,
        default: "SCANNER_DEFAULT"
    },
    success: {
        type: Boolean,
        default: true
    },
    reason: {
        type: String,
        default: ""
    },
    // Strict requirement: Never log raw templates or private biometric key material in details
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
}, { timestamps: true });

fingerprintAuditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model("FingerprintAuditLog", fingerprintAuditLogSchema);
