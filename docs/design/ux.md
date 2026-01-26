# UX Design Document

## Overview

The falcon-pm dashboard is a React-based web application providing project management, agent monitoring, and PR review workflows. The design prioritizes clarity for both humans and AI agents managing the interface.

## Navigation Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  [Logo] Falcon PM    [Project Selector ▼]    [Settings] [User] │
├─────────────────────────────────────────────────────────────────┤
│  [Dashboard] [Kanban] [Agents] [PR Review] [Settings]           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                        Main Content Area                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Screen Specifications

### Dashboard (Home)

The main overview showing project health and activity.

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard                                            [Refresh] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Active: 3   │ │ Queued: 5   │ │ Review: 2   │ │ Done: 42  │ │
│  │ issues      │ │ issues      │ │ PR findings │ │ this week │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                                                                  │
│  Active Agents                                                   │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ [opus-1]  Working on #42: Fix auth bug       IMPLEMENT    │ │
│  │ [sonnet-1] Working on #38: Add logging      SPEC_REVIEW   │ │
│  │ [openai-1] Idle                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Recent Activity                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ 5m ago   #42 moved to IMPLEMENT stage                     │ │
│  │ 12m ago  #38 spec review completed                        │ │
│  │ 1h ago   #35 merged to main                               │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Kanban Board

Drag-and-drop board with columns for each status.

```
┌─────────────────────────────────────────────────────────────────┐
│  Kanban                                [Filter ▼] [+ New Issue] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│ │ Backlog  │ │   Todo   │ │In Progress│ │   Done   │            │
│ │    (8)   │ │    (5)   │ │    (3)   │ │   (42)   │            │
│ ├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤            │
│ │┌────────┐│ │┌────────┐│ │┌────────┐│ │┌────────┐│            │
│ ││ #45    ││ ││ #43    ││ ││ #42    ││ ││ #35    ││            │
│ ││Add rate││ ││Improve ││ ││Fix auth││ ││Deploy  ││            │
│ ││limiting││ ││caching ││ ││bug     ││ ││script  ││            │
│ ││        ││ ││        ││ ││        ││ ││        ││            │
│ ││[bug]   ││ ││[perf]  ││ ││[bug]   ││ ││[ops]   ││            │
│ ││        ││ ││        ││ ││IMPLEMENT││ ││        ││            │
│ ││        ││ ││        ││ ││[opus-1]││ ││        ││            │
│ │└────────┘│ │└────────┘│ │└────────┘│ │└────────┘│            │
│ │┌────────┐│ │┌────────┐│ │          │ │          │            │
│ ││ #44    ││ ││ #41    ││ │          │ │          │            │
│ ││...     ││ ││...     ││ │          │ │          │            │
│ │└────────┘│ │└────────┘│ │          │ │          │            │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Issue Card States:**
- Default: Gray border
- In Progress: Blue border, shows stage badge
- Blocked: Red border
- Has Agent: Shows agent badge

### Issue Detail Modal

Full issue view with tabs for different sections.

```
┌─────────────────────────────────────────────────────────────────┐
│  #42: Fix authentication bug                              [×]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Status: [In Progress ▼]    Stage: [IMPLEMENT]                  │
│  Priority: [High ▼]         Agent: [opus-1]                     │
│  Labels: [bug] [security] [+ Add]                               │
│  Branch: fix/auth-bug-dancing-penguin                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [Description] [Comments (5)] [Documents] [Activity] [Debug] ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │                                                              ││
│  │  Users can't log in after password reset. The session       ││
│  │  token is not being refreshed properly.                     ││
│  │                                                              ││
│  │  Steps to reproduce:                                        ││
│  │  1. Request password reset                                  ││
│  │  2. Reset password via email link                           ││
│  │  3. Try to log in with new password                         ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Workflow:                                                       │
│  [✓ CONTEXT] [✓ SPEC] [● IMPLEMENT] [○ PR_REVIEW] [○ DONE]     │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    [Start Issue]                            ││
│  │                    Preset: [Full Pipeline ▼]                ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Active Agents View

Real-time monitoring of agent activity with debug output.

```
┌─────────────────────────────────────────────────────────────────┐
│  Active Agents                                        [Refresh] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ opus-1 (claude-opus-4.5)                                   │ │
│  │ Status: Working | Issue: #42 | Stage: IMPLEMENT           │ │
│  │ Started: 5 minutes ago                                     │ │
│  │ ┌─────────────────────────────────────────────────────┐   │ │
│  │ │ Debug Output                              [Expand ↗] │   │ │
│  │ ├─────────────────────────────────────────────────────┤   │ │
│  │ │ > Reading src/auth/session.ts...                    │   │ │
│  │ │ > Found issue in refreshToken function              │   │ │
│  │ │ > Editing src/auth/session.ts                       │   │ │
│  │ │ > Running tests...                                  │   │ │
│  │ │ _                                                   │   │ │
│  │ └─────────────────────────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ sonnet-1 (claude-sonnet-4)                                 │ │
│  │ Status: Idle | Last active: 12 minutes ago                │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ openai-1 (gpt-4o)                                          │ │
│  │ Status: Idle | Last active: 1 hour ago                    │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### PR Review Screen

Human review interface for PR findings.

```
┌─────────────────────────────────────────────────────────────────┐
│  PR Review: #42 - Fix authentication bug               [View PR]│
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Summary: 5 findings (3 errors, 2 warnings)                     │
│  Scouts: gpt-4o-mini | Judge: gpt-4o                          │
│                                                                  │
│  Filter: [All ▼] [Show dismissed: ☐]                            │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ ❌ ERROR | Security | Confidence: 95%                      │ │
│  │ src/auth/session.ts:42                                     │ │
│  │                                                             │ │
│  │ Potential SQL injection in user lookup query               │ │
│  │                                                             │ │
│  │ Suggestion: Use parameterized queries instead of string    │ │
│  │ concatenation.                                              │ │
│  │                                                             │ │
│  │ Found by: claude-sonnet-4 | Confirmed by: claude-opus-4.5 │ │
│  │                                                             │ │
│  │ [Approve ✓] [Dismiss ✗]                                    │ │
│  │ Comment: [                                              ]  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ ⚠️ WARNING | Performance | Confidence: 78%                  │ │
│  │ src/auth/session.ts:67                                     │ │
│  │                                                             │ │
│  │ N+1 query detected in session validation loop              │ │
│  │ ...                                                         │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Approved: 1 | Dismissed: 1 | Pending: 3                 │   │
│  │                                                          │   │
│  │              [Launch Fixer]                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Settings Screen

Configuration for project, agents, and presets.

```
┌─────────────────────────────────────────────────────────────────┐
│  Settings                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ [Project] [Agents] [Presets] [Integrations]                 ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │                                                              ││
│  │  Agents                                                      ││
│  │                                                              ││
│  │  ┌─────────────────────────────────────────────────────┐    ││
│  │  │ Name      │ Type   │ Model           │ Status │ Actions││
│  │  ├───────────┼────────┼─────────────────┼────────┼───────┤││
│  │  │ opus-1    │ claude │ claude-opus-4.5 │ idle   │ [Edit]│││
│  │  │ sonnet-1  │ claude │ claude-sonnet-4 │ idle   │ [Edit]│││
│  │  │ openai-1  │ openai │ gpt-4o          │ idle   │ [Edit]│││
│  │  └─────────────────────────────────────────────────────┘    ││
│  │                                                              ││
│  │  [+ Add Agent]                                               ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Library

### IssueCard

Compact card for Kanban board.

```typescript
interface IssueCardProps {
  issue: Issue;
  isDragging?: boolean;
  onClick?: () => void;
}
```

Visual states:
- Default: White bg, gray border
- Dragging: Shadow, slight opacity
- Working: Blue left border, stage badge visible
- Blocked: Red left border

### AgentBadge

Shows agent status inline.

```typescript
interface AgentBadgeProps {
  agent: Agent;
  size?: 'sm' | 'md';
  showStatus?: boolean;
}
```

States:
- Idle: Gray dot
- Working: Green pulsing dot
- Error: Red dot

### ModelSelector

Dropdown for selecting models per stage.

```typescript
interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  availableModels: Model[];
  stage?: string;  // Context for recommendations
}
```

### StageBadge

Shows current workflow stage.

```typescript
interface StageBadgeProps {
  stage: IssueStage;
  compact?: boolean;
}
```

Color coding:
- Prep stages (CONTEXT, SPEC): Blue
- Implementation: Yellow
- Review stages: Purple
- Done: Green

### FindingCard

PR review finding with actions.

```typescript
interface FindingCardProps {
  finding: PRFinding;
  onApprove: () => void;
  onDismiss: () => void;
  onComment: (comment: string) => void;
}
```

### DebugOutput

Terminal-style output viewer.

```typescript
interface DebugOutputProps {
  agentId: string;
  maxLines?: number;  // Default 1000
  autoScroll?: boolean;
}
```

Features:
- Auto-scroll to bottom
- Copy button
- Expand/collapse
- Clear button

### WorkflowProgress

Visual progress through stages.

```typescript
interface WorkflowProgressProps {
  stages: IssueStage[];
  currentStage: IssueStage;
  completedStages: IssueStage[];
}
```

## User Flows

### Start Issue Flow

1. User opens issue from Kanban (backlog/todo)
2. Issue detail modal opens
3. User selects preset from dropdown
4. User clicks "Start Issue"
5. System generates branch name (via Haiku)
6. System moves to TODO status
7. Orchestrator picks up and assigns agent
8. Issue card updates with agent badge and stage

### PR Review Approval Flow

1. Issue reaches PR_HUMAN_REVIEW stage
2. User navigates to PR Review screen
3. User sees all findings listed
4. For each finding:
   - Review details and suggestion
   - Click Approve (valid) or Dismiss (false positive)
   - Optionally add comment
5. When ready, click "Launch Fixer"
6. Fixer agent runs on approved findings
7. Re-review triggered automatically

### Agent Stuck Flow

1. Agent error detected by orchestrator
2. Issue card shows red border
3. Toast notification appears
4. User clicks notification → Issue detail
5. User views Debug tab for error details
6. Options:
   - Retry: Re-run current stage
   - Skip: Move to next stage (with warning)
   - Pause: Hold for manual intervention

## Real-Time Update Patterns

### Optimistic Updates

```typescript
// When user drags issue
const onDragEnd = async (result: DropResult) => {
  // Optimistically update UI
  updateIssueOptimistic(issueId, { status: newStatus });

  try {
    await api.issues.update(issueId, { status: newStatus });
  } catch (error) {
    // Revert on failure
    revertOptimisticUpdate();
    toast.error('Failed to move issue');
  }
};
```

### WebSocket Integration

```typescript
// Subscribe to relevant channels
useEffect(() => {
  subscribe(`project:${projectId}`);
  subscribe(`issue:${selectedIssueId}`);

  return () => {
    unsubscribe(`project:${projectId}`);
    unsubscribe(`issue:${selectedIssueId}`);
  };
}, [projectId, selectedIssueId]);

// Handle events
onMessage((data) => {
  if (data.event === 'stage_changed') {
    updateIssueInStore(data.data.issueId, { stage: data.data.stage });
  }
  if (data.event === 'output') {
    appendDebugOutput(data.data.content);
  }
});
```

## Responsive Considerations

- **Desktop-first**: Primary use case is developer workstations
- **Minimum width**: 1024px
- **Kanban columns**: Collapse to single column on narrow screens
- **Debug output**: Full-screen mode on mobile

## Accessibility

- Keyboard navigation for Kanban (arrow keys)
- Focus indicators on all interactive elements
- ARIA labels for status badges
- Screen reader announcements for real-time updates

## Error Handling Patterns

The dashboard uses callback-based error handling for user-facing operations:

### Callback-Based Errors (User-Facing Operations)
For operations where the user needs to see feedback, errors are passed via callback:

```typescript
// Stage transitions
moveIssueStage(issueId, stage, (errorMessage) => {
  showErrorBanner(errorMessage);
});

// Label updates (also user-facing)
updateLabels(issueId, labelIds, (errorMessage) => {
  showErrorBanner(errorMessage);
});
```

This allows the UI to display error banners that the user can dismiss.

**Note:** Label updates ARE user-facing operations and should use error callbacks when possible. If no callback is provided, errors are logged to console as a fallback.

### Error Message Fallback Convention

When extracting error messages from caught errors, use this pattern:

```typescript
const message = error instanceof Error ? error.message : 'Operation failed';
```

This ensures a user-friendly message is always available even for non-Error exceptions.

### API Request Timeout

All API requests have a 30-second timeout. When a request times out:
- The fetch is aborted via `AbortSignal.timeout(30000)`
- An `AbortError` is thrown
- The UI should display an appropriate error message (e.g., "Request timed out")

## Issue List Refresh Strategy

When issues change, the dashboard uses a **full reload** strategy:

1. When a project is selected, all issues are fetched via `GET /api/issues?projectId=X`
2. WebSocket events trigger issue updates in the store via `replaceIssue()`
3. Optimistic updates are applied immediately, then reconciled with server response
4. On error, optimistic updates are rolled back to the original state

This approach was chosen over granular updates for simplicity and to avoid stale data issues.

## Kanban Column Order (STAGE_ORDER)

Columns are displayed in a fixed order defined in `utils/stages.ts`:

```typescript
const STAGE_ORDER: IssueStage[] = [
  'BACKLOG',
  'TODO',
  'CONTEXT_PACK',
  'CONTEXT_REVIEW',
  'SPEC',
  'SPEC_REVIEW',
  'IMPLEMENT',
  'PR_REVIEW',
  'PR_HUMAN_REVIEW',
  'FIXER',
  'TESTING',
  'DOC_REVIEW',
  'MERGE_READY',
  'DONE',
];
```

Each stage has associated styling (background and text colors) defined in `getStageTone()`.

The Kanban board filters visible columns based on user preferences, but maintains this ordering.
