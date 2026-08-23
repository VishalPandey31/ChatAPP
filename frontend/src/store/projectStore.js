import { create } from 'zustand';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const useProjectStore = create((set) => ({
    projects: [],
    isLoading: false,
    error: null,

    fetchProjects: async () => {
        set({ isLoading: true, error: null });
        try {
            const res = await fetch(`${BACKEND_URL}/api/projects`, { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch projects');
            const data = await res.json();
            set({ projects: data, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },

    createProject: async (name) => {
        set({ isCreating: true, error: null });
        try {
            const res = await fetch(`${BACKEND_URL}/api/projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.message);

            set((state) => ({ projects: [...state.projects, data], isCreating: false }));
            return data;
        } catch (error) {
            set({ error: error.message, isCreating: false });
            throw error;
        }
    },

    deleteProject: async (projectId) => {
        try {
            await fetch(`${BACKEND_URL}/api/projects/${projectId}`, { method: 'DELETE', credentials: 'include' });
            set((state) => ({ projects: state.projects.filter(p => p._id !== projectId) }));
        } catch (error) {
            console.error("Failed to delete project:", error);
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
