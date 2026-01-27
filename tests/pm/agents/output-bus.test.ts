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

  it('continues publishing to other listeners when one throws', () => {
    const bus = new OutputBus();
    const received: string[] = [];

    // First listener throws
    bus.subscribe('run-3', () => {
      throw new Error('Listener failure');
    });

    // Second listener should still receive messages
    bus.subscribe('run-3', (line) => {
      received.push(line.line);
    });

    // This should not throw despite the first listener failing
    bus.publish({ runId: 'run-3', agentId: 'agent-1', issueId: 'issue-1', line: 'hello' });

    expect(received).toEqual(['hello']);
  });

  it('cleans up listener set when last subscriber unsubscribes', () => {
    const bus = new OutputBus();

    const unsub1 = bus.subscribe('run-4', () => {});
    const unsub2 = bus.subscribe('run-4', () => {});

    unsub1();
    unsub2();

    // After all unsubscribes, publishing should be a no-op (no crash)
    bus.publish({ runId: 'run-4', agentId: 'agent-1', issueId: 'issue-1', line: 'test' });
  });
});
