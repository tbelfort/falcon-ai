import { useCallback, useEffect, useMemo } from 'react';
import { KanbanBoard } from '@/components/KanbanBoard';
import { IssueDetailModal } from '@/components/IssueDetailModal';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useIssuesStore } from '@/stores/issues';
import { useProjectStore } from '@/stores/projects';
import { useUiStore } from '@/stores/ui';
import type { IssueStage, WsServerMessage } from '@/api/types';

function resolveWsUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (base) {
    const url = new URL(base, window.location.origin);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}/ws`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export default function App() {
  const { projects, selectedProjectId, loadProjects, selectProject } = useProjectStore();
  const {
    issues,
    labelsByProjectId,
    commentsByIssueId,
    loadIssues,
    loadLabels,
    loadComments,
    addComment,
    moveIssueStage,
    updateLabels,
  } = useIssuesStore();
  const { selectedIssueId, openIssue, closeIssue, errorBanner, setError, clearError } = useUiStore();

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
    if (!selectedIssueId) {
      return;
    }
    loadComments(selectedIssueId);
  }, [selectedIssueId, loadComments]);

  const wsUrl = useMemo(() => resolveWsUrl(), []);
  const wsChannels = useMemo(() => {
    const channels = [] as string[];
    if (selectedProjectId) {
      channels.push(`project:${selectedProjectId}`);
    }
    if (selectedIssueId) {
      channels.push(`issue:${selectedIssueId}`);
    }
    return channels;
  }, [selectedProjectId, selectedIssueId]);

  const handleWsEvent = useCallback(
    (message: WsServerMessage) => {
      if (message.type !== 'event') {
        return;
      }
      if (selectedProjectId && message.channel === `project:${selectedProjectId}`) {
        if (message.event.startsWith('issue.')) {
          loadIssues(selectedProjectId);
        }
        if (message.event === 'label.created') {
          loadLabels(selectedProjectId);
        }
      }
      if (selectedIssueId && message.channel === `issue:${selectedIssueId}`) {
        if (message.event === 'comment.created') {
          loadComments(selectedIssueId);
        }
      }
    },
    [selectedProjectId, selectedIssueId, loadIssues, loadLabels, loadComments],
  );

  useWebSocket({
    url: selectedProjectId ? wsUrl : null,
    onEvent: handleWsEvent,
    subscriptions: wsChannels,
  });

  const selectedIssue = useMemo(() => {
    if (issues.status !== 'success' || !selectedIssueId) {
      return undefined;
    }
    return issues.data.find((issue) => issue.id === selectedIssueId);
  }, [issues, selectedIssueId]);

  const labelsState = selectedProjectId ? labelsByProjectId[selectedProjectId] : undefined;
  const labels = labelsState?.status === 'success' ? labelsState.data : [];
  const commentsState = selectedIssueId ? commentsByIssueId[selectedIssueId] : undefined;

  const handleMoveIssue = useCallback(
    async (issueId: string, toStage: IssueStage) => {
      await moveIssueStage(issueId, toStage, setError);
    },
    [moveIssueStage, setError],
  );

  return (
    <div className="relative min-h-screen px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute -left-16 top-10 h-64 w-64 rounded-full bg-[rgba(31,111,100,0.18)] blur-3xl" />
      <div className="pointer-events-none absolute right-10 top-32 h-72 w-72 rounded-full bg-[rgba(212,123,63,0.18)] blur-3xl" />

      <header className="glass mx-auto flex max-w-6xl animate-float-in flex-col gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-steel">Falcon PM</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">Kanban Command Center</h1>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <label className="text-xs uppercase tracking-[0.2em] text-steel">Project</label>
          <select
            className="rounded-full border border-[rgba(27,27,22,0.2)] bg-white px-4 py-2 text-sm"
            value={selectedProjectId ?? ''}
            onChange={(event) => selectProject(event.target.value)}
          >
            {projects.status === 'success' &&
              projects.data.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
          </select>
        </div>
      </header>

      {errorBanner && (
        <div className="mx-auto mt-6 flex max-w-6xl animate-float-in items-center justify-between rounded-2xl border border-[rgba(198,92,74,0.4)] bg-[rgba(198,92,74,0.1)] px-5 py-3 text-sm text-[var(--rose)]">
          <span>{errorBanner}</span>
          <button className="text-xs font-semibold uppercase tracking-wide" onClick={clearError}>
            Dismiss
          </button>
        </div>
      )}

      <main className="mx-auto mt-8 max-w-6xl">
        {projects.status === 'loading' && (
          <div className="rounded-3xl border border-dashed border-[rgba(27,27,22,0.2)] p-8 text-sm text-steel">
            Loading projects...
          </div>
        )}

        {projects.status === 'error' && (
          <div className="rounded-3xl border border-dashed border-[rgba(27,27,22,0.2)] p-8 text-sm text-[var(--rose)]">
            {projects.error}
          </div>
        )}

        {issues.status === 'loading' && (
          <div className="rounded-3xl border border-dashed border-[rgba(27,27,22,0.2)] p-8 text-sm text-steel">
            Loading issues...
          </div>
        )}

        {issues.status === 'error' && (
          <div className="rounded-3xl border border-dashed border-[rgba(27,27,22,0.2)] p-8 text-sm text-[var(--rose)]">
            {issues.error}
          </div>
        )}

        {issues.status === 'success' && (
          <div className="animate-float-in">
            <KanbanBoard
              issues={issues.data}
              onSelectIssue={openIssue}
              onMoveIssue={handleMoveIssue}
            />
          </div>
        )}
      </main>

      {selectedIssue && (
        <IssueDetailModal
          issue={selectedIssue}
          labels={labels}
          commentsState={commentsState}
          onClose={closeIssue}
          onAddComment={(content) => addComment(selectedIssue.id, content, 'You')}
          onToggleLabel={async (_labelId, nextSelected) => updateLabels(selectedIssue.id, nextSelected)}
        />
      )}
    </div>
  );
}
