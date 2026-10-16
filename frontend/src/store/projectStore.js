import { create } from 'zustand';
import { apiFetch } from '../utils/api';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const useProjectStore = create((set) => ({
    projects: [],
    isLoading: false,
    error: null,

    fetchProjects: async () => {
        set({ isLoading: true, error: null });
        try {
            const res = await apiFetch('/api/projects');
            if (!res.ok) throw new Error('Failed to fetch projects');
            const data = await res.json();

            // PRE-WARM E2EE KEYS: Eliminates the 300ms+ network waterfall on chat load
            try {
                const { useAuthStore } = await import('./authStore');
                const { preloadPublicKey } = await import('./chatStore');
                const currentUser = useAuthStore.getState().user;
                if (currentUser) {
                    data.forEach(p => {
                        const others = [p.admin, ...(p.collaborators || [])].filter(m => m && m._id !== currentUser._id);
                        others.forEach(m => {
                            if (m.publicKey) {
                                preloadPublicKey(m._id, m.publicKey);
                            }
                        });
                    });
                }
            } catch (e) {
                console.warn('[E2EE] Background key pre-warming failed', e);
            }

            set({ projects: data, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },

    createProject: async (name) => {
        set({ isCreating: true, error: null });
        try {
            const res = await apiFetch('/api/projects', {
                method: 'POST',
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Failed to create project');

            set((state) => {
                const exists = state.projects.some(p => p._id === data._id);
                return {
                    projects: exists ? state.projects : [data, ...state.projects],
                    isCreating: false
                };
            });
            return data;
        } catch (error) {
            set({ error: error.message, isCreating: false });
            throw error;
        }
    },

    deleteProject: async (projectId) => {
        try {
            const res = await apiFetch(`/api/projects/${projectId}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || 'Failed to delete project');
            }
            set((state) => ({ projects: state.projects.filter(p => p._id !== projectId) }));
            return true;
        } catch (error) {
            console.error("Failed to delete project:", error);
            alert(error.message || "Failed to delete project");
            throw error;
        }
    },

    addProjectRealtime: (newProject) => {
        if (!newProject || !newProject._id) return;
        set((state) => {
            const exists = state.projects.some(p => p._id === newProject._id);
            if (exists) {
                return {
                    projects: state.projects.map(p => p._id === newProject._id ? newProject : p)
                };
            }
            return { projects: [newProject, ...state.projects] };
        });
    },

    removeProjectRealtime: (projectId) => {
        if (!projectId) return;
        set((state) => ({
            projects: state.projects.filter(p => p._id !== projectId)
        }));
    },

    updateProjectRealtime: (updatedProject) => {
        if (!updatedProject || !updatedProject._id) return;
        set((state) => ({
            projects: state.projects.map(p => p._id === updatedProject._id ? updatedProject : p)
        }));
    },

    toggleScreenshotProtection: async (projectId) => {
        try {
            const res = await apiFetch(`/api/projects/${projectId}/screenshot-protection`, {
                method: 'PUT'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            set(state => ({
                projects: state.projects.map(p => p._id === projectId ? data : p)
            }));
        } catch (error) {
            console.error(error);
            alert("Failed to toggle screenshot protection");
        }
    },

    updateCollaboratorLastSeen: (userId, lastSeen) => {
        set((state) => ({
            projects: state.projects.map(project => {
                const updatedProject = { ...project };
                if (updatedProject.admin && updatedProject.admin._id === userId) {
                    updatedProject.admin = { ...updatedProject.admin, lastSeen };
                }
                if (updatedProject.collaborators) {
                    updatedProject.collaborators = updatedProject.collaborators.map(c =>
                        c._id === userId ? { ...c, lastSeen } : c
                    );
                }
                return updatedProject;
            })
        }));
    }
}));
