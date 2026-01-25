# Falcon Sprint 2 - Phase 7: GitHub Integration (PR + Comments + Merge)

**Status**: Draft
**Depends On**: Phase 5 (orchestration), Phase 1 (API). Must be testable with mocked Octokit clients (no network).
**Self-Contained**: Yes (this spec includes a context pack; no other docs are required)
**Reference Only (Optional)**: `docs/design/integrations.md`, `docs/design/security.md`, `ai_docs/github-api-patterns.md`

---

## Handoff Prompt (Paste Into Fresh Model)

```text
You are implementing Falcon PM Sprint 2 Phase 7 (GitHub Integration) in the `falcon-ai` repo. Use ONLY `specs/falcon-sprint-2-phase-7.md` as the source of truth (its Context Pack contains the authoritative Octokit patterns, repo URL parsing, and upsert-comment strategy). Implement the GitHub adapter behind an interface, load `GITHUB_TOKEN` from env, mock/inject Octokit in all tests (no network), and ensure `npm test` passes.
```

## Context Pack (Read This, Then Implement)

### Repo Reality

- Node: `>= 20`, ESM, TS NodeNext
- Use `.js` in TS imports for local modules
- Tests must not call real GitHub APIs

### Auth (Frozen for v1)

- GitHub auth uses a token in env var `GITHUB_TOKEN`
- If `GITHUB_TOKEN` is missing, GitHub adapter functions must throw a typed error with a clear message

### GitHub Integration Patterns (Relevant Extract)

From `ai_docs/github-api-patterns.md` (trimmed):

Install:
```bash
npm install @octokit/rest @octokit/types
```

Create client:

```ts
import { Octokit } from '@octokit/rest';

export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token, userAgent: 'falcon-pm/1.0.0' });
}
```

Parse repo URL:

```ts
export function parseRepoUrl(url: string): { owner: string; repo: string } {
  const httpsMatch = url.match(/github\\.com\\/([^/]+)\\/([^/.]+)/);
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };

  const sshMatch = url.match(/github\\.com:([^/]+)\\/([^/.]+)/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  const shortMatch = url.match(/^([^/]+)\\/([^/]+)$/);
  if (shortMatch) return { owner: shortMatch[1], repo: shortMatch[2] };

  throw new Error(`Invalid GitHub repo URL: ${url}`);
}
```

Create PR:

```ts
const { data: pr } = await octokit.rest.pulls.create({
  owner,
  repo,
  title,
  body,
  head: branchName,
  base: defaultBranch,
  draft: false,
});
```

Upsert comment (marker-based):

```ts
// Marker format: <!-- falcon-bot:<identifier> -->
// Identifier should be stable (e.g. 'pr-review-summary') so updates overwrite the same comment.
export async function upsertBotComment(args: {
  octokit: Octokit;
  owner: string;
  repo: string;
  issueNumber: number;     // PR number
  identifier: string;
  body: string;
}): Promise<void> {
  const marker = `<!-- falcon-bot:${args.identifier} -->`;
  const fullBody = `${marker}\n${args.body}`;

  const { data: comments } = await args.octokit.rest.issues.listComments({
    owner: args.owner,
    repo: args.repo,
    issue_number: args.issueNumber,
    per_page: 100,
  });

  const existing = comments.find((c) => (c.body ?? '').includes(marker));
  if (existing) {
    await args.octokit.rest.issues.updateComment({
      owner: args.owner,
      repo: args.repo,
      comment_id: existing.id,
      body: fullBody,
    });
    return;
  }

  await args.octokit.rest.issues.createComment({
    owner: args.owner,
    repo: args.repo,
    issue_number: args.issueNumber,
    body: fullBody,
  });
}
```

Merge PR:

```ts
await octokit.rest.pulls.merge({
  owner,
  repo,
  pull_number: prNumber,
  merge_method: 'squash',
});
```

## Goal

Implement GitHub integration as an adapter that can be invoked by orchestration:
- Create PR when issue reaches `PR_REVIEW`
- Post PR review findings as comments (upsert bot comment)
- Merge PR when issue reaches `MERGE_READY` (optional auto-merge flag)
- Webhook endpoint to sync PR status (optional but recommended)

---

## Hard Modularity Rules (Phase Gate)

1. GitHub logic lives in `src/pm/github/**` and is invoked through an interface (so it can be mocked in tests).
2. No tests make real GitHub API calls.
3. Secrets (GitHub token) are loaded from config, not committed or stored in the DB.

---

## Deliverables Checklist

- [ ] `src/pm/github/client.ts` (Octokit construction + config loading)
- [ ] `src/pm/github/pr-creator.ts`
- [ ] `src/pm/github/comment-poster.ts`
- [ ] `src/pm/github/merger.ts`
- [ ] `src/pm/api/routes/github-webhook.ts` (optional)
- [ ] `tests/pm/github/pr-creator.test.ts`
- [ ] `tests/pm/github/comment-poster.test.ts`
- [ ] `tests/pm/github/merger.test.ts`

---

## Test Plan

Do not use HTTP-level mocking. Unit test by injecting a mocked Octokit client object:
- `client.rest.pulls.create`
- `client.rest.issues.createComment`
- `client.rest.pulls.merge`
- etc.

Tests:
- create PR calls correct GitHub endpoint with expected payload
- upsert comment updates existing bot comment when present
- merge handles conflict/failed status and returns a typed error

---

## How To Run (Phase 7)

```bash
npm test
```

If you implement a local demo, it must run against mocks (no real GitHub required).
