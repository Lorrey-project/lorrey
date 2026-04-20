const fs = require('fs');
const { execSync } = require('child_process');
const os = require('os');

function getIPAddress() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return '127.0.0.1';
}

function getLocalHostname() {
    try {
        return execSync('scutil --get LocalHostName').toString().trim() + '.local';
    } catch {
        return os.hostname() + '.local';
    }
}

const currentIP   = getIPAddress();
const localDomain = getLocalHostname();   // e.g. Gourabs-MacBook-Air.local

console.log(`Detected IP      : ${currentIP}`);
console.log(`Detected hostname: ${localDomain}`);
console.log('');

try {
    console.log('Generating SSL certificates (valid for IP, .local, and localhost)...');

    // SAN must include both IP and DNS names for Chrome/Safari
    const san = [
        `IP:${currentIP}`,
        `IP:127.0.0.1`,
        `DNS:localhost`,
        `DNS:${localDomain}`,
    ].join(', ');

    const cmd = [
        'openssl req -x509 -newkey rsa:2048',
        '-keyout key.pem -out cert.pem',
        '-days 365 -nodes',
        `-subj "/CN=${localDomain}"`,
        `-addext "subjectAltName = ${san}"`,
    ].join(' ');

    execSync(cmd);
    console.log('SUCCESS: cert.pem and key.pem generated.\n');

    // Paths
    const backendPath  = './backend-node/';
    const frontendPath = './frontend/review-dashboard/UI2/';

    if (fs.existsSync(backendPath)) {
        fs.copyFileSync('key.pem', backendPath + 'key.pem');
        fs.copyFileSync('cert.pem', backendPath + 'cert.pem');
        console.log('✓ Copied to backend-node/');
    }

    if (fs.existsSync(frontendPath)) {
        fs.copyFileSync('key.pem', frontendPath + 'key.pem');
        fs.copyFileSync('cert.pem', frontendPath + 'cert.pem');
        console.log('✓ Copied to frontend/review-dashboard/UI2/');
    }

    console.log('\n─────────────────────────────────────────────────');
    console.log('ACCESS THE APP VIA (for biometrics to work):');
    console.log(`  https://${localDomain}:5173  ← OFFICE PORTAL`);
    console.log(`  https://${localDomain}:5174  ← SITE PORTAL`);
    console.log(`  https://${localDomain}:5175  ← SAS-1 PUMP`);
    console.log(`  https://${localDomain}:5176  ← SAS-2 PUMP`);
    console.log('─────────────────────────────────────────────────');
    console.log('You can also still access via IP (biometrics will NOT work on IP):');
    console.log(`  https://${currentIP}:5173`);
    console.log('─────────────────────────────────────────────────');
    console.log('\nIMPORTANT: First visit, click "Advanced" → "Proceed" to trust the cert.');

} catch (err) {
    console.error('Failed to generate certs:', err.message);
}
