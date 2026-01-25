import { useCallback, useEffect, useMemo } from 'react';
import { isApiError } from './api/client';
import { ErrorBanner } from './components/ErrorBanner';
import { IssueModal } from './components/IssueModal';
import { KanbanBoard } from './components/KanbanBoard';
import { useWebSocket } from './hooks/useWebSocket';
import { useIssuesStore } from './stores/issues';
import { useProjectsStore } from './stores/projects';
import { useUiStore } from './stores/ui';
import type { IssueDto, WsServerMessage } from './types';
import { buildWsUrl } from './utils/ws';

export default function App() {
  const { projectsState, selectedProjectId, fetchProjects, selectProject } = useProjectsStore();
  const {
    issuesState,
    labelsState,
    commentsState,
    fetchIssues,
    fetchLabels,
    fetchComments,
    addComment: addCommentToStore,
    updateIssueLabels: updateIssueLabelsInStore,
    moveIssueOptimistic,
    applyIssueUpdate
  } = useIssuesStore();
  const {
    selectedIssueId,
    isModalOpen,
    errorBanner,
    openIssue,
    closeIssue,
    setError,
    clearError
  } = useUiStore();

  useEffect(() => {
    const controller = new AbortController();
    void fetchProjects(controller.signal);
    return () => controller.abort();
  }, [fetchProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    const controller = new AbortController();
    void fetchIssues(selectedProjectId, controller.signal);
    void fetchLabels(selectedProjectId, controller.signal);
    return () => controller.abort();
  }, [selectedProjectId, fetchIssues, fetchLabels]);

  useEffect(() => {
    if (!selectedIssueId || !isModalOpen) {
      return;
    }
    const current = commentsState[selectedIssueId];
    if (current) {
      return;
    }
    void fetchComments(selectedIssueId);
  }, [selectedIssueId, isModalOpen, commentsState, fetchComments]);

  const wsUrl = useMemo(() => {
    const apiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
    const wsBase = import.meta.env.VITE_WS_BASE_URL as string | undefined;
    return buildWsUrl(apiBase, wsBase);
  }, []);

  const handleWsEvent = useCallback(
    (message: unknown) => {
      const parsed = message as WsServerMessage;
      if (parsed.type !== 'event') {
        return;
      }
      if (parsed.event === 'issue.updated' || parsed.event === 'issue.created') {
        applyIssueUpdate(parsed.data as IssueDto);
      }
      if (parsed.event === 'comment.created' && typeof parsed.data === 'object' && parsed.data) {
        const comment = parsed.data as { issueId?: string };
        if (comment.issueId) {
          void fetchComments(comment.issueId);
        }
      }
    },
    [applyIssueUpdate, fetchComments]
  );

  const { send } = useWebSocket(selectedProjectId ? wsUrl : null, handleWsEvent);

  useEffect(() => {
    if (!selectedProjectId || !wsUrl) {
      return;
    }
    send({ type: 'subscribe', channel: `project:${selectedProjectId}` });
    return () => {
      send({ type: 'unsubscribe', channel: `project:${selectedProjectId}` });
    };
  }, [selectedProjectId, wsUrl, send]);

  const selectedIssue = useMemo(() => {
    if (!selectedIssueId || issuesState.status !== 'success') {
      return null;
    }
    return issuesState.data.find((issue) => issue.id === selectedIssueId) ?? null;
  }, [selectedIssueId, issuesState]);

  const handleToggleLabels = useCallback(
    async (labelIds: string[]) => {
      if (!selectedIssue) {
        return;
      }
      try {
        await updateIssueLabelsInStore(selectedIssue.id, labelIds);
        clearError();
      } catch (error) {
        const message = isApiError(error) ? error.message : 'Unable to update labels.';
        setError(message);
      }
    },
    [selectedIssue, updateIssueLabelsInStore, clearError, setError]
  );

  const handleAddComment = useCallback(
    async (content: string, authorName?: string) => {
      if (!selectedIssue) {
        return;
      }
      try {
        await addCommentToStore(selectedIssue.id, content, authorName);
        clearError();
      } catch (error) {
        const message = isApiError(error) ? error.message : 'Unable to add comment.';
        setError(message);
      }
    },
    [selectedIssue, addCommentToStore, clearError, setError]
  );

  const issues = issuesState.status === 'success' ? issuesState.data : [];

  return (
    <div className="min-h-screen px-6 py-8 md:px-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-500">
            Falcon PM
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-900">Sprint 2 Kanban</h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time view of issue flow, labels, and comments.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {projectsState.status === 'success' && (
            <select
              className="rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
              value={selectedProjectId ?? ''}
              onChange={(event) => selectProject(event.target.value)}
            >
              {projectsState.data.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {errorBanner && (
        <div className="mt-6">
          <ErrorBanner message={errorBanner} onDismiss={clearError} />
        </div>
      )}

      {projectsState.status === 'loading' && (
        <p className="mt-10 text-sm text-slate-500">Loading projects...</p>
      )}
      {projectsState.status === 'error' && (
        <p className="mt-10 text-sm text-rose-600">{projectsState.error}</p>
      )}

      {issuesState.status === 'loading' && (
        <p className="mt-10 text-sm text-slate-500">Loading issues...</p>
      )}
      {issuesState.status === 'error' && (
        <p className="mt-10 text-sm text-rose-600">{issuesState.error}</p>
      )}

      {issuesState.status === 'success' && (
        <div className="mt-10">
          <KanbanBoard
            issues={issues}
            onMoveIssue={moveIssueOptimistic}
            onOpenIssue={openIssue}
            onMoveError={setError}
            onClearError={clearError}
          />
        </div>
      )}

      <IssueModal
        issue={selectedIssue}
        isOpen={isModalOpen}
        labelsState={labelsState}
        commentsState={selectedIssueId ? commentsState[selectedIssueId] : undefined}
        onClose={closeIssue}
        onToggleLabels={handleToggleLabels}
        onAddComment={handleAddComment}
      />
    </div>
  );
}
