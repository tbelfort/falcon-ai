import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanBoard } from './KanbanBoard';
import { useIssueStore } from '../stores/issueStore';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

describe('KanbanBoard', () => {
  beforeEach(() => {
    // Reset stores before each test
    useIssueStore.setState({
      issues: [],
      labels: [],
      comments: {},
      loading: false,
      error: null,
    });
    useProjectStore.setState({
      projects: [],
      currentProjectId: null,
      loading: false,
      error: null,
    });
    useUIStore.setState({
      selectedIssueId: null,
      errorMessage: null,
    });
  });

  it('renders loading state initially', () => {
    useIssueStore.setState({ loading: true });

    render(<KanbanBoard projectId="proj-1" />);

    expect(screen.getByText('Loading issues...')).toBeInTheDocument();
  });

  it('renders kanban columns', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');

    render(<KanbanBoard projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });

    // Check that columns are rendered
    expect(screen.getByTestId('column-BACKLOG')).toBeInTheDocument();
    expect(screen.getByTestId('column-TODO')).toBeInTheDocument();
    expect(screen.getByTestId('column-DONE')).toBeInTheDocument();
  });

  it('renders issue cards from mocked API', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');

    render(<KanbanBoard projectId="proj-1" />);

    await waitFor(() => {
      // Check for issue titles from mock data
      expect(screen.getByText('Add user authentication flow')).toBeInTheDocument();
      expect(screen.getByText('Fix pattern matching edge case')).toBeInTheDocument();
    });
  });

  it('opens issue modal when clicking an issue card', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');

    render(<KanbanBoard projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('Add user authentication flow')).toBeInTheDocument();
    });

    const issueCard = screen.getByTestId('issue-card-issue-1');
    await userEvent.click(issueCard);

    // Check that UI store was updated
    expect(useUIStore.getState().selectedIssueId).toBe('issue-1');
  });

  it('displays labels on issue cards', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');

    render(<KanbanBoard projectId="proj-1" />);

    await waitFor(() => {
      // Multiple issues may have the same label, use getAllByText
      expect(screen.getAllByText('feature').length).toBeGreaterThan(0);
      expect(screen.getAllByText('bug').length).toBeGreaterThan(0);
    });
  });

  it('displays assigned agent badge when present', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');

    render(<KanbanBoard projectId="proj-1" />);

    await waitFor(() => {
      // Issue 3 and 4 have assigned agents
      expect(screen.getAllByText('agent-spec').length).toBeGreaterThan(0);
    });
  });
});
