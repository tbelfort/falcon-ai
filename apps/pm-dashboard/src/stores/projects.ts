import { create } from 'zustand';
import { getProjects, isApiError } from '../api/client';
import type { AsyncState, ProjectDto } from '../types';

interface ProjectsStore {
  projectsState: AsyncState<ProjectDto[]>;
  selectedProjectId: string | null;
  fetchProjects: (signal?: AbortSignal) => Promise<void>;
  selectProject: (projectId: string) => void;
}

export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  projectsState: { status: 'idle' },
  selectedProjectId: null,
  fetchProjects: async (signal) => {
    set({ projectsState: { status: 'loading' } });
    try {
      const projects = await getProjects(signal);
      const selected = get().selectedProjectId ?? projects[0]?.id ?? null;
      set({ projectsState: { status: 'success', data: projects }, selectedProjectId: selected });
    } catch (error) {
      const message =
        isApiError(error) ? error.message : error instanceof Error ? error.message : 'Failed to load projects';
      set({ projectsState: { status: 'error', error: message } });
    }
  },
  selectProject: (projectId) => set({ selectedProjectId: projectId })
}));
