# GPT-5 Review Request: Implementation Fixes (v2)

**Date:** 2026-01-19
**Reviewer:** GPT-5 Pro
**Author:** Claude (Opus 4.5)
**Previous Review:** gpt5-review-scoping-changes.md

---

## Summary

I implemented all 23+ fixes from your previous review. This document summarizes what changed and asks you to verify the fixes are correct.

---

## Files Changed

| File | Changes |
|------|---------|
| `specs/spec-pattern-attribution-v1.0.md` | +887 lines - Main spec with all fixes |
| `specs/phases/phase-0-bootstrap.md` | NEW - CLI installation, workspace/project registration |
| `specs/phases/phase-1-data-layer.md` | +731 lines - Schema and repository fixes |
| `specs/phases/phase-2-attribution-engine.md` | +120 lines - Scope field additions |
| `specs/phases/phase-3-injection-system.md` | +202 lines - Cross-project and injection fixes |

---

## Issue Resolution Summary

### Architecture Issues (Fixed)

| Issue | Fix Applied |
|-------|-------------|
| Derived principles never injected | Changed budget: 1 baseline + 1 derived guaranteed (Section 5.1) |
| Promotion confidence referenced non-existent field | Compute from occurrences at promotion time (Section 6.4) |
| Promotion criteria used `severity` instead of `severityMax` | Consistently use `severityMax` (Section 6.4) |
| Cross-project query used invalid partial Scope | Added `ScopeFilter` type for queries (Section 1.6) |
| "Global high-severity patterns" contradicted scoping | Renamed to "project-wide fallback" (Section 5.3) |
| Workspace and Project entities not defined | Added entity definitions (Sections 2.11, 2.12) |
| Project identity used unstable `repo_path` | Changed to `repo_origin_url` with uniqueness (Section 2.12) |

### Repository Issues (Fixed)

| Issue | Fix Applied |
|-------|-------------|
| ProvisionalAlertRepository missing scope | Required scope in all methods (Phase 1) |
| SalienceIssueRepository missing scope | Required scope in all methods (Phase 1) |
| No scope integrity enforcement | Added invariant: derive scope from pattern (Section 1.8) |
| `alignedBaselineId` could cross workspace | Added validation rule (Section 2.1) |

### Injection Issues (Fixed)

| Issue | Fix Applied |
|-------|-------------|
| Cross-project warnings could inject duplicates | Added deduplication by `patternKey` (Section 5.1) |
| Cross-project warnings too noisy | Added relevance gate: `touchOverlap >= 2` (Section 5.1) |
| Derived principles ordering underspecified | Added ordering: `touchOverlap, confidence, updatedAt, id` (Section 5.1) |
| Cross-project patterns not penalized | Added 0.95x penalty (5% downweight) in `computeInjectionPriority` (Phase 3) |

### Runtime Issues (Fixed)

| Issue | Fix Applied |
|-------|-------------|
| Runtime scope resolution undefined | Added ScopeResolver policy (Section 1.9) |
| Workspace/project registration missing | Added Phase 0 with `falcon init` command |
| Promotion race conditions | Added `promotionKey` with DB uniqueness constraint (Section 6.4) |
| Project deletion undefined | Added soft delete with `status='archived'` (Section 2.12) |
| Promotion has no rollback | Added archive-with-reason for derived principles (Section 6.4) |
| Observability lacked scope | Added required log fields (Section 5.5) |
| Offline/DB-busy undefined | Added deterministic fallback policy (Section 1.10) |
| Scope invariants not documented | Added Scope Invariants subsection (Section 1.8) |

---

## New: Phase 0 Bootstrap

Phase 0 was missing entirely. I added `specs/phases/phase-0-bootstrap.md` covering:

1. **CLI Installation** - `npm install -g falcon-ai` with post-install hook
2. **Commands:**
   - `falcon init` - Initialize project, create `.falcon/config.yaml`
   - `falcon workspace list/create/archive` - Manage workspaces
   - `falcon project list/archive` - Manage projects
   - `falcon status` - Show current config and statistics
3. **Scope Resolution** - Three-step policy:
   - Check `.falcon/config.yaml` (authoritative)
   - Check environment variables (for CI)
   - Lookup by git remote origin URL
4. **URL Canonicalization** - Normalize SSH vs HTTPS URLs to stable identity
5. **Error Handling** - Clear, actionable error messages with exit codes

---

## Key Design Decisions (Please Validate)

### 1. Budget Model Change (Section 5.1)

**Before:** 2 baselines + 4 patterns (derived principles got no airtime)
**After:** 1 baseline + 1 derived + 4 patterns

Is this the right balance? Should derived principles compete with patterns instead of having a guaranteed slot?

### 2. Cross-Project Relevance Gate

Requires `touchOverlap >= 2` for cross-project patterns. This means a pattern must match at least 2 touches (e.g., `database` AND `auth`) to appear in a sibling project.

Is 2 the right threshold? Too low = noise, too high = miss relevant warnings.

### 3. Cross-Project Priority Penalty

Cross-project patterns get 0.95x multiplier (5% penalty) in priority calculation, making them rank slightly below same-project patterns with equal scores.

Is 5% enough to break ties without being too aggressive? Should it be configurable?

### 4. URL Canonicalization Strategy

```
git@github.com:org/repo.git  → github.com/org/repo
https://github.com/org/repo  → github.com/org/repo
```

This strips protocol and `.git` suffix. Edge cases:
- GitLab subgroups: `git@gitlab.com:group/subgroup/repo.git`
- Self-hosted: `git@git.company.com:team/repo.git`

Are there cases this will break?

### 5. Scope Resolution Priority

1. Config file (`.falcon/config.yaml`) - authoritative
2. Environment variables (`FALCON_WORKSPACE_ID`, `FALCON_PROJECT_ID`) - for CI
3. Git remote lookup - fallback

Should environment variables take priority over config file for CI flexibility?

---

## Questions for You

1. **Is the injection budget model correct?** Does 1+1+4 make more sense than 2+0+4?

2. **Is Phase 0 complete?** Did I miss any bootstrapping scenarios?

3. **Are the scope invariants enforceable?** (Section 1.8) Can you see any way they'd be violated?

4. **Is the URL canonicalization robust?** Will it handle enterprise Git setups?

5. **Is the offline policy too permissive?** We skip injection if DB is busy after 3 retries. Should we fail instead?

6. **Overall assessment:** Is this implementation-ready? What's still missing?

---

## Your Role

Please review the fixes and:
1. Confirm each issue is properly addressed
2. Identify any new issues introduced by the fixes
3. Answer the design questions above
4. Flag anything that would cause implementation to fail

**Do not edit files.** Just tell me what needs fixing and I'll implement it.
