const { generateRegistrationOptions } = require('@simplewebauthn/server');

async function run() {
    try {
        const options = await generateRegistrationOptions({
            rpName: 'Lorrey App',
            rpID: 'localhost',
            userID: new Uint8Array(Buffer.from('test@example.com')),
            userName: 'test@example.com',
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
                authenticatorAttachment: 'platform',
            },
        });
        console.log("Success!");
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
