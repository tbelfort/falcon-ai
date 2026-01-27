import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { AgentInvoker } from './agent-invoker.js';
import type { OutputBus } from '../output/output-bus.js';

interface ClaudeStreamEvent {
  type?: 'content_block_delta' | 'assistant' | 'result' | string;
  delta?: { text?: string };
  message?: { content?: Array<{ type?: string; text?: string }> };
  result?: string;
}

function runClaudeStreamJson(prompt: string, onText: (text: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(
      'claude',
      [
        '--print',
        '--verbose',
        '--dangerously-skip-permissions',
        '--output-format',
        'stream-json',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, TERM: 'xterm-256color' } }
    );

    child.stdin?.write(prompt);
    child.stdin?.end();

    let sawDelta = false;
    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      let event: ClaudeStreamEvent;
      try {
        event = JSON.parse(trimmed) as ClaudeStreamEvent;
      } catch {
        return;
      }

      if (event.type === 'content_block_delta') {
        sawDelta = true;
        if (event.delta?.text) {
          onText(event.delta.text);
        }
        return;
      }

      if (event.type === 'assistant' && !sawDelta) {
        for (const block of event.message?.content ?? []) {
          if (block.type === 'text' && block.text) {
            onText(block.text);
          }
        }
      }

      if (event.type === 'result' && !sawDelta && event.result) {
        onText(event.result);
      }
    });

    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}

function runClaudeOnce(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('claude', ['-p', prompt], {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, TERM: 'xterm-256color' },
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

export class ClaudeCodeInvoker implements AgentInvoker {
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
      await runClaudeOnce(args.prompt);
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

    await runClaudeStreamJson(args.prompt, (text) => publisher.push(text));
    publisher.flush();
    return { runId };
  }
}
