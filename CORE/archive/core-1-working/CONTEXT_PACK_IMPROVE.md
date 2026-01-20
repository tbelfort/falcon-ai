# Task: Improve Context Pack

Instructions for improving a Context Pack that was flagged as insufficient by the spec agent.

---

## When to Use This

Use this workflow when:
- Issue has `needs_improve_context_pack` label
- A spec agent has commented with specific gaps that need to be addressed
- The original Context Pack exists but is incomplete

---

## Prerequisites

- Issue has `has_context_pack` label (Context Pack exists)
- Issue has `needs_improve_context_pack` label (improvement needed)
- Spec agent has commented with specific gaps

---

## Step 1: Understand What's Missing

1. **Read the spec agent's comment** — Find the most recent comment mentioning "Context Pack needs improvement"
2. **Note the specific gaps:**
   - Missing or insufficient information
   - What the spec agent needs to write the spec
   - Recommended sections to expand
3. **Read the existing Context Pack** — Find the `**Context Pack:**` URL in earlier comments

---

## Step 2: Claim the Task

```bash
# Add working label
python project-management/tools/linear.py issue update CON-XXX --add-label agent_working

# Remove ready label (if present)
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_ready

# Comment to claim
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Improving Context Pack based on spec agent feedback."
```

---

## Step 3: Research the Gaps

Based on the spec agent's feedback, gather the missing information:

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

If the task involves external libraries or APIs, use the template at `.claude/CORE/TEMPLATES/gemini/research-gotchas.md`.

Include findings in the "Potential Gotchas" section with "(Source: Gemini research)" labels.

---

## Step 4: Update the Context Pack

Create an improved version of the Context Pack that addresses ALL the gaps.

**Linear is the source of truth.** Update the existing document (don't create duplicates).

1. **Find the document ID** from the `**Context Pack:**` URL in the Linear comments:
   - Example URL: `https://linear.app/your-team/document/con-123-context-pack-b61c234e4b40`
   - The document ID is the last segment: `b61c234e4b40`

2. **Update the document:**
   ```bash
   python project-management/tools/linear.py document update <document-id> \
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
- [ ] All gaps mentioned in spec agent's comment
- [ ] All "What I need to write the spec" requests
- [ ] All "Recommended sections to expand" items

---

## Step 6: Update Linear

```bash
# Remove the improvement-needed label
python project-management/tools/linear.py issue update CON-XXX --remove-label needs_improve_context_pack

# Swap working → ready
python project-management/tools/linear.py issue update CON-XXX --remove-label agent_working
python project-management/tools/linear.py issue update CON-XXX --add-label agent_ready

# Comment noting improvements
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Context Pack improved.

**Context Pack:** Updated in place (same URL as before)

**Improvements made:**
1. <improvement 1 - addressing gap 1>
2. <improvement 2 - addressing gap 2>
3. <improvement 3 - addressing gap 3>

**Sections updated:**
- Section 3 (Architecture Constraints): Added <what>
- Section 7 (Acceptance Criteria): Made <what> testable
- Section 8 (Edge Cases): Added <what>

Ready for spec work to retry.

**Next steps:** Run \`/checkout CON-XXX\` to retry spec work."
```

---

## Step 7: Report to Human

Report: improvements made, Context Pack URL, and next steps (`/checkout CON-XXX`).

---

## What Happens Next

1. The `needs_improve_context_pack` label is removed
2. The `has_context_pack` label remains (pointing to improved version)
3. A spec agent can now checkout and retry spec work
4. The spec agent will re-evaluate the improved Context Pack at Step 0.5

---

## If You Can't Address All Gaps

If some gaps require human input or decisions:

1. Address as many gaps as you can
2. Add `human_input` label for unresolved questions
3. Comment explaining what decisions are needed

```bash
python project-management/tools/linear.py issue update CON-XXX --add-label human_input
python project-management/tools/linear.py issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Context Pack partially improved.

**Addressed:**
- <gap 1>
- <gap 2>

**Requires human decision:**
- <question 1 that needs human input>
- <question 2 that needs human input>

Please resolve these questions, then remove `human_input` label for spec work to proceed."
```

Do NOT remove `needs_improve_context_pack` until all gaps are addressed.
