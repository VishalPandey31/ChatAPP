import { create } from 'zustand';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const useAdminStore = create((set, get) => ({
    users: [],
    isLoading: false,
    error: null,
    fetchUsers: async () => {
        set({ isLoading: true });
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);
            set({ users: data, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },
    createUser: async (userData) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(userData)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            set((state) => ({ users: [...state.users, data] }));
            return data;
        } catch (error) {
            throw error;
        }
    },
    updateUserStatus: async (userId, action) => {
        // action: 'approve' | 'reject' | 'restore'
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}/${action}`, {
                method: 'PUT',
                credentials: 'include'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            set((state) => ({
                users: state.users.map(u => (u._id === userId ? data.user : u))
            }));
        } catch (error) {
            throw error;
        }
    },
    removeUser: async (userId) => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/admin/users/${userId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            set((state) => ({
                users: state.users.map(u => (u._id === userId ? data.user : u))
            }));
        } catch (error) {
            throw error;
        }
    }
}));
