# TASKS Version: core-v3-tasks

## Used For
- **CON-325:** Component-type-aware workflow improvements

## Summary
Makes workflow checks conditional on component type, enforces project non-negotiables, and scales test requirements based on complexity.

## New File
- **COMPONENT_TYPES.md** — Quick reference for component-type-specific requirements

## Changes from v2

### Component Type Awareness (New)

| File | Change |
|------|--------|
| CONTEXT_PACK.md | Step 1.5: Determine component type, add `[TYPE: ...]` tag |
| CONTEXT_PACK.md | Step 2.3: Extract project non-negotiables |
| CONTEXT_PACK.md | Step 2.7: Component-specific research |
| SPEC.md | Step 0.1: Confirm component type |
| SPEC.md | Steps 4.1-4.6: Mandatory + conditional sections |

### Component Types Supported

| Type | Location | Key Checks |
|------|----------|------------|
| `foundry-package` | `packages/foundry/*` | Import boundaries, immutability |
| `forge-stage` | `packages/forge/*` | Artifact contracts, receipts |
| `weaver` | `apps/*/weavers/` | Async patterns |
| `worker` | `apps/*/workers/` | Async patterns |
| `engine` | `apps/*/engine/` | Async patterns |
| `ux` | `apps/*/ux/` | React/TypeScript |

### Test Count Formula (Replaced Fixed Count)

**v2:** Fixed test expectations
**v3:** Formula-based calculation

```
Base: 20 tests
+ 5 per Pydantic model
+ 3 per cross-field validator
+ 3 per external dependency
+ 2 per async function
+ 10 if path handling
+ 5 if side effects
```

### Mandatory Verification Sections (SPEC_REVIEW.md)

New A2.x sections (apply to ALL specs):
- A2.1: Import boundary verification (BLOCKING)
- A2.2: Error handling verification (BLOCKING)
- A2.3: Immutability verification (if Pydantic)
- A2.4: Cross-field validation (if Pydantic)
- A2.5: Strictness audit
- A2.6: Test count verification
- A2.7: Library usage verification

### Conditional Checks (SPEC_REVIEW.md)

New A3.x sections (apply based on component type):
- A3.1: Protocol design (foundry-package)
- A3.2: Artifact contract (forge-stage) — BLOCKING
- A3.3: Async patterns (worker/engine/weaver)
- A3.4: React/TypeScript (ux)
- A3.5: Path security — 9 validations (BLOCKING if handling paths)

### Implementation Improvements (IMPLEMENT.md)

- Step 3.5: Library reuse check (avoid reinventing standard libraries)
- Step 6.5: Code size awareness (guidelines for PR size)

### PR Review Enhancements (PR_REVIEW.md)

- Scout context includes component type
- Scout focus matrix by component type
- Phase 4.5: Opus mandatory checks (import boundaries, immutability, test existence)

## Comparison: v2 vs v3 Results

Based on CON-258 (v1 workflow) vs CON-312 (v2 workflow) analysis:

| Aspect | v2 | v3 |
|--------|----|----|
| Test count | Fixed | Formula-based, scales with complexity |
| Import boundaries | Not enforced | BLOCKING verification |
| Pydantic immutability | Not checked | BLOCKING if frozen + mutable collection |
| Cross-field validation | Not checked | BLOCKING if missing validators |
| Artifact contracts | Partial | Full verification for forge-stage |
| Path security | Scout-dependent | 9 mandatory validations |
| Library reinvention | Not flagged | Flagged in review |

## References
- CON-258: Original workflow (v1)
- CON-312: New workflow test (v2)
- CON-313: Comparison analysis
- CON-325: This improvement (v3)
