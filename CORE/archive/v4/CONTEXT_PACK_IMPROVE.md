# Task: Improve Context Pack

Instructions for improving a Context Pack that failed review.

**CRITICAL: One task per checkout.** After completing this task, return to main and STOP.

---

## When to Use This

Use this workflow when:
- Issue is in **Context Pack In Review** state
- Issue has `needs_improve_context_pack` label
- A previous review identified gaps that need to be addressed

---

## Prerequisites

- Issue is in **Context Pack In Review** state
- Issue has `needs_improve_context_pack` label
- Issue has `has_context_pack` label (Context Pack exists)

---

## Context Pack as Source of Truth

**The spec agent cannot look anything up.** They see ONLY what's in the Context Pack:
- Cannot read files you reference
- Cannot search the codebase
- Cannot verify claims against docs

**What you write, the spec agent believes.** This is complete trust — and complete responsibility.

Inaccurate context pack → inaccurate spec → failed implementation. The failure traces back here.

**Do the work:**
- Read the actual files, don't guess what's in them
- Quote the actual docs, don't paraphrase from memory
- Include the actual code, don't just reference it
- Cite your sources so accuracy can be verified

---

## Step 1: Find the Review Feedback

1. **Read the Linear issue comments** to find the review feedback
   - Look for the most recent comment mentioning "NEEDS IMPROVEMENT"
   - Note the specific gaps listed

2. **Find the Context Pack URL** — Look for `**Context Pack:**` in the comments

3. **Read the existing Context Pack**
   ```bash
   python "$REPO_ROOT/project-management/tools/linear.py" document get <document-id>
   ```

---

## Step 2: Claim the Task

```bash
# Swap labels
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --remove-label agent_ready
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --add-label agent_working

# Comment to claim
python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Improving Context Pack based on review feedback."
```

---

## Step 3: Research the Gaps

Based on the review feedback, gather the missing information:

### For Missing Architecture Constraints

1. Read the Design Canon Index (`docs/design_docs/INDEX.md`)
2. Find sections relevant to the identified gaps
3. Read those specific sections in the architecture doc
4. Note exact section headings for citations

### For Missing Acceptance Criteria

1. Review the issue requirements
2. Convert vague criteria into testable conditions (given/when/then)
3. Ensure each criterion is verifiable

### For Missing Edge Cases

1. Consider failure modes for the component
2. Think about: timeouts, missing data, partial outputs, retries, idempotency
3. Document expected behavior for each edge case

### For Missing Patterns

1. Search the codebase for similar implementations
2. **Extract the actual code snippets** — The spec agent cannot read files, so include the relevant code directly in the Context Pack
3. Note file path + line range as the source citation

### For Missing Gotchas (External Libraries/APIs)

If the task involves external libraries or APIs, use the template at `CORE/TEMPLATES/gemini/research-gotchas.md`.

Include findings in the "Potential Gotchas" section with "(Source: Gemini research)" labels.

---

## Step 4: Update the Context Pack

Create an improved version of the Context Pack that addresses ALL the gaps from the review.

**Linear is the source of truth.** Update the existing document (don't create duplicates).

1. **Find the document ID** from the `**Context Pack:**` URL in the Linear comments:
   - Example URL: `https://linear.app/your-team/document/con-123-context-pack-b61c234e4b40`
   - The document ID is the last segment: `b61c234e4b40`

2. **Update the document:**
   ```bash
   python "$REPO_ROOT/project-management/tools/linear.py" document update <document-id> \
     --content-file /tmp/context-pack-CON-XXX-improved.md
   ```

The document URL stays the same — no need to update references in comments.

---

## Step 5: Quality Check Before Uploading

Verify the improved Context Pack passes ALL quality requirements:

**MUST have (required by spec agent):**
- [ ] Clear one-sentence goal
- [ ] Non-goals section populated
- [ ] Architecture constraints with specific section citations
- [ ] Acceptance criteria that are testable
- [ ] Source Map with at least 2-3 entries

**SHOULD have:**
- [ ] Impact map identifying affected components
- [ ] Edge cases and failure modes
- [ ] Existing patterns to copy — with actual code snippets, not just file paths
- [ ] Potential gotchas from Gemini research (if external libs/APIs involved)

**Specifically addresses:**
- [ ] All gaps mentioned in the review comment
- [ ] All "What the spec agent will need" requests

**Accuracy requirements:**
- [ ] Every architecture constraint cites its source doc + section
- [ ] Every code pattern includes actual code with file path + line range
- [ ] Every gotcha cites ai_doc or research source
- [ ] No "see file X" without the actual content included

---

## Step 6: Update Linear

After improvement, move directly to Ready for Spec (no re-review needed):

```bash
# Move to Ready for Spec
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --state "Ready for Spec"

# Remove the improvement label
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --remove-label needs_improve_context_pack

# Swap working → ready
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --remove-label agent_working
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --add-label agent_ready

# Comment noting completion
python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Context Pack improved.

**Context Pack:** <URL>

**Improvements made:**
1. <improvement 1>
2. <improvement 2>

**Gaps addressed:**
- <gap from review → how it was addressed>

Ready for spec work.

**Next steps:** Run \`/checkout CON-XXX\` to start spec work."
```

---

## Step 7: Report to Human and STOP

Report the outcome and **STOP**. Do not continue to other tasks.

```
Context Pack improvement complete for CON-XXX.

**Status:** Ready for Spec
**Context Pack:** <URL>

**Improvements made:**
- <list improvements>

**Next steps:** Run `/checkout CON-XXX` to start spec work.
```

**Return to main:**
```bash
git checkout main
```

---

## What Happens Next

After improvement:
1. Issue moves to "Ready for Spec" state
2. Next `/checkout` routes to SPEC.md
3. No re-review needed — improvement is trusted

---

## If You Need Human Input

If gaps require human decisions that you cannot resolve:

```bash
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --add-label human_input
python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Context Pack improvement blocked.

**Requires human decision:**
- <question 1>
- <question 2>

Please resolve these questions, then run \`/checkout CON-XXX\` to continue."
```

Do NOT change state until human resolves the questions.
