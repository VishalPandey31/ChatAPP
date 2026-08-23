import { create } from 'zustand';
import { useAuthStore } from './authStore';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

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

            // At this point, `data` is an array of Message objects.
            // Some are legacy plaintext (encryptionVersion: 0), some are Base64 ciphertext (encryptionVersion: 1).
            // We must map and conditionally decrypt them before they hit the UI.

            const me = useAuthStore.getState().user;
            const project = useProjectStore.getState().projects.find(p => p._id === projectId);
            const myKeyPair = await loadKeyPair(me._id);

            let sharedSecret = null;
            if (project && myKeyPair) {
                const allMembers = [project.admin, ...(project.collaborators || [])].filter(Boolean);
                const otherUser = allMembers.find(m => m._id !== me._id);
                if (otherUser && otherUser.publicKey) {
                    const importedPubKey = await importPublicKey(otherUser.publicKey);
                    if (importedPubKey) sharedSecret = await deriveSecretKey(myKeyPair.privateKey, importedPubKey);
                }
            }

            const decryptedMessages = await Promise.all(data.map(async (msg) => {
                if (msg.encryptionVersion === 1 && sharedSecret) {
                    // Try to decrypt
                    const plaintext = await decryptMessage(msg.content, msg.iv, sharedSecret);
                    return { ...msg, content: plaintext };
                }
                return msg;
            }));

            set({ messages: decryptedMessages });
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
        // Obsolete function, usually bypasses project flow. Re-route to sendProjectMessage if heavily used.
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

        const me = useAuthStore.getState().user;
        const project = useProjectStore.getState().projects.find(p => p._id === projectId);

        let finalContent = content;
        let finalIv = null;
        let finalVersion = 0; // default to legacy (0)

        if (project && messageType !== 'CALL_RECORD') {
            const myKeyPair = await loadKeyPair(me._id);
            const allMembers = [project.admin, ...(project.collaborators || [])].filter(Boolean);
            const otherUser = allMembers.find(m => m._id !== me._id);

            if (myKeyPair && otherUser && otherUser.publicKey) {
                const importedPubKey = await importPublicKey(otherUser.publicKey);
                if (importedPubKey) {
                    const sharedSecret = await deriveSecretKey(myKeyPair.privateKey, importedPubKey);
                    if (sharedSecret) {
                        const encrypted = await encryptMessage(content, sharedSecret);
                        if (encrypted) {
                            finalContent = encrypted.ciphertext;
                            finalIv = encrypted.iv;
                            finalVersion = 1;
                        }
                    }
                }
            }
        }

        const payload = {
            senderId: me._id,
            projectId,
            content: finalContent,
            iv: finalIv,
            encryptionVersion: finalVersion,
            messageType,
            clientMessageId
        };
        if (replyToId) payload.replyTo = replyToId;

        // Optimistic UI Update (should render the plaintext, not the ciphertext)
        const optimisticMsg = {
            _id: clientMessageId, // temporary ID
            clientMessageId,
            sender: me,
            projectId,
            content, // the UI always reads the original plaintext!
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

    editProjectMessage: async (projectId, messageId, newContent) => {
        const socket = useAuthStore.getState().socket;
        const me = useAuthStore.getState().user;
        if (!socket || !me) return;

        const project = useProjectStore.getState().projects.find(p => p._id === projectId);
        let finalContent = newContent;

        if (project) {
            const myKeyPair = await loadKeyPair(me._id);
            const allMembers = [project.admin, ...(project.collaborators || [])].filter(Boolean);
            const otherUser = allMembers.find(m => m._id !== me._id);

            if (myKeyPair && otherUser && otherUser.publicKey) {
                const importedPubKey = await importPublicKey(otherUser.publicKey);
                if (importedPubKey) {
                    const sharedSecret = await deriveSecretKey(myKeyPair.privateKey, importedPubKey);
                    if (sharedSecret) {
                        const encrypted = await encryptMessage(newContent, sharedSecret);
                        if (encrypted) {
                            finalContent = encrypted.ciphertext;
                            // Note: backend uses the old IV, so we just overwrite content
                        }
                    }
                }
            }
        }

        // Optimistic UI update (shows plaintext)
        set((state) => ({
            messages: state.messages.map(m => m._id === messageId ? { ...m, content: newContent, edited: true } : m)
        }));

        socket.emit("edit_project_message", {
            messageId,
            senderId: me._id,
            newContent: finalContent,
            projectId
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
            // Emit socket to clear for everyone
            const socket = useAuthStore.getState().socket;
            if (socket) socket.emit("clear_project_chat", projectId);

            set({ messages: [] });
        } catch (error) {
            console.error("Error clearing chat:", error);
        }
    },

    addMessage: async (msg) => {
        let finalMsg = { ...msg };
        if (msg.encryptionVersion === 1) {
            const me = useAuthStore.getState().user;
            const project = useProjectStore.getState().projects.find(p => p._id === msg.projectId);
            if (me && project) {
                const myKeyPair = await loadKeyPair(me._id);
                const allMembers = [project.admin, ...(project.collaborators || [])].filter(Boolean);
                const otherUser = allMembers.find(m => m._id !== me._id);
                if (myKeyPair && otherUser && otherUser.publicKey) {
                    const importedPubKey = await importPublicKey(otherUser.publicKey);
                    if (importedPubKey) {
                        const sharedSecret = await deriveSecretKey(myKeyPair.privateKey, importedPubKey);
                        if (sharedSecret) {
                            const plaintext = await decryptMessage(msg.content, msg.iv, sharedSecret);
                            finalMsg.content = plaintext;
                        }
                    }
                }
            }
        }

        set((state) => {
            // Replace if we have it optimistically
            if (finalMsg.clientMessageId) {
                const existingIndex = state.messages.findIndex(m => m.clientMessageId === finalMsg.clientMessageId);
                if (existingIndex > -1) {
                    const newMessages = [...state.messages];
                    newMessages[existingIndex] = finalMsg;
                    return { messages: newMessages };
                }
            }
            // Also prevent duplicates by _id
            const dupIndex = state.messages.findIndex(m => m._id === finalMsg._id);
            if (dupIndex > -1) {
                return state;
            }
            return { messages: [...state.messages, finalMsg] };
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
