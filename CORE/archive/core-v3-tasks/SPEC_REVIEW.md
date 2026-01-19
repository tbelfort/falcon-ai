# Task: Spec In Review

Instructions for handling tasks in **Spec In Review** state. This state handles both reviewing AND fixing specs in a loop until approved.

---

## Step 1: Get Issue Details and Determine Action

```bash
python project-management/tools/linear.py issue get CON-XXX --json
```

**Parse the comments (most recent first) to determine what to do:**

| Latest Comment Says | Your Action |
|---------------------|-------------|
| "Spec complete" / "ready for review" | → Go to **Path A: REVIEW** |
| "changes requested" / "issues found" | → Go to **Path B: FIX** |
| "fixed" / "ready for re-review" | → Go to **Path A: REVIEW** (re-review) |

**Also extract from comments:**
- `**Spec:**` — Full path to the spec file (REQUIRED)
- `**Branch:**` — Branch name to checkout

If spec path is missing, **FAIL** and tell human: "No spec path found in comments. Cannot proceed."

---

## Step 2: Checkout Branch and Claim Task

```bash
git fetch origin
git checkout <branch-name>

# Swap labels (remove agent_ready if present, add agent_working)
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_ready
python project-management/tools/linear.py issue update CON-XXX --add-label agent_working
```

---

# Path A: REVIEW the Spec

Use this path when you need to review (or re-review) the spec.

## Review Structure

The spec review has two phases:

### Phase 1: Core Checks (ALWAYS APPLY)
These checks apply to EVERY spec. Failure on any is BLOCKING.

### Phase 2: Conditional Checks (BASED ON TYPE)
These checks apply based on the `[TYPE: ...]` tag in the spec.

---

## Review Accountability

Your agent identity (`$AGENT_NAME`) is recorded in every review comment. Reviews may be audited:

- **Spot-checks:** Reviews are periodically audited to verify analysis depth
- **Downstream tracing:** If implementation struggles due to spec gaps, the review is examined

This isn't punitive—it's about ensuring reviews add value. Thorough approvals are as valid as finding issues, but approvals must demonstrate analysis.

---

## A1: Comment to Claim

```bash
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Starting spec review."
```

## A2: Read and Review

1. **Read the spec file** at the path from comments
2. **Read any ai_docs** referenced in the spec
3. **Apply cross-referencing technique below**
4. **Review against checklists below**

### Core Technique: Cross-Referencing

The most valuable review technique is **cross-referencing** — checking that different parts of the spec are consistent with each other.

**How it works:**
1. Find a test case (input → expected output)
2. Find the implementation code/rules that handle this case
3. Verify the implementation actually produces the expected behavior
4. **Flag mismatches** — where tests promise behavior the implementation doesn't deliver

**Example pattern:** A test case expects a certain input to fail validation, but the implementation code has no check for that input type. The test promises behavior the code doesn't deliver. This is exactly the kind of gap that causes implementation failures.

**Apply cross-referencing to:**

| Check | What to Compare |
|-------|-----------------|
| Test ↔ Implementation | Does the implementation code match what tests expect? |
| MUST requirements ↔ Tests | Does every MUST have test coverage? |
| Edge case tables ↔ Validation rules | Do edge cases match the actual validation logic? |
| ai_doc gotchas ↔ Spec mitigations | Is every gotcha addressed in Known Issues? |

---

### Spec Review Checklist

- [ ] **Clarity** — Requirements are unambiguous
- [ ] **Completeness** — All necessary details for implementation
- [ ] **MUST/SHOULD/MAY** — Requirements properly categorized
- [ ] **Dependencies** — Library versions specified with ai_doc references
- [ ] **Interface** — Function signatures and types defined
- [ ] **Behavior** — Edge cases and error handling covered
- [ ] **Testing** — Test cases specified
- [ ] **ai_docs** — References to ai_docs included where needed

### ai_docs Verification (CRITICAL)

**Do NOT assume Gemini completed ai_docs correctly.** You must verify:

#### Step 1: Extract Dependency Manifest

From the spec's Dependencies section, list every external library:
```
Libraries in spec: httpx, pydantic, pytest-asyncio, ...
```

#### Step 2: Check ai_doc Coverage

For each library in the manifest:

- [ ] **ai_doc exists:** Is there an ai_doc file for this library?
  ```bash
  ls <PACKAGE>/ai_docs/ | grep <library>
  ```
- [ ] **ai_doc is referenced:** Does the spec reference it in the Dependencies table?
- [ ] **No orphan dependencies:** Is there any library in the spec that has NO ai_doc?

**If any library lacks an ai_doc, this is a FAIL.** Comment:
> "Missing ai_doc for <library>. All dependencies must have verified ai_docs."

#### Step 3: Verify ai_doc Quality

For each ai_doc, check:

- [ ] **Version matches:** Does the ai_doc version match the spec's version constraint?
  - Check: ai_doc says "httpx 0.27.0", spec says "^0.27.0" ✓
  - Fail: ai_doc says "httpx 0.25.0", spec says "^0.27.0" ✗

- [ ] **Use case covered:** Does the ai_doc address OUR use case, not generic usage?
  - Good: "ai_docs/httpx-async-fetching.md" for async HTTP client usage
  - Bad: Generic "httpx.md" with basic examples

- [ ] **Gotchas section exists:** Does the ai_doc have documented gotchas?
  - If no Gotchas section → suspicious, may be incomplete

- [ ] **Last verified date:** Is the ai_doc recent enough?
  - Check the "Last verified" field
  - If > 3 months old and versions have changed → flag for refresh

#### Step 4: Cross-Check Known Issues

Compare the spec's "Known Issues & Mitigations" section with ai_docs:

- [ ] **All ai_doc gotchas addressed:** Every gotcha in ai_docs should have a mitigation in the spec
- [ ] **No invented issues:** Spec shouldn't claim issues not in ai_docs (unless from other sources)

#### Step 5: Check for Missing Dependencies

**Use extended thinking** to identify libraries that SHOULD have ai_docs but don't:

1. Read the spec's interface and implementation approach
2. What libraries does this obviously require?
3. Are any missing from both the Dependencies table AND ai_docs?

Common misses:
- Testing libraries (pytest-asyncio for async code)
- Type stubs (types-* packages)
- Dev dependencies that affect implementation patterns

**If you find a missing dependency, this is a FAIL.**

### Architecture Compliance

- [ ] Read `docs/architecture/ARCHITECTURE-simple.md` (required)
- [ ] Use `docs/architecture/INDEX.md` to route to relevant subdocs
- [ ] If the spec touches dependency boundaries: read `docs/architecture/LAYERS.md`
- [ ] If the spec touches artifact IO / receipts / manifests: read `docs/architecture/ARTIFACTS.md`
- [ ] Follows layering rules (Forge packs → foundry-core only)
- [ ] Matches existing patterns in the codebase
- [ ] No over-engineering or unnecessary complexity

---

## A2: Mandatory Verification Sections (Phase 1)

### A2.1: Import Boundary Verification (MANDATORY)

**This is a project non-negotiable. Failure is BLOCKING.**

#### Step 1: Identify Component Type
From spec Section 0, what is the `[TYPE: ...]`? _______________

#### Step 2: Check Forbidden Imports

| Component Type | Forbidden Imports | Spec Lists Them? | Test Exists? |
|----------------|-------------------|------------------|--------------|
| foundry-package | `apps/*` | [ ] | [ ] |
| forge-stage | `apps/*`, `foundry_pipeline` | [ ] | [ ] |

#### Step 3: Verify Test Case Exists

- [ ] Test ID for import boundary exists (e.g., IMP-001)
- [ ] Test verifies no forbidden imports at runtime

**Missing import boundary section or test -> BLOCKING**

---

### A2.2: Error Handling Verification (MANDATORY)

#### Checklist

- [ ] **Error types documented:** Spec lists what errors can be raised
- [ ] **Uses FoundryError:** Custom errors inherit from foundry-errors types
- [ ] **Error context:** Errors include context dict with relevant info
- [ ] **No bare exceptions:** Spec doesn't catch bare `Exception`
- [ ] **Test coverage:** Error paths have test cases

**Missing error handling section -> BLOCKING**

---

### A2.3: Immutability Verification (IF PYDANTIC MODELS)

**Skip if spec has no Pydantic models with frozen=True.**

#### Frozen Model Audit

For EACH model with `frozen=True`, check collection fields:

| Model | Field | Declared Type | Immutable? |
|-------|-------|---------------|------------|
| ___ | ___ | `list[X]` | NO - WRONG |
| ___ | ___ | `tuple[X, ...]` | Yes |
| ___ | ___ | `set[X]` | NO - WRONG |
| ___ | ___ | `frozenset[X]` | Yes |

#### Correct Type Mappings

| Mutable (WRONG) | Immutable (CORRECT) |
|-----------------|---------------------|
| `list[X]` | `tuple[X, ...]` |
| `set[X]` | `frozenset[X]` |

**Any frozen model with mutable collection type -> BLOCKING**

---

### A2.4: Cross-Field Validation Verification (IF PYDANTIC MODELS)

**Skip if spec has no Pydantic models with related fields.**

#### Step 1: Identify Related Fields

| Model | Fields | Relationship | Validator Present? |
|-------|--------|--------------|-------------------|
| ___ | inputs, outputs | No path collision | [ ] |
| ___ | status, error | error required when status='error' | [ ] |
| ___ | items, items | No duplicates within list | [ ] |

#### Step 2: Check for Common Missing Validators

- [ ] **Input/output collision:** Same path cannot be in both inputs AND outputs
- [ ] **Duplicate detection:** Same item cannot appear twice in a list
- [ ] **Conditional requirements:** Field B required when Field A has certain value

**Missing validator for identified relationship -> BLOCKING**

---

### A2.5: Strictness Audit (MANDATORY)

#### Strictness Checklist

| Scenario | Strict (Expected Default) | Spec Behavior | Justified? |
|----------|---------------------------|---------------|------------|
| Error status without details | Require error field | ___ | [ ] |
| Path with whitespace | Reject | ___ | [ ] |
| Duplicate entries in list | Reject | ___ | [ ] |
| Missing trailing slash | Reject (not auto-fix) | ___ | [ ] |
| Double slashes in path | Reject | ___ | [ ] |

**Unjustified relaxation of validation -> NON-BLOCKING but flag for discussion**

---

### A2.6: Test Count Verification (MANDATORY)

#### Step 1: Calculate Minimum Using Formula

| Factor | Points | Spec Count | Subtotal |
|--------|--------|------------|----------|
| Base | 20 | 1 | 20 |
| Pydantic models | +5 each | ___ | ___ |
| Cross-field validators | +3 each | ___ | ___ |
| External dependencies | +3 each | ___ | ___ |
| Async functions | +2 each | ___ | ___ |
| Path handling | +10 | ___ | ___ |
| Side effects | +5 | ___ | ___ |
| **MINIMUM REQUIRED** | | | ___ |

#### Step 2: Count Actual Tests in Spec

| Category | Count |
|----------|-------|
| Unit tests | ___ |
| Error handling tests | ___ |
| Edge case tests | ___ |
| Integration tests | ___ |
| Security tests | ___ |
| **TOTAL** | ___ |

#### Step 3: Verdict

- Minimum required: ___
- Actual tests: ___
- Status: Adequate / Insufficient

**Below minimum by >20% -> NON-BLOCKING but flag for hardening phase**

---

### A2.7: Library Usage Verification (MANDATORY)

#### Step 1: Check for Reinvention

| Custom Code in Spec | Standard Alternative? | ai_doc Exists? |
|---------------------|----------------------|----------------|
| Custom version parsing | `packaging.version` | [ ] |
| Custom path validation | `pathlib` + validators | [ ] |

#### Common Reinventions to Flag

| Custom Implementation | Should Likely Be |
|----------------------|------------------|
| `SemanticVersion` dataclass | `packaging.version.Version` |
| Custom JSON schema validation | `pydantic` |

**Reinvention of standard library without justification -> NON-BLOCKING but flag**
**Missing ai_doc for external dependency -> BLOCKING**

---

## A3: Conditional Checks (Phase 2 - BASED ON COMPONENT TYPE)

### Determine Which Checks Apply

From spec Section 0, component type is: _______________

| Type | Additional Checks Required |
|------|----------------------------|
| foundry-package | A3.1 (Protocol Design) |
| forge-stage | A3.2 (Artifact Contract) |
| worker/engine/weaver | A3.3 (Async Patterns) |
| ux | A3.4 (React/TypeScript) |
| Any with path handling | A3.5 (Path Security) |

---

### A3.1: Protocol Design Verification (IF foundry-package)

- [ ] Protocols use `@runtime_checkable` decorator if isinstance checks needed
- [ ] Protocol methods have complete type signatures
- [ ] No implementation in protocols (interface only)
- [ ] Protocol documented with usage examples

---

### A3.2: Artifact Contract Verification (IF forge-stage)

- [ ] **All inputs declared:** Every artifact the stage reads is in inputs list
- [ ] **All outputs declared:** Every artifact the stage writes is in outputs list
- [ ] **Side effects have receipts:** Any side effect has corresponding receipt requirement
- [ ] **Multi-file uses manifest:** Multiple output files use manifest with base_prefix
- [ ] **No hidden IO:** Spec explicitly states no direct file access outside ArtifactStore
- [ ] **Test cases exist:** Artifact contract tests (ART-001 through ART-005) present

**Missing artifact declaration or receipt requirement -> BLOCKING**

---

### A3.3: Async Patterns Verification (IF worker/engine/weaver)

- [ ] Async functions have timeout specifications
- [ ] Cancellation handling is documented
- [ ] Blocking operations identified and justified (or stated as none)
- [ ] Test cases for async behavior (ASYNC-001 through ASYNC-003) present

---

### A3.4: React/TypeScript Verification (IF ux)

- [ ] TypeScript types complete (no unjustified `any`)
- [ ] Component props documented with types
- [ ] State management approach matches existing patterns in codebase
- [ ] Test cases for components (UX-001 through UX-003) present

---

### A3.5: Path Security Verification (IF SPEC HANDLES PATHS)

**Skip if spec doesn't handle file/artifact paths.**

#### Path Validation Completeness

ALL 9 validations must be present:

| # | Validation | In Spec? | Test Case? |
|---|------------|----------|------------|
| 1 | Absolute path rejection (`/...`) | [ ] | [ ] |
| 2 | Traversal rejection (`..`) | [ ] | [ ] |
| 3 | Backslash rejection (`\`) | [ ] | [ ] |
| 4 | Empty segment rejection (`//`) | [ ] | [ ] |
| 5 | Leading whitespace rejection | [ ] | [ ] |
| 6 | Trailing whitespace rejection | [ ] | [ ] |
| 7 | Whitespace-only rejection | [ ] | [ ] |
| 8 | Null byte rejection (`\x00`) | [ ] | [ ] |
| 9 | Empty string rejection | [ ] | [ ] |

**Missing any path validation -> BLOCKING (security issue)**

---

### Review Evidence Requirements

Your review comment must include evidence of cross-referencing. This proves you connected multiple parts of the spec rather than reading sections in isolation.

**Minimum evidence:**
- At least one cross-reference check with specific references (test ID/description, function name, requirement ID — whatever identifiers the spec uses). More for complex specs.
- ai_doc verification summary (libraries checked, gotchas addressed) — or note "no external dependencies" if applicable

**Format is flexible** — adapt to the spec's structure. The point is demonstrating you connected multiple sections, not filling a template.

**Example structure (adapt to your spec):**
```
**Cross-Reference Checks:**
- [test case X] → [implementation section Y]: verified, handles expected cases
- [MUST requirement Z] → [test coverage]: gap found — no test for [scenario]

**ai_doc Verification:**
- Libraries: [list, or 'none']
- Gotchas addressed: [N]/[total], or N/A

**Review Quality Note:**
[1-2 sentences explaining what gave you confidence]
```

The "Review Quality Note" demonstrates you thought about the spec holistically, not just checked boxes.

---

## A3: Make Decision

### If Issues Found

**DO NOT change status.** Keep in Spec In Review for the fix cycle.

1. **Comment with issues:**
   ```bash
   python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Spec review complete — changes requested.

   **Issues found:**
   1. [Specific issue]
   2. [Specific issue]

   **Suggestions:**
   - [How to fix each issue]

   **Status:** Spec In Review (awaiting fixes)

   **Next steps:** Run \`/checkout CON-XXX\` to fix spec issues."
   ```

2. **Swap labels:**
   ```bash
   python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
   python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
   ```

3. **Report to human:**
   ```
   Spec review for CON-XXX — changes requested.

   **Spec file:** <path>
   **Issues:** <count> issues found
   **Status:** Spec In Review — awaiting fixes

   **Next steps:** Run `/checkout CON-XXX` to fix spec issues.
   ```

4. **Checkout main:**
   ```bash
   git checkout main
   ```

### If Approved

**IMPORTANT:** Approval requires the structured evidence from above. Approvals without cross-reference evidence may be audited and returned for re-review.

1. **Comment with approval AND evidence:**
   ```bash
   python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Spec review complete — approved.

   **Cross-Reference Checks:**
   - [test/requirement] → [implementation]: [verified or finding]
   (include at least one; more for complex specs)

   **ai_doc Verification:**
   - Libraries: [list, or 'none' if no external deps]
   - Gotchas addressed: [N]/[total], or N/A

   **Review Quality Note:**
   [1-2 sentences on what gave you confidence in this spec — e.g., 'Third review cycle, all prior feedback addressed' or 'Straightforward pattern matching existing X implementation']

   **Spec file:** <full path>

   Moving to Ready to Start.

   **Next steps:** Run \`/checkout CON-XXX\` to begin implementation."
   ```

2. **Add has_spec label and move state:**
   ```bash
   python project-management/tools/linear.py issue update CON-XXX --add-label has_spec
   python project-management/tools/linear.py issue update CON-XXX --state "Ready to Start"
   ```

3. **Swap labels:**
   ```bash
   python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
   python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
   ```

4. **Report to human:**
   ```
   Spec review for CON-XXX — approved.

   **Spec file:** <path>
   **Cross-references verified:** <count> checks performed
   **ai_docs:** <count> libraries verified
   **Status:** Ready to Start — ready for implementation

   **Next steps:** Run `/checkout CON-XXX` to begin implementation.
   ```

5. **Checkout main:**
   ```bash
   git checkout main
   ```

---

# Path B: FIX Spec Issues

Use this path when the latest comment shows issues that need fixing.

## B1: Comment to Claim

```bash
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Fixing spec review issues."
```

## B2: Read the Issues

Parse the previous review comment to find:
- List of issues found
- Suggestions for fixes

## B3: Fix Each Issue

1. **Read the spec file**
2. **Address each issue** from the review comment
3. **Update the spec file** with fixes
4. **Update ai_docs** if needed

## B4: Commit and Push

```bash
git add .
git commit -m "spec: address review feedback

- [Summary of fixes]"

git push
```

## B5: Update Documents in Linear

**Linear is the source of truth.** Update the existing documents (don't create new versions).

1. **Find the document ID** from the `**Spec Doc:**` URL in the Linear comments:
   - Example URL: `https://linear.app/content-foundry/document/con-123-spec-title-b61c234e4b40`
   - The document ID is the last segment: `b61c234e4b40`

2. **Update the spec document:**
   ```bash
   python project-management/tools/linear.py document update <document-id> --content-file <path-to-spec.md>
   ```

3. **If ai_docs were also updated**, find their document IDs and update them too:
   ```bash
   python project-management/tools/linear.py document update <ai-doc-id> --content-file <path-to-ai-doc.md>
   ```

The document URLs stay the same — no need to update references.

## B6: Comment Ready for Re-Review

```bash
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Spec fixes complete — ready for re-review.

**Fixes applied:**
1. [What was fixed for issue 1]
2. [What was fixed for issue 2]

**Spec Doc:** Updated in place (same URL as before)

**Status:** Spec In Review (ready for re-review)

**Next steps:** Run \`/checkout CON-XXX --review\` to re-review the spec."
```

## B7: Swap Labels

```bash
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
```

## B8: Report to Human

```
Spec fixes complete for CON-XXX — ready for re-review.

**Spec file:** <path>
**Spec Doc:** Updated in place (same URL)
**Fixes applied:** <count>
**Status:** Spec In Review — awaiting re-review

**Next steps:** Run `/checkout CON-XXX --review` to re-review the spec.
```

