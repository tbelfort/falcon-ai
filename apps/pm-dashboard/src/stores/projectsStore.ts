import { create } from 'zustand';
import type { LabelDto, ProjectDto } from '../api/types';
import { fetchLabels, fetchProjects } from '../api/client';
import { getErrorMessage, isAbortError } from '../api/errors';
import type { AsyncState } from '../utils/asyncState';

interface ProjectsState {
  projectsState: AsyncState<ProjectDto[]>;
  labelsState: AsyncState<LabelDto[]>;
  selectedProjectId: string | null;
  fetchProjects: (signal?: AbortSignal) => Promise<void>;
  selectProject: (projectId: string) => void;
  fetchLabels: (projectId: string, signal?: AbortSignal) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projectsState: { status: 'idle' },
  labelsState: { status: 'idle' },
  selectedProjectId: null,
  fetchProjects: async (signal) => {
    set({ projectsState: { status: 'loading' } });
    try {
      const projects = await fetchProjects(signal);
      const selectedProjectId = get().selectedProjectId ?? projects[0]?.id ?? null;
      set({ projectsState: { status: 'success', data: projects }, selectedProjectId });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      set({ projectsState: { status: 'error', error: getErrorMessage(error) } });
    }
  },
  selectProject: (projectId) => {
    set({ selectedProjectId: projectId, labelsState: { status: 'idle' } });
  },
  fetchLabels: async (projectId, signal) => {
    set({ labelsState: { status: 'loading' } });
    try {
      const labels = await fetchLabels(projectId, signal);
      set({ labelsState: { status: 'success', data: labels } });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      set({ labelsState: { status: 'error', error: getErrorMessage(error) } });
    }
  }
}));
