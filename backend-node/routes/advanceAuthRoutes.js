const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const AdvanceBiometricAuthorization = require("../models/AdvanceBiometricAuthorization");
const FingerprintEnrollment = require("../models/FingerprintEnrollment");
const DriverBiometric = require("../models/DriverBiometric");
const User = require("../models/User");
const FingerprintService = require("../services/fingerprintService");
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
            panel_source = null
        } = req.body;

        if (!invoice_id || !vehicle_number || !driver_name || !advance_type) {
            return res.status(400).json({
                error: "Missing required parameters: invoice_id, vehicle_number, driver_name, advance_type"
            });
        }

        // Identify authenticated user (Office or Site Member)
        const currentUser = req.user;
        const currentUserName = currentUser?.name || currentUser?.email || "Authorized Member";
        const panel = panel_source || (currentUser?.role === "SITE" ? "SITE" : "OFFICE");
        const secondAuthType = panel === "SITE" ? "SITE_MEMBER" : "OFFICE_MEMBER";

        const transactionId = `EXP-${new Date().getFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute validity window

        // Look up enrolled driver ID if exists
        const enrolledDriver = await FingerprintEnrollment.findOne({
            subjectType: "DRIVER",
            status: "ACTIVE",
            $or: [
                { subjectName: new RegExp(`^${driver_name.trim()}$`, "i") },
                { assignedVehicle: vehicle_number.trim().toUpperCase() }
            ]
        }).lean();

        const session = new AdvanceBiometricAuthorization({
            transaction_id: transactionId,
            invoice_id,
            vehicle_number: vehicle_number.trim().toUpperCase(),
            driver_id: enrolledDriver ? enrolledDriver.subjectId : "",
            driver_name: driver_name.trim(),
            driver_type: enrolledDriver?.driverType || "PERMANENT",
            driver_license_no: driver_license_no.trim(),
            driver_verified: false,
            panel_source: panel,
            second_auth_type: secondAuthType,
            site_member_id: currentUser?.userId || currentUser?._id,
            site_member_name: currentUserName,
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
                performed_by: currentUserName,
                role: currentUser?.role || panel,
                details: {
                    invoice_id,
                    vehicle_number,
                    driver_name,
                    driver_id: enrolledDriver ? enrolledDriver.subjectId : "UNENROLLED",
                    loading_advance,
                    diesel_litres,
                    total_advance,
                    panel
                }
            }]
        });

        await session.save();

        await FingerprintService.recordAudit({
            action: "PAYMENT_AUTHORIZATION",
            subjectId: enrolledDriver ? enrolledDriver.subjectId : session.driver_name,
            subjectType: "DRIVER",
            subjectName: session.driver_name,
            transactionId: session.transaction_id,
            panel,
            performedBy: currentUserName,
            userRole: currentUser?.role || panel,
            success: true,
            details: {
                action: "SESSION_INITIATED",
                vehicle_number: session.vehicle_number,
                total_advance: session.total_advance
            }
        });

        res.status(201).json({
            success: true,
            sessionId: session.transaction_id,
            driver_id: session.driver_id,
            driver_name: session.driver_name,
            driver_type: session.driver_type,
            site_member_name: session.site_member_name,
            panel_source: session.panel_source,
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

// ── 2. Direct Hardware / Bridge Fingerprint Verification Route ───────────────────────
router.post("/verify-hardware", async (req, res) => {
    try {
        const { sessionId, role, rawTemplate, deviceId = "USB-SCANNER-01" } = req.body;
        if (!sessionId || !role || !rawTemplate) {
            return res.status(400).json({ error: "Missing sessionId, role ('driver' or 'member'), or rawTemplate." });
        }

        const session = await AdvanceBiometricAuthorization.findOne({ transaction_id: sessionId });
        if (!session) return res.status(404).json({ error: "Authorization session not found." });

        if (session.status === "CONSUMED" || session.status === "EXPIRED") {
            return res.status(400).json({ error: `Session is ${session.status.toLowerCase()}.` });
        }

        if (new Date() > session.expires_at) {
            session.status = "EXPIRED";
            await session.save();
            return res.status(400).json({ error: "Session expired." });
        }

        if (role === "driver") {
            // Match against active Driver enrollments
            const matchResult = await FingerprintService.matchCandidate({
                candidateTemplate: rawTemplate,
                allowedSubjectTypes: ["DRIVER"],
                deviceId,
                performedBy: session.driver_name,
                panel: session.panel_source,
                transactionId: session.transaction_id
            });

            if (!matchResult.matched) {
                session.audit_trail.push({
                    action: "DRIVER_VERIFICATION_FAILED",
                    performed_by: session.driver_name,
                    role: "DRIVER",
                    details: { reason: "Fingerprint does not match any enrolled driver.", timestamp: new Date() }
                });
                await session.save();
                return res.status(400).json({ verified: false, error: "Fingerprint biometric scan did not match any enrolled driver." });
            }

            // CRITICAL VALIDATION: Verify matched driver == assigned driver for this trip/vehicle
            const matchedName = (matchResult.subjectName || "").toLowerCase().trim();
            const assignedName = (session.driver_name || "").toLowerCase().trim();
            const matchedVehicle = (matchResult.assignedVehicle || "").toUpperCase().trim();
            const currentVehicle = (session.vehicle_number || "").toUpperCase().trim();

            const isExactName = matchedName === assignedName;
            const isVehicleMatched = matchedVehicle && matchedVehicle === currentVehicle;

            if (!isExactName && !isVehicleMatched) {
                session.audit_trail.push({
                    action: "DRIVER_MISMATCH_REJECTED",
                    performed_by: session.driver_name,
                    role: "DRIVER",
                    details: {
                        matchedDriver: matchResult.subjectName,
                        assignedDriver: session.driver_name,
                        matchedId: matchResult.subjectId,
                        timestamp: new Date()
                    }
                });
                await session.save();
                return res.status(400).json({
                    verified: false,
                    error: `Fingerprint belongs to '${matchResult.subjectName}', but this trip is assigned to '${session.driver_name}'. Authorization rejected.`
                });
            }

            session.driver_verified = true;
            session.driver_id = matchResult.subjectId;
            session.driver_type = matchResult.driverType || "PERMANENT";
            session.driver_verified_at = new Date();
            session.driver_device_id = deviceId;
            session.status = "DRIVER_VERIFIED";
            session.audit_trail.push({
                action: "DRIVER_FINGERPRINT_VERIFIED",
                performed_by: matchResult.subjectName,
                role: "DRIVER",
                details: { driverId: matchResult.subjectId, driverType: matchResult.driverType, timestamp: new Date() }
            });
            await session.save();

            return res.json({
                success: true,
                verified: true,
                role: "driver",
                driver_verified: true,
                matchedDriver: matchResult.subjectName,
                driverId: matchResult.subjectId,
                site_member_verified: session.site_member_verified
            });

        } else if (role === "site_member" || role === "office_member" || role === "member") {
            if (!session.driver_verified) {
                return res.status(400).json({ error: "Driver must be verified first before second person verification." });
            }

            const allowedRoles = session.panel_source === "SITE"
                ? ["SITE_MEMBER", "OFFICE_MEMBER"]
                : ["OFFICE_MEMBER", "DEVELOPER"];

            const matchResult = await FingerprintService.matchCandidate({
                candidateTemplate: rawTemplate,
                allowedSubjectTypes: allowedRoles,
                deviceId,
                performedBy: session.site_member_name,
                panel: session.panel_source,
                transactionId: session.transaction_id
            });

            if (!matchResult.matched) {
                session.audit_trail.push({
                    action: "SECOND_AUTH_VERIFICATION_FAILED",
                    performed_by: session.site_member_name,
                    role: session.second_auth_type,
                    details: { reason: "Fingerprint does not match authorized staff.", timestamp: new Date() }
                });
                await session.save();
                return res.status(400).json({ verified: false, error: "Fingerprint does not match authorized staff member." });
            }

            session.site_member_verified = true;
            session.site_member_verified_at = new Date();
            session.site_member_device_id = deviceId;

            // BOTH VERIFIED! Generate one-time tamper-proof authorization token
            const authToken = `AUTH_${crypto.randomBytes(24).toString("hex")}`;
            session.status = "AUTHORIZED";
            session.authorization_token = authToken;

            session.audit_trail.push({
                action: "SECOND_AUTH_FINGERPRINT_VERIFIED",
                performed_by: matchResult.subjectName,
                role: matchResult.subjectType,
                details: { subjectId: matchResult.subjectId, timestamp: new Date() }
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
                role: "member",
                driver_verified: true,
                site_member_verified: true,
                status: "AUTHORIZED",
                authorization_token: authToken,
                sessionId: session.transaction_id
            });
        }

    } catch (err) {
        console.error("Error in /advance-auth/verify-hardware:", err);
        res.status(500).json({ error: err.message });
    }
});

// ── 3. WebAuthn Generate Challenge (Driver or Site/Office Member) ─────────────────────
router.post("/challenge", async (req, res) => {
    try {
        const { sessionId, role } = req.body;
        if (!sessionId || !role || !["driver", "site_member", "office_member"].includes(role)) {
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

        // Sequential constraint: Driver MUST be verified before Member can be challenged
        if ((role === "site_member" || role === "office_member") && !session.driver_verified) {
            return res.status(400).json({ error: "Driver must be authenticated first before Member authentication." });
        }

        if (role === "driver") {
            // Locate or initialize driver profile in DriverBiometric / FingerprintEnrollment
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

        } else {
            // Office/Site Member authentication
            const memberUser = await User.findById(session.site_member_id || req.user?.userId);
            const validPasskeys = (memberUser?.passkeys || []).filter(k => k.credentialID);

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
                if (memberUser) {
                    memberUser.currentChallenge = options.challenge;
                    await memberUser.save();
                }
                await session.save();

                return res.json({ options, isRegistration: false });
            } else {
                const options = await generateRegistrationOptions({
                    rpName,
                    rpID,
                    userID: new Uint8Array(Buffer.from(memberUser?.email || `member_${session.site_member_name}`)),
                    userName: memberUser?.email || `${session.site_member_name} (Authorized Member)`,
                    authenticatorSelection: {
                        authenticatorAttachment: "platform",
                        userVerification: "required",
                        residentKey: "preferred"
                    }
                });

                session.site_member_challenge = options.challenge;
                if (memberUser) {
                    memberUser.currentChallenge = options.challenge;
                    await memberUser.save();
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

// ── 4. WebAuthn Verify Biometric Response ─────────────────────────────────────────────
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

                    // Also mirror into centralized FingerprintEnrollment collection
                    await FingerprintService.enroll({
                        subjectId: session.driver_id || undefined,
                        subjectType: "DRIVER",
                        subjectName: session.driver_name,
                        driverType: session.driver_type,
                        licenseNo: session.driver_license_no,
                        assignedVehicle: session.vehicle_number,
                        passkeyCredentialId: credential.id,
                        passkeyPublicKey: Buffer.from(credential.publicKey),
                        passkeyCounter: credential.counter,
                        rawTemplate: credential.id,
                        qualityScore: 95,
                        deviceId: "PLATFORM_WEBAUTHN",
                        enrolledBy: session.site_member_name,
                        enrolledPanel: session.panel_source
                    }).catch(e => console.warn("Mirror enrollment notice:", e.message));
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
            session.status = "DRIVER_VERIFIED";
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

        } else {
            if (!session.driver_verified) {
                return res.status(400).json({ error: "Driver must be verified first." });
            }

            const expectedChallenge = session.site_member_challenge;
            if (!expectedChallenge) {
                return res.status(400).json({ error: "No active challenge found for member." });
            }

            const memberUser = await User.findById(session.site_member_id || req.user?.userId);
            let verified = false;

            if (isRegistration) {
                const verification = await verifyRegistrationResponse({
                    response,
                    expectedChallenge,
                    expectedOrigin: expectedOrigins,
                    expectedRPID
                });
                verified = verification.verified;

                if (verified && verification.registrationInfo && memberUser) {
                    const { credential } = verification.registrationInfo;
                    memberUser.passkeys.push({
                        credentialID: credential.id,
                        credentialPublicKey: Buffer.from(credential.publicKey),
                        counter: credential.counter,
                        transports: credential.transports || response.response?.transports || ["internal"]
                    });
                    await memberUser.save();
                }
            } else {
                const passkey = memberUser?.passkeys?.find(p => p.credentialID === response.id);
                if (!passkey) return res.status(400).json({ error: "Staff member passkey not found." });

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
                if (verified && verification.authenticationInfo && memberUser) {
                    passkey.counter = verification.authenticationInfo.newCounter;
                    await memberUser.save();
                }
            }

            if (!verified) {
                session.audit_trail.push({
                    action: "SECOND_AUTH_VERIFICATION_FAILED",
                    performed_by: session.site_member_name,
                    role: session.second_auth_type,
                    details: { timestamp: new Date() }
                });
                await session.save();
                return res.status(400).json({ verified: false, error: "Staff fingerprint verification failed." });
            }

            session.site_member_verified = true;
            session.site_member_verified_at = new Date();
            session.site_member_challenge = null;

            // BOTH ARE NOW VERIFIED! Generate one-time tamper-proof authorization token
            const authToken = `AUTH_${crypto.randomBytes(24).toString("hex")}`;
            session.status = "AUTHORIZED";
            session.authorization_token = authToken;

            session.audit_trail.push({
                action: "SECOND_AUTH_FINGERPRINT_VERIFIED",
                performed_by: session.site_member_name,
                role: session.second_auth_type,
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

// ── 5. Query Session Status ──────────────────────────────────────────────────────────
router.get("/status/:sessionId", async (req, res) => {
    try {
        const session = await AdvanceBiometricAuthorization.findOne({ transaction_id: req.params.sessionId });
        if (!session) return res.status(404).json({ error: "Session not found" });

        res.json({
            sessionId: session.transaction_id,
            status: session.status,
            driver_id: session.driver_id,
            driver_name: session.driver_name,
            driver_type: session.driver_type,
            driver_verified: session.driver_verified,
            driver_verified_at: session.driver_verified_at,
            site_member_name: session.site_member_name,
            site_member_verified: session.site_member_verified,
            site_member_verified_at: session.site_member_verified_at,
            panel_source: session.panel_source,
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
