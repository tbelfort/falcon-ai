# Research: Phase 4 Integration Dependencies

**Created:** 2026-01-19
**Phase:** Phase 4 - Integration & Workflow
**Purpose:** External API dependencies, rate limiting, webhook security, and E2E testing patterns

---

## 1. Linear SDK (@linear/sdk)

**Source:** [Linear Developers SDK](https://linear.app/developers/sdk) | [npm package](https://www.npmjs.com/package/@linear/sdk)

### Recommended Version
- **Latest:** v70.0.0 (as of January 2026)
- **Install:** `npm i @linear/sdk`
- **Weekly Downloads:** 163+ dependent projects

### Key Features
- TypeScript SDK exposing Linear GraphQL schema through strongly typed models
- Supports both browser and Node.js environments
- Personal API keys and OAuth2 authentication

### API Patterns for Use Cases

**Issue Fetching:**
```typescript
import { LinearClient } from '@linear/sdk';

const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

// Get issue with related data
const issue = await linear.issue('CON-123');
const labels = await issue.labels();
const project = await issue.project;

// Map to IssueData for TaskProfile extraction
const issueData = {
  id: issue.identifier,
  title: issue.title,
  description: issue.description ?? '',
  labels: (await labels.nodes).map(l => l.name)
};
```

**State Transitions:**
```typescript
// Update issue state
await linear.updateIssue(issueId, {
  stateId: targetStateId  // e.g., "In Progress", "Done"
});

// Get workflow states for a team
const team = await linear.team('TEAM-ID');
const states = await team.states();
```

**Document Creation:**
```typescript
// Create document in Linear
const document = await linear.createDocument({
  title: 'Context Pack: CON-123',
  content: contextPackMarkdown,
  projectId: project.id
});
```

---

## 2. Linear API Rate Limiting

**Source:** [Linear Rate Limiting](https://linear.app/developers/rate-limiting)

### Rate Limits

| Authentication | Request Limit | Complexity Limit |
|---------------|---------------|------------------|
| API Key | 5,000 requests/hour | 250,000 points/hour |
| OAuth App | 5,000 requests/hour/user | 2,000,000 points/hour |
| Unauthenticated | 60 requests/IP | 10,000 points/hour |

**Single Query Maximum:** 10,000 complexity points

### Complexity Calculation
- Each property: 0.1 point
- Each object: 1 point
- Connections multiply by pagination argument (default 50)
- Score rounds up to nearest integer

### Rate Limit Headers
```
X-RateLimit-Requests-Limit: 5000
X-RateLimit-Requests-Remaining: 4999
X-RateLimit-Requests-Reset: 1706140800
X-Complexity: 42
X-RateLimit-Complexity-Limit: 250000
X-RateLimit-Complexity-Remaining: 249958
```

### Error Handling Implementation

```typescript
import { LinearClient, LinearError } from '@linear/sdk';

interface LinearIntegrationConfig {
  retryAttempts: number;      // Default: 3
  retryDelayMs: number;       // Default: 1000
  timeoutMs: number;          // Default: 5000
  fallbackToLocal: boolean;   // Default: true
}

const DEFAULT_CONFIG: LinearIntegrationConfig = {
  retryAttempts: 3,
  retryDelayMs: 1000,
  timeoutMs: 5000,
  fallbackToLocal: true
};

async function fetchLinearIssue(
  client: LinearClient,
  issueId: string,
  config = DEFAULT_CONFIG
): Promise<Issue | null> {
  for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
    try {
      const issue = await client.issue(issueId);
      return issue;
    } catch (error) {
      if (isRateLimitError(error)) {
        const resetAt = parseRateLimitReset(error);
        console.warn(`[Linear] Rate limited, resets at ${resetAt}`);
        await sleep(config.retryDelayMs * Math.pow(2, attempt - 1));
        continue;
      }

      if (isNetworkError(error) && attempt < config.retryAttempts) {
        await sleep(config.retryDelayMs * attempt);
        continue;
      }

      if (config.fallbackToLocal) {
        console.warn(`[Linear] Unavailable, using local metadata`);
        return null;
      }
      throw error;
    }
  }
  return null;
}

function isRateLimitError(error: unknown): error is LinearError {
  return error instanceof LinearError &&
    (error.message.includes('RATELIMITED') || error.status === 429);
}

function isNetworkError(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('ETIMEDOUT') ||
    error.message.includes('ENOTFOUND') ||
    error.message.includes('fetch failed')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Best Practices
1. **Use webhooks instead of polling** - Linear strongly discourages polling
2. **Filter queries** - Request only needed fields
3. **Specify pagination limits** - Default is 50 records
4. **Sort by updatedAt** - When fetching large datasets
5. **Cache responses** - Short TTL (30-120s) with stale-while-revalidate

---

## 3. Linear Webhooks

**Source:** [Linear Webhooks](https://linear.app/developers/webhooks)

### Supported Event Types

| Entity | Events |
|--------|--------|
| Issues | create, update, remove |
| Issue attachments | create, update, remove |
| Issue comments | create, update, remove |
| Issue labels | create, update, remove |
| Projects | create, update, remove |
| Documents | create, update, remove |
| Users | create, update, remove |

### Payload Structure
```typescript
interface LinearWebhookPayload {
  action: 'create' | 'update' | 'remove';
  type: string;                    // Entity type (Issue, Comment, etc.)
  actor: { id: string; type: string };
  createdAt: string;
  data: Record<string, unknown>;   // Serialized entity
  url: string;                     // Link to entity
  updatedFrom?: Record<string, unknown>;  // Previous values (updates only)
  webhookTimestamp: number;        // UNIX timestamp (ms)
  webhookId: string;               // Unique identifier
}
```

### HTTP Headers
- `Linear-Delivery`: UUID for this delivery
- `Linear-Event`: Entity type (e.g., "Issue")
- `Linear-Signature`: HMAC-SHA256 signature

### Signature Verification Implementation

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

interface WebhookVerificationResult {
  valid: boolean;
  reason?: string;
}

function verifyLinearWebhook(
  rawBody: string | Buffer,
  signature: string,
  signingSecret: string,
  webhookTimestamp: number
): WebhookVerificationResult {
  // 1. Verify timestamp is within acceptable window (60 seconds)
  const now = Date.now();
  const timestampAge = Math.abs(now - webhookTimestamp);
  const MAX_AGE_MS = 60 * 1000;  // 60 seconds

  if (timestampAge > MAX_AGE_MS) {
    return {
      valid: false,
      reason: `Timestamp too old: ${timestampAge}ms > ${MAX_AGE_MS}ms`
    };
  }

  // 2. Compute expected signature
  const expectedSignature = createHmac('sha256', signingSecret)
    .update(rawBody)
    .digest('hex');

  // 3. Use timing-safe comparison to prevent timing attacks
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: 'Signature length mismatch' };
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false, reason: 'Signature mismatch' };
  }

  return { valid: true };
}
```

### IP Address Verification (Optional)
Linear webhooks originate from these IP addresses:
- `35.231.147.226`
- `35.243.134.228`
- `34.140.253.14`
- `34.38.87.206`
- `34.134.222.122`
- `35.222.25.142`

**Note:** This list may expand; check Linear documentation for updates.

### Retry Behavior
- Non-200 responses trigger retries at: 1 minute, 1 hour, 6 hours
- After 3 failed attempts, webhook is disabled

---

## 4. GitHub GraphQL API

**Source:** [GitHub GraphQL Rate Limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api) | [Octokit](https://github.com/octokit/octokit.js)

### Recommended SDK
- **Package:** `octokit` (all-batteries-included) or `@octokit/graphql` (lightweight)
- **Install:** `npm i octokit` or `npm i @octokit/graphql`

### Rate Limits

**Primary Limits (per hour):**
| Authentication | Points/Hour |
|---------------|-------------|
| Personal Access Token | 5,000 |
| GitHub App (non-Enterprise) | 5,000 - 12,500 (scales with repos) |
| GitHub App (Enterprise) | 10,000 |
| GitHub Actions | 1,000 per repository |

**Secondary Limits:**
| Limit | Value |
|-------|-------|
| Concurrent requests | 100 (shared REST + GraphQL) |
| Points per minute | 2,000 (GraphQL) |
| CPU time per minute | 60 seconds |
| Content-generating requests | 80 per minute |

**Point Costs:**
- GraphQL query (no mutations): 1 point
- GraphQL mutation: 5 points

### PR Review Query Example

```typescript
import { Octokit } from 'octokit';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

interface PRReviewData {
  reviews: Array<{
    id: string;
    state: string;
    body: string;
    author: string;
    submittedAt: string;
    comments: Array<{
      body: string;
      path: string;
      line: number | null;
    }>;
  }>;
  reviewThreads: Array<{
    id: string;
    isResolved: boolean;
    comments: Array<{
      body: string;
      author: string;
    }>;
  }>;
}

async function fetchPRReviews(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRReviewData> {
  const query = `
    query GetPRReviews($owner: String!, $repo: String!, $prNumber: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $prNumber) {
          reviews(last: 50) {
            nodes {
              id
              state
              body
              author { login }
              submittedAt
              comments(first: 50) {
                nodes {
                  body
                  path
                  line
                }
              }
            }
          }
          reviewThreads(last: 50) {
            nodes {
              id
              isResolved
              comments(first: 10) {
                nodes {
                  body
                  author { login }
                }
              }
            }
          }
        }
      }
    }
  `;

  const result = await octokit.graphql(query, { owner, repo, prNumber });
  return mapToReviewData(result);
}
```

### Pagination Pattern

```typescript
import { paginateGraphQL } from '@octokit/plugin-paginate-graphql';

// Use cursor-based pagination for large result sets
async function fetchAllReviewComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<Comment[]> {
  const allComments: Comment[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const result = await octokit.graphql(`
      query($owner: String!, $repo: String!, $pr: Int!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $pr) {
            reviews(first: 50, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              nodes {
                comments(first: 100) {
                  nodes { body path line }
                }
              }
            }
          }
        }
      }
    `, { owner, repo, pr: prNumber, cursor });

    const reviews = result.repository.pullRequest.reviews;
    allComments.push(...extractComments(reviews.nodes));
    hasNextPage = reviews.pageInfo.hasNextPage;
    cursor = reviews.pageInfo.endCursor;
  }

  return allComments;
}
```

### Rate Limit Headers
```
x-ratelimit-limit: 5000
x-ratelimit-remaining: 4985
x-ratelimit-used: 15
x-ratelimit-reset: 1706144400
```

---

## 5. E2E Testing with Mock Service Worker (MSW)

**Source:** [MSW Quick Start](https://mswjs.io/docs/quick-start/) | [Vitest Mocking Requests](https://vitest.dev/guide/mocking/requests)

### Recommended Setup
- **Package:** `msw` (v2.x)
- **Install:** `npm i -D msw`

### Why MSW
- Intercepts requests at the network level (not application code)
- Works in both browser and Node.js environments
- Same mocks reusable across Vitest, Playwright, Storybook
- No `vi.mock()` needed for API calls

### Handler Setup

```typescript
// File: tests/mocks/handlers.ts
import { http, HttpResponse } from 'msw';

// Linear API handlers
export const linearHandlers = [
  // GET issue
  http.post('https://api.linear.app/graphql', async ({ request }) => {
    const body = await request.json();

    // Match by operation name or query content
    if (body.query?.includes('issue(')) {
      return HttpResponse.json({
        data: {
          issue: {
            id: 'issue-123',
            identifier: 'CON-123',
            title: 'Test Issue',
            description: 'Test description',
            labels: { nodes: [{ name: 'api' }, { name: 'database' }] }
          }
        }
      });
    }

    return HttpResponse.json({ errors: [{ message: 'Unknown query' }] });
  }),

  // Rate limit simulation
  http.post('https://api.linear.app/graphql', () => {
    return HttpResponse.json(
      { errors: [{ message: 'RATELIMITED' }] },
      {
        status: 429,
        headers: {
          'X-RateLimit-Requests-Reset': String(Date.now() + 60000)
        }
      }
    );
  })
];

// GitHub API handlers
export const githubHandlers = [
  http.post('https://api.github.com/graphql', async ({ request }) => {
    const body = await request.json();

    if (body.query?.includes('pullRequest(')) {
      return HttpResponse.json({
        data: {
          repository: {
            pullRequest: {
              reviews: { nodes: [] },
              reviewThreads: { nodes: [] }
            }
          }
        }
      });
    }

    return HttpResponse.json({ errors: [{ message: 'Unknown query' }] });
  })
];

export const handlers = [...linearHandlers, ...githubHandlers];
```

### Server Setup for Vitest

```typescript
// File: tests/mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

### Vitest Configuration

```typescript
// File: vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    environment: 'node'
  }
});
```

```typescript
// File: tests/setup.ts
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Testing Error Scenarios

```typescript
// File: tests/workflow/linear-error-handling.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { fetchLinearIssue } from '../../src/integrations/linear';

describe('Linear Error Handling', () => {
  it('retries on rate limit and succeeds', async () => {
    let attempts = 0;

    server.use(
      http.post('https://api.linear.app/graphql', () => {
        attempts++;
        if (attempts < 3) {
          return HttpResponse.json(
            { errors: [{ message: 'RATELIMITED' }] },
            { status: 429 }
          );
        }
        return HttpResponse.json({
          data: { issue: { id: 'issue-123', title: 'Success' } }
        });
      })
    );

    const issue = await fetchLinearIssue('CON-123');
    expect(issue).not.toBeNull();
    expect(attempts).toBe(3);
  });

  it('falls back to local on persistent failure', async () => {
    server.use(
      http.post('https://api.linear.app/graphql', () => {
        return HttpResponse.error();
      })
    );

    const issue = await fetchLinearIssue('CON-123', {
      retryAttempts: 2,
      fallbackToLocal: true
    });

    expect(issue).toBeNull();
  });
});
```

### Webhook Testing

```typescript
// File: tests/workflow/webhook-verification.test.ts
import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyLinearWebhook } from '../../src/webhooks/linear';

describe('Linear Webhook Verification', () => {
  const signingSecret = 'test-secret-key';

  it('accepts valid signature and timestamp', () => {
    const payload = JSON.stringify({
      action: 'create',
      type: 'Issue',
      webhookTimestamp: Date.now()
    });

    const signature = createHmac('sha256', signingSecret)
      .update(payload)
      .digest('hex');

    const result = verifyLinearWebhook(
      payload,
      signature,
      signingSecret,
      Date.now()
    );

    expect(result.valid).toBe(true);
  });

  it('rejects old timestamps (replay attack)', () => {
    const oldTimestamp = Date.now() - 120000; // 2 minutes ago
    const payload = JSON.stringify({
      action: 'create',
      webhookTimestamp: oldTimestamp
    });

    const signature = createHmac('sha256', signingSecret)
      .update(payload)
      .digest('hex');

    const result = verifyLinearWebhook(
      payload,
      signature,
      signingSecret,
      oldTimestamp
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Timestamp too old');
  });

  it('rejects invalid signature', () => {
    const payload = JSON.stringify({ action: 'create' });
    const wrongSignature = 'deadbeef'.repeat(8);

    const result = verifyLinearWebhook(
      payload,
      wrongSignature,
      signingSecret,
      Date.now()
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Signature');
  });
});
```

---

## 6. Exponential Backoff with Jitter

**Best Practice:** Use exponential backoff with random jitter to prevent thundering herd.

```typescript
/**
 * Calculates delay with exponential backoff and jitter.
 *
 * @param attempt - Current attempt number (1-indexed)
 * @param baseDelay - Base delay in milliseconds (default: 1000)
 * @param maxDelay - Maximum delay cap (default: 30000)
 * @returns Delay in milliseconds
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 30000
): number {
  // Exponential: baseDelay * 2^(attempt-1)
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter: random value between 0 and 50% of delay
  const jitter = Math.random() * cappedDelay * 0.5;

  return Math.floor(cappedDelay + jitter);
}

// Example usage:
// Attempt 1: 1000-1500ms
// Attempt 2: 2000-3000ms
// Attempt 3: 4000-6000ms
// Attempt 4: 8000-12000ms
// Attempt 5: 16000-24000ms
```

---

## 7. Package Version Summary

| Package | Recommended Version | Purpose |
|---------|---------------------|---------|
| `@linear/sdk` | ^70.0.0 | Linear API client |
| `octokit` | ^4.0.0 | GitHub API (all-in-one) |
| `@octokit/graphql` | ^8.0.0 | GitHub GraphQL (lightweight) |
| `msw` | ^2.0.0 | API mocking for tests |
| `vitest` | ^2.0.0 | Test runner |

---

## References

- [Linear Developers - SDK](https://linear.app/developers/sdk)
- [Linear Developers - Rate Limiting](https://linear.app/developers/rate-limiting)
- [Linear Developers - Webhooks](https://linear.app/developers/webhooks)
- [GitHub GraphQL API Rate Limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
- [Octokit.js](https://github.com/octokit/octokit.js)
- [Mock Service Worker](https://mswjs.io/)
- [Vitest Mocking Requests](https://vitest.dev/guide/mocking/requests)
- [OWASP - Handling Rate Limits](https://www.ayrshare.com/complete-guide-to-handling-rate-limits-prevent-429-errors/)
