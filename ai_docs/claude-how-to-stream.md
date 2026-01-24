# How to Stream Claude Code Output from Node.js

## Problem

Running `claude -p "prompt"` from Node.js with `spawn` or `exec` and `stdio: 'inherit'` does not show output in the user's terminal, even though Claude is executing (e.g., Linear status changes). This happens because Claude Code detects it's not running in a real TTY and buffers output differently.

## Solution

Use `--output-format stream-json` to get structured JSON events, then parse and print them in real-time.

### Working Implementation

```typescript
import { spawn } from 'child_process';
import { createInterface } from 'readline';

interface ClaudeStreamEvent {
  type?: string;
  delta?: { text?: string };
  message?: { content?: Array<{ type?: string; text?: string }> };
  result?: string;
}

interface ClaudeStreamState {
  parseErrors: number;
  sawDelta: boolean;
}

async function runClaudeCode(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('claude', [
      '--print',
      '--verbose',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json'
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    // Send prompt via stdin
    child.stdin?.write(prompt);
    child.stdin?.end();

    const streamState: ClaudeStreamState = { parseErrors: 0, sawDelta: false };

    // Parse JSON stream line by line
    if (child.stdout) {
      const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
      rl.on('line', (line) => {
        const text = extractClaudeText(line, streamState);
        if (text) {
          process.stdout.write(text);
        }
      });
    }

    // Forward stderr
    if (child.stderr) {
      child.stderr.on('data', (data) => {
        process.stderr.write(data);
      });
    }

    child.on('close', (code) => {
      console.log(code === 0 ? '\nComplete' : `\nExited with code ${code}`);
      resolve();
    });

    child.on('error', (err) => {
      console.error(`Failed to start Claude Code: ${err.message}`);
      resolve();
    });
  });
}

function extractClaudeText(line: string, state: ClaudeStreamState): string {
  const trimmed = line.trim();
  if (!trimmed) return '';

  let event: ClaudeStreamEvent;
  try {
    event = JSON.parse(trimmed) as ClaudeStreamEvent;
  } catch {
    state.parseErrors += 1;
    if (state.parseErrors <= 3) {
      process.stderr.write(`Warning: JSON parse error on line: ${trimmed.slice(0, 100)}...\n`);
    }
    return '';
  }

  // Streaming text deltas (real-time chunks)
  if (event.type === 'content_block_delta') {
    state.sawDelta = true;
    return event.delta?.text ?? '';
  }

  // Full assistant message (fallback if no deltas seen)
  if (event.type === 'assistant') {
    if (state.sawDelta) return ''; // Already printed via deltas
    let text = '';
    for (const block of event.message?.content ?? []) {
      if (block.type === 'text' && block.text) {
        text += block.text;
      }
    }
    return text;
  }

  // Final result (fallback)
  if (event.type === 'result') {
    if (state.sawDelta) return '';
    return event.result ?? '';
  }

  return '';
}
```

## Key Flags

| Flag | Purpose |
|------|---------|
| `--print` | Non-interactive print mode |
| `--verbose` | Include additional output |
| `--dangerously-skip-permissions` | Skip permission prompts (use with caution) |
| `--output-format stream-json` | Output structured JSON events for parsing |

## JSON Event Types

The stream-json format outputs newline-delimited JSON events:

### `content_block_delta`
Real-time text chunks as Claude generates them:
```json
{"type": "content_block_delta", "delta": {"text": "Hello"}}
```

### `assistant`
Full assistant message (sent at the end):
```json
{"type": "assistant", "message": {"content": [{"type": "text", "text": "Full response here"}]}}
```

### `result`
Final result string:
```json
{"type": "result", "result": "Final output"}
```

## Why Other Approaches Failed

| Approach | Why It Failed |
|----------|---------------|
| `stdio: 'inherit'` | Claude detects non-TTY and buffers differently |
| `shell: true` | Deprecation warning, doesn't pick up aliases |
| Piping stdout manually | Same TTY detection issue |
| `execSync` with capture | Buffers until completion (no streaming) |
| `script` command for PTY | Complex, platform-specific |

## The Insight

Instead of fighting TTY detection, use Claude's structured JSON output format. This:
1. Gives you real-time streaming via `content_block_delta` events
2. Works reliably across all environments
3. Provides structured data (event types, tool calls, etc.)
4. Avoids platform-specific PTY workarounds

## Reference Implementation

See `/src/cli/commands/checkout.ts` in falcon-ai for the full working implementation.
