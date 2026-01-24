# Codex CLI Non-Interactive Invocation

## Overview

OpenAI Codex provides non-interactive execution via `codex exec` for CI/CD pipelines, scripting, and programmatic control. The Codex SDK offers deeper TypeScript integration for building custom applications.

## CLI Non-Interactive Mode

### Basic Invocation

```bash
# Run non-interactively
codex exec "your task prompt here"

# Short alias
codex e "your task prompt here"
```

### Key Flags

| Flag | Purpose |
|------|---------|
| `--json` | Output JSON Lines (JSONL) stream |
| `-o <path>` / `--output-last-message <path>` | Write final message to file |
| `--output-schema <path>` | Request structured response matching JSON Schema |
| `--full-auto` | Enable automatic edits |
| `--sandbox danger-full-access` | Grant broader access (use cautiously) |
| `--skip-git-repo-check` | Bypass Git repository requirement |

### Output Handling

Default behavior:
- Progress streams to stderr
- Final agent message goes to stdout
- Default: read-only sandbox mode

```bash
# Pipe final result to file
codex exec "generate release notes" | tee release-notes.md

# Parse with jq
codex exec --json "summarize the repo structure" | jq
```

### JSON Lines Output

When using `--json`, stdout becomes a JSONL stream with event types:

```typescript
interface CodexEvent {
  type: 'thread.started' | 'turn.started' | 'turn.completed' | 'turn.failed' |
        'item.started' | 'item.completed' | 'error';
  item?: {
    id: string;
    type: string;
    text?: string;
  };
}
```

Event types include:
- `thread.started`: Conversation thread started
- `turn.started`/`turn.completed`/`turn.failed`: Turn lifecycle
- `item.*`: Agent messages, reasoning, commands, file changes, MCP tool calls

Item types include:
- Agent messages
- Reasoning blocks
- Command executions
- File changes
- MCP tool calls
- Web searches
- Plan updates

### Structured Output

Use `--output-schema` for predictable downstream processing:

```bash
codex exec "extract metadata" \
  --output-schema ./schema.json \
  -o ./output.json
```

Example schema for release notes:
```json
{
  "type": "object",
  "properties": {
    "version": { "type": "string" },
    "changes": {
      "type": "array",
      "items": { "type": "string" }
    },
    "breaking": { "type": "boolean" }
  },
  "required": ["version", "changes"]
}
```

### Session Management

```bash
# Initial run
codex exec "review the change for race conditions"

# Resume last session
codex exec resume --last "fix the race conditions you found"

# Resume specific session
codex exec resume <SESSION_ID> "continue with additional fixes"
```

### Authentication

Default: Uses saved CLI authentication credentials.

For CI/CD:
```bash
# Set as environment variable
export CODEX_API_KEY=<your-key>
codex exec "your task"

# Or inline (only supported in codex exec)
CODEX_API_KEY=<key> codex exec "your task"
```

### Sandbox & Permissions

```bash
# Read-only (default)
codex exec "analyze this codebase"

# Auto-approve edits
codex exec --full-auto "fix the bug"

# Write access to workspace
codex exec --full-auto --sandbox workspace-write "refactor the module"

# Full access (dangerous)
codex exec --sandbox danger-full-access "run system commands"
```

## Codex SDK (TypeScript)

### Installation

```bash
npm install @openai/codex-sdk
```

### Basic Usage

```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();
const thread = codex.startThread();
const result = await thread.run("Your prompt here");
console.log(result);
```

### Thread Management

```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();

// Start new thread
const thread = codex.startThread();
const result1 = await thread.run("Analyze this codebase");

// Continue same thread
const result2 = await thread.run("Now focus on the auth module");

// Resume previous thread by ID
const thread2 = codex.resumeThread("<thread-id>");
const result3 = await thread2.run("Continue the analysis");
```

### Key Features

- Server-side control without CLI dependency
- Thread-based conversation persistence
- Asynchronous execution with await support
- Integration capability with existing applications
- Node.js 18+ required

## MCP Server Mode

Run Codex as an MCP server for agent orchestration:

```bash
# Run Codex as MCP server over stdio
codex mcp-server
```

Useful when another agent consumes Codex capabilities.

## CI/CD Integration

### GitHub Actions

```yaml
name: Codex CI
on: [push]

jobs:
  codex-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Codex CLI
        run: npm install -g @openai/codex-cli

      - name: Run Codex
        env:
          CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}
        run: |
          codex exec --full-auto --sandbox workspace-write \
            "Review this PR and fix any issues" \
            --output-schema ./review-schema.json \
            -o ./review-result.json
```

### GitLab CI

```yaml
codex-review:
  image: node:20
  script:
    - npm install -g @openai/codex-cli
    - codex exec --json "analyze code quality" > analysis.jsonl
  variables:
    CODEX_API_KEY: $CI_CODEX_API_KEY
```

### GitHub Action (Official)

Codex provides an official GitHub Action:

```yaml
- uses: openai/codex-action@v1
  with:
    prompt: "Fix CI failures and create a PR"
    api-key: ${{ secrets.CODEX_API_KEY }}
```

## Comparison: Codex vs Claude Code

| Feature | Codex CLI | Claude Code CLI |
|---------|-----------|-----------------|
| Non-interactive flag | `codex exec` | `claude -p` |
| Streaming format | JSONL via `--json` | JSONL via `--output-format stream-json` |
| Structured output | `--output-schema` | `--json-schema` |
| Session resume | `codex exec resume` | `--resume <session_id>` |
| Auto-approve edits | `--full-auto` | `--dangerously-skip-permissions` |
| SDK package | `@openai/codex-sdk` | `@anthropic-ai/claude-agent-sdk` |
| MCP support | Yes (as server) | Yes (as client & server) |

## Falcon-PM Integration Pattern

For multi-model orchestration, falcon-pm can invoke either Codex or Claude Code:

```typescript
import { Codex } from "@openai/codex-sdk";

async function runCodexAgent(
  issueId: string,
  stage: string,
  workingDir: string
): Promise<{ result: string; threadId: string }> {
  const codex = new Codex();
  const thread = codex.startThread();

  // Set working directory (if supported)
  process.chdir(workingDir);

  const result = await thread.run(
    `Execute ${stage} stage for issue ${issueId}. ` +
    `Follow the workflow defined in .falcon/CORE/TASKS/WORKFLOW/${stage.toUpperCase()}.md`
  );

  return {
    result: result.toString(),
    threadId: thread.id
  };
}
```

### Spawning via CLI

```typescript
import { spawn } from 'child_process';
import { createInterface } from 'readline';

interface CodexEvent {
  type: string;
  item?: { type: string; text?: string };
}

async function runCodexCli(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['exec', '--json', prompt], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CODEX_API_KEY: process.env.CODEX_API_KEY }
    });

    let result = '';

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        try {
          const event = JSON.parse(line) as CodexEvent;
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
            result = event.item.text ?? '';
          }
        } catch {}
      });
    }

    child.on('close', (code) => {
      if (code === 0) resolve(result);
      else reject(new Error(`Codex exited with code ${code}`));
    });
  });
}
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CODEX_API_KEY` | API key (only works with `codex exec`) |
| `OPENAI_API_KEY` | Alternative API key variable |

## Best Practices

1. **Narrow prompts**: Give specific, focused instructions
2. **Minimal permissions**: Start with read-only sandbox
3. **Structured output**: Use `--output-schema` for automation
4. **Session continuity**: Use resume for multi-step pipelines
5. **Error handling**: Parse JSONL for `turn.failed` events

## Sources

- [Codex Non-interactive mode](https://developers.openai.com/codex/noninteractive/)
- [Codex CLI](https://developers.openai.com/codex/cli/)
- [Codex SDK](https://developers.openai.com/codex/sdk/)
- [Codex CLI reference](https://developers.openai.com/codex/cli/reference/)
- [Codex GitHub Action](https://developers.openai.com/codex/github-action/)
