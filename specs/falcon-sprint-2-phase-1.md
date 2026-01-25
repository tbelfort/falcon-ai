# Falcon Sprint 2 - Phase 1: REST API (CRUD + Validation + WS Contracts)

**Status**: Draft
**Depends On**: Phase 0 (types/contracts/db), but Phase 1 must be runnable with in-memory repositories for tests
**Outputs Required By**: Phase 2, Phase 4, Phase 5, Phase 6, Phase 7
**Self-Contained**: Yes (this spec includes a context pack; no other docs are required)
**Reference Only (Optional)**: `docs/design/api.md`, `docs/design/architecture.md`

---

## Handoff Prompt (Paste Into Fresh Model)

```text
You are implementing Falcon PM Sprint 2 Phase 1 (REST API + WebSocket) in the `falcon-ai` repo. Use ONLY `specs/falcon-sprint-2-phase-1.md` as the source of truth (its Context Pack contains the authoritative DTOs, endpoints, error codes, and WS protocol). Build thin Express routes calling IO-free core services with in-memory repos for tests, emit WS events per the contract, and ensure `npm test` passes and `npm run pm:api:dev` starts an API server on port 3002.
```

## Context Pack (Read This, Then Implement)

### Repo Reality (Build/Test Constraints)

- Node: `>= 20`, ESM package (`"type": "module"`)
- TS: NodeNext; use `.js` in TS imports for local files
- Build: `npm run build` (tsc -> `dist/`)
- Tests: `npm test` (vitest, includes `tests/**/*.test.ts`)

### Frozen Module Boundaries

- Route handlers (`src/pm/api/**`) are thin (validation + call service + map response)
- Business logic lives in IO-free services (`src/pm/core/services/**`) using repo interfaces (`src/pm/core/repos/**`)
- No React/UI code in this phase

### Response Envelope (Authoritative)

All endpoints must respond with exactly one of:

```ts
export type ApiSuccess<T> = { data: T; meta?: { total?: number; page?: number; perPage?: number } };
export type ApiError = { error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
```

### Error Codes and HTTP Mapping (Authoritative)

Use these codes consistently:

| code | http |
|------|------|
| `NOT_FOUND` | 404 |
| `VALIDATION_ERROR` | 400 |
| `CONFLICT` | 409 |
| `AGENT_BUSY` | 409 |
| `INVALID_TRANSITION` | 400 |
| `INTERNAL_ERROR` | 500 |

### JSON Shapes (Authoritative DTOs)

Use camelCase in the API. DB columns may be snake_case, but API payloads are camelCase.

```ts
export interface ProjectDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  repoUrl: string | null;
  defaultBranch: string;
  config: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface IssueDto {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: 'backlog' | 'todo' | 'in_progress' | 'done';
  stage: import('../core/types.js').IssueStage;
  priority: 'low' | 'medium' | 'high' | 'critical';
  labels: LabelDto[];
  presetId: string | null;
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  assignedAgentId: string | null;
  assignedHuman: string | null;
  attributes: unknown | null;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface LabelDto {
  id: string;
  projectId: string;
  name: string;
  color: string;
  description: string | null;
  isBuiltin: boolean;
  createdAt: number;
}

export interface CommentDto {
  id: string;
  issueId: string;
  content: string;
  authorType: 'agent' | 'human';
  authorName: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentDto {
  id: string;
  projectId: string;
  issueId: string | null;
  title: string;
  docType: 'context_pack' | 'spec' | 'ai_doc' | 'other';
  filePath: string;
  contentHash: string | null;
  version: number;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
}
```

### WebSocket (Relevant Extract + Frozen Protocol)

From `ai_docs/websocket-realtime-patterns.md` (trimmed), Falcon PM uses `ws` with a tiny message protocol.

Endpoint:
- WS URL: `ws://localhost:3002/ws`

Server -> Client messages:

```ts
export type WsServerMessage =
  | { type: 'connected'; clientId: string }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'pong' }
  | { type: 'event'; channel: string; event: string; data: unknown }
  | { type: 'error'; message: string };
```

Client -> Server messages:

```ts
export type WsClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };
```

Channels (strings):
- `project:<projectId>`
- `issue:<issueId>`

Event names (strings) and payloads (must be the API DTOs from this spec):
- `project.created` | `project.updated` | `project.deleted` -> `ProjectDto`
- `issue.created` | `issue.updated` | `issue.deleted` -> `IssueDto`
- `comment.created` -> `CommentDto`
- `label.created` -> `LabelDto`
- `document.created` -> `DocumentDto`

Server implementation sketch (from `ai_docs/websocket-realtime-patterns.md`, adapted to no-auth local dev):

```ts
import { WebSocketServer, WebSocket } from 'ws';

type Client = { ws: WebSocket; subscriptions: Set<string> };
const clients = new Map<string, Client>();

export function setupWebSocket(server: import('http').Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const clientId = crypto.randomUUID();
    clients.set(clientId, { ws, subscriptions: new Set() });

    ws.send(JSON.stringify({ type: 'connected', clientId }));

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'subscribe') clients.get(clientId)?.subscriptions.add(msg.channel);
      if (msg.type === 'unsubscribe') clients.get(clientId)?.subscriptions.delete(msg.channel);
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    });

    ws.on('close', () => { clients.delete(clientId); });
  });
}

export function broadcast(channel: string, event: string, data: unknown) {
  const payload = JSON.stringify({ type: 'event', channel, event, data });
  for (const client of clients.values()) {
    if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}
```

## Goal

Deliver a backend HTTP API + WebSocket event surface for Falcon PM without coupling business logic to Express:
- Express server on port `3002`
- CRUD endpoints for projects/issues/labels/comments/documents
- Consistent response envelope + error codes
- WebSocket broadcast of mutations for real-time UI

No UX code in this phase.

---

## npm Dependencies (Phase 1 Only)

Add:

Runtime:
- `express`
- `cors` (dashboard dev server runs on a different origin)
- `ws` (WebSocket server)

Dev:
- `supertest` (HTTP route tests)
- `@types/express`
- `@types/cors`
- `@types/supertest`

---

## Hard Modularity Rules (Phase Gate)

1. Route handlers must be thin: validation + calling a core service + mapping response.
2. Core services must not import Express (`req`, `res` do not cross the boundary).
3. Tests must run without a real `~/.falcon/pm.db` by using in-memory repos.

---

## Deliverables Checklist

- [ ] `src/pm/api/server.ts` (Express app + wiring)
- [ ] `src/pm/api/main.ts` (starts the server on port 3002)
- [ ] `src/pm/api/http-errors.ts` (typed error codes + mapping to HTTP status)
- [ ] `src/pm/api/routes/projects.ts`
- [ ] `src/pm/api/routes/issues.ts`
- [ ] `src/pm/api/routes/labels.ts`
- [ ] `src/pm/api/routes/comments.ts`
- [ ] `src/pm/api/routes/documents.ts`
- [ ] `src/pm/api/websocket.ts` (WS server + broadcaster)
- [ ] `src/pm/core/services/*` (IO-free application services operating on repo interfaces)
- [ ] `src/pm/core/repos/*` (repo interfaces)
- [ ] `src/pm/db/repos/*` (Drizzle repo implementations; can be stubbed until Phase 0 is fully implemented)
- [ ] `src/pm/core/testing/in-memory-repos.ts` (in-memory repo implementations for tests)
- [ ] `tests/pm/api/projects.test.ts`
- [ ] `tests/pm/api/issues.test.ts`
- [ ] `tests/pm/api/validation.test.ts`
- [ ] `tests/pm/api/ws-events.test.ts`

---

## API Surface (Minimum v1)

Minimum required endpoints (authoritative):

Projects:
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`

Issues:
- `GET /api/issues?projectId=...`
- `POST /api/issues`
- `GET /api/issues/:id`
- `PATCH /api/issues/:id` (supports `labelIds` in body)
- `POST /api/issues/:id/start` (human action: select preset)
- `POST /api/issues/:id/transition` (validate via `canTransition()` from `src/pm/core/stage-machine.ts`, then persist)

Comments:
- `GET /api/issues/:id/comments`
- `POST /api/issues/:id/comments`

Labels:
- `GET /api/projects/:id/labels`
- `POST /api/projects/:id/labels`

Documents:
- `GET /api/issues/:id/documents`
- `POST /api/issues/:id/documents` (metadata only; file storage wiring can be Phase 2+)

WebSocket:
- `ws://localhost:3002/ws`
- Broadcast events on create/update/delete for projects/issues/comments/labels/documents

---

## Authoritative Endpoint Specs (Request/Response)

All responses use the envelope from this spec.

### `GET /api/projects`

Response:
```json
{ "data": [{ "id": "uuid", "name": "My Project", "slug": "my-project", "description": null, "repoUrl": null, "defaultBranch": "main", "config": {}, "createdAt": 0, "updatedAt": 0 }] }
```

### `POST /api/projects`

Request:
```json
{ "name": "My Project", "slug": "my-project", "description": "Optional", "repoUrl": "https://github.com/owner/repo.git", "defaultBranch": "main" }
```

Response: `ProjectDto`

### `POST /api/issues`

Request:
```json
{ "projectId": "uuid", "title": "Fix bug", "description": "Details", "priority": "medium" }
```

Server assigns `number` (monotonic per project) and sets defaults:
- `status = "backlog"`
- `stage = "BACKLOG"`

Response: `IssueDto`

### `PATCH /api/issues/:id`

Request (all fields optional; only provided fields are updated):
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "priority": "medium",
  "labelIds": ["uuid"]
}
```

Rules:
- `labelIds` replaces the issue's labels exactly (idempotent)
- all `labelIds` must exist and belong to the issue's project

Response: updated `IssueDto`

### `POST /api/issues/:id/start`

Human action to begin the workflow.

Request:
```json
{ "presetId": "uuid" }
```

Behavior (Phase 1):
- Validates issue is in a startable state (`status in {backlog,todo}` and `stage in {BACKLOG,TODO}`)
- Sets:
  - `issues.preset_id = presetId`
  - `issues.status = "in_progress"`
  - `issues.stage = "CONTEXT_PACK"`
  - `issues.started_at = unixepoch()`
  - `issues.branch_name` to a deterministic slug: `issue/<number>-<kebab-title>`
- Emits WS `issue.updated` on `project:<projectId>` and `issue:<issueId>`

Response:
```json
{ "data": { "issue": { "...": "IssueDto" }, "branchName": "issue/123-fix-auth", "nextStage": "CONTEXT_PACK" } }
```

### `POST /api/issues/:id/transition`

Request:
```json
{ "toStage": "TODO" }
```

Validation:
- Must pass `canTransition(issue.stage, toStage)` from `src/pm/core/stage-machine.ts`
- On failure: `{ "error": { "code": "INVALID_TRANSITION", ... } }`

Response: updated `IssueDto`

---

## In-Memory Repos (For Phase Independence)

Implement in-memory repository implementations in:
`src/pm/core/testing/in-memory-repos.ts`

These are required so all API tests are runnable without touching `~/.falcon/pm.db`.

---

## WebSocket Events (Contracts)

Define event payload types in `src/pm/contracts/ws.ts` (Phase 0) and implement them here.

Minimum event types:
- `project.created`, `project.updated`, `project.deleted`
- `issue.created`, `issue.updated`, `issue.deleted`
- `comment.created`
- `label.created`
- `document.created`

Each event must include:
- `type` (string literal)
- `at` (timestamp)
- `projectId`
- `issueId` when relevant
- `payload` (DTO)

---

## Test Plan

### API Tests (supertest)

Use `supertest` against the Express app instance:
- create + list + get + update + delete project
- create issue under project; list issues by projectId
- validation failures return `{ error: { code: 'VALIDATION_ERROR', ... } }`

### WS Events

- Start server on an ephemeral port
- Connect a WS client
- Perform an HTTP mutation (e.g., create issue)
- Assert WS client receives the corresponding event with correct payload shape

---

## How To Run (Phase 1)

Required scripts to add to root `package.json`:

- `pm:api:dev`: `npm run build && node dist/pm/api/main.js`

Run:

```bash
npm test
npm run pm:api:dev
```

Expected URLs:
- REST: `http://localhost:3002/api`
- WS: `ws://localhost:3002/ws`
