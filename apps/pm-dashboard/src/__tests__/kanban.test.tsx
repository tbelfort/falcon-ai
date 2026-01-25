import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import App from '../App';
import { server } from '../mocks/server';
import { resetDb } from '../mocks/data';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  resetDb();
});

afterAll(() => {
  server.close();
});

function mockRect(element: HTMLElement, rect: Partial<DOMRect>) {
  const left = rect.left ?? 0;
  const top = rect.top ?? 0;
  const width = rect.width ?? 0;
  const height = rect.height ?? 0;

  element.getBoundingClientRect = () => ({
    width,
    height,
    top,
    left,
    right: rect.right ?? left + width,
    bottom: rect.bottom ?? top + height,
    x: left,
    y: top,
    toJSON: () => ''
  });
}

async function prepareDrag(sourceId: string, targetStage: string) {
  const card = await screen.findByTestId(sourceId, {}, { timeout: 3000 });
  const sourceColumn = card.closest('[data-testid^="stage-column"]');
  const targetColumn = await screen.findByTestId(`stage-column-${targetStage}`, {}, { timeout: 3000 });
  const columns = await screen.findAllByTestId(/stage-column-/);

  if (!sourceColumn) {
    throw new Error('Source column not found');
  }

  columns.forEach((column, index) => {
    mockRect(column as HTMLElement, { left: index * 320, top: 0, width: 280, height: 600 });
  });

  const sourceIndex = columns.findIndex((column) => column === sourceColumn);
  mockRect(card as HTMLElement, {
    left: sourceIndex * 320 + 20,
    top: 30,
    width: 240,
    height: 80
  });

  return { card: card as HTMLElement, targetColumn: targetColumn as HTMLElement };
}

function dragToTarget(card: HTMLElement, target: HTMLElement) {
  const originalElementFromPoint = document.elementFromPoint;
  document.elementFromPoint = () => target;

  const targetRect = target.getBoundingClientRect();
  const targetX = targetRect.left + 40;
  const targetY = targetRect.top + 40;

  fireEvent.mouseDown(card, { clientX: 30, clientY: 40, button: 0 });
  fireEvent.mouseMove(document.body, { clientX: 120, clientY: 50 });
  fireEvent.mouseMove(target, { clientX: targetX, clientY: targetY });
  fireEvent.mouseUp(document.body, { clientX: targetX, clientY: targetY });

  document.elementFromPoint = originalElementFromPoint;
}

test('renders columns and issue cards from mocked API', async () => {
  render(<App />);

  expect(await screen.findByTestId('stage-column-BACKLOG')).toBeInTheDocument();
  expect(await screen.findByTestId('issue-card-issue-102')).toBeInTheDocument();
});

test('opens issue modal and loads comments', async () => {
  render(<App />);

  const card = await screen.findByTestId('issue-card-issue-105', {}, { timeout: 3000 });
  fireEvent.click(card);

  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(
    await screen.findByText('We should show a warning when the server rejects a stage move.')
  ).toBeInTheDocument();
});

test('dragging an issue between columns updates the stage', async () => {
  render(<App />);

  const { card, targetColumn } = await prepareDrag('issue-card-issue-102', 'IMPLEMENT');

  dragToTarget(card, targetColumn);

  await waitFor(() => {
    expect(within(targetColumn).getByTestId('issue-card-issue-102')).toBeInTheDocument();
  });
});

test('reverts optimistic move on transition error and shows banner', async () => {
  server.use(
    http.post('/api/issues/:id/transition', () => {
      return HttpResponse.json(
        { error: { code: 'invalid_transition', message: 'Transition blocked' } },
        { status: 400 }
      );
    })
  );

  render(<App />);

  const { card, targetColumn } = await prepareDrag('issue-card-issue-106', 'DONE');

  dragToTarget(card, targetColumn);

  expect(await screen.findByText('Transition blocked', {}, { timeout: 3000 })).toBeInTheDocument();

  const todoColumn = await screen.findByTestId('stage-column-TESTING');
  await waitFor(() => {
    expect(within(todoColumn).getByTestId('issue-card-issue-106')).toBeInTheDocument();
  });
});
