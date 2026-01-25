import { create } from 'zustand';
import type { ProjectDto } from '../types';
import { api, ApiClientError } from '../api/client';

interface ProjectState {
  projects: ProjectDto[];
  currentProjectId: string | null;
  loading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  setCurrentProject: (id: string) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProjectId: null,
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await api.getProjects();
      set({ projects, loading: false });
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Failed to fetch projects';
      set({ error: message, loading: false });
    }
  },

  setCurrentProject: (id: string) => {
    set({ currentProjectId: id });
  },
}));
