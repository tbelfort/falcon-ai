import { create } from 'zustand';
import type { IssueDto, IssueStage, AsyncState, CommentDto } from '../api/types';
import { apiClient, ApiClientError } from '../api/client';

interface IssueState {
  issues: AsyncState<IssueDto[]>;
  comments: AsyncState<CommentDto[]>;
  optimisticUpdates: Map<string, IssueStage>; // issueId -> original stage for rollback

  fetchIssues: (projectId: string) => Promise<void>;
  transitionIssue: (issueId: string, toStage: IssueStage) => Promise<void>;
  updateIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
  fetchComments: (issueId: string) => Promise<void>;
  addComment: (issueId: string, content: string, authorName?: string) => Promise<void>;

  // For real-time updates
  updateIssue: (issue: IssueDto) => void;
  addCommentToCache: (comment: CommentDto) => void;
}

export const useIssueStore = create<IssueState>((set, get) => ({
  issues: { status: 'idle' },
  comments: { status: 'idle' },
  optimisticUpdates: new Map(),

  fetchIssues: async (projectId: string) => {
    set({ issues: { status: 'loading' } });
    try {
      const data = await apiClient.getIssues(projectId);
      set({ issues: { status: 'success', data } });
    } catch (e) {
      const message = e instanceof ApiClientError ? e.message : 'Failed to fetch issues';
      set({ issues: { status: 'error', error: message } });
    }
  },

  transitionIssue: async (issueId: string, toStage: IssueStage) => {
    const state = get();
    if (state.issues.status !== 'success') return;

    const currentIssues = state.issues.data;
    const issue = currentIssues.find((i) => i.id === issueId);
    if (!issue) return;

    const originalStage = issue.stage;

    // Optimistic update
    const optimisticUpdates = new Map(state.optimisticUpdates);
    optimisticUpdates.set(issueId, originalStage);

    const updatedIssues = currentIssues.map((i) =>
      i.id === issueId ? { ...i, stage: toStage } : i
    );
    set({
      issues: { status: 'success', data: updatedIssues },
      optimisticUpdates,
    });

    try {
      const updatedIssue = await apiClient.transitionIssue(issueId, toStage);
      // Update with server response
      const currentState = get().issues;
      const finalIssues = currentState.status === 'success'
        ? currentState.data.map((i: IssueDto) => (i.id === issueId ? updatedIssue : i))
        : [updatedIssue];

      optimisticUpdates.delete(issueId);
      set({
        issues: { status: 'success', data: finalIssues },
        optimisticUpdates,
      });
    } catch (e) {
      // Rollback on error
      const rollbackState = get().issues;
      const rollbackIssues = rollbackState.status === 'success'
        ? rollbackState.data.map((i: IssueDto) =>
            i.id === issueId ? { ...i, stage: originalStage } : i
          )
        : currentIssues;

      optimisticUpdates.delete(issueId);
      set({
        issues: { status: 'success', data: rollbackIssues },
        optimisticUpdates,
      });

      // Re-throw so UI can show error
      throw e;
    }
  },

  updateIssueLabels: async (issueId: string, labelIds: string[]) => {
    try {
      const updatedIssue = await apiClient.updateIssueLabels(issueId, labelIds);
      const state = get();
      if (state.issues.status === 'success') {
        const updatedIssues = state.issues.data.map((i) =>
          i.id === issueId ? updatedIssue : i
        );
        set({ issues: { status: 'success', data: updatedIssues } });
      }
    } catch (e) {
      throw e;
    }
  },

  fetchComments: async (issueId: string) => {
    set({ comments: { status: 'loading' } });
    try {
      const data = await apiClient.getComments(issueId);
      set({ comments: { status: 'success', data } });
    } catch (e) {
      const message = e instanceof ApiClientError ? e.message : 'Failed to fetch comments';
      set({ comments: { status: 'error', error: message } });
    }
  },

  addComment: async (issueId: string, content: string, authorName?: string) => {
    const comment = await apiClient.addComment(issueId, content, authorName);
    get().addCommentToCache(comment);
  },

  updateIssue: (issue: IssueDto) => {
    const state = get();
    if (state.issues.status !== 'success') return;

    const existingIndex = state.issues.data.findIndex((i) => i.id === issue.id);
    if (existingIndex >= 0) {
      const updatedIssues = [...state.issues.data];
      updatedIssues[existingIndex] = issue;
      set({ issues: { status: 'success', data: updatedIssues } });
    } else {
      set({ issues: { status: 'success', data: [...state.issues.data, issue] } });
    }
  },

  addCommentToCache: (comment: CommentDto) => {
    const state = get();
    if (state.comments.status === 'success') {
      set({ comments: { status: 'success', data: [...state.comments.data, comment] } });
    }
  },
}));
