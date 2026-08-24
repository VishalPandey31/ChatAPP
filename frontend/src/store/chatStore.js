import { create } from 'zustand';
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

export const clearUserEncryptionCache = (userId) => {
    if (userId) sharedSecretCache.delete(userId);
};

/**
 * Fetch the recipient's public key from backend and derive a shared AES-GCM secret.
 * Returns the CryptoKey or null if E2EE is unavailable.
 */
async function getSharedSecret(recipientId) {
    if (!recipientId) return null;
    if (sharedSecretCache.has(recipientId)) {
        return sharedSecretCache.get(recipientId);
    }

    const myPrivateKey = useAuthStore.getState().myPrivateKey;
    if (!myPrivateKey) return null;

    try {
        const res = await fetch(`${BACKEND_URL}/api/auth/keys/${recipientId}`, {
            credentials: 'include'
        });
        if (!res.ok) return null;
        const { publicKey: pubKeyJwk } = await res.json();
        const recipientPublicKey = await importPublicKey(pubKeyJwk);
        const sharedKey = await deriveSharedSecret(myPrivateKey, recipientPublicKey);
        sharedSecretCache.set(recipientId, sharedKey);
        return sharedKey;
    } catch (err) {
        console.warn('[E2EE] Could not derive shared secret for', recipientId);
        return null;
    }
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
        if (!recipientId) return decryptedMsg;

        const sharedKey = await getSharedSecret(recipientId);
        if (!sharedKey) {
            if (outerNeedsDecryption) decryptedMsg.content = '🔒 E2EE message (key not yet available)';
            if (innerNeedsDecryption) decryptedMsg.replyTo = { ...decryptedMsg.replyTo, content: '🔒 E2EE message (key not yet available)' };
            return decryptedMsg;
        }

        // Decrypt outer message if needed
        if (outerNeedsDecryption) {
            try {
                decryptedMsg.content = await decryptMessage(msg.content, msg.iv, sharedKey);
                // CRITICAL: Clear encryption flags after successful decryption to prevent
                // double-decryption on re-processing (optimistic replacement, updateMessage, etc.)
                decryptedMsg.encryptionVersion = 0;
                decryptedMsg.iv = null;
            } catch (err) {
                console.warn('[E2EE] Outer message decryption failed', msg._id, err.message);
                decryptedMsg.content = '⚠️ Message decryption failed';
                // WARNING: We must NOT delete the shared key cache here, otherwise legacy unrecoverable 
                // messages will trigger a severe API request flood for subsequent messages.
            }
        }

        // Decrypt inner reply if needed
        if (innerNeedsDecryption) {
            try {
                const replyPlaintext = await decryptMessage(decryptedMsg.replyTo.content, decryptedMsg.replyTo.iv, sharedKey);
                // CRITICAL: Clear encryption flags on replyTo after successful decryption
                decryptedMsg.replyTo = { ...decryptedMsg.replyTo, content: replyPlaintext, encryptionVersion: 0, iv: null };
            } catch (replyErr) {
                console.warn('[E2EE] Nested reply decryption failed', replyErr.message);
                decryptedMsg.replyTo = { ...decryptedMsg.replyTo, content: '⚠️ Message decryption failed' };
            }
        }

        return decryptedMsg;
    } catch (err) {
        // Absolute fallback for unexpected crypto initialization errors
        if (outerNeedsDecryption) decryptedMsg.content = '⚠️ Message decryption failed';
        if (innerNeedsDecryption) decryptedMsg.replyTo = { ...decryptedMsg.replyTo, content: '⚠️ Message decryption failed' };
        return decryptedMsg;
    }
}

// ─────────────────────────────────────────────────────────
// Zustand Store
// ─────────────────────────────────────────────────────────
export const useChatStore = create((set, get) => ({
    chats: [],
    messages: [],
    messagesCache: {}, // Local cache to prevent UI freeze: projectId -> messages array
    activeChat: null,
    isChatsLoading: false,
    isMessagesLoading: false,
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

        if (cached && !force) {
            set({ isMessagesLoading: false, currentProjectId: projectId, messages: cached });
            // Seamlessly fetch any missing messages in the background
            get().syncMissedMessages(projectId);
            return;
        }

        set({ isMessagesLoading: true, currentProjectId: projectId, messages: [] });
        try {
            const res = await fetch(`${BACKEND_URL}/api/chats/project/${projectId}`, { credentials: 'include' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            const { activeRecipientId } = get();

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

            set(state => ({
                messages: newMessages,
                messagesCache: { ...state.messagesCache, [projectId]: newMessages },
                isMessagesLoading: false
            }));
        } catch (error) {
            console.error(error);
            set({ isMessagesLoading: false });
        }
    },

    syncMissedMessages: async (projectId) => {
        const cached = get().messagesCache[projectId] || (get().currentProjectId === projectId ? get().messages : []);
        if (!cached || cached.length === 0) return;

        let latestDate = cached[0].createdAt;
        for (let m of cached) {
            if (new Date(m.createdAt) > new Date(latestDate)) {
                latestDate = m.createdAt;
            }
        }

        try {
            const res = await fetch(`${BACKEND_URL}/api/chats/project/${projectId}?after=${latestDate}`, { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            if (!data || data.length === 0) return;

            const { activeRecipientId } = get();
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
                    }
                });

                newMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                return {
                    messages: state.currentProjectId === projectId ? newMessages : state.messages,
                    messagesCache: { ...state.messagesCache, [projectId]: newMessages }
                };
            });
        } catch (err) {
            console.error("[E2EE] Sync failed", err);
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

        if (newId) sharedSecretCache.delete(newId); // clear stale cache on initial set
        set({ activeRecipientId: newId });
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

    sendProjectMessage: async (projectId, content, replyToId = null, messageType = 'TEXT') => {
        const socket = useAuthStore.getState().socket;
        if (!socket) return;

        const clientMessageId = `msg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const currentUser = useAuthStore.getState().user;

        let finalContent = content;
        let iv = null;
        let encryptionVersion = 0;

        // Only encrypt TEXT messages (never images, call records, etc.)
        if (messageType === 'TEXT' && content && typeof content === 'string') {
            const { activeRecipientId } = get();
            if (activeRecipientId) {
                try {
                    const sharedKey = await getSharedSecret(activeRecipientId);
                    if (sharedKey) {
                        const encrypted = await encryptMessage(content, sharedKey);
                        finalContent = encrypted.ciphertext;
                        iv = encrypted.iv;
                        encryptionVersion = 1;
                    }
                    // If no sharedKey, falls through as plaintext (key not yet uploaded)
                } catch (err) {
                    console.warn('[E2EE] Encryption failed, sending as plaintext:', err);
                    // Graceful degradation: send as plaintext
                    finalContent = content;
                    iv = null;
                    encryptionVersion = 0;
                }
            }
        }

        const payload = {
            senderId: currentUser._id,
            projectId,
            content: finalContent,
            iv,
            encryptionVersion,
            messageType,
            clientMessageId
        };
        if (replyToId) payload.replyTo = replyToId;

        // Optimistic UI Update — always show PLAINTEXT to the sender immediately
        const optimisticMsg = {
            _id: clientMessageId,
            clientMessageId,
            sender: currentUser,
            projectId,
            content,            // always show original plaintext in optimistic update
            iv,
            encryptionVersion,
            messageType,
            status: 'SENDING',
            createdAt: new Date().toISOString()
        };
        if (replyToId) {
            const replyMsg = get().messages.find(m => (m._id?.toString?.() || m._id) === (replyToId?.toString?.() || replyToId));
            if (replyMsg) {
                // Store a UI-safe snapshot: guaranteed decrypted plaintext content
                optimisticMsg.replyTo = {
                    _id: replyMsg._id,
                    content: replyMsg.content,
                    sender: replyMsg.sender,
                    messageType: replyMsg.messageType || 'TEXT',
                    deleted: replyMsg.deleted || false,
                    // CRITICAL: Force-clear encryption flags — this content is already decrypted in state
                    encryptionVersion: 0,
                    iv: null
                };
            }
        }

        set(state => {
            const newMessages = [...state.messages, optimisticMsg];
            return {
                messages: newMessages,
                messagesCache: { ...state.messagesCache, [projectId]: newMessages }
            };
        });
        socket.emit("send_project_message", payload);
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
            // If encryptionVersion is 1, our own message was already shown as plaintext via optimistic update. 
            // We preserve that plaintext to prevent flicker or fallback errors, but we keep the decrypted replyTo.
            if (msg.encryptionVersion === 1 && msg.clientMessageId) {
                const optimistic = get().messages.find(m => m.clientMessageId === msg.clientMessageId);
                if (optimistic) {
                    decryptedMsg.content = optimistic.content; // keep optimistic plaintext
                    if (optimistic.replyTo) {
                        decryptedMsg.replyTo = optimistic.replyTo; // preserve perfectly decrypted optimistic reply
                    }
                }
            }
        }

        // SAFETY NET: If replyTo still has encryptionVersion=1 after all decryption attempts,
        // it means ciphertext leaked through. Try one more time with a fresh key derivation.
        if (decryptedMsg.replyTo && (decryptedMsg.replyTo.encryptionVersion === 1 || !!decryptedMsg.replyTo.iv) && decryptedMsg.replyTo.messageType === 'TEXT' && !decryptedMsg.replyTo.deleted) {
            try {
                const storeRecipient = get().activeRecipientId;
                let fallbackRecipientId = storeRecipient;
                if (!fallbackRecipientId) {
                    const replySenderId = typeof decryptedMsg.replyTo.sender === 'object' ? decryptedMsg.replyTo.sender?._id?.toString() : decryptedMsg.replyTo.sender?.toString();
                    const myId2 = useAuthStore.getState().user?._id?.toString();
                    if (replySenderId && replySenderId !== myId2) fallbackRecipientId = replySenderId;
                    else if (senderId && senderId !== myId2) fallbackRecipientId = senderId;
                }
                if (fallbackRecipientId) {
                    const sharedKey = await getSharedSecret(fallbackRecipientId);
                    if (sharedKey) {
                        const replyPlaintext = await decryptMessage(decryptedMsg.replyTo.content, decryptedMsg.replyTo.iv, sharedKey);
                        decryptedMsg.replyTo = { ...decryptedMsg.replyTo, content: replyPlaintext, encryptionVersion: 0, iv: null };
                    }
                }
            } catch (safetyErr) {
                console.warn('[E2EE] Safety net replyTo decryption failed', safetyErr.message);
            }
        }

        set((state) => {
            let newMessages;
            if (decryptedMsg.clientMessageId) {
                const existingIndex = state.messages.findIndex(m => m.clientMessageId === decryptedMsg.clientMessageId);
                if (existingIndex > -1) {
                    newMessages = [...state.messages];
                    newMessages[existingIndex] = decryptedMsg;
                }
            }
            if (!newMessages) {
                const dupIndex = state.messages.findIndex(m => m._id === decryptedMsg._id);
                if (dupIndex > -1) return state;
                newMessages = [...state.messages, decryptedMsg];
            }

            return {
                messages: newMessages,
                messagesCache: state.currentProjectId ? { ...state.messagesCache, [state.currentProjectId]: newMessages } : state.messagesCache
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
}));
