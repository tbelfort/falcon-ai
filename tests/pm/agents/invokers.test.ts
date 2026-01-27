import { describe, expect, it } from 'vitest';
import { FakeAgentInvoker } from '../../../src/pm/agents/invokers/fake-agent-invoker.js';
import { OutputBus } from '../../../src/pm/agents/output/output-bus.js';

describe('pm agent invokers', () => {
  it('fake invoker emits output and returns run id', async () => {
    const bus = new OutputBus();
    const invoker = new FakeAgentInvoker({ outputBus: bus, runId: 'run-123' });
    const received: string[] = [];

    bus.subscribe('run-123', (line) => received.push(line.line));

    const result = await invoker.invokeStage({
      agentId: 'agent-1',
      issueId: 'issue-1',
      stage: 'SPEC',
      prompt: 'Write spec',
      toolBaseUrl: 'http://localhost:3002/api/agent',
      debug: true,
    });

    expect(result.runId).toBe('run-123');
    expect(received).toEqual(['start:SPEC', 'Write spec', 'done:SPEC']);
    expect(invoker.lastArgs?.toolBaseUrl).toBe('http://localhost:3002/api/agent');
  });

  it('validates tool base url', async () => {
    const bus = new OutputBus();
    const invoker = new FakeAgentInvoker({ outputBus: bus });

    await expect(
      invoker.invokeStage({
        agentId: 'agent-1',
        issueId: 'issue-1',
        stage: 'SPEC',
        prompt: 'Write spec',
        toolBaseUrl: 'http://localhost:3002/api',
        debug: false,
      })
    ).rejects.toThrow('toolBaseUrl');
  });
});
