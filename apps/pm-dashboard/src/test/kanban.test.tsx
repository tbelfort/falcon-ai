import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { mockControl, mockIds } from '../mocks/data';

async function moveIssueToImplement(issueId: string) {
  const select = await screen.findByTestId(`issue-move-${issueId}`);
  fireEvent.change(select, { target: { value: 'IMPLEMENT' } });
  const implementColumn = await screen.findByTestId('column-IMPLEMENT');
  return { implementColumn };
}

test('renders kanban columns and issue cards', async () => {
  render(<App />);

  expect(await screen.findByText('Backlog')).toBeInTheDocument();
  expect(await screen.findByText('Todo')).toBeInTheDocument();
  expect(await screen.findByText('Clarify onboarding checklist')).toBeInTheDocument();
});

test('opens issue modal and loads comments', async () => {
  render(<App />);

  const issueTitle = await screen.findByText('Stabilize WS subscriptions');
  fireEvent.click(issueTitle);

  expect(await screen.findByTestId('issue-modal')).toBeInTheDocument();
  expect(
    await screen.findByText('Handshake retries look good, but we need to resend subscriptions.')
  ).toBeInTheDocument();
});

test('dragging an issue updates stage optimistically', async () => {
  render(<App />);

  const { implementColumn } = await moveIssueToImplement(mockIds.todoIssueId);

  await waitFor(() => {
    expect(
      within(implementColumn).getByText('Stabilize WS subscriptions')
    ).toBeInTheDocument();
  });
});

test('failed drag reverts and shows error banner', async () => {
  mockControl.transitionErrors.add(mockIds.todoIssueId);
  render(<App />);

  const { implementColumn } = await moveIssueToImplement(mockIds.todoIssueId);

  await waitFor(() => {
    expect(screen.getByText('Transition blocked by policy')).toBeInTheDocument();
  });

  await waitFor(() => {
    expect(
      within(implementColumn).queryByText('Stabilize WS subscriptions')
    ).not.toBeInTheDocument();
  });

  const todoColumn = screen.getByTestId('column-TODO');
  expect(within(todoColumn).getByText('Stabilize WS subscriptions')).toBeInTheDocument();
});
