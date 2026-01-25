import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KanbanBoard } from './KanbanBoard';
import { useProjectStore } from '../stores/projectStore';
import { useIssueStore } from '../stores/issueStore';
import { resetMockData, mockIssues } from '../mocks/data';

describe('KanbanBoard', () => {
  beforeEach(() => {
    resetMockData();
    // Reset stores with mocked fetchIssues to prevent API calls
    useProjectStore.setState({
      projects: { status: 'idle' },
      selectedProjectId: 'proj-1',
      labels: { status: 'idle' },
    });
  });

  it('renders loading state while fetching issues', () => {
    useIssueStore.setState({
      issues: { status: 'loading' },
      selectedIssueId: null,
      comments: { status: 'idle' },
      error: null,
      fetchIssues: vi.fn(),
    });
    render(<KanbanBoard />);
    expect(screen.getByText('Loading issues...')).toBeInTheDocument();
  });

  it('renders error state when fetch fails', () => {
    useIssueStore.setState({
      issues: { status: 'error', error: 'Network error' },
      selectedIssueId: null,
      comments: { status: 'idle' },
      error: null,
      fetchIssues: vi.fn(),
    });
    render(<KanbanBoard />);
    expect(screen.getByText('Error: Network error')).toBeInTheDocument();
  });

  it('renders kanban columns with stage labels', async () => {
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      selectedIssueId: null,
      comments: { status: 'idle' },
      error: null,
      fetchIssues: vi.fn(),
    });

    render(<KanbanBoard />);

    // Check that stage columns are rendered
    expect(screen.getByText('Backlog')).toBeInTheDocument();
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('Implement')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders issue cards in the correct columns', async () => {
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      selectedIssueId: null,
      comments: { status: 'idle' },
      error: null,
      fetchIssues: vi.fn(),
    });

    render(<KanbanBoard />);

    // Check that issues are rendered
    expect(screen.getByText('Set up project structure')).toBeInTheDocument();
    expect(screen.getByText('Implement authentication flow')).toBeInTheDocument();
    expect(screen.getByText('Fix login button styling')).toBeInTheDocument();
  });

  it('displays issue labels on cards', async () => {
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      selectedIssueId: null,
      comments: { status: 'idle' },
      error: null,
      fetchIssues: vi.fn(),
    });

    render(<KanbanBoard />);

    // Check that labels are rendered (multiple "feature" labels exist)
    const featureLabels = screen.getAllByText('feature');
    expect(featureLabels.length).toBeGreaterThan(0);
  });

  it('displays agent badge when issue has assigned agent', async () => {
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      selectedIssueId: null,
      comments: { status: 'idle' },
      error: null,
      fetchIssues: vi.fn(),
    });

    render(<KanbanBoard />);

    // Check that agent badge is shown
    expect(screen.getByText('Agent: agent-alpha')).toBeInTheDocument();
  });

  it('shows error banner when transition fails', async () => {
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      selectedIssueId: null,
      comments: { status: 'idle' },
      error: 'Transition failed: Invalid transition',
      fetchIssues: vi.fn(),
    });

    render(<KanbanBoard />);

    expect(screen.getByText('Transition failed: Invalid transition')).toBeInTheDocument();
  });

  it('dismisses error banner when clicking dismiss', async () => {
    const user = userEvent.setup();
    const clearError = vi.fn();
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      selectedIssueId: null,
      comments: { status: 'idle' },
      error: 'Some error',
      clearError,
      fetchIssues: vi.fn(),
    });

    render(<KanbanBoard />);

    const dismissButton = screen.getByText('Dismiss');
    await user.click(dismissButton);

    expect(clearError).toHaveBeenCalled();
  });
});
