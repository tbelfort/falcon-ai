# Component Types Reference

Quick reference for component-type-specific requirements in the workflow.

## Type Determination

| Location Pattern | Type Tag | Primary Concerns |
|------------------|----------|------------------|
| `packages/foundry/*` | `[TYPE: foundry-package]` | Contracts, protocols, no app/pipeline imports |
| `packages/forge/*` | `[TYPE: forge-stage]` | Artifact IO, receipts, no app/pipeline imports |
| `apps/*/weavers/` | `[TYPE: weaver]` | Pipeline composition, async patterns |
| `apps/*/workers/` | `[TYPE: worker]` | Runtime entry points, async patterns |
| `apps/*/engine/` | `[TYPE: engine]` | Shared services, async patterns |
| `apps/*/ux/` | `[TYPE: ux]` | React components, TypeScript types |

## Requirements Matrix

| Requirement | foundry | forge | weaver | worker | engine | ux |
|-------------|:-------:|:-----:|:------:|:------:|:------:|:--:|
| Import boundary test | Yes | Yes | - | - | - | - |
| Artifact contract | - | Yes | - | - | - | - |
| Receipt requirements | - | Yes | - | - | - | - |
| Async patterns | - | - | Yes | Yes | Yes | - |
| Path security (if paths) | Yes | Yes | - | - | - | - |
| Immutability (if frozen) | Yes | Yes | Yes | Yes | Yes | - |
| Cross-field validation | Yes | Yes | Yes | Yes | Yes | - |
| TypeScript types | - | - | - | - | - | Yes |
| Component tests | - | - | - | - | - | Yes |

## Test Count Formula

**Base:** 20 tests

**Add for each factor:**
| Factor | Points |
|--------|--------|
| Pydantic model | +5 each |
| Cross-field validator | +3 each |
| External dependency | +3 each |
| Async function | +2 each |
| Path handling | +10 (once) |
| Side effects | +5 (once) |

**Example Calculations:**
- Simple forge stage (1 model, no async): 20 + 5 = **25 tests**
- Contracts package (7 models, 4 validators, paths): 20 + 35 + 12 + 10 = **77 tests**
- Async worker (3 models, 2 async functions): 20 + 15 + 4 = **39 tests**

## Forbidden Imports by Type

| Type | MUST NOT Import |
|------|-----------------|
| foundry-package | `apps.*` |
| forge-stage | `apps.*`, `foundry_pipeline` |
| weaver | (no restrictions) |
| worker | (no restrictions) |
| engine | (no restrictions) |
| ux | (no restrictions) |

## Immutable Collection Types

For `frozen=True` Pydantic models:

| Mutable (WRONG) | Immutable (CORRECT) |
|-----------------|---------------------|
| `list[X]` | `tuple[X, ...]` |
| `set[X]` | `frozenset[X]` |
| `dict[K, V]` | (avoid, or use immutable alternative) |

## Path Security Validations (9 Required)

When handling artifact paths, validate ALL:

1. No absolute paths (`/...`)
2. No parent traversal (`..`)
3. No backslashes (`\`)
4. No empty segments (`//`)
5. No leading whitespace
6. No trailing whitespace
7. No whitespace-only
8. No null bytes (`\x00`)
9. No empty strings
