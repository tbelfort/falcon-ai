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

Claude Code and Codex use subscription-based auth, not API keys:

```typescript
// No API keys stored - subscriptions are managed via:
// 1. Claude Code: ~/.claude/auth.json (managed by Claude Code)
// 2. Codex: ~/.codex/credentials (managed by Codex CLI)

// Falcon just tracks which subscriptions are configured
interface SubscriptionConfig {
  id: string;
  type: 'claude' | 'codex';
  name: string;  // Display name
  // No secrets stored here
}
```

### Validation

```typescript
async function validateSubscription(type: 'claude' | 'codex'): Promise<boolean> {
  if (type === 'claude') {
    // Check if Claude Code is authenticated
    try {
      const result = await exec('claude --version');
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  if (type === 'codex') {
    try {
      const result = await exec('codex --version');
      return result.exitCode === 0;
    } catch {
      return false;
    }
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
```

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
