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

let initKeysPromise = null;

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
        if (initKeysPromise) return initKeysPromise;

        initKeysPromise = (async () => {
            // Attempt to load existing keypair from localStorage
            try {
                const currentUser = get().user;
                if (!currentUser) return null;

                const userPrivKeyStr = `e2ee_private_key_${currentUser._id}`;
                const userPubKeyStr = `e2ee_public_key_${currentUser._id}`;

                let storedPrivJwk = localStorage.getItem(userPrivKeyStr);
                let storedPubJwk = localStorage.getItem(userPubKeyStr);

                // NOTE: We intentionally do NOT migrate from the generic
                // 'e2ee_private_key_jwk' slot because that slot may contain
                // a DIFFERENT user's key (e.g. admin's key when user logs in
                // on the same browser). Cross-contaminating keys makes ALL
                // historical messages permanently undecryptable.

                if (storedPrivJwk && storedPubJwk) {
                    const privateKey = await importPrivateKey(storedPrivJwk);
                    set({ myPrivateKey: privateKey, myPublicKeyJwk: storedPubJwk });
                    return { privateKey, publicKeyJwk: storedPubJwk };
                } else {
                    // Generate new keypair securely scoped to this exact user
                    const keyPair = await generateKeyPair();
                    const pubKeyJwk = await exportPublicKey(keyPair.publicKey);
                    const privKeyJwk = await exportPrivateKey(keyPair.privateKey);

                    // Store ONLY in the per-user slots (never the generic slot)
                    localStorage.setItem(userPrivKeyStr, privKeyJwk);
                    localStorage.setItem(userPubKeyStr, pubKeyJwk);

                    set({ myPrivateKey: keyPair.privateKey, myPublicKeyJwk: pubKeyJwk });
                    return { privateKey: keyPair.privateKey, publicKeyJwk: pubKeyJwk };
                }
            } catch (err) {
                console.error('[E2EE] Failed to initialize keypair:', err);
                return null;
            }
        })();

        try {
            return await initKeysPromise;
        } finally {
            initKeysPromise = null;
        }
    },

    _uploadPublicKey: async (publicKeyJwk) => {
        try {
            // CRITICAL: Only upload if the server does NOT already have a key.
            // Overwriting an existing server key breaks ALL historical messages
            // because the ECDH shared secret changes.
            const currentUser = get().user;
            if (!currentUser) return;
            const checkRes = await fetch(`${BACKEND_URL}/api/auth/keys/${currentUser._id}`, {
                credentials: 'include'
            });
            if (checkRes.ok) {
                // Server already has a public key — do NOT overwrite it
                return;
            }
            // Server has no key (404) — safe to upload for the first time
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

            // Non-blocking: fire E2EE key init in background so login navigation is instant
            get()._initE2EEKeys().then(keys => {
                if (keys) get()._uploadPublicKey(keys.publicKeyJwk);
            });

            return true;
        } catch (err) {
            console.error(err);
            if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
                throw new Error('Failed to fetch');
            }
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

            // Non-blocking: fire E2EE key init in background so registration navigation is instant
            get()._initE2EEKeys().then(keys => {
                if (keys) get()._uploadPublicKey(keys.publicKeyJwk);
            });

            return true;
        } catch (err) {
            console.error(err);
            if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
                throw new Error('Failed to fetch');
            }
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
            localStorage.removeItem('chatapp-offline-cache'); // Force clear persistent cache on logout
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
            const res = await fetch(`${BACKEND_URL}/api/auth/me`, { credentials: 'include' });
            if (!res.ok) {
                Cookies.remove('token');
                set({ user: null, isCheckingAuth: false });
                return;
            }
            const data = await res.json();
            set({ user: data, isCheckingAuth: false });

            get().connectSocket();
            get()._initE2EEKeys().then(keys => {
                if (keys) get()._uploadPublicKey(keys.publicKeyJwk);
            });
        } catch (err) {
            console.error(err);
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
            // DO NOT clear encryption cache here. The ECDH shared secret is
            // deterministic for a given key pair. Clearing it forces re-derivation
            // which, if the other user's key pair changed, produces the WRONG key
            // and makes ALL old messages undecryptable.
        });

        socket.on('user_status', ({ userId, status, lastSeen }) => {
            if (status === 'online') {
                set((state) => ({ onlineUsers: [...new Set([...state.onlineUsers, userId])] }));
                // DO NOT clear encryption cache on online status changes.
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
