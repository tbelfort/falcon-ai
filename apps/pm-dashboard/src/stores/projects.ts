import { create } from 'zustand';
import { api } from '../api/client';
import type { AsyncState, ProjectDto } from '../types';

interface ProjectsState {
  projects: AsyncState<ProjectDto[]>;
  selectedProjectId: string | null;
  loadProjects: () => Promise<void>;
  selectProject: (projectId: string) => void;
}

let projectsAbort: AbortController | null = null;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong';
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: { status: 'idle' },
  selectedProjectId: null,
  loadProjects: async () => {
    projectsAbort?.abort();
    const controller = new AbortController();
    projectsAbort = controller;

    set({ projects: { status: 'loading' } });
    try {
      const data = await api.getProjects(controller.signal);
      set({ projects: { status: 'success', data } });
      if (!get().selectedProjectId && data.length > 0) {
        set({ selectedProjectId: data[0].id });
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      set({ projects: { status: 'error', error: getErrorMessage(error) } });
    }
  },
  selectProject: (projectId) => set({ selectedProjectId: projectId })
}));
