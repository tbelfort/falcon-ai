# Falcon Sprint 2 - Phase 6: Dashboard (Agents + Debug Output + PR Review UX)

**Status**: Draft
**Depends On**: Phase 2 (UI shell + Kanban), Phase 4 (output streaming contract), Phase 5 (orchestration concepts). Must remain runnable with mocked API.
**Outputs Required By**: Phase 7
**Self-Contained**: Yes (this spec includes a context pack; no other docs are required)
**Reference Only (Optional)**: `docs/design/ux.md`, `docs/design/api.md`

---

## Handoff Prompt (Paste Into Fresh Model)

```text
You are implementing Falcon PM Sprint 2 Phase 6 (Dashboard extensions: agents + debug output + PR review UX) in `apps/pm-dashboard/` within the `falcon-ai` repo. Use ONLY `specs/falcon-sprint-2-phase-6.md` as the source of truth (its Context Pack contains the authoritative WS debug-output contract, PR findings/orchestrator/presets endpoint contracts, and UX rules). Keep the UI runnable in mocked mode via MSW and an injectable fake WS transport, do not import backend runtime modules, and ensure `npm run pm:ui:test` passes.
```

## Context Pack (Read This, Then Implement)

### Goal Summary

This phase extends `apps/pm-dashboard/` (built in Phase 2) with:
- Active agents monitoring (including debug output streaming)
- PR findings review + approval workflow (human gate)
- Minimal settings screens (agents + presets + project config)

This phase must still run in mocked mode (MSW + fake WS transport).

### Authoritative WS Contract for Debug Output

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

Channels used by the dashboard:
- `project:<projectId>`
- `issue:<issueId>`
- `run:<runId>` (debug output streaming)

For debug output, UI subscribes to:
- `run:<runId>`

Event:
- `agent.output`

Payload:
```ts
interface AgentOutputEvent {
  runId: string;
  agentId: string;
  issueId: string;
  at: number;     // unix ms ok for output timestamps
  line: string;
}
```

### Authoritative PR Findings Contract (UI Must Follow)

Endpoints (real backend) and MSW mocks must exist:

- `GET /api/issues/:issueId/findings`
- `POST /api/findings/:id/review`
- `POST /api/issues/:issueId/launch-fixer`

Response shapes (authoritative):

`GET /api/issues/:issueId/findings`:

```json
{
  "data": {
    "prNumber": 123,
    "prUrl": "https://github.com/...",
    "findings": [
      {
        "id": "uuid",
        "findingType": "error",
        "category": "security",
        "filePath": "src/auth.ts",
        "lineNumber": 42,
        "message": "Potential SQL injection",
        "suggestion": "Use parameterized queries",
        "foundBy": "claude-sonnet-4",
        "confirmedBy": "claude-opus-4.5",
        "confidence": 0.95,
        "status": "pending"
      }
    ],
    "summary": { "total": 5, "pending": 3, "approved": 1, "dismissed": 1 }
  }
}
```

`POST /api/findings/:id/review` body:

```json
{ "status": "approved", "comment": "Valid concern" }
```

`POST /api/issues/:issueId/launch-fixer` has no request body.

### Orchestrator Status (UI Must Follow)

Endpoint:
- `GET /api/orchestrator/status`

Response:
```json
{
  "data": {
    "running": true,
    "activeIssues": 3,
    "queuedIssues": 5,
    "activeAgents": [
      { "agentId": "uuid", "issueId": "uuid", "stage": "IMPLEMENT" }
    ]
  }
}
```

### Presets (Settings Screen Uses This)

Endpoints:
- `GET /api/presets`
- `POST /api/presets`
- `PATCH /api/presets/:id`
- `DELETE /api/presets/:id`

The `config` field must match the PresetConfig shape used in Phase 0/5.

### React/TS Pattern Reminder (Relevant Extract)

From `ai_docs/react-typescript-llm-patterns.md` (trimmed):

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
```

## Goal

Extend the UI app (`apps/pm-dashboard/`) to include the monitoring + human-gate workflows:
- Active agents view with live debug output (WS)
- PR review findings approval screen (approve/dismiss + launch fixer)
- Settings screens for agents, presets, and project config (minimal)

---

## Hard Modularity Rules (Phase Gate)

1. Still no imports from backend modules (same Phase 2 rule).
2. All new screens must function in mocked mode (MSW), including WS via an injectable transport (no conditional UI fallback).

---

## Deliverables Checklist

- [ ] `apps/pm-dashboard/src/pages/ActiveAgents.tsx`
- [ ] `apps/pm-dashboard/src/pages/PRReview.tsx`
- [ ] `apps/pm-dashboard/src/pages/Settings.tsx` (minimal)
- [ ] `apps/pm-dashboard/src/components/DebugOutputPanel.tsx`
- [ ] `apps/pm-dashboard/src/components/FindingCard.tsx`
- [ ] WS subscription in UI (issue-scoped output streaming)
- [ ] Tests:
  - [ ] Active agents renders and updates from mocked WS events
  - [ ] PR findings list renders; approve/dismiss updates local state and calls API
  - [ ] Launch fixer button enabled only when rules satisfied

---

## PR Review UX Rules (v1)

Authoritative UX rules:
- Findings have states: pending / approved / dismissed
- Launch fixer requires all pending findings reviewed
- UI must capture an optional comment on approve/dismiss

---

## Test Plan

Inside `apps/pm-dashboard/`:
- Component-level tests with Vitest + RTL
- MSW mocks for HTTP endpoints
- For WS:
  - implement `useWebSocket(transport?: WebSocketTransport)` so tests can pass a `FakeWebSocketTransport`
  - tests drive WS updates by calling `fake.publish(event)`

---

## How To Run (Phase 6)

```bash
npm run pm:ui:dev
npm run pm:ui:test
```
