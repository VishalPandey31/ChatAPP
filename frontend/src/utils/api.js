/**
 * Resilient API Fetch Helper for ChatApp
 * Ensures both httpOnly cookie credentials AND Authorization Bearer header
 * are attached to every request, preventing cross-site cookie dropouts.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
// Immediately purge any legacy persistent token so site always demands credentials on open
try {
    localStorage.removeItem('token');
} catch (e) {}

export const getAuthToken = () => {
    try {
        // Scoped to active browser session/tab only - cleared when tab/browser closes
        return sessionStorage.getItem('token') || '';
    } catch {
        return '';
    }
};

export const setAuthToken = (token) => {
    try {
        if (token) {
            sessionStorage.setItem('token', token);
        } else {
            sessionStorage.removeItem('token');
        }
        localStorage.removeItem('token');
    } catch (e) {
        console.warn('Could not persist auth token', e);
    }
};

export const apiFetch = async (endpoint, options = {}) => {
    const url = endpoint.startsWith('http') ? endpoint : `${BACKEND_URL}${endpoint}`;
    const token = getAuthToken();

    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Default 15s timeout to prevent hanging mobile requests
    const timeoutMs = options.timeout || 15000;
    let timeoutId;
    let signal = options.signal;

    if (!signal && timeoutMs > 0) {
        const controller = new AbortController();
        signal = controller.signal;
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    try {
        const response = await fetch(url, {
            credentials: 'include',
            ...options,
            signal,
            headers
        });
        if (timeoutId) clearTimeout(timeoutId);
        return response;
    } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        throw err;
    }
};

export default apiFetch;
