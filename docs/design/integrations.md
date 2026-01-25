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

async function handlePREvent(payload: any) {
  const { action, pull_request } = payload;

  // Find associated issue
  const issue = await findIssueByPRNumber(pull_request.number);
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

## Codex Invocation

Codex CLI is invoked as a non-interactive child process, similar to Claude Code.

```typescript
import { spawn } from 'child_process';
import { createInterface } from 'readline';

interface CodexEvent {
  type: string;
  item?: { type: string; text?: string };
}

export async function invokeCodexAgent(
  workDir: string,
  prompt: string,
  onOutput?: (text: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['exec', '--json', prompt], {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let result = '';

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const event = JSON.parse(trimmed) as CodexEvent;
          if (event.item?.text) {
            onOutput?.(event.item.text);
          }
          if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
            result = event.item.text ?? '';
          }
        } catch {
          // ignore parse errors
        }
      });
    }

    child.on('close', (code) => {
      if (code === 0) resolve(result);
      else reject(new Error(`Codex CLI exited with code ${code}`));
    });

    child.on('error', (err) => reject(err));
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
  'codex': codexProvider,
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
