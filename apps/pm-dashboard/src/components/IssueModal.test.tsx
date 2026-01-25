import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IssueModal } from './IssueModal';
import { useIssueStore } from '../stores/issueStore';
import { useUIStore } from '../stores/uiStore';
import { mockIssues, mockLabels } from '../mocks/data';

describe('IssueModal', () => {
  beforeEach(() => {
    // Reset stores with mock data
    useIssueStore.setState({
      issues: [...mockIssues],
      labels: [...mockLabels],
      comments: {},
      loading: false,
      error: null,
    });
    useUIStore.setState({
      selectedIssueId: null,
      errorMessage: null,
    });
  });

  it('renders issue details', () => {
    render(<IssueModal issueId="issue-1" />);

    expect(screen.getByText('Add user authentication flow')).toBeInTheDocument();
    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByText('Backlog')).toBeInTheDocument();
  });

  it('displays issue description', () => {
    render(<IssueModal issueId="issue-1" />);

    expect(
      screen.getByText('Implement OAuth2 login with GitHub and Google providers')
    ).toBeInTheDocument();
  });

  it('loads and displays comments', async () => {
    render(<IssueModal issueId="issue-1" />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'We should use OAuth2 for this. GitHub and Google are good starting points.'
        )
      ).toBeInTheDocument();
    });
  });

  it('shows author name and type for comments', async () => {
    render(<IssueModal issueId="issue-1" />);

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('human')).toBeInTheDocument();
      expect(screen.getByText('Spec Agent')).toBeInTheDocument();
      expect(screen.getByText('agent')).toBeInTheDocument();
    });
  });

  it('allows adding a new comment', async () => {
    const user = userEvent.setup();
    render(<IssueModal issueId="issue-1" />);

    const textarea = screen.getByPlaceholderText('Add a comment...');
    await user.type(textarea, 'This is a test comment');

    const submitButton = screen.getByText('Post Comment');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('This is a test comment')).toBeInTheDocument();
    });
  });

  it('displays labels on the issue', () => {
    render(<IssueModal issueId="issue-1" />);

    expect(screen.getByText('feature')).toBeInTheDocument();
  });

  it('shows edit mode for labels when clicking Edit', async () => {
    const user = userEvent.setup();
    render(<IssueModal issueId="issue-1" />);

    const editButton = screen.getByText('Edit');
    await user.click(editButton);

    // All project labels should be visible in edit mode
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('enhancement')).toBeInTheDocument();
    expect(screen.getByText('security')).toBeInTheDocument();
  });

  it('closes modal when clicking close button', async () => {
    const user = userEvent.setup();
    render(<IssueModal issueId="issue-1" />);

    const closeButton = screen.getByLabelText('Close modal');
    await user.click(closeButton);

    expect(useUIStore.getState().selectedIssueId).toBeNull();
  });

  it('closes modal when clicking backdrop', async () => {
    const user = userEvent.setup();
    render(<IssueModal issueId="issue-1" />);

    const backdrop = screen.getByTestId('issue-modal');
    await user.click(backdrop);

    expect(useUIStore.getState().selectedIssueId).toBeNull();
  });

  it('returns null for non-existent issue', () => {
    const { container } = render(<IssueModal issueId="non-existent" />);

    expect(container.firstChild).toBeNull();
  });

  it('displays assigned agent when present', () => {
    render(<IssueModal issueId="issue-3" />);

    expect(screen.getByText('agent-spec')).toBeInTheDocument();
  });

  it('shows no description message when description is null', () => {
    // Issue 3 has no description
    useIssueStore.setState({
      issues: mockIssues.map((i) =>
        i.id === 'issue-3' ? { ...i, description: null } : i
      ),
      labels: mockLabels,
      comments: {},
      loading: false,
      error: null,
    });

    render(<IssueModal issueId="issue-3" />);

    expect(screen.getByText('No description')).toBeInTheDocument();
  });
});
