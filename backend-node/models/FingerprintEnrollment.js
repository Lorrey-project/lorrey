const mongoose = require("mongoose");

const fingerprintEnrollmentSchema = new mongoose.Schema({
    enrollmentId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    subjectId: {
        type: String,
        required: true,
        index: true
    },
    subjectType: {
        type: String,
        enum: ["DRIVER", "OFFICE_MEMBER", "SITE_MEMBER", "DEVELOPER"],
        required: true,
        index: true
    },
    subjectName: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    // Reference to User._id or TruckContact._id if available
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    driverType: {
        type: String,
        enum: ["PERMANENT", "TEMPORARY", null],
        default: null
    },
    mobile: {
        type: String,
        trim: true,
        default: ""
    },
    licenseNo: {
        type: String,
        trim: true,
        default: ""
    },
    assignedVehicle: {
        type: String,
        trim: true,
        uppercase: true,
        default: ""
    },
    fingerPosition: {
        type: String,
        enum: [
            "RIGHT_THUMB",
            "LEFT_THUMB",
            "RIGHT_INDEX",
            "LEFT_INDEX",
            "RIGHT_MIDDLE",
            "LEFT_MIDDLE",
            "RIGHT_RING",
            "LEFT_RING",
            "RIGHT_LITTLE",
            "LEFT_LITTLE"
        ],
        default: "RIGHT_THUMB"
    },
    // Biometric secure template / passkey data (Encrypted/Hashed)
    // select: false ensures it is NEVER exposed in ordinary queries or sent to the frontend
    fingerprintTemplate: {
        type: String,
        required: true,
        select: false
    },
    // SHA-256 hash of the template for secure duplicate detection without exposing template
    templateHash: {
        type: String,
        required: true,
        index: true
    },
    // WebAuthn Passkey format (for platform authenticators like TouchID/Windows Hello/Android)
    passkeyCredentialId: {
        type: String,
        default: null,
        index: true
    },
    passkeyPublicKey: {
        type: Buffer,
        default: null,
        select: false
    },
    passkeyCounter: {
        type: Number,
        default: 0
    },
    qualityScore: {
        type: Number,
        default: 85,
        min: 0,
        max: 100
    },
    status: {
        type: String,
        enum: ["ACTIVE", "DISABLED"],
        default: "ACTIVE",
        index: true
    },
    deviceId: {
        type: String,
        default: "DEFAULT_SCANNER"
    },
    enrolledBy: {
        type: String,
        required: true
    },
    enrolledByRole: {
        type: String,
        default: "ADMIN"
    },
    enrolledPanel: {
        type: String,
        enum: ["OFFICE", "SITE"],
        default: "OFFICE"
    },
    enrolledAt: {
        type: Date,
        default: Date.now
    },
    lastVerifiedAt: {
        type: Date,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { timestamps: true });

// Multi-field indexes for efficient searching
fingerprintEnrollmentSchema.index({ subjectId: 1, fingerPosition: 1 });
fingerprintEnrollmentSchema.index({ subjectType: 1, status: 1 });
fingerprintEnrollmentSchema.index({ subjectName: "text", mobile: "text", licenseNo: "text", assignedVehicle: "text" });

module.exports = mongoose.model("FingerprintEnrollment", fingerprintEnrollmentSchema);
