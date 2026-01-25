import { create } from 'zustand';
import type { AsyncState, ProjectDto, LabelDto } from '../types';
import { apiClient } from '../api/client';

interface ProjectState {
  projects: AsyncState<ProjectDto[]>;
  selectedProjectId: string | null;
  labels: AsyncState<LabelDto[]>;

  fetchProjects: () => Promise<void>;
  selectProject: (projectId: string) => void;
  fetchLabels: (projectId: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: { status: 'idle' },
  selectedProjectId: null,
  labels: { status: 'idle' },

  fetchProjects: async () => {
    set({ projects: { status: 'loading' } });
    try {
      const data = await apiClient.getProjects();
      set({ projects: { status: 'success', data } });
      // Auto-select first project if none selected
      if (data.length > 0 && !get().selectedProjectId) {
        get().selectProject(data[0].id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch projects';
      set({ projects: { status: 'error', error: message } });
    }
  },

  selectProject: (projectId: string) => {
    set({ selectedProjectId: projectId });
    get().fetchLabels(projectId);
  },

  fetchLabels: async (projectId: string) => {
    set({ labels: { status: 'loading' } });
    try {
      const data = await apiClient.getLabels(projectId);
      set({ labels: { status: 'success', data } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch labels';
      set({ labels: { status: 'error', error: message } });
    }
  },
}));
