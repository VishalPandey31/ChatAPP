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
    const outerNeedsDecryption = (msg.encryptionVersion === 1 && msg.messageType === 'TEXT' && !msg.deleted);
    const innerNeedsDecryption = (msg.replyTo && msg.replyTo.encryptionVersion === 1 && msg.replyTo.messageType === 'TEXT' && !msg.replyTo.deleted);

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
            } catch (err) {
                console.warn('[E2EE] Outer message decryption failed', msg._id, err.message);
                decryptedMsg.content = '⚠️ Message decryption failed';
                sharedSecretCache.delete(recipientId);
            }
        }

        // Decrypt inner reply if needed
        if (innerNeedsDecryption) {
            try {
                const replyPlaintext = await decryptMessage(decryptedMsg.replyTo.content, decryptedMsg.replyTo.iv, sharedKey);
                decryptedMsg.replyTo = { ...decryptedMsg.replyTo, content: replyPlaintext };
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

    getProjectMessages: async (projectId) => {
        set({ isMessagesLoading: true, currentProjectId: projectId });
        try {
            const res = await fetch(`${BACKEND_URL}/api/chats/project/${projectId}`, { credentials: 'include' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            // INSTANT RENDER: show all messages immediately with encrypted ones showing placeholder
            const instantMessages = data.map(msg => {
                if (msg.encryptionVersion === 1 && msg.messageType === 'TEXT' && !msg.deleted) {
                    return { ...msg, content: '🔒 Decrypting...', _needsDecrypt: true };
                }
                return msg;
            });
            set({ messages: instantMessages, isMessagesLoading: false });

            // PROGRESSIVE DECRYPTION: decrypt in background, update one by one
            const { activeRecipientId } = get();
            for (let i = 0; i < data.length; i++) {
                const msg = data[i];
                try {
                    const decrypted = await decryptSingleMessage(msg, activeRecipientId);
                    if (decrypted !== msg) { // Only dispatch state update if decryption actually changed it
                        set(state => ({
                            messages: state.messages.map(m =>
                                m._id === decrypted._id ? { ...decrypted, _needsDecrypt: false } : m
                            )
                        }));
                    }
                } catch (e) {
                    // Handled inside decryptSingleMessage
                }
            }
        } catch (error) {
            console.error(error);
            set({ isMessagesLoading: false });
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
            const replyMsg = get().messages.find(m => m._id === replyToId);
            if (replyMsg) optimisticMsg.replyTo = replyMsg;
        }

        set(state => ({ messages: [...state.messages, optimisticMsg] }));
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
                }
            }
        }

        set((state) => {
            if (decryptedMsg.clientMessageId) {
                const existingIndex = state.messages.findIndex(m => m.clientMessageId === decryptedMsg.clientMessageId);
                if (existingIndex > -1) {
                    const newMessages = [...state.messages];
                    newMessages[existingIndex] = decryptedMsg;
                    return { messages: newMessages };
                }
            }
            const dupIndex = state.messages.findIndex(m => m._id === decryptedMsg._id);
            if (dupIndex > -1) return state;
            return { messages: [...state.messages, decryptedMsg] };
        });
    },

    removeMessageFromUI: (messageId) => {
        set((state) => ({
            messages: state.messages.filter(m => m._id !== messageId)
        }));
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

        set((state) => ({
            messages: state.messages.map(m => m._id === decryptedMsg._id ? decryptedMsg : m)
        }));
    },

    deleteMessageLocally: (messageId) => {
        set((state) => ({
            messages: state.messages.map(m =>
                m._id === messageId ? { ...m, deleted: true, content: 'This message was deleted' } : m
            )
        }));
    },

    updateMessageStatus: (messageId, status) => {
        set(state => ({
            messages: state.messages.map(m => m._id === messageId ? { ...m, status } : m)
        }));
    },

    updateProjectMessagesStatus: (projectId, status, readerId) => {
        set(state => ({
            messages: state.messages.map(m => {
                const senderId = typeof m.sender === 'object' ? m.sender?._id : m.sender;
                if (senderId !== readerId && m.status !== 'READ') {
                    return { ...m, status: 'READ' };
                }
                return m;
            })
        }));
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
            set({ messages: [] });
        } catch (error) {
            console.error("Error clearing chat:", error);
        }
    },

    clearMessagesLocally: () => {
        set({ messages: [] });
    },

    updateChatsList: () => { /* bring chat to top */ }
}));
