# API Design Document

## Overview

The falcon-pm API is a REST API built with Express.js, running on port 3002. It provides endpoints for project management, issue tracking, agent coordination, and orchestration control.

## Base URL

```
http://localhost:3002/api
```

## Authentication

For local development, authentication is minimal. The API accepts:
- `X-Agent-ID` header for agent-facing endpoints
- Future: JWT tokens for multi-user support

No authentication or rate limiting is enforced by default; the API is intended for localhost use only.

CORS is open by default for local dev. To restrict origins, set `FALCON_PM_CORS_ORIGINS` to a comma-separated list of allowed origins.

## Response Format

All responses follow this structure:

```typescript
// Success
{
  "data": T,
  "meta"?: {
    "total"?: number,
    "page"?: number,
    "perPage"?: number
  }
}

// Error
{
  "error": {
    "code": string,
    "message": string,
    "details"?: unknown
  }
}
```

## Pagination

List endpoints accept `page` and `perPage` query parameters. Defaults are `page=1` and `perPage=50` with a maximum of `perPage=100`. Responses include `meta.total`, `meta.page`, and `meta.perPage`.

## Timestamps

All timestamp fields (`createdAt`, `updatedAt`, `startedAt`, `completedAt`, WS `at`) are Unix seconds (UTC).

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `CONFLICT` | 409 | Resource conflict (duplicate) |
| `AGENT_BUSY` | 409 | Agent is already working |
| `INVALID_TRANSITION` | 400 | Invalid stage transition |
| `INTERNAL_ERROR` | 500 | Server error |
| `invalid_json` | N/A (client-side) | Response JSON parsing failed |

---

## Projects API

### List Projects

```
GET /api/projects
```

**Query Parameters:**
- `search` (string): Filter by name

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "My Project",
      "slug": "my-project",
      "description": "...",
      "repoUrl": "https://github.com/...",
      "defaultBranch": "main",
      "createdAt": 1705766400,
      "updatedAt": 1705766400,
      "_counts": {
        "issues": 42,
        "agents": 3
      }
    }
  ]
}
```

### Create Project

```
POST /api/projects
```

**Request Body:**
```json
{
  "name": "My Project",
  "slug": "my-project",
  "description": "Optional description",
  "repoUrl": "https://github.com/owner/repo.git",
  "defaultBranch": "main"
}
```

### Get Project

```
GET /api/projects/:id
```

### Update Project

```
PATCH /api/projects/:id
```

### Delete Project

```
DELETE /api/projects/:id
```

---

## Issues API

### List Issues

```
GET /api/issues?projectId=<id>
```

**Query Parameters:**
- `projectId` (string, required): Filter by project ID
- `status` (string[]): Filter by status (backlog, todo, in_progress, done)
- `stage` (string): Filter by stage
- `label` (string[]): Filter by label names
- `assignedAgent` (string): Filter by agent ID
- `search` (string): Search title/description
- `page` (number): Page number (default: 1)
- `perPage` (number): Items per page (default: 50)

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "number": 1,
      "title": "Fix authentication bug",
      "description": "...",
      "status": "in_progress",
      "stage": "IMPLEMENT",
      "priority": "high",
      "branchName": "fix/auth-bug-dancing-penguin",
      "prNumber": null,
      "assignedAgent": {
        "id": "uuid",
        "name": "opus-1"
      },
      "labels": [
        { "id": "uuid", "name": "bug", "color": "#ef4444" }
      ],
      "attributes": {
        "hasContextPack": true,
        "hasSpec": true
      },
      "createdAt": 1705766400,
      "updatedAt": 1705766400
    }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "perPage": 50
  }
}
```

### Create Issue

```
POST /api/projects/:projectId/issues
```

**Request Body:**
```json
{
  "title": "Fix authentication bug",
  "description": "Users can't log in after password reset",
  "priority": "high",
  "labelIds": ["uuid", "uuid"]
}
```

**Response:** Created issue with auto-generated number.

### Get Issue

```
GET /api/issues/:id
```

**Response:** Full issue with comments, documents, stage messages.

### Update Issue

```
PATCH /api/issues/:id
```

**Request Body:**
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "priority": "medium",
  "labelIds": ["uuid"]
}
```

### Delete Issue

```
DELETE /api/issues/:id
```

### Start Issue (Human Action)

```
POST /api/issues/:id/start
```

Moves issue from backlog/todo to active workflow.

**Request Body:**
```json
{
  "presetId": "uuid"
}
```

**Response:**
```json
{
  "data": {
    "issue": { ... },
    "branchName": "fix/auth-bug-dancing-penguin",
    "nextStage": "CONTEXT_PACK"
  }
}
```

### Transition Issue Stage

```
POST /api/issues/:id/transition
```

**Request Body:**
```json
{
  "toStage": "SPEC",
  "reason": "Context pack approved"
}
```

---

## Labels API

### List Labels

```
GET /api/projects/:projectId/labels
```

### Create Label

```
POST /api/projects/:projectId/labels
```

**Request Body:**
```json
{
  "name": "urgent",
  "color": "#ef4444",
  "description": "Requires immediate attention"
}
```

### Update Label

```
PATCH /api/labels/:id
```

### Delete Label

```
DELETE /api/labels/:id
```

---

## Agents API

### List Agents

```
GET /api/projects/:projectId/agents
```

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "opus-1",
      "agentType": "claude",
      "model": "claude-opus-4.5",
      "status": "working",
      "currentIssue": {
        "id": "uuid",
        "number": 42,
        "title": "Fix auth bug"
      },
      "currentStage": "IMPLEMENT",
      "workDir": "~/.falcon/projects/my-project/agents/opus-1",
      "stats": {
        "totalTasksCompleted": 15,
        "lastActiveAt": 1705766400
      }
    }
  ]
}
```

### Register Agent

```
POST /api/projects/:projectId/agents
```

**Request Body:**
```json
{
  "name": "opus-2",
  "agentType": "claude",
  "model": "claude-opus-4.5"
}
```

Triggers workspace provisioning (git clone, folder setup).

### Update Agent

```
PATCH /api/agents/:id
```

### Remove Agent

```
DELETE /api/agents/:id
```

### Get Agent Status

```
GET /api/agents/:id/status
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "status": "working",
    "currentIssue": { ... },
    "currentStage": "IMPLEMENT",
    "sessionId": "claude-session-123",
    "startedAt": 1705766400
  }
}
```

---

## Agent API (Agent-Facing Endpoints)

These endpoints are called by agents during execution.

### Get Issue Context

```
GET /api/agent/issues/:id/context
```

**Headers:**
- `X-Agent-ID`: Agent identifier

**Response:**
```json
{
  "data": {
    "issue": { ... },
    "project": { ... },
    "documents": [
      { "type": "context_pack", "path": "...", "content": "..." }
    ],
    "stageMessages": [
      { "fromStage": "CONTEXT_PACK", "message": "Watch out for..." }
    ],
    "workflow": {
      "currentStage": "IMPLEMENT",
      "previousStages": ["CONTEXT_PACK", "SPEC"],
      "nextStages": ["PR_REVIEW"]
    }
  }
}
```

### Get Stage Messages

```
GET /api/agent/issues/:id/messages
```

**Query Parameters:**
- `forStage` (string): Current agent's stage

### Add Comment

```
POST /api/agent/issues/:id/comment
```

**Request Body:**
```json
{
  "content": "Implemented the fix. Note: also updated the related utils."
}
```

### Send Stage Message

```
POST /api/agent/issues/:id/stage-message
```

**Request Body:**
```json
{
  "toStage": "PR_REVIEW",
  "message": "The auth module was refactored. Pay attention to session handling.",
  "priority": "important"
}
```

### Signal Work Complete

```
POST /api/agent/issues/:id/work-complete
```

**Request Body:**
```json
{
  "summary": "Implemented authentication fix",
  "filesChanged": ["src/auth.ts", "src/utils.ts"],
  "testsPassed": true
}
```

Triggers orchestrator to advance stage.

### Report Error

```
POST /api/agent/issues/:id/error
```

**Request Body:**
```json
{
  "errorType": "build_failed",
  "message": "TypeScript compilation errors",
  "details": "..."
}
```

---

## Documents API

### List Documents

```
GET /api/issues/:issueId/documents
```

### Attach Document

```
POST /api/issues/:issueId/documents
```

**Request Body:**
```json
{
  "title": "Context Pack v1",
  "docType": "context_pack",
  "filePath": ".falcon/issues/123/context/context-pack.md"
}
```

### Get Document

```
GET /api/documents/:id
```

### Delete Document

```
DELETE /api/documents/:id
```

---

## Comments API

### List Comments

```
GET /api/issues/:issueId/comments
```

### Add Comment

```
POST /api/issues/:issueId/comments
```

**Request Body:**
```json
{
  "content": "This looks good. Proceed with implementation.",
  "authorType": "human",
  "authorName": "Alice"
}
```

---

## Orchestrator API

### Get Orchestrator Status

```
GET /api/orchestrator/status
```

**Response:**
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

### Start Orchestrator

```
POST /api/orchestrator/start
```

### Stop Orchestrator

```
POST /api/orchestrator/stop
```

### Pause Issue

```
POST /api/orchestrator/issues/:id/pause
```

### Resume Issue

```
POST /api/orchestrator/issues/:id/resume
```

---

## PR Review API

### Get PR Findings

```
GET /api/issues/:issueId/findings
```

**Response:**
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
    "summary": {
      "total": 5,
      "pending": 3,
      "approved": 1,
      "dismissed": 1
    }
  }
}
```

### Review Finding (Human Action)

```
POST /api/findings/:id/review
```

**Request Body:**
```json
{
  "status": "approved",
  "comment": "Valid concern, should be fixed"
}
```

### Launch Fixer

```
POST /api/issues/:issueId/launch-fixer
```

Triggers fixer agent for approved findings.

---

## Model Presets API

### List Presets

```
GET /api/presets
```

### Create Preset

```
POST /api/presets
```

**Request Body:**
```json
{
  "name": "security-focused",
  "description": "Extra scrutiny for security issues",
  "config": {
    "stages": ["CONTEXT_PACK", "SPEC", "IMPLEMENT", "PR_REVIEW", "FIXER", "TESTING"],
    "models": {
      "default": "claude-opus-4.5"
    },
    "prReview": {
      "orchestrator": "claude-opus-4.5",
      "scouts": ["claude-opus-4.5", "claude-sonnet-4"],
      "judge": "claude-opus-4.5"
    }
  }
}
```

### Update Preset

```
PATCH /api/presets/:id
```

### Delete Preset

```
DELETE /api/presets/:id
```

---

## Workflow Runs API

### List Runs for Issue

```
GET /api/issues/:issueId/runs
```

### Get Run Details

```
GET /api/runs/:id
```

**Response:**
```json
{
  "data": {
    "id": "uuid",
    "issueId": "uuid",
    "agentId": "uuid",
    "stage": "IMPLEMENT",
    "status": "completed",
    "startedAt": 1705766400,
    "completedAt": 1705766400,
    "resultSummary": "Implementation complete",
    "metrics": {
      "durationMs": 45000,
      "costUsd": 0.15,
      "tokensInput": 5000,
      "tokensOutput": 2000
    },
    "sessionId": "claude-session-123"
  }
}
```

---

## WebSocket Events

### Connection

```
ws://localhost:3002/ws
```

**Note on authentication:** The token query parameter (`?token=<auth-token>`) is reserved for future production deployments. In localhost development mode, WebSocket connections are accepted without authentication. Production deployments should implement token validation on the connection upgrade.

### Connection Keepalive

The client sends a ping message every 30 seconds to keep the connection alive:

```json
{ "type": "ping" }
```

The server responds with a pong message. If the connection is lost, the client should implement exponential backoff reconnection (starting at 1 second, capping at 30 seconds).

### Client-Side URL Derivation

When `VITE_API_BASE_URL` is set, the WebSocket URL is derived by:
1. Taking the base URL (e.g., `http://localhost:3002`)
2. Replacing the protocol: `http://` → `ws://`, `https://` → `wss://`
3. Appending `/ws` path

When `VITE_API_BASE_URL` is not set (MSW mocked mode), the WebSocket URL is derived from `window.location` using the same protocol/host transformation. This allows the dashboard to work in development without explicit configuration.

### Subscribe/Unsubscribe

```json
// Client -> Server
{ "type": "subscribe", "channel": "project:my-project" }
{ "type": "unsubscribe", "channel": "issue:123" }
```

### Event Types

```json
// Server -> Client
{ "type": "event", "channel": "issue:123", "event": "stage_changed", "data": {...} }
{ "type": "event", "channel": "agent:opus-1", "event": "output", "data": {"content": "..."} }
```

**Channels:**
- `project:<id>` - Project-wide events
- `issue:<id>` - Issue updates
- `agent:<name>` - Agent status and output

Issue-scoped events are broadcast to both `project:<projectId>` and `issue:<issueId>`. Subscribe to the project channel for dashboards and to the issue channel for detail views.

**Events:**
- `issue_created`, `issue_updated`, `issue_deleted`
- `stage_changed`, `status_changed`
- `agent_assigned`, `agent_completed`
- `finding_added`, `finding_reviewed`
- `output` (agent debug output)

---

## GitHub Webhook

### Handle GitHub Events

```
POST /api/github/webhook
```

Handles:
- `pull_request` events (opened, closed, merged)
- `check_run` events
- `issue_comment` events

---

## Client Request Timeout

The dashboard API client enforces a 30-second timeout on all fetch requests. This prevents the UI from hanging indefinitely if the server is slow or unreachable. The timeout is implemented using `AbortSignal.timeout(30000)` in the request wrapper.

When a request times out, the client throws an `AbortError` which should be handled by the calling code.

---

## Validation

Request bodies are validated using Zod schemas in route handlers. Path and query parameters use lightweight manual checks (trimmed strings) until they are moved into shared schema validation.

```typescript
// Example: Create Issue
const createIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  labelIds: z.array(z.string().uuid()).optional(),
});
```

Validation errors return:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {
      "issues": [
        { "path": ["title"], "message": "Required" }
      ]
    }
  }
}
```
