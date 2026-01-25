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
});
