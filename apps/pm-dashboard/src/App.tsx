import { useCallback, useEffect, useMemo } from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { IssueModal } from './components/IssueModal';
import { useWebSocket } from './hooks/useWebSocket';
import { useIssuesStore } from './stores/issues';
import { useProjectsStore } from './stores/projects';
import { useUiStore } from './stores/ui';
import type { IssueDto, WsClientMessage, WsServerMessage } from './types';
import { assertNever } from './types';

function buildWsUrl() {
  if (import.meta.env.VITE_WS_BASE_URL) {
    return `${import.meta.env.VITE_WS_BASE_URL.replace(/\/$/, '')}/ws`;
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    const apiUrl = new URL(import.meta.env.VITE_API_BASE_URL);
    apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    apiUrl.pathname = '';
    return `${apiUrl.toString().replace(/\/$/, '')}/ws`;
  }
  return null;
}

function isIssuePayload(data: unknown): data is IssueDto {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const maybe = data as IssueDto;
  return typeof maybe.id === 'string' && typeof maybe.stage === 'string';
}

export default function App() {
  const projects = useProjectsStore((state) => state.projects);
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const selectProject = useProjectsStore((state) => state.selectProject);

  const issues = useIssuesStore((state) => state.issues);
  const labels = useIssuesStore((state) => state.labels);
  const comments = useIssuesStore((state) => state.comments);
  const loadIssues = useIssuesStore((state) => state.loadIssues);
  const loadLabels = useIssuesStore((state) => state.loadLabels);
  const loadComments = useIssuesStore((state) => state.loadComments);
  const addComment = useIssuesStore((state) => state.addComment);
  const transitionIssue = useIssuesStore((state) => state.transitionIssue);
  const updateIssueLabels = useIssuesStore((state) => state.updateIssueLabels);
  const applyIssueUpdate = useIssuesStore((state) => state.applyIssueUpdate);

  const errorBanner = useUiStore((state) => state.errorBanner);
  const issueModalId = useUiStore((state) => state.issueModalId);
  const clearErrorBanner = useUiStore((state) => state.clearErrorBanner);
  const openIssueModal = useUiStore((state) => state.openIssueModal);
  const closeIssueModal = useUiStore((state) => state.closeIssueModal);

  const isMocked = !import.meta.env.VITE_API_BASE_URL;
  const wsUrl = buildWsUrl();
  const shouldConnectWs = Boolean(wsUrl && selectedProjectId);

  const handleWsEvent = useCallback(
    (message: WsServerMessage) => {
      if (message.type !== 'event') {
        return;
      }
      if (message.event.startsWith('issue.') && isIssuePayload(message.data)) {
        applyIssueUpdate(message.data);
      }
      if (message.event === 'label.created' && selectedProjectId) {
        loadLabels(selectedProjectId);
      }
    },
    [applyIssueUpdate, loadLabels, selectedProjectId]
  );

  const { send } = useWebSocket<WsServerMessage>(shouldConnectWs ? wsUrl : null, handleWsEvent);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    loadIssues(selectedProjectId);
    loadLabels(selectedProjectId);
  }, [selectedProjectId, loadIssues, loadLabels]);

  useEffect(() => {
    if (!issueModalId) {
      return;
    }
    loadComments(issueModalId);
  }, [issueModalId, loadComments]);

  useEffect(() => {
    if (!selectedProjectId || !shouldConnectWs) {
      return;
    }
    const subscribeMessage: WsClientMessage = {
      type: 'subscribe',
      channel: `project:${selectedProjectId}`
    };
    send(subscribeMessage);
    return () => {
      send({ type: 'unsubscribe', channel: `project:${selectedProjectId}` });
    };
  }, [selectedProjectId, send, shouldConnectWs]);

  const selectedIssue = useMemo(() => {
    if (issues.status !== 'success' || !issueModalId) {
      return null;
    }
    return issues.data.find((issue) => issue.id === issueModalId) ?? null;
  }, [issues, issueModalId]);

  const labelList = labels.status === 'success' ? labels.data : [];

  const projectStatusContent = (() => {
    switch (projects.status) {
      case 'idle':
        return null;
      case 'loading':
        return (
          <div className="rounded-3xl border border-ink-100 bg-white/70 p-8">
            <p className="text-sm text-ink-700">Loading projects...</p>
          </div>
        );
      case 'error':
        return (
          <div className="rounded-3xl border border-ink-100 bg-white/70 p-8">
            <p className="text-sm text-ink-700">{projects.error}</p>
          </div>
        );
      case 'success':
        return null;
      default:
        assertNever(projects.status);
        return null;
    }
  })();

  const issuesContent = (() => {
    switch (issues.status) {
      case 'idle':
        return null;
      case 'loading':
        return (
          <div className="rounded-3xl border border-ink-100 bg-white/70 p-8">
            <p className="text-sm text-ink-700">Loading issues...</p>
          </div>
        );
      case 'error':
        return (
          <div className="rounded-3xl border border-ink-100 bg-white/70 p-8">
            <p className="text-sm text-ink-700">{issues.error}</p>
          </div>
        );
      case 'success':
        return (
          <KanbanBoard
            issues={issues.data}
            onOpenIssue={openIssueModal}
            onMoveIssue={async (issueId, toStage) => {
              clearErrorBanner();
              await transitionIssue(issueId, toStage);
            }}
          />
        );
      default:
        assertNever(issues.status);
        return null;
    }
  })();

  return (
    <div className="min-h-screen bg-mesh bg-cover">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-ink-700">Falcon PM</p>
            <h1 className="font-display text-3xl font-semibold text-ink-900">Sprint 2 Kanban</h1>
          </div>
          <div className="flex items-center gap-3">
            {isMocked ? (
              <span className="rounded-full bg-sun-500 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ink-900">
                Mocked
              </span>
            ) : (
              <span className="rounded-full bg-sea-400 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ink-900">
                Live
              </span>
            )}
            {projects.status === 'success' ? (
              <select
                className="rounded-full border border-ink-100 bg-white px-3 py-2 text-sm"
                value={selectedProjectId ?? ''}
                onChange={(event) => selectProject(event.target.value)}
              >
                {projects.data.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </header>

        {errorBanner ? (
          <div className="mt-6 flex items-center justify-between rounded-2xl border border-sun-400 bg-sun-300/60 px-4 py-3 text-sm text-ink-900">
            <span>{errorBanner}</span>
            <button className="font-semibold" onClick={clearErrorBanner}>
              Dismiss
            </button>
          </div>
        ) : null}

        <main className="mt-6 flex-1">
          {projectStatusContent}
          {issuesContent}
        </main>
      </div>

      {selectedIssue ? (
        <IssueModal
          issue={selectedIssue}
          labels={labelList}
          commentsState={comments[selectedIssue.id]}
          onClose={() => {
            closeIssueModal();
            clearErrorBanner();
          }}
          onAddComment={async (content, authorName) => {
            await addComment(selectedIssue.id, content, authorName);
          }}
          onToggleLabel={async (labelId, nextChecked) => {
            const existing = new Set(selectedIssue.labels.map((label) => label.id));
            if (nextChecked) {
              existing.add(labelId);
            } else {
              existing.delete(labelId);
            }
            await updateIssueLabels(selectedIssue.id, Array.from(existing));
          }}
        />
      ) : null}
    </div>
  );
}
