import { create } from 'zustand';
import { io } from 'socket.io-client';
import Cookies from 'js-cookie';
import { useProjectStore } from './projectStore';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const useAuthStore = create((set, get) => ({
    user: null,
    socket: null,
    isCheckingAuth: true,
    onlineUsers: [],
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
            return true;
        } catch (err) {
            console.error(err);
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
            return true;
        } catch (err) {
            console.error(err);
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
            set({ user: null, socket: null, onlineUsers: [] });
            Cookies.remove('token');

            import('../utils/pushService').then(({ unsubscribeFromPushNotifications }) => {
                unsubscribeFromPushNotifications();
            });
        } catch (err) {
            console.error(err);
        }
    },
    checkAuth: async () => {
        try {
            // Force logout on every reload/new tab to require re-login
            await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
            Cookies.remove('token');
        } catch (err) {
            console.error(err);
        } finally {
            set({ user: null, isCheckingAuth: false });
        }
    },
    connectSocket: () => {
        const user = get().user;
        if (!user || get().socket?.connected) return;

        const socket = io(BACKEND_URL, {
            query: { userId: user._id }
        });
        socket.connect();

        socket.on('connect', () => {
            socket.emit('join', user._id);
        });


        socket.on('initial_online_users', (userIds) => {
            set({ onlineUsers: userIds });
        });

        socket.on('user_status', ({ userId, status, lastSeen }) => {
            if (status === 'online') {
                set((state) => ({ onlineUsers: [...new Set([...state.onlineUsers, userId])] }));
            } else {
                set((state) => ({ onlineUsers: state.onlineUsers.filter(id => id !== userId) }));
                if (lastSeen) {
                    useProjectStore.getState().updateCollaboratorLastSeen(userId, lastSeen);
                }
            }
        });

        socket.on('user:removed', () => {
            alert('Your account has been removed by the administrator.');
            get().logout();
        });

        set({ socket });
    }
}));
