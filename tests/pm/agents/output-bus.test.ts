import { describe, expect, it } from 'vitest';
import { OutputBus } from '../../../src/pm/agents/output/output-bus.js';

describe('pm output bus', () => {
  it('publishes to subscribers', () => {
    const bus = new OutputBus();
    const received: string[] = [];

    bus.subscribe('run-1', (line) => {
      received.push(line.line);
    });

    bus.publish({ runId: 'run-1', agentId: 'agent-1', issueId: 'issue-1', line: 'hello' });
    bus.publish({ runId: 'run-1', agentId: 'agent-1', issueId: 'issue-1', line: 'world' });

    expect(received).toEqual(['hello', 'world']);
  });

  it('unsubscribes listeners', () => {
    const bus = new OutputBus();
    const received: string[] = [];

    const unsubscribe = bus.subscribe('run-2', (line) => {
      received.push(line.line);
    });

    bus.publish({ runId: 'run-2', agentId: 'agent-1', issueId: 'issue-1', line: 'first' });
    unsubscribe();
    bus.publish({ runId: 'run-2', agentId: 'agent-1', issueId: 'issue-1', line: 'second' });

    expect(received).toEqual(['first']);
  });
});
