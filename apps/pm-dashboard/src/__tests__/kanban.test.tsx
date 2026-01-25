import { act, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import App from '../App';
import type { IssueStage } from '../api/types';
import { useIssuesStore } from '../stores/issuesStore';
import { useProjectsStore } from '../stores/projectsStore';
import { server } from '../mocks/server';
import { updateIssueStage } from '../mocks/data';

describe('Kanban UI', () => {
  const waitForData = async () => {
    await waitFor(() => {
      expect(useProjectsStore.getState().projectsState.status).toBe('success');
    });
    await waitFor(() => {
      expect(useIssuesStore.getState().issuesState.status).toBe('success');
    });
  };

  it('renders columns and issue cards from mocked API', async () => {
    render(<App />);
    await waitForData();
    expect(await screen.findByTestId('kanban-column-BACKLOG')).toBeInTheDocument();
    expect(await screen.findByText('Define stage transition policies')).toBeInTheDocument();
  });

  it('opens issue modal and loads comments', async () => {
    render(<App />);
    await waitForData();
    const issue = await screen.findByText('Context pack UI polishing');
    fireEvent.click(issue);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText(/Keep the hero banner lean/i)).toBeInTheDocument();
  });

  it('updates local state and calls transition API on move', async () => {
    const transitionCalls: Array<{ id: string; stage: string }> = [];

    server.use(
      http.post('*/api/issues/:id/transition', async ({ params, request }) => {
        const body = (await request.json()) as { toStage?: string };
        transitionCalls.push({ id: String(params.id), stage: String(body.toStage) });
        const updated = updateIssueStage(
          String(params.id),
          (body.toStage ?? 'TODO') as IssueStage
        );
        return HttpResponse.json({ data: updated });
      })
    );

    render(<App />);
    await waitForData();
    await screen.findByText('Define stage transition policies');
    await act(async () => {
      await useIssuesStore.getState().transitionIssue('issue-101', 'TODO');
    });

    const todoColumn = await screen.findByTestId('kanban-column-TODO');
    expect(within(todoColumn).getByText('Define stage transition policies')).toBeInTheDocument();
    expect(transitionCalls).toHaveLength(1);
    expect(transitionCalls[0]).toEqual({ id: 'issue-101', stage: 'TODO' });
  });

  it('reverts optimistic move and shows error on invalid transition', async () => {
    render(<App />);
    await waitForData();
    await screen.findByText('Define stage transition policies');
    await act(async () => {
      await useIssuesStore.getState().transitionIssue('issue-101', 'DONE');
    });

    const backlogColumn = await screen.findByTestId('kanban-column-BACKLOG');
    expect(within(backlogColumn).getByText('Define stage transition policies')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
