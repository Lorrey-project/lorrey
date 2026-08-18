const mongoose = require("mongoose");

const siteSchema = new mongoose.Schema({
    siteName: {
        type: String,
        required: true,
        unique: true
    },
    latitude: {
        type: Number,
        required: true
    },
    longitude: {
        type: Number,
        required: true
    },
    geofenceRadius: {
        type: Number,
        default: 100 // allowed radius in meters
    },
    maxGpsAccuracy: {
        type: Number,
        default: 250 // maximum acceptable GPS uncertainty in meters
    }
}, { timestamps: true });

module.exports = mongoose.model("Site", siteSchema);
