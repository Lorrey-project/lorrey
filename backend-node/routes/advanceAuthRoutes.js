const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const AdvanceBiometricAuthorization = require("../models/AdvanceBiometricAuthorization");
const DriverBiometric = require("../models/DriverBiometric");
const User = require("../models/User");
const Invoice = require("../models/Invoice");
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const rpName = "DIPALI ASSOCIATES & CO.";

// WebAuthn rpID helper (must match authController.js)
const getRPID = (req) => {
    const host = (req.headers.host || "localhost").split(":")[0];
    const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    return isIPv4 ? "localhost" : host;
};

// Expected origin helper
const getExpectedOrigins = (req) => {
    const actualOrigin = req.headers.origin;
    if (actualOrigin) {
        return [
            actualOrigin,
            actualOrigin.replace(/\/\/[^:]+/, "//localhost"),
            "https://dipaliassociatesco.com",
            "http://localhost:5173",
            "http://localhost:3000"
        ];
    }
    return ["http://localhost:5173", "https://dipaliassociatesco.com"];
};

// ── 1. Initiate Advance Authorization Session ─────────────────────────────────────────
router.post("/initiate", async (req, res) => {
    try {
        const {
            invoice_id,
            vehicle_number,
            driver_name,
            driver_license_no = "",
            advance_type, // 'LOADING', 'FUEL', 'BOTH'
            loading_advance = 0,
            diesel_litres = 0,
            diesel_rate = 90,
            diesel_advance = 0,
            total_advance = 0,
        } = req.body;

        if (!invoice_id || !vehicle_number || !driver_name || !advance_type) {
            return res.status(400).json({
                error: "Missing required parameters: invoice_id, vehicle_number, driver_name, advance_type"
            });
        }

        // Identify Site Member from authenticated user
        const siteMember = req.user;
        const siteMemberName = siteMember?.name || siteMember?.email || "Site Member";

        const transactionId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute validity window

        const session = new AdvanceBiometricAuthorization({
            transaction_id: transactionId,
            invoice_id,
            vehicle_number: vehicle_number.trim().toUpperCase(),
            driver_name: driver_name.trim(),
            driver_license_no: driver_license_no.trim(),
            driver_verified: false,
            site_member_id: siteMember?.userId,
            site_member_name: siteMemberName,
            site_member_verified: false,
            advance_type,
            loading_advance: Number(loading_advance) || 0,
            diesel_litres: Number(diesel_litres) || 0,
            diesel_rate: Number(diesel_rate) || 0,
            diesel_advance: Number(diesel_advance) || 0,
            total_advance: Number(total_advance) || 0,
            status: "PENDING",
            expires_at: expiresAt,
            client_origin: req.headers.origin || "",
            rp_id: getRPID(req),
            audit_trail: [{
                action: "SESSION_INITIATED",
                performed_by: siteMemberName,
                role: siteMember?.role || "SITE",
                details: {
                    invoice_id,
                    vehicle_number,
                    driver_name,
                    loading_advance,
                    diesel_litres,
                    total_advance
                }
            }]
        });

        await session.save();

        res.status(201).json({
            success: true,
            sessionId: session.transaction_id,
            driver_name: session.driver_name,
            site_member_name: session.site_member_name,
            vehicle_number: session.vehicle_number,
            advance_type: session.advance_type,
            total_advance: session.total_advance,
            expires_at: session.expires_at
        });

    } catch (err) {
        console.error("Error in /advance-auth/initiate:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── 2. Generate Challenge (for Driver or Site Member) ─────────────────────────────────
router.post("/challenge", async (req, res) => {
    try {
        const { sessionId, role } = req.body;
        if (!sessionId || !role || !["driver", "site_member"].includes(role)) {
            return res.status(400).json({ error: "Valid sessionId and role ('driver' or 'site_member') are required." });
        }

        const session = await AdvanceBiometricAuthorization.findOne({ transaction_id: sessionId });
        if (!session) return res.status(404).json({ error: "Authorization session not found." });

        if (session.status === "CONSUMED" || session.status === "EXPIRED") {
            return res.status(400).json({ error: `Session is ${session.status.toLowerCase()}. Please initiate a new authorization.` });
        }

        if (new Date() > session.expires_at) {
            session.status = "EXPIRED";
            await session.save();
            return res.status(400).json({ error: "Authorization session has expired. Please initiate again." });
        }

        const rpID = getRPID(req);

        // Sequential constraint: Driver MUST be verified before Site Member can be challenged
        if (role === "site_member" && !session.driver_verified) {
            return res.status(400).json({ error: "Driver must be authenticated first before Site Member authentication." });
        }

        if (role === "driver") {
            // Locate or initialize driver profile
            let driver = await DriverBiometric.findOne({ driver_name: session.driver_name });
            if (!driver) {
                driver = new DriverBiometric({
                    driver_name: session.driver_name,
                    license_no: session.driver_license_no,
                    truck_no: session.vehicle_number,
                    passkeys: []
                });
                await driver.save();
            }

            const validPasskeys = (driver.passkeys || []).filter(p => p.credentialID);

            if (validPasskeys.length > 0) {
                // Existing driver on this device/system: trigger biometric authentication
                const options = await generateAuthenticationOptions({
                    rpID,
                    allowCredentials: validPasskeys.map(k => ({
                        id: k.credentialID,
                        type: "public-key",
                        transports: k.transports || ["internal"]
                    })),
                    userVerification: "required"
                });

                session.driver_challenge = options.challenge;
                driver.currentChallenge = options.challenge;
                await session.save();
                await driver.save();

                return res.json({ options, isRegistration: false });
            } else {
                // First-time biometric registration for this driver on platform authenticator
                const options = await generateRegistrationOptions({
                    rpName,
                    rpID,
                    userID: new Uint8Array(Buffer.from(`driver_${session.driver_name}_${session.vehicle_number}`)),
                    userName: `${session.driver_name} (Driver)`,
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required",
                        residentKey: "preferred"
                    }
                });

                session.driver_challenge = options.challenge;
                driver.currentChallenge = options.challenge;
                await session.save();
                await driver.save();

                return res.json({ options, isRegistration: true });
            }

        } else if (role === "site_member") {
            // Site Member authentication
            const siteUser = await User.findById(session.site_member_id || req.user?.userId);
            const validPasskeys = (siteUser?.passkeys || []).filter(k => k.credentialID);

            if (validPasskeys.length > 0) {
                const options = await generateAuthenticationOptions({
                    rpID,
                    allowCredentials: validPasskeys.map(k => ({
                        id: k.credentialID,
                        type: "public-key",
                        transports: k.transports || ["internal"]
                    })),
                    userVerification: "required"
                });

                session.site_member_challenge = options.challenge;
                if (siteUser) {
                    siteUser.currentChallenge = options.challenge;
                    await siteUser.save();
                }
                await session.save();

                return res.json({ options, isRegistration: false });
            } else {
                // Register Site Member platform authenticator passkey
                const options = await generateRegistrationOptions({
                    rpName,
                    rpID,
                    userID: new Uint8Array(Buffer.from(siteUser?.email || `sitemember_${session.site_member_name}`)),
                    userName: siteUser?.email || `${session.site_member_name} (Site Member)`,
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required",
                        residentKey: "preferred"
                    }
                });

                session.site_member_challenge = options.challenge;
                if (siteUser) {
                    siteUser.currentChallenge = options.challenge;
                    await siteUser.save();
                }
                await session.save();

                return res.json({ options, isRegistration: true });
            }
        }

    } catch (err) {
        console.error("Error in /advance-auth/challenge:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── 3. Verify Biometric Response (Driver or Site Member) ──────────────────────────────
router.post("/verify", async (req, res) => {
    try {
        const { sessionId, role, response, isRegistration } = req.body;
        if (!sessionId || !role || !response) {
            return res.status(400).json({ error: "Missing verification parameters." });
        }

        const session = await AdvanceBiometricAuthorization.findOne({ transaction_id: sessionId });
        if (!session) return res.status(404).json({ error: "Authorization session not found." });

        if (session.status === "CONSUMED" || session.status === "EXPIRED") {
            return res.status(400).json({ error: `Session is ${session.status.toLowerCase()}.` });
        }

        const expectedOrigins = getExpectedOrigins(req);
        const expectedRPID = getRPID(req);

        if (role === "driver") {
            const expectedChallenge = session.driver_challenge;
            if (!expectedChallenge) {
                return res.status(400).json({ error: "No active challenge found for driver." });
            }

            const driver = await DriverBiometric.findOne({ driver_name: session.driver_name });
            if (!driver) return res.status(404).json({ error: "Driver record not found." });

            let verified = false;

            if (isRegistration) {
                const verification = await verifyRegistrationResponse({
                    response,
                    expectedChallenge,
                    expectedOrigin: expectedOrigins,
                    expectedRPID
                });
                verified = verification.verified;

                if (verified && verification.registrationInfo) {
                    const { credential } = verification.registrationInfo;
                    driver.passkeys.push({
                        credentialID: credential.id,
                        credentialPublicKey: Buffer.from(credential.publicKey),
                        counter: credential.counter,
                        transports: credential.transports || response.response?.transports || ["internal"]
                    });
                    await driver.save();
                }
            } else {
                const passkey = driver.passkeys.find(p => p.credentialID === response.id);
                if (!passkey) return res.status(400).json({ error: "Driver passkey not recognized." });

                const verification = await verifyAuthenticationResponse({
                    response,
                    expectedChallenge,
                    expectedOrigin: expectedOrigins,
                    expectedRPID,
                    authenticator: {
                        credentialID: passkey.credentialID,
                        credentialPublicKey: passkey.credentialPublicKey,
                        counter: passkey.counter,
                        transports: passkey.transports
                    }
                });
                verified = verification.verified;
                if (verified && verification.authenticationInfo) {
                    passkey.counter = verification.authenticationInfo.newCounter;
                    await driver.save();
                }
            }

            if (!verified) {
                session.audit_trail.push({
                    action: "DRIVER_VERIFICATION_FAILED",
                    performed_by: session.driver_name,
                    role: "DRIVER",
                    details: { timestamp: new Date() }
                });
                await session.save();
                return res.status(400).json({ verified: false, error: "Driver fingerprint verification failed." });
            }

            session.driver_verified = true;
            session.driver_verified_at = new Date();
            session.driver_challenge = null;
            session.audit_trail.push({
                action: "DRIVER_FINGERPRINT_VERIFIED",
                performed_by: session.driver_name,
                role: "DRIVER",
                details: { timestamp: new Date() }
            });
            await session.save();

            return res.json({
                success: true,
                verified: true,
                role: "driver",
                driver_verified: true,
                site_member_verified: session.site_member_verified
            });

        } else if (role === "site_member") {
            if (!session.driver_verified) {
                return res.status(400).json({ error: "Driver must be verified first." });
            }

            const expectedChallenge = session.site_member_challenge;
            if (!expectedChallenge) {
                return res.status(400).json({ error: "No active challenge found for site member." });
            }

            const siteUser = await User.findById(session.site_member_id || req.user?.userId);
            let verified = false;

            if (isRegistration) {
                const verification = await verifyRegistrationResponse({
                    response,
                    expectedChallenge,
                    expectedOrigin: expectedOrigins,
                    expectedRPID
                });
                verified = verification.verified;

                if (verified && verification.registrationInfo && siteUser) {
                    const { credential } = verification.registrationInfo;
                    siteUser.passkeys.push({
                        credentialID: credential.id,
                        credentialPublicKey: Buffer.from(credential.publicKey),
                        counter: credential.counter,
                        transports: credential.transports || response.response?.transports || ["internal"]
                    });
                    await siteUser.save();
                }
            } else {
                const passkey = siteUser?.passkeys?.find(p => p.credentialID === response.id);
                if (!passkey) return res.status(400).json({ error: "Site member passkey not found." });

                const verification = await verifyAuthenticationResponse({
                    response,
                    expectedChallenge,
                    expectedOrigin: expectedOrigins,
                    expectedRPID,
                    authenticator: {
                        credentialID: passkey.credentialID,
                        credentialPublicKey: passkey.credentialPublicKey,
                        counter: passkey.counter,
                        transports: passkey.transports
                    }
                });
                verified = verification.verified;
                if (verified && verification.authenticationInfo && siteUser) {
                    passkey.counter = verification.authenticationInfo.newCounter;
                    await siteUser.save();
                }
            }

            if (!verified) {
                session.audit_trail.push({
                    action: "SITE_MEMBER_VERIFICATION_FAILED",
                    performed_by: session.site_member_name,
                    role: "SITE_MEMBER",
                    details: { timestamp: new Date() }
                });
                await session.save();
                return res.status(400).json({ verified: false, error: "Site member fingerprint verification failed." });
            }

            session.site_member_verified = true;
            session.site_member_verified_at = new Date();
            session.site_member_challenge = null;

            // BOTH ARE NOW VERIFIED! Generate one-time tamper-proof authorization token
            const authToken = `AUTH_${crypto.randomBytes(24).toString("hex")}`;
            session.status = "AUTHORIZED";
            session.authorization_token = authToken;

            session.audit_trail.push({
                action: "SITE_MEMBER_FINGERPRINT_VERIFIED",
                performed_by: session.site_member_name,
                role: "SITE_MEMBER",
                details: { timestamp: new Date() }
            });

            session.audit_trail.push({
                action: "ADVANCE_AUTHORIZED",
                performed_by: "SYSTEM",
                role: "SECURITY",
                details: {
                    authorization_token: authToken,
                    advance_type: session.advance_type,
                    loading_advance: session.loading_advance,
                    diesel_litres: session.diesel_litres,
                    total_advance: session.total_advance,
                    timestamp: new Date()
                }
            });

            await session.save();

            return res.json({
                success: true,
                verified: true,
                role: "site_member",
                driver_verified: true,
                site_member_verified: true,
                status: "AUTHORIZED",
                authorization_token: authToken,
                sessionId: session.transaction_id
            });
        }

    } catch (err) {
        console.error("Error in /advance-auth/verify:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── 4. Query Session Status ──────────────────────────────────────────────────────────
router.get("/status/:sessionId", async (req, res) => {
    try {
        const session = await AdvanceBiometricAuthorization.findOne({ transaction_id: req.params.sessionId });
        if (!session) return res.status(404).json({ error: "Session not found" });

        res.json({
            sessionId: session.transaction_id,
            status: session.status,
            driver_name: session.driver_name,
            driver_verified: session.driver_verified,
            driver_verified_at: session.driver_verified_at,
            site_member_name: session.site_member_name,
            site_member_verified: session.site_member_verified,
            site_member_verified_at: session.site_member_verified_at,
            advance_type: session.advance_type,
            loading_advance: session.loading_advance,
            diesel_litres: session.diesel_litres,
            diesel_advance: session.diesel_advance,
            total_advance: session.total_advance,
            is_authorized: session.status === "AUTHORIZED",
            authorization_token: session.status === "AUTHORIZED" ? session.authorization_token : null,
            expires_at: session.expires_at
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
