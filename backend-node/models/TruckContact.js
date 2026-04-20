const mongoose = require("mongoose");

// Uses the `invoice_system` database on the same cluster
const invoiceSystemDb = mongoose.connection.useDb("invoice_system");

const truckContactSchema = new mongoose.Schema({
    truck_no:                           String,  // Truck number / vehicle registration
    type:                               String,  // Type of vehicle
    owner_name:                         String,
    pan_no:                             String,
    aadhar_no:                          String,
    pan_aadhar_link:                    String,
    contact_no:                         String,
    address:                            String,
    nil_tds_declaration:                String,
    tds_applicability:                  String,
    incentive_commission_applicability: String,
    gst_type:                           String,
    gst_no:                             String,
    gst_percent:                        String,
    rc_validity:                        String,
    insurance_validity:                 String,
    fitness_validity:                   String,
    road_tax_validity:                  String,
    permit:                             String,
    puc:                                String,
    np_validity:                        String,
    driver_name:                        String,
    license_no:                         String,
    license_validity:                   String,
    // strict: false allows reading old legacy documents that may still have
    // space-padded keys like "Truck No ", "Owner Name ", etc.
}, { collection: "Truck Contact Number", strict: false });

module.exports = invoiceSystemDb.model("TruckContact", truckContactSchema);
