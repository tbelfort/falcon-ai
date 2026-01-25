import { useCallback, useEffect, useMemo } from 'react';
import { IssueDto, WsServerMessage } from './api/types';
import { getWsUrl, isMockedMode } from './api/config';
import KanbanBoard from './components/KanbanBoard';
import IssueModal from './components/IssueModal';
import ErrorBanner from './components/ErrorBanner';
import { useProjectsStore } from './stores/projectsStore';
import { useIssuesStore } from './stores/issuesStore';
import { useUiStore } from './stores/uiStore';
import { useWebSocket } from './hooks/useWebSocket';
import { assertNever } from './utils/assertNever';
import { createSafeAbortController } from './utils/abort';

export default function App() {
  const projectsState = useProjectsStore((state) => state.projects);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const setActiveProjectId = useProjectsStore((state) => state.setActiveProjectId);

  const issuesByProject = useIssuesStore((state) => state.issuesByProject);
  const loadIssues = useIssuesStore((state) => state.loadIssues);
  const loadLabels = useIssuesStore((state) => state.loadLabels);
  const transitionIssue = useIssuesStore((state) => state.transitionIssue);
  const upsertIssue = useIssuesStore((state) => state.upsertIssue);
  const addIssue = useIssuesStore((state) => state.addIssue);
  const removeIssue = useIssuesStore((state) => state.removeIssue);

  const selectedIssueId = useUiStore((state) => state.selectedIssueId);
  const selectIssue = useUiStore((state) => state.selectIssue);

  const wsUrl = getWsUrl();
  const shouldConnectWs = !isMockedMode() && import.meta.env.MODE !== 'test' && wsUrl.length > 0;

  const handleWsEvent = useCallback(
    (message: WsServerMessage) => {
      if (message.type !== 'event') {
        return;
      }

      switch (message.event) {
        case 'issue.created':
          addIssue(message.data as IssueDto);
          return;
        case 'issue.updated':
          upsertIssue(message.data as IssueDto);
          return;
        case 'issue.deleted':
          if (typeof message.data === 'string') {
            removeIssue(message.data);
          }
          return;
        case 'comment.created':
        case 'label.created':
          return;
        default:
          assertNever(message.event as never, 'Unknown event');
      }
    },
    [addIssue, removeIssue, upsertIssue]
  );

  const { send, status } = useWebSocket(shouldConnectWs ? wsUrl : null, handleWsEvent);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!activeProjectId) {
      return;
    }
    const controller = createSafeAbortController();
    void loadIssues(activeProjectId, controller?.signal);
    void loadLabels(activeProjectId, controller?.signal);
    return () => controller?.abort();
  }, [activeProjectId, loadIssues, loadLabels]);

  useEffect(() => {
    if (!activeProjectId || status !== 'open') {
      return;
    }
    send({ type: 'subscribe', channel: `project:${activeProjectId}` });
    return () => {
      send({ type: 'unsubscribe', channel: `project:${activeProjectId}` });
    };
  }, [activeProjectId, send, status]);

  useEffect(() => {
    if (!selectedIssueId || status !== 'open') {
      return;
    }
    send({ type: 'subscribe', channel: `issue:${selectedIssueId}` });
    return () => {
      send({ type: 'unsubscribe', channel: `issue:${selectedIssueId}` });
    };
  }, [selectedIssueId, send, status]);

  const activeProject = useMemo(() => {
    if (projectsState.status !== 'success') {
      return undefined;
    }
    return projectsState.data.find((project) => project.id === activeProjectId);
  }, [projectsState, activeProjectId]);

  const issuesState = activeProjectId ? issuesByProject[activeProjectId] : undefined;
  const issues = issuesState?.status === 'success' ? issuesState.data : [];

  return (
    <div className="app-shell mx-auto max-w-[1400px] px-6 py-8">
      <header className="surface-card mb-6 flex flex-wrap items-center justify-between gap-6 px-6 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--accent-2)]">
            Falcon PM
          </p>
          <h1 className="text-3xl font-semibold">Kanban Control Room</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Track execution state across every issue and keep momentum visible.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Project
            </span>
            <select
              className="rounded-full border border-[var(--stroke)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)]"
              value={activeProjectId ?? ''}
              onChange={(event) => setActiveProjectId(event.target.value)}
            >
              {projectsState.status === 'success' &&
                projectsState.data.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {isMockedMode() ? (
              <span className="badge" style={{ background: '#FEF3C7', color: '#B45309' }}>
                Mocked Mode
              </span>
            ) : (
              <span className="badge" style={{ background: '#DCFCE7', color: '#15803D' }}>
                Live API
              </span>
            )}
            {status === 'open' && (
              <span className="badge badge-muted">Realtime</span>
            )}
          </div>
        </div>
      </header>

      <ErrorBanner />

      <main className="surface-card px-6 py-6">
        {projectsState.status === 'loading' && (
          <p className="text-sm text-[var(--ink-muted)]">Loading projects...</p>
        )}
        {projectsState.status === 'error' && (
          <p className="text-sm text-red-700">{projectsState.error}</p>
        )}

        {activeProject && (
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{activeProject.name}</h2>
              <p className="text-sm text-[var(--ink-muted)]">{activeProject.slug}</p>
            </div>
          </div>
        )}

        {issuesState?.status === 'loading' && (
          <p className="text-sm text-[var(--ink-muted)]">Loading issues...</p>
        )}
        {issuesState?.status === 'error' && (
          <p className="text-sm text-red-700">{issuesState.error}</p>
        )}
        {issuesState?.status === 'success' && (
          <KanbanBoard
            issues={issues}
            onIssueSelect={(issueId) => selectIssue(issueId)}
            onStageChange={(issueId, toStage) => transitionIssue(issueId, toStage)}
          />
        )}
      </main>

      {selectedIssueId && (
        <IssueModal issueId={selectedIssueId} onClose={() => selectIssue(null)} />
      )}
    </div>
  );
}
