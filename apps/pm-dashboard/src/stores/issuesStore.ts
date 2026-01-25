import { create } from 'zustand';
import { fetchComments, fetchIssues, postComment, transitionIssue, updateIssueLabels } from '../api/client';
import type { CommentDto, IssueDto, IssueStage } from '../api/types';
import { idleState, type AsyncState } from '../utils/asyncState';
import { getErrorMessage } from '../utils/errors';
import { useUiStore } from './uiStore';

interface IssuesState {
  issuesState: AsyncState<IssueDto[]>;
  commentsByIssueId: Record<string, AsyncState<CommentDto[]>>;
  loadIssues: (projectId: string) => Promise<void>;
  loadComments: (issueId: string) => Promise<void>;
  addComment: (issueId: string, content: string) => Promise<void>;
  transitionIssue: (issueId: string, stage: IssueStage) => Promise<void>;
  updateIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
}

export const useIssuesStore = create<IssuesState>((set, get) => {
  let issuesAbort: AbortController | null = null;

  return {
    issuesState: idleState,
    commentsByIssueId: {},
    loadIssues: async (projectId) => {
      issuesAbort?.abort();
      const controller = new AbortController();
      issuesAbort = controller;
      set({ issuesState: { status: 'loading' } });
      try {
        const data = await fetchIssues(projectId, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        set({ issuesState: { status: 'success', data } });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        set({ issuesState: { status: 'error', error: getErrorMessage(error) } });
      }
    },
    loadComments: async (issueId) => {
      set((state) => ({
        commentsByIssueId: {
          ...state.commentsByIssueId,
          [issueId]: { status: 'loading' },
        },
      }));
      try {
        const data = await fetchComments(issueId);
        set((state) => ({
          commentsByIssueId: {
            ...state.commentsByIssueId,
            [issueId]: { status: 'success', data },
          },
        }));
      } catch (error) {
        set((state) => ({
          commentsByIssueId: {
            ...state.commentsByIssueId,
            [issueId]: { status: 'error', error: getErrorMessage(error) },
          },
        }));
      }
    },
    addComment: async (issueId, content) => {
      try {
        const response = await postComment(issueId, content);
        set((state) => {
          const existing = state.commentsByIssueId[issueId];
          if (existing?.status === 'success') {
            return {
              commentsByIssueId: {
                ...state.commentsByIssueId,
                [issueId]: { status: 'success', data: [...existing.data, response] },
              },
            };
          }
          return state;
        });
      } catch (error) {
        useUiStore.getState().setError(getErrorMessage(error));
      }
    },
    transitionIssue: async (issueId, stage) => {
      const currentState = get().issuesState;
      if (currentState.status !== 'success') {
        return;
      }
      const previousIssues = currentState.data;
      const nextIssues = previousIssues.map((issue) =>
        issue.id === issueId ? { ...issue, stage } : issue
      );
      set({ issuesState: { status: 'success', data: nextIssues } });
      try {
        const updated = await transitionIssue(issueId, stage);
        set((state) => {
          if (state.issuesState.status !== 'success') {
            return state;
          }
          return {
            issuesState: {
              status: 'success',
              data: state.issuesState.data.map((issue) =>
                issue.id === updated.id ? updated : issue
              ),
            },
          };
        });
      } catch (error) {
        set({ issuesState: { status: 'success', data: previousIssues } });
        useUiStore.getState().setError(getErrorMessage(error));
      }
    },
    updateIssueLabels: async (issueId, labelIds) => {
      try {
        const updated = await updateIssueLabels(issueId, labelIds);
        set((state) => {
          if (state.issuesState.status !== 'success') {
            return state;
          }
          return {
            issuesState: {
              status: 'success',
              data: state.issuesState.data.map((issue) =>
                issue.id === updated.id ? updated : issue
              ),
            },
          };
        });
      } catch (error) {
        useUiStore.getState().setError(getErrorMessage(error));
      }
    },
  };
});
