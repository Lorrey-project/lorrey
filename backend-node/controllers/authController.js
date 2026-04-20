const User = require("../models/User");
const jwt = require("jsonwebtoken");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

exports.signup = async (req, res) => {
    try {
        const { email, password, role = 'OFFICE', pumpName = null } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        // Validate pumpName for pump role
        if (role === 'PETROL PUMP' && !['SAS-1', 'SAS-2'].includes(pumpName)) {
            return res.status(400).json({ message: "Pump Admin must be assigned to SAS-1 or SAS-2" });
        }

        const user = new User({ email, password, role, pumpName: role === 'PETROL PUMP' ? pumpName : null });
        await user.save();

        const token = jwt.sign({ userId: user._id, role: user.role, pumpName: user.pumpName }, JWT_SECRET, { expiresIn: "1h" });

        res.status(201).json({ token, user: { id: user._id, email: user.email, role: user.role, pumpName: user.pumpName } });
    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: "Server error during signup", error: error.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password, role } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Role verification firewall
        if (role && user.role !== role) {
            return res.status(403).json({ message: `Unauthorized access: Cannot login to ${role} workspace.` });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign({ userId: user._id, role: user.role, pumpName: user.pumpName || null }, JWT_SECRET, { expiresIn: "1h" });

        res.json({ token, user: { id: user._id, email: user.email, role: user.role, pumpName: user.pumpName || null } });
    } catch (error) {
        res.status(500).json({ message: "Server error during login", error: error.message });
    }
};

const rpName = 'Lorrey App';
const rpID = 'localhost';

// GET /generate-registration-options
exports.generateRegOptions = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({error: "User not found"});

        if (!user.email) {
            return res.status(400).json({error: "User email is explicitly missing."});
        }

        const userPasskeys = user.passkeys.reduce((acc, passkey) => {
            if (passkey.credentialID) {
                acc.push({
                    id: passkey.credentialID,
                    type: 'public-key',
                    transports: passkey.transports || [],
                });
            }
            return acc;
        }, []);

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: new Uint8Array(Buffer.from(user.email)),
            userName: user.email,
            excludeCredentials: userPasskeys,
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
                authenticatorAttachment: 'platform',
            },
        });

        user.currentChallenge = options.challenge;
        await user.save();

        res.json(options);
    } catch(err) {
        console.error("GenRegOpts error:", err);
        res.status(500).json({error: err.message});
    }
};

// POST /verify-registration
exports.verifyRegResponse = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        const expectedChallenge = user.currentChallenge;
        const expectedOrigin = req.headers.origin;

        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response: req.body,
                expectedChallenge,
                expectedOrigin,
                expectedRPID: rpID,
            });
        } catch (error) {
            console.error("VerifyReg error 1:", error);
            return res.status(400).send({ error: error.message });
        }

        const { verified, registrationInfo } = verification;
        if (verified && registrationInfo) {
            const { credential } = registrationInfo;
            // Clear challenge
            user.currentChallenge = null;
            
            // Clean up any previously corrupted passkeys
            user.passkeys = user.passkeys.filter(p => p.credentialID);

            user.passkeys.push({
                credentialID: credential.id, // natively a base64url string in v10+
                credentialPublicKey: Buffer.from(credential.publicKey),
                counter: credential.counter,
                transports: credential.transports || req.body.response.transports || []
            });
            await user.save();
            return res.json({ verified: true });
        }
        res.status(400).json({ error: "Verification failed" });
    } catch(err) {
        console.error("VerifyReg error 2:", err);
        res.status(500).json({error: err.message});
    }
};

// POST /generate-authentication-options
exports.generateAuthOptions = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({email});
        if(!user) return res.status(404).json({error: "User not found"});

        const validPasskeys = user.passkeys.filter(k => k.credentialID);

        const options = await generateAuthenticationOptions({
            rpID,
            allowCredentials: validPasskeys.map(key => ({
                id: key.credentialID,
                type: 'public-key',
                transports: key.transports,
            })),
            userVerification: 'preferred',
        });

        user.currentChallenge = options.challenge;
        await user.save();

        res.json(options);
    } catch(err){
        console.error("GenAuthOpts error:", err);
        res.status(500).json({error: err.message});
    }
};

// POST /verify-authentication
exports.verifyAuthResponse = async (req, res) => {
    try {
        const { email, body, role } = req.body;
        const user = await User.findOne({email});
        if(!user) return res.status(404).json({error: "User not found"});

        // Role verification firewall (same as login)
        if (role && user.role !== role) {
            return res.status(403).json({ error: `Unauthorized access: Cannot login to ${role} workspace.` });
        }

        const expectedChallenge = user.currentChallenge;
        const expectedOrigin = req.headers.origin;

        const passkey = user.passkeys.find(k => k.credentialID === body.id);
        if(!passkey) return res.status(400).json({error: "Unregistered credential"});

        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: body,
                expectedChallenge,
                expectedOrigin,
                expectedRPID: rpID,
                credential: {
                    id: passkey.credentialID,
                    publicKey: new Uint8Array(passkey.credentialPublicKey),
                    counter: passkey.counter,
                    transports: passkey.transports,
                },
            });
        } catch (error) {
            console.error("VerifyAuth error 1:", error);
            return res.status(400).send({ error: error.message });
        }

        const { verified, authenticationInfo } = verification;
        if (verified) {
            passkey.counter = authenticationInfo.newCounter;
            user.currentChallenge = null;
            await user.save();

            const token = jwt.sign({ userId: user._id, role: user.role, pumpName: user.pumpName || null }, JWT_SECRET, { expiresIn: "10h" });
            return res.json({ verified: true, token, user: { id: user._id, email: user.email, role: user.role, pumpName: user.pumpName || null } });
        }
        res.status(400).json({ error: "Verification failed" });
    } catch(err){
        console.error("VerifyAuth error 2:", err);
        res.status(500).json({error: err.message});
    }
};
