import { create } from 'zustand';
import {
  addComment,
  getComments,
  getIssues,
  getLabels,
  isApiError,
  transitionIssue,
  updateIssueLabels
} from '../api/client';
import type { AsyncState, CommentDto, IssueDto, IssueStage, LabelDto } from '../types';

interface IssuesStore {
  issuesState: AsyncState<IssueDto[]>;
  labelsState: AsyncState<LabelDto[]>;
  commentsState: Record<string, AsyncState<CommentDto[]>>;
  fetchIssues: (projectId: string, signal?: AbortSignal) => Promise<void>;
  fetchLabels: (projectId: string, signal?: AbortSignal) => Promise<void>;
  fetchComments: (issueId: string) => Promise<void>;
  addComment: (issueId: string, content: string, authorName?: string) => Promise<void>;
  updateIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
  moveIssueOptimistic: (issueId: string, toStage: IssueStage) => Promise<{ ok: boolean; error?: string }>;
  applyIssueUpdate: (issue: IssueDto) => void;
}

function updateIssueList(issues: IssueDto[], issue: IssueDto) {
  const index = issues.findIndex((item) => item.id === issue.id);
  if (index === -1) {
    return [issue, ...issues];
  }
  const next = [...issues];
  next[index] = issue;
  return next;
}

export const useIssuesStore = create<IssuesStore>((set, get) => ({
  issuesState: { status: 'idle' },
  labelsState: { status: 'idle' },
  commentsState: {},
  fetchIssues: async (projectId, signal) => {
    set({ issuesState: { status: 'loading' } });
    try {
      const issues = await getIssues(projectId, signal);
      set({ issuesState: { status: 'success', data: issues } });
    } catch (error) {
      const message =
        isApiError(error) ? error.message : error instanceof Error ? error.message : 'Failed to load issues';
      set({ issuesState: { status: 'error', error: message } });
    }
  },
  fetchLabels: async (projectId, signal) => {
    set({ labelsState: { status: 'loading' } });
    try {
      const labels = await getLabels(projectId, signal);
      set({ labelsState: { status: 'success', data: labels } });
    } catch (error) {
      const message =
        isApiError(error) ? error.message : error instanceof Error ? error.message : 'Failed to load labels';
      set({ labelsState: { status: 'error', error: message } });
    }
  },
  fetchComments: async (issueId) => {
    set((state) => ({
      commentsState: {
        ...state.commentsState,
        [issueId]: { status: 'loading' }
      }
    }));
    try {
      const comments = await getComments(issueId);
      set((state) => ({
        commentsState: {
          ...state.commentsState,
          [issueId]: { status: 'success', data: comments }
        }
      }));
    } catch (error) {
      const message =
        isApiError(error) ? error.message : error instanceof Error ? error.message : 'Failed to load comments';
      set((state) => ({
        commentsState: {
          ...state.commentsState,
          [issueId]: { status: 'error', error: message }
        }
      }));
    }
  },
  addComment: async (issueId, content, authorName) => {
    try {
      const comment = await addComment(issueId, content, authorName);
      set((state) => {
        const existing = state.commentsState[issueId];
        const nextComments =
          existing?.status === 'success' ? [...existing.data, comment] : [comment];
        return {
          commentsState: {
            ...state.commentsState,
            [issueId]: { status: 'success', data: nextComments }
          }
        };
      });
    } catch (error) {
      const message =
        isApiError(error) ? error.message : error instanceof Error ? error.message : 'Failed to add comment';
      set((state) => ({
        commentsState: {
          ...state.commentsState,
          [issueId]: { status: 'error', error: message }
        }
      }));
      throw error;
    }
  },
  updateIssueLabels: async (issueId, labelIds) => {
    const current = get().issuesState;
    try {
      const updated = await updateIssueLabels(issueId, labelIds);
      if (current.status === 'success') {
        set({ issuesState: { status: 'success', data: updateIssueList(current.data, updated) } });
      }
    } catch (error) {
      throw error;
    }
  },
  moveIssueOptimistic: async (issueId, toStage) => {
    const current = get().issuesState;
    if (current.status !== 'success') {
      return { ok: false, error: 'Issues not loaded' };
    }
    const issue = current.data.find((item) => item.id === issueId);
    if (!issue) {
      return { ok: false, error: 'Issue not found' };
    }
    const previousStage = issue.stage;
    if (previousStage === toStage) {
      return { ok: true };
    }
    set({
      issuesState: {
        status: 'success',
        data: current.data.map((item) =>
          item.id === issueId ? { ...item, stage: toStage } : item
        )
      }
    });

    try {
      const updated = await transitionIssue(issueId, toStage);
      set((state) => {
        if (state.issuesState.status !== 'success') {
          return state;
        }
        return {
          issuesState: {
            status: 'success',
            data: updateIssueList(state.issuesState.data, updated)
          }
        };
      });
      return { ok: true };
    } catch (error) {
      const message =
        isApiError(error) ? error.message : error instanceof Error ? error.message : 'Transition failed';
      set({
        issuesState: {
          status: 'success',
          data: current.data.map((item) =>
            item.id === issueId ? { ...item, stage: previousStage } : item
          )
        }
      });
      return { ok: false, error: message };
    }
  },
  applyIssueUpdate: (issue) => {
    const current = get().issuesState;
    if (current.status !== 'success') {
      return;
    }
    set({ issuesState: { status: 'success', data: updateIssueList(current.data, issue) } });
  }
}));
