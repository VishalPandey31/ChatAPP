/**
 * Resilient API Fetch Helper for ChatApp
 * Ensures both httpOnly cookie credentials AND Authorization Bearer header
 * are attached to every request, preventing cross-site cookie dropouts.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const getAuthToken = () => {
    try {
        return localStorage.getItem('token') || '';
    } catch {
        return '';
    }
};

export const setAuthToken = (token) => {
    try {
        if (token) {
            localStorage.setItem('token', token);
        } else {
            localStorage.removeItem('token');
        }
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

    const response = await fetch(url, {
        credentials: 'include',
        ...options,
        headers
    });

    return response;
};

export default apiFetch;
