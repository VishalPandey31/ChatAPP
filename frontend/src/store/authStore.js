import { create } from 'zustand';
import { io } from 'socket.io-client';
import Cookies from 'js-cookie';
import { useProjectStore } from './projectStore';
import { useChatStore, clearUserEncryptionCache } from './chatStore';
import { apiFetch, setAuthToken, getAuthToken } from '../utils/api';
import {
    generateKeyPair,
    exportPublicKey,
    importPublicKey,
    exportPrivateKey,
    importPrivateKey,
    generateKeyId,
    deriveBackupKey,
    encryptMessage,
    decryptMessage,
    bufferToBase64,
    base64ToBuffer
} from '../utils/cryptoUtils';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
let initKeysPromise = null;

export const useAuthStore = create((set, get) => ({
    user: null,
    socket: null,
    isCheckingAuth: true,
    onlineUsers: [],
    lastSeenMap: {},

    // Face Biometrics & Couple Anti-Snatch State
    faceProfile: null,
    isSecurityLocked: false,
    lockReason: null,
    isFaceEnrolling: false,
    showFaceSetupModal: false,
    antiSnatchActive: (sessionStorage.getItem('chatapp_security_mode') || 'face_login') !== 'none',
    securityMode: sessionStorage.getItem('chatapp_security_mode') || 'face_login', // 'face_login' | 'face_youtube' | 'none'

    setSecurityMode: (mode) => {
        try {
            sessionStorage.setItem('chatapp_security_mode', mode);
        } catch (e) {}
        set({ securityMode: mode, antiSnatchActive: mode !== 'none' });
    },
    setSecurityLocked: (locked, reason = null) => set({ isSecurityLocked: locked, lockReason: reason }),
    setShowFaceSetupModal: (show) => set({ showFaceSetupModal: show }),
    setAntiSnatchActive: (active) => set({ antiSnatchActive: active }),

    fetchFaceProfile: async () => {
        try {
            const res = await apiFetch('/api/auth/face/profile');
            if (res.ok) {
                const data = await res.json();
                set({
                    faceProfile: data,
                    antiSnatchActive: data.antiSnatchProtection !== false
                });
                return data;
            }
        } catch (e) {
            console.error('[FaceBio] Error fetching face profile:', e);
        }
        return null;
    },

    saveFaceProfile: async (descriptor, eyeRatioBaseline = 0.2) => {
        try {
            const res = await apiFetch('/api/auth/face/register', {
                method: 'POST',
                body: JSON.stringify({ descriptor, eyeRatioBaseline })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to save face profile');
            
            // Update local user and faceProfile state
            const currentProfile = {
                isConfigured: true,
                descriptor,
                enrolledAt: data.enrolledAt || new Date().toISOString(),
                eyeRatioBaseline,
                antiSnatchProtection: true
            };
            set(state => ({
                faceProfile: currentProfile,
                antiSnatchActive: true,
                user: state.user ? { ...state.user, faceProfile: currentProfile } : state.user
            }));
            return data;
        } catch (e) {
            console.error('[FaceBio] Error saving face profile:', e);
            throw e;
        }
    },

    deleteFaceProfile: async () => {
        try {
            const res = await apiFetch('/api/auth/face/profile', { method: 'DELETE' });
            if (res.ok) {
                set(state => ({
                    faceProfile: { isConfigured: false, descriptor: [] },
                    user: state.user ? { ...state.user, faceProfile: { isConfigured: false } } : state.user
                }));
            }
        } catch (e) {
            console.error('[FaceBio] Error deleting face profile:', e);
        }
    },

    unlockWithPassword: async (password) => {
        try {
            const res = await apiFetch('/api/auth/face/unlock-password', {
                method: 'POST',
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Incorrect password');
            set({ isSecurityLocked: false, lockReason: null });

            try {
                sessionStorage.setItem('e2ee_session_pw', password);
                if (get().user?.email) {
                    sessionStorage.setItem('e2ee_session_email', get().user.email.toLowerCase().trim());
                }
                get().restoreKeyRingWithPassword(password).catch(() => {});
            } catch (e) {}

            return true;
        } catch (e) {
            console.error('[FaceBio] Password unlock failed:', e);
            throw e;
        }
    },

    // E2EE key pair for this session
    myPrivateKey: null, // CryptoKey (in-memory only, not stored in state permanently)
    myPublicKeyJwk: null, // JWK string (for sharing with backend)

    hasPendingCloudBackupUnlock: false,

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

                // Comprehensive backward compatibility for existing unversioned keys
                const legacyPrivStr = `e2ee_private_key_${currentUser._id}`;
                const legacyPubStr = `e2ee_public_key_${currentUser._id}`;
                let legacyPrivJwk = localStorage.getItem(legacyPrivStr) || localStorage.getItem('e2ee_private_key_jwk');
                let legacyPubJwk = localStorage.getItem(legacyPubStr) || localStorage.getItem('e2ee_public_key_jwk');

                if (!storedKeyRing) {
                    storedKeyRing = { currentKeyId: null, keys: {} };
                }
                if (!storedKeyRing.keys) {
                    storedKeyRing.keys = {};
                }

                // Always ensure historical legacy keys are preserved in the ring
                if (legacyPrivJwk && legacyPubJwk) {
                    if (!storedKeyRing.keys['legacy']) {
                        storedKeyRing.keys['legacy'] = {
                            privateKeyJwk: legacyPrivJwk,
                            publicKeyJwk: legacyPubJwk
                        };
                    }
                    if (!storedKeyRing.currentKeyId) {
                        storedKeyRing.currentKeyId = 'legacy';
                    }
                    localStorage.setItem(keyRingKey, JSON.stringify(storedKeyRing));
                }

                // SECURE ZERO-KNOWLEDGE MERGE: Always attempt to fetch and merge cloud backup if we have the password
                let hasServerBackup = false;
                try {
                    const res = await apiFetch('/api/auth/keys/backup');
                    if (res.ok) {
                        const backupData = await res.json();
                        if (backupData.encryptedKeyRing && typeof backupData.encryptedKeyRing === 'string' && backupData.encryptedKeyRing !== '[object Object]') {
                            hasServerBackup = true;
                            const sessionPw = window.__tempLoginPassword || sessionStorage.getItem('e2ee_session_pw');
                            const sessionEmail = (window.__tempLoginEmail || sessionStorage.getItem('e2ee_session_email') || currentUser.email || '').toLowerCase().trim();

                            if (sessionPw && sessionEmail) {
                                try {
                                    const deriveKey = await deriveBackupKey(sessionPw, sessionEmail);
                                    const decryptedRaw = await decryptMessage(backupData.encryptedKeyRing, backupData.encryptedKeyRingIv, deriveKey);
                                    const restoredRing = JSON.parse(decryptedRaw);

                                    // Merge cloud keys into local key ring so no history is lost
                                    let merged = false;
                                    for (const [kId, kData] of Object.entries(restoredRing.keys || {})) {
                                        if (!storedKeyRing.keys[kId]) {
                                            storedKeyRing.keys[kId] = kData;
                                            merged = true;
                                        }
                                    }
                                    // If local didn't have a current key but cloud did, adopt it
                                    if (!storedKeyRing.currentKeyId && restoredRing.currentKeyId) {
                                        storedKeyRing.currentKeyId = restoredRing.currentKeyId;
                                        merged = true;
                                    }
                                    if (merged) {
                                        localStorage.setItem(keyRingKey, JSON.stringify(storedKeyRing));
                                        console.log('[E2EE] Successfully restored and merged cloud keys into local ring');
                                    }
                                    set({ hasPendingCloudBackupUnlock: false });
                                } catch (decErr) {
                                    console.warn('[E2EE] Failed to decrypt cloud key backup with session password', decErr);
                                    set({ hasPendingCloudBackupUnlock: true });
                                }
                            } else {
                                set({ hasPendingCloudBackupUnlock: true });
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[E2EE] Failed checking/restoring backup from cloud', e);
                }

                // If currentKeyId is missing but we have keys, adopt the newest available key
                if (!storedKeyRing.currentKeyId && Object.keys(storedKeyRing.keys).length > 0) {
                    const availableIds = Object.keys(storedKeyRing.keys);
                    storedKeyRing.currentKeyId = availableIds[availableIds.length - 1];
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

                    // Non-blocking background backup update if credentials available
                    const sessionPw = window.__tempLoginPassword || sessionStorage.getItem('e2ee_session_pw');
                    const sessionEmail = (window.__tempLoginEmail || sessionStorage.getItem('e2ee_session_email') || currentUser.email || '').toLowerCase().trim();
                    if (sessionPw && sessionEmail) {
                        get()._backupEncryptedKeyRing(storedKeyRing, sessionPw, sessionEmail);
                    }

                    initKeysPromise = null;
                    return { privateKey, publicKeyJwk: activePair.publicKeyJwk, keyId: storedKeyRing.currentKeyId };
                }

                // If server has backup but local has no keys and no password available
                if (hasServerBackup && Object.keys(storedKeyRing.keys).length === 0) {
                    console.warn('[E2EE] Server has backup but password needed to unlock. Retaining session and prompting for unlock.');
                    set({ hasPendingCloudBackupUnlock: true });
                }

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

                // Since it's a completely new key, attempt background backup IF we have credentials
                const sessionPw = window.__tempLoginPassword || sessionStorage.getItem('e2ee_session_pw');
                const sessionEmail = (window.__tempLoginEmail || sessionStorage.getItem('e2ee_session_email') || currentUser.email || '').toLowerCase().trim();
                if (sessionPw && sessionEmail) {
                    get()._backupEncryptedKeyRing(storedKeyRing, sessionPw, sessionEmail);
                }

                initKeysPromise = null;
                return { privateKey: keyPair.privateKey, publicKeyJwk: pubKeyJwk, keyId: newKeyId };
            } catch (err) {
                console.error('[E2EE] Failed to initialize keys:', err);
                initKeysPromise = null;
                return null;
            }
        })();

        return initKeysPromise;
    },

    restoreKeyRingWithPassword: async (password) => {
        const currentUser = get().user;
        if (!currentUser || !password) throw new Error('Password is required');
        const cleanEmail = (currentUser.email || '').toLowerCase().trim();
        try {
            const res = await apiFetch('/api/auth/keys/backup');
            if (!res.ok) throw new Error('No backup available on server');
            const backupData = await res.json();
            if (!backupData.encryptedKeyRing) throw new Error('No backup key ring found');

            const deriveKey = await deriveBackupKey(password, cleanEmail);
            const decryptedRaw = await decryptMessage(backupData.encryptedKeyRing, backupData.encryptedKeyRingIv, deriveKey);
            const restoredRing = JSON.parse(decryptedRaw);

            const keyRingKey = `e2ee_keys_${currentUser._id}`;
            let storedKeyRing = { currentKeyId: null, keys: {} };
            try {
                const raw = localStorage.getItem(keyRingKey);
                if (raw) storedKeyRing = JSON.parse(raw);
            } catch (e) {}
            if (!storedKeyRing.keys) storedKeyRing.keys = {};

            let merged = false;
            for (const [kId, kData] of Object.entries(restoredRing.keys || {})) {
                if (!storedKeyRing.keys[kId]) {
                    storedKeyRing.keys[kId] = kData;
                    merged = true;
                }
            }
            if (!storedKeyRing.currentKeyId && restoredRing.currentKeyId) {
                storedKeyRing.currentKeyId = restoredRing.currentKeyId;
                merged = true;
            }

            localStorage.setItem(keyRingKey, JSON.stringify(storedKeyRing));
            try {
                sessionStorage.setItem('e2ee_session_pw', password);
                sessionStorage.setItem('e2ee_session_email', cleanEmail);
            } catch (e) {}

            const activeKeyId = storedKeyRing.currentKeyId || Object.keys(storedKeyRing.keys)[0];
            if (activeKeyId && storedKeyRing.keys[activeKeyId]) {
                const privateKey = await importPrivateKey(storedKeyRing.keys[activeKeyId].privateKeyJwk);
                set({
                    myPrivateKey: privateKey,
                    myPublicKeyJwk: storedKeyRing.keys[activeKeyId].publicKeyJwk,
                    myCurrentKeyId: activeKeyId,
                    myKeyRing: storedKeyRing,
                    hasPendingCloudBackupUnlock: false
                });
            }

            // Immediately trigger re-decryption across current chat
            useChatStore.getState().redecryptCurrentMessages?.();
            return true;
        } catch (err) {
            console.error('[E2EE] restoreKeyRingWithPassword failed:', err);
            throw new Error('Incorrect password or invalid backup key');
        }
    },

    _uploadPublicKey: async (keyData) => {
        try {
            if (!keyData) return;
            const payload = typeof keyData === 'string' 
                ? { publicKey: keyData, keyId: 'legacy' } 
                : { publicKey: keyData.publicKeyJwk || keyData.publicKey, keyId: keyData.keyId };

            await apiFetch('/api/auth/keys/upload', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error('[E2EE] Failed to upload public key:', err);
        }
    },

    _backupEncryptedKeyRing: async (keyRing, password, email) => {
        try {
            const deriveKey = await deriveBackupKey(password, email);
            const encResult = await encryptMessage(JSON.stringify(keyRing), deriveKey);

            await apiFetch('/api/auth/keys/backup', {
                method: 'POST',
                body: JSON.stringify({
                    encryptedKeyRing: encResult.ciphertext,
                    encryptedKeyRingIv: encResult.iv
                })
            });
            console.log('[E2EE] Private Key Ring zero-knowledge backed up to cloud');
        } catch (e) {
            console.error('[E2EE] Failed to backup encrypted ring to cloud', e);
        }
    },

    login: async (credentials, isAdmin = false) => {
        try {
            const endpoint = isAdmin ? '/api/auth/admin/login' : '/api/auth/user/login';
            const res = await apiFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify(credentials)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            if (data.token) {
                setAuthToken(data.token);
            }

            // Expose session credentials for zero-knowledge E2EE backup derivation
            const cleanEmail = (data.email || credentials.email || '').toLowerCase().trim();
            window.__tempLoginPassword = credentials.password;
            window.__tempLoginEmail = cleanEmail;
            try {
                sessionStorage.setItem('e2ee_session_pw', credentials.password);
                sessionStorage.setItem('e2ee_session_email', cleanEmail);
            } catch (e) {}

            set({ user: data });
            get().connectSocket();
            get().fetchFaceProfile();

            // Await key initialization so keys are 100% loaded and merged before navigation
            try {
                const keys = await get()._initE2EEKeys();
                if (keys && keys.keyId) get()._uploadPublicKey(keys);
            } catch (kErr) {
                console.warn('[E2EE] Key initialization warning on login:', kErr);
            }

            return true;
        } catch (err) {
            console.error(err);
            if (err.message === 'Failed to fetch' || err.message?.includes('NetworkError')) {
                throw new Error('Failed to fetch');
            }
            throw err;
        }
    },
    registerAdmin: async (credentials) => {
        try {
            const res = await apiFetch('/api/auth/admin/register', {
                method: 'POST',
                body: JSON.stringify(credentials)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            if (data.token) {
                setAuthToken(data.token);
            }

            const cleanEmail = (data.email || credentials.email || '').toLowerCase().trim();
            window.__tempLoginPassword = credentials.password;
            window.__tempLoginEmail = cleanEmail;
            try {
                sessionStorage.setItem('e2ee_session_pw', credentials.password);
                sessionStorage.setItem('e2ee_session_email', cleanEmail);
            } catch (e) {}

            set({ user: data });
            get().connectSocket();

            // Await key initialization so keys are 100% loaded before navigation
            try {
                const keys = await get()._initE2EEKeys();
                if (keys && keys.keyId) get()._uploadPublicKey(keys);
            } catch (kErr) {
                console.warn('[E2EE] Key initialization warning on register:', kErr);
            }

            return true;
        } catch (err) {
            console.error(err);
            if (err.message === 'Failed to fetch' || err.message?.includes('NetworkError')) {
                throw new Error('Failed to fetch');
            }
            throw err;
        }
    },
    logout: async (isUnload = false) => {
        try {
            await apiFetch('/api/auth/logout', {
                method: 'POST',
                keepalive: isUnload
            }).catch(() => {});
            const socket = get().socket;
            if (socket) socket.disconnect();
            setAuthToken(null);
            sessionStorage.clear();
            localStorage.removeItem('token');
            Cookies.remove('token');
            set({ user: null, socket: null, onlineUsers: [], myPrivateKey: null, myPublicKeyJwk: null });
            localStorage.removeItem('chatapp-offline-cache'); // Force clear persistent cache on logout

            import('../utils/pushService').then(({ unsubscribeFromPushNotifications }) => {
                unsubscribeFromPushNotifications();
            }).catch(() => {});
        } catch (err) {
            console.error(err);
        }
    },
    checkAuth: async () => {
        // Enforce credentials on site open: If no active session token exists in sessionStorage,
        // do not auto-login. Force user to login page to enter credentials!
        const token = getAuthToken();
        if (!token) {
            Cookies.remove('token');
            set({ user: null, isCheckingAuth: false });
            return;
        }

        try {
            const res = await apiFetch('/api/auth/me');
            if (!res.ok) {
                Cookies.remove('token');
                setAuthToken(null);
                set({ user: null, isCheckingAuth: false });
                return;
            }
            const data = await res.json();
            if (data.token) setAuthToken(data.token);
            set({ user: data, isCheckingAuth: false });

            get().connectSocket();
            get().fetchFaceProfile();
            get()._initE2EEKeys().then(keys => {
                if (keys && keys.keyId) get()._uploadPublicKey(keys);
                // Trigger re-decryption pass across any currently rendered chat
                import('./chatStore').then(m => m.useChatStore.getState().redecryptCurrentMessages?.());
            });
        } catch (err) {
            console.error(err);
            set({ user: null, isCheckingAuth: false });
        }
    },
    connectSocket: () => {
        const user = get().user;
        if (!user) return;

        const existingSocket = get().socket;
        if (existingSocket && existingSocket.connected) {
            return; // Socket already connected and healthy
        }
        if (existingSocket) {
            existingSocket.disconnect();
        }

        const token = getAuthToken();
        const socket = io(BACKEND_URL, {
            auth: { token, userId: user._id },
            query: { userId: user._id },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            autoConnect: false
        });

        socket.on('connect', () => {
            const currentUserId = get().user?._id || user._id;
            if (currentUserId) {
                socket.emit('join', currentUserId);
            }
            // Trigger offline queue flush safely
            import('./chatStore').then(module => {
                module.useChatStore.getState().flushOfflineQueue();
            }).catch(err => console.warn('[E2EE] Failed to lazy-load chatStore for flush', err));
        });

        socket.on('initial_online_users', (userIds) => {
            set({ onlineUsers: userIds });
        });

        socket.on('user_status', ({ userId, status, lastSeen }) => {
            if (status === 'online') {
                set((state) => ({ onlineUsers: [...new Set([...state.onlineUsers, userId])] }));
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

        // Real-time synchronization of projects / chats across both users
        socket.on('project:created', (newProject) => {
            console.log('[Socket] New project created:', newProject?.name);
            useProjectStore.getState().addProjectRealtime(newProject);
        });

        socket.on('project:deleted', ({ projectId }) => {
            console.log('[Socket] Project deleted:', projectId);
            useProjectStore.getState().removeProjectRealtime(projectId);
        });

        socket.on('project:updated', (updatedProject) => {
            console.log('[Socket] Project updated:', updatedProject?.name);
            useProjectStore.getState().updateProjectRealtime(updatedProject);
        });

        socket.connect();
        set({ socket });
    }
}));
