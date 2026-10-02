const mongoose = require("mongoose");

const fingerprintDeviceSchema = new mongoose.Schema({
    deviceId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    deviceName: {
        type: String,
        required: true,
        trim: true
    },
    deviceType: {
        type: String,
        enum: ["USB", "OTG", "WEBAUTHN", "SERIAL", "NATIVE_SDK"],
        default: "USB"
    },
    model: {
        type: String,
        default: "Biometric Scanner"
    },
    serialNumber: {
        type: String,
        default: ""
    },
    panel: {
        type: String,
        enum: ["OFFICE", "SITE", "ALL"],
        default: "ALL"
    },
    status: {
        type: String,
        enum: ["ONLINE", "OFFLINE", "BUSY", "ERROR"],
        default: "ONLINE"
    },
    firmwareVersion: {
        type: String,
        default: "v1.0.0"
    },
    lastSeenAt: {
        type: Date,
        default: Date.now
    },
    registeredBy: {
        type: String,
        default: "SYSTEM"
    },
    capabilities: {
        supportsDuplicateCheck: { type: Boolean, default: true },
        supportsMultiFinger: { type: Boolean, default: true },
        rawCaptureSupported: { type: Boolean, default: false }, // Raw images NEVER stored
        templateFormat: { type: String, default: "ISO_19794_2_ENC" }
    }
}, { timestamps: true });

module.exports = mongoose.model("FingerprintDevice", fingerprintDeviceSchema);
