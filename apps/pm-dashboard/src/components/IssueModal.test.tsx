import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssueModal } from './IssueModal';
import { useUiStore } from '../stores/uiStore';
import { useIssueStore } from '../stores/issueStore';
import { useProjectStore } from '../stores/projectStore';
import { resetMockData, mockIssues, mockLabels, mockComments } from '../mocks/data';

describe('IssueModal', () => {
  beforeEach(() => {
    resetMockData();
    useUiStore.setState({
      isModalOpen: false,
      modalIssueId: null,
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      selectedIssueId: null,
      comments: { status: 'idle' },
      error: null,
    });
    useProjectStore.setState({
      projects: { status: 'success', data: [] },
      selectedProjectId: 'proj-1',
      labels: { status: 'success', data: mockLabels },
    });
  });

  it('does not render when modal is closed', () => {
    render(<IssueModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders issue details when modal is open', () => {
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: mockComments.filter(c => c.issueId === 'issue-2') },
    });

    render(<IssueModal />);

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('Implement authentication flow')).toBeInTheDocument();
    expect(screen.getByText('Implement')).toBeInTheDocument();
  });

  it('displays issue description', () => {
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: [] },
    });

    render(<IssueModal />);

    expect(screen.getByText('Add user authentication with JWT tokens and session management.')).toBeInTheDocument();
  });

  it('shows "No description" for issues without description', () => {
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-10',
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: [] },
    });

    render(<IssueModal />);

    expect(screen.getByText('No description')).toBeInTheDocument();
  });

  it('displays comments for the issue', () => {
    const issueComments = mockComments.filter(c => c.issueId === 'issue-2');
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: issueComments },
      selectIssue: vi.fn(),
    });

    render(<IssueModal />);

    expect(screen.getByText('Started working on the authentication flow. Will use JWT with refresh tokens.')).toBeInTheDocument();
    expect(screen.getByText('Make sure to add rate limiting for the login endpoint.')).toBeInTheDocument();
  });

  it('shows loading state for comments', () => {
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'loading' },
    });

    render(<IssueModal />);

    expect(screen.getByText('Loading comments...')).toBeInTheDocument();
  });

  it('displays issue labels', () => {
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: [] },
    });

    render(<IssueModal />);

    expect(screen.getByText('feature')).toBeInTheDocument();
    expect(screen.getByText('priority')).toBeInTheDocument();
  });

  it('displays agent badge for assigned issues', () => {
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: [] },
    });

    render(<IssueModal />);

    expect(screen.getByText('Agent: agent-alpha')).toBeInTheDocument();
  });

  it('closes modal when clicking close button', async () => {
    const user = userEvent.setup();
    const closeModal = vi.fn();
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
      closeModal,
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: [] },
      selectIssue: vi.fn(),
    });

    render(<IssueModal />);

    const closeButton = screen.getByLabelText('Close');
    await user.click(closeButton);

    expect(closeModal).toHaveBeenCalled();
  });

  it('closes modal when clicking backdrop', async () => {
    const user = userEvent.setup();
    const closeModal = vi.fn();
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
      closeModal,
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: [] },
      selectIssue: vi.fn(),
    });

    render(<IssueModal />);

    // Click the backdrop (the outer div)
    const backdrop = screen.getByText('Implement authentication flow').closest('.fixed');
    if (backdrop) {
      await user.click(backdrop);
      expect(closeModal).toHaveBeenCalled();
    }
  });

  it('submits new comment', async () => {
    const user = userEvent.setup();
    const addComment = vi.fn().mockResolvedValue(undefined);
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: [] },
      addComment,
      selectIssue: vi.fn(),
    });

    render(<IssueModal />);

    const textarea = screen.getByPlaceholderText('Add a comment...');
    await user.type(textarea, 'This is a test comment');

    const submitButton = screen.getByText('Add Comment');
    await user.click(submitButton);

    expect(addComment).toHaveBeenCalledWith('issue-2', 'This is a test comment');
  });

  it('disables submit button when comment is empty', () => {
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: [] },
      selectIssue: vi.fn(),
    });

    render(<IssueModal />);

    const submitButton = screen.getByText('Add Comment');
    expect(submitButton).toBeDisabled();
  });

  it('toggles label editor when clicking Edit', async () => {
    const user = userEvent.setup();
    useUiStore.setState({
      isModalOpen: true,
      modalIssueId: 'issue-2',
    });
    useIssueStore.setState({
      issues: { status: 'success', data: mockIssues },
      comments: { status: 'success', data: [] },
      selectIssue: vi.fn(),
    });

    render(<IssueModal />);

    const editButton = screen.getByText('Edit');
    await user.click(editButton);

    // Should now show Done button and all available labels
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('documentation')).toBeInTheDocument();
  });
});
