# GPT-5 Review Request: Hierarchical Scoping Implementation

**Date:** 2026-01-19
**Reviewer:** GPT-5 Pro
**Author:** Claude (Opus 4.5)

---

## Context

I implemented hierarchical scoping (Global → Workspace → Project) across the Pattern Attribution System specs. Please review for correctness, consistency, and completeness.

**Files to review:**
1. `specs/spec-pattern-attribution-v1.0.md` - Main specification (Sections 1.6, 1.7, 2.x entities, 5.1 injection, 6.4 promotion)
2. `specs/phases/phase-1-data-layer.md` - Database schema, Zod schemas, repositories
3. `specs/phases/phase-3-injection-system.md` - Injection algorithm with scope parameters

---

## Key Design Decisions (Please Validate)

1. **Scope as discriminated union:**
   ```typescript
   type Scope =
     | { level: 'global' }
     | { level: 'workspace'; workspaceId: string }
     | { level: 'project'; workspaceId: string; projectId: string }
   ```

2. **Denormalization:** Entities store `workspaceId`/`projectId` directly rather than always joining through parent tables.

3. **patternKey uniqueness:** `UNIQUE INDEX on (workspace_id, project_id, pattern_key)` - same pattern can exist independently in different projects.

4. **Promotion criteria:** Pattern promoted to workspace DerivedPrinciple when it appears in 3+ projects AND is HIGH/CRITICAL severity AND is security category.

5. **Cross-project warnings:** Optional feature that includes HIGH/CRITICAL patterns from sibling projects in same workspace.

---

## Questions I Need Your Input On

### Architecture

1. Should Scope be a class hierarchy instead of discriminated union for extensibility (e.g., tenant-level scoping later)?

2. Is the denormalization trade-off correct? (query performance vs. data consistency)

3. Are the promotion criteria too restrictive for v1? Should we soften the gate?

4. Should cross-project warnings use relevance scoring based on project similarity?

5. The `computeDerivedConfidence()` caps at 0.85 to stay below baselines (0.9). Is this the right relationship?

### Runtime (Critical Gaps)

6. **How does the system determine workspaceId/projectId at runtime?** This is unspecified but required for every operation. Options:
   - Current working directory → lookup in `projects` table by `repo_path`?
   - Config file in `.falcon/config.yaml`?
   - Environment variables?

7. **How are workspaces and projects registered?** Is there a `falcon init` command? What prevents duplicate registrations?

8. **What about concurrent access?** Multiple projects share one global DB. Are there race conditions during promotion?

### Edge Cases

9. What happens when a project is deleted? Archive patterns, orphan them, or cascade-delete?

10. If the same patternKey exists in multiple projects and one gets promoted, what happens to the project-level patterns?

11. What happens when workspaceId/projectId doesn't exist in the DB? Throw, return empty, or auto-create?

### Missing Pieces

12. **Phase 0 is missing.** The implementation plan has Phases 1-5, but no Phase 0 for:
    - CLI installation
    - Workspace/project registration
    - Linear integration setup

    Should this be added?

13. **Observability:** How do we know the system is working? Metrics? Logging? Health checks?

14. **Rollback:** What if a bad pattern gets promoted? Can it be undone?

15. **Offline mode:** What happens when Linear is unreachable or the DB is locked?

---

## Your Role

**Think deeply. Find problems. Challenge my assumptions.**

You are my mentor reviewing this design. I want you to:
- Find logical flaws and inconsistencies
- Identify missing pieces that would cause implementation to fail
- Challenge architectural decisions
- Point out edge cases I haven't considered
- Tell me what's wrong and what to change

For each issue:
```
### Issue: [Title]
**Location:** [File/Section]
**Problem:** [What's wrong]
**Recommendation:** [What to change]
```

**Do not edit files.** Just tell me what needs fixing and I'll implement it.
