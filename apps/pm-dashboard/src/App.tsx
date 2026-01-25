import { useEffect, useMemo } from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { IssueModal } from './components/IssueModal';
import { ErrorBanner } from './components/ErrorBanner';
import { useIssuesStore } from './stores/issuesStore';
import { useProjectsStore } from './stores/projectsStore';
import { useUiStore } from './stores/uiStore';
import { assertNever } from './utils/assertNever';

export default function App() {
  const projectsState = useProjectsStore((state) => state.projectsState);
  const labelsState = useProjectsStore((state) => state.labelsState);
  const selectedProjectId = useProjectsStore((state) => state.selectedProjectId);
  const loadProjects = useProjectsStore((state) => state.loadProjects);
  const selectProject = useProjectsStore((state) => state.selectProject);
  const loadLabels = useProjectsStore((state) => state.loadLabels);

  const issuesState = useIssuesStore((state) => state.issuesState);
  const loadIssues = useIssuesStore((state) => state.loadIssues);
  const moveIssue = useIssuesStore((state) => state.transitionIssue);

  const selectedIssueId = useUiStore((state) => state.selectedIssueId);
  const openIssue = useUiStore((state) => state.openIssue);
  const closeIssue = useUiStore((state) => state.closeIssue);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectsState.status === 'success' && !selectedProjectId && projectsState.data.length > 0) {
      selectProject(projectsState.data[0].id);
    }
  }, [projectsState, selectedProjectId, selectProject]);

  useEffect(() => {
    if (!selectedProjectId) {
      return;
    }
    void loadIssues(selectedProjectId);
    void loadLabels(selectedProjectId);
  }, [selectedProjectId, loadIssues, loadLabels]);

  const selectedIssue = useMemo(() => {
    if (issuesState.status !== 'success' || !selectedIssueId) {
      return null;
    }
    return issuesState.data.find((issue) => issue.id === selectedIssueId) ?? null;
  }, [issuesState, selectedIssueId]);

  const labels = labelsState.status === 'success' ? labelsState.data : [];
  const isMocked = !import.meta.env.VITE_API_BASE_URL;

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center justify-between gap-4 px-6 pt-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-ink-600">Falcon PM</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink-900">Kanban Control Deck</h1>
        </div>
        <div className="flex items-center gap-3">
          {isMocked ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Mocked Mode
            </span>
          ) : null}
          <select
            className="rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-sm font-semibold text-ink-700"
            value={selectedProjectId ?? ''}
            onChange={(event) => selectProject(event.target.value)}
            disabled={projectsState.status !== 'success'}
          >
            {projectsState.status === 'success'
              ? projectsState.data.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))
              : (
                <option value="">Loading projects...</option>
              )}
          </select>
        </div>
      </header>

      <ErrorBanner />

      <main className="px-6 pb-12 pt-6">
        <section className="glass-panel rounded-[32px] border border-white/70 p-6 shadow-glow">
          {(() => {
            switch (issuesState.status) {
              case 'idle':
              case 'loading':
                return <p className="text-sm text-ink-600">Loading issues...</p>;
              case 'error':
                return <p className="text-sm text-rose-600">{issuesState.error}</p>;
              case 'success':
                return (
                  <KanbanBoard
                    issues={issuesState.data}
                    onIssueOpen={openIssue}
                    onIssueMove={moveIssue}
                  />
                );
              default:
                return assertNever(issuesState);
            }
          })()}
        </section>
      </main>

      {selectedIssue ? (
        <IssueModal issue={selectedIssue} labels={labels} onClose={closeIssue} />
      ) : null}
    </div>
  );
}
