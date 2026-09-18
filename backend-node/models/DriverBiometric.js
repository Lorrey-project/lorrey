const mongoose = require("mongoose");

const driverBiometricSchema = new mongoose.Schema({
    driver_name: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    license_no: {
        type: String,
        trim: true,
        default: ""
    },
    truck_no: {
        type: String,
        trim: true,
        uppercase: true,
        default: ""
    },
    passkeys: [{
        credentialID: String,
        credentialPublicKey: Buffer,
        counter: Number,
        transports: [String]
    }],
    currentChallenge: {
        type: String,
        default: null
    }
}, { timestamps: true });

driverBiometricSchema.index({ driver_name: 1, license_no: 1 });

module.exports = mongoose.model("DriverBiometric", driverBiometricSchema);
