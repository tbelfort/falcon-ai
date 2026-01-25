import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssueModal } from './IssueModal';
import { useIssueStore } from '../../stores/issueStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { resetMockData } from '../../mocks/handlers';

describe('IssueModal', () => {
  beforeEach(() => {
    resetMockData();
    useIssueStore.setState({ issues: { status: 'idle' }, comments: { status: 'idle' }, optimisticUpdates: new Map() });
    useProjectStore.setState({ projects: { status: 'idle' }, selectedProjectId: 'proj-1', labels: { status: 'idle' } });
    useUiStore.setState({ isModalOpen: false, selectedIssueId: null, errorBanner: null });
  });

  it('does not render when closed', () => {
    render(<IssueModal />);
    expect(screen.queryByTestId('issue-modal')).not.toBeInTheDocument();
  });

  it('renders modal when open with issue', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');
    await useProjectStore.getState().fetchLabels('proj-1');
    useUiStore.getState().openIssueModal('iss-2');

    render(<IssueModal />);

    await waitFor(() => {
      expect(screen.getByTestId('issue-modal')).toBeInTheDocument();
    });

    expect(screen.getByText('Fix memory leak in WebSocket handler')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('TODO')).toBeInTheDocument();
  });

  it('loads and displays comments', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');
    await useProjectStore.getState().fetchLabels('proj-1');
    useUiStore.getState().openIssueModal('iss-2');

    render(<IssueModal />);

    await waitFor(() => {
      expect(screen.getByTestId('comments-list')).toBeInTheDocument();
    });

    // Issue 2 has 2 comments
    await waitFor(() => {
      expect(screen.getByTestId('comment-cmt-1')).toBeInTheDocument();
      expect(screen.getByTestId('comment-cmt-2')).toBeInTheDocument();
    });

    expect(screen.getByText(/found the root cause/)).toBeInTheDocument();
  });

  it('allows adding a new comment', async () => {
    const user = userEvent.setup();
    await useIssueStore.getState().fetchIssues('proj-1');
    await useProjectStore.getState().fetchLabels('proj-1');
    useUiStore.getState().openIssueModal('iss-2');

    render(<IssueModal />);

    await waitFor(() => {
      expect(screen.getByTestId('comment-input')).toBeInTheDocument();
    });

    const input = screen.getByTestId('comment-input');
    const submitBtn = screen.getByTestId('submit-comment');

    await user.type(input, 'This is a test comment');
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('This is a test comment')).toBeInTheDocument();
    });
  });

  it('closes modal when clicking overlay', async () => {
    await useIssueStore.getState().fetchIssues('proj-1');
    await useProjectStore.getState().fetchLabels('proj-1');
    useUiStore.getState().openIssueModal('iss-2');

    render(<IssueModal />);

    await waitFor(() => {
      expect(screen.getByTestId('issue-modal-overlay')).toBeInTheDocument();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('issue-modal-overlay'));

    expect(useUiStore.getState().isModalOpen).toBe(false);
  });

  it('switches between comments and labels tabs', async () => {
    const user = userEvent.setup();
    await useIssueStore.getState().fetchIssues('proj-1');
    await useProjectStore.getState().fetchLabels('proj-1');
    useUiStore.getState().openIssueModal('iss-2');

    render(<IssueModal />);

    await waitFor(() => {
      expect(screen.getByTestId('comments-list')).toBeInTheDocument();
    });

    // Switch to labels tab
    const labelsTab = screen.getByRole('button', { name: 'Edit Labels' });
    await user.click(labelsTab);

    await waitFor(() => {
      expect(screen.getByTestId('label-editor')).toBeInTheDocument();
    });

    // Switch back to comments
    const commentsTab = screen.getByRole('button', { name: 'Comments' });
    await user.click(commentsTab);

    await waitFor(() => {
      expect(screen.getByTestId('comments-list')).toBeInTheDocument();
    });
  });
});
