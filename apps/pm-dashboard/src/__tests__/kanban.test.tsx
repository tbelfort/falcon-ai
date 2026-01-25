import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from '../App';
import { createDragEndHandler } from '../components/KanbanBoard';
import * as api from '../api/client';
import { useIssuesStore } from '../stores/issues';
import { useUiStore } from '../stores/ui';

describe('Kanban UI', () => {
  it('renders columns and issue cards from the mocked API', async () => {
    render(<App />);

    expect(await screen.findByTestId('stage-column-BACKLOG')).toBeInTheDocument();
    expect(await screen.findByText('Kanban board initial layout')).toBeInTheDocument();
  });

  it('opens issue modal and loads comments', async () => {
    render(<App />);

    const issueCard = await screen.findByText('Wireframe issue modal');
    fireEvent.click(issueCard);

    expect(await screen.findByText('Comments')).toBeInTheDocument();
    expect(
      await screen.findByText('Let us keep the modal wide enough for labels and comments.')
    ).toBeInTheDocument();
  });

  it('moves issues optimistically and reverts on API validation error', async () => {
    render(<App />);

    await screen.findByText('Kanban board initial layout');

    const moveIssueOptimistic = useIssuesStore.getState().moveIssueOptimistic;
    const { setError, clearError } = useUiStore.getState();
    const handler = createDragEndHandler(moveIssueOptimistic, setError, clearError);

    const state = useIssuesStore.getState().issuesState;
    if (state.status !== 'success') {
      throw new Error('Issues not loaded');
    }
    const issue = state.data.find((item) => item.title === 'Kanban board initial layout');
    if (!issue) {
      throw new Error('Issue not found');
    }

    const todoColumn = screen.getByTestId('stage-column-TODO');
    const spy = vi.spyOn(api, 'transitionIssue');

    await act(async () => {
      await handler({
        active: { id: issue.id },
        over: { id: 'TODO' }
      } as unknown as import('@dnd-kit/core').DragEndEvent);
    });

    expect(todoColumn).toHaveTextContent('Kanban board initial layout');
    expect(spy).toHaveBeenCalledWith(issue.id, 'TODO');

    await act(async () => {
      await handler({
        active: { id: issue.id },
        over: { id: 'DONE' }
      } as unknown as import('@dnd-kit/core').DragEndEvent);
    });

    expect(
      await screen.findByText('Issue must be merge-ready before moving to Done.')
    ).toBeInTheDocument();
    expect(todoColumn).toHaveTextContent('Kanban board initial layout');
  });
});
