import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import type { AgentInvoker } from './agent-invoker.js';
import type { OutputBus } from '../output/output-bus.js';
import { scrubCredentials } from './credential-scrubber.js';

interface ClaudeStreamEvent {
  type?: 'content_block_delta' | 'assistant' | 'result' | string;
  delta?: { text?: string };
  message?: { content?: Array<{ type?: string; text?: string }> };
  result?: string;
}

/** Maximum prompt size in bytes (50KB) */
const MAX_PROMPT_BYTES = 50 * 1024;

/** Process timeout in milliseconds (5 minutes) */
const PROCESS_TIMEOUT_MS = 5 * 60 * 1000;

/** Maximum concurrent agent processes */
const MAX_CONCURRENT_PROCESSES = 5;

/** Semaphore for concurrency control */
let activeProcesses = 0;
const waitingQueue: Array<() => void> = [];

async function acquireProcessSlot(): Promise<void> {
  if (activeProcesses < MAX_CONCURRENT_PROCESSES) {
    activeProcesses++;
    return;
  }

  return new Promise((resolve) => {
    waitingQueue.push(() => {
      activeProcesses++;
      resolve();
    });
  });
}

function releaseProcessSlot(): void {
  activeProcesses--;
  const next = waitingQueue.shift();
  if (next) {
    next();
  }
}

function validatePromptSize(prompt: string): void {
  const byteLength = Buffer.byteLength(prompt, 'utf-8');
  if (byteLength > MAX_PROMPT_BYTES) {
    throw new Error(`Prompt size (${byteLength} bytes) exceeds maximum (${MAX_PROMPT_BYTES} bytes)`);
  }
}

function killProcessWithTimeout(child: ChildProcess, rl?: Interface): NodeJS.Timeout | undefined {
  if (rl) {
    rl.close();
  }
  if (!child.killed) {
    child.kill('SIGTERM');
    // Force kill after 5 seconds if still running
    return setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }, 5000);
  }
  return undefined;
}

/**
 * Claude CLI stream-json parsing strategy:
 * 1. Prefer content_block_delta events (standard streaming)
 * 2. Fall back to assistant message content if no deltas received
 * 3. Fall back to result field if neither above works
 *
 * This handles different Claude CLI versions and modes.
 */
function runClaudeStreamJson(
  prompt: string,
  onText: (text: string) => void
): Promise<{ success: boolean; error?: string }> {
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
      {
        // Ignore stderr to prevent buffer deadlock
        stdio: ['pipe', 'pipe', 'ignore'],
        env: { ...process.env, TERM: 'xterm-256color' },
      }
    );

    let rl: Interface | undefined;
    let timeoutId: NodeJS.Timeout | undefined;
    let killTimerId: NodeJS.Timeout | undefined;
    let resolved = false;

    const cleanup = (success: boolean, error?: string) => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (killTimerId) clearTimeout(killTimerId);
      if (rl) rl.close();
      resolve({ success, error });
    };

    // Set process timeout
    timeoutId = setTimeout(() => {
      killTimerId = killProcessWithTimeout(child, rl);
      cleanup(false, 'Process timed out');
    }, PROCESS_TIMEOUT_MS);

    child.stdin?.write(prompt);
    child.stdin?.end();

    let sawDelta = false;
    rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });

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
          onText(scrubCredentials(event.delta.text));
        }
        return;
      }

      if (event.type === 'assistant' && !sawDelta) {
        for (const block of event.message?.content ?? []) {
          if (block.type === 'text' && block.text) {
            onText(scrubCredentials(block.text));
          }
        }
      }

      if (event.type === 'result' && !sawDelta && event.result) {
        onText(scrubCredentials(event.result));
      }
    });

    child.on('close', (code) => {
      cleanup(code === 0, code !== 0 ? `Process exited with code ${code}` : undefined);
    });

    child.on('error', (err) => {
      cleanup(false, err.message);
    });
  });
}

function runClaudeOnce(prompt: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn('claude', ['-p', prompt], {
      // Ignore stdout and stderr - we don't need output in non-debug mode
      stdio: ['ignore', 'ignore', 'ignore'],
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    let timeoutId: NodeJS.Timeout | undefined;
    let resolved = false;

    const cleanup = (success: boolean, error?: string) => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ success, error });
    };

    // Set process timeout
    timeoutId = setTimeout(() => {
      killProcessWithTimeout(child);
      cleanup(false, 'Process timed out');
    }, PROCESS_TIMEOUT_MS);

    child.on('close', (code) => {
      cleanup(code === 0, code !== 0 ? `Process exited with code ${code}` : undefined);
    });

    child.on('error', (err) => {
      cleanup(false, err.message);
    });
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
    // Validate prompt size before spawning
    validatePromptSize(args.prompt);

    // Acquire process slot (concurrency control)
    await acquireProcessSlot();

    try {
      const runId = randomUUID();

      if (!args.debug) {
        const result = await runClaudeOnce(args.prompt);
        if (!result.success) {
          throw new Error(`Claude invocation failed: ${result.error ?? 'unknown error'}`);
        }
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

      const result = await runClaudeStreamJson(args.prompt, (text) => publisher.push(text));
      publisher.flush();

      if (!result.success) {
        throw new Error(`Claude invocation failed: ${result.error ?? 'unknown error'}`);
      }

      return { runId };
    } finally {
      releaseProcessSlot();
    }
  }
}
