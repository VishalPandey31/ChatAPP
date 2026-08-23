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
            set({ messages: data });
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

        const payload = {
            senderId: useAuthStore.getState().user._id,
            projectId,
            content,
            messageType,
            clientMessageId
        };
        if (replyToId) payload.replyTo = replyToId;

        // Optimistic UI Update
        const optimisticMsg = {
            _id: clientMessageId, // temporary ID
            clientMessageId,
            sender: useAuthStore.getState().user,
            projectId,
            content,
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

    addMessage: (msg) => {
        set((state) => {
            // Replace if we have it optimistically
            if (msg.clientMessageId) {
                const existingIndex = state.messages.findIndex(m => m.clientMessageId === msg.clientMessageId);
                if (existingIndex > -1) {
                    const newMessages = [...state.messages];
                    newMessages[existingIndex] = msg;
                    return { messages: newMessages };
                }
            }
            // Also prevent duplicates by _id
            const dupIndex = state.messages.findIndex(m => m._id === msg._id);
            if (dupIndex > -1) {
                return state;
            }
            return { messages: [...state.messages, msg] };
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
