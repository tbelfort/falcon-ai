# GitHub API Patterns with Octokit

## Overview

This document covers patterns for GitHub API integration in falcon-pm, including PR creation, comments, reviews, and merge operations using Octokit.

## Installation

```bash
npm install @octokit/rest @octokit/types
```

## Client Setup

```typescript
// src/pm/github/client.ts
import { Octokit } from '@octokit/rest';

export function createOctokit(token: string): Octokit {
  return new Octokit({
    auth: token,
    userAgent: 'falcon-pm/1.0.0',
  });
}

// Singleton for app-wide use
let octokit: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!octokit) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN not configured');
    octokit = createOctokit(token);
  }
  return octokit;
}
```

## Repository Operations

### Parse Repo URL

```typescript
export function parseRepoUrl(url: string): { owner: string; repo: string } {
  // Handle various formats:
  // https://github.com/owner/repo.git
  // git@github.com:owner/repo.git
  // owner/repo

  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  const shortMatch = url.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  throw new Error(`Invalid GitHub repo URL: ${url}`);
}
```

### Get Repository Info

```typescript
export async function getRepoInfo(owner: string, repo: string) {
  const octokit = getOctokit();

  const { data } = await octokit.rest.repos.get({ owner, repo });

  return {
    defaultBranch: data.default_branch,
    private: data.private,
    allowSquashMerge: data.allow_squash_merge,
    allowMergeCommit: data.allow_merge_commit,
    allowRebaseMerge: data.allow_rebase_merge,
  };
}
```

## Pull Request Operations

### Create Pull Request

```typescript
interface CreatePROptions {
  owner: string;
  repo: string;
  title: string;
  body: string;
  head: string;  // Branch with changes
  base: string;  // Target branch (usually main)
  draft?: boolean;
}

export async function createPullRequest(options: CreatePROptions) {
  const octokit = getOctokit();

  const { data: pr } = await octokit.rest.pulls.create({
    owner: options.owner,
    repo: options.repo,
    title: options.title,
    body: options.body,
    head: options.head,
    base: options.base,
    draft: options.draft ?? false,
  });

  return {
    number: pr.number,
    url: pr.html_url,
    nodeId: pr.node_id,
    state: pr.state,
    mergeable: pr.mergeable,
  };
}
```

### Get Pull Request

```typescript
export async function getPullRequest(
  owner: string,
  repo: string,
  prNumber: number
) {
  const octokit = getOctokit();

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    draft: pr.draft,
    mergeable: pr.mergeable,
    mergeableState: pr.mergeable_state,
    head: {
      ref: pr.head.ref,
      sha: pr.head.sha,
    },
    base: {
      ref: pr.base.ref,
      sha: pr.base.sha,
    },
    user: pr.user?.login,
    url: pr.html_url,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
  };
}
```

### Update Pull Request

```typescript
export async function updatePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  updates: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    base?: string;
  }
) {
  const octokit = getOctokit();

  const { data: pr } = await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    ...updates,
  });

  return pr;
}
```

### List Pull Requests

```typescript
export async function listPullRequests(
  owner: string,
  repo: string,
  options?: {
    state?: 'open' | 'closed' | 'all';
    head?: string;  // Filter by head branch
    base?: string;  // Filter by base branch
  }
) {
  const octokit = getOctokit();

  const { data: prs } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: options?.state ?? 'open',
    head: options?.head,
    base: options?.base,
    per_page: 100,
  });

  return prs.map(pr => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft,
    head: pr.head.ref,
    base: pr.base.ref,
    url: pr.html_url,
    user: pr.user?.login,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
  }));
}
```

### Merge Pull Request

```typescript
type MergeMethod = 'merge' | 'squash' | 'rebase';

export async function mergePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  options?: {
    method?: MergeMethod;
    commitTitle?: string;
    commitMessage?: string;
  }
) {
  const octokit = getOctokit();

  // Check if mergeable first
  const pr = await getPullRequest(owner, repo, prNumber);
  if (!pr.mergeable) {
    throw new Error(`PR #${prNumber} is not mergeable: ${pr.mergeableState}`);
  }

  const { data: result } = await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: prNumber,
    merge_method: options?.method ?? 'squash',
    commit_title: options?.commitTitle,
    commit_message: options?.commitMessage,
  });

  return {
    merged: result.merged,
    sha: result.sha,
    message: result.message,
  };
}
```

## Comments

### Create Issue/PR Comment

```typescript
// Note: PRs are issues in GitHub, so we use issues.createComment
export async function createComment(
  owner: string,
  repo: string,
  issueNumber: number,  // Also works for PR numbers
  body: string
) {
  const octokit = getOctokit();

  const { data: comment } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });

  return {
    id: comment.id,
    url: comment.html_url,
    body: comment.body,
    createdAt: comment.created_at,
  };
}
```

### Update Comment

```typescript
export async function updateComment(
  owner: string,
  repo: string,
  commentId: number,
  body: string
) {
  const octokit = getOctokit();

  const { data: comment } = await octokit.rest.issues.updateComment({
    owner,
    repo,
    comment_id: commentId,
    body,
  });

  return comment;
}
```

### Find Bot Comment (Upsert Pattern)

```typescript
export async function upsertBotComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
  identifier: string  // Unique marker to find existing comment
) {
  const octokit = getOctokit();

  // List existing comments
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
  });

  // Find existing bot comment with identifier
  const existingComment = comments.find(c =>
    c.body?.includes(`<!-- falcon-bot:${identifier} -->`)
  );

  const bodyWithMarker = `<!-- falcon-bot:${identifier} -->\n${body}`;

  if (existingComment) {
    return updateComment(owner, repo, existingComment.id, bodyWithMarker);
  } else {
    return createComment(owner, repo, issueNumber, bodyWithMarker);
  }
}
```

## PR Reviews

### Create Review

```typescript
type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

export async function createReview(
  owner: string,
  repo: string,
  prNumber: number,
  options: {
    body?: string;
    event: ReviewEvent;
    comments?: Array<{
      path: string;
      line: number;  // Line number in the diff
      body: string;
    }>;
  }
) {
  const octokit = getOctokit();

  const { data: review } = await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    body: options.body,
    event: options.event,
    comments: options.comments,
  });

  return {
    id: review.id,
    state: review.state,
    url: review.html_url,
  };
}
```

### Create Review Comment on Specific Line

```typescript
export async function createReviewComment(
  owner: string,
  repo: string,
  prNumber: number,
  options: {
    body: string;
    path: string;        // File path
    commitId: string;    // The SHA of the commit to comment on
    line: number;        // Line number in the new version
    side?: 'LEFT' | 'RIGHT';  // LEFT for deletions, RIGHT for additions
  }
) {
  const octokit = getOctokit();

  const { data: comment } = await octokit.rest.pulls.createReviewComment({
    owner,
    repo,
    pull_number: prNumber,
    body: options.body,
    path: options.path,
    commit_id: options.commitId,
    line: options.line,
    side: options.side ?? 'RIGHT',
  });

  return {
    id: comment.id,
    url: comment.html_url,
  };
}
```

## PR Files and Diff

### Get Changed Files

```typescript
export async function getChangedFiles(
  owner: string,
  repo: string,
  prNumber: number
) {
  const octokit = getOctokit();

  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });

  return files.map(file => ({
    filename: file.filename,
    status: file.status as 'added' | 'removed' | 'modified' | 'renamed',
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch,
    previousFilename: file.previous_filename,
  }));
}
```

## Checks and Status

### Get PR Check Runs

```typescript
export async function getPRChecks(
  owner: string,
  repo: string,
  ref: string  // Branch name or commit SHA
) {
  const octokit = getOctokit();

  const { data } = await octokit.rest.checks.listForRef({
    owner,
    repo,
    ref,
  });

  return data.check_runs.map(check => ({
    id: check.id,
    name: check.name,
    status: check.status,
    conclusion: check.conclusion,
    startedAt: check.started_at,
    completedAt: check.completed_at,
    url: check.html_url,
  }));
}
```

### Create Check Run

```typescript
export async function createCheckRun(
  owner: string,
  repo: string,
  options: {
    name: string;
    headSha: string;
    status: 'queued' | 'in_progress' | 'completed';
    conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped';
    title?: string;
    summary?: string;
    text?: string;
  }
) {
  const octokit = getOctokit();

  const { data: check } = await octokit.rest.checks.create({
    owner,
    repo,
    name: options.name,
    head_sha: options.headSha,
    status: options.status,
    conclusion: options.conclusion,
    output: options.title ? {
      title: options.title,
      summary: options.summary ?? '',
      text: options.text,
    } : undefined,
  });

  return check;
}
```

## Falcon-PM Integration Patterns

### Post PR Review Findings

```typescript
interface PRFinding {
  type: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export async function postPRFindings(
  owner: string,
  repo: string,
  prNumber: number,
  findings: PRFinding[]
) {
  const pr = await getPullRequest(owner, repo, prNumber);

  // Group findings by type
  const errors = findings.filter(f => f.type === 'error');
  const warnings = findings.filter(f => f.type === 'warning');

  // Build summary comment
  const summary = [
    '## Falcon PR Review',
    '',
    `Found **${errors.length}** errors and **${warnings.length}** warnings.`,
    '',
    ...findings.map(f => {
      const location = f.line ? `${f.file}:${f.line}` : f.file;
      const icon = f.type === 'error' ? ':x:' : f.type === 'warning' ? ':warning:' : ':information_source:';
      return `${icon} **${location}**: ${f.message}`;
    }),
  ].join('\n');

  // Post summary comment
  await upsertBotComment(owner, repo, prNumber, summary, 'pr-review');

  // Create inline review comments for line-specific findings
  const lineFindings = findings.filter(f => f.line);
  if (lineFindings.length > 0) {
    await createReview(owner, repo, prNumber, {
      event: errors.length > 0 ? 'REQUEST_CHANGES' : 'COMMENT',
      body: 'Falcon automated review',
      comments: lineFindings.map(f => ({
        path: f.file,
        line: f.line!,
        body: `**${f.type.toUpperCase()}**: ${f.message}${f.suggestion ? `\n\nSuggestion: ${f.suggestion}` : ''}`,
      })),
    });
  }
}
```

### Auto-Create PR from Agent Work

```typescript
export async function createAgentPR(
  owner: string,
  repo: string,
  branchName: string,
  issueNumber: number,
  issueTitle: string,
  summary: string
) {
  const body = [
    `## Summary`,
    summary,
    '',
    `## Related Issue`,
    `Closes #${issueNumber}`,
    '',
    '---',
    '*This PR was created automatically by falcon-pm*',
  ].join('\n');

  const pr = await createPullRequest({
    owner,
    repo,
    title: `[Falcon] ${issueTitle}`,
    body,
    head: branchName,
    base: 'main',
    draft: false,
  });

  return pr;
}
```

### Wait for PR Checks

```typescript
export async function waitForPRChecks(
  owner: string,
  repo: string,
  ref: string,
  options?: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  }
): Promise<{ success: boolean; checks: any[] }> {
  const timeout = options?.timeoutMs ?? 10 * 60 * 1000;  // 10 min default
  const pollInterval = options?.pollIntervalMs ?? 10000;  // 10s default
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const checks = await getPRChecks(owner, repo, ref);

    const pending = checks.filter(c => c.status !== 'completed');
    if (pending.length === 0) {
      const failed = checks.filter(c => c.conclusion !== 'success' && c.conclusion !== 'skipped');
      return {
        success: failed.length === 0,
        checks,
      };
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error('Timed out waiting for PR checks');
}
```

## Error Handling

```typescript
import { RequestError } from '@octokit/request-error';

export async function safeGitHubOperation<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof RequestError) {
      switch (error.status) {
        case 401:
          throw new Error('GitHub authentication failed');
        case 403:
          throw new Error('GitHub rate limit exceeded or insufficient permissions');
        case 404:
          throw new Error('GitHub resource not found');
        case 422:
          throw new Error(`GitHub validation failed: ${error.message}`);
        default:
          throw new Error(`GitHub API error: ${error.message}`);
      }
    }
    throw error;
  }
}
```

## Sources

- [Octokit rest.js Documentation](https://octokit.github.io/rest.js/)
- [GitHub REST API Documentation](https://docs.github.com/en/rest)
- [Octokit Types](https://github.com/octokit/types.ts)
- [How to create a comment in a PR using Octokit](https://www.geeksforgeeks.org/node-js/how-to-create-a-comment-in-a-pull-request-using-ocktokit/)
- [Using TypeScript and Octokit to Comment on PRs](https://gist.github.com/smarr/317e83149bb564e54dc2b662a312ae03)
