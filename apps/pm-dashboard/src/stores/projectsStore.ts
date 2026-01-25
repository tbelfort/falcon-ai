import { create } from 'zustand';
import { apiClient } from '../api/client';
import { AsyncState, ProjectDto } from '../api/types';
import { getErrorMessage, isAbortError } from '../utils/errors';

const idleState: AsyncState<ProjectDto[]> = { status: 'idle' };

type ProjectsState = {
  projects: AsyncState<ProjectDto[]>;
  activeProjectId: string | null;
  loadProjects: () => Promise<void>;
  setActiveProjectId: (projectId: string) => void;
};

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: idleState,
  activeProjectId: null,
  loadProjects: async () => {
    const current = get().projects;
    if (current.status === 'loading') {
      return;
    }
    set({ projects: { status: 'loading' } });
    try {
      const projects = await apiClient.getProjects();
      const activeProjectId = get().activeProjectId ?? projects[0]?.id ?? null;
      set({
        projects: { status: 'success', data: projects },
        activeProjectId
      });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      set({ projects: { status: 'error', error: getErrorMessage(error) } });
    }
  },
  setActiveProjectId: (projectId) => set({ activeProjectId: projectId })
}));
