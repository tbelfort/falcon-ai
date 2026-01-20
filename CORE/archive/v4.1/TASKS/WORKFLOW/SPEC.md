# Task: Write a Specification

Instructions for writing specs. Read after checking out a task that needs a spec.

---

## Prerequisites

- Issue is in **Context Pack Drafted** or **Spec In Progress** state
- No `has_spec` label on the issue

> **If issue is in Ready to Start state:** STOP — no spec work needed. The issue is ready for implementation.

> **If issue is in Todo state:** FAIL and tell human:
> "Issue needs Context Pack first. Status should be 'Context Pack Drafted' before starting spec work."

---

## Source of Truth

**Linear is the source of truth for specs.** The Linear document is canonical; the file on disk is a convenience copy.

- If a spec exists in Linear → that's the valid spec
- If no spec exists in Linear → any spec on disk is outdated/invalid; create a new one
- When updating a spec, update the Linear document first, then sync to disk

---

## Step 0: Read Context Pack (REQUIRED)

All issues in "Context Pack Drafted" state have a Context Pack. Read it before starting spec work:

1. Look for `**Context Pack:**` URL in Linear comments
2. Read the Context Pack document
3. Note its Source Map entries (for citations in your spec — do NOT read those files)
4. Ensure your spec addresses all acceptance criteria from the Context Pack

---

## Step 0.1: Confirm Component Type (REQUIRED)

Read the Context Pack's Section 0 for the `[TYPE: ...]` tag.

**Record it here for your spec work:**
- Component type: _______________

This determines which conditional requirements apply throughout spec writing. The Context Pack should include the relevant component-specific requirements.

---

## Step 0.25: Read Architecture Quick Reference (Required)

Before drafting requirements, read:
- `docs/systems/architecture/ARCHITECTURE-simple.md`

That's it. This is the only architecture doc you read directly.

---

## CRITICAL: Do Not Load Additional Docs

> **YOUR CONTEXT IS COMPLETE.** The Context Pack + ARCHITECTURE-simple.md is everything you need.
>
> **DO NOT:**
> - Read `docs/systems/architecture/INDEX.md`
> - Read any other files under `docs/`
> - Open "referenced docs" or "cited sections"
> - Load additional context "just to be thorough"
>
> **WHY:** The Context Pack agent already did all the reading. They extracted exactly what you need — no more, no less. Loading additional docs floods your context window and defeats the entire purpose of Context Packs.
>
> **If the Context Pack is missing something:** Flag it with `needs_improve_context_pack` (Step 0.5). Do NOT compensate by reading more docs yourself.

If the work impacts dependency boundaries or artifact contracts, include a short **Architecture considerations** section in the spec. Use citations from the Context Pack's Source Map — do not read the cited docs yourself.

---

## Step 0.5: Evaluate Context Pack Quality (REQUIRED if Context Pack exists)

**Before proceeding with spec work**, evaluate whether the Context Pack provides sufficient information.

### Quality Checklist

The Context Pack MUST have:
- [ ] Clear one-sentence goal
- [ ] Non-goals section populated (prevents scope creep)
- [ ] Architecture constraints with specific section citations
- [ ] Acceptance criteria that are testable
- [ ] Source Map with at least 2-3 entries

The Context Pack SHOULD have:
- [ ] Impact map identifying affected components
- [ ] Edge cases and failure modes
- [ ] Existing patterns to copy (if applicable)
- [ ] Potential gotchas from Gemini research (if external libs/APIs involved)

### If Context Pack is Insufficient

If the Context Pack is missing critical information needed to write the spec:

1. **Do NOT proceed with spec work**

2. **Add the improvement label:**
   ```bash
   python project-management/tools/linear.py issue update CON-XXX --add-label needs_improve_context_pack
   ```

3. **Comment with specific gaps** (be detailed):
   ```bash
   python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Context Pack needs improvement before spec work can proceed.

   **Missing or insufficient information:**
   1. <specific gap 1 - e.g., 'No architecture constraints cited for artifact IO'>
   2. <specific gap 2 - e.g., 'Acceptance criteria are vague - need testable conditions'>
   3. <specific gap 3 - e.g., 'Missing edge cases for timeout scenarios'>

   **What I need to write the spec:**
   - <specific request 1>
   - <specific request 2>

   **Recommended sections to expand:**
   - Section 3 (Architecture Constraints): Add citations for <specific topic>
   - Section 7 (Acceptance Criteria): Make <criterion> testable
   - Section 8 (Edge Cases): Add <scenario>

   Waiting for Context Pack improvement."
   ```

4. **Swap labels and stop:**
   ```bash
   python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
   python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready
   ```

5. **Checkout main and stop:**
   ```bash
   git checkout main
   ```

Another agent will improve the Context Pack. When `needs_improve_context_pack` is removed, the issue will return to "Context Pack Drafted" state for spec work to retry.

### If Context Pack is Sufficient

If the Context Pack passes the quality checklist, proceed to Step 0.75.

---

## Step 0.75: Check for Existing Spec in Linear

**Before writing a new spec**, check if one already exists in Linear.

1. **Look for spec URL in Linear comments:**
   - Search comments for `**Spec Doc:**` or `**Spec:**` URLs

2. **If spec exists in Linear:**
   - Read the existing spec document from Linear
   - If the issue is in "Spec In Progress" state, you're updating the existing spec
   - Download/copy the Linear spec content to the disk location before editing
   - Do NOT use any spec file already on disk — Linear is the source of truth
   - Proceed to Step 1 to create branch and continue with updates

3. **If NO spec exists in Linear:**
   - Any spec file on disk is outdated or invalid — ignore it
   - Proceed to Step 1 to create a new spec from scratch

---

## Step 1: Create Branch

**Before any file changes**, create a branch using Linear's branch name:

```bash
# Get issue details (includes branchName from Linear)
python project-management/tools/linear.py issue get CON-XXX

# Create branch using Linear's branch name (from "Branch:" field above)
git checkout main && git pull
git checkout -b <branchName-from-linear>
```

**IMPORTANT:** Always use the `branchName` from Linear for consistency across all agents. Do not create custom branch names.

---

## Step 2: Claim the Task

```bash
# Update status
python project-management/tools/linear.py issue update CON-XXX --state "Spec In Progress"

# Swap labels (remove agent_ready if present, add agent_working)
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_ready
python project-management/tools/linear.py issue update CON-XXX --add-label agent_working

# Comment to claim
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Starting spec work. Branch: <branchName-from-linear>"
```

---

## Step 3: Research External Dependencies (Opus Owns, Gemini Assists)

**You own the ai_docs.** Gemini is your research assistant, not the author. You decide what goes into ai_docs and verify completeness.

### 3.1: Identify All External Dependencies

**Use extended thinking** to enumerate every external dependency:

1. **From the Context Pack:**
   - What libraries are mentioned in Section 6 (Patterns)?
   - What dependencies are implied by the approach?

2. **From the spec requirements you're about to write:**
   - HTTP client? (httpx, aiohttp, requests)
   - Validation? (pydantic, attrs, dataclasses)
   - Async? (asyncio patterns, task groups)
   - CLI? (click, typer, argparse)
   - Testing? (pytest, pytest-asyncio)

3. **From architecture constraints:**
   - What does ARCHITECTURE-simple.md say about allowed libraries?
   - Are there version constraints in pyproject.toml?

**Write down every library/API that will be used.** This is your dependency manifest.

### 3.2: Check Existing ai_docs

Before researching, check if ai_docs already exist:

```bash
ls -la <PACKAGE>/ai_docs/
```

For each existing ai_doc:
- Is it relevant to this task?
- Is the version still current? (Check pyproject.toml)
- Does it cover the use case you need?

### 3.3: Research Loop (Gemini as Assistant)

For each dependency that needs ai_docs (new or outdated), run a research loop:

#### Step A: Ask Gemini for Research

Use the template at `CORE/TEMPLATES/research/ai-docs-research.md`.

**Important:** Gemini returns research TO YOU. It does NOT create files.

```bash
gemini -y -m gemini-3-flash-preview -p "Research <LIBRARY> for <USE_CASE>.

Context: <WHAT_WE_ARE_BUILDING>
Constraints: <ARCHITECTURE_CONSTRAINTS>

Return:
1. Recommended version for Python 3.12.x
2. API patterns for our use case (with code examples)
3. Gotchas and edge cases
4. Known issues with <OTHER_LIBRARIES_WE_USE>

DO NOT create files. Return the full research content for me to review."
```

#### Step B: Evaluate Research (Extended Thinking)

**Use extended thinking** to process Gemini's response:

1. **Completeness check:**
   - Does this cover all the APIs we'll use?
   - Are there gaps in edge case coverage?
   - Are the code examples relevant to OUR use case?

2. **Accuracy check:**
   - Do the version recommendations match our constraints?
   - Are there any claims that seem wrong or outdated?
   - Cross-reference with official docs if uncertain.

3. **Gap identification:**
   - What questions remain unanswered?
   - What scenarios aren't covered?
   - What combination issues need more investigation?

#### Step C: Request More Research (If Needed)

If gaps exist, ask Gemini for more:

```bash
gemini -y -m gemini-3-flash-preview -p "Follow-up research for <LIBRARY>:

The previous research was missing:
1. <GAP_1>
2. <GAP_2>

Specifically, I need:
- <SPECIFIC_QUESTION_1>
- <SPECIFIC_QUESTION_2>

Return additional research content."
```

**Repeat Steps B-C until satisfied.** You are the quality gate.

#### Step D: Write the ai_doc

Once research is complete, **you write the ai_doc**:

```bash
# Create the ai_docs directory if needed
mkdir -p <PACKAGE>/ai_docs/

# Write the ai_doc (you author this, not Gemini)
```

**ai_doc structure:**

```markdown
# ai_doc: <library>-<use-case>

**Task:** CON-XXX
**Library:** <name> <version>
**Created:** <date>
**Last verified:** <date>

## Our Use Case

<1-2 sentences on how we use this library>

## Recommended Version

<version> — verified compatible with Python 3.12.x and <other libraries>

## API Patterns (For Our Use Case)

<Code examples specific to what we're building>

## Gotchas

1. <gotcha> — <mitigation>
2. <gotcha> — <mitigation>

## Combination Issues

- With <other lib>: <issue and mitigation>

## Sources

- Official docs: <url>
- Gemini research: <date>
```

### 3.4: Final Verification Checklist

**Before proceeding to write the spec**, verify:

- [ ] **All dependencies covered:** Every library in the dependency manifest has an ai_doc
- [ ] **Versions verified:** ai_doc versions match pyproject.toml constraints
- [ ] **Use cases covered:** ai_docs address OUR specific use case, not generic usage
- [ ] **Gotchas documented:** Each ai_doc has a Gotchas section
- [ ] **Combination issues checked:** Library interactions are documented
- [ ] **No orphan dependencies:** No library is used in the spec without an ai_doc

**If any check fails, go back to Step 3.3.**

---

## Step 4: Write the Spec

### Location

Place specs in the `specs/` folder of the package being modified:
- `src/packages/foundry/foundry-core/specs/`
- `src/packages/forge/forge-web/specs/`
- `src/apps/intent-atlas/specs/`

### Spec Content

A good spec includes:

1. **Summary** — What this implements
2. **Requirements** — MUST/SHOULD/MAY rules
3. **Dependencies** — Libraries with exact versions:
   ```markdown
   ## Dependencies

   | Library | Version | ai_doc | Verified |
   |---------|---------|--------|----------|
   | httpx | ^0.27.0 | ai_docs/httpx-async-fetching.md | ✓ |
   | pydantic | ^2.5.0 | ai_docs/pydantic-validation.md | ✓ |
   ```
4. **Interface** — Function signatures, types, contracts
5. **Behavior** — Edge cases, error handling
6. **Known Issues & Mitigations** — From ai_docs (you verified these):
   ```markdown
   ## Known Issues & Mitigations

   ### Library-Specific Gotchas
   - <gotcha from ai_docs> → <how we'll handle it>

   ### Library Combination Issues
   - <combination issue, e.g., 'httpx async client + pydantic model serialization'> → <mitigation>
   ```
7. **Testing** — Required test cases (include tests for gotchas)
8. **ai_docs References** — Link to the ai_docs you created:
   ```markdown
   ## References

   - See `ai_docs/httpx-async-fetching.md` for HTTP client patterns and gotchas
   - See `ai_docs/pydantic-validation.md` for model definitions and edge cases
   ```

**CRITICAL:** Every library in the Dependencies table MUST have a corresponding ai_doc. If you find yourself adding a dependency without an ai_doc, STOP and go back to Step 3.

---

### Step 4.1: Write Spec Sections

Your Context Pack contains all the rules and constraints you need. Use it to write the spec sections.

**Mandatory sections (all specs):**
- Import Boundaries
- Error Handling
- Testing

**Conditional sections (based on component type from Context Pack):**
- Model Immutability (if Pydantic frozen models)
- Artifact Contract (if forge-stage)
- Async Behavior (if worker/engine/weaver)
- Path Security (if handling paths)
- Component Specification (if ux)

**Your Context Pack tells you which sections apply and what rules to follow.** If you're unsure what rules apply, flag the Context Pack as insufficient (Step 0.5) — do NOT go read architecture docs yourself.

---

## Step 5: Commit and Push

```bash
git add .
git commit -m "spec: <short description>

Spec for CON-XXX: <issue title>"

git push -u origin <branch-name>
```

---

## Step 6: Upload Documents to Linear (Source of Truth)

**Linear is the source of truth.** The spec document in Linear is canonical; the file on disk is a convenience copy for implementation agents.

### Upload the Spec

```bash
# Upload spec to Linear (associate with the project, not the issue)
python project-management/tools/linear.py document create "CON-XXX Spec: <short title>" \
  --content-file <path-to-spec.md> \
  --project <project-name>
```

This returns a URL like `https://linear.app/skyla/document/...` — save it for the comment.

**Important:** If you need to update an existing spec, use `document update`:

```bash
# Get the document ID from the existing Linear URL (the ID is the last part of the URL)
# Example: https://linear.app/your-team/document/con-123-spec-title-b61c234e4b40
# The ID is: b61c234e4b40

# Update the document with new content
python project-management/tools/linear.py document update <document-id> --content-file <path-to-spec.md>
```

### Upload ai_docs

For each ai_docs file created:

```bash
python project-management/tools/linear.py document create "ai_docs: <filename>" \
  --content-file <path-to-ai-doc.md> \
  --project <project-name>
```

Save all URLs for the comment.

---

## Step 7: Update Linear

```bash
# Move to Spec Drafted
python project-management/tools/linear.py issue update CON-XXX --state "Spec Drafted"

# CRITICAL: Swap labels (you started with agent_working, end with agent_ready)
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready

# Comment (REQUIRED format) — include Linear doc URLs
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Spec complete.

**Spec:** <full path to spec, e.g., src/packages/foundry/foundry-core/specs/artifact-store.md>
**Spec Doc:** <Linear document URL>
**Branch:** <branch-name>

**ai_docs created:**
- <ai_docs/file1.md> — <Linear document URL>
- <ai_docs/file2.md> — <Linear document URL>

**Summary:** <what the spec covers>

**Next steps:** Run \`/checkout CON-XXX\` to start spec hardening tests."
```

**REQUIRED:** The comment MUST include:
- `**Spec:**` — Full path in repo (for git checkout)
- `**Spec Doc:**` — Linear document URL (for easy reading without checkout)
- Linear URLs for all ai_docs

---

## Step 8: Report to Human

When complete, output to console:

```
Spec complete for CON-XXX

**Spec file:** <full path to spec>
**Spec Doc:** <Linear document URL>
**Branch:** <branch-name>

**ai_docs created:**
- <file> — <Linear document URL>

**Status:** Spec Drafted — Ready for spec hardening

**Next steps:** Run `/checkout CON-XXX` to start spec hardening tests.
```

---

## Optional: docs/design/

Create design docs for rationale/exploration:
- No approval needed — auto-approved
- Place in `docs/design/<topic>/`
- Inform the human what design_docs you created
