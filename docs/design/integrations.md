# Integrations Design Document

## Overview

This document covers external integrations for falcon-pm: GitHub for PR management, Claude Code and OpenAI for agent invocation, and WebSocket for real-time streaming.

## GitHub Integration

### Authentication

```typescript
// Store token in global config
// ~/.falcon/config.yaml
// github:
//   token: ${GITHUB_TOKEN}

import { Octokit } from '@octokit/rest';

let octokit: Octokit | null = null;

export function getOctokit(): Octokit {
  if (!octokit) {
    const config = loadGlobalConfig();
    octokit = new Octokit({
      auth: config.github.token,
      userAgent: 'falcon-pm/1.0.0',
    });
  }
  return octokit;
}
```

### PR Creation

```typescript
interface CreatePRParams {
  issue: Issue;
  project: Project;
}

export async function createPullRequest({ issue, project }: CreatePRParams) {
  const octokit = getOctokit();
  const { owner, repo } = parseRepoUrl(project.repoUrl);

  const body = buildPRBody(issue);

  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: `[Falcon] ${issue.title}`,
    body,
    head: issue.branchName,
    base: project.defaultBranch,
    draft: false,
  });

  // Update issue with PR info
  await updateIssue(issue.id, {
    prNumber: pr.number,
    prUrl: pr.html_url,
  });

  return pr;
}

function buildPRBody(issue: Issue): string {
  return `## Summary
${issue.description || 'No description provided.'}

## Related Issue
Closes #${issue.number}

## Workflow
- Stage: ${issue.stage}
- Preset: ${issue.presetName}

---
*This PR was created automatically by falcon-pm*`;
}
```

#### PR Creation Idempotency

The orchestrator ensures PR creation is idempotent via local state check:

```typescript
if (issue.prNumber) {
  return; // PR already exists, skip creation
}
```

**Design decision:** We check local database state (`issue.prNumber`) rather than querying GitHub for existing PRs. This:
- Avoids an extra API call on every PR_REVIEW stage tick
- Relies on the database as source of truth for PR association
- Requires that `prNumber` is always set after successful PR creation

**Edge case:** If PR creation succeeds but database update fails, the PR would be orphaned. This is acceptable as the failure would set `orchestrationError` and require human intervention.

```typescript
```

### Post PR Findings as Comments

```typescript
interface PRFinding {
  type: 'error' | 'warning' | 'info';
  category: string;
  filePath?: string;
  lineNumber?: number;
  message: string;
  suggestion?: string;
  foundBy: string;
  confirmedBy?: string;
  confidence: number;
}

export async function postFindingsToGitHub(
  issue: Issue,
  findings: PRFinding[]
) {
  const octokit = getOctokit();
  const { owner, repo } = parseRepoUrl(issue.project.repoUrl);

  // 1. Post summary comment
  const summary = buildFindingsSummary(findings);
  await upsertBotComment(
    owner, repo, issue.prNumber,
    summary,
    'pr-review-summary'
  );

  // 2. Post inline comments for line-specific findings
  const lineFindings = findings.filter(f => f.filePath && f.lineNumber);
  if (lineFindings.length > 0) {
    const pr = await octokit.rest.pulls.get({
      owner, repo,
      pull_number: issue.prNumber,
    });

    await octokit.rest.pulls.createReview({
      owner, repo,
      pull_number: issue.prNumber,
      commit_id: pr.data.head.sha,
      event: hasErrors(findings) ? 'REQUEST_CHANGES' : 'COMMENT',
      body: 'Falcon automated review',
      comments: lineFindings.map(f => ({
        path: f.filePath!,
        line: f.lineNumber!,
        body: formatFindingComment(f),
      })),
    });
  }
}

function formatFindingComment(finding: PRFinding): string {
  const icon = finding.type === 'error' ? ':x:' :
               finding.type === 'warning' ? ':warning:' : ':information_source:';

  return `${icon} **${finding.type.toUpperCase()}** (${finding.category})

${finding.message}

${finding.suggestion ? `**Suggestion:** ${finding.suggestion}` : ''}

---
*Found by ${finding.foundBy}${finding.confirmedBy ? ` | Confirmed by ${finding.confirmedBy}` : ''} | Confidence: ${Math.round(finding.confidence * 100)}%*`;
}
```

#### Bot Identity Constants

The orchestrator uses fixed identity constants for GitHub bot comment operations:

| Constant | Value | Used For |
|----------|-------|----------|
| `REVIEW_COMMENT_IDENTIFIER` | `'pr-review-summary'` | HTML comment marker to find/update existing bot comments |
| `REVIEW_COMMENT_AUTHOR` | `'github-bot'` | `readBy` value when marking stage messages as read |

**These values MUST remain stable.** Changing the identifier would cause the system to create new comments instead of updating existing ones, resulting in duplicate bot comments on PRs. Changing the author would affect message read tracking. Both constants are defined in `src/pm/orchestrator/runner.ts`.

#### Comment Marker Format

Bot comments are identified using an invisible HTML comment marker prepended to the body:

```
<!-- falcon-bot:{identifier} -->
{actual comment body}
```

The `upsertBotComment()` function searches existing PR comments for this marker using `String.includes()`. If found, the existing comment is updated; otherwise, a new comment is created.

**Format is stable and MUST NOT change.** Changing the format would orphan all existing bot comments and create duplicates. The `identifier` parameter allows multiple independent bot comments per PR (e.g., `'pr-review-summary'` for review findings).

#### Pagination Limits

Comment pagination is capped at `MAX_COMMENT_PAGES` (20 pages = 2000 comments) to prevent memory exhaustion on PRs with spam comments. If the bot comment isn't found within this limit, a new comment is created.

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `MAX_COMMENT_PAGES` | 20 | Prevents memory exhaustion |
| `perPage` | 100 | GitHub API standard page size |

### PR Approval Status

The `getPullRequestStatus()` function determines whether a PR is approved for merge using review-based logic.

**Approval Algorithm:**
1. Fetch all reviews for the PR via REST API
2. Sort reviews by `submitted_at` to ensure chronological processing
3. For each reviewer, track only their most recent review state (APPROVED, CHANGES_REQUESTED, or DISMISSED)
4. PR is considered approved if:
   - At least one reviewer has APPROVED
   - AND no reviewer has CHANGES_REQUESTED as their latest state

**Review States Considered:**
| State | Effect |
|-------|--------|
| APPROVED | Counts toward approval |
| CHANGES_REQUESTED | Blocks approval |
| DISMISSED | Clears previous state (neither approves nor blocks) |
| COMMENTED | Ignored (not a decision) |
| PENDING | Ignored (not submitted) |

**Important:** This logic differs from GitHub's native `reviewDecision`, which also considers branch protection settings (CODEOWNERS, required reviewers). For repos with complex branch protection, the GitHub API will independently enforce protections at merge time.

**Null Handling:**

| Field | GitHub API Behavior | Our Handling |
|-------|---------------------|--------------|
| `mergeable` | Returns `null` while GitHub computes merge status | Defaults to `false` (fail-safe: don't merge if unknown) |
| `mergeable_state` | May be `null` | Passed through as-is |
| `reviewDecision` | Not available in REST API | Synthesized from review analysis: `'APPROVED'` / `'CHANGES_REQUESTED'` / `null` |

**Important:** The `mergeable: null` → `false` default means the orchestrator will not auto-merge while GitHub is still computing merge status. Callers should retry after a delay if merge is blocked due to unknown mergeable state.

#### Review Timestamp Handling

Review timestamps from GitHub may be `null`, `undefined`, or malformed (parsing to `NaN`). The `parseReviewTimestamp()` function normalizes all invalid timestamps to `0` (Unix epoch).

| Input | Output | Rationale |
|-------|--------|-----------|
| Valid ISO date | Parsed milliseconds | Normal case |
| `null` / `undefined` | `0` | Missing timestamps sort to beginning |
| Malformed string | `0` | NaN breaks `Array.sort()` comparisons |

**Design decision:** Using `0` ensures invalid-timestamp reviews sort to the *beginning* of the timeline, making them effectively "oldest." This means if a reviewer's only review has a bad timestamp, it will be overwritten by any subsequent valid review. This is a deliberate fail-safe: uncertain data does not override known-good data.

**Alternative considered:** Defaulting to `Date.now()` was rejected because it would make malformed reviews appear to be the most recent, potentially overriding valid earlier reviews.

### Merge Handling

```typescript
export async function mergePR(issue: Issue): Promise<MergeResult> {
  const octokit = getOctokit();
  const { owner, repo } = parseRepoUrl(issue.project.repoUrl);

  // 1. Check mergeable state
  const pr = await octokit.rest.pulls.get({
    owner, repo,
    pull_number: issue.prNumber,
  });

  if (!pr.data.mergeable) {
    return {
      success: false,
      reason: pr.data.mergeable_state,
      hasConflicts: pr.data.mergeable_state === 'dirty',
    };
  }

  // 2. Wait for checks
  const checksOk = await waitForChecks(owner, repo, pr.data.head.sha);
  if (!checksOk) {
    return {
      success: false,
      reason: 'checks_failed',
    };
  }

  // 3. Merge
  const result = await octokit.rest.pulls.merge({
    owner, repo,
    pull_number: issue.prNumber,
    merge_method: 'squash',
    commit_title: `${issue.title} (#${issue.prNumber})`,
    commit_message: buildMergeCommitMessage(issue),
  });

  return {
    success: result.data.merged,
    sha: result.data.sha,
  };
}

async function waitForChecks(
  owner: string,
  repo: string,
  sha: string,
  timeoutMs = 10 * 60 * 1000
): Promise<boolean> {
  const octokit = getOctokit();
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const { data } = await octokit.rest.checks.listForRef({
      owner, repo, ref: sha,
    });

    const pending = data.check_runs.filter(c => c.status !== 'completed');
    if (pending.length === 0) {
      const failed = data.check_runs.filter(c =>
        c.conclusion !== 'success' && c.conclusion !== 'skipped'
      );
      return failed.length === 0;
    }

    await sleep(10000);  // Poll every 10s
  }

  return false;  // Timeout
}
```

#### Merge Validation

After the GitHub merge API call, the `mergePullRequest()` function explicitly validates that `data.merged === true`. If `merged` is `false` (GitHub accepted the request but did not actually merge), the function throws a `GitHubMergeError`.

```typescript
class GitHubMergeError extends Error {
  name = 'GitHubMergeError';
}
```

**Callers MUST handle `GitHubMergeError`.** The orchestrator's `maybeAutoMerge()` catches this error and sets `orchestrationError` on the issue.

**Default merge method:** `squash` (configurable via `mergeMethod` parameter, which accepts `'merge'`, `'squash'`, or `'rebase'`).

### Webhook Handler

```typescript
// POST /api/github/webhook
export async function handleGitHubWebhook(req: Request, res: Response) {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  switch (event) {
    case 'pull_request':
      await handlePREvent(payload);
      break;
    case 'check_run':
      await handleCheckRunEvent(payload);
      break;
    case 'issue_comment':
      await handleCommentEvent(payload);
      break;
  }

  res.sendStatus(200);
}
```

### Issue Matching Logic

When a GitHub webhook event is received, the system must find the associated issue. This uses OR-based matching to handle cases where only partial information is available:

```typescript
/**
 * Find issue by PR number OR branch name.
 *
 * Matching priority:
 * 1. Match by prNumber if present in payload
 * 2. Fall back to match by branchName (head ref)
 *
 * This OR-based approach handles:
 * - PRs created externally (have prNumber, may not have branchName set)
 * - Issues where PR was created but prNumber wasn't recorded
 * - Branch-based workflows where PR doesn't exist yet
 */
async function findIssueByPR(pullRequest: GitHubPullRequest): Promise<Issue | null> {
  const { number: prNumber, head } = pullRequest;
  const branchName = head?.ref;

  // Try prNumber first (most reliable)
  if (prNumber) {
    const issue = await issueRepo.findByPrNumber(prNumber);
    if (issue) return issue;
  }

  // Fall back to branchName
  if (branchName) {
    const issue = await issueRepo.findByBranchName(branchName);
    if (issue) return issue;
  }

  return null;
}
```

**Important:** Both `prNumber` and `branchName` are optional on the issue. The webhook handler must check both fields to ensure proper issue correlation across different workflow states.

```typescript
async function handlePREvent(payload: any) {
  const { action, pull_request } = payload;

  // Find associated issue using OR-based matching
  const issue = await findIssueByPR(pull_request);
  if (!issue) return;

  switch (action) {
    case 'closed':
      if (pull_request.merged) {
        await transitionIssue(issue.id, 'DONE');
        await syncIdleAgents(issue.projectId);
      }
      break;
    case 'reopened':
      // Handle reopened PR
      break;
  }
}
```

## Agent Invoker Interface

All agent invocations (Claude, Codex, OpenAI) are abstracted behind the `AgentInvoker` interface:

```typescript
interface AgentInvoker {
  invokeStage(args: {
    agentId: string;
    issueId: string;
    stage: string;
    prompt: string;
    toolBaseUrl: string;
    debug: boolean;
  }): Promise<{ runId: string }>;
}
```

### Debug Mode

When `debug: true` is passed to `invokeStage()`:
- Agent output is streamed line-by-line through the `OutputBus`
- Clients can subscribe to real-time output via WebSocket (`run:<runId>` channel)
- Output is processed through JSON-L parsing (for CLI tools that emit structured events)

When `debug: false`:
- Agent runs silently with no output streaming
- Only the final result is captured
- Preferred for production to reduce overhead

### Resource Management

All invokers implement:
- **Process timeout**: 5-minute maximum execution time
- **Concurrency control**: Maximum 5 concurrent agent processes via semaphore
- **Prompt size validation**: 50KB maximum prompt size
- **Credential scrubbing**: All output is sanitized before streaming

### Buffer Deadlock Prevention

Agent invokers set `stdio` to `['pipe', 'pipe', 'ignore']` (or similar) to **ignore stderr**. This prevents a buffer deadlock scenario:

**Problem:** When a child process writes more data to stderr than the OS pipe buffer size (~64KB on most systems) while the parent is reading stdout, the child blocks waiting for the stderr buffer to drain. If the parent never reads stderr, this causes an indefinite hang.

**Tradeoff:** Diagnostic information from stderr is lost. If debugging agent invocation failures, temporarily enable stderr capture with explicit draining:
```typescript
child.stderr?.on('data', (chunk) => { /* drain but discard */ });
```

**Do not remove** the `'ignore'` setting without implementing proper stderr draining.

### Concurrency Control Scope

**Important:** The semaphore is implemented at **module scope**, not instance scope:

```typescript
// Module-level (shared across all invoker instances)
let activeProcesses = 0;
const waitingQueue: Array<() => void> = [];
```

This means:
- All `ClaudeCodeInvoker` instances share the same 5-slot limit
- Creating multiple invokers does NOT increase available slots
- This is intentional to prevent resource exhaustion when orchestrating multiple issues

If independent limits are needed per orchestrator, the semaphore must be moved to instance scope (not currently supported).

## Claude Code Non-Interactive Invocation

### Using Claude Agent SDK (Recommended)

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

interface InvokeClaudeOptions {
  agentId: string;
  workDir: string;
  prompt: string;
  stage: IssueStage;
  allowedTools: string[];
  onOutput?: (chunk: string) => void;
}

export async function invokeClaudeAgent(options: InvokeClaudeOptions) {
  const { agentId, workDir, prompt, stage, allowedTools, onOutput } = options;

  let sessionId: string | undefined;
  let result = '';
  let cost = 0;

  for await (const message of query({
    prompt,
    options: {
      cwd: workDir,
      allowedTools,
      permissionMode: 'acceptEdits',
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: buildAgentSystemPrompt(agentId, stage),
      },
      settingSources: ['project'],  // Load CLAUDE.md
      hooks: {
        PostToolUse: [{
          matcher: 'Edit|Write',
          hooks: [async (input) => {
            // Track file changes
            await logFileChange(agentId, input.tool_input?.file_path);
            return {};
          }]
        }]
      }
    }
  })) {
    // Handle different message types
    if (message.type === 'system' && message.subtype === 'init') {
      sessionId = message.session_id;
    }

    if (message.type === 'stream_event') {
      const text = extractStreamText(message);
      if (text && onOutput) {
        onOutput(text);
      }
    }

    if (message.type === 'result') {
      result = message.result;
      cost = message.total_cost_usd;
    }
  }

  return { result, sessionId, cost };
}

function buildAgentSystemPrompt(agentId: string, stage: IssueStage): string {
  return `
You are falcon-agent "${agentId}" working on stage: ${stage}.

## Tools Available
You have access to the falcon API tools:
- falcon_comment: Add a comment to the issue
- falcon_stage_message: Leave a message for a future stage handler
- falcon_work_complete: Signal that your work is complete

## When You're Done
Always call falcon_work_complete with a summary of what you did.
`;
}
```

### Using CLI Spawn (Alternative)

```typescript
import { spawn } from 'child_process';
import { createInterface } from 'readline';

export async function invokeClaudeViaCLI(
  workDir: string,
  prompt: string,
  onOutput?: (chunk: string) => void
): Promise<{ result: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('claude', [
      '--print',
      '--dangerously-skip-permissions',
      '--output-format', 'stream-json',
    ], {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    child.stdin.write(prompt);
    child.stdin.end();

    let result = '';

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        const event = parseStreamEvent(line);
        if (event?.type === 'content_block_delta') {
          const text = event.delta?.text ?? '';
          result += text;
          onOutput?.(text);
        }
      });
    }

    child.on('close', (exitCode) => {
      resolve({ result, exitCode: exitCode ?? 0 });
    });
  });
}
```

## OpenAI Invocation

```typescript
import OpenAI from 'openai';

export async function invokeOpenAIAgent(
  workDir: string,
  prompt: string
): Promise<{ result: string; responseId: string }> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  process.chdir(workDir);  // Set working directory

  const response = await client.responses.create({
    model: 'gpt-4o-mini',
    input: prompt,
  });

  return {
    result: response.output_text ?? '',
    responseId: response.id,
  };
}

// Or via CLI
export async function invokeOpenAIViaCLI(
  workDir: string,
  prompt: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('openai', [
      'responses',
      'create',
      '--model',
      'gpt-4o-mini',
      '--input',
      prompt,
    ], {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
    });

    let result = '';

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        try {
          const event = JSON.parse(line);
          if (event.output_text) {
            result += event.output_text;
          }
        } catch {}
      });
    }

    child.on('close', (code) => {
      if (code === 0) resolve(result);
      else reject(new Error(`OpenAI CLI exited with code ${code}`));
    });
  });
}
```

## WebSocket Streaming

### Server Setup

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface Client {
  ws: WebSocket;
  subscriptions: Set<string>;
}

const clients = new Map<string, Client>();

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    // Authenticate
    const token = new URL(request.url!, 'http://localhost').searchParams.get('token');
    if (!validateToken(token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws);
    });
  });

  wss.on('connection', (ws) => {
    const clientId = crypto.randomUUID();
    clients.set(clientId, { ws, subscriptions: new Set() });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      handleClientMessage(clientId, msg);
    });

    ws.on('close', () => {
      clients.delete(clientId);
    });
  });
}
```

### Broadcasting Events

```typescript
export function broadcast(channel: string, event: string, data: unknown) {
  const message = JSON.stringify({ type: 'event', channel, event, data });

  for (const client of clients.values()) {
    if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  }
}

// Usage examples:
broadcast('project:my-project', 'issue_created', { issue });
broadcast('issue:123', 'stage_changed', { stage: 'IMPLEMENT' });
broadcast('agent:opus-1', 'output', { content: 'Reading file...' });
```

### Agent Output Streaming

```typescript
export function streamAgentOutput(agentId: string, content: string) {
  broadcast(`agent:${agentId}`, 'output', {
    timestamp: Date.now(),
    content,
  });
}

// In agent invocation
await invokeClaudeAgent({
  agentId: 'opus-1',
  workDir,
  prompt,
  stage,
  allowedTools,
  onOutput: (chunk) => {
    streamAgentOutput('opus-1', chunk);
  },
});
```

## Future Integration Points

### Additional LLM Providers

```typescript
interface LLMProvider {
  name: string;
  invoke(prompt: string, options: InvokeOptions): Promise<InvokeResult>;
  supportsStreaming: boolean;
}

// Registry for future providers
const providers: Record<string, LLMProvider> = {
  'claude': claudeProvider,
  'openai': openaiProvider,
  // Future:
  // 'gemini': geminiProvider,
  // 'grok': grokProvider,
};
```

### MCP Server Integration

```typescript
// Run falcon-pm as MCP server for other tools
export function runAsMcpServer() {
  const server = new McpServer({
    name: 'falcon-pm',
    version: '1.0.0',
    tools: [
      {
        name: 'falcon_create_issue',
        description: 'Create a new issue in falcon-pm',
        inputSchema: createIssueSchema,
        handler: createIssueHandler,
      },
      {
        name: 'falcon_get_issue',
        description: 'Get issue details',
        inputSchema: getIssueSchema,
        handler: getIssueHandler,
      },
      // ... more tools
    ],
  });

  server.run();
}
```

### CI/CD Integration

```typescript
// GitHub Actions workflow integration
export async function triggerCIWorkflow(issue: Issue) {
  const octokit = getOctokit();
  const { owner, repo } = parseRepoUrl(issue.project.repoUrl);

  await octokit.rest.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: 'falcon-test.yml',
    ref: issue.branchName,
    inputs: {
      issue_id: issue.id,
      stage: issue.stage,
    },
  });
}
```
