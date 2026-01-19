# Context Pack — CON-XXX: <title>

**Issue:** [CON-XXX](https://linear.app/content-foundry/issue/CON-XXX)
**Project:** <project-name>
**Created:** <date>

---

## 0) One-Sentence Goal

<!-- What changes for a user/system when done? One sentence only. -->

---

## 1) Problem Framing

**Current behavior:**
<!-- How does the system work today? What's missing or broken? -->

**Desired behavior:**
<!-- What should happen after this work is complete? -->

**Non-goals:**
<!-- What this work explicitly will NOT do. Be specific. -->
-

---

## 2) Scope Boundaries

**In scope:**
<!-- What this work WILL include -->
-

**Out of scope:**
<!-- What this work WILL NOT include (even if related) -->
-

**Explicit "won't do" list:**
<!-- Things that might seem like they should be included but are deliberately excluded -->
-

---

## 3) Architecture Constraints (Hard)

<!-- CRITICAL: Extract the actual rules here. The spec agent will NOT read architecture docs. -->
<!-- Copy rules verbatim from the source docs. Do NOT say "see X for details". -->

### 3.1) Component Type

**Type:** `[TYPE: <type>]`
<!-- One of: foundry-package, forge-stage, weaver, worker, engine, ux -->

### 3.2) Import Boundaries

<!-- Extract from LAYERS.md and COMPONENT-TYPES.md for this component type -->

**This component MUST NOT import:**
- <!-- List specific forbidden imports, e.g., "apps.*", "foundry_pipeline" -->

**Allowed imports:**
- <!-- List what it CAN import -->

### 3.3) Component-Specific Requirements

<!-- Extract from COMPONENT-TYPES.md requirements matrix. Check which apply. -->

| Requirement | Applies? | Details |
|-------------|----------|---------|
| Artifact contract declaration | | |
| Receipt requirements (side effects) | | |
| Async pattern compliance | | |
| Path security validation | | |
| Pydantic immutability | | |
| TypeScript types (no unjustified `any`) | | |
| React component tests | | |

### 3.4) Path Security (IF handling artifact paths)

<!-- Extract ALL 9 validations from SECURITY.md. Skip if not handling paths. -->

**Required validations (all 9 mandatory):**
1. Reject absolute paths (starting with `/`)
2. Reject parent traversal (`..`)
3. Reject backslash (`\`)
4. Reject empty segments (`//`)
5. Reject leading whitespace
6. Reject trailing whitespace
7. Reject whitespace-only paths
8. Reject null bytes (`\x00`)
9. Reject empty strings

### 3.5) Pydantic Requirements (IF using frozen models)

<!-- Extract from COMPONENT-TYPES.md. Skip if no frozen Pydantic models. -->

**Immutable collection types (REQUIRED for frozen=True):**
| Mutable (WRONG) | Immutable (CORRECT) |
|-----------------|---------------------|
| `list[X]` | `tuple[X, ...]` |
| `set[X]` | `frozenset[X]` |

**Cross-field validation patterns:**
- No collision between inputs/outputs
- No duplicates within collections
- Conditional requirements (e.g., error required when status='error')

### 3.6) Test Requirements

<!-- Extract from QUALITY-ATTRIBUTES.md -->

**Minimum test count formula:** Base 20, plus:
- +5 per Pydantic model
- +3 per cross-field validator
- +3 per external dependency
- +2 per async function
- +10 if path handling
- +5 if side effects

**Required test categories:**
- Mandatory: Unit tests, import boundary test, error handling tests
- Conditional: Path security (9 tests), async tests, artifact contract tests, immutability tests

### 3.7) Error Handling

<!-- Extract from QUALITY-ATTRIBUTES.md -->

**Required patterns:**
- Use FoundryError taxonomy (inherit from foundry-errors)
- Include error context dict
- No bare `except Exception`
- No swallowed errors

### 3.8) Async Requirements (IF weaver/worker/engine)

<!-- Extract from COMPONENT-TYPES.md. Skip if not async component. -->

**Required patterns:**
| Requirement | Description |
|-------------|-------------|
| Timeout specification | All async functions must specify timeouts |
| Cancellation handling | Must clean up resources on cancellation |
| Blocking operation identification | Must document any sync operations and justification |

### 3.9) UX Requirements (IF ux component)

<!-- Extract from COMPONENT-TYPES.md. Skip if not UX component. -->

**Required patterns:**
- TypeScript types required (no unjustified `any`)
- Component props must be documented with types
- State management must match existing patterns in the codebase
- Component render tests required

### 3.10) Other Architecture Constraints

<!-- Any other constraints from ARTIFACTS.md, EXECUTION-MODEL.md, etc. -->

- **Artifact IO:**
- **Execution model:**
- **Other:**

---

## 4) Impact Map

**Components/layers touched:**
<!-- List agentic folders that will be modified -->
-

**Expected dependency direction:**
<!-- How do the changes flow? Does X call Y, or vice versa? -->

**Files/dirs likely involved:**
<!-- Best guess based on exploration -->
-

---

## 5) Data / Artifact Contract Changes

**Artifacts read:**
<!-- Existing artifacts this work will consume -->
-

**Artifacts written:**
<!-- New or modified artifacts this work will produce -->
-

**Manifest/receipt expectations:**
<!-- Multi-file outputs, side effect receipts -->
-

**Compatibility notes:**
<!-- Versioning, migration, backwards compatibility -->
-

---

## 6) Existing Patterns to Copy

<!-- IMPORTANT: Extract the actual code patterns here. The spec agent cannot read files. -->
<!-- Include the relevant code snippets, not just file paths. -->

### Pattern 1: <pattern name>

**Source:** `<file path>:<line range>`
**Why relevant:** <rationale>

```python
# Extract the actual code pattern here
# The spec agent cannot read files, so include the snippet
```

### Pattern 2: <pattern name>

**Source:** `<file path>:<line range>`
**Why relevant:** <rationale>

```python
# Another code pattern
```

---

## 7) Acceptance Criteria (Testable)

<!-- These become the backbone of the spec's MUST requirements -->

- [ ] Given ... when ... then ...
- [ ] Given ... when ... then ...
- [ ]

---

## 8) Edge Cases and Failure Modes

<!-- Consider: timeouts, missing artifacts, partial outputs, retries, idempotency -->

| Scenario | Expected Behavior |
|----------|-------------------|
| | |

---

## 8.5) Potential Gotchas (from research)

<!-- From Gemini research on external libraries/APIs/patterns. Label sources. -->
<!-- Skip this section if no external dependencies or research was needed. -->

### Library-Specific
<!-- Gotchas for specific libraries that will be used -->
-

### Pattern-Specific
<!-- Gotchas for patterns like async, caching, retries, etc. -->
-

### Version-Specific
<!-- Issues with Python 3.12.x or specific library versions -->
-

### Combination Issues
<!-- Problems when libraries interact with each other -->
-

---

## 9) Open Questions / Required Decisions

**BLOCKER** (must be answered before implementation):
-

**NON-BLOCKER** (can be deferred or decided during implementation):
-

---

## 10) Source Map (Internal Pointers)

<!-- This is what makes the Context Pack work — cite specific sections -->

**Architecture doc:**
| Section | Heading | Relevance |
|---------|---------|-----------|
| | | |

**Design docs:**
| Document | Heading | Relevance |
|----------|---------|-----------|
| | | |

**Prior specs:**
| Spec | Constraint | Relevance |
|------|------------|-----------|
| | | |
