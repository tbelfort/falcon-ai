import { useEffect, useCallback } from 'react';
import { useProjectStore } from './stores/projectStore';
import { useIssueStore } from './stores/issueStore';
import { useWebSocket } from './hooks/useWebSocket';
import { KanbanBoard } from './components/KanbanBoard';
import { IssueModal } from './components/IssueModal';
import { ProjectSelector } from './components/ProjectSelector';
import type { WsServerMessage } from './types';

const WS_URL = import.meta.env.VITE_WS_URL ?? null;

function App() {
  const { projects, fetchProjects, selectedProjectId } = useProjectStore();
  const { handleWsEvent, fetchIssues } = useIssueStore();

  const onWsMessage = useCallback(
    (msg: WsServerMessage) => {
      if (msg.type === 'event') {
        handleWsEvent(msg.event, msg.data);
      }
    },
    [handleWsEvent]
  );

  const { subscribe } = useWebSocket(WS_URL, { onMessage: onWsMessage });

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (selectedProjectId && WS_URL) {
      subscribe(`project:${selectedProjectId}`);
    }
  }, [selectedProjectId, subscribe]);

  // Refetch issues when project changes
  useEffect(() => {
    if (selectedProjectId) {
      fetchIssues(selectedProjectId);
    }
  }, [selectedProjectId, fetchIssues]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-full mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Falcon PM Dashboard</h1>
          <ProjectSelector />
        </div>
      </header>

      <main className="p-4">
        {projects.status === 'loading' && (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading projects...</div>
          </div>
        )}
        {projects.status === 'error' && (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-500">Error: {projects.error}</div>
          </div>
        )}
        {projects.status === 'success' && projects.data.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">No projects found</div>
          </div>
        )}
        {projects.status === 'success' && projects.data.length > 0 && <KanbanBoard />}
      </main>

      <IssueModal />
    </div>
  );
}

export default App;
