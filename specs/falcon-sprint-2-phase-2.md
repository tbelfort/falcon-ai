# Falcon Sprint 2 - Phase 2: Kanban UI (Separate App)

**Status**: Draft
**Depends On**: Phase 1 (API contracts). Must also run with mocked API (MSW) so it is independent.
**Outputs Required By**: Phase 6
**Self-Contained**: Yes (this spec includes a context pack; no other docs are required)
**Reference Only (Optional)**: `docs/design/ux.md`, `docs/design/api.md`, `docs/design/architecture.md`

---

## Handoff Prompt (Paste Into Fresh Model)

```text
You are implementing Falcon PM Sprint 2 Phase 2 (Kanban UI) as a separate app under `apps/pm-dashboard/` in the `falcon-ai` repo. Use ONLY `specs/falcon-sprint-2-phase-2.md` as the source of truth (its Context Pack contains the authoritative DTOs/endpoints/WS protocol and relevant React/TS patterns). Implement a mocked-mode UI with MSW that also works against the real backend, do not import backend runtime modules, and ensure `npm run pm:ui:test` passes and `npm run pm:ui:dev` runs.
```

## Context Pack (Read This, Then Implement)

### Goal Summary

This phase creates a *separate* React app at `apps/pm-dashboard/` that renders a Kanban board + issue detail UI. It must run in "mocked mode" with MSW so it can be implemented without any backend.

### Repo Reality (Important)

- Root repo is ESM + NodeNext TS. The UI app is separate and should not share the server's build config.
- The UI must not import backend modules. If you want shared types, export types-only contracts from the root package later; do not couple to server runtime code.

### Frozen UX Scope (Phase 2 Only)

Pages:
- Kanban (primary)

Modals:
- Issue detail modal (title/description/comments/labels)

Not in Phase 2:
- Active agents view
- PR review screen
- Settings

### Authoritative API/WS Contracts (UI Must Follow)

Even in mocked mode, the mock server must behave like the real API.

Response envelope:
```ts
type ApiSuccess<T> = { data: T; meta?: { total?: number } };
type ApiError = { error: { code: string; message: string; details?: unknown } };
type ApiResponse<T> = ApiSuccess<T> | ApiError;
```

Authoritative stage values:

```ts
type IssueStage =
  | 'BACKLOG'
  | 'TODO'
  | 'CONTEXT_PACK'
  | 'CONTEXT_REVIEW'
  | 'SPEC'
  | 'SPEC_REVIEW'
  | 'IMPLEMENT'
  | 'PR_REVIEW'
  | 'PR_HUMAN_REVIEW'
  | 'FIXER'
  | 'TESTING'
  | 'DOC_REVIEW'
  | 'MERGE_READY'
  | 'DONE';
```

Authoritative DTOs (minimum fields the UI must handle):

```ts
interface ProjectDto {
  id: string;
  name: string;
  slug: string;
}

interface IssueDto {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  stage: IssueStage;
  assignedAgentId: string | null;
  labels: LabelDto[];
}

interface LabelDto {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

interface CommentDto {
  id: string;
  issueId: string;
  content: string;
  authorType: 'agent' | 'human';
  authorName: string;
  createdAt: number;
}
```

Authoritative endpoints the UI must call (real backend) and MSW must mock:

- `GET /api/projects` -> `ProjectDto[]`
- `GET /api/issues?projectId=<id>` -> `IssueDto[]`
- `GET /api/projects/:id/labels` -> `LabelDto[]`
- `GET /api/issues/:id/comments` -> `CommentDto[]`
- `POST /api/issues/:id/comments` body `{ content: string, authorName?: string }` -> `CommentDto`
- `POST /api/issues/:id/transition` body `{ toStage: IssueStage }` -> `IssueDto`
- `PATCH /api/issues/:id` body `{ labelIds: string[] }` -> `IssueDto`

WS protocol (Phase 1 contract; repeated here so this spec is standalone):

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

Client -> Server:
```ts
type WsClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };
```

Channels:
- `project:<projectId>`
- `issue:<issueId>`

Events:
- `issue.created` / `issue.updated` / `issue.deleted`
- `comment.created`
- `label.created`

Client hook sketch (from `ai_docs/websocket-realtime-patterns.md`, trimmed):

```ts
export function useWebSocket(url: string, onEvent: (msg: unknown) => void) {
  useEffect(() => {
    const ws = new WebSocket(url);
    ws.onmessage = (event) => onEvent(JSON.parse(event.data));
    return () => ws.close();
  }, [url, onEvent]);
}
```

### React/TS Patterns (Relevant Extract)

From `ai_docs/react-typescript-llm-patterns.md` (trimmed):

- Prefer typed props interfaces (no `React.FC`)
- Model async state with discriminated unions
- Use `assertNever` for exhaustive checks

Example pattern:

```ts
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };
```

## Goal

Create the Falcon PM Kanban UI as a separate frontend app that:
- runs independently from the backend using mocked API responses
- integrates with the real backend over HTTP + WebSocket when available
- contains only UX concerns (no filesystem/git/db logic)

---

## Workspace and Scripts (Required)

This phase standardizes on **npm workspaces** so the UI is a true separate app but still runnable from repo root.

1. Update root `package.json`:
   - add `"workspaces": ["apps/*"]`
   - add scripts:
     - `pm:ui:dev`: `npm --workspace pm-dashboard run dev`
     - `pm:ui:test`: `npm --workspace pm-dashboard run test`
     - `pm:ui:build`: `npm --workspace pm-dashboard run build`

2. Create `apps/pm-dashboard/package.json` with scripts:
   - `dev`: `vite`
   - `build`: `vite build`
   - `test`: `vitest run`

---

## Hard Modularity Rules (Phase Gate)

1. The UI must not import from `src/pm/**` (except optional type-only imports from a contracts export).
2. The UI must talk to the system only via HTTP (`/api`) and WebSocket (`/ws`).
3. Drag/drop behavior is UI-only. Stage transitions are validated server-side (Phase 1) and enforced by orchestration (Phase 5).

---

## Deliverables Checklist

- [ ] `apps/pm-dashboard/` (Vite + React + TS)
- [ ] Kanban screen:
  - board columns for at least: BACKLOG, TODO, (and the execution stages grouped or listed)
  - issue cards with title, labels, stage badge, assigned agent badge (when present)
- [ ] Issue detail modal:
  - title/description
  - comments list + add comment
  - labels list + edit labels
  - stage messages read-only view (if API exposes it)
- [ ] `apps/pm-dashboard/src/api/client.ts` (typed API client)
- [ ] `apps/pm-dashboard/src/hooks/useWebSocket.ts` (WS subscription helper)
- [ ] `apps/pm-dashboard/src/stores/*` (Zustand stores for projects/issues/ui state)
- [ ] MSW mock server for development without backend
- [ ] Tests for Kanban rendering and issue modal behavior

---

## UI Stack (Recommended)

- Vite + React + TypeScript
- Zustand for state
- Tailwind for styling
- Drag/drop:
  - Prefer `@dnd-kit/core` + `@dnd-kit/sortable` (simple, modern)
- Testing:
  - Vitest + React Testing Library
  - MSW for API mocks

---

## npm Dependencies (apps/pm-dashboard)

Install in `apps/pm-dashboard/`:

Runtime:
- `react`
- `react-dom`
- `zustand`
- `@dnd-kit/core`
- `@dnd-kit/sortable`

Dev:
- `vite`
- `@vitejs/plugin-react`
- `typescript`
- `tailwindcss`
- `postcss`
- `autoprefixer`
- `vitest`
- `@testing-library/react`
- `@testing-library/jest-dom`
- `jsdom`
- `msw`

---

## API Integration Contract

The UI must use the response envelope defined in this spec:
- success: `{ data: ... }`
- error: `{ error: { code, message, details? } }`

Implement a single API client that:
- unwraps `data` on success
- throws a typed error on failure (preserve error code/message)
- supports cancellation (AbortController) for list fetches

---

## Mocked Mode (Independence Requirement)

The app must run without the backend:
- When `VITE_API_BASE_URL` is unset, default to mocked mode using MSW.
- Provide a small in-memory dataset in mocks:
  - 1 project
  - 6-10 issues across stages
  - some labels and comments

This is what makes Phase 2 "completely runnable and independent".

---

## Test Plan

Create tests inside `apps/pm-dashboard/`:

- Kanban renders columns and issue cards from mocked API
- Clicking an issue opens modal and loads comments
- Dragging an issue between columns updates local state optimistically and calls the API (mocked)
- If API returns validation error, UI reverts optimistic move and shows error banner

---

## How To Run (Phase 2)

From repo root:

```bash
# UI dev server (mocked mode by default)
npm run pm:ui:dev

# UI tests
npm run pm:ui:test
```
