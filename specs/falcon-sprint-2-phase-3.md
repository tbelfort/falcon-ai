# Falcon Sprint 2 - Phase 3: Agent Infrastructure (Worktrees + Git Sync)

**Status**: Draft
**Depends On**: None (must be testable in isolation with temp directories)
**Outputs Required By**: Phase 4, Phase 5, Phase 6, Phase 7
**Self-Contained**: Yes (this spec includes a context pack; no other docs are required)
**Reference Only (Optional)**: `docs/design/agent-lifecycle.md`, `docs/design/architecture.md`, `ai_docs/git-automation-patterns.md`

---

## Handoff Prompt (Paste Into Fresh Model)

```text
You are implementing Falcon PM Sprint 2 Phase 3 (Agent Infrastructure: worktrees + git sync) in the `falcon-ai` repo. Use ONLY `specs/falcon-sprint-2-phase-3.md` as the source of truth (its Context Pack contains the authoritative filesystem layout and relevant git automation excerpts). Implement provisioning/checkout/git-sync/lifecycle using `simple-git`, ensure all writes are scoped under an injected `falconHome` (tests use temp dirs; never touch real `~/.falcon`), and ensure `npm test` passes.
```

## Context Pack (Read This, Then Implement)

### Repo Reality

- Node: `>= 20`, ESM, TS NodeNext
- Use `.js` in TS imports for local modules
- Tests use `vitest` and must not touch real `~/.falcon`

### Falcon Home Layout (Authoritative)

All agent infra writes under:

```
<FALCON_HOME>/projects/<project-slug>/
  primary/
  agents/<agent-name>/
  issues/<issue-id>/
```

`FALCON_HOME` resolution:
- tests pass an explicit temp dir
- production uses `process.env.FALCON_HOME ?? path.join(os.homedir(), '.falcon')`

### Agent Lifecycle (Authoritative v1)

Agent statuses (stored in DB later; in this phase, model in code):
- `INIT`: provisioned but not ready
- `IDLE`: clean checkout on latest main
- `CHECKOUT`: switching to issue branch
- `WORKING`: agent owns its worktree and may commit/push
- `DONE`: stage finished; awaiting release
- `ERROR`: failure; requires manual recovery/release

Hard rules:
- Never assign work to a `WORKING` agent
- Never run destructive git ops (`reset --hard`, `clean -fd`) outside an agent worktree

### Git Automation (Relevant Extract)

From `ai_docs/git-automation-patterns.md` (trimmed):

```ts
import simpleGit, { type SimpleGit, type SimpleGitOptions } from 'simple-git';

const defaultOptions: Partial<SimpleGitOptions> = {
  maxConcurrentProcesses: 6,
  trimmed: true,
};

export function createGit(workDir: string): SimpleGit {
  return simpleGit(workDir, defaultOptions);
}
```

Clone + checkout new branch pattern:

```ts
// clone (shallow)
await simpleGit().clone(repoUrl, targetDir, ['--depth', '1', '--single-branch', '-b', branch]);
await simpleGit(targetDir).fetch(['--unshallow']);

// checkout new branch from main
const git = createGit(workDir);
await git.fetch('origin', baseBranch);
await git.checkout(baseBranch);
await git.pull('origin', baseBranch);
await git.checkoutLocalBranch(issueBranch);
```

## Goal

Build the local agent workspace automation layer:
- Provision agent worktrees under `~/.falcon/projects/<slug>/agents/<agent-name>/`
- Keep idle agents on latest main
- Ensure working agents stay on their issue branch
- Provide a safe API for git operations (clone/checkout/pull/push/status)

This phase must not implement orchestration logic (Phase 5) or UI (Phase 2/6).

---

## npm Dependencies (Phase 3 Only)

Add:
- Runtime: `simple-git`

All tests must use local temp repos (no network).

---

## Hard Modularity Rules (Phase Gate)

1. Agent infra must not import Express or React.
2. Agent infra must not require a real database to be usable; persistence (if needed) is injected.
3. All git operations must be tested using local temp repos; no network access.

---

## Deliverables Checklist

- [ ] `src/pm/agents/fs-layout.ts` (path helpers for `~/.falcon/projects/...`)
- [ ] `src/pm/agents/provisioner.ts` (clone + setup + symlinks)
- [ ] `src/pm/agents/git-sync.ts` (pull/rebase/checkout helpers)
- [ ] `src/pm/agents/lifecycle.ts` (INIT/IDLE/CHECKOUT/WORKING/DONE/ERROR transitions)
- [ ] `src/pm/agents/registry.ts` (in-memory registry or interface; DB-backed later)
- [ ] `tests/pm/agents/provisioner.test.ts`
- [ ] `tests/pm/agents/git-sync.test.ts`
- [ ] `tests/pm/agents/lifecycle.test.ts`

---

## Workspace Layout

Under `~/.falcon/projects/<project-slug>/`:

```
primary/                 # optional shared large files
agents/<agent-name>/     # git clone/worktree for an agent
issues/<issue-id>/       # issue artifacts (context/specs/ai_docs)
```

Symlink strategy (optional, but supported by design):
- `node_modules`
- `.falcon/CORE`

Symlinks must be best-effort and never block provisioning if absent.

---

## Falcon Home Override (Test Safety)

All filesystem writes must be scoped under a configurable Falcon home:
- Every public entrypoint in `src/pm/agents/**` accepts `falconHome: string`
- Tests always pass a temp directory as `falconHome` (never write to the real `~/.falcon`)

Production code can resolve the default Falcon home from `process.env.FALCON_HOME ?? os.homedir() + '/.falcon'`.

---

## Git Operations API

Provide a minimal wrapper around git operations that:
- does not call `git reset --hard` on non-agent directories
- supports:
  - clone
  - fetch
  - checkout existing branch
  - create new branch from main
  - pull/rebase
  - commit + push (for agent work)

Recommended library: `simple-git`.

---

## Test Plan

All tests must be hermetic:

- Create a temp directory
- Initialize a git repo (`git init`) with a commit on `main`
- Use that local repo path as the "remote" for provisioning (local clone)

Test cases:
- Provisioner clones repo and sets git config (name/email)
- Checkout creates a new issue branch when missing
- Checkout switches to existing issue branch when present
- Lifecycle transitions enforce rules (cannot assign when WORKING)

---

## How To Run (Phase 3)

```bash
npm test
```

No additional runtime commands required for this phase.
