const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
    },
    siteId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Site",
        required: true,
        index: true
    },
    selectedLocationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Site",
        index: true
    },
    selectedLocationName: {
        type: String
    },
    date: {
        type: String, // format: YYYY-MM-DD to guarantee unique logs per day
        required: true,
        index: true
    },
    checkIn: {
        time: { type: Date, required: true },
        latitude: { type: Number, required: true },
        longitude: { type: Number, required: true },
        accuracy: { type: Number, required: true },
        distanceFromSite: { type: Number, required: true },
        geofenceRadius: { type: Number, required: true },
        validationStatus: { type: String, default: "VALIDATED" }
    },
    checkOut: {
        time: { type: Date, default: null },
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        accuracy: { type: Number, default: null },
        distanceFromSite: { type: Number, default: null },
        geofenceRadius: { type: Number, default: null },
        validationStatus: { type: String, default: null }
    },
    status: {
        type: String,
        enum: ["checked-in", "checked-out", "absent"],
        default: "checked-in"
    },
    checkInStatus: {
        type: String,
        default: null
    },
    checkOutStatus: {
        type: String,
        default: null
    }
}, { timestamps: true });

// Compound index to guarantee one attendance session per employee per day
attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
