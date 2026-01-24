# Claude Code Non-Interactive Invocation

## Overview

Claude Code can be invoked non-interactively via CLI or programmatically via the Claude Agent SDK. This document covers both approaches for orchestrating Claude Code agents from falcon-pm.

## CLI Non-Interactive Mode

### Basic Invocation

```bash
# Single prompt, non-interactive
claude -p "Find and fix the bug in auth.py" --allowedTools "Read,Edit,Bash"
```

### Key Flags

| Flag | Purpose |
|------|---------|
| `-p` / `--print` | Non-interactive print mode (required) |
| `--output-format` | Output format: `text`, `json`, `stream-json` |
| `--allowedTools` | Auto-approve specific tools without prompting |
| `--append-system-prompt` | Add instructions to default system prompt |
| `--system-prompt` | Replace default system prompt entirely |
| `--continue` | Continue most recent conversation |
| `--resume <session_id>` | Resume specific session |
| `--json-schema` | Request structured output conforming to schema |
| `--verbose` | Include additional output |
| `--dangerously-skip-permissions` | Skip all permission prompts (use cautiously) |

### Output Formats

#### Text (default)
```bash
claude -p "Summarize this project"
# Returns plain text response
```

#### JSON
```bash
claude -p "Summarize this project" --output-format json
# Returns: { "result": "...", "session_id": "...", "usage": {...} }
```

#### Stream-JSON (for real-time streaming)
```bash
claude -p "Summarize this project" --output-format stream-json
# Returns newline-delimited JSON events
```

### Stream-JSON Event Types

```typescript
interface ClaudeStreamEvent {
  type: 'content_block_delta' | 'assistant' | 'result';
  delta?: { text?: string };
  message?: { content: Array<{ type: string; text?: string }> };
  result?: string;
}
```

- `content_block_delta`: Real-time text chunks as Claude generates
- `assistant`: Full assistant message at the end
- `result`: Final result string

### Structured Output

```bash
claude -p "Extract function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}'
```

Response includes `structured_output` field matching the schema.

### Session Management

```bash
# First request
claude -p "Review this codebase for performance issues" --output-format json

# Continue most recent conversation
claude -p "Now focus on database queries" --continue

# Resume specific session
session_id=$(claude -p "Start review" --output-format json | jq -r '.session_id')
claude -p "Continue review" --resume "$session_id"
```

### Tool Permissions

Permission rule syntax for `--allowedTools`:
- `Bash`: Allow all bash commands
- `Bash(git diff:*)`: Allow commands starting with `git diff`
- `Read,Edit,Bash`: Multiple tools comma-separated

```bash
claude -p "Create a commit for staged changes" \
  --allowedTools "Bash(git diff:*),Bash(git log:*),Bash(git status:*),Bash(git commit:*)"
```

## Claude Agent SDK (Programmatic)

### Installation

```bash
npm install @anthropic-ai/claude-agent-sdk
```

### TypeScript API

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Basic streaming usage
for await (const message of query({
  prompt: "Find and fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  if ("result" in message) console.log(message.result);
}
```

### Python API

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    async for message in query(
        prompt="Find and fix the bug in auth.py",
        options=ClaudeAgentOptions(allowed_tools=["Read", "Edit", "Bash"])
    ):
        if hasattr(message, "result"):
            print(message.result)

asyncio.run(main())
```

### Options Interface

```typescript
interface Options {
  // Core
  prompt: string;
  cwd?: string;                        // Working directory
  model?: string;                      // Model to use

  // Tools & Permissions
  allowedTools?: string[];             // Auto-approved tools
  disallowedTools?: string[];          // Blocked tools
  permissionMode?: PermissionMode;     // 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan'
  allowDangerouslySkipPermissions?: boolean;
  canUseTool?: CanUseTool;             // Custom permission callback

  // Session
  continue?: boolean;                  // Continue most recent
  resume?: string;                     // Resume specific session ID
  forkSession?: boolean;               // Fork instead of continue

  // Output
  outputFormat?: { type: 'json_schema', schema: JSONSchema };  // Structured output
  includePartialMessages?: boolean;    // Include streaming events

  // System Prompt
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };

  // Hooks
  hooks?: Partial<Record<HookEvent, HookCallbackMatcher[]>>;

  // Subagents
  agents?: Record<string, AgentDefinition>;

  // MCP Servers
  mcpServers?: Record<string, McpServerConfig>;

  // Settings Sources
  settingSources?: ('user' | 'project' | 'local')[];

  // Budget & Limits
  maxTurns?: number;
  maxBudgetUsd?: number;
  maxThinkingTokens?: number;

  // Abort
  abortController?: AbortController;
}
```

### Message Types

```typescript
type SDKMessage =
  | SDKAssistantMessage    // Claude's response
  | SDKUserMessage         // User input
  | SDKResultMessage       // Final result with usage stats
  | SDKSystemMessage       // Init message with session info
  | SDKPartialAssistantMessage;  // Streaming partial (if includePartialMessages)

interface SDKResultMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd';
  session_id: string;
  result: string;
  duration_ms: number;
  total_cost_usd: number;
  usage: { input_tokens: number; output_tokens: number };
  structured_output?: unknown;
}

interface SDKSystemMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
  tools: string[];
  model: string;
  permissionMode: PermissionMode;
}
```

### Hooks

Available hook events:
- `PreToolUse`: Before tool execution (can modify/block)
- `PostToolUse`: After tool execution
- `PostToolUseFailure`: After tool failure
- `SessionStart`: When session begins
- `SessionEnd`: When session ends
- `Stop`: When agent stops
- `SubagentStart`/`SubagentStop`: Subagent lifecycle
- `PermissionRequest`: When permission needed

```typescript
const hooks = {
  PostToolUse: [{
    matcher: "Edit|Write",
    hooks: [async (input, toolUseId, { signal }) => {
      console.log(`File modified: ${input.tool_input?.file_path}`);
      return {};
    }]
  }]
};
```

### Subagents

```typescript
const options = {
  allowedTools: ["Read", "Glob", "Grep", "Task"],
  agents: {
    "code-reviewer": {
      description: "Expert code reviewer for quality and security reviews.",
      prompt: "Analyze code quality and suggest improvements.",
      tools: ["Read", "Glob", "Grep"],
      model: "sonnet"  // Optional model override
    }
  }
};
```

### Query Methods

```typescript
interface Query extends AsyncGenerator<SDKMessage, void> {
  interrupt(): Promise<void>;
  rewindFiles(userMessageUuid: string): Promise<void>;
  setPermissionMode(mode: PermissionMode): Promise<void>;
  setModel(model?: string): Promise<void>;
  supportedModels(): Promise<ModelInfo[]>;
  accountInfo(): Promise<AccountInfo>;
}
```

## Spawning from Node.js

### Stream-JSON Approach (Recommended)

```typescript
import { spawn } from 'child_process';
import { createInterface } from 'readline';

interface ClaudeStreamEvent {
  type?: string;
  delta?: { text?: string };
  message?: { content?: Array<{ type?: string; text?: string }> };
  result?: string;
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

    child.stdin?.write(prompt);
    child.stdin?.end();

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
      rl.on('line', (line) => {
        const event = JSON.parse(line.trim()) as ClaudeStreamEvent;
        if (event.type === 'content_block_delta') {
          process.stdout.write(event.delta?.text ?? '');
        }
      });
    }

    child.on('close', resolve);
  });
}
```

### Why This Works

Using `--output-format stream-json` avoids TTY detection issues:
- Claude detects non-TTY and buffers output differently with `stdio: 'inherit'`
- `stream-json` provides reliable real-time streaming via JSON events
- Works consistently across all environments

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | API key for authentication |
| `CLAUDE_CODE_USE_BEDROCK=1` | Use Amazon Bedrock |
| `CLAUDE_CODE_USE_VERTEX=1` | Use Google Vertex AI |
| `CLAUDE_CODE_USE_FOUNDRY=1` | Use Microsoft Foundry |

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run Claude Code
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    claude -p "Run tests and fix failures" \
      --allowedTools "Bash,Read,Edit" \
      --output-format json
```

### GitLab CI

```yaml
claude-review:
  script:
    - claude -p "Review changes for security issues" --output-format json
  variables:
    ANTHROPIC_API_KEY: $CI_ANTHROPIC_API_KEY
```

## Falcon-PM Integration Pattern

For orchestrating agents in falcon-pm:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

async function runAgentForStage(
  issueId: string,
  stage: string,
  workingDir: string,
  systemPromptAddition: string
): Promise<{
  result: string;
  sessionId: string;
  cost: number;
}> {
  let sessionId: string | undefined;
  let result = '';
  let cost = 0;

  for await (const message of query({
    prompt: `Execute ${stage} stage for issue ${issueId}`,
    options: {
      cwd: workingDir,
      allowedTools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep"],
      permissionMode: "acceptEdits",
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: systemPromptAddition
      },
      hooks: {
        PostToolUse: [{
          matcher: "Edit|Write",
          hooks: [async (input) => {
            // Log file changes to API
            await logFileChange(issueId, input.tool_input?.file_path);
            return {};
          }]
        }]
      }
    }
  })) {
    if (message.type === 'system' && message.subtype === 'init') {
      sessionId = message.session_id;
    }
    if (message.type === 'result' && message.subtype === 'success') {
      result = message.result;
      cost = message.total_cost_usd;
    }
  }

  return { result, sessionId: sessionId!, cost };
}
```

## Sources

- [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)
- [Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK TypeScript reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Agent SDK Python reference](https://platform.claude.com/docs/en/agent-sdk/python)
- [GitHub: claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript)
