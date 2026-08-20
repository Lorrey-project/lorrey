const mongoose = require("mongoose");

const attendanceSettingSchema = new mongoose.Schema({
    officeStartTime: {
        type: String,
        default: "09:30" // Format: HH:MM
    },
    gracePeriodMinutes: {
        type: Number,
        default: 15
    },
    officeEndTime: {
        type: String,
        default: "17:30" // Format: HH:MM
    },
    earlyCheckoutThreshold: {
        type: String,
        default: "17:15" // Format: HH:MM
    }
}, { timestamps: true });

module.exports = mongoose.model("AttendanceSetting", attendanceSettingSchema);
