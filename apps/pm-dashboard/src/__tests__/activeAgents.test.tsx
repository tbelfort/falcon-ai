import { act, fireEvent, render, screen } from '@testing-library/react';
import { ActiveAgents } from '@/pages/ActiveAgents';
import { FakeWebSocketTransport } from '@/hooks/useWebSocket';

describe('ActiveAgents', () => {
  it('renders active agents and streams debug output', async () => {
    const transport = new FakeWebSocketTransport();
    render(<ActiveAgents transport={transport} />);

    const agentCard = await screen.findByTestId('active-agent-A-04');
    fireEvent.click(agentCard);

    act(() => {
      transport.publish({
        type: 'event',
        channel: 'run:issue-105',
        event: 'agent.output',
        data: {
          runId: 'issue-105',
          agentId: 'A-04',
          issueId: 'issue-105',
          at: Date.now(),
          line: 'Starting orchestration for issue-105',
        },
      });
    });

    expect(await screen.findByText('Starting orchestration for issue-105')).toBeInTheDocument();
  });
});
