# Agent Lifecycle Design Document

## Overview

This document defines how agents are provisioned, managed, and coordinated in falcon-pm. Each agent operates in an isolated git worktree with automated state management.

## Agent States

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent State Machine                       │
│                                                                  │
│    ┌────────┐                                                    │
│    │  INIT  │ (Agent registered, workspace not ready)           │
│    └────┬───┘                                                    │
│         │ provision()                                            │
│         ▼                                                        │
│    ┌────────┐     assignIssue()     ┌──────────┐                │
│    │  IDLE  │─────────────────────▶│ CHECKOUT │                │
│    └────────┘                       └────┬─────┘                │
│         ▲                                │ checkoutComplete()   │
│         │                                ▼                       │
│         │                          ┌──────────┐                 │
│         │  workComplete()          │ WORKING  │                 │
│         │  releaseAgent()          └────┬─────┘                 │
│         │                               │                        │
│         │         ┌─────────────────────┴─────────────────┐     │
│         │         │                                        │     │
│         │         ▼                                        ▼     │
│         │    ┌──────────┐                            ┌────────┐ │
│         └────│   DONE   │                            │  ERROR │ │
│              └──────────┘                            └────────┘ │
│                                                           │      │
│                               recover() or releaseAgent()│      │
│                                          ┌───────────────┘      │
│                                          │                       │
│                                          ▼                       │
│                                     ┌────────┐                  │
│                                     │  IDLE  │                  │
│                                     └────────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### State Definitions

| State | Description |
|-------|-------------|
| `INIT` | Agent registered, workspace provisioning in progress |
| `IDLE` | Ready to accept work, workspace on latest main |
| `CHECKOUT` | Checking out issue branch |
| `WORKING` | Actively executing a stage |
| `DONE` | Work complete, awaiting release |
| `ERROR` | Error occurred, requires intervention |

## Agent Provisioning Workflow

### 1. Registration

```typescript
// User adds agent via dashboard
POST /api/projects/:projectId/agents
{
  "name": "opus-1",
  "agentType": "claude",
  "model": "claude-opus-4.5"
}
```

### 2. Workspace Initialization

```
~/.falcon/projects/<project>/agents/<agent-name>/
├── .git/              # Git repository
├── src/               # Cloned project files
├── .falcon/           # Falcon configuration (symlinked to primary)
└── node_modules/      # Dependencies (symlinked if large)
```

```typescript
async function provisionAgent(projectId: string, agentName: string) {
  const project = await getProject(projectId);
  const agentDir = path.join(FALCON_HOME, 'projects', project.slug, 'agents', agentName);

  // 1. Clone repository
  await git.clone(project.repoUrl, agentDir, {
    depth: 1,  // Shallow clone initially
    branch: project.defaultBranch,
  });

  // 2. Unshallow for history access
  await git(agentDir).fetch(['--unshallow']);

  // 3. Configure git identity
  await git(agentDir).addConfig('user.name', `falcon-agent-${agentName}`);
  await git(agentDir).addConfig('user.email', `${agentName}@falcon-ai.local`);

  // 4. Setup symlinks for large files
  await setupSymlinks(agentDir, project);

  // 5. Update agent status
  await updateAgent(agentId, { status: 'idle', workDir: agentDir });
}
```

### 3. Symlink Strategy for Large Files

```typescript
// Primary directory contains shared large files
const primaryDir = path.join(projectDir, 'primary');

// Symlink patterns
const symlinkPaths = [
  'node_modules',
  '.falcon/CORE',
  'vendor',
  'build',  // If not tracked
];

async function setupSymlinks(agentDir: string, project: Project) {
  for (const relPath of symlinkPaths) {
    const primaryPath = path.join(primaryDir, relPath);
    const agentPath = path.join(agentDir, relPath);

    if (await fs.pathExists(primaryPath)) {
      await fs.remove(agentPath);  // Remove if exists
      await fs.symlink(primaryPath, agentPath, 'junction');
    }
  }
}
```

## Git-Sync Layer Behaviors

The `src/pm/agents/git-sync.ts` module provides low-level git operations. Key behaviors:

| Function | Behavior |
|----------|----------|
| `cloneAgentRepository()` | Throws immediately if worktreePath exists (fail-fast, no silent overwrite) |
| `checkoutIssueBranch()` | Checks local branches only (`branchLocal()`), not remote. Throws if worktree has uncommitted changes. |
| `syncIdleAgentToBase()` | Throws if worktree has uncommitted changes before checkout |
| `commitAndPushAgentWork()` | Default staging uses `git add -A` (includes deletions) when `files` not specified |

**Note on reset --hard:** The git-sync layer (Phase 3) intentionally omits `reset --hard` operations. Higher-level orchestration code (shown in examples below) may use reset for recovery scenarios, but the git-sync primitives preserve uncommitted work by throwing errors instead.

## Clone Failure Cleanup

If `cloneAgentRepository()` fails during clone or unshallow, it performs cleanup:

```typescript
try {
  await git.clone(...);
  await git.fetch(['--unshallow']);
} catch (error) {
  // Clean up partial clone on failure
  await fs.rm(worktreePath, { recursive: true, force: true });
  throw wrapGitError(error);
}
```

This ensures no partial/corrupted worktrees are left behind after failures.

## Symlink Helpers

The `safeSymlink()` function in `provisioner.ts` is idempotent:
- Skips silently if target doesn't exist
- Skips silently if link already exists (verified via `isSymbolicLink()` check)
- Skips silently if path exists but is not a symlink (won't overwrite regular files/dirs)
- Swallows errors on symlink creation failure (best-effort)

This allows provisioning to succeed even when symlinks cannot be created (e.g., permission issues).

## Provisioner Defaults

The `provisionAgent()` function has the following defaults:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `baseBranch` | `'main'` | Branch to clone and track |
| `enableSymlinks` | `true` | Whether to create symlinks for shared resources (node_modules, .falcon/CORE) |

When `enableSymlinks: true`, the provisioner attempts to symlink `node_modules` and `.falcon/CORE` from the primary directory to save disk space across multiple agent worktrees.

## Git Operations Per State

### IDLE → CHECKOUT

```typescript
async function assignIssue(agentId: string, issueId: string) {
  const agent = await getAgent(agentId);
  const issue = await getIssue(issueId);
  const git = createGit(agent.workDir);

  // 1. Update agent state
  await updateAgent(agentId, {
    status: 'checkout',
    currentIssueId: issueId,
    currentStage: issue.stage,
  });

  // 2. Ensure clean state
  const status = await git.status();
  if (!status.isClean()) {
    await git.reset(['--hard']);
    await git.clean('f', ['-d']);
  }

  // 3. Fetch latest
  await git.fetch('origin');

  // 4. Checkout or create branch
  if (await branchExistsRemote(git, issue.branchName)) {
    await git.checkout(issue.branchName);
    await git.pull('origin', issue.branchName, ['--rebase']);
  } else {
    await git.checkout('main');
    await git.pull('origin', 'main');
    await git.checkoutLocalBranch(issue.branchName);
  }

  // 5. Transition to WORKING
  await updateAgent(agentId, { status: 'working' });
}
```

### WORKING State

While in WORKING state:
- Agent executes stage task via Claude Code / OpenAI
- Agent can commit changes
- Agent cannot be reassigned

```typescript
async function commitAgentWork(agentId: string, message: string) {
  const agent = await getAgent(agentId);
  const git = createGit(agent.workDir);

  await git.add('.');

  const status = await git.status();
  if (status.staged.length > 0) {
    const fullMessage = `${message}\n\n[falcon-agent:${agent.name}][stage:${agent.currentStage}]`;
    await git.commit(fullMessage);
    await git.push('origin', status.current, ['-u']);
  }
}
```

### WORKING → DONE

```typescript
async function completeWork(agentId: string, summary: string) {
  const agent = await getAgent(agentId);
  const git = createGit(agent.workDir);

  // 1. Final commit and push
  await commitAgentWork(agentId, summary);

  // 2. Update state
  await updateAgent(agentId, {
    status: 'done',
    lastActiveAt: Date.now(),
  });

  // 3. Log workflow run
  await createWorkflowRun({
    issueId: agent.currentIssueId,
    agentId,
    stage: agent.currentStage,
    status: 'completed',
    resultSummary: summary,
  });
}
```

### DONE → IDLE (Release)

```typescript
async function releaseAgent(agentId: string) {
  const agent = await getAgent(agentId);
  const git = createGit(agent.workDir);

  // 1. Checkout main and pull latest
  await git.checkout('main');
  await git.pull('origin', 'main');

  // 2. Clean up
  await git.clean('f', ['-d']);

  // 3. Update agent
  await updateAgent(agentId, {
    status: 'idle',
    currentIssueId: null,
    currentStage: null,
    totalTasksCompleted: agent.totalTasksCompleted + 1,
  });
}
```

### ERROR Recovery

```typescript
async function recoverAgent(agentId: string) {
  const agent = await getAgent(agentId);
  const git = createGit(agent.workDir);

  // 1. Hard reset to clean state
  await git.reset(['--hard', 'HEAD']);
  await git.clean('f', ['-d', '-x']);

  // 2. Return to main
  await git.checkout('main');
  await git.pull('origin', 'main');

  // 3. Update state
  await updateAgent(agentId, {
    status: 'idle',
    currentIssueId: null,
    currentStage: null,
  });
}
```

## Subscription Slot Management

Agents are tied to subscription slots, not API keys.

```typescript
interface Subscription {
  id: string;
  type: 'claude' | 'openai';
  name: string;
  maxConcurrent: number;  // Usually 1 per subscription
  currentlyUsing: number;
}

// When assigning agent
async function canAssignAgent(agent: Agent): Promise<boolean> {
  const subscription = await getSubscription(agent.subscriptionId);
  return subscription.currentlyUsing < subscription.maxConcurrent;
}

// Track usage
async function reserveSlot(subscriptionId: string) {
  await db.update(subscriptions)
    .set({ currentlyUsing: sql`currentlyUsing + 1` })
    .where(eq(subscriptions.id, subscriptionId));
}

async function releaseSlot(subscriptionId: string) {
  await db.update(subscriptions)
    .set({ currentlyUsing: sql`currentlyUsing - 1` })
    .where(eq(subscriptions.id, subscriptionId));
}
```

## Agent Availability Tracking

```typescript
interface AgentAvailability {
  agentId: string;
  name: string;
  type: 'claude' | 'openai';
  model: string;
  status: AgentStatus;
  availableAt?: Date;  // Estimated completion time
}

async function getAvailableAgent(
  projectId: string,
  requiredModel: string
): Promise<Agent | null> {
  // 1. Find idle agents matching model
  const idleAgents = await db.select()
    .from(agents)
    .where(and(
      eq(agents.projectId, projectId),
      eq(agents.model, requiredModel),
      eq(agents.status, 'idle')
    ));

  if (idleAgents.length > 0) {
    return idleAgents[0];
  }

  // 2. Check if we can provision a new agent
  const subscription = await getAvailableSubscription(requiredModel);
  if (subscription && await canProvisionAgent(projectId)) {
    return await provisionNewAgent(projectId, requiredModel);
  }

  return null;  // No agent available
}
```

## Sync All Agents on Merge

When an issue is merged to main, all idle agents should pull latest:

```typescript
async function syncIdleAgents(projectId: string) {
  const idleAgents = await db.select()
    .from(agents)
    .where(and(
      eq(agents.projectId, projectId),
      eq(agents.status, 'idle')
    ));

  await Promise.all(idleAgents.map(async (agent) => {
    const git = createGit(agent.workDir);
    await git.checkout('main');
    await git.pull('origin', 'main');
  }));
}
```

## Agent Health Checks

```typescript
async function checkAgentHealth(agentId: string): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const agent = await getAgent(agentId);
  const issues: string[] = [];

  // 1. Check workspace exists
  if (!await fs.pathExists(agent.workDir)) {
    issues.push('Workspace directory missing');
  }

  // 2. Check git status
  try {
    const git = createGit(agent.workDir);
    await git.status();
  } catch (error) {
    issues.push('Git repository corrupted');
  }

  // 3. Check symlinks
  for (const symlinkPath of symlinkPaths) {
    const fullPath = path.join(agent.workDir, symlinkPath);
    if (await fs.pathExists(fullPath)) {
      const stats = await fs.lstat(fullPath);
      if (!stats.isSymbolicLink()) {
        issues.push(`${symlinkPath} is not a symlink`);
      }
    }
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}
```

## Folder Structure Management

### Project Layout

```
~/.falcon/
├── config.yaml                    # Global config
├── pm.db                          # SQLite database
└── projects/
    └── my-project/
        ├── config.yaml            # Project config
        ├── primary/               # Shared large files
        │   ├── node_modules/
        │   └── .falcon/CORE/
        ├── agents/
        │   ├── opus-1/            # Agent worktree
        │   │   ├── .git/
        │   │   ├── src/
        │   │   └── node_modules → ../../primary/node_modules
        │   ├── opus-2/
        │   └── sonnet-1/
        └── issues/
            └── <issue-id>/
                ├── context/       # Context pack files
                ├── specs/         # Specification files
                └── ai_docs/       # Issue-specific research
```

### Issue Artifacts

```typescript
async function getIssueArtifactsPath(issueId: string) {
  const issue = await getIssue(issueId);
  const project = await getProject(issue.projectId);

  return {
    context: path.join(FALCON_HOME, 'projects', project.slug, 'issues', issueId, 'context'),
    specs: path.join(FALCON_HOME, 'projects', project.slug, 'issues', issueId, 'specs'),
    aiDocs: path.join(FALCON_HOME, 'projects', project.slug, 'issues', issueId, 'ai_docs'),
  };
}
```

## CLI Commands

```bash
# Add agent to project
falcon pm agent add opus-1 --project my-project --type claude --model claude-opus-4.5

# List agents
falcon pm agent list --project my-project

# Check agent status
falcon pm agent status opus-1

# Remove agent
falcon pm agent remove opus-1 --project my-project

# Sync all idle agents
falcon pm agent sync --project my-project

# Recover stuck agent
falcon pm agent recover opus-1
```
