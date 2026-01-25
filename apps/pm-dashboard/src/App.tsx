import { useCallback, useEffect, useMemo } from 'react';
import { apiBaseUrl, resolveWsUrl } from './api/client';
import type { IssueDto } from './api/types';
import type { WsServerMessage } from './api/ws';
import { ErrorBanner } from './components/ErrorBanner';
import { IssueModal } from './components/IssueModal';
import { KanbanBoard } from './components/KanbanBoard';
import { ProjectSelector } from './components/ProjectSelector';
import { useWebSocket } from './hooks/useWebSocket';
import { useIssuesStore } from './stores/issuesStore';
import { useProjectsStore } from './stores/projectsStore';
import { useUiStore } from './stores/uiStore';
import { assertNever } from './utils/assertNever';

export function App() {
  const {
    projectsState,
    labelsState,
    selectedProjectId,
    fetchProjects,
    fetchLabels,
    selectProject
  } = useProjectsStore();
  const {
    issuesState,
    errorBanner,
    fetchIssues,
    transitionIssue,
    updateIssueLabels,
    applyIssueUpdate,
    removeIssue,
    clearError
  } = useIssuesStore();
  const { activeIssueId, openIssue, closeIssue } = useUiStore();

  useEffect(() => {
    const allowAbort = import.meta.env.MODE !== 'test';
    const controller = allowAbort ? new AbortController() : null;
    void fetchProjects(controller?.signal);
    return () => controller?.abort();
  }, [fetchProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    const allowAbort = import.meta.env.MODE !== 'test';
    const controller = allowAbort ? new AbortController() : null;
    void fetchIssues(selectedProjectId, controller?.signal);
    void fetchLabels(selectedProjectId, controller?.signal);
    return () => controller?.abort();
  }, [selectedProjectId, fetchIssues, fetchLabels]);

  const activeIssue = useMemo(() => {
    if (issuesState.status !== 'success') {
      return null;
    }
    return issuesState.data.find((issue) => issue.id === activeIssueId) ?? null;
  }, [issuesState, activeIssueId]);

  const handleWsEvent = useCallback(
    (raw: unknown) => {
      if (!selectedProjectId) {
        return;
      }
      const message = raw as WsServerMessage;
      if (message.type !== 'event') {
        return;
      }
      if (message.channel !== `project:${selectedProjectId}`) {
        return;
      }
      if (message.event === 'issue.created' || message.event === 'issue.updated') {
        applyIssueUpdate(message.data as IssueDto);
        return;
      }
      if (message.event === 'issue.deleted') {
        const payload = message.data as { id?: string };
        if (payload?.id) {
          removeIssue(payload.id);
        }
        return;
      }
      if (message.event === 'label.created') {
        void fetchLabels(selectedProjectId);
      }
    },
    [selectedProjectId, applyIssueUpdate, removeIssue, fetchLabels]
  );

  const wsUrl = apiBaseUrl ? resolveWsUrl() : '';
  useWebSocket(wsUrl, handleWsEvent, selectedProjectId ? [`project:${selectedProjectId}`] : []);

  return (
    <div className="flex min-h-screen flex-col gap-6 px-6 pb-10 pt-8">
      <header className="flex flex-col gap-4 rounded-3xl border border-ink-100/60 bg-white/70 px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Falcon PM</p>
            <h1 className="text-2xl font-semibold text-ink-900">Kanban Control Room</h1>
            <p className="text-sm text-ink-500">
              Orchestrate issues across the full Falcon agent workflow.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!apiBaseUrl ? (
              <span className="rounded-full bg-coral-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-coral-500">
                Mocked Mode
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Live API
              </span>
            )}
            <ProjectSelector
              projectsState={projectsState}
              selectedProjectId={selectedProjectId}
              onChange={selectProject}
            />
          </div>
        </div>
      </header>

      {errorBanner ? <ErrorBanner message={errorBanner} onDismiss={clearError} /> : null}

      <main className="flex-1">
        {issuesState.status === 'loading' ? (
          <div className="rounded-3xl border border-ink-100/60 bg-white/70 p-6 text-sm text-ink-500">
            Loading board...
          </div>
        ) : issuesState.status === 'error' ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            {issuesState.error}
          </div>
        ) : issuesState.status === 'idle' ? (
          <div className="rounded-3xl border border-ink-100/60 bg-white/70 p-6 text-sm text-ink-500">
            Select a project to view the board.
          </div>
        ) : issuesState.status === 'success' ? (
          <KanbanBoard
            issues={issuesState.data}
            onIssueOpen={openIssue}
            onStageChange={(issueId, stage) => void transitionIssue(issueId, stage)}
          />
        ) : (
          assertNever(issuesState)
        )}
      </main>

      <IssueModal
        issue={activeIssue}
        labelsState={labelsState}
        onClose={closeIssue}
        onUpdateLabels={(issueId, labelIds) => void updateIssueLabels(issueId, labelIds)}
      />
    </div>
  );
}
