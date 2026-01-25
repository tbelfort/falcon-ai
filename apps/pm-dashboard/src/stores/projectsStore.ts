import { create } from 'zustand';
import { fetchLabels, fetchProjects } from '../api/client';
import type { LabelDto, ProjectDto } from '../api/types';
import { idleState, type AsyncState } from '../utils/asyncState';
import { getErrorMessage } from '../utils/errors';

interface ProjectsState {
  projectsState: AsyncState<ProjectDto[]>;
  labelsState: AsyncState<LabelDto[]>;
  selectedProjectId: string | null;
  loadProjects: () => Promise<void>;
  loadLabels: (projectId: string) => Promise<void>;
  selectProject: (projectId: string) => void;
}

export const useProjectsStore = create<ProjectsState>((set) => {
  let projectsAbort: AbortController | null = null;
  let labelsAbort: AbortController | null = null;

  return {
    projectsState: idleState,
    labelsState: idleState,
    selectedProjectId: null,
    loadProjects: async () => {
      projectsAbort?.abort();
      const controller = new AbortController();
      projectsAbort = controller;
      set({ projectsState: { status: 'loading' } });
      try {
        const data = await fetchProjects(controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        set({ projectsState: { status: 'success', data } });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        set({ projectsState: { status: 'error', error: getErrorMessage(error) } });
      }
    },
    loadLabels: async (projectId) => {
      labelsAbort?.abort();
      const controller = new AbortController();
      labelsAbort = controller;
      set({ labelsState: { status: 'loading' } });
      try {
        const data = await fetchLabels(projectId, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        set({ labelsState: { status: 'success', data } });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        set({ labelsState: { status: 'error', error: getErrorMessage(error) } });
      }
    },
    selectProject: (projectId) => set({ selectedProjectId: projectId }),
  };
});
