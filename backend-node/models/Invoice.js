const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema({

    file_url: String,
    softcopy_url: String,

    gcn_url: String,
    gcn_data: Object,

    ai_data: Object,

    human_verified_data: Object,

    consignee_name: String,

    lorry_hire_slip_data: {
        lorry_hire_slip_no: String,
        fuel_slip_no: String,
        loading_advance: Number,
        diesel_litres: Number,
        diesel_rate: { type: Number, default: 90 },
        diesel_advance: Number,
        total_advance: Number,
        estimated_required_fuel: Number,   // (distance × 2) / mileage_kmpl — auto-calculated, read-only reference
        lorry_hire_slip_url: String,
        station_name: String,
        station_address: String,
        fuel_slip_url: String,
        created_at: { type: Date, default: Date.now }
    },

    status: {
        type: String,
        default: "pending"
    },

    created_at: {
        type: Date,
        default: Date.now
    }

});

module.exports = mongoose.model("Invoice", invoiceSchema);