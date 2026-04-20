const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['OFFICE', 'PETROL PUMP', 'HEAD_OFFICE'],
        default: 'OFFICE'
    },
    pumpName: {
        type: String,
        enum: ['SAS-1', 'SAS-2', null],
        default: null
    },
    fuelRate: {
        type: Number,
        default: 90   // HSD diesel rate (₹/litre) — can be updated per-pump
    },
    // WebAuthn Passkey Database
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

// Hash password before saving
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
