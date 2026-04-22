import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        if (token && storedUser && storedUser !== 'undefined') {
            try {
                setUser(JSON.parse(storedUser));
                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            } catch (e) {
                console.error("Failed to parse stored user", e);
                localStorage.removeItem('user');
                localStorage.removeItem('token');
            }
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!user) return;
        
        const sendHeartbeat = () => {
            axios.post(`${API_URL}/system/heartbeat`).catch(err => console.error("Heartbeat failed:", err));
        };
        
        sendHeartbeat(); // Initial ping on login/load
        const intervalId = setInterval(sendHeartbeat, 60000); // 1-minute interval
        
        return () => clearInterval(intervalId);
    }, [user]);

    const signup = async (email, password, role, pumpName = null, name = '', registrationSecret = undefined) => {
        const response = await axios.post(`${API_URL}/auth/signup`, { email, password, role, pumpName, name, registrationSecret });
        const { token, user: newUser, pending, message } = response.data;

        // pending = true means the account is awaiting HO approval — do NOT log in
        if (pending) {
            return { pending: true, message };
        }

        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(newUser));
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUser(newUser);
        return newUser;
    };

    const login = async (email, password, role) => {
        const response = await axios.post(`${API_URL}/auth/login`, { email, password, role });
        const { token, user: loggedInUser } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(loggedInUser));
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUser(loggedInUser);
        return loggedInUser;
    };

    const loginWithToken = (token, loggedInUser) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(loggedInUser));
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setUser(loggedInUser);
        return loggedInUser;
    };

    const registerPasskey = async () => {
        try {
            // 1. Get options from server
            const { data: options } = await axios.get(`${API_URL}/auth/generate-registration-options`);
            
            // 2. Trigger browser registration ceremony
            const regResponse = await startRegistration({ optionsJSON: options });
            
            // 3. Verify with server
            const { data: verification } = await axios.post(`${API_URL}/auth/verify-registration`, regResponse);
            
            if (!verification.verified) throw new Error('Verification failed');
            return true;
        } catch (err) {
            console.error('Passkey registration failed:', err);
            throw err;
        }
    };

    const loginWithPasskey = async (email, role) => {
        try {
            // 1. Get auth options from server
            const { data: options } = await axios.post(`${API_URL}/auth/generate-authentication-options`, { email });
            
            // 2. Trigger browser authentication ceremony
            const authResponse = await startAuthentication({ optionsJSON: options });
            
            // 3. Verify with server
            const { data: response } = await axios.post(`${API_URL}/auth/verify-authentication`, {
                email,
                body: authResponse,
                role
            });

            if (response.verified && response.token) {
                loginWithToken(response.token, response.user);
                return response.user;
            }
            throw new Error('Authentication failed');
        } catch (err) {
            console.error('Passkey login failed:', err);
            throw err;
        }
    };

    const logout = async () => {
        // Signal the backend immediately so the portal shows "Offline" at once
        try {
            await axios.post(`${API_URL}/system/portal-logout`);
        } catch (e) {
            // Silently ignore — logout should still proceed if this fails
        }
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ 
            user, signup, login, loginWithToken, logout, loading,
            registerPasskey, loginWithPasskey 
        }}>
            {children}
        </AuthContext.Provider>
    );
};
