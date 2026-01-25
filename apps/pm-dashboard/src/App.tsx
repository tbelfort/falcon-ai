import { useEffect, useCallback } from 'react';
import { KanbanBoard } from './components/Kanban';
import { IssueModal } from './components/IssueModal';
import { ErrorBanner } from './components/ErrorBanner';
import { useProjectStore } from './stores/projectStore';
import { useIssueStore } from './stores/issueStore';
import { useWebSocket } from './hooks/useWebSocket';
import type { WsServerMessage, IssueDto, CommentDto } from './api/types';

function App() {
  const { projects, selectedProjectId, fetchProjects } = useProjectStore();
  const { fetchIssues, updateIssue, addCommentToCache } = useIssueStore();

  // Fetch projects on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Fetch issues when project changes
  useEffect(() => {
    if (selectedProjectId) {
      fetchIssues(selectedProjectId);
    }
  }, [selectedProjectId, fetchIssues]);

  // WebSocket event handler
  const handleWsMessage = useCallback(
    (message: WsServerMessage) => {
      if (message.type !== 'event') return;

      switch (message.event) {
        case 'issue.created':
        case 'issue.updated':
          updateIssue(message.data as IssueDto);
          break;
        case 'comment.created':
          addCommentToCache(message.data as CommentDto);
          break;
      }
    },
    [updateIssue, addCommentToCache]
  );

  // Connect to WebSocket (disabled in mocked mode)
  const wsUrl = import.meta.env.VITE_WS_URL;
  const { subscribe } = useWebSocket({
    url: wsUrl || 'ws://localhost:3000/ws',
    onMessage: handleWsMessage,
    enabled: !!wsUrl,
  });

  // Subscribe to project channel
  useEffect(() => {
    if (selectedProjectId && wsUrl) {
      subscribe(`project:${selectedProjectId}`);
    }
  }, [selectedProjectId, subscribe, wsUrl]);

  const selectedProject =
    projects.status === 'success'
      ? projects.data.find((p) => p.id === selectedProjectId)
      : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-900">Falcon PM</h1>
            {selectedProject && (
              <span className="text-gray-500">/ {selectedProject.name}</span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main>
        {projects.status === 'loading' && (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading...</div>
          </div>
        )}

        {projects.status === 'error' && (
          <div className="flex items-center justify-center h-64">
            <div className="text-red-500">{projects.error}</div>
          </div>
        )}

        {projects.status === 'success' && <KanbanBoard />}
      </main>

      {/* Modal */}
      <IssueModal />

      {/* Error banner */}
      <ErrorBanner />
    </div>
  );
}

export default App;
