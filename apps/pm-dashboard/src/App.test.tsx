import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { useIssueStore } from './stores/issueStore';
import { useProjectStore } from './stores/projectStore';
import { useUiStore } from './stores/uiStore';
import { resetMockData } from './mocks/handlers';

describe('App', () => {
  beforeEach(() => {
    resetMockData();
    useIssueStore.setState({ issues: { status: 'idle' }, comments: { status: 'idle' }, optimisticUpdates: new Map() });
    useProjectStore.setState({ projects: { status: 'idle' }, selectedProjectId: null, labels: { status: 'idle' } });
    useUiStore.setState({ isModalOpen: false, selectedIssueId: null, errorBanner: null });
  });

  it('renders header with project name after loading', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Falcon PM')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('/ Falcon AI')).toBeInTheDocument();
    });
  });

  it('loads and displays kanban board', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });

    // Should have issues loaded
    await waitFor(() => {
      expect(screen.getByText('Implement user authentication')).toBeInTheDocument();
    });
  });

  it('opens issue modal when clicking an issue card', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('issue-card-iss-1')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('issue-card-iss-1'));

    await waitFor(() => {
      expect(screen.getByTestId('issue-modal')).toBeInTheDocument();
    });

    // The modal should contain the issue title (using getAllByText since it appears in both card and modal)
    const modal = screen.getByTestId('issue-modal');
    expect(modal).toHaveTextContent('Implement user authentication');
  });

  it('shows error banner when transition fails', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
    });

    // Manually trigger an error
    useUiStore.getState().showError('Cannot transition from BACKLOG to IMPLEMENT');

    await waitFor(() => {
      expect(screen.getByTestId('error-banner')).toBeInTheDocument();
    });

    expect(screen.getByText('Cannot transition from BACKLOG to IMPLEMENT')).toBeInTheDocument();
  });
});
