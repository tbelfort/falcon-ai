# API Design Document

## Overview

The falcon-pm API is a REST API built with Express.js, running on port 3002. It provides endpoints for project management, issue tracking, agent coordination, and orchestration control.

## Base URL

```
http://localhost:3002/api
```

## Authentication

All API requests require a shared token.

- Set `PM_API_TOKEN` in the environment
- Send `Authorization: Bearer <token>` (preferred) or `X-API-Key: <token>`
- WebSocket clients pass the same token via `ws://.../ws?token=<token>`

## CORS

Allowed origins are configured via `PM_API_ALLOWED_ORIGINS` (comma-separated). Originless requests are allowed for non-browser clients.

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

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `CONFLICT` | 409 | Resource conflict (duplicate) |
| `AGENT_BUSY` | 409 | Agent is already working |
| `INVALID_TRANSITION` | 400 | Invalid stage transition |
| `INTERNAL_ERROR` | 500 | Server error |

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
      "createdAt": "2024-01-20T...",
      "updatedAt": "2024-01-20T...",
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
GET /api/issues?projectId=<projectId>
```

**Query Parameters:**
- `projectId` (string, required): Project ID

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
      "createdAt": "2024-01-20T...",
      "updatedAt": "2024-01-20T..."
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
POST /api/issues
```

**Request Body:**
```json
{
  "projectId": "uuid",
  "title": "Fix authentication bug",
  "description": "Users can't log in after password reset",
  "priority": "high"
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

Branch naming: `issue/<number>-<kebab-title>`, where kebab-case lowercases, replaces non `a-z0-9` with `-`, and trims leading/trailing dashes (non-ASCII characters collapse to dashes).

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
        "lastActiveAt": "2024-01-20T..."
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
    "startedAt": "2024-01-20T..."
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
    "startedAt": "2024-01-20T...",
    "completedAt": "2024-01-20T...",
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
ws://localhost:3002/ws?token=<auth-token>
```

**Limits:**
- Max payload: 64KB
- Max connections per IP: 20
- Max subscriptions per client: 100

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
- `project:<projectId>` - Project-wide events
- `issue:<id>` - Issue updates
- `agent:<name>` - Agent status and output

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

## Validation

Requests are validated by API helpers with the following rules:

- Strings are trimmed; required strings reject empty/whitespace-only input
- Optional strings reject empty input when provided; use `null` to clear nullable fields
- Numbers must be finite (`Number.isFinite`), with integer/range checks where defined
- Request body size limit: 1MB (`express.json({ limit: '1mb' })`)
- PATCH semantics: only fields present in the JSON body are updated
- Label IDs are deduplicated and must belong to the same project
- Document `filePath` must be relative and must not include `..` segments or backslashes
- Project `config` must be a plain JSON object (no functions/Date/etc); forbidden keys are rejected

Common max lengths:

- Project name: 200
- Project slug: 100
- Project description: 2000
- Issue title: 200
- Issue description: 5000
- Label name: 100
- Comment content: 5000
- Document title: 200
- Document filePath: 500
