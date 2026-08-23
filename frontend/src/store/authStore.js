import { create } from 'zustand';
import { io } from 'socket.io-client';
import Cookies from 'js-cookie';
import { useProjectStore } from './projectStore';
import { useChatStore, clearUserEncryptionCache } from './chatStore';
import {
    generateKeyPair,
    exportPublicKey,
    exportPrivateKey,
    importPrivateKey
} from '../utils/cryptoUtils';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const PRIVATE_KEY_STORAGE_KEY = 'e2ee_private_key_jwk';

export const useAuthStore = create((set, get) => ({
    user: null,
    socket: null,
    isCheckingAuth: true,
    onlineUsers: [],
    lastSeenMap: {},

    // E2EE key pair for this session
    myPrivateKey: null, // CryptoKey (in-memory only, not stored in state permanently)
    myPublicKeyJwk: null, // JWK string (for sharing with backend)

    _initE2EEKeys: async () => {
        // Attempt to load existing keypair from localStorage
        try {
            const storedPrivJwk = localStorage.getItem(PRIVATE_KEY_STORAGE_KEY);
            const storedPubJwk = localStorage.getItem('e2ee_public_key_jwk');
            if (storedPrivJwk && storedPubJwk) {
                const privateKey = await importPrivateKey(storedPrivJwk);
                set({ myPrivateKey: privateKey, myPublicKeyJwk: storedPubJwk });
                return { privateKey, publicKeyJwk: storedPubJwk };
            } else {
                // Generate new keypair
                const keyPair = await generateKeyPair();
                const pubKeyJwk = await exportPublicKey(keyPair.publicKey);
                const privKeyJwk = await exportPrivateKey(keyPair.privateKey);
                localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, privKeyJwk);
                localStorage.setItem('e2ee_public_key_jwk', pubKeyJwk);
                set({ myPrivateKey: keyPair.privateKey, myPublicKeyJwk: pubKeyJwk });
                return { privateKey: keyPair.privateKey, publicKeyJwk: pubKeyJwk };
            }
        } catch (err) {
            console.error('[E2EE] Failed to initialize keypair:', err);
            return null;
        }
    },

    _uploadPublicKey: async (publicKeyJwk) => {
        try {
            await fetch(`${BACKEND_URL}/api/auth/keys/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ publicKey: publicKeyJwk })
            });
        } catch (err) {
            console.error('[E2EE] Failed to upload public key:', err);
        }
    },

    login: async (credentials, isAdmin = false) => {
        try {
            const endpoint = isAdmin ? '/api/auth/admin/login' : '/api/auth/user/login';
            const res = await fetch(`${BACKEND_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(credentials)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            set({ user: data });
            get().connectSocket();

            // Generate and upload E2EE keys after login
            const keys = await get()._initE2EEKeys();
            if (keys) {
                await get()._uploadPublicKey(keys.publicKeyJwk);
            }

            return true;
        } catch (err) {
            console.error(err);
            throw err;
        }
    },
    registerAdmin: async (credentials) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/auth/admin/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(credentials)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            set({ user: data });
            get().connectSocket();

            // Generate and upload E2EE keys after registration
            const keys = await get()._initE2EEKeys();
            if (keys) {
                await get()._uploadPublicKey(keys.publicKeyJwk);
            }

            return true;
        } catch (err) {
            console.error(err);
            throw err;
        }
    },
    logout: async (isUnload = false) => {
        try {
            await fetch(`${BACKEND_URL}/api/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                keepalive: isUnload
            });
            const socket = get().socket;
            if (socket) socket.disconnect();
            set({ user: null, socket: null, onlineUsers: [], myPrivateKey: null, myPublicKeyJwk: null });
            Cookies.remove('token');
            // Note: we intentionally keep the private key in localStorage for session resumption
            // but it regenerates each login anyway (ephemeral design)

            import('../utils/pushService').then(({ unsubscribeFromPushNotifications }) => {
                unsubscribeFromPushNotifications();
            });
        } catch (err) {
            console.error(err);
        }
    },
    checkAuth: async () => {
        try {
            // Force logout on every reload/new tab to require re-login
            await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
            Cookies.remove('token');
        } catch (err) {
            console.error(err);
        } finally {
            set({ user: null, isCheckingAuth: false });
        }
    },
    connectSocket: () => {
        const user = get().user;
        if (get().socket) return; // Prevent multiple socket initializations

        const socket = io(BACKEND_URL, {
            query: { userId: user._id },
            autoConnect: false // Explicitly disable autoConnect to attach listeners first
        });

        socket.on('connect', () => {
            socket.emit('join', user._id);
        });

        socket.on('initial_online_users', (userIds) => {
            set({ onlineUsers: userIds });
            userIds.forEach(id => clearUserEncryptionCache(id));
        });

        socket.on('user_status', ({ userId, status, lastSeen }) => {
            if (status === 'online') {
                set((state) => ({ onlineUsers: [...new Set([...state.onlineUsers, userId])] }));
                clearUserEncryptionCache(userId);
            } else {
                set((state) => {
                    const newStatus = { onlineUsers: state.onlineUsers.filter(id => id !== userId) };
                    if (lastSeen) {
                        newStatus.lastSeenMap = { ...state.lastSeenMap, [userId]: lastSeen };
                    }
                    return newStatus;
                });
                if (lastSeen) {
                    useProjectStore.getState().updateCollaboratorLastSeen(userId, lastSeen);
                }
            }
        });

        socket.on('user:removed', () => {
            alert('Your account has been removed by the administrator.');
            get().logout();
        });

        socket.connect(); // Connect AFTER listeners are attached
        set({ socket });
    }
}));
