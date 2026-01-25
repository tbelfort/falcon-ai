import { create } from 'zustand';
import type { AsyncState, IssueDto, CommentDto, IssueStage } from '../types';
import { apiClient, ApiClientError } from '../api/client';

interface IssueState {
  issues: AsyncState<IssueDto[]>;
  selectedIssueId: string | null;
  comments: AsyncState<CommentDto[]>;
  error: string | null;

  fetchIssues: (projectId: string) => Promise<void>;
  selectIssue: (issueId: string | null) => void;
  fetchComments: (issueId: string) => Promise<void>;
  addComment: (issueId: string, content: string) => Promise<void>;
  transitionIssue: (issueId: string, toStage: IssueStage) => Promise<void>;
  updateIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
  updateIssueOptimistic: (issueId: string, stage: IssueStage) => IssueDto | null;
  revertIssue: (issue: IssueDto) => void;
  clearError: () => void;
  handleWsEvent: (event: string, data: unknown) => void;
}

export const useIssueStore = create<IssueState>((set, get) => ({
  issues: { status: 'idle' },
  selectedIssueId: null,
  comments: { status: 'idle' },
  error: null,

  fetchIssues: async (projectId: string) => {
    set({ issues: { status: 'loading' } });
    try {
      const data = await apiClient.getIssues(projectId);
      set({ issues: { status: 'success', data } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch issues';
      set({ issues: { status: 'error', error: message } });
    }
  },

  selectIssue: (issueId: string | null) => {
    set({ selectedIssueId: issueId, comments: { status: 'idle' } });
    if (issueId) {
      get().fetchComments(issueId);
    }
  },

  fetchComments: async (issueId: string) => {
    set({ comments: { status: 'loading' } });
    try {
      const data = await apiClient.getComments(issueId);
      set({ comments: { status: 'success', data } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch comments';
      set({ comments: { status: 'error', error: message } });
    }
  },

  addComment: async (issueId: string, content: string) => {
    const newComment = await apiClient.addComment(issueId, content);
    const state = get().comments;
    if (state.status === 'success') {
      set({ comments: { status: 'success', data: [...state.data, newComment] } });
    }
  },

  transitionIssue: async (issueId: string, toStage: IssueStage) => {
    // Clear any previous error
    set({ error: null });

    // Save original state for revert
    const originalIssue = get().updateIssueOptimistic(issueId, toStage);
    if (!originalIssue) return;

    try {
      const updated = await apiClient.transitionIssue(issueId, toStage);
      // Update with server response
      const state = get().issues;
      if (state.status === 'success') {
        set({
          issues: {
            status: 'success',
            data: state.data.map(i => i.id === issueId ? updated : i),
          },
        });
      }
    } catch (err) {
      // Revert optimistic update
      get().revertIssue(originalIssue);

      if (err instanceof ApiClientError) {
        set({ error: `Transition failed: ${err.message}` });
      } else {
        set({ error: 'Failed to transition issue' });
      }
    }
  },

  updateIssueLabels: async (issueId: string, labelIds: string[]) => {
    const updated = await apiClient.updateIssueLabels(issueId, labelIds);
    const state = get().issues;
    if (state.status === 'success') {
      set({
        issues: {
          status: 'success',
          data: state.data.map(i => i.id === issueId ? updated : i),
        },
      });
    }
  },

  updateIssueOptimistic: (issueId: string, stage: IssueStage) => {
    const state = get().issues;
    if (state.status !== 'success') return null;

    const issue = state.data.find(i => i.id === issueId);
    if (!issue) return null;

    const original = { ...issue };
    set({
      issues: {
        status: 'success',
        data: state.data.map(i => i.id === issueId ? { ...i, stage } : i),
      },
    });

    return original;
  },

  revertIssue: (issue: IssueDto) => {
    const state = get().issues;
    if (state.status !== 'success') return;

    set({
      issues: {
        status: 'success',
        data: state.data.map(i => i.id === issue.id ? issue : i),
      },
    });
  },

  clearError: () => set({ error: null }),

  handleWsEvent: (event: string, data: unknown) => {
    const state = get().issues;
    if (state.status !== 'success') return;

    switch (event) {
      case 'issue.created': {
        const issue = data as IssueDto;
        set({ issues: { status: 'success', data: [...state.data, issue] } });
        break;
      }
      case 'issue.updated': {
        const issue = data as IssueDto;
        set({
          issues: {
            status: 'success',
            data: state.data.map(i => i.id === issue.id ? issue : i),
          },
        });
        break;
      }
      case 'issue.deleted': {
        const { id } = data as { id: string };
        set({
          issues: {
            status: 'success',
            data: state.data.filter(i => i.id !== id),
          },
        });
        break;
      }
      case 'comment.created': {
        const comment = data as CommentDto;
        const commentState = get().comments;
        if (commentState.status === 'success' && get().selectedIssueId === comment.issueId) {
          set({ comments: { status: 'success', data: [...commentState.data, comment] } });
        }
        break;
      }
    }
  },
}));
