# Falcon Sprint 2 - Phase 4: Agent Communication (Agent API + Invocation + Streaming)

**Status**: Draft
**Depends On**: Phase 1 (API surface), Phase 3 (agent workspaces). Must be testable with fakes (no real Claude/Codex required).
**Outputs Required By**: Phase 5, Phase 6, Phase 7
**Self-Contained**: Yes (this spec includes a context pack; no other docs are required)
**Reference Only (Optional)**: `docs/design/api.md`, `docs/design/integrations.md`, `docs/design/agent-lifecycle.md`, `ai_docs/claude-code-noninteractive.md`, `ai_docs/codex-cli-noninteractive.md`, `ai_docs/websocket-realtime-patterns.md`

---

## Handoff Prompt (Paste Into Fresh Model)

```text
You are implementing Falcon PM Sprint 2 Phase 4 (Agent Communication) in the `falcon-ai` repo. Use ONLY `specs/falcon-sprint-2-phase-4.md` as the source of truth (its Context Pack contains the authoritative agent API contract, WS contract, and the relevant Claude/Codex non-interactive streaming excerpts). Implement the agent-facing routes, invoker interfaces/implementations, and debug output streaming, but do not shell out to real `claude`/`codex` in tests; use fakes and ensure `npm test` passes.
```

## Context Pack (Read This, Then Implement)

### Repo Reality

- Node: `>= 20`, ESM, TS NodeNext
- Use `.js` in TS imports for local modules
- Tests must not shell out to real `claude` or `codex` binaries

### Agent-Facing API (Authoritative v1)

All endpoints are under `/api/agent` and require header:
- `X-Agent-ID: <agent-id>`

Response envelope is the same as the main API:
- success: `{ "data": ... }`
- error: `{ "error": { "code": "...", "message": "...", "details"?: ... } }`

Endpoints:

1. `GET /api/agent/issues/:id/context`
   - returns: issue + project + documents + stageMessages + workflow info

2. `GET /api/agent/issues/:id/messages?forStage=<IssueStage>`
   - returns: unread stage messages for that stage

3. `POST /api/agent/issues/:id/comment`
   - body: `{ "content": "..." }`

4. `POST /api/agent/issues/:id/stage-message`
   - body: `{ "toStage": "PR_REVIEW", "message": "...", "priority": "normal" | "important" }`

5. `POST /api/agent/issues/:id/work-complete`
   - body:
     ```json
     { "summary": "string", "filesChanged": ["string"], "testsPassed": true }
     ```

6. `POST /api/agent/issues/:id/error`
   - body: `{ "errorType": "string", "message": "string", "details"?: "string" }`

### Claude Code Non-Interactive Invocation (Relevant Extract)

From `ai_docs/claude-code-noninteractive.md` and `ai_docs/claude-how-to-stream.md` (trimmed):

Basic:

```bash
claude -p "your prompt here"
```

Streaming output reliably (important for debug mode):

```bash
claude --print --verbose --dangerously-skip-permissions --output-format stream-json
```

Stream-json events (newline-delimited JSON):

```ts
interface ClaudeStreamEvent {
  type?: 'content_block_delta' | 'assistant' | 'result';
  delta?: { text?: string };
  message?: { content?: Array<{ type?: string; text?: string }> };
  result?: string;
}
```

Real-time text arrives via `content_block_delta.delta.text`.

Implementation pattern (Node):
- spawn `claude` with `--output-format stream-json`
- parse stdout line-by-line (readline)
- for each JSON event:
  - if `type === 'content_block_delta'`, publish `delta.text`
  - else ignore (or use `assistant`/`result` as fallback if no deltas were seen)

Reference snippet (from `ai_docs/claude-how-to-stream.md`, trimmed):

```ts
import { spawn } from 'child_process';
import { createInterface } from 'readline';

type ClaudeStreamEvent =
  | { type: 'content_block_delta'; delta?: { text?: string } }
  | { type: 'assistant'; message?: { content?: Array<{ type?: string; text?: string }> } }
  | { type: 'result'; result?: string }
  | { type?: string };

export function runClaudeStreamJson(
  prompt: string,
  onText: (text: string) => void
): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('claude', [
      '--print',
      '--verbose',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
    ], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, TERM: 'xterm-256color' } });

    child.stdin?.write(prompt);
    child.stdin?.end();

    let sawDelta = false;
    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let event: ClaudeStreamEvent;
      try { event = JSON.parse(trimmed) as ClaudeStreamEvent; } catch { return; }

      if (event.type === 'content_block_delta') {
        sawDelta = true;
        if (event.delta?.text) onText(event.delta.text);
        return;
      }

      if (event.type === 'assistant' && !sawDelta) {
        for (const block of event.message?.content ?? []) {
          if (block.type === 'text' && block.text) onText(block.text);
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
```

### Codex CLI Non-Interactive Invocation (Relevant Extract)

From `ai_docs/codex-cli-noninteractive.md` (trimmed):

```bash
codex exec "your task prompt here"
codex exec --json "your task prompt here"   # JSONL event stream
```

JSONL events:

```ts
interface CodexEvent {
  type:
    | 'thread.started'
    | 'turn.started'
    | 'turn.completed'
    | 'turn.failed'
    | 'item.started'
    | 'item.completed'
    | 'error';
  item?: { id: string; type: string; text?: string };
}
```

Implementation pattern (Node):
- spawn `codex exec --json "<prompt>"`
- parse stdout line-by-line as JSONL
- publish any `item.text` you see (best-effort) as debug output lines

Reference snippet (Codex JSONL parsing):

```ts
import { spawn } from 'child_process';
import { createInterface } from 'readline';

export function runCodexJsonl(
  prompt: string,
  onText: (text: string) => void
): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('codex', ['exec', '--json', prompt], { stdio: ['ignore', 'pipe', 'pipe'] });
    const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const evt = JSON.parse(trimmed) as { item?: { text?: string } };
        if (evt.item?.text) onText(evt.item.text);
      } catch {
        // ignore parse errors (best-effort debug stream)
      }
    });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
}
```

### WebSocket Streaming (Relevant Extract)

From `ai_docs/websocket-realtime-patterns.md` (trimmed):

WS protocol (authoritative; repeated here so this spec is standalone):

Client -> Server:

```ts
type WsClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };
```

Server -> Client:

```ts
type WsServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'pong' }
  | { type: 'event'; channel: string; event: string; data: unknown }
  | { type: 'error'; message: string };
```

In Falcon PM, Phase 4 uses these channels:
- `run:<runId>` for debug output streaming

Event name:
- `agent.output` with payload:
  - `{ runId, agentId, issueId, at, line }`

## Goal

Enable agents to participate in the workflow via a minimal, stable interface:
- Agent-facing API endpoints (`/api/agent/**`)
- Non-interactive agent invocation wrappers (Claude Code + Codex) behind an interface
- Streaming of agent output (debug mode) to the dashboard via WebSocket

---

## Hard Modularity Rules (Phase Gate)

1. Orchestrator logic is not implemented here (Phase 5). This phase only provides the plumbing.
2. Invocation wrappers must be isolated behind interfaces so tests never spawn real `claude`/`codex`.
3. The agent-facing API must not expose internal DB schema; it returns DTOs from `src/pm/contracts/**`.

---

## Deliverables Checklist

- [ ] Agent API routes (Express):
  - [ ] `src/pm/api/routes/agent/issues.ts` (mounted at `/api/agent/issues`)
  - [ ] Implements:
    - `GET /api/agent/issues/:id/context`
    - `GET /api/agent/issues/:id/messages?forStage=...`
    - `POST /api/agent/issues/:id/comment`
    - `POST /api/agent/issues/:id/stage-message`
    - `POST /api/agent/issues/:id/work-complete`
    - `POST /api/agent/issues/:id/error`
- [ ] `src/pm/agents/invokers/agent-invoker.ts` (interface)
- [ ] `src/pm/agents/invokers/claude-code-invoker.ts` (implementation, not used in tests)
- [ ] `src/pm/agents/invokers/codex-cli-invoker.ts` (implementation, not used in tests)
- [ ] `src/pm/agents/output/output-bus.ts` (publish/subscribe output lines)
- [ ] `src/pm/api/websocket.ts` updated to broadcast output events (debug mode)
- [ ] Tests:
  - [ ] `tests/pm/api/agent-api.test.ts`
  - [ ] `tests/pm/agents/invokers.test.ts` (uses fake invoker)
  - [ ] `tests/pm/agents/output-bus.test.ts`

---

## Agent API Contract (v1)

The agent-facing API contract is defined in this spec's Context Pack section (authoritative).

### Auth Header

All agent endpoints require:
- `X-Agent-ID: <agent-id>`

Phase 4 does not implement full auth; it only verifies the header is present and maps it to an agent record (or rejects).

### Work Complete Payload (Minimum)

`POST /api/agent/issues/:id/work-complete`

```json
{
  "summary": "string",
  "filesChanged": ["string"],
  "testsPassed": true
}
```

This endpoint records a workflow run completion and enqueues the issue for the next stage (the actual stage advance happens in Phase 5).

---

## Invocation Interface (Testability Requirement)

Define an interface used by orchestration later:

```ts
export interface AgentInvoker {
  invokeStage(args: {
    agentId: string;
    issueId: string;
    stage: string;
    prompt: string;
    toolBaseUrl: string; // e.g. http://localhost:3002/api/agent
    debug: boolean;
  }): Promise<{ runId: string }>;
}
```

Implementations:
- `ClaudeCodeInvoker` uses research in `ai_docs/claude-code-noninteractive.md`
- `CodexCliInvoker` uses research in `ai_docs/codex-cli-noninteractive.md`

Tests must use `FakeAgentInvoker` that:
- emits a few output lines to OutputBus
- calls the agent API endpoints (mocked) OR directly returns success
- returns deterministic `runId`

---

## Output Streaming (Debug Mode)

Implement a simple in-process output bus:
- `publish({ runId, agentId, issueId, line })`
- `subscribe(runId, fn)` returns unsubscribe

WebSocket broadcasts:
- `agent.output` events scoped by `runId` and `issueId`

UI may subscribe by issue id (Phase 6). This phase only guarantees server-side broadcast.

---

## Test Plan

### `tests/pm/api/agent-api.test.ts`

- Use in-memory repos (Phase 1 pattern)
- Create a project/issue/agent in-memory
- Verify:
  - missing `X-Agent-ID` -> `VALIDATION_ERROR`
  - `POST comment` creates a comment with `author_type = agent`
  - `POST stage-message` creates a stage message record
  - `POST work-complete` marks workflow run completed (or creates a completion record)

### `tests/pm/agents/output-bus.test.ts`

- subscribe -> publish -> assert received
- unsubscribe -> publish -> assert not received

### `tests/pm/agents/invokers.test.ts`

- Invoker implementations are not executed. Only:
  - `FakeAgentInvoker` behavior
  - argument validation (builds correct prompt/tool URL)

---

## How To Run (Phase 4)

```bash
npm test
```

If you add a dev script to run the API in debug mode:

```bash
npm run pm:api:dev
```
