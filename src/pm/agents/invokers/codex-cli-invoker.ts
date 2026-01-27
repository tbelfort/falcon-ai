import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import type { AgentInvoker } from './agent-invoker.js';
import type { OutputBus } from '../output/output-bus.js';
import { scrubCredentials } from './credential-scrubber.js';

interface CodexEvent {
  item?: { text?: string };
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

function killProcessWithTimeout(child: ChildProcess, rl?: Interface): void {
  if (rl) {
    rl.close();
  }
  if (!child.killed) {
    child.kill('SIGTERM');
    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }, 5000);
  }
}

function runCodexJsonl(
  prompt: string,
  onText: (text: string) => void
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn('codex', ['exec', '--json', prompt], {
      // Ignore stderr to prevent buffer deadlock
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    let rl: Interface | undefined;
    let timeoutId: NodeJS.Timeout | undefined;
    let resolved = false;

    const cleanup = (success: boolean, error?: string) => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (rl) rl.close();
      resolve({ success, error });
    };

    // Set process timeout
    timeoutId = setTimeout(() => {
      killProcessWithTimeout(child, rl);
      cleanup(false, 'Process timed out');
    }, PROCESS_TIMEOUT_MS);

    rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      try {
        const event = JSON.parse(trimmed) as CodexEvent;
        if (event.item?.text) {
          onText(scrubCredentials(event.item.text));
        }
      } catch {
        return;
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

function runCodexOnce(prompt: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn('codex', ['exec', prompt], {
      // Ignore stdout and stderr - we don't need output in non-debug mode
      stdio: ['ignore', 'ignore', 'ignore'],
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
    // Validate prompt size before spawning
    validatePromptSize(args.prompt);

    // Acquire process slot (concurrency control)
    await acquireProcessSlot();

    try {
      const runId = randomUUID();

      if (!args.debug) {
        const result = await runCodexOnce(args.prompt);
        if (!result.success) {
          throw new Error(`Codex invocation failed: ${result.error ?? 'unknown error'}`);
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

      const result = await runCodexJsonl(args.prompt, (text) => publisher.push(text));
      publisher.flush();

      if (!result.success) {
        throw new Error(`Codex invocation failed: ${result.error ?? 'unknown error'}`);
      }

      return { runId };
    } finally {
      releaseProcessSlot();
    }
  }
}
