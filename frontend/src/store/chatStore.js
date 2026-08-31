import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useAuthStore } from './authStore';
import {
    importPublicKey,
    deriveSharedSecret,
    encryptMessage,
    decryptMessage,
} from '../utils/cryptoUtils';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

// In-memory cache of derived shared secrets per userId
const sharedSecretCache = new Map();
// Promise memoization cache to prevent Cache Stampede during parallel decryption mapping
const sharedSecretPromiseCache = new Map();

export const clearUserEncryptionCache = (userId) => {
    if (userId) {
        sharedSecretCache.delete(userId);
        sharedSecretPromiseCache.delete(userId);
    }
};

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
            const authState = useAuthStore.getState();
            let myPrivateKey;

            // 1. Resolve My Private Key from the Key Ring
            if (myRequiredKeyId && authState.myKeyRing?.keys?.[myRequiredKeyId]) {
                const jwkObj = authState.myKeyRing.keys[myRequiredKeyId];
                myPrivateKey = await importPrivateKey(jwkObj.privateKeyJwk);
            } else if (!myRequiredKeyId) {
                // Legacy unversioned
                if (!authState.myPrivateKey) await authState._initE2EEKeys();
                myPrivateKey = useAuthStore.getState().myPrivateKey;
            } else {
                console.warn(`[E2EE] Permanent Lockout: Device lacks historical private key -> ${myRequiredKeyId}`);
                return null;
            }

            if (!myPrivateKey) return null;

            // 2. Fetch recipient Public Key Ring
            const res = await fetch(`${BACKEND_URL}/api/auth/keys/${recipientId}`, {
                credentials: 'include'
            });
            if (!res.ok) return null;
            const data = await res.json(); // { publicKey, publicKeys: [{keyId, publicKey}] }

            let theirPublicKeyJwk = null;
            let resolvedTheirKeyId = null;

            if (theirRequiredKeyId === 'LATEST' && data.publicKeys && data.publicKeys.length > 0) {
                // Pluck the exact newest key for sending brand new messages
                const latest = data.publicKeys[data.publicKeys.length - 1];
                theirPublicKeyJwk = latest.publicKey;
                resolvedTheirKeyId = latest.keyId;
            } else if (theirRequiredKeyId && theirRequiredKeyId !== 'LATEST' && data.publicKeys) {
                // Pluck historical key for decrypting old messages
                const found = data.publicKeys.find(k => k.keyId === theirRequiredKeyId);
                if (found) theirPublicKeyJwk = found.publicKey;
            }

            // Absolute legacy fallback
            if (!theirPublicKeyJwk && data.publicKey) {
                theirPublicKeyJwk = data.publicKey;
            }

            if (!theirPublicKeyJwk) return null;

            const recipientPublicKey = await importPublicKey(theirPublicKeyJwk);
            const sharedKey = await deriveSharedSecret(myPrivateKey, recipientPublicKey);

            const resultObj = { sharedKey, theirKeyId: resolvedTheirKeyId };
            sharedSecretCache.set(cacheKey, resultObj);
            return resultObj;
        } catch (err) {
            console.warn('[E2EE] Could not derive shared secret for', recipientId);
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
    const outerNeedsDecryption = ((msg.encryptionVersion === 1 || !!msg.iv) && msg.messageType === 'TEXT' && !msg.deleted);
    const innerNeedsDecryption = (msg.replyTo && (msg.replyTo.encryptionVersion === 1 || !!msg.replyTo.iv) && msg.replyTo.messageType === 'TEXT' && !msg.replyTo.deleted);

    if (!outerNeedsDecryption && !innerNeedsDecryption) {
        return decryptedMsg; // nothing to decrypt
    }

    let recipientId = activeRecipientId;
    try {
        const myId = useAuthStore.getState().user?._id?.toString();
        const senderId = typeof msg.sender === 'object' ? msg.sender?._id?.toString() : msg.sender?.toString();

        if (!recipientId) {
            if (senderId === myId) {
                recipientId = msg.receiver?.toString?.() || msg.receiver;
            } else {
                recipientId = senderId;
            }
        }
        // For project messages sent by ourselves, receiver is absent.
        // Fall back to the replyTo sender or derive from the store's cached recipientId.
        if (!recipientId && msg.projectId) {
            const storeRecipient = useChatStore.getState().activeRecipientId;
            if (storeRecipient) {
                recipientId = storeRecipient;
            } else if (msg.replyTo) {
                const replySenderId = typeof msg.replyTo.sender === 'object' ? msg.replyTo.sender?._id?.toString() : msg.replyTo.sender?.toString();
                if (replySenderId && replySenderId !== myId) recipientId = replySenderId;
            }
        }

        // Project fallback 1: scan the entire messages cache for someone else
        if (!recipientId && msg.projectId) {
            const cachedMsgs = useChatStore.getState().messagesCache[msg.projectId] || useChatStore.getState().messages || [];
            const otherMsg = cachedMsgs.find(m => {
                const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                return sId && sId !== myId;
            });
            if (otherMsg) {
                recipientId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
            }
        }

        // Project fallback 2 (Ultimate): look up the project directly in projectStore to find the other member
        if (!recipientId && msg.projectId) {
            // Dynamically import to prevent circular dependency if needed, but it's usually safe here
            try {
                const { useProjectStore } = await import('./projectStore');
                const project = useProjectStore.getState().projects.find(p => p._id === msg.projectId);
                if (project) {
                    const others = [project.admin, ...(project.collaborators || [])].filter(m => {
                        if (!m) return false;
                        const mId = (typeof m === 'object' ? m._id : m).toString();
                        return mId !== myId;
                    });
                    if (others.length > 0) {
                        recipientId = (typeof others[0] === 'object' ? others[0]._id : others[0]).toString();
                    }
                }
            } catch (e) {
                console.warn('[E2EE] Could not load projectStore for recipientId fallback', e);
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

        if (!sharedKey) {
            if (outerNeedsDecryption) {
                decryptedMsg.originalCiphertext = msg.originalCiphertext || msg.content;
                decryptedMsg.content = '🔒 Encrypted (Key Missing)';
                decryptedMsg.decryptionState = 'FAILED_MISSING_KEY';
            }
            if (innerNeedsDecryption) {
                decryptedMsg.replyTo = {
                    ...decryptedMsg.replyTo,
                    originalCiphertext: msg.replyTo.originalCiphertext || msg.replyTo.content,
                    content: '🔒 Encrypted (Key Missing)'
                };
            }
            return decryptedMsg;
        }

        // Decrypt outer message if needed
        if (outerNeedsDecryption) {
            try {
                const targetCipher = msg.originalCiphertext || msg.content;
                decryptedMsg.content = await decryptMessage(targetCipher, msg.iv, sharedKey);
                // CRITICAL: Clear encryption flags after successful decryption to prevent
                // double-decryption on re-processing (optimistic replacement, updateMessage, etc.)
                decryptedMsg.encryptionVersion = 0;
                decryptedMsg.iv = null;
                delete decryptedMsg.originalCiphertext;
            } catch (err) {
                console.warn('[E2EE/Crypto] Strict Decryption Failure:', {
                    cause: err.message || 'Signature mismatch / Wrong Key',
                    messageId: msg._id,
                    senderId,
                    projectId: msg.projectId,
                    algorithm: 'AES-GCM 256'
                });
                // DO NOT delete originalCiphertext here. It allows retries/recovery later!
                decryptedMsg.originalCiphertext = msg.originalCiphertext || msg.content;
                decryptedMsg.content = '🔒 Encrypted (Key Rotated)';
                decryptedMsg.decryptionState = 'FAILED_ROTATED';
            }
        }

        // Decrypt inner reply if needed
        if (innerNeedsDecryption) {
            try {
                const targetCipher = decryptedMsg.replyTo.originalCiphertext || decryptedMsg.replyTo.content;
                const replyPlaintext = await decryptMessage(targetCipher, decryptedMsg.replyTo.iv, sharedKey);
                decryptedMsg.replyTo = {
                    id: decryptedMsg.replyTo._id || decryptedMsg.replyTo.id,
                    senderId: typeof decryptedMsg.replyTo.sender === 'object' ? (decryptedMsg.replyTo.sender._id || decryptedMsg.replyTo.sender.id) : decryptedMsg.replyTo.sender,
                    text: replyPlaintext,
                    messageType: decryptedMsg.replyTo.messageType || 'TEXT'
                };
            } catch (replyErr) {
                console.warn('[E2EE/Crypto] Nested reply decryption failed');
                decryptedMsg.replyTo = {
                    id: decryptedMsg.replyTo._id || decryptedMsg.replyTo.id,
                    senderId: typeof decryptedMsg.replyTo.sender === 'object' ? (decryptedMsg.replyTo.sender._id || decryptedMsg.replyTo.sender.id) : decryptedMsg.replyTo.sender,
                    originalCiphertext: decryptedMsg.replyTo.originalCiphertext || decryptedMsg.replyTo.content,
                    text: '🔒 Encrypted (Key Rotated)',
                    messageType: decryptedMsg.replyTo.messageType || 'TEXT'
                };
            }
        } else if (decryptedMsg.replyTo) {
            // Already readable or non-text message
            decryptedMsg.replyTo = {
                id: decryptedMsg.replyTo._id || decryptedMsg.replyTo.id,
                senderId: typeof decryptedMsg.replyTo.sender === 'object' ? (decryptedMsg.replyTo.sender._id || decryptedMsg.replyTo.sender.id) : decryptedMsg.replyTo.sender,
                text: decryptedMsg.replyTo.content || decryptedMsg.replyTo.text,
                messageType: decryptedMsg.replyTo.messageType || 'TEXT'
            };
        }

        return decryptedMsg;
    } catch (err) {
        // Absolute fallback for unexpected crypto initialization errors
        if (outerNeedsDecryption) {
            decryptedMsg.content = '🔒 Encryption Failed';
            decryptedMsg.decryptionState = 'FAILED_CRYPTO';
        }
        if (innerNeedsDecryption) decryptedMsg.replyTo = {
            id: decryptedMsg.replyTo._id || decryptedMsg.replyTo.id,
            senderId: typeof decryptedMsg.replyTo.sender === 'object' ? (decryptedMsg.replyTo.sender._id || decryptedMsg.replyTo.sender.id) : decryptedMsg.replyTo.sender,
            text: '🔒 Encryption Failed',
            messageType: decryptedMsg.replyTo.messageType || 'TEXT'
        };
        return decryptedMsg;
    }
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
                    const res = await fetch(`${BACKEND_URL}/api/chats`, { credentials: 'include' });
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
                    const res = await fetch(`${BACKEND_URL}/api/chats/${userId}`, { credentials: 'include' });
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

                // Self-healing: Detect permanently corrupted string in cache
                const isCorrupted = cached && cached.some(m => typeof m.content === 'string' && (
                    m.content.includes('key not yet available') ||
                    m.content.includes('Message decryption failed') ||
                    m.content.includes('Encrypted (Key Rotated)') ||
                    m.content.includes('Encrypted (Key Missing)') ||
                    m.content.includes('Encrypted (Missing Sender Key)') ||
                    m.content.includes('Encryption Failed')
                ));

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
                    const res = await fetch(`${BACKEND_URL}/api/chats/project/${projectId}`, { credentials: 'include' });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message);

                    let { activeRecipientId } = get();

                    // Heuristic extraction for activeRecipientId if unmounted or delayed in ChatApp
                    if (!activeRecipientId) {
                        const myId = useAuthStore.getState().user?._id?.toString();
                        const otherMsg = data.find(m => {
                            const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                            return sId && sId !== myId;
                        });
                        if (otherMsg) {
                            activeRecipientId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
                        }
                    }

                    // PARALLEL BATCH DECRYPTION: Resolves all E2EE messages including deep nested replyTos before DOM insertion
                    const decryptedMessages = await Promise.all(
                        data.map(msg => decryptSingleMessage(msg, activeRecipientId))
                    );

                    // Preserve pending optimistic messages correctly to append
                    const currentMsgs = get().messages;
                    const optimisticPending = currentMsgs.filter(m => m.status === 'SENDING' && m.projectId === projectId);

                    const newMessages = [...decryptedMessages];
                    optimisticPending.forEach(opt => {
                        if (!newMessages.find(m => m.clientMessageId === opt.clientMessageId)) {
                            newMessages.push(opt);
                        }
                    });

                    // Enforce deterministic sorting by createdAt and _id as fallback
                    newMessages.sort((a, b) => {
                        const dateDiff = new Date(a.createdAt) - new Date(b.createdAt);
                        if (dateDiff === 0) {
                            if (!a._id || !b._id) return 0;
                            return a._id.toString().localeCompare(b._id.toString());
                        }
                        return dateDiff;
                    });

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

            loadMoreProjectMessages: async (projectId) => {
                const currentMessages = get().messagesCache[projectId] || get().messages;
                if (!currentMessages || currentMessages.length === 0) return;

                const oldestMessage = currentMessages[0];
                const oldestMessageDate = oldestMessage.createdAt;
                const oldestMessageId = oldestMessage._id || oldestMessage.id;

                try {
                    const res = await fetch(`${BACKEND_URL}/api/chats/project/${projectId}?before=${oldestMessageDate}&beforeId=${oldestMessageId}`, { credentials: 'include' });
                    if (!res.ok) return;
                    const data = await res.json();

                    if (data.length === 0) return;

                    let { activeRecipientId } = get();
                    if (!activeRecipientId) {
                        const myId = useAuthStore.getState().user?._id?.toString();
                        const otherMsg = data.find(m => {
                            const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                            return sId && sId !== myId;
                        });
                        if (otherMsg) {
                            activeRecipientId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
                        }
                    }

                    const decryptedMessages = await Promise.all(
                        data.map(msg => decryptSingleMessage(msg, activeRecipientId))
                    );

                    set(state => {
                        const existingMsgs = state.messagesCache[projectId] || (state.currentProjectId === projectId ? state.messages : []);

                        // Carefully merge avoiding any duplicates
                        let mergedMap = new Map();
                        existingMsgs.forEach(m => mergedMap.set(m._id || m.clientMessageId, m));
                        decryptedMessages.forEach(m => {
                            if (!mergedMap.has(m._id || m.clientMessageId)) {
                                mergedMap.set(m._id || m.clientMessageId, m);
                            }
                        });

                        const newMessages = Array.from(mergedMap.values());
                        newMessages.sort((a, b) => {
                            const dateDiff = new Date(a.createdAt) - new Date(b.createdAt);
                            if (dateDiff === 0) {
                                if (!a._id || !b._id) return 0;
                                return a._id.toString().localeCompare(b._id.toString());
                            }
                            return dateDiff;
                        });

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
                    const res = await fetch(`${BACKEND_URL}/api/chats/project/${projectId}?limit=50`, { credentials: 'include' });
                    if (!res.ok) return;
                    const data = await res.json();
                    if (!data || data.length === 0) return;

                    let { activeRecipientId } = get();
                    if (!activeRecipientId) {
                        const myId = useAuthStore.getState().user?._id?.toString();
                        const otherMsg = data.find(m => {
                            const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                            return sId && sId !== myId;
                        });
                        if (otherMsg) {
                            activeRecipientId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
                        }
                    }

                    const decryptedMessages = await Promise.all(
                        data.map(msg => decryptSingleMessage(msg, activeRecipientId))
                    );

                    set(state => {
                        const currentCache = state.messagesCache[projectId] || (state.currentProjectId === projectId ? state.messages : []);
                        let newMessages = [...currentCache];

                        decryptedMessages.forEach(dec => {
                            const existsClient = dec.clientMessageId && newMessages.find(m => m.clientMessageId === dec.clientMessageId);
                            const existsId = newMessages.find(m => m._id === dec._id);

                            if (existsClient) {
                                newMessages[newMessages.indexOf(existsClient)] = dec;
                            } else if (!existsId) {
                                newMessages.push(dec);
                            } else {
                                // Overwrite existing cache aggressively to enforce correctness of status/edited states in the gap
                                newMessages[newMessages.indexOf(existsId)] = { ...existsId, ...dec };
                            }
                        });

                        // Post-sync scrub: fail any SENDING messages not actively queued
                        const pendingQ = state.pendingMessages || [];
                        newMessages.forEach(m => {
                            if (m.status === 'SENDING' && !pendingQ.some(p => p.payload.clientMessageId === m.clientMessageId)) {
                                m.status = 'FAILED';
                            }
                        });

                        newMessages.sort((a, b) => {
                            const dateDiff = new Date(a.createdAt) - new Date(b.createdAt);
                            if (dateDiff === 0) {
                                if (!a._id || !b._id) return 0;
                                return a._id.toString().localeCompare(b._id.toString());
                            }
                            return dateDiff;
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
                    const res = await fetch(`${BACKEND_URL}/api/chats/project/${projectId}/recover?limit=${limit}`, { credentials: 'include' });
                    if (!res.ok) throw new Error("Recovery forbidden or failed.");
                    const data = await res.json();
                    if (!data || data.length === 0) return 0;

                    let { activeRecipientId } = get();
                    if (!activeRecipientId) {
                        const myId = useAuthStore.getState().user?._id?.toString();
                        const otherMsg = data.find(m => {
                            const sId = typeof m.sender === 'object' ? m.sender?._id?.toString() : m.sender?.toString();
                            return sId && sId !== myId;
                        });
                        if (otherMsg) activeRecipientId = typeof otherMsg.sender === 'object' ? otherMsg.sender?._id?.toString() : otherMsg.sender?.toString();
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

            sendMessage: async (receiverId, content) => {
                const socket = useAuthStore.getState().socket;
                if (!socket) return;
                socket.emit("send_message", {
                    senderId: useAuthStore.getState().user._id,
                    receiverId,
                    content,
                    messageType: 'TEXT'
                });
            },

            flushPendingMessages: (activeSocket) => {
                const { pendingMessages } = get();
                if (!activeSocket || !pendingMessages || pendingMessages.length === 0) return;

                pendingMessages.forEach(({ payload, optimisticMsg }) => {
                    // Force timeout tracking on reconnect buffer flush to prevent hanging again
                    activeSocket.timeout(5000).emit("send_project_message", payload, (err, response) => {
                        if (err) {
                            console.warn("[Lifecycle] Message flush timeout... keeping in queue", err);
                            activeSocket.disconnect();
                            activeSocket.connect();
                        } else if (response && response.status === 'ok') {
                            set(state => {
                                const newPending = state.pendingMessages.filter(p => p.payload.clientMessageId !== payload.clientMessageId);
                                const newMessages = state.messages.map(m => {
                                    if (m.clientMessageId === payload.clientMessageId) return { ...m, status: 'SENT' };
                                    return m;
                                });
                                const newCache = { ...state.messagesCache };
                                if (payload.projectId) {
                                    newCache[payload.projectId] = newMessages;
                                }
                                return { pendingMessages: newPending, messages: newMessages, messagesCache: newCache };
                            });
                        }
                    });
                });
            },

            sendProjectMessage: async (projectId, content, replyToId = null, messageType = 'TEXT') => {
                return new Promise((resolve, reject) => {
                    const socket = useAuthStore.getState().socket;
                    if (!socket) return reject(new Error("No active socket connection"));

                    const clientMessageId = `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                    const currentUser = useAuthStore.getState().user;

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
                        createdAt: new Date().toISOString()
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

                    // 2. Process Crypto and Network payload asynchronously
                    (async () => {
                        let finalContent = content;
                        let iv = null;
                        let encryptionVersion = 0;
                        let resolvedSenderKeyId = null;
                        let resolvedRecipientKeyId = null;

                        if (messageType === 'TEXT' && content && typeof content === 'string') {
                            const { activeRecipientId } = get();
                            if (activeRecipientId) {
                                try {
                                    const myCurrentKeyId = useAuthStore.getState().myCurrentKeyId;
                                    const secretObj = await getSharedSecret(activeRecipientId, myCurrentKeyId, 'LATEST');
                                    if (secretObj && secretObj.sharedKey) {
                                        const encrypted = await encryptMessage(content, secretObj.sharedKey);
                                        finalContent = encrypted.ciphertext;
                                        iv = encrypted.iv;
                                        encryptionVersion = 1;
                                        resolvedSenderKeyId = myCurrentKeyId;
                                        resolvedRecipientKeyId = secretObj.theirKeyId;
                                    } else {
                                        return reject(new Error("E2EE Secret Key unresolvable. Message halted to prevent plaintext transmission."));
                                    }
                                } catch (err) {
                                    return reject(new Error("Encryption algorithm failed. Message halted to prevent plaintext transmission."));
                                }
                            }
                        }

                        const payload = {
                            senderId: currentUser._id,
                            projectId,
                            content: finalContent,
                            iv,
                            encryptionVersion,
                            senderKeyId: resolvedSenderKeyId,
                            recipientKeyId: resolvedRecipientKeyId,
                            messageType,
                            clientMessageId
                        };
                        if (replyToId) payload.replyTo = replyToId;

                        // Safely queue the background emission
                        set(state => {
                            const newPending = [...(state.pendingMessages || [])];
                            if (!newPending.some(p => p.payload.clientMessageId === clientMessageId)) {
                                newPending.push({ payload, optimisticMsg });
                            }
                            return { pendingMessages: newPending };
                        });

                        // Smart emission with zombie socket timeout
                        if (!socket.connected) {
                            console.warn('[Lifecycle] Socket disconnected naturally, queued pending msg and forcing network connect');
                            socket.connect();
                            return reject(new Error("Socket disconnected. Message queued for when connection restores."));
                        }

                        socket.timeout(5000).emit("send_project_message", payload, (err, response) => {
                            if (err) {
                                console.warn("[Lifecycle] Zombie socket detected on emit timeout. Enforcing reconnect.", err);
                                socket.disconnect();
                                socket.connect();
                                reject(new Error("Message send timeout"));
                            } else if (response && response.status === 'ok') {
                                // Wipe from pending list and transition SENDING -> SENT
                                set(state => {
                                    const newPending = state.pendingMessages.filter(p => p.payload.clientMessageId !== clientMessageId);
                                    const newMsgs = state.messages.map(m => m.clientMessageId === clientMessageId ? { ...m, status: 'SENT' } : m);
                                    const newCache = { ...state.messagesCache };
                                    newCache[projectId] = newMsgs;
                                    return { pendingMessages: newPending, messages: newMsgs, messagesCache: newCache };
                                });
                                resolve(response);
                            } else {
                                reject(new Error(response?.message || "Failed to send message."));
                            }
                        });
                    })();
                });
            },

            editProjectMessage: async (messageId, projectId, newContent) => {
                return new Promise((resolve, reject) => {
                    const socket = useAuthStore.getState().socket;
                    if (!socket) return reject(new Error("No active socket connection"));
                    const currentUser = useAuthStore.getState().user;

                    (async () => {
                        let finalContent = newContent;
                        let newIv = null;
                        let encryptionVersion = 0;

                        const { activeRecipientId } = get();
                        if (activeRecipientId) {
                            try {
                                const sharedKey = await getSharedSecret(activeRecipientId);
                                if (sharedKey) {
                                    const encrypted = await encryptMessage(newContent, sharedKey);
                                    finalContent = encrypted.ciphertext;
                                    newIv = encrypted.iv;
                                    encryptionVersion = 1;
                                }
                            } catch (err) {
                                console.warn('[E2EE] Edit encryption failed', err);
                            }
                        }

                        socket.emit("edit_project_message", {
                            messageId,
                            senderId: currentUser._id,
                            newContent: finalContent,
                            newIv,
                            encryptionVersion,
                            projectId
                        }, (err, response) => {
                            if (err) reject(new Error("Timeout editing message"));
                            else if (response && response.status === 'error') reject(new Error(response.message));
                            else resolve(response);
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
                    let newMessages = [...currentMsgs];

                    let foundAndUpdated = false;

                    // Safe deduplication loop
                    for (let i = 0; i < newMessages.length; i++) {
                        const m = newMessages[i];
                        if (decryptedMsg.clientMessageId && m.clientMessageId === decryptedMsg.clientMessageId) {
                            newMessages[i] = decryptedMsg;
                            foundAndUpdated = true;
                            break;
                        }
                        if (m._id === decryptedMsg._id) {
                            foundAndUpdated = true;
                            break;
                        }
                    }

                    if (!foundAndUpdated) {
                        newMessages.push(decryptedMsg);
                    }

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

                // As a safeguard for our own edited messages matching the optimistic fix
                const myId = useAuthStore.getState().user?._id?.toString();
                const senderId = typeof updatedMsg.sender === 'object' ? updatedMsg.sender?._id?.toString() : updatedMsg.sender?.toString();

                // ONLY if it's not a text message, we keep content. Editing encrypted messages is not supported anyway!
                if (senderId === myId && updatedMsg.encryptionVersion === 1) {
                    const existing = get().messages.find(m => m._id === updatedMsg._id);
                    if (existing && decryptedMsg.content === '⚠️ Message decryption failed') {
                        decryptedMsg.content = existing.content;
                    }
                }

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
                    const res = await fetch(`${BACKEND_URL}/api/chats/project/${projectId}/clear`, {
                        method: 'DELETE',
                        credentials: 'include'
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
            partialize: (state) => ({
                messagesCache: state.messagesCache,
                chats: state.chats
            }),
        }
    )
);
