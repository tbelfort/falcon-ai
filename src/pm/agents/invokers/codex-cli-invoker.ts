import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { AgentInvoker } from './agent-invoker.js';
import type { OutputBus } from '../output/output-bus.js';

interface CodexEvent {
  item?: { text?: string };
}

function runCodexJsonl(prompt: string, onText: (text: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('codex', ['exec', '--json', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      try {
        const event = JSON.parse(trimmed) as CodexEvent;
        if (event.item?.text) {
          onText(event.item.text);
        }
      } catch {
        return;
      }
    });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

function runCodexOnce(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('codex', ['exec', prompt], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

function createLineBuffer(onLine: (line: string) => void) {
  let buffer = '';

  return {
    push(text: string) {
      buffer += text;
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        onLine(part);
      }
    },
    flush() {
      if (buffer.length > 0) {
        onLine(buffer);
        buffer = '';
      }
    },
  };
}

export class CodexCliInvoker implements AgentInvoker {
  constructor(private readonly outputBus: OutputBus) {}

  async invokeStage(args: {
    agentId: string;
    issueId: string;
    stage: string;
    prompt: string;
    toolBaseUrl: string;
    debug: boolean;
  }): Promise<{ runId: string }> {
    const runId = randomUUID();
    if (!args.debug) {
      await runCodexOnce(args.prompt);
      return { runId };
    }

    const publisher = createLineBuffer((line) => {
      this.outputBus.publish({
        runId,
        agentId: args.agentId,
        issueId: args.issueId,
        line,
      });
    });

    await runCodexJsonl(args.prompt, (text) => publisher.push(text));
    publisher.flush();
    return { runId };
  }
}
