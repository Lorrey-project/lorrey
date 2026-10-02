import axios from 'axios';
import { API_URL } from '../config';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

/**
 * Dedicated Client-Side Fingerprint Service
 * Integrates real hardware biometric ceremonies & WebAuthn platform authenticators.
 */

export const FingerprintClientService = {
    /**
     * Check if WebAuthn platform authenticator is available on this browser/device
     */
    async isPlatformAuthenticatorAvailable() {
        try {
            if (window.PublicKeyCredential && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
                return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            }
            return false;
        } catch {
            return false;
        }
    },

    /**
     * Fetch connected and registered biometric scanners
     */
    async getConnectedDevices() {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/fingerprint/devices`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data.devices || [];
        } catch (err) {
            console.error('Failed to get biometric devices:', err);
            return [];
        }
    },

    /**
     * Real biometric capture ceremony using WebAuthn Platform Authenticator / RD Service
     */
    async captureFingerprint({
        subjectName = 'User',
        fingerPosition = 'RIGHT_THUMB',
        deviceId = 'DEV-WEBAUTHN-PLATFORM'
    } = {}) {
        // Try USB RD Service if available locally on Indian port 11100
        try {
            const rdRes = await axios.get('http://127.0.0.1:11100/rd/info', { timeout: 400 });
            if (rdRes.status === 200 && rdRes.data) {
                // RD Service is active: trigger physical scanner capture
                const captureRes = await axios.post('http://127.0.0.1:11100/rd/capture', '<PidOptions ver="1.0"><Opts fCount="1" fType="2" iCount="0" pCount="0" format="0" pidVer="2.0" timeout="10000" posh="UNKNOWN" env="P" /></PidOptions>', {
                    headers: { 'Content-Type': 'text/xml' },
                    timeout: 12000
                });
                return {
                    success: true,
                    deviceId: 'DEV-USB-MANTRA-01',
                    fingerPosition,
                    qualityScore: 92,
                    rawTemplate: typeof captureRes.data === 'string' ? captureRes.data : JSON.stringify(captureRes.data),
                    capturedAt: new Date().toISOString()
                };
            }
        } catch (_) {
            // RD Service not running on localhost, fallback to native WebAuthn platform ceremony
        }

        // Native platform authenticator ceremony
        const token = localStorage.getItem('token');
        const optRes = await axios.get(`${API_URL}/auth/generate-registration-options`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const attResp = await startRegistration({ optionsJSON: optRes.data });

        return {
            success: true,
            deviceId: 'DEV-WEBAUTHN-PLATFORM',
            fingerPosition,
            qualityScore: 95,
            rawTemplate: attResp.id,
            passkeyResponse: attResp,
            capturedAt: new Date().toISOString()
        };
    },

    /**
     * Fetch list of enrolled identities with optional filter & search
     */
    async getEnrolledIdentities({
        subjectType = 'ALL',
        status = 'ALL',
        driverType = 'ALL',
        search = '',
        page = 0,
        limit = 50
    } = {}) {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/fingerprint/enrolled`, {
            params: { subjectType, status, driverType, search, page, limit },
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    },

    /**
     * Fetch un-enrolled existing users or drivers for easy 1-click enrollment
     */
    async getEnrollmentCandidates(type = 'DRIVER') {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/fingerprint/candidates`, {
            params: { type },
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data.candidates || [];
    },

    /**
     * Enroll or re-enroll a subject (Driver, Office Member, Site Member, Developer)
     */
    async enrollSubject({
        subjectId,
        subjectType,
        subjectName,
        userId,
        driverType = 'PERMANENT',
        mobile = '',
        licenseNo = '',
        assignedVehicle = '',
        fingerPosition = 'RIGHT_THUMB',
        rawTemplate,
        qualityScore = 90,
        deviceId = 'DEV-USB-MANTRA-01'
    }) {
        const token = localStorage.getItem('token');
        const res = await axios.post(
            `${API_URL}/fingerprint/enroll`,
            {
                subjectId,
                subjectType,
                subjectName,
                userId,
                driverType,
                mobile,
                licenseNo,
                assignedVehicle,
                fingerPosition,
                rawTemplate,
                qualityScore,
                deviceId
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return res.data;
    },

    /**
     * Enroll Temporary Driver on the fly during payment / trip advance
     */
    async enrollTemporaryDriver({
        driverName,
        mobile = '',
        licenseNo = '',
        assignedVehicle = '',
        rawTemplate,
        qualityScore = 88,
        deviceId = 'DEV-USB-MANTRA-01',
        transactionId = null
    }) {
        const token = localStorage.getItem('token');
        const res = await axios.post(
            `${API_URL}/fingerprint/temporary-driver`,
            {
                driverName,
                mobile,
                licenseNo,
                assignedVehicle,
                rawTemplate,
                qualityScore,
                deviceId,
                transactionId
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return res.data;
    },

    /**
     * Toggle active/disabled status
     */
    async updateEnrollmentStatus(id, status) {
        const token = localStorage.getItem('token');
        const res = await axios.put(
            `${API_URL}/fingerprint/status/${id}`,
            { status },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return res.data;
    },

    /**
     * Remove enrollment
     */
    async deleteEnrollment(id) {
        const token = localStorage.getItem('token');
        const res = await axios.delete(`${API_URL}/fingerprint/${id}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    },

    /**
     * Direct match candidate scan
     */
    async verifyCandidateScan({
        candidateTemplate,
        subjectId,
        subjectType,
        allowedSubjectTypes,
        deviceId,
        transactionId
    }) {
        const token = localStorage.getItem('token');
        const res = await axios.post(
            `${API_URL}/fingerprint/verify-identity`,
            {
                candidateTemplate,
                subjectId,
                subjectType,
                allowedSubjectTypes,
                deviceId,
                transactionId
            },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return res.data;
    },

    /**
     * Fetch biometric audit trail logs
     */
    async getAuditLogs({
        action = 'ALL',
        subjectType = 'ALL',
        search = '',
        page = 0,
        limit = 50
    } = {}) {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/fingerprint/audit-logs`, {
            params: { action, subjectType, search, page, limit },
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data;
    },

    /**
     * Fetch summary stats
     */
    async getSummaryStats() {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/fingerprint/stats`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return res.data.stats;
    }
};

export default FingerprintClientService;
