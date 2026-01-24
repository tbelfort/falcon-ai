# Orchestration Design Document

## Overview

The orchestration engine manages issue progression through workflow stages, assigns agents, and handles the coordination of multi-agent pipelines.

## Issue State Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Issue Stage Flow                                │
│                                                                         │
│  BACKLOG ──▶ TODO ──┬──▶ CONTEXT_PACK ──▶ CONTEXT_REVIEW ──┐           │
│                     │                                       │           │
│                     │ (quick presets skip stages)           │           │
│                     │                                       ▼           │
│                     │                                    SPEC           │
│                     │                                       │           │
│                     │                                       ▼           │
│                     │                                 SPEC_REVIEW       │
│                     │                                       │           │
│                     └───────────────────────────────────────┘           │
│                                        │                                 │
│                                        ▼                                 │
│                                   IMPLEMENT                              │
│                                        │                                 │
│                                        ▼                                 │
│                                   PR_REVIEW                              │
│                                        │                                 │
│                                        ▼                                 │
│                                PR_HUMAN_REVIEW ◀───────┐                │
│                                        │                │                │
│                                        ▼                │                │
│                                     FIXER ──────────────┘ (re-review)   │
│                                        │                                 │
│                                        ▼                                 │
│                                    TESTING                               │
│                                        │                                 │
│                                        ▼                                 │
│                                  DOC_REVIEW                              │
│                                        │                                 │
│                                        ▼                                 │
│                                  MERGE_READY                             │
│                                        │                                 │
│                                        ▼                                 │
│                                      DONE                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Stage Definitions

| Stage | Description | Requires Agent | Requires Human |
|-------|-------------|----------------|----------------|
| `BACKLOG` | Issue created, not yet prioritized | No | No |
| `TODO` | Ready to start | No | No |
| `CONTEXT_PACK` | Creating context pack | Yes | No |
| `CONTEXT_REVIEW` | Reviewing context pack | Yes | No |
| `SPEC` | Writing specification | Yes | No |
| `SPEC_REVIEW` | Reviewing specification | Yes | No |
| `IMPLEMENT` | Implementing the solution | Yes | No |
| `PR_REVIEW` | Automated PR review (scouts/judge) | Yes | No |
| `PR_HUMAN_REVIEW` | Human reviews findings | No | Yes |
| `FIXER` | Fixing approved issues | Yes | No |
| `TESTING` | Running tests | Yes | No |
| `DOC_REVIEW` | Checking if docs need updates | Yes | No |
| `MERGE_READY` | Ready to merge (or has conflicts) | No | Maybe |
| `DONE` | Merged and complete | No | No |

## Stage Progression Logic

### Transition Rules

```typescript
const stageTransitions: Record<IssueStage, IssueStage[]> = {
  BACKLOG: ['TODO'],
  TODO: ['CONTEXT_PACK'],
  CONTEXT_PACK: ['CONTEXT_REVIEW'],
  CONTEXT_REVIEW: ['SPEC', 'IMPLEMENT'],  // Skip to implement if no spec needed
  SPEC: ['SPEC_REVIEW'],
  SPEC_REVIEW: ['IMPLEMENT', 'SPEC'],  // Can send back for revisions
  IMPLEMENT: ['PR_REVIEW'],
  PR_REVIEW: ['PR_HUMAN_REVIEW'],
  PR_HUMAN_REVIEW: ['FIXER', 'TESTING'],  // Skip fixer if no issues
  FIXER: ['PR_REVIEW'],  // Re-review after fixes
  TESTING: ['DOC_REVIEW', 'IMPLEMENT'],  // Can send back if tests fail
  DOC_REVIEW: ['MERGE_READY'],
  MERGE_READY: ['DONE'],
  DONE: [],
};

function canTransition(from: IssueStage, to: IssueStage): boolean {
  return stageTransitions[from]?.includes(to) ?? false;
}
```

### Preset-Based Stage Selection

```typescript
interface PresetConfig {
  stages: IssueStage[];
  models: {
    default: string;
    overrides?: Partial<Record<IssueStage, string>>;
  };
  prReview?: PRReviewConfig;
}

function getNextStage(currentStage: IssueStage, preset: PresetConfig): IssueStage | null {
  const presetStages = preset.stages;
  const currentIndex = presetStages.indexOf(currentStage);

  if (currentIndex === -1 || currentIndex === presetStages.length - 1) {
    // Not in preset stages or at the end
    if (currentStage === 'MERGE_READY') return 'DONE';
    return null;
  }

  return presetStages[currentIndex + 1];
}
```

## Agent Assignment Algorithm

```typescript
async function assignAgentToIssue(issueId: string): Promise<Agent | null> {
  const issue = await getIssue(issueId);
  const preset = await getPreset(issue.presetId);
  const requiredModel = preset.models.overrides?.[issue.stage] ?? preset.models.default;

  // 1. Find idle agent with matching model
  let agent = await findIdleAgent(issue.projectId, requiredModel);

  // 2. If no exact match, check if we can substitute
  if (!agent) {
    agent = await findIdleAgentWithFallback(issue.projectId, requiredModel);
  }

  // 3. If still no agent, check if we can provision new one
  if (!agent) {
    const canProvision = await canProvisionNewAgent(issue.projectId, requiredModel);
    if (canProvision) {
      agent = await provisionNewAgent(issue.projectId, requiredModel);
    }
  }

  // 4. If agent found, assign
  if (agent) {
    await assignIssue(agent.id, issueId);
    await updateIssue(issueId, { assignedAgentId: agent.id });
    return agent;
  }

  return null;  // No agent available, issue stays in queue
}
```

### Model Fallback Rules

```typescript
const modelFallbacks: Record<string, string[]> = {
  'claude-opus-4.5': ['claude-sonnet-4'],  // Opus can fall back to Sonnet
  'claude-sonnet-4': [],  // Sonnet has no fallback
  'claude-haiku-3.5': [],
  'codex-5.2': ['codex-5.0'],
};

async function findIdleAgentWithFallback(
  projectId: string,
  requiredModel: string
): Promise<Agent | null> {
  // Try exact match first
  let agent = await findIdleAgent(projectId, requiredModel);
  if (agent) return agent;

  // Try fallbacks
  const fallbacks = modelFallbacks[requiredModel] ?? [];
  for (const fallbackModel of fallbacks) {
    agent = await findIdleAgent(projectId, fallbackModel);
    if (agent) return agent;
  }

  return null;
}
```

## Workflow Executor

### Stage Execution Flow

```typescript
async function executeStage(issueId: string, stage: IssueStage): Promise<void> {
  const issue = await getIssue(issueId);
  const agent = await getAssignedAgent(issueId);

  // 1. Create workflow run record
  const runId = await createWorkflowRun({
    issueId,
    agentId: agent.id,
    stage,
    status: 'running',
  });

  try {
    // 2. Prepare context for agent
    const context = await prepareAgentContext(issue, stage);

    // 3. Invoke agent
    const result = await invokeAgent(agent, context, stage);

    // 4. Handle result
    await handleStageResult(issueId, stage, result);

    // 5. Update workflow run
    await updateWorkflowRun(runId, {
      status: 'completed',
      resultSummary: result.summary,
      completedAt: Date.now(),
      durationMs: result.durationMs,
      costUsd: result.costUsd,
    });

  } catch (error) {
    // Handle failure
    await updateWorkflowRun(runId, {
      status: 'failed',
      errorMessage: error.message,
      completedAt: Date.now(),
    });

    await handleStageError(issueId, stage, error);
  }
}
```

### Agent Context Preparation

```typescript
async function prepareAgentContext(issue: Issue, stage: IssueStage): Promise<AgentContext> {
  const project = await getProject(issue.projectId);
  const documents = await getIssueDocuments(issue.id);
  const stageMessages = await getStageMessages(issue.id, stage);
  const preset = await getPreset(issue.presetId);

  return {
    issue: {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      description: issue.description,
      branchName: issue.branchName,
      labels: issue.labels,
    },
    project: {
      name: project.name,
      repoUrl: project.repoUrl,
    },
    stage: {
      current: stage,
      previous: getPreviousStages(stage, preset),
      next: getNextStages(stage, preset),
    },
    documents: documents.map(d => ({
      type: d.docType,
      path: d.filePath,
      title: d.title,
    })),
    messages: stageMessages.map(m => ({
      from: m.fromStage,
      message: m.message,
      priority: m.priority,
    })),
    tools: getToolsForStage(stage),
  };
}
```

### Stage-Specific Tools

```typescript
function getToolsForStage(stage: IssueStage): string[] {
  const baseTools = ['falcon_comment', 'falcon_stage_message', 'falcon_work_complete'];

  const stageTools: Record<IssueStage, string[]> = {
    CONTEXT_PACK: [...baseTools, 'Read', 'Glob', 'Grep', 'WebSearch'],
    CONTEXT_REVIEW: [...baseTools, 'Read'],
    SPEC: [...baseTools, 'Read', 'Write'],
    SPEC_REVIEW: [...baseTools, 'Read'],
    IMPLEMENT: [...baseTools, 'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    PR_REVIEW: [...baseTools, 'Read', 'Glob', 'Grep'],
    FIXER: [...baseTools, 'Read', 'Write', 'Edit', 'Bash'],
    TESTING: [...baseTools, 'Bash', 'Read'],
    DOC_REVIEW: [...baseTools, 'Read', 'Glob', 'Write', 'Edit'],
  };

  return stageTools[stage] ?? baseTools;
}
```

## Model Preset System

### Preset Configuration

```typescript
interface PresetConfig {
  stages: IssueStage[];
  models: {
    default: string;
    overrides?: Partial<Record<IssueStage, string>>;
  };
  prReview?: {
    orchestrator: string;
    scouts: string[];
    judge: string;
  };
}
```

### Built-in Presets

```typescript
const builtInPresets: Record<string, PresetConfig> = {
  'full-pipeline': {
    stages: [
      'CONTEXT_PACK', 'CONTEXT_REVIEW', 'SPEC', 'SPEC_REVIEW',
      'IMPLEMENT', 'PR_REVIEW', 'PR_HUMAN_REVIEW', 'FIXER',
      'TESTING', 'DOC_REVIEW', 'MERGE_READY'
    ],
    models: {
      default: 'claude-sonnet-4',
      overrides: {
        CONTEXT_PACK: 'claude-opus-4.5',
        SPEC: 'claude-opus-4.5',
      }
    },
    prReview: {
      orchestrator: 'claude-opus-4.5',
      scouts: ['claude-sonnet-4', 'codex-5.2'],
      judge: 'claude-opus-4.5',
    }
  },

  'quick-fix': {
    stages: [
      'CONTEXT_PACK', 'IMPLEMENT', 'PR_REVIEW', 'PR_HUMAN_REVIEW', 'FIXER'
    ],
    models: { default: 'claude-sonnet-4' },
  },

  'docs-only': {
    stages: ['CONTEXT_PACK', 'IMPLEMENT', 'DOC_REVIEW', 'MERGE_READY'],
    models: { default: 'claude-haiku-3.5' },
  },

  'security-critical': {
    stages: [
      'CONTEXT_PACK', 'CONTEXT_REVIEW', 'SPEC', 'SPEC_REVIEW',
      'IMPLEMENT', 'PR_REVIEW', 'PR_HUMAN_REVIEW', 'FIXER',
      'TESTING', 'DOC_REVIEW', 'MERGE_READY'
    ],
    models: {
      default: 'claude-opus-4.5',
    },
    prReview: {
      orchestrator: 'claude-opus-4.5',
      scouts: ['claude-opus-4.5', 'claude-sonnet-4', 'codex-5.2'],
      judge: 'claude-opus-4.5',
    }
  },
};
```

## Branch Naming Convention

Use Haiku to generate memorable branch names:

```typescript
async function generateBranchName(issue: Issue): Promise<string> {
  const prefix = getBranchPrefix(issue);  // 'fix', 'feature', 'docs', etc.

  // Use Haiku for creative naming
  const creativePart = await invokeHaiku(
    `Generate a short (2-3 words), memorable, lowercase-hyphenated phrase for a git branch. ` +
    `The issue is: "${issue.title}". ` +
    `Example outputs: "dancing-penguin", "swift-falcon", "quiet-thunder". ` +
    `Just output the phrase, nothing else.`
  );

  return `${prefix}/${slugify(creativePart)}`;
}

function getBranchPrefix(issue: Issue): string {
  const labels = issue.labels.map(l => l.name);

  if (labels.includes('bug')) return 'fix';
  if (labels.includes('docs')) return 'docs';
  if (labels.includes('refactor')) return 'refactor';
  if (labels.includes('test')) return 'test';
  return 'feature';
}
```

## Error Handling and Recovery

### Agent Errors

```typescript
async function handleStageError(
  issueId: string,
  stage: IssueStage,
  error: Error
): Promise<void> {
  const issue = await getIssue(issueId);

  // 1. Update issue attributes
  await updateIssue(issueId, {
    attributes: {
      ...issue.attributes,
      needsHumanAttention: true,
    }
  });

  // 2. Release agent
  if (issue.assignedAgentId) {
    await updateAgent(issue.assignedAgentId, { status: 'error' });
  }

  // 3. Create notification
  await createNotification({
    type: 'stage_error',
    issueId,
    stage,
    message: error.message,
  });

  // 4. Broadcast via WebSocket
  broadcast(`project:${issue.projectId}`, 'issue_error', {
    issueId,
    stage,
    error: error.message,
  });
}
```

### Retry Logic

```typescript
interface RetryPolicy {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
}

const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 3,
  delayMs: 5000,
  backoffMultiplier: 2,
};

async function executeWithRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy = defaultRetryPolicy
): Promise<T> {
  let lastError: Error;
  let delay = policy.delayMs;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < policy.maxAttempts) {
        await sleep(delay);
        delay *= policy.backoffMultiplier;
      }
    }
  }

  throw lastError;
}
```

## Human Intervention Points

### PR_HUMAN_REVIEW Stage

This is the primary human touchpoint:

```typescript
async function handlePRHumanReview(issueId: string): Promise<void> {
  // Issue stays here until human takes action:
  // 1. Reviews findings in dashboard
  // 2. Approves/dismisses each finding
  // 3. Clicks "Launch Fixer" to continue

  // No automatic progression - human must initiate
}

async function launchFixer(issueId: string): Promise<void> {
  const issue = await getIssue(issueId);
  const approvedFindings = await getApprovedFindings(issueId);

  if (approvedFindings.length === 0) {
    // No fixes needed, skip to testing
    await transitionIssue(issueId, 'TESTING');
  } else {
    // Assign agent and run fixer
    await transitionIssue(issueId, 'FIXER');
    await assignAgentToIssue(issueId);
  }
}
```

### MERGE_READY Stage

```typescript
async function handleMergeReady(issueId: string): Promise<void> {
  const issue = await getIssue(issueId);

  // Check for merge conflicts
  const hasConflicts = await checkMergeConflicts(issue.prNumber);

  if (hasConflicts) {
    // Flag for human resolution
    await updateIssue(issueId, {
      attributes: {
        ...issue.attributes,
        needsHumanAttention: true,
        mergeConflict: true,
      }
    });
  } else {
    // Auto-merge
    await mergePR(issue.prNumber);
    await transitionIssue(issueId, 'DONE');
    await syncIdleAgents(issue.projectId);
  }
}
```

## Orchestrator Runner

Main loop that drives the system:

```typescript
class OrchestratorRunner {
  private running = false;
  private pollIntervalMs = 5000;

  async start() {
    this.running = true;
    console.log('Orchestrator started');

    while (this.running) {
      try {
        await this.processQueue();
      } catch (error) {
        console.error('Orchestrator error:', error);
      }
      await sleep(this.pollIntervalMs);
    }
  }

  async stop() {
    this.running = false;
    console.log('Orchestrator stopped');
  }

  private async processQueue() {
    // 1. Find issues ready for next stage
    const readyIssues = await findIssuesReadyForProgress();

    for (const issue of readyIssues) {
      // 2. Check if stage requires agent
      const stage = issue.stage;
      if (stageRequiresAgent(stage)) {
        // 3. Try to assign agent
        const agent = await assignAgentToIssue(issue.id);
        if (agent) {
          // 4. Execute stage
          await executeStage(issue.id, stage);
        }
        // If no agent available, issue stays in queue
      } else if (stageIsAutomatic(stage)) {
        // Handle automatic stages
        await handleAutomaticStage(issue.id, stage);
      }
      // Human-required stages wait for human action
    }

    // 5. Check for completed agents to release
    await releaseCompletedAgents();
  }
}
```
