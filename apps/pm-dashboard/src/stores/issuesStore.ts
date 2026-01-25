import { create } from 'zustand';
import type { IssueDto, IssueStage } from '../api/types';
import { fetchIssues, transitionIssue, updateIssueLabels } from '../api/client';
import { getErrorMessage, isAbortError } from '../api/errors';
import type { AsyncState } from '../utils/asyncState';

interface IssuesState {
  issuesState: AsyncState<IssueDto[]>;
  errorBanner: string | null;
  fetchIssues: (projectId: string, signal?: AbortSignal) => Promise<void>;
  transitionIssue: (issueId: string, toStage: IssueStage) => Promise<void>;
  updateIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
  applyIssueUpdate: (issue: IssueDto) => void;
  removeIssue: (issueId: string) => void;
  clearError: () => void;
}

const updateIssueList = (issues: IssueDto[], updated: IssueDto) => {
  const index = issues.findIndex((issue) => issue.id === updated.id);
  if (index === -1) {
    return [...issues, updated];
  }
  return issues.map((issue) => (issue.id === updated.id ? updated : issue));
};

export const useIssuesStore = create<IssuesState>((set, get) => ({
  issuesState: { status: 'idle' },
  errorBanner: null,
  fetchIssues: async (projectId, signal) => {
    set({ issuesState: { status: 'loading' } });
    try {
      const issues = await fetchIssues(projectId, signal);
      set({ issuesState: { status: 'success', data: issues } });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      set({ issuesState: { status: 'error', error: getErrorMessage(error) } });
    }
  },
  transitionIssue: async (issueId, toStage) => {
    const state = get().issuesState;
    if (state.status !== 'success') {
      return;
    }
    const currentIssue = state.data.find((issue) => issue.id === issueId);
    if (!currentIssue || currentIssue.stage === toStage) {
      return;
    }
    const previousStage = currentIssue.stage;
    const optimisticIssues = state.data.map((issue) =>
      issue.id === issueId ? { ...issue, stage: toStage } : issue
    );
    set({ issuesState: { status: 'success', data: optimisticIssues }, errorBanner: null });

    try {
      const updated = await transitionIssue(issueId, toStage);
      set((current) => {
        if (current.issuesState.status !== 'success') {
          return current;
        }
        return {
          issuesState: { status: 'success', data: updateIssueList(current.issuesState.data, updated) }
        };
      });
    } catch (error) {
      set((current) => {
        if (current.issuesState.status !== 'success') {
          return current;
        }
        const reverted = current.issuesState.data.map((issue) =>
          issue.id === issueId ? { ...issue, stage: previousStage } : issue
        );
        return {
          issuesState: { status: 'success', data: reverted },
          errorBanner: getErrorMessage(error)
        };
      });
    }
  },
  updateIssueLabels: async (issueId, labelIds) => {
    try {
      const updated = await updateIssueLabels(issueId, labelIds);
      set((current) => {
        if (current.issuesState.status !== 'success') {
          return current;
        }
        return {
          issuesState: { status: 'success', data: updateIssueList(current.issuesState.data, updated) }
        };
      });
    } catch (error) {
      set({ errorBanner: getErrorMessage(error) });
    }
  },
  applyIssueUpdate: (issue) => {
    set((current) => {
      if (current.issuesState.status !== 'success') {
        return current;
      }
      return {
        issuesState: { status: 'success', data: updateIssueList(current.issuesState.data, issue) }
      };
    });
  },
  removeIssue: (issueId) => {
    set((current) => {
      if (current.issuesState.status !== 'success') {
        return current;
      }
      return {
        issuesState: {
          status: 'success',
          data: current.issuesState.data.filter((issue) => issue.id !== issueId)
        }
      };
    });
  },
  clearError: () => set({ errorBanner: null })
}));
