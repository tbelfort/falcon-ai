import { create } from 'zustand';
import {
  createComment,
  fetchComments,
  fetchIssues,
  fetchLabels,
  transitionIssue,
  updateIssueLabels,
} from '@/api/client';
import type { CommentDto, IssueDto, IssueStage, LabelDto } from '@/api/types';
import type { AsyncState } from './types';
import { errorState, idleState, loadingState, successState } from './types';

type IssuesState = {
  issues: AsyncState<IssueDto[]>;
  labelsByProjectId: Record<string, AsyncState<LabelDto[]>>;
  commentsByIssueId: Record<string, AsyncState<CommentDto[]>>;
  issuesAbortController: AbortController | null;
  labelsAbortController: AbortController | null;
  // Track true original stage per-issue to handle concurrent moves correctly
  pendingMoveOriginalStage: Record<string, IssueStage>;
  loadIssues: (projectId: string) => Promise<void>;
  loadLabels: (projectId: string) => Promise<void>;
  loadComments: (issueId: string) => Promise<void>;
  addComment: (issueId: string, content: string, authorName?: string, onError?: (message: string) => void) => Promise<void>;
  moveIssueStage: (issueId: string, toStage: IssueStage, onError: (message: string) => void) => Promise<void>;
  updateLabels: (issueId: string, labelIds: string[], onError?: (message: string) => void) => Promise<void>;
  replaceIssue: (issue: IssueDto) => void;
  reset: () => void;
};

function updateIssueList(issues: IssueDto[], updated: IssueDto): IssueDto[] {
  return issues.map((issue) => (issue.id === updated.id ? updated : issue));
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
  issues: idleState,
  labelsByProjectId: {},
  commentsByIssueId: {},
  issuesAbortController: null,
  labelsAbortController: null,
  pendingMoveOriginalStage: {},
  loadIssues: async (projectId) => {
    const { issuesAbortController: current } = get();
    if (current) {
      current.abort();
    }

    const controller = new AbortController();
    set({ issues: loadingState, issuesAbortController: controller });

    try {
      const issues = await fetchIssues(projectId, controller.signal);
      set({ issues: successState(issues), issuesAbortController: null });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to load issues';
      set({ issues: errorState(message), issuesAbortController: null });
    }
  },
  loadLabels: async (projectId) => {
    const { labelsAbortController: current } = get();
    if (current) {
      current.abort();
    }

    const controller = new AbortController();
    set((state) => ({
      labelsByProjectId: {
        ...state.labelsByProjectId,
        [projectId]: loadingState,
      },
      labelsAbortController: controller,
    }));

    try {
      const labels = await fetchLabels(projectId, controller.signal);
      set((state) => ({
        labelsByProjectId: {
          ...state.labelsByProjectId,
          [projectId]: successState(labels),
        },
        labelsAbortController: null,
      }));
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to load labels';
      set((state) => ({
        labelsByProjectId: {
          ...state.labelsByProjectId,
          [projectId]: errorState(message),
        },
        labelsAbortController: null,
      }));
    }
  },
  loadComments: async (issueId) => {
    set((state) => ({
      commentsByIssueId: {
        ...state.commentsByIssueId,
        [issueId]: loadingState,
      },
    }));

    try {
      const comments = await fetchComments(issueId);
      set((state) => ({
        commentsByIssueId: {
          ...state.commentsByIssueId,
          [issueId]: successState(comments),
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load comments';
      set((state) => ({
        commentsByIssueId: {
          ...state.commentsByIssueId,
          [issueId]: errorState(message),
        },
      }));
    }
  },
  addComment: async (issueId, content, authorName, onError) => {
    try {
      const newComment = await createComment(issueId, content, authorName);
      set((state) => {
        const existing = state.commentsByIssueId[issueId];
        if (!existing || existing.status !== 'success') {
          return {
            commentsByIssueId: {
              ...state.commentsByIssueId,
              [issueId]: successState([newComment]),
            },
          };
        }

        return {
          commentsByIssueId: {
            ...state.commentsByIssueId,
            [issueId]: successState([...existing.data, newComment]),
          },
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add comment';
      if (onError) {
        onError(message);
      } else {
        console.error(message);
      }
    }
  },
  moveIssueStage: async (issueId, toStage, onError) => {
    const current = get().issues;
    if (current.status !== 'success') {
      return;
    }

    const existing = current.data.find((issue) => issue.id === issueId);
    if (!existing) {
      return;
    }

    // Track the true original stage only if no move is pending for this issue.
    // This prevents concurrent rapid moves from capturing stale optimistic state.
    const { pendingMoveOriginalStage } = get();
    const originalStage = pendingMoveOriginalStage[issueId] ?? existing.stage;

    // Optimistic update and record the original stage
    set((state) => {
      if (state.issues.status !== 'success') return state;
      return {
        issues: successState(
          state.issues.data.map((issue) =>
            issue.id === issueId ? { ...issue, stage: toStage } : issue,
          ),
        ),
        pendingMoveOriginalStage: {
          ...state.pendingMoveOriginalStage,
          [issueId]: originalStage,
        },
      };
    });

    try {
      const updated = await transitionIssue(issueId, toStage);
      // Re-read current state to avoid stale closure issues
      set((state) => {
        if (state.issues.status !== 'success') return state;
        // Clear the pending move tracking for this issue on success
        const { [issueId]: _, ...remainingPending } = state.pendingMoveOriginalStage;
        return {
          issues: successState(updateIssueList(state.issues.data, updated)),
          pendingMoveOriginalStage: remainingPending,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stage transition failed';
      // Rollback: re-read current state and revert only if the current stage is still our optimistic target.
      // If a WS event updated the issue to a different stage, keep that (WS is more authoritative).
      set((state) => {
        if (state.issues.status !== 'success') return state;
        const currentIssue = state.issues.data.find((issue) => issue.id === issueId);
        // Clear the pending move tracking for this issue
        const { [issueId]: _, ...remainingPending } = state.pendingMoveOriginalStage;
        // If WS updated the stage to something other than our target, keep the WS state
        if (currentIssue?.stage !== toStage) {
          return { pendingMoveOriginalStage: remainingPending };
        }
        return {
          issues: successState(
            state.issues.data.map((issue) =>
              issue.id === issueId ? { ...issue, stage: originalStage } : issue,
            ),
          ),
          pendingMoveOriginalStage: remainingPending,
        };
      });
      onError(message);
    }
  },
  updateLabels: async (issueId, labelIds, onError) => {
    const current = get().issues;
    if (current.status !== 'success') {
      return;
    }

    try {
      const updated = await updateIssueLabels(issueId, labelIds);
      // Re-read current state to avoid stale closure issues
      set((state) => {
        if (state.issues.status !== 'success') return state;
        return { issues: successState(updateIssueList(state.issues.data, updated)) };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Label update failed';
      if (onError) {
        onError(message);
      } else {
        console.error(message);
      }
    }
  },
  replaceIssue: (issue) => {
    const current = get().issues;
    if (current.status !== 'success') {
      return;
    }
    set({ issues: successState(updateIssueList(current.data, issue)) });
  },
  reset: () => set({
    issues: idleState,
    labelsByProjectId: {},
    commentsByIssueId: {},
    issuesAbortController: null,
    labelsAbortController: null,
    pendingMoveOriginalStage: {},
  }),
}));
