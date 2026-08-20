const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    date: {
        type: String, // Format: YYYY-MM-DD
        required: true,
        unique: true,
        index: true
    }
}, { timestamps: true });

module.exports = mongoose.model("Holiday", holidaySchema);
