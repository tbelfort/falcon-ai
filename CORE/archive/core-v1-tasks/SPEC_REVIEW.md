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

## A1: Comment to Claim

```bash
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Starting spec review."
```

## A2: Read and Review

1. **Read the spec file** at the path from comments
2. **Read any ai_docs** referenced in the spec
3. **Review against checklists below**

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

1. **Comment with approval:**
   ```bash
   python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Spec review complete — approved.

   **Review summary:**
   - Spec is clear and complete
   - Requirements are well-defined
   - Ready for implementation

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
   - Example URL: `https://linear.app/your-team/document/con-123-spec-title-b61c234e4b40`
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

