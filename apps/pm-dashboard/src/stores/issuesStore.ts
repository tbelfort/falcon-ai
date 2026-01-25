import { create } from 'zustand';
import { apiClient, ApiClientError } from '../api/client';
import { AsyncState, CommentDto, IssueDto, IssueStage, LabelDto } from '../api/types';
import { getErrorMessage, isAbortError } from '../utils/errors';
import { useUiStore } from './uiStore';

type IssuesState = {
  issuesByProject: Record<string, AsyncState<IssueDto[]>>;
  labelsByProject: Record<string, AsyncState<LabelDto[]>>;
  commentsByIssue: Record<string, AsyncState<CommentDto[]>>;
  loadIssues: (projectId: string, signal?: AbortSignal) => Promise<void>;
  loadLabels: (projectId: string, signal?: AbortSignal) => Promise<void>;
  loadComments: (issueId: string, signal?: AbortSignal) => Promise<void>;
  addComment: (issueId: string, content: string, authorName?: string) => Promise<void>;
  transitionIssue: (issueId: string, toStage: IssueStage) => Promise<void>;
  updateIssueLabels: (issueId: string, labelIds: string[]) => Promise<void>;
  upsertIssue: (issue: IssueDto) => void;
  addIssue: (issue: IssueDto) => void;
  removeIssue: (issueId: string) => void;
};

function updateIssueInProjects(
  issuesByProject: Record<string, AsyncState<IssueDto[]>>,
  issueId: string,
  updater: (issue: IssueDto) => IssueDto
): Record<string, AsyncState<IssueDto[]>> {
  const updated: Record<string, AsyncState<IssueDto[]>> = { ...issuesByProject };
  for (const [projectId, state] of Object.entries(issuesByProject)) {
    if (state.status !== 'success') {
      continue;
    }
    const index = state.data.findIndex((issue) => issue.id === issueId);
    if (index === -1) {
      continue;
    }
    const next = [...state.data];
    next[index] = updater(next[index]);
    updated[projectId] = { status: 'success', data: next };
    return updated;
  }
  return issuesByProject;
}

function removeIssueFromProjects(
  issuesByProject: Record<string, AsyncState<IssueDto[]>>,
  issueId: string
): Record<string, AsyncState<IssueDto[]>> {
  const updated: Record<string, AsyncState<IssueDto[]>> = { ...issuesByProject };
  for (const [projectId, state] of Object.entries(issuesByProject)) {
    if (state.status !== 'success') {
      continue;
    }
    const next = state.data.filter((issue) => issue.id !== issueId);
    if (next.length !== state.data.length) {
      updated[projectId] = { status: 'success', data: next };
      return updated;
    }
  }
  return issuesByProject;
}

function findIssue(
  issuesByProject: Record<string, AsyncState<IssueDto[]>>,
  issueId: string
): IssueDto | undefined {
  for (const state of Object.values(issuesByProject)) {
    if (state.status !== 'success') {
      continue;
    }
    const issue = state.data.find((item) => item.id === issueId);
    if (issue) {
      return issue;
    }
  }
  return undefined;
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
  issuesByProject: {},
  labelsByProject: {},
  commentsByIssue: {},
  loadIssues: async (projectId, signal) => {
    set((state) => ({
      issuesByProject: {
        ...state.issuesByProject,
        [projectId]: { status: 'loading' }
      }
    }));
    try {
      const issues = await apiClient.getIssues(projectId, signal);
      set((state) => ({
        issuesByProject: {
          ...state.issuesByProject,
          [projectId]: { status: 'success', data: issues }
        }
      }));
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      set((state) => ({
        issuesByProject: {
          ...state.issuesByProject,
          [projectId]: { status: 'error', error: getErrorMessage(error) }
        }
      }));
    }
  },
  loadLabels: async (projectId, signal) => {
    set((state) => ({
      labelsByProject: {
        ...state.labelsByProject,
        [projectId]: { status: 'loading' }
      }
    }));
    try {
      const labels = await apiClient.getLabels(projectId, signal);
      set((state) => ({
        labelsByProject: {
          ...state.labelsByProject,
          [projectId]: { status: 'success', data: labels }
        }
      }));
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      set((state) => ({
        labelsByProject: {
          ...state.labelsByProject,
          [projectId]: { status: 'error', error: getErrorMessage(error) }
        }
      }));
    }
  },
  loadComments: async (issueId, signal) => {
    set((state) => ({
      commentsByIssue: {
        ...state.commentsByIssue,
        [issueId]: { status: 'loading' }
      }
    }));
    try {
      const comments = await apiClient.getComments(issueId, signal);
      set((state) => ({
        commentsByIssue: {
          ...state.commentsByIssue,
          [issueId]: { status: 'success', data: comments }
        }
      }));
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      set((state) => ({
        commentsByIssue: {
          ...state.commentsByIssue,
          [issueId]: { status: 'error', error: getErrorMessage(error) }
        }
      }));
    }
  },
  addComment: async (issueId, content, authorName) => {
    try {
      const comment = await apiClient.postComment(issueId, { content, authorName });
      set((state) => {
        const existing = state.commentsByIssue[issueId];
        if (!existing || existing.status !== 'success') {
          return {
            commentsByIssue: {
              ...state.commentsByIssue,
              [issueId]: { status: 'success', data: [comment] }
            }
          };
        }
        return {
          commentsByIssue: {
            ...state.commentsByIssue,
            [issueId]: { status: 'success', data: [...existing.data, comment] }
          }
        };
      });
    } catch (error) {
      useUiStore.getState().setErrorBanner(getErrorMessage(error));
    }
  },
  transitionIssue: async (issueId, toStage) => {
    const issue = findIssue(get().issuesByProject, issueId);
    if (!issue) {
      return;
    }
    const previousStage = issue.stage;
    set((state) => ({
      issuesByProject: updateIssueInProjects(state.issuesByProject, issueId, (item) => ({
        ...item,
        stage: toStage
      }))
    }));

    try {
      const updated = await apiClient.transitionIssue(issueId, { toStage });
      set((state) => ({
        issuesByProject: updateIssueInProjects(state.issuesByProject, issueId, () => updated)
      }));
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : getErrorMessage(error);
      useUiStore.getState().setErrorBanner(message);
      set((state) => ({
        issuesByProject: updateIssueInProjects(state.issuesByProject, issueId, (item) => ({
          ...item,
          stage: previousStage
        }))
      }));
    }
  },
  updateIssueLabels: async (issueId, labelIds) => {
    try {
      const updated = await apiClient.updateIssueLabels(issueId, { labelIds });
      set((state) => ({
        issuesByProject: updateIssueInProjects(state.issuesByProject, issueId, () => updated)
      }));
    } catch (error) {
      useUiStore.getState().setErrorBanner(getErrorMessage(error));
    }
  },
  upsertIssue: (issue) =>
    set((state) => ({
      issuesByProject: updateIssueInProjects(state.issuesByProject, issue.id, () => issue)
    })),
  addIssue: (issue) =>
    set((state) => {
      const current = state.issuesByProject[issue.projectId];
      if (!current || current.status !== 'success') {
        return state;
      }
      return {
        issuesByProject: {
          ...state.issuesByProject,
          [issue.projectId]: { status: 'success', data: [issue, ...current.data] }
        }
      };
    }),
  removeIssue: (issueId) =>
    set((state) => ({
      issuesByProject: removeIssueFromProjects(state.issuesByProject, issueId)
    }))
}));
