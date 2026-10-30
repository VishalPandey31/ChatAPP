import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './authStore';
import { useProjectStore } from './projectStore';
import { apiFetch } from '../utils/api';
import {
    importPublicKey,
    importPrivateKey,
    deriveSharedSecret,
    encryptMessage,
    decryptMessage,
} from '../utils/cryptoUtils';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// In-memory cache of derived shared secrets per userId
const sharedSecretCache = new Map();
// Promise memoization cache to prevent Cache Stampede during parallel decryption mapping
const sharedSecretPromiseCache = new Map();

const recipientKeysMemoryCache = new Map();

export const clearUserEncryptionCache = (userId) => {
    if (userId) {
        sharedSecretCache.delete(userId);
        sharedSecretPromiseCache.delete(userId);
        recipientKeysMemoryCache.delete(userId);
    } else {
        sharedSecretCache.clear();
        sharedSecretPromiseCache.clear();
        recipientKeysMemoryCache.clear();
    }
};

async function getRecipientKeysData(recipientId, forceRefresh = false) {
    if (!recipientId) return null;
    const cached = recipientKeysMemoryCache.get(recipientId);
    if (!forceRefresh && cached && (Date.now() - cached.timestamp < 45000)) {
        return cached.data;
    }
    try {
        const res = await apiFetch(`/api/auth/keys/${recipientId}`, { timeout: 4000 });
        if (!res.ok) return cached ? cached.data : null;
        const data = await res.json();
        recipientKeysMemoryCache.set(recipientId, { data, timestamp: Date.now() });
        return data;
    } catch (e) {
        return cached ? cached.data : null;
    }
}

/**
 * Eagerly imports a recipient's public key and caches the derived shared secret.
 * This completely eliminates network waterfalls when rendering a chat for the first time.
 */
export const preloadPublicKey = async (recipientId, pubKeyJwk) => {
    if (!recipientId || !pubKeyJwk) return;
    if (sharedSecretCache.has(recipientId) || sharedSecretPromiseCache.has(recipientId)) return;

    // Safety fallback: wait for key init if not ready
    let myPrivateKey = useAuthStore.getState().myPrivateKey;
    if (!myPrivateKey) {
        try {
            const keys = await useAuthStore.getState()._initE2EEKeys();
            if (keys) myPrivateKey = keys.privateKey;
        } catch (e) { return; }
    }
    if (!myPrivateKey) return;

    try {
        const fetchPromise = (async () => {
            const recipientPublicKey = await importPublicKey(pubKeyJwk);
            const sharedKey = await deriveSharedSecret(myPrivateKey, recipientPublicKey);
            sharedSecretCache.set(recipientId, sharedKey);
            return sharedKey;
        })();
        sharedSecretPromiseCache.set(recipientId, fetchPromise);
        await fetchPromise;
    } catch (err) {
        console.warn('[E2EE] Background pre-warm failed for', recipientId);
    } finally {
        sharedSecretPromiseCache.delete(recipientId);
    }
};

/**
 * Fetch the recipient's public key from backend and derive a shared AES-GCM secret.
 * Returns the CryptoKey or null if E2EE is unavailable.
 */
async function getSharedSecret(recipientId, myRequiredKeyId = null, theirRequiredKeyId = null) {
    if (!recipientId) return null;

    // Cache key now securely isolates different version pairs
    const cacheKey = `${recipientId}_${myRequiredKeyId || 'leg'}_${theirRequiredKeyId || 'leg'}`;

    if (sharedSecretCache.has(cacheKey)) {
        return sharedSecretCache.get(cacheKey);
    }
    if (sharedSecretPromiseCache.has(cacheKey)) {
        return sharedSecretPromiseCache.get(cacheKey);
    }

    const fetchPromise = (async () => {
        try {
            return await Promise.race([
                (async () => {
                    const authState = useAuthStore.getState();
                    let myPrivateKey = null;

            // 1. Resolve My Private Key from Key Ring or Active State
            let myKeyRing = authState.myKeyRing;
            if (!myKeyRing) {
                const myId = authState.user?._id;
                if (myId) {
                    try {
                        const raw = localStorage.getItem(`e2ee_keys_${myId}`);
                        if (raw) myKeyRing = JSON.parse(raw);
                    } catch (e) {}
                }
            }

            if (myRequiredKeyId && myKeyRing?.keys?.[myRequiredKeyId]) {
                const jwkObj = myKeyRing.keys[myRequiredKeyId];
                myPrivateKey = await importPrivateKey(jwkObj.privateKeyJwk);
            } else if (myRequiredKeyId === 'legacy') {
                const myId = authState.user?._id;
                const legacyPriv = localStorage.getItem(`e2ee_private_key_${myId}`) || localStorage.getItem('e2ee_private_key_jwk');
                if (legacyPriv) {
                    try { myPrivateKey = await importPrivateKey(legacyPriv); } catch (e) {}
                }
                if (!myPrivateKey && authState.myPrivateKey) {
                    myPrivateKey = authState.myPrivateKey;
                }
            }

            // Fallback: Use active private key if specific keyId was not found in local keyring
            if (!myPrivateKey) {
                if (!authState.myPrivateKey) {
                    await authState._initE2EEKeys();
                }
                myPrivateKey = useAuthStore.getState().myPrivateKey;
            }

            if (!myPrivateKey) {
                console.warn('[E2EE] No local private key available to derive secret');
                return null;
            }

            // 2. Fetch recipient Public Key Ring (cached in memory)
            const data = await getRecipientKeysData(recipientId);
            if (!data) return null;

            let theirPublicKeyJwk = null;
            let resolvedTheirKeyId = null;

            if (theirRequiredKeyId === 'LATEST') {
                // Prefer user's active publicKey or newest entry
                if (data.publicKey) {
                    theirPublicKeyJwk = data.publicKey;
                    const matched = (data.publicKeys || []).find(k => k.publicKey === data.publicKey);
                    resolvedTheirKeyId = matched ? matched.keyId : (data.publicKeys?.[data.publicKeys.length - 1]?.keyId || 'legacy');
                } else if (data.publicKeys && data.publicKeys.length > 0) {
                    const latest = data.publicKeys[data.publicKeys.length - 1];
                    theirPublicKeyJwk = latest.publicKey;
                    resolvedTheirKeyId = latest.keyId;
                }
            } else if (theirRequiredKeyId && theirRequiredKeyId !== 'LATEST' && data.publicKeys) {
                const found = data.publicKeys.find(k => k.keyId === theirRequiredKeyId);
                if (found) {
                    theirPublicKeyJwk = found.publicKey;
                    resolvedTheirKeyId = found.keyId;
                }
            }

            // Fallback to active publicKey or any public key available
            if (!theirPublicKeyJwk && data.publicKey) {
                theirPublicKeyJwk = data.publicKey;
                resolvedTheirKeyId = 'legacy';
            } else if (!theirPublicKeyJwk && data.publicKeys && data.publicKeys.length > 0) {
                theirPublicKeyJwk = data.publicKeys[0].publicKey;
                resolvedTheirKeyId = data.publicKeys[0].keyId;
            }

            if (!theirPublicKeyJwk) return null;

            const recipientPublicKey = await importPublicKey(theirPublicKeyJwk);
            const sharedKey = await deriveSharedSecret(myPrivateKey, recipientPublicKey);

            const resultObj = { sharedKey, theirKeyId: resolvedTheirKeyId };
            sharedSecretCache.set(cacheKey, resultObj);
            return resultObj;
                })(),
                new Promise(resolve => setTimeout(() => resolve(null), 5000))
            ]);
        } catch (err) {
            console.warn('[E2EE] Could not derive shared secret for', recipientId, err);
            return null;
        } finally {
            sharedSecretPromiseCache.delete(cacheKey);
        }
    })();

    sharedSecretPromiseCache.set(cacheKey, fetchPromise);
    return fetchPromise;
}

/**
 * Decrypt a single message object if it has encryptionVersion === 1.
 * ALWAYS returns a valid message — never throws or breaks the UI.
 * Uses the store's activeRecipientId as context (project messages have no receiver field).
 */
async function decryptSingleMessage(msg, activeRecipientId) {
    if (!msg) return msg;

    let decryptedMsg = { ...msg };
    const isEncryptedType = (type) => type === 'TEXT' || type === 'IMAGE' || type === 'VIDEO';
    const outerNeedsDecryption = ((msg.encryptionVersion === 1 || !!msg.iv) && isEncryptedType(msg.messageType) && !msg.deleted);
    const innerNeedsDecryption = (msg.replyTo && (msg.replyTo.encryptionVersion === 1 || !!msg.replyTo.iv) && isEncryptedType(msg.replyTo.messageType) && !msg.replyTo.deleted);

    if (!outerNeedsDecryption && !innerNeedsDecryption) {
        return decryptedMsg; // nothing to decrypt
    }

    try {
        const myId = useAuthStore.getState().user?._id?.toString();
        const senderId = typeof msg.sender === 'object' ? msg.sender?._id?.toString() : msg.sender?.toString();

        let recipientId = null;
        if (senderId && myId && senderId !== myId) {
            // For messages received from someone else, the peer whose public key is needed to derive the secret is ALWAYS senderId!
            recipientId = senderId;
        } else {
            // For messages sent by myself, the peer whose public key was used is the recipient (or other project member)
            recipientId = msg.receiver?.toString?.() || activeRecipientId || useChatStore.getState().activeRecipientId;
        }

        const msgProjectId = msg.projectId || (typeof msg.project === 'object' ? (msg.project._id || msg.project.id) : msg.project) || useChatStore.getState().currentProjectId;

        if (!recipientId && msgProjectId) {
            if (msg.replyTo) {
                const replySenderId = typeof msg.replyTo.sender === 'object' ? msg.replyTo.sender?._id?.toString() : msg.replyTo.sender?.toString();
                if (replySenderId && replySenderId !== myId) recipientId = replySenderId;
            }

            if (!recipientId) {
                try {
                    let projects = useProjectStore.getState().projects;
                    if (!projects || projects.length === 0) {
                        const cachedProjects = localStorage.getItem('project-store');
                        if (cachedProjects) {
                            try {
                                const parsed = JSON.parse(cachedProjects);
                                projects = parsed.state?.projects || [];
                            } catch (e) {}
                        }
                    }
                    const project = (projects || []).find(p => String(p._id || p.id) === String(msgProjectId));
                    if (project) {
                        const others = [project.admin, ...(project.collaborators || [])].filter(m => {
                            if (!m) return false;
                            const mId = (typeof m === 'object' ? (m._id || m.id) : m).toString();
                            return mId !== myId;
                        });
                        if (others.length > 0) {
                            recipientId = (typeof others[0] === 'object' ? (others[0]._id || others[0].id) : others[0]).toString();
                            useChatStore.getState().setActiveRecipientId(recipientId);
                        }
                    }
                } catch (e) {
                    console.warn('[E2EE] Could not check projectStore for recipientId fallback', e);
                }
            }

            if (!recipientId) {
                const cachedMsgs = useChatStore.getState().messagesCache[msgProjectId] || useChatStore.getState().messages || [];
                const otherMsg = cachedMsgs.find(m => {
                    const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                    return sId && sId !== myId;
                });
                if (otherMsg) {
                    recipientId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
                    useChatStore.getState().setActiveRecipientId(recipientId);
                }
            }
        }

        if (!recipientId) return decryptedMsg;

        let myRequiredKeyId = null;
        let theirRequiredKeyId = null;

        if (senderId === myId) {
            myRequiredKeyId = msg.senderKeyId || null;
            theirRequiredKeyId = msg.recipientKeyId || null;
        } else {
            myRequiredKeyId = msg.recipientKeyId || null;
            theirRequiredKeyId = msg.senderKeyId || null;
        }

        const secretObj = await getSharedSecret(recipientId, myRequiredKeyId, theirRequiredKeyId);
        const sharedKey = secretObj ? secretObj.sharedKey : null;

        // Decrypt helper with self-healing fallback trials
        const tryDecryptCipher = async (ciphertext, iv) => {
            if (!ciphertext) return null;

            // 1. Primary: Try with matching derived sharedKey
            if (sharedKey) {
                try {
                    return await decryptMessage(ciphertext, iv, sharedKey);
                } catch (e) {
                    // signature mismatch / wrong key, continue to fallbacks
                }
            }

            // 2. Fallback: Try with current active latest secret key
            try {
                const latestObj = await getSharedSecret(recipientId, null, 'LATEST');
                if (latestObj && latestObj.sharedKey && latestObj.sharedKey !== sharedKey) {
                    return await decryptMessage(ciphertext, iv, latestObj.sharedKey);
                }
            } catch (e) {}

            // 3. Fallback: Try with legacy secret key
            try {
                const legacyObj = await getSharedSecret(recipientId, 'legacy', 'legacy');
                if (legacyObj && legacyObj.sharedKey && legacyObj.sharedKey !== sharedKey) {
                    return await decryptMessage(ciphertext, iv, legacyObj.sharedKey);
                }
            } catch (e) {}

            // 4. Exhaustive Multi-Key Self-Healing:
            // If primary key lookup failed (e.g. key rotated or device ring out of sync),
            // iterate over ALL known private keys on this device paired against ALL known public keys of recipient.
            try {
                const auth = useAuthStore.getState();
                const currentUserId = auth.user?._id?.toString();
                let activeRing = auth.myKeyRing;
                if (!activeRing && currentUserId) {
                    try {
                        const raw = localStorage.getItem(`e2ee_keys_${currentUserId}`);
                        if (raw) activeRing = JSON.parse(raw);
                    } catch (e) {}
                }

                // Gather all candidate private keys on this device
                const candPrivs = [];
                if (auth.myPrivateKey) {
                    candPrivs.push({ keyId: auth.myCurrentKeyId || 'active', privKey: auth.myPrivateKey });
                }

                for (const [mKeyId, mKeyObj] of Object.entries(activeRing?.keys || {})) {
                    if (!mKeyObj?.privateKeyJwk) continue;
                    try {
                        const importedPriv = await importPrivateKey(mKeyObj.privateKeyJwk);
                        candPrivs.push({ keyId: mKeyId, privKey: importedPriv });
                    } catch (e) {}
                }

                if (currentUserId) {
                    const legacyPrivStr = localStorage.getItem(`e2ee_private_key_${currentUserId}`) || localStorage.getItem('e2ee_private_key_jwk');
                    if (legacyPrivStr) {
                        try {
                            const importedLeg = await importPrivateKey(legacyPrivStr);
                            candPrivs.push({ keyId: 'legacy', privKey: importedLeg });
                        } catch (e) {}
                    }
                }

                // Fetch all recipient public keys from memory cache
                const kData = await getRecipientKeysData(recipientId);
                if (kData) {
                    let candPubs = (kData.publicKeys || []).slice();
                    if (kData.publicKey && !candPubs.some(k => k.publicKey === kData.publicKey)) {
                        candPubs.push({ keyId: 'active', publicKey: kData.publicKey });
                    }

                    for (const { keyId: mKeyId, privKey: candPriv } of candPrivs) {
                        for (const theirKeyObj of candPubs) {
                            if (!theirKeyObj?.publicKey) continue;
                            try {
                                const candPub = await importPublicKey(theirKeyObj.publicKey);
                                const testSecret = await deriveSharedSecret(candPriv, candPub);
                                const decrypted = await decryptMessage(ciphertext, iv, testSecret);
                                if (decrypted !== null && decrypted !== undefined) {
                                    // Found a matching key combination! Cache it so future messages resolve instantly
                                    const winCacheKey = `${recipientId}_${mKeyId}_${theirKeyObj.keyId}`;
                                    sharedSecretCache.set(winCacheKey, { sharedKey: testSecret, theirKeyId: theirKeyObj.keyId });
                                    const origKey = `${recipientId}_${myRequiredKeyId || 'leg'}_${theirRequiredKeyId || 'leg'}`;
                                    sharedSecretCache.set(origKey, { sharedKey: testSecret, theirKeyId: theirKeyObj.keyId });
                                    return decrypted;
                                }
                            } catch (decErr) {
                                // mismatch, proceed to next combination
                            }
                        }
                    }
                }
            } catch (exErr) {
                console.warn('[E2EE] Exhaustive recovery attempt warning:', exErr);
            }

            return null;
        };

        // Decrypt outer message if needed
        if (outerNeedsDecryption) {
            const targetCipher = msg.originalCiphertext || msg.content;
            const decryptedPlaintext = await tryDecryptCipher(targetCipher, msg.iv);
            if (decryptedPlaintext !== null) {
                decryptedMsg.content = decryptedPlaintext;
                decryptedMsg.encryptionVersion = 0;
                decryptedMsg.iv = null;
                delete decryptedMsg.originalCiphertext;
                delete decryptedMsg.decryptionState;
            } else {
                decryptedMsg.originalCiphertext = targetCipher;
                decryptedMsg.content = msg.messageType === 'IMAGE' 
                    ? '🔒 Encrypted image' 
                    : msg.messageType === 'VIDEO'
                    ? '🔒 Encrypted video'
                    : '🔒 Encrypted message';
                decryptedMsg.decryptionState = 'FAILED_ROTATED';
            }
        }

        // Decrypt inner reply if needed
        if (innerNeedsDecryption) {
            const targetCipher = decryptedMsg.replyTo.originalCiphertext || decryptedMsg.replyTo.content;
            const replyPlaintext = await tryDecryptCipher(targetCipher, decryptedMsg.replyTo.iv);
            decryptedMsg.replyTo = {
                id: decryptedMsg.replyTo._id || decryptedMsg.replyTo.id,
                senderId: typeof decryptedMsg.replyTo.sender === 'object' ? (decryptedMsg.replyTo.sender._id || decryptedMsg.replyTo.sender.id) : decryptedMsg.replyTo.sender,
                text: replyPlaintext !== null ? replyPlaintext : '🔒 Encrypted message',
                messageType: decryptedMsg.replyTo.messageType || 'TEXT'
            };
        } else if (decryptedMsg.replyTo) {
            decryptedMsg.replyTo = {
                id: decryptedMsg.replyTo._id || decryptedMsg.replyTo.id,
                senderId: typeof decryptedMsg.replyTo.sender === 'object' ? (decryptedMsg.replyTo.sender._id || decryptedMsg.replyTo.sender.id) : decryptedMsg.replyTo.sender,
                text: decryptedMsg.replyTo.content || decryptedMsg.replyTo.text,
                messageType: decryptedMsg.replyTo.messageType || 'TEXT'
            };
        }

        return decryptedMsg;
    } catch (err) {
        if (outerNeedsDecryption) {
            decryptedMsg.content = msg.messageType === 'IMAGE' 
                ? '🔒 Encrypted image' 
                : msg.messageType === 'VIDEO'
                ? '🔒 Encrypted video'
                : '🔒 Encrypted message';
            decryptedMsg.decryptionState = 'FAILED_CRYPTO';
        }
        if (innerNeedsDecryption) decryptedMsg.replyTo = {
            id: decryptedMsg.replyTo._id || decryptedMsg.replyTo.id,
            senderId: typeof decryptedMsg.replyTo.sender === 'object' ? (decryptedMsg.replyTo.sender._id || decryptedMsg.replyTo.sender.id) : decryptedMsg.replyTo.sender,
            text: '🔒 Encrypted message',
            messageType: decryptedMsg.replyTo.messageType || 'TEXT'
        };
        return decryptedMsg;
    }
}

// ─────────────────────────────────────────────────────────
// Message Reconciliation Engine
// ─────────────────────────────────────────────────────────
/**
 * Safely merges two message arrays guaranteeing no duplicates.
 * Prioritizes the incoming Server response but cleanly garbage-collects
 * local optimistic pending messages once their real _id arrives.
 */
function mergeMessages(existingMsgs = [], incomingMsgs = []) {
    const map = new Map();

    // Load existing messages 
    existingMsgs.forEach(m => {
        const key = m._id && !m._id.toString().startsWith('msg-') ? m._id.toString() : (m.clientMessageId || m._id.toString());
        map.set(key, m);
    });

    // Merge incoming messages exactly overlaying matching keys
    incomingMsgs.forEach(m => {
        const key = m._id && !m._id.toString().startsWith('msg-') ? m._id.toString() : (m.clientMessageId || m._id.toString());

        // If the incoming message finally has a REAL database ID, purge any matching optimistic ghost key
        if (m.clientMessageId && m._id && !m._id.toString().startsWith('msg-')) {
            if (map.has(m.clientMessageId)) {
                map.delete(m.clientMessageId);
            }
        }

        map.set(key, m); // Upsert
    });

    const result = Array.from(map.values());
    // Strict deterministic chronological sorting
    result.sort((a, b) => {
        const dateDiff = new Date(a.createdAt) - new Date(b.createdAt);
        if (dateDiff === 0) {
            if (!a._id || !b._id) return 0;
            return a._id.toString().localeCompare(b._id.toString());
        }
        return dateDiff;
    });

    return result;
}

// ─────────────────────────────────────────────────────────
// Zustand Store (Persisted)
// ─────────────────────────────────────────────────────────
export const useChatStore = create(
    persist(
        (set, get) => ({
            chats: [],
            messages: [],
            messagesCache: {}, // Local cache to prevent UI freeze: projectId -> messages array
            pendingMessages: [],
            isChatsLoading: false,
            isMessagesLoading: false,
            isMoreMessagesLoading: false,
            activeChat: null,
            currentProjectId: null,
            activeRecipientId: null, // E2EE: who we are chatting with (the OTHER user's ID)

            getChats: async () => {
                set({ isChatsLoading: true });
                try {
                    const res = await apiFetch('/api/chats');
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message);
                    set({ chats: data });
                } catch (error) {
                    console.error(error);
                } finally {
                    set({ isChatsLoading: false });
                }
            },

            getMessages: async (userId) => {
                set({ isMessagesLoading: true });
                try {
                    const res = await apiFetch(`/api/chats/${userId}`);
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message);
                    set({ messages: data });
                } catch (error) {
                    console.error(error);
                } finally {
                    set({ isMessagesLoading: false });
                }
            },

            getProjectMessages: async (projectId, force = false) => {
                const cached = get().messagesCache[projectId];

                // Self-healing: Detect permanently corrupted string in cache or un-decrypted messages
                const isCorrupted = cached && cached.some(m => {
                    if (!m) return false;
                    if (m.decryptionState === 'FAILED_ROTATED' || m.decryptionState === 'FAILED_CRYPTO') return true;
                    if (m.originalCiphertext) return true;
                    if (typeof m.content === 'string') {
                        return (
                            m.content.startsWith('🔒 Encrypted') ||
                            m.content.includes('key not yet available') ||
                            m.content.includes('Message decryption failed') ||
                            m.content.includes('Encrypted (Key Rotated)') ||
                            m.content.includes('Encrypted (Key Missing)') ||
                            m.content.includes('Encrypted (Missing Sender Key)') ||
                            m.content.includes('Encryption Failed')
                        );
                    }
                    return false;
                });

                // Scrub hanging SENDING states caused by page reloads dropping the pending queue.
                const pendingQueue = get().pendingMessages || [];
                if (cached) {
                    cached.forEach(m => {
                        if (m.status === 'SENDING' && !pendingQueue.some(p => p.payload.clientMessageId === m.clientMessageId)) {
                            m.status = 'FAILED';
                        }
                    });
                }

                if (cached && !force && !isCorrupted) {
                    // Pre-resolve activeRecipientId if not already present in store
                    if (!get().activeRecipientId) {
                        const myId = useAuthStore.getState().user?._id?.toString();
                        const otherMsg = cached.find(m => {
                            const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                            return sId && sId !== myId;
                        });
                        if (otherMsg) {
                            const recId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
                            set({ activeRecipientId: recId });
                        }
                    }
                    set({ isMessagesLoading: false, currentProjectId: projectId, messages: cached });
                    // Seamlessly fetch any missing messages in the background
                    get().syncMissedMessages(projectId);
                    return;
                }

                // Show persisted cache instantly if available, skip loading spinner
                const persistedCache = isCorrupted ? null : get().messagesCache[projectId];
                set({
                    isMessagesLoading: !persistedCache || persistedCache.length === 0,
                    currentProjectId: projectId,
                    messages: persistedCache || []
                });
                try {
                    const res = await apiFetch(`/api/chats/project/${projectId}`);
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message);

                    let { activeRecipientId } = get();

                    // Robust extraction for activeRecipientId
                    if (!activeRecipientId) {
                        const myId = useAuthStore.getState().user?._id?.toString();
                        // 1. Scan incoming messages for other sender
                        const otherMsg = data.find(m => {
                            const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                            return sId && sId !== myId;
                        });
                        if (otherMsg) {
                            activeRecipientId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
                            set({ activeRecipientId });
                        }

                        // 2. Fall back to projects list
                        if (!activeRecipientId) {
                            let projs = useProjectStore.getState().projects;
                            if (!projs || projs.length === 0) {
                                try {
                                    await useProjectStore.getState().fetchProjects();
                                    projs = useProjectStore.getState().projects;
                                } catch (e) {}
                            }
                            const proj = (projs || []).find(p => (p._id || p.id) === projectId);
                            if (proj) {
                                const others = [proj.admin, ...(proj.collaborators || [])].filter(m => {
                                    if (!m) return false;
                                    const mId = (typeof m === 'object' ? (m._id || m.id) : m).toString();
                                    return mId !== myId;
                                });
                                if (others.length > 0) {
                                    activeRecipientId = (typeof others[0] === 'object' ? (others[0]._id || others[0].id) : others[0]).toString();
                                    set({ activeRecipientId });
                                }
                            }
                        }
                    }

                    // PARALLEL BATCH DECRYPTION: Resolves all E2EE messages including deep nested replyTos before DOM insertion
                    const decryptedMessages = await Promise.all(
                        data.map(msg => decryptSingleMessage(msg, activeRecipientId))
                    );

                    // Preserve pending optimistic messages that haven't sent yet
                    const currentMsgs = get().messagesCache[projectId] || (get().currentProjectId === projectId ? get().messages : []);
                    const pendingMsgs = currentMsgs.filter(m => m.status === 'SENDING' || m.status === 'FAILED');

                    // RECONCILIATION: Safely merge to guarantee we NEVER destroy newly arrived Socket.io messages
                    const newMessages = mergeMessages(currentMsgs, [...decryptedMessages, ...pendingMsgs]);

                    set(state => ({
                        messages: state.currentProjectId === projectId ? newMessages : state.messages,
                        messagesCache: { ...state.messagesCache, [projectId]: newMessages },
                        isMessagesLoading: false
                    }));
                } catch (error) {
                    console.error(error);
                    set({ isMessagesLoading: false });
                }
            },

            redecryptCurrentMessages: async () => {
                const { messages, currentProjectId, activeRecipientId } = get();
                if (!messages || messages.length === 0) return;

                const hasPending = messages.some(m => 
                    m.decryptionState || 
                    m.originalCiphertext || 
                    (typeof m.content === 'string' && m.content.startsWith('🔒 Encrypted'))
                );
                if (!hasPending) return;

                console.log('[E2EE] Re-decrypting messages with newly restored keys...');
                const updated = await Promise.all(
                    messages.map(async (msg) => {
                        if (msg.decryptionState || (typeof msg.content === 'string' && msg.content.startsWith('🔒 Encrypted')) || msg.originalCiphertext) {
                            const raw = {
                                ...msg,
                                content: msg.originalCiphertext || msg.content,
                                encryptionVersion: 1
                            };
                            return await decryptSingleMessage(raw, activeRecipientId);
                        }
                        return msg;
                    })
                );

                set(state => ({
                    messages: state.currentProjectId === currentProjectId ? updated : state.messages,
                    messagesCache: currentProjectId ? { ...state.messagesCache, [currentProjectId]: updated } : state.messagesCache
                }));
            },

            loadMoreProjectMessages: async (projectId) => {
                const currentMessages = get().messagesCache[projectId] || get().messages;
                if (!currentMessages || currentMessages.length === 0) return;

                const oldestMessage = currentMessages[0];
                const oldestMessageDate = oldestMessage.createdAt;
                const oldestMessageId = oldestMessage._id || oldestMessage.id;

                try {
                    const res = await apiFetch(`/api/chats/project/${projectId}?before=${oldestMessageDate}&beforeId=${oldestMessageId}`);
                    if (!res.ok) return;
                    const data = await res.json();

                    if (data.length === 0) return;

                    let { activeRecipientId } = get();
                    const myId = useAuthStore.getState().user?._id?.toString();
                    if (!activeRecipientId) {
                        const otherMsg = data.find(m => {
                            const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                            return sId && sId !== myId;
                        });
                        if (otherMsg) {
                            activeRecipientId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
                            set({ activeRecipientId });
                        }
                    }

                    if (!activeRecipientId && projectId) {
                        try {
                            const projs = useProjectStore.getState().projects || [];
                            const proj = projs.find(p => (p._id || p.id) === projectId);
                            if (proj) {
                                const others = [proj.admin, ...(proj.collaborators || [])].filter(m => {
                                    if (!m) return false;
                                    const mId = (typeof m === 'object' ? (m._id || m.id) : m).toString();
                                    return mId !== myId;
                                });
                                if (others.length > 0) {
                                    activeRecipientId = (typeof others[0] === 'object' ? (others[0]._id || others[0].id) : others[0]).toString();
                                    set({ activeRecipientId });
                                }
                            }
                        } catch (e) {}
                    }

                    const decryptedMessages = await Promise.all(
                        data.map(msg => decryptSingleMessage(msg, activeRecipientId))
                    );

                    set(state => {
                        const existingMsgs = state.messagesCache[projectId] || (state.currentProjectId === projectId ? state.messages : []);

                        // RECONCILIATION
                        const newMessages = mergeMessages(existingMsgs, decryptedMessages);

                        return {
                            messages: state.currentProjectId === projectId ? newMessages : state.messages,
                            messagesCache: { ...state.messagesCache, [projectId]: newMessages },
                            isMoreMessagesLoading: false
                        };
                    });
                } catch (err) {
                    console.error("[Pagination]", err);
                    set({ isMoreMessagesLoading: false });
                }
            },

            syncMissedMessages: async (projectId) => {
                try {
                    // Fetch the absolute newest 50 messages strictly to resolve any missing middle gaps
                    const res = await apiFetch(`/api/chats/project/${projectId}?limit=50`);
                    if (!res.ok) return;
                    const data = await res.json();
                    if (!data || data.length === 0) return;

                    let { activeRecipientId } = get();
                    const myId = useAuthStore.getState().user?._id?.toString();
                    if (!activeRecipientId) {
                        const otherMsg = data.find(m => {
                            const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                            return sId && sId !== myId;
                        });
                        if (otherMsg) {
                            activeRecipientId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
                            set({ activeRecipientId });
                        }
                    }

                    if (!activeRecipientId && projectId) {
                        try {
                            let projs = useProjectStore.getState().projects;
                            if (!projs || projs.length === 0) {
                                try {
                                    await useProjectStore.getState().fetchProjects();
                                    projs = useProjectStore.getState().projects;
                                } catch (e) {}
                            }
                            const proj = (projs || []).find(p => String(p._id || p.id) === String(projectId));
                            if (proj) {
                                const others = [proj.admin, ...(proj.collaborators || [])].filter(m => {
                                    if (!m) return false;
                                    const mId = (typeof m === 'object' ? (m._id || m.id) : m).toString();
                                    return mId !== myId;
                                });
                                if (others.length > 0) {
                                    activeRecipientId = (typeof others[0] === 'object' ? (others[0]._id || others[0].id) : others[0]).toString();
                                    set({ activeRecipientId });
                                }
                            }
                        } catch (e) {}
                    }

                    const decryptedMessages = await Promise.all(
                        data.map(msg => decryptSingleMessage(msg, activeRecipientId))
                    );

                    set(state => {
                        const existingMsgs = state.messagesCache[projectId] || (state.currentProjectId === projectId ? state.messages : []);

                        // RECONCILIATION
                        let newMessages = mergeMessages(existingMsgs, decryptedMessages);

                        // Post-sync scrub: fail any SENDING messages not actively queued
                        const pendingQ = state.pendingMessages || [];
                        newMessages.forEach(m => {
                            if (m.status === 'SENDING' && !pendingQ.some(p => p.payload.clientMessageId === m.clientMessageId)) {
                                m.status = 'FAILED';
                            }
                        });

                        return {
                            messages: state.currentProjectId === projectId ? newMessages : state.messages,
                            messagesCache: { ...state.messagesCache, [projectId]: newMessages }
                        };
                    });
                } catch (err) {
                    console.error("[E2EE] Sync failed", err);
                }
            },

            recoverMessagesAction: async (projectId, limit = 100) => {
                try {
                    const res = await apiFetch(`/api/chats/project/${projectId}/recover?limit=${limit}`);
                    if (!res.ok) throw new Error("Recovery forbidden or failed.");
                    const data = await res.json();
                    if (!data || data.length === 0) return 0;

                    let { activeRecipientId } = get();
                    const myId = useAuthStore.getState().user?._id?.toString();
                    if (!activeRecipientId) {
                        const otherMsg = data.find(m => {
                            const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                            return sId && sId !== myId;
                        });
                        if (otherMsg) {
                            activeRecipientId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
                            set({ activeRecipientId });
                        }
                    }

                    if (!activeRecipientId && projectId) {
                        try {
                            let projs = useProjectStore.getState().projects;
                            if (!projs || projs.length === 0) {
                                try {
                                    await useProjectStore.getState().fetchProjects();
                                    projs = useProjectStore.getState().projects;
                                } catch (e) {}
                            }
                            const proj = (projs || []).find(p => String(p._id || p.id) === String(projectId));
                            if (proj) {
                                const others = [proj.admin, ...(proj.collaborators || [])].filter(m => {
                                    if (!m) return false;
                                    const mId = (typeof m === 'object' ? (m._id || m.id) : m).toString();
                                    return mId !== myId;
                                });
                                if (others.length > 0) {
                                    activeRecipientId = (typeof others[0] === 'object' ? (others[0]._id || others[0].id) : others[0]).toString();
                                    set({ activeRecipientId });
                                }
                            }
                        } catch (e) {}
                    }

                    const decryptedMessages = await Promise.all(
                        data.map(msg => decryptSingleMessage(msg, activeRecipientId))
                    );

                    return new Promise((resolve) => {
                        set(state => {
                            const currentMsgs = state.messagesCache[projectId] || (state.currentProjectId === projectId ? state.messages : []);
                            let newMessages = [...currentMsgs];
                            let recoveredCount = 0;

                            decryptedMessages.forEach(dec => {
                                const existsId = newMessages.find(m => m._id === dec._id || (dec.clientMessageId && m.clientMessageId === dec.clientMessageId));
                                if (!existsId) {
                                    newMessages.push(dec);
                                    recoveredCount++;
                                }
                            });

                            if (recoveredCount > 0) {
                                newMessages.sort((a, b) => {
                                    const dateDiff = new Date(a.createdAt) - new Date(b.createdAt);
                                    if (dateDiff === 0) {
                                        if (!a._id || !b._id) return 0;
                                        return a._id.toString().localeCompare(b._id.toString());
                                    }
                                    return dateDiff;
                                });
                            }

                            resolve(recoveredCount);

                            return {
                                messages: state.currentProjectId === projectId ? newMessages : state.messages,
                                messagesCache: { ...state.messagesCache, [projectId]: newMessages }
                            };
                        });
                    });
                } catch (err) {
                    console.error("[Recovery] Failed to recover messages", err);
                    throw err;
                }
            },

            setActiveChat: (chat) => {
                set({ activeChat: chat });
            },

            retryMessage: async (clientMessageId, projectId) => {
                const targetMsg = get().messages.find(m => m.clientMessageId === clientMessageId);
                if (!targetMsg || targetMsg.status !== 'FAILED') return;

                // Immediately pivot UI to SENDING
                set(state => {
                    const newMsgs = state.messages.map(m => m.clientMessageId === clientMessageId ? { ...m, status: 'SENDING' } : m);
                    const newCache = { ...state.messagesCache };
                    newCache[projectId] = newMsgs;
                    return { messages: newMsgs, messagesCache: newCache };
                });

                try {
                    const replyToId = targetMsg.replyTo ? (targetMsg.replyTo.id || targetMsg.replyTo._id) : null;
                    set(state => {
                        const newMsgs = state.messages.filter(m => m.clientMessageId !== clientMessageId);
                        const newCache = { ...state.messagesCache };
                        newCache[projectId] = newMsgs;
                        return { messages: newMsgs, messagesCache: newCache };
                    });

                    await get().sendProjectMessage(projectId, targetMsg.content, replyToId, targetMsg.messageType || 'TEXT');
                } catch (err) {
                    console.error("Retry failed:", err);
                }
            },

            /**
             * Set which user we are encrypting for.
             * Call this when opening a project chat.
             */
            setActiveRecipientId: (userId) => {
                const newId = userId || null;
                if (get().activeRecipientId === newId) return; // Prevent infinite render / cache nuking loops

                set({ activeRecipientId: newId });
                // Pre-warm: eagerly derive shared secret so it's cached before messages need decrypting
                if (newId) getSharedSecret(newId);
            },

            sendMessage: async (receiverId, content, messageType = 'TEXT') => {
                const socket = useAuthStore.getState().socket;
                if (!socket) return;
                const currentUser = useAuthStore.getState().user;
                if (!currentUser) return;

                let finalContent = content;
                let iv = null;
                let encryptionVersion = 0;
                let senderKeyId = null;
                let recipientKeyId = null;

                try {
                    let myCurrentKeyId = useAuthStore.getState().myCurrentKeyId;
                    if (!myCurrentKeyId) {
                        await useAuthStore.getState()._initE2EEKeys();
                        myCurrentKeyId = useAuthStore.getState().myCurrentKeyId;
                    }
                    const secretObj = await getSharedSecret(receiverId, myCurrentKeyId, 'LATEST');
                    if (secretObj && secretObj.sharedKey) {
                        const encrypted = await encryptMessage(content, secretObj.sharedKey);
                        finalContent = encrypted.ciphertext;
                        iv = encrypted.iv;
                        encryptionVersion = 1;
                        senderKeyId = myCurrentKeyId || 'legacy';
                        recipientKeyId = secretObj.theirKeyId || 'legacy';
                    }
                } catch (e) {
                    console.warn('[E2EE] Direct message encryption fallback:', e);
                }

                socket.emit("send_message", {
                    senderId: currentUser._id,
                    receiverId,
                    content: finalContent,
                    iv,
                    encryptionVersion,
                    senderKeyId,
                    recipientKeyId,
                    messageType: messageType || 'TEXT'
                });
            },

            flushPendingMessages: (activeSocket) => {
                const { pendingMessages } = get();
                const sock = activeSocket || useAuthStore.getState().socket;
                if (!sock || !sock.connected || !pendingMessages || pendingMessages.length === 0) return;

                // Process pending messages sequentially
                pendingMessages.forEach(({ payload }) => {
                    sock.timeout(15000).emit("send_project_message", payload, (err, response) => {
                        if (err) {
                            console.warn("[Lifecycle] Flush timeout for message:", payload.clientMessageId);
                            set(state => {
                                const newPending = state.pendingMessages.filter(p => p.payload.clientMessageId !== payload.clientMessageId);
                                const newMessages = state.messages.map(m => m.clientMessageId === payload.clientMessageId ? { ...m, status: 'FAILED' } : m);
                                const newCache = { ...state.messagesCache };
                                if (payload.projectId) newCache[payload.projectId] = newMessages;
                                return { pendingMessages: newPending, messages: newMessages, messagesCache: newCache };
                            });
                        } else if (response && response.status === 'ok') {
                            set(state => {
                                const newPending = state.pendingMessages.filter(p => p.payload.clientMessageId !== payload.clientMessageId);
                                const newMessages = state.messages.map(m => {
                                    if (m.clientMessageId === payload.clientMessageId) return { ...m, _id: response.messageId, status: 'SENT' };
                                    return m;
                                });
                                const newCache = { ...state.messagesCache };
                                if (payload.projectId) newCache[payload.projectId] = newMessages;
                                return { pendingMessages: newPending, messages: newMessages, messagesCache: newCache };
                            });
                        } else {
                            set(state => {
                                const newPending = state.pendingMessages.filter(p => p.payload.clientMessageId !== payload.clientMessageId);
                                const newMessages = state.messages.map(m => {
                                    if (m.clientMessageId === payload.clientMessageId) return { ...m, status: 'FAILED' };
                                    return m;
                                });
                                const newCache = { ...state.messagesCache };
                                if (payload.projectId) newCache[payload.projectId] = newMessages;
                                return { pendingMessages: newPending, messages: newMessages, messagesCache: newCache };
                            });
                        }
                    });
                });
            },

            sendProjectMessage: async (projectId, content, replyToId = null, messageType = 'TEXT', options = {}) => {
                return new Promise((resolve, reject) => {
                    const clientMessageId = `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                    const currentUser = useAuthStore.getState().user;
                    if (!currentUser) return reject(new Error("Not logged in"));

                    // 1. Instantly construct and push Optimistic UI WITHOUT waiting for encryption
                    const optimisticMsg = {
                        _id: clientMessageId,
                        clientMessageId,
                        sender: currentUser,
                        projectId,
                        content,
                        iv: null,
                        encryptionVersion: 0,
                        messageType,
                        status: 'SENDING',
                        createdAt: new Date().toISOString(),
                        selfDestructDuration: options.selfDestructDuration || 0,
                        expiresAt: options.selfDestructDuration ? new Date(Date.now() + options.selfDestructDuration * 1000).toISOString() : null,
                        viewOnce: Boolean(options.viewOnce),
                        viewed: false
                    };

                    if (replyToId) {
                        const replyMsg = get().messages.find(m => (m._id?.toString?.() || m._id) === (replyToId?.toString?.() || replyToId));
                        if (replyMsg) {
                            optimisticMsg.replyTo = {
                                id: replyMsg._id || replyMsg.id,
                                senderId: typeof replyMsg.sender === 'object' ? (replyMsg.sender._id || replyMsg.sender.id) : replyMsg.sender,
                                text: replyMsg.content || replyMsg.text,
                                messageType: replyMsg.messageType || 'TEXT'
                            };
                        }
                    }

                    // Inject synchronously to the UI cache so rendering is literally zero latency
                    set(state => {
                        const newMessages = [...state.messages, optimisticMsg];
                        return {
                            messages: newMessages,
                            messagesCache: { ...state.messagesCache, [projectId]: newMessages }
                        };
                    });

                    // 2. Process Crypto and Network payload with full safety wrapper
                    (async () => {
                        let finalContent = content;
                        let iv = null;
                        let encryptionVersion = 0;
                        let resolvedSenderKeyId = null;
                        let resolvedRecipientKeyId = null;

                        try {
                            if ((messageType === 'TEXT' || messageType === 'IMAGE' || messageType === 'VIDEO') && content && typeof content === 'string') {
                                let { activeRecipientId } = get();

                                if (!activeRecipientId && projectId) {
                                    try {
                                        let projs = useProjectStore.getState().projects;
                                        if (!projs || projs.length === 0) {
                                            try {
                                                await useProjectStore.getState().fetchProjects();
                                                projs = useProjectStore.getState().projects;
                                            } catch (e) {}
                                        }
                                        const proj = (projs || []).find(p => String(p._id || p.id) === String(projectId));
                                        if (proj) {
                                            const myId = currentUser._id.toString();
                                            const others = [proj.admin, ...(proj.collaborators || [])].filter(m => {
                                                if (!m) return false;
                                                const mId = (typeof m === 'object' ? (m._id || m.id) : m).toString();
                                                return mId !== myId;
                                            });
                                            if (others.length > 0) {
                                                activeRecipientId = (typeof others[0] === 'object' ? (others[0]._id || others[0].id) : others[0]).toString();
                                                set({ activeRecipientId });
                                            }
                                        }
                                    } catch (e) {}
                                }

                                if (activeRecipientId) {
                                    try {
                                        let myCurrentKeyId = useAuthStore.getState().myCurrentKeyId;
                                        if (!myCurrentKeyId) {
                                            await useAuthStore.getState()._initE2EEKeys();
                                            myCurrentKeyId = useAuthStore.getState().myCurrentKeyId;
                                        }

                                        // Wrap encryption preparation with a 4s timeout so it never hangs
                                        const secretObj = await Promise.race([
                                            getSharedSecret(activeRecipientId, myCurrentKeyId, 'LATEST'),
                                            new Promise(r => setTimeout(() => r(null), 4000))
                                        ]);

                                        if (secretObj && secretObj.sharedKey) {
                                            const encrypted = await encryptMessage(content, secretObj.sharedKey);
                                            finalContent = encrypted.ciphertext;
                                            iv = encrypted.iv;
                                            encryptionVersion = 1;
                                            resolvedSenderKeyId = myCurrentKeyId || 'legacy';
                                            resolvedRecipientKeyId = secretObj.theirKeyId || 'legacy';
                                        } else {
                                            console.warn("[E2EE] Secret key unresolvable with recipient, falling back safely:", activeRecipientId);
                                            finalContent = content;
                                            encryptionVersion = 0;
                                        }
                                    } catch (err) {
                                        console.warn("[E2EE] Encryption failed, sending plaintext fallback:", err);
                                        finalContent = content;
                                        encryptionVersion = 0;
                                    }
                                }
                            }

                            const payload = {
                                senderId: currentUser._id,
                                receiverId: get().activeRecipientId || undefined,
                                projectId,
                                content: finalContent,
                                iv,
                                encryptionVersion,
                                senderKeyId: resolvedSenderKeyId,
                                recipientKeyId: resolvedRecipientKeyId,
                                messageType,
                                clientMessageId,
                                selfDestructDuration: Number(options.selfDestructDuration) || 0,
                                viewOnce: Boolean(options.viewOnce)
                            };
                            if (replyToId) payload.replyTo = replyToId;

                            // Queue in pending messages
                            set(state => {
                                const newPending = [...(state.pendingMessages || [])];
                                if (!newPending.some(p => p.payload.clientMessageId === clientMessageId)) {
                                    newPending.push({ payload, optimisticMsg });
                                }
                                return { pendingMessages: newPending };
                            });

                            // Get active socket
                            let sock = useAuthStore.getState().socket;
                            if (!sock || !sock.connected) {
                                if (sock) sock.connect();
                                // Wait up to 3s for connection
                                await new Promise((r) => {
                                    sock = useAuthStore.getState().socket;
                                    if (sock && sock.connected) return r();
                                    const onConn = () => {
                                        if (sock) sock.off('connect', onConn);
                                        r();
                                    };
                                    if (sock) sock.once('connect', onConn);
                                    setTimeout(r, 3000);
                                });
                                sock = useAuthStore.getState().socket;
                            }

                            if (!sock || !sock.connected) {
                                console.warn('[Lifecycle] Socket still disconnected, keeping in pending queue and timing out after 15s');
                                setTimeout(() => {
                                    set(state => {
                                        const stillPending = state.pendingMessages.some(p => p.payload.clientMessageId === clientMessageId);
                                        if (stillPending) {
                                            const newPending = state.pendingMessages.filter(p => p.payload.clientMessageId !== clientMessageId);
                                            const newMsgs = state.messages.map(m => m.clientMessageId === clientMessageId ? { ...m, status: 'FAILED' } : m);
                                            const newCache = { ...state.messagesCache };
                                            newCache[projectId] = newMsgs;
                                            return { pendingMessages: newPending, messages: newMsgs, messagesCache: newCache };
                                        }
                                        return state;
                                    });
                                }, 15000);
                                return resolve({ status: 'queued', messageId: clientMessageId });
                            }

                            // Active emission with 15s timeout
                            sock.timeout(15000).emit("send_project_message", payload, (err, response) => {
                                if (err) {
                                    console.warn("[Lifecycle] Emit timeout for message:", clientMessageId);
                                    set(state => {
                                        const newPending = state.pendingMessages.filter(p => p.payload.clientMessageId !== clientMessageId);
                                        const newMsgs = state.messages.map(m => m.clientMessageId === clientMessageId ? { ...m, status: 'FAILED' } : m);
                                        const newCache = { ...state.messagesCache };
                                        newCache[projectId] = newMsgs;
                                        return { pendingMessages: newPending, messages: newMsgs, messagesCache: newCache };
                                    });
                                    resolve({ status: 'failed', error: 'Send timeout' });
                                } else if (response && response.status === 'ok') {
                                    set(state => {
                                        const newPending = state.pendingMessages.filter(p => p.payload.clientMessageId !== clientMessageId);
                                        const newMsgs = state.messages.map(m => {
                                            if (m.clientMessageId === clientMessageId) {
                                                return { ...m, _id: response.messageId, status: 'SENT' };
                                            }
                                            return m;
                                        });
                                        const newCache = { ...state.messagesCache };
                                        newCache[projectId] = newMsgs;
                                        return { pendingMessages: newPending, messages: newMsgs, messagesCache: newCache };
                                    });
                                    resolve(response);
                                } else {
                                    console.warn("[Lifecycle] Send rejected:", response);
                                    set(state => {
                                        const newPending = state.pendingMessages.filter(p => p.payload.clientMessageId !== clientMessageId);
                                        const newMsgs = state.messages.map(m => {
                                            if (m.clientMessageId === clientMessageId) {
                                                return { ...m, status: 'FAILED' };
                                            }
                                            return m;
                                        });
                                        const newCache = { ...state.messagesCache };
                                        newCache[projectId] = newMsgs;
                                        return { pendingMessages: newPending, messages: newMsgs, messagesCache: newCache };
                                    });
                                    resolve({ status: 'failed', error: response?.error || "Failed to send" });
                                }
                            });
                        } catch (outerErr) {
                            console.error("[Lifecycle] sendProjectMessage fatal error:", outerErr);
                            set(state => {
                                const newPending = state.pendingMessages.filter(p => p.payload.clientMessageId !== clientMessageId);
                                const newMsgs = state.messages.map(m => m.clientMessageId === clientMessageId ? { ...m, status: 'FAILED' } : m);
                                const newCache = { ...state.messagesCache };
                                newCache[projectId] = newMsgs;
                                return { pendingMessages: newPending, messages: newMsgs, messagesCache: newCache };
                            });
                            resolve({ status: 'failed', error: outerErr.message });
                        }
                    })();
                });
            },

            flushOfflineQueue: async () => {
                const socket = useAuthStore.getState().socket;
                get().flushPendingMessages(socket);
            },

            editProjectMessage: async (messageId, projectId, newContent) => {
                return new Promise((resolve, reject) => {
                    const socket = useAuthStore.getState().socket;
                    if (!socket) return reject(new Error("No active socket connection"));
                    const currentUser = useAuthStore.getState().user;

                    // Optimistically update the message in local state and cache right away (WhatsApp-style instant update)
                    const now = new Date().toISOString();
                    set(state => {
                        const newMsgs = state.messages.map(m => {
                            if (m._id === messageId || m.clientMessageId === messageId) {
                                return {
                                    ...m,
                                    content: newContent,
                                    edited: true,
                                    editedAt: now
                                };
                            }
                            return m;
                        });
                        const newCache = { ...state.messagesCache };
                        if (projectId) newCache[projectId] = newMsgs;
                        return { messages: newMsgs, messagesCache: newCache };
                    });

                    (async () => {
                        let finalContent = newContent;
                        let newIv = null;
                        let encryptionVersion = 0;

                        let { activeRecipientId } = get();
                        if (!activeRecipientId && projectId) {
                            try {
                                const proj = useProjectStore.getState().projects.find(p => p._id === projectId);
                                if (proj) {
                                    const myId = currentUser._id.toString();
                                    const others = [proj.admin, ...(proj.collaborators || [])].filter(m => {
                                        if (!m) return false;
                                        const mId = (typeof m === 'object' ? m._id : m).toString();
                                        return mId !== myId;
                                    });
                                    if (others.length > 0) {
                                        activeRecipientId = (typeof others[0] === 'object' ? others[0]._id : others[0]).toString();
                                    }
                                }
                            } catch (e) {}
                        }

                        if (activeRecipientId) {
                            try {
                                const secretObj = await getSharedSecret(activeRecipientId, null, 'LATEST');
                                const sharedKey = secretObj ? (secretObj.sharedKey || secretObj) : null;
                                if (sharedKey) {
                                    const encrypted = await encryptMessage(newContent, sharedKey);
                                    finalContent = encrypted.ciphertext;
                                    newIv = encrypted.iv;
                                    encryptionVersion = 1;
                                }
                            } catch (err) {
                                console.warn('[E2EE] Edit encryption failed, falling back to plaintext edit:', err);
                            }
                        }

                        socket.timeout(10000).emit("edit_project_message", {
                            messageId,
                            senderId: currentUser._id,
                            newContent: finalContent,
                            newIv,
                            encryptionVersion,
                            projectId
                        }, (err, response) => {
                            if (err) {
                                console.warn("Socket edit timeout/ack:", err);
                                resolve({ status: 'ok' }); // optimistic already applied
                            } else if (response && response.status === 'error') {
                                reject(new Error(response.message));
                            } else {
                                resolve(response || { status: 'ok' });
                            }
                        });
                    })();
                });
            },

            /**
             * Called when a real-time socket message arrives.
             * Decrypts E2EE messages before inserting into state.
             * NOTE: This is async — callers should use .catch() if needed.
             */
            addMessage: async (msg) => {
                const { activeRecipientId } = get();

                // Check if this message is from myself (optimistic update already handled it)
                const myId = useAuthStore.getState().user?._id?.toString();
                const senderId = typeof msg.sender === 'object' ? msg.sender?._id?.toString() : msg.sender?.toString();
                const isOwnMessage = senderId === myId;

                // Decrypt the incoming message and any nested replies using the unified pipeline
                let decryptedMsg = await decryptSingleMessage(msg, activeRecipientId);

                if (isOwnMessage) {
                    // Check if our own message was already perfectly preserved 
                    // We use clientMessageId to match our original frontend plaintext payload
                    if (msg.clientMessageId) {
                        const optimistic = get().messages.find(m => m.clientMessageId === msg.clientMessageId);
                        if (optimistic) {
                            decryptedMsg.content = optimistic.content; // keep perfectly preserved plaintext
                            if (optimistic.replyTo) {
                                decryptedMsg.replyTo = optimistic.replyTo; // preserve perfectly decrypted optimistic reply
                            }
                        }
                    }
                }

                // SAFETY NET: Cleaned up as the structure is heavily enforced now
                if (decryptedMsg.replyTo && decryptedMsg.replyTo.encryptionVersion === 1) {
                    decryptedMsg.replyTo.text = '⚠️ Nested decryption failed';
                }

                set((state) => {
                    const roomProjectId = decryptedMsg.projectId;
                    if (!roomProjectId) return state; // Ignore invalid messages

                    const currentMsgs = state.messagesCache[roomProjectId] || (state.currentProjectId === roomProjectId ? state.messages : []);

                    // RECONCILIATION
                    const newMessages = mergeMessages(currentMsgs, [decryptedMsg]);

                    return {
                        messages: state.currentProjectId === roomProjectId ? newMessages : state.messages,
                        messagesCache: { ...state.messagesCache, [roomProjectId]: newMessages }
                    };
                });
            },

            removeMessageFromUI: (messageId) => {
                set((state) => {
                    const newMessages = state.messages.filter(m => m._id !== messageId);
                    return {
                        messages: newMessages,
                        messagesCache: state.currentProjectId ? { ...state.messagesCache, [state.currentProjectId]: newMessages } : state.messagesCache
                    };
                });
            },

            updateMessage: async (updatedMsg) => {
                const { activeRecipientId } = get();
                const decryptedMsg = await decryptSingleMessage(updatedMsg, activeRecipientId);

                set((state) => {
                    const newMessages = state.messages.map(m => m._id === decryptedMsg._id ? decryptedMsg : m);
                    return {
                        messages: newMessages,
                        messagesCache: state.currentProjectId ? { ...state.messagesCache, [state.currentProjectId]: newMessages } : state.messagesCache
                    };
                });
            },

            deleteMessageLocally: (messageId) => {
                set((state) => {
                    const newMessages = state.messages.map(m =>
                        m._id === messageId ? { ...m, deleted: true, content: 'This message was deleted' } : m
                    );
                    return {
                        messages: newMessages,
                        messagesCache: state.currentProjectId ? { ...state.messagesCache, [state.currentProjectId]: newMessages } : state.messagesCache
                    };
                });
            },

            updateMessageStatus: (messageId, status) => {
                set(state => {
                    const newMessages = state.messages.map(m => m._id === messageId ? { ...m, status } : m);
                    return {
                        messages: newMessages,
                        messagesCache: state.currentProjectId ? { ...state.messagesCache, [state.currentProjectId]: newMessages } : state.messagesCache
                    };
                });
            },

            updateProjectMessagesStatus: (projectId, status, readerId) => {
                set(state => {
                    const newMessages = state.messages.map(m => {
                        const senderId = typeof m.sender === 'object' ? m.sender?._id : m.sender;
                        if (senderId !== readerId && m.status !== 'READ') {
                            return { ...m, status: 'READ' };
                        }
                        return m;
                    });
                    return {
                        messages: newMessages,
                        messagesCache: { ...state.messagesCache, [projectId]: newMessages }
                    };
                });
            },

            clearProjectChat: async (projectId) => {
                try {
                    const res = await apiFetch(`/api/chats/project/${projectId}/clear`, {
                        method: 'DELETE'
                    });
                    if (!res.ok) {
                        const data = await res.json();
                        throw new Error(data.message);
                    }
                    const socket = useAuthStore.getState().socket;
                    if (socket) socket.emit("clear_project_chat", projectId);
                    set(state => ({
                        messages: [],
                        messagesCache: { ...state.messagesCache, [projectId]: [] }
                    }));
                } catch (error) {
                    console.error("Error clearing chat:", error);
                }
            },

            clearMessagesLocally: () => {
                set(state => ({
                    messages: [],
                    messagesCache: state.currentProjectId ? { ...state.messagesCache, [state.currentProjectId]: [] } : state.messagesCache
                }));
            },

            updateChatsList: () => { /* bring chat to top */ }
        }),
        {
            name: 'chatapp-offline-cache',
            partialize: (state) => {
                // High-performance cache pruning: Only save the last 30 text messages per project
                // and strip massive Base64 images to prevent synchronous localStorage freezes!
                const sanitizedCache = {};
                if (state.messagesCache) {
                    for (const [pId, msgs] of Object.entries(state.messagesCache)) {
                        if (Array.isArray(msgs)) {
                            sanitizedCache[pId] = msgs.slice(-30).map(m => {
                                if (m.messageType === 'IMAGE' && typeof m.content === 'string' && m.content.startsWith('data:')) {
                                    return { ...m, content: '[Image attachment]' };
                                }
                                return m;
                            });
                        }
                    }
                }
                return {
                    messagesCache: sanitizedCache,
                    chats: state.chats || [],
                    pendingMessages: (state.pendingMessages || []).slice(-10)
                };
            },
        }
    )
);
