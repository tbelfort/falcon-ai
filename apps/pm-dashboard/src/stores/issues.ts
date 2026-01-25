import { create } from 'zustand';
import { api } from '../api/client';
import type { AsyncState, CommentDto, IssueDto, IssueStage, LabelDto } from '../types';
import { useUiStore } from './ui';

interface IssuesState {
  issues: AsyncState<IssueDto[]>;
  labels: AsyncState<LabelDto[]>;
  comments: Record<string, AsyncState<CommentDto[]>>;
  loadIssues: (projectId: string) => Promise<void>;
  loadLabels: (projectId: string) => Promise<void>;
  loadComments: (issueId: string) => Promise<void>;
  addComment: (issueId: string, content: string, authorName?: string) => Promise<void>;
  transitionIssue: (issueId: string, toStage: IssueStage) => Promise<void>;
  updateIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
  applyIssueUpdate: (issue: IssueDto) => void;
}

let issuesAbort: AbortController | null = null;
let labelsAbort: AbortController | null = null;

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong';
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
  issues: { status: 'idle' },
  labels: { status: 'idle' },
  comments: {},
  loadIssues: async (projectId) => {
    issuesAbort?.abort();
    const controller = new AbortController();
    issuesAbort = controller;

    set({ issues: { status: 'loading' } });
    try {
      const data = await api.getIssues(projectId, controller.signal);
      set({ issues: { status: 'success', data } });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      set({ issues: { status: 'error', error: getErrorMessage(error) } });
    }
  },
  loadLabels: async (projectId) => {
    labelsAbort?.abort();
    const controller = new AbortController();
    labelsAbort = controller;

    set({ labels: { status: 'loading' } });
    try {
      const data = await api.getLabels(projectId, controller.signal);
      set({ labels: { status: 'success', data } });
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      set({ labels: { status: 'error', error: getErrorMessage(error) } });
    }
  },
  loadComments: async (issueId) => {
    set((state) => ({
      comments: {
        ...state.comments,
        [issueId]: { status: 'loading' }
      }
    }));
    try {
      const data = await api.getComments(issueId);
      set((state) => ({
        comments: {
          ...state.comments,
          [issueId]: { status: 'success', data }
        }
      }));
    } catch (error) {
      set((state) => ({
        comments: {
          ...state.comments,
          [issueId]: { status: 'error', error: getErrorMessage(error) }
        }
      }));
    }
  },
  addComment: async (issueId, content, authorName) => {
    try {
      const comment = await api.addComment(issueId, { content, authorName });
      set((state) => {
        const current = state.comments[issueId];
        if (current?.status === 'success') {
          return {
            comments: {
              ...state.comments,
              [issueId]: {
                status: 'success',
                data: [...current.data, comment]
              }
            }
          };
        }
        return {
          comments: {
            ...state.comments,
            [issueId]: { status: 'success', data: [comment] }
          }
        };
      });
    } catch (error) {
      useUiStore.getState().setErrorBanner(getErrorMessage(error));
    }
  },
  transitionIssue: async (issueId, toStage) => {
    const state = get();
    if (state.issues.status !== 'success') {
      return;
    }
    const existing = state.issues.data.find((issue) => issue.id === issueId);
    if (!existing || existing.stage === toStage) {
      return;
    }

    const previousStage = existing.stage;
    set({
      issues: {
        status: 'success',
        data: state.issues.data.map((issue) =>
          issue.id === issueId ? { ...issue, stage: toStage } : issue
        )
      }
    });

    try {
      const updated = await api.transitionIssue(issueId, toStage);
      set((current) => {
        if (current.issues.status !== 'success') {
          return current;
        }
        return {
          issues: {
            status: 'success',
            data: current.issues.data.map((issue) =>
              issue.id === issueId ? updated : issue
            )
          }
        };
      });
    } catch (error) {
      set((current) => {
        if (current.issues.status !== 'success') {
          return current;
        }
        return {
          issues: {
            status: 'success',
            data: current.issues.data.map((issue) =>
              issue.id === issueId ? { ...issue, stage: previousStage } : issue
            )
          }
        };
      });
      useUiStore.getState().setErrorBanner(getErrorMessage(error));
    }
  },
  updateIssueLabels: async (issueId, labelIds) => {
    const state = get();
    if (state.issues.status !== 'success') {
      return;
    }
    const existing = state.issues.data.find((issue) => issue.id === issueId);
    if (!existing) {
      return;
    }
    const previousLabels = existing.labels;
    const availableLabels = state.labels.status === 'success' ? state.labels.data : [];
    const nextLabels = availableLabels.filter((label) => labelIds.includes(label.id));

    set({
      issues: {
        status: 'success',
        data: state.issues.data.map((issue) =>
          issue.id === issueId ? { ...issue, labels: nextLabels } : issue
        )
      }
    });

    try {
      const updated = await api.updateIssueLabels(issueId, labelIds);
      set((current) => {
        if (current.issues.status !== 'success') {
          return current;
        }
        return {
          issues: {
            status: 'success',
            data: current.issues.data.map((issue) =>
              issue.id === issueId ? updated : issue
            )
          }
        };
      });
    } catch (error) {
      set((current) => {
        if (current.issues.status !== 'success') {
          return current;
        }
        return {
          issues: {
            status: 'success',
            data: current.issues.data.map((issue) =>
              issue.id === issueId ? { ...issue, labels: previousLabels } : issue
            )
          }
        };
      });
      useUiStore.getState().setErrorBanner(getErrorMessage(error));
    }
  },
  applyIssueUpdate: (issue) => {
    set((state) => {
      if (state.issues.status !== 'success') {
        return state;
      }
      const exists = state.issues.data.some((item) => item.id === issue.id);
      return {
        issues: {
          status: 'success',
          data: exists
            ? state.issues.data.map((item) => (item.id === issue.id ? issue : item))
            : [...state.issues.data, issue]
        }
      };
    });
  }
}));
