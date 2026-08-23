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
// Map<userId → CryptoKey>
const sharedSecretCache = new Map();

/**
 * Fetch the recipient's public key from backend and derive a shared AES-GCM secret.
 * Returns the CryptoKey or null if E2EE is unavailable.
 */
async function getSharedSecret(recipientId) {
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
        console.error('[E2EE] Failed to derive shared secret for', recipientId, err);
        return null;
    }
}

/**
 * Decrypt a single message object. If it can't be decrypted, show a safe fallback.
 */
async function decryptSingleMessage(msg) {
    // Only attempt decryption on TEXT messages with encryptionVersion ≥ 1
    if (!msg || msg.encryptionVersion !== 1 || msg.messageType !== 'TEXT' || msg.deleted) {
        return msg;
    }

    try {
        // Determine the OTHER person's ID to derive shared secret
        const myId = useAuthStore.getState().user?._id;
        const senderId = typeof msg.sender === 'object' ? msg.sender?._id : msg.sender;
        const recipientId = senderId === myId ? msg.receiver : senderId;
        if (!recipientId) return msg;

        const sharedKey = await getSharedSecret(recipientId.toString());
        if (!sharedKey) return { ...msg, content: '🔒 Unable to decrypt — key unavailable' };

        const plaintext = await decryptMessage(msg.content, msg.iv, sharedKey);
        return { ...msg, content: plaintext };
    } catch (err) {
        return { ...msg, content: '⚠️ Message decryption failed' };
    }
}

export const useChatStore = create((set, get) => ({
    chats: [],
    messages: [],
    activeChat: null,
    isChatsLoading: false,
    isMessagesLoading: false,
    currentProjectId: null,

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

            // Decrypt E2EE messages on the client before setting into state
            const decrypted = await Promise.all(data.map(decryptSingleMessage));
            set({ messages: decrypted });
        } catch (error) {
            console.error(error);
        } finally {
            set({ isMessagesLoading: false });
        }
    },

    setActiveChat: (chat) => {
        set({ activeChat: chat });
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

        // Only encrypt TEXT messages (not images, call records, etc.)
        if (messageType === 'TEXT' && content && typeof content === 'string') {
            // Determine recipient: need the "other" user's ID for key exchange
            // In a project chat we use the stored receiver context
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
                } catch (err) {
                    console.error('[E2EE] Encryption failed, falling back to plaintext:', err);
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

        // Optimistic UI Update — always show plaintext to the sender
        const optimisticMsg = {
            _id: clientMessageId,
            clientMessageId,
            sender: currentUser,
            projectId,
            content, // show original plaintext to sender
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

    // Set the active recipient so we know who to encrypt for
    setActiveRecipientId: (userId) => {
        sharedSecretCache.delete(userId); // clear cache when switching recipients
        set({ activeRecipientId: userId });
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

    addMessage: async (msg) => {
        // Decrypt incoming message before inserting into state
        const decryptedMsg = await decryptSingleMessage(msg);

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

    updateMessage: (updatedMsg) => {
        set((state) => ({
            messages: state.messages.map(m => m._id === updatedMsg._id ? updatedMsg : m)
        }));
    },

    deleteMessageLocally: (messageId) => {
        set((state) => ({
            messages: state.messages.map(m => m._id === messageId ? { ...m, deleted: true, content: 'This message was deleted' } : m)
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

    clearMessagesLocally: () => {
        set({ messages: [] });
    },

    updateChatsList: (msg) => {
        // Bring chat to top, etc
    }
}));
