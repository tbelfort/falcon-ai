import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { moveIssue } from '@/mocks/data';
import App from '@/App';
import { useIssuesStore } from '@/stores/issues';
import { useUiStore } from '@/stores/ui';

describe('Kanban UI', () => {
  it('renders columns and issue cards from mocked API', async () => {
    render(<App />);

    expect(await screen.findByTestId('column-BACKLOG')).toBeInTheDocument();
    expect(await screen.findByTestId('column-TODO')).toBeInTheDocument();
    expect(await screen.findByText('Bootstrap PM dashboard shell')).toBeInTheDocument();
    expect(await screen.findByText('Wire Kanban drag and drop')).toBeInTheDocument();
  });

  it('opens issue modal and loads comments', async () => {
    render(<App />);

    const issueCard = await screen.findByTestId('issue-card-issue-102');
    fireEvent.click(issueCard);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Drag target zones should highlight when active.')).toBeInTheDocument();
  });

  it('moves an issue between columns and calls transition API', async () => {
    const transitionSpy = vi.fn();
    server.use(
      http.post('/api/issues/:id/transition', async ({ params, request }) => {
        const body = (await request.json()) as { toStage?: string };
        transitionSpy(body);
        const updated = moveIssue(params.id as string, body.toStage as any);
        if (!updated) {
          return HttpResponse.json(
            { error: { code: 'issue_not_found', message: 'Issue not found' } },
            { status: 404 },
          );
        }
        return HttpResponse.json({ data: updated });
      }),
    );

    render(<App />);
    const todoColumn = await screen.findByTestId('column-TODO');

    await act(async () => {
      await useIssuesStore
        .getState()
        .moveIssueStage('issue-101', 'TODO', () => undefined);
    });

    expect(await within(todoColumn).findByText('Bootstrap PM dashboard shell')).toBeInTheDocument();
    expect(transitionSpy).toHaveBeenCalledWith(expect.objectContaining({ toStage: 'TODO' }));
  });

  it('reverts optimistic move and shows error banner on validation failure', async () => {
    server.use(
      http.post('/api/issues/:id/transition', async () => {
        return HttpResponse.json(
          { error: { code: 'invalid_transition', message: 'Cannot move to Done' } },
          { status: 400 },
        );
      }),
    );

    render(<App />);

    const todoColumn = await screen.findByTestId('column-TODO');

    await act(async () => {
      await useIssuesStore
        .getState()
        .moveIssueStage('issue-102', 'DONE', useUiStore.getState().setError);
    });

    expect(await screen.findByText('Cannot move to Done')).toBeInTheDocument();
    expect(await within(todoColumn).findByText('Wire Kanban drag and drop')).toBeInTheDocument();
  });

  it('toggles a label on in the issue modal', async () => {
    const updateLabelsSpy = vi.fn();
    server.use(
      http.patch('/api/issues/:id', async ({ params, request }) => {
        const body = (await request.json()) as { labelIds?: string[] };
        updateLabelsSpy(body);
        // Return updated issue with new label
        return HttpResponse.json({
          data: {
            id: params.id,
            projectId: 'proj-falcon',
            number: 102,
            title: 'Wire Kanban drag and drop',
            description: 'Add drag interactions with optimistic updates.',
            stage: 'TODO',
            assignedAgentId: 'A-12',
            labels: [
              { id: 'label-api', projectId: 'proj-falcon', name: 'API', color: '#1f6f64' },
              { id: 'label-test', projectId: 'proj-falcon', name: 'Test', color: '#5a3b2a' },
              { id: 'label-ws', projectId: 'proj-falcon', name: 'Realtime', color: '#2b4a66' },
            ],
          },
        });
      }),
    );

    render(<App />);

    // Open the modal
    const issueCard = await screen.findByTestId('issue-card-issue-102');
    fireEvent.click(issueCard);

    // Wait for modal to open and labels to load
    await screen.findByRole('dialog');

    // Click on the 'Realtime' label to toggle it on
    const realtimeLabel = await screen.findByRole('button', { name: 'Realtime' });
    fireEvent.click(realtimeLabel);

    // Verify API was called with the new label added
    await vi.waitFor(() => {
      expect(updateLabelsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          labelIds: expect.arrayContaining(['label-api', 'label-test', 'label-ws']),
        }),
      );
    });
  });

  it('toggles a label off in the issue modal', async () => {
    const updateLabelsSpy = vi.fn();
    server.use(
      http.patch('/api/issues/:id', async ({ params, request }) => {
        const body = (await request.json()) as { labelIds?: string[] };
        updateLabelsSpy(body);
        // Return updated issue with label removed
        return HttpResponse.json({
          data: {
            id: params.id,
            projectId: 'proj-falcon',
            number: 102,
            title: 'Wire Kanban drag and drop',
            description: 'Add drag interactions with optimistic updates.',
            stage: 'TODO',
            assignedAgentId: 'A-12',
            labels: [
              { id: 'label-api', projectId: 'proj-falcon', name: 'API', color: '#1f6f64' },
            ],
          },
        });
      }),
    );

    render(<App />);

    // Open the modal
    const issueCard = await screen.findByTestId('issue-card-issue-102');
    fireEvent.click(issueCard);

    // Wait for modal to open
    await screen.findByRole('dialog');

    // Click on the 'Test' label to toggle it off (it's already selected in issue-102)
    const testLabel = await screen.findByRole('button', { name: 'Test' });
    fireEvent.click(testLabel);

    // Verify API was called with the label removed
    await vi.waitFor(() => {
      expect(updateLabelsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          labelIds: expect.arrayContaining(['label-api']),
        }),
      );
    });
  });

  it('submits a comment in the issue modal', async () => {
    const addCommentSpy = vi.fn();
    server.use(
      http.post('/api/issues/:id/comments', async ({ params, request }) => {
        const body = (await request.json()) as { content?: string; authorName?: string };
        addCommentSpy(body);
        return HttpResponse.json({
          data: {
            id: 'comment-new',
            issueId: params.id,
            content: body.content,
            authorType: 'human',
            authorName: body.authorName ?? 'Anonymous',
            createdAt: Date.now(),
          },
        });
      }),
    );

    render(<App />);

    // Open the modal
    const issueCard = await screen.findByTestId('issue-card-issue-102');
    fireEvent.click(issueCard);

    // Wait for modal to open
    await screen.findByRole('dialog');

    // Type a comment
    const textarea = await screen.findByPlaceholderText('Share a quick update or decision');
    fireEvent.change(textarea, { target: { value: 'This is a test comment' } });

    // Submit the comment
    const postButton = await screen.findByRole('button', { name: 'Post' });
    fireEvent.click(postButton);

    // Verify API was called with the comment
    await vi.waitFor(() => {
      expect(addCommentSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'This is a test comment',
        }),
      );
    });

    // Verify textarea is cleared after submit
    await vi.waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });

  it('rejects empty comment submission', async () => {
    const addCommentSpy = vi.fn();
    server.use(
      http.post('/api/issues/:id/comments', async ({ request }) => {
        const body = (await request.json()) as { content?: string };
        addCommentSpy(body);
        return HttpResponse.json({
          data: {
            id: 'comment-new',
            issueId: 'issue-102',
            content: body.content,
            authorType: 'human',
            authorName: 'Anonymous',
            createdAt: Date.now(),
          },
        });
      }),
    );

    render(<App />);

    // Open the modal
    const issueCard = await screen.findByTestId('issue-card-issue-102');
    fireEvent.click(issueCard);

    // Wait for modal to open
    await screen.findByRole('dialog');

    // Leave textarea empty and click Post
    const postButton = await screen.findByRole('button', { name: 'Post' });
    fireEvent.click(postButton);

    // Wait a bit and verify API was NOT called
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(addCommentSpy).not.toHaveBeenCalled();

    // Also test with whitespace-only content
    const textarea = await screen.findByPlaceholderText('Share a quick update or decision');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.click(postButton);

    // Wait and verify API was still NOT called
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(addCommentSpy).not.toHaveBeenCalled();
  });
});
