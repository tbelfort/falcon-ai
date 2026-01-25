import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { beforeEach, expect, vi } from 'vitest';
import { App } from '../App';
import { server } from '../mocks/server';
import { useIssuesStore } from '../stores/issuesStore';
import { useProjectsStore } from '../stores/projectsStore';
import { useUiStore } from '../stores/uiStore';

const createRect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
  top: y,
  left: x,
  right: x + width,
  bottom: y + height,
  toJSON: () => ''
});

const setElementRect = (element: HTMLElement, rect: ReturnType<typeof createRect>) => {
  element.getBoundingClientRect = () => rect as DOMRect;
  element.getClientRects = () => ({
    item: () => rect as DOMRect,
    length: 1,
    [Symbol.iterator]: function* () {
      yield rect as DOMRect;
    }
  } as DOMRectList);
};

const resetStores = () => {
  useProjectsStore.setState({
    projectsState: { status: 'idle' },
    labelsState: { status: 'idle' },
    selectedProjectId: null
  });
  useIssuesStore.setState({ issuesState: { status: 'idle' }, errorBanner: null });
  useUiStore.setState({ activeIssueId: null });
};

const dragIssueToColumn = (issueCard: HTMLElement, column: HTMLElement) => {
  const rect = column.getBoundingClientRect();
  const targetX = rect.left + rect.width / 2;
  const targetY = rect.top + 20;
  fireEvent.mouseDown(issueCard, {
    clientX: 10,
    clientY: 10,
    button: 0,
    buttons: 1
  });
  fireEvent.mouseMove(document.body, {
    clientX: targetX,
    clientY: targetY,
    buttons: 1
  });
  fireEvent.mouseMove(column, {
    clientX: targetX,
    clientY: targetY,
    buttons: 1
  });
  fireEvent.mouseUp(column, {
    clientX: targetX,
    clientY: targetY,
    button: 0
  });
};

beforeEach(() => {
  resetStores();
});

it('renders kanban columns and issue cards from the mocked API', async () => {
  render(<App />);

  expect(await screen.findByText('Define Kanban visual language')).toBeInTheDocument();
  expect(screen.getByTestId('column-BACKLOG')).toBeInTheDocument();
  expect(screen.getByTestId('column-TODO')).toBeInTheDocument();

  const backlogColumn = screen.getByTestId('column-BACKLOG');
  expect(within(backlogColumn).getByText('Define Kanban visual language')).toBeInTheDocument();
});

it('opens an issue modal and loads comments', async () => {
  render(<App />);

  const issueCard = await screen.findByTestId('issue-issue-2');
  fireEvent.click(issueCard);

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(await screen.findByText('Can we align the modal tone with the new UX guide?')).toBeInTheDocument();
});

it('moves issues between columns and reverts on API validation error', async () => {
  render(<App />);

  const issueCard = await screen.findByTestId('issue-issue-1');
  const backlogColumn = screen.getByTestId('column-BACKLOG');
  const todoColumn = screen.getByTestId('column-TODO');

  setElementRect(backlogColumn, createRect(0, 0, 240, 500));
  setElementRect(todoColumn, createRect(300, 0, 240, 500));
  setElementRect(issueCard, createRect(10, 10, 200, 60));

  const fetchSpy = vi.spyOn(global, 'fetch');
  fetchSpy.mockClear();

  dragIssueToColumn(issueCard, todoColumn);

  await waitFor(() => {
    const calls = fetchSpy.mock.calls.filter(([input]) =>
      typeof input === 'string' && input.includes('/api/issues/issue-1/transition')
    );
    expect(calls.length).toBeGreaterThan(0);
  });

  await waitFor(() => {
    expect(within(todoColumn).getByText('Define Kanban visual language')).toBeInTheDocument();
  });

  fetchSpy.mockRestore();

  server.use(
    http.post('/api/issues/:id/transition', async () =>
      HttpResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid stage transition' } },
        { status: 422 }
      )
    )
  );

  await act(async () => {
    await useIssuesStore.getState().transitionIssue('issue-1', 'BACKLOG');
  });

  await waitFor(() => {
    expect(screen.getByText('Invalid stage transition')).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(within(todoColumn).getByText('Define Kanban visual language')).toBeInTheDocument();
  });
});
