import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { KanbanBoard } from './KanbanBoard';
import { useIssueStore } from '../../stores/issueStore';
import { useProjectStore } from '../../stores/projectStore';
import { resetMockData } from '../../mocks/handlers';

describe('KanbanBoard', () => {
  beforeEach(() => {
    resetMockData();
    // Reset stores
    useIssueStore.setState({ issues: { status: 'idle' }, comments: { status: 'idle' }, optimisticUpdates: new Map() });
    useProjectStore.setState({ projects: { status: 'idle' }, selectedProjectId: null, labels: { status: 'idle' } });
  });

  it('renders loading state initially', () => {
    useIssueStore.setState({ issues: { status: 'loading' } });
    render(<KanbanBoard />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('renders error state when fetch fails', () => {
    useIssueStore.setState({ issues: { status: 'error', error: 'Network error' } });
    render(<KanbanBoard />);
    expect(screen.getByTestId('error')).toHaveTextContent('Network error');
  });

  it('renders columns for all stages', async () => {
    await useProjectStore.getState().fetchProjects();
    await useIssueStore.getState().fetchIssues('proj-1');

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });

    // Check for some key columns
    expect(screen.getByTestId('column-BACKLOG')).toBeInTheDocument();
    expect(screen.getByTestId('column-TODO')).toBeInTheDocument();
    expect(screen.getByTestId('column-IMPLEMENT')).toBeInTheDocument();
    expect(screen.getByTestId('column-DONE')).toBeInTheDocument();
  });

  it('renders issue cards with correct data', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByTestId('issue-card-iss-1')).toBeInTheDocument();
    });

    // Check issue card content
    expect(screen.getByText('Implement user authentication')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
  });

  it('shows labels on issue cards', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByTestId('issue-card-iss-2')).toBeInTheDocument();
    });

    // Issue 2 has 'bug' and 'high-priority' labels
    const card = screen.getByTestId('issue-card-iss-2');
    expect(card).toHaveTextContent('bug');
    expect(card).toHaveTextContent('high-priority');
  });

  it('shows agent badge when issue has assigned agent', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByTestId('issue-card-iss-3')).toBeInTheDocument();
    });

    // Issue 3 is assigned to 'agent-context'
    const card = screen.getByTestId('issue-card-iss-3');
    expect(card).toHaveTextContent('context');
  });
});
