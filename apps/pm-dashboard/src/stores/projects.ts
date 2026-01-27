import { create } from 'zustand';
import { fetchProjects } from '@/api/client';
import type { ProjectDto } from '@/api/types';
import type { AsyncState } from './types';
import { errorState, idleState, loadingState, successState } from './types';

type ProjectState = {
  projects: AsyncState<ProjectDto[]>;
  selectedProjectId: string | null;
  loadProjects: () => Promise<void>;
  selectProject: (projectId: string) => void;
  reset: () => void;
  abortController: AbortController | null;
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: idleState,
  selectedProjectId: null,
  abortController: null,
  loadProjects: async () => {
    const { abortController: current } = get();
    if (current) {
      current.abort();
    }

    const controller = new AbortController();
    set({ projects: loadingState, abortController: controller });

    try {
      const projects = await fetchProjects(controller.signal);
      const selectedProjectId = projects[0]?.id ?? null;
      set({ projects: successState(projects), selectedProjectId, abortController: null });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to load projects';
      set({ projects: errorState(message), abortController: null });
    }
  },
  selectProject: (projectId) => set({ selectedProjectId: projectId }),
  reset: () => set({ projects: idleState, selectedProjectId: null, abortController: null }),
}));
