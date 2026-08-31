import { create } from 'zustand';
import { io } from 'socket.io-client';
import Cookies from 'js-cookie';
import { useProjectStore } from './projectStore';
import { useChatStore, clearUserEncryptionCache } from './chatStore';
import {
    generateKeyPair,
    exportPublicKey,
    importPublicKey,
    exportPrivateKey,
    importPrivateKey,
    generateKeyId
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

                const keyRingKey = `e2ee_keys_${currentUser._id}`;
                let storedKeyRing = null;
                try {
                    const raw = localStorage.getItem(keyRingKey);
                    if (raw) storedKeyRing = JSON.parse(raw);
                } catch (e) {
                    console.warn('Failed to parse E2EE key ring', e);
                }

                // Temporary backward compatibility for existing unversioned keys
                const legacyPrivStr = `e2ee_private_key_${currentUser._id}`;
                const legacyPubStr = `e2ee_public_key_${currentUser._id}`;
                let legacyPrivJwk = localStorage.getItem(legacyPrivStr);
                let legacyPubJwk = localStorage.getItem(legacyPubStr);

                if (!storedKeyRing) {
                    storedKeyRing = { currentKeyId: null, keys: {} };
                }

                // If no current key exists, BUT legacy exists, migrate it into ring as "legacy"
                if (!storedKeyRing.currentKeyId && legacyPrivJwk && legacyPubJwk) {
                    storedKeyRing.currentKeyId = 'legacy';
                    storedKeyRing.keys['legacy'] = {
                        privateKeyJwk: legacyPrivJwk,
                        publicKeyJwk: legacyPubJwk
                    };
                    localStorage.setItem(keyRingKey, JSON.stringify(storedKeyRing));
                }

                if (storedKeyRing.currentKeyId && storedKeyRing.keys[storedKeyRing.currentKeyId]) {
                    const activePair = storedKeyRing.keys[storedKeyRing.currentKeyId];
                    const privateKey = await importPrivateKey(activePair.privateKeyJwk);
                    set({
                        myPrivateKey: privateKey,
                        myPublicKeyJwk: activePair.publicKeyJwk,
                        myCurrentKeyId: storedKeyRing.currentKeyId,
                        myKeyRing: storedKeyRing
                    });
                    return { privateKey, publicKeyJwk: activePair.publicKeyJwk, keyId: storedKeyRing.currentKeyId };
                } else {
                    // Generate new keypair securely scoped to this exact user
                    const keyPair = await generateKeyPair();
                    const pubKeyJwk = await exportPublicKey(keyPair.publicKey);
                    const privKeyJwk = await exportPrivateKey(keyPair.privateKey);
                    const newKeyId = generateKeyId();

                    storedKeyRing.currentKeyId = newKeyId;
                    storedKeyRing.keys[newKeyId] = {
                        privateKeyJwk: privKeyJwk,
                        publicKeyJwk: pubKeyJwk
                    };

                    localStorage.setItem(keyRingKey, JSON.stringify(storedKeyRing));

                    set({
                        myPrivateKey: keyPair.privateKey,
                        myPublicKeyJwk: pubKeyJwk,
                        myCurrentKeyId: newKeyId,
                        myKeyRing: storedKeyRing
                    });
                    return { privateKey: keyPair.privateKey, publicKeyJwk: pubKeyJwk, keyId: newKeyId };
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

    _uploadPublicKey: async (keyData) => {
        try {
            // keyData = { publicKeyJwk, keyId }
            await fetch(`${BACKEND_URL}/api/auth/keys/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    publicKey: keyData.publicKeyJwk,
                    keyId: keyData.keyId
                })
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
                if (keys && keys.keyId) get()._uploadPublicKey(keys);
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
                if (keys && keys.keyId) get()._uploadPublicKey(keys);
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
