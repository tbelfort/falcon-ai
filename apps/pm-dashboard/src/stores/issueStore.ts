import { create } from 'zustand';
import type { IssueDto, LabelDto, CommentDto, IssueStage } from '../types';
import { api, ApiClientError } from '../api/client';
import { useUIStore } from './uiStore';

interface IssueState {
  issues: IssueDto[];
  labels: LabelDto[];
  comments: Record<string, CommentDto[]>;
  loading: boolean;
  error: string | null;
  fetchIssues: (projectId: string) => Promise<void>;
  fetchLabels: (projectId: string) => Promise<void>;
  fetchComments: (issueId: string) => Promise<void>;
  addComment: (issueId: string, content: string, authorName?: string) => Promise<void>;
  transitionIssue: (issueId: string, toStage: IssueStage) => Promise<void>;
  updateIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
  updateIssue: (issue: IssueDto) => void;
}

export const useIssueStore = create<IssueState>((set, get) => ({
  issues: [],
  labels: [],
  comments: {},
  loading: false,
  error: null,

  fetchIssues: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const issues = await api.getIssues(projectId);
      set({ issues, loading: false });
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Failed to fetch issues';
      set({ error: message, loading: false });
    }
  },

  fetchLabels: async (projectId: string) => {
    try {
      const labels = await api.getLabels(projectId);
      set({ labels });
    } catch (err) {
      console.error('Failed to fetch labels:', err);
    }
  },

  fetchComments: async (issueId: string) => {
    try {
      const issueComments = await api.getComments(issueId);
      set((state) => ({
        comments: { ...state.comments, [issueId]: issueComments },
      }));
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  },

  addComment: async (issueId: string, content: string, authorName?: string) => {
    try {
      const comment = await api.addComment(issueId, content, authorName);
      set((state) => ({
        comments: {
          ...state.comments,
          [issueId]: [...(state.comments[issueId] || []), comment],
        },
      }));
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Failed to add comment';
      useUIStore.getState().showError(message);
    }
  },

  transitionIssue: async (issueId: string, toStage: IssueStage) => {
    const { issues } = get();
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    const originalStage = issue.stage;

    // Optimistic update
    set({
      issues: issues.map((i) => (i.id === issueId ? { ...i, stage: toStage } : i)),
    });

    try {
      const updated = await api.transitionIssue(issueId, toStage);
      set({
        issues: get().issues.map((i) => (i.id === issueId ? updated : i)),
      });
    } catch (err) {
      // Revert optimistic update
      set({
        issues: get().issues.map((i) => (i.id === issueId ? { ...i, stage: originalStage } : i)),
      });
      const message = err instanceof ApiClientError ? err.message : 'Failed to transition issue';
      useUIStore.getState().showError(message);
    }
  },

  updateIssueLabels: async (issueId: string, labelIds: string[]) => {
    try {
      const updated = await api.updateIssue(issueId, { labelIds });
      set({
        issues: get().issues.map((i) => (i.id === issueId ? updated : i)),
      });
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Failed to update labels';
      useUIStore.getState().showError(message);
    }
  },

  updateIssue: (issue: IssueDto) => {
    set({
      issues: get().issues.map((i) => (i.id === issue.id ? issue : i)),
    });
  },
}));
