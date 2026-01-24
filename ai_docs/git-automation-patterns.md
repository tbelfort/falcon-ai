# Git Automation Patterns

## Overview

This document covers patterns for programmatic git operations in falcon-pm agent infrastructure. Agents operate in isolated git worktrees with automated clone, checkout, commit, and push workflows.

## Library Choice: simple-git

```bash
npm install simple-git
```

`simple-git` is a lightweight interface for running git commands in Node.js. It provides:
- Promise-based API with async/await support
- Chainable operations
- Progress tracking
- TypeScript types included

## Basic Setup

```typescript
// src/pm/agents/git.ts
import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';

const defaultOptions: Partial<SimpleGitOptions> = {
  maxConcurrentProcesses: 6,
  trimmed: true,
};

export function createGit(workDir: string): SimpleGit {
  return simpleGit(workDir, defaultOptions);
}

// For operations that need progress tracking
export function createGitWithProgress(
  workDir: string,
  onProgress?: (stage: string, progress: number) => void
): SimpleGit {
  return simpleGit({
    baseDir: workDir,
    ...defaultOptions,
    progress: ({ method, stage, progress }) => {
      onProgress?.(stage, progress);
    },
  });
}
```

## Clone Operations

### Basic Clone

```typescript
export async function cloneRepo(
  repoUrl: string,
  targetDir: string,
  options?: { branch?: string; depth?: number }
): Promise<void> {
  const git = simpleGit();

  const cloneOptions: string[] = [];
  if (options?.branch) {
    cloneOptions.push('-b', options.branch);
  }
  if (options?.depth) {
    cloneOptions.push('--depth', String(options.depth));
  }

  await git.clone(repoUrl, targetDir, cloneOptions);
}
```

### Clone with Authentication

```typescript
// For HTTPS with token
export function buildAuthenticatedUrl(
  repoUrl: string,
  token: string
): string {
  const url = new URL(repoUrl);
  url.username = 'x-access-token';
  url.password = token;
  return url.toString();
}

// Usage
const authUrl = buildAuthenticatedUrl(
  'https://github.com/owner/repo.git',
  process.env.GITHUB_TOKEN!
);
await cloneRepo(authUrl, targetDir);
```

### Shallow Clone for Agents

```typescript
export async function shallowClone(
  repoUrl: string,
  targetDir: string,
  branch: string = 'main'
): Promise<void> {
  const git = simpleGit();

  await git.clone(repoUrl, targetDir, [
    '--depth', '1',
    '--single-branch',
    '-b', branch,
  ]);

  // Unshallow if needed for history access
  const localGit = simpleGit(targetDir);
  await localGit.fetch(['--unshallow']);
}
```

## Branch Operations

### Create and Checkout Branch

```typescript
export async function checkoutNewBranch(
  workDir: string,
  branchName: string,
  baseBranch: string = 'main'
): Promise<void> {
  const git = createGit(workDir);

  // Ensure we have latest base
  await git.fetch('origin', baseBranch);
  await git.checkout(baseBranch);
  await git.pull('origin', baseBranch);

  // Create and checkout new branch
  await git.checkoutLocalBranch(branchName);
}
```

### List Branches

```typescript
export async function listBranches(workDir: string) {
  const git = createGit(workDir);
  const branches = await git.branchLocal();

  return {
    current: branches.current,
    all: branches.all,
    branches: branches.branches,
  };
}
```

### Delete Branch

```typescript
export async function deleteBranch(
  workDir: string,
  branchName: string,
  force: boolean = false
): Promise<void> {
  const git = createGit(workDir);
  await git.deleteLocalBranch(branchName, force);
}
```

## Commit Operations

### Stage and Commit

```typescript
export async function commitChanges(
  workDir: string,
  message: string,
  options?: {
    files?: string[];  // Specific files, or all if omitted
    author?: { name: string; email: string };
  }
): Promise<string> {
  const git = createGit(workDir);

  // Stage files
  if (options?.files && options.files.length > 0) {
    await git.add(options.files);
  } else {
    await git.add('.');
  }

  // Check if there are changes to commit
  const status = await git.status();
  if (status.staged.length === 0) {
    throw new Error('No changes to commit');
  }

  // Commit
  const commitOptions: Record<string, string> = {};
  if (options?.author) {
    commitOptions['--author'] = `${options.author.name} <${options.author.email}>`;
  }

  const result = await git.commit(message, undefined, commitOptions);
  return result.commit;
}
```

### Amend Last Commit

```typescript
export async function amendCommit(
  workDir: string,
  newMessage?: string
): Promise<void> {
  const git = createGit(workDir);
  await git.add('.');

  const options = ['--amend'];
  if (newMessage) {
    options.push('-m', newMessage);
  } else {
    options.push('--no-edit');
  }

  await git.commit(undefined, undefined, { '--amend': null, '--no-edit': null });
}
```

## Push Operations

### Push to Remote

```typescript
export async function pushBranch(
  workDir: string,
  branchName: string,
  options?: {
    setUpstream?: boolean;
    force?: boolean;
  }
): Promise<void> {
  const git = createGit(workDir);

  const pushOptions: string[] = [];
  if (options?.setUpstream) {
    pushOptions.push('-u');
  }
  if (options?.force) {
    pushOptions.push('--force-with-lease');  // Safer than --force
  }

  await git.push('origin', branchName, pushOptions);
}
```

### Push with Retry

```typescript
export async function pushWithRetry(
  workDir: string,
  branchName: string,
  maxRetries: number = 3
): Promise<void> {
  const git = createGit(workDir);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await git.push('origin', branchName, ['-u']);
      return;
    } catch (error) {
      if (attempt === maxRetries) throw error;

      // Pull and retry on rejection
      if (error instanceof Error && error.message.includes('rejected')) {
        await git.pull('origin', branchName, ['--rebase']);
      } else {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }
}
```

## Pull and Sync

### Pull with Rebase

```typescript
export async function pullLatest(
  workDir: string,
  branchName?: string
): Promise<void> {
  const git = createGit(workDir);

  if (branchName) {
    await git.checkout(branchName);
  }

  await git.pull('origin', branchName || 'main', ['--rebase']);
}
```

### Sync Branch with Main

```typescript
export async function syncWithMain(
  workDir: string,
  mainBranch: string = 'main'
): Promise<void> {
  const git = createGit(workDir);
  const status = await git.status();
  const currentBranch = status.current;

  // Stash any changes
  const hasChanges = status.files.length > 0;
  if (hasChanges) {
    await git.stash();
  }

  // Update main
  await git.checkout(mainBranch);
  await git.pull('origin', mainBranch);

  // Rebase current branch
  await git.checkout(currentBranch!);
  await git.rebase([mainBranch]);

  // Restore changes
  if (hasChanges) {
    await git.stash(['pop']);
  }
}
```

## Status and Diff

### Get Repository Status

```typescript
export interface RepoStatus {
  branch: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  conflicted: string[];
  clean: boolean;
}

export async function getStatus(workDir: string): Promise<RepoStatus> {
  const git = createGit(workDir);
  const status = await git.status();

  return {
    branch: status.current || 'HEAD',
    tracking: status.tracking,
    ahead: status.ahead,
    behind: status.behind,
    staged: status.staged,
    modified: status.modified,
    untracked: status.not_added,
    conflicted: status.conflicted,
    clean: status.isClean(),
  };
}
```

### Get Diff Summary

```typescript
export async function getDiffSummary(
  workDir: string,
  baseBranch: string = 'main'
): Promise<{
  files: Array<{ file: string; insertions: number; deletions: number }>;
  totalInsertions: number;
  totalDeletions: number;
}> {
  const git = createGit(workDir);
  const diff = await git.diffSummary([baseBranch]);

  return {
    files: diff.files.map(f => ({
      file: f.file,
      insertions: f.insertions,
      deletions: f.deletions,
    })),
    totalInsertions: diff.insertions,
    totalDeletions: diff.deletions,
  };
}
```

## Agent Workspace Management

### Initialize Agent Workspace

```typescript
interface AgentWorkspace {
  agentId: string;
  projectId: string;
  workDir: string;
  git: SimpleGit;
}

export async function initializeAgentWorkspace(
  projectDir: string,
  agentId: string,
  repoUrl: string,
  githubToken: string
): Promise<AgentWorkspace> {
  const workDir = path.join(projectDir, 'agents', agentId);

  // Clean up if exists
  if (await fs.pathExists(workDir)) {
    await fs.remove(workDir);
  }

  // Clone repo
  const authUrl = buildAuthenticatedUrl(repoUrl, githubToken);
  await cloneRepo(authUrl, workDir);

  // Configure git
  const git = createGit(workDir);
  await git.addConfig('user.name', `falcon-agent-${agentId}`);
  await git.addConfig('user.email', `${agentId}@falcon-ai.local`);

  return {
    agentId,
    projectId: path.basename(projectDir),
    workDir,
    git,
  };
}
```

### Agent Checkout Workflow

```typescript
export async function agentCheckout(
  workspace: AgentWorkspace,
  branchName: string,
  baseBranch: string = 'main'
): Promise<void> {
  const { git, workDir } = workspace;

  // Ensure clean state
  const status = await git.status();
  if (!status.isClean()) {
    await git.reset(['--hard']);
    await git.clean('f', ['-d']);
  }

  // Fetch latest
  await git.fetch('origin');

  // Check if branch exists remotely
  const branches = await git.branch(['-r']);
  const remoteBranch = `origin/${branchName}`;

  if (branches.all.includes(remoteBranch)) {
    // Checkout existing branch
    await git.checkout(branchName);
    await git.pull('origin', branchName);
  } else {
    // Create new branch from base
    await git.checkout(baseBranch);
    await git.pull('origin', baseBranch);
    await git.checkoutLocalBranch(branchName);
  }
}
```

### Agent Commit and Push

```typescript
export async function agentCommitAndPush(
  workspace: AgentWorkspace,
  message: string,
  stage: string
): Promise<{ commit: string; pushed: boolean }> {
  const { git, agentId } = workspace;

  // Stage all changes
  await git.add('.');

  // Check for changes
  const status = await git.status();
  if (status.staged.length === 0) {
    return { commit: '', pushed: false };
  }

  // Commit with agent metadata
  const fullMessage = `${message}\n\n[falcon-agent:${agentId}][stage:${stage}]`;
  const result = await git.commit(fullMessage);

  // Push
  const branch = status.current!;
  await pushWithRetry(workspace.workDir, branch);

  return { commit: result.commit, pushed: true };
}
```

## Error Handling

```typescript
import { GitError } from 'simple-git';

export async function safeGitOperation<T>(
  operation: () => Promise<T>,
  fallback?: T
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof GitError) {
      console.error(`Git error: ${error.message}`);

      // Handle specific errors
      if (error.message.includes('not a git repository')) {
        throw new Error('Directory is not a git repository');
      }
      if (error.message.includes('CONFLICT')) {
        throw new Error('Merge conflict detected');
      }
      if (error.message.includes('Permission denied')) {
        throw new Error('Git authentication failed');
      }
    }

    if (fallback !== undefined) return fallback;
    throw error;
  }
}
```

## Configuration

```typescript
// Set git configuration
export async function configureGit(
  workDir: string,
  config: Record<string, string>
): Promise<void> {
  const git = createGit(workDir);

  for (const [key, value] of Object.entries(config)) {
    await git.addConfig(key, value, false, 'local');
  }
}

// Common configurations for agent workspaces
export const agentGitConfig = {
  'core.autocrlf': 'input',
  'core.safecrlf': 'false',
  'pull.rebase': 'true',
  'push.default': 'current',
  'fetch.prune': 'true',
};
```

## Sources

- [simple-git npm package](https://www.npmjs.com/package/simple-git)
- [simple-git GitHub](https://github.com/steveukx/git-js)
- [isomorphic-git](https://isomorphic-git.org/) - Alternative pure JS implementation
