import { useEffect } from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { IssueModal } from './components/IssueModal';
import { ErrorBanner } from './components/ErrorBanner';
import { useProjectStore } from './stores/projectStore';
import { useIssueStore } from './stores/issueStore';
import { useUIStore } from './stores/uiStore';

export default function App() {
  const { projects, fetchProjects, currentProjectId, setCurrentProject } = useProjectStore();
  const { fetchIssues, fetchLabels } = useIssueStore();
  const selectedIssueId = useUIStore((s) => s.selectedIssueId);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (projects.length > 0 && !currentProjectId) {
      setCurrentProject(projects[0].id);
    }
  }, [projects, currentProjectId, setCurrentProject]);

  useEffect(() => {
    if (currentProjectId) {
      fetchIssues(currentProjectId);
      fetchLabels(currentProjectId);
    }
  }, [currentProjectId, fetchIssues, fetchLabels]);

  const currentProject = projects.find((p) => p.id === currentProjectId);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="border-b border-gray-700 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-white">Falcon PM</h1>
          {projects.length > 1 && (
            <select
              value={currentProjectId || ''}
              onChange={(e) => setCurrentProject(e.target.value)}
              className="rounded border border-gray-600 bg-gray-700 px-3 py-1 text-sm text-gray-100"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {currentProject && (
          <p className="mt-1 text-sm text-gray-400">{currentProject.name}</p>
        )}
      </header>

      <ErrorBanner />

      <main className="p-6">
        {currentProjectId ? (
          <KanbanBoard projectId={currentProjectId} />
        ) : (
          <div className="text-center text-gray-500">Loading projects...</div>
        )}
      </main>

      {selectedIssueId && <IssueModal issueId={selectedIssueId} />}
    </div>
  );
}
