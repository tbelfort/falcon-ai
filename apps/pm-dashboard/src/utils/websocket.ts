import type { WsServerMessage } from '@/api/types';

// Exported for testing
export function resolveWsUrl(baseUrl?: string, locationProtocol?: string, locationHost?: string): string {
  const base = baseUrl ?? import.meta.env.VITE_API_BASE_URL;
  if (base) {
    const url = new URL(base, `${locationProtocol ?? window.location.protocol}//${locationHost ?? window.location.host}`);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}/ws`;
  }
  const protocol = (locationProtocol ?? window.location.protocol) === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${locationHost ?? window.location.host}/ws`;
}

// Exported for testing
export interface WsEventHandlerDeps {
  selectedProjectId: string | null;
  selectedIssueId: string | null;
  loadIssues: (projectId: string) => Promise<void>;
  loadLabels: (projectId: string) => Promise<void>;
  loadComments: (issueId: string) => Promise<void>;
}

export function createWsEventHandler(deps: WsEventHandlerDeps) {
  return (message: WsServerMessage) => {
    if (message.type !== 'event') {
      return;
    }
    if (deps.selectedProjectId && message.channel === `project:${deps.selectedProjectId}`) {
      if (message.event.startsWith('issue.')) {
        deps.loadIssues(deps.selectedProjectId);
      }
      if (message.event === 'label.created') {
        deps.loadLabels(deps.selectedProjectId);
      }
    }
    if (deps.selectedIssueId && message.channel === `issue:${deps.selectedIssueId}`) {
      if (message.event === 'comment.created') {
        deps.loadComments(deps.selectedIssueId);
      }
    }
  };
}
