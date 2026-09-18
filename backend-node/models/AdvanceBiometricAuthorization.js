const mongoose = require("mongoose");

const advanceBiometricAuthorizationSchema = new mongoose.Schema({
    transaction_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    invoice_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Invoice",
        required: true,
        index: true
    },
    vehicle_number: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    driver_name: {
        type: String,
        required: true,
        trim: true
    },
    driver_license_no: {
        type: String,
        default: ""
    },
    driver_verified: {
        type: Boolean,
        default: false
    },
    driver_verified_at: {
        type: Date
    },
    site_member_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    site_member_name: {
        type: String,
        required: true,
        trim: true
    },
    site_member_verified: {
        type: Boolean,
        default: false
    },
    site_member_verified_at: {
        type: Date
    },
    advance_type: {
        type: String,
        enum: ["LOADING", "FUEL", "BOTH"],
        required: true
    },
    loading_advance: {
        type: Number,
        default: 0
    },
    diesel_litres: {
        type: Number,
        default: 0
    },
    diesel_rate: {
        type: Number,
        default: 0
    },
    diesel_advance: {
        type: Number,
        default: 0
    },
    total_advance: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ["PENDING", "AUTHORIZED", "CONSUMED", "REJECTED", "EXPIRED"],
        default: "PENDING",
        index: true
    },
    authorization_token: {
        type: String,
        index: true
    },
    expires_at: {
        type: Date,
        required: true,
        index: { expires: "1h" } // Auto-clean after 1 hour if expired
    },
    consumed_at: {
        type: Date
    },
    client_origin: {
        type: String
    },
    rp_id: {
        type: String
    },
    driver_challenge: {
        type: String
    },
    site_member_challenge: {
        type: String
    },
    audit_trail: [{
        action: String,
        performed_by: String,
        role: String,
        timestamp: { type: Date, default: Date.now },
        details: mongoose.Schema.Types.Mixed
    }]
}, { timestamps: true });

advanceBiometricAuthorizationSchema.index({ invoice_id: 1, vehicle_number: 1 });

module.exports = mongoose.model("AdvanceBiometricAuthorization", advanceBiometricAuthorizationSchema);
