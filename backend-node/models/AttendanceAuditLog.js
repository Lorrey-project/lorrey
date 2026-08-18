const mongoose = require("mongoose");

const attendanceAuditLogSchema = new mongoose.Schema({
    attendanceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Attendance",
        default: null,
        index: true
    },
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    action: {
        type: String,
        required: true, // E.g., "CHECK_IN_SUCCESS", "CHECK_IN_REJECTED", "CHECK_OUT_SUCCESS", "CHECK_OUT_REJECTED", "ADMIN_CORRECTED", "ADMIN_DELETED"
        index: true
    },
    previousValue: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    newValue: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    reason: {
        type: String,
        default: ""
    },
    ipAddress: {
        type: String,
        default: ""
    },
    deviceInfo: {
        type: String,
        default: ""
    }
}, { timestamps: false });

module.exports = mongoose.model("AttendanceAuditLog", attendanceAuditLogSchema);
