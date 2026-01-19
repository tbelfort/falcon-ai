# Task: Review Context Pack

Instructions for reviewing a Context Pack to determine if it's ready for spec work.

**CRITICAL: One task per checkout.** After completing this task, return to main and STOP.

---

## When to Use This

Use this workflow when:
- Issue is in **Context Pack In Review** state
- Issue does NOT have `needs_improve_context_pack` label
- A Context Pack has been drafted and needs review

---

## Prerequisites

- Issue is in **Context Pack In Review** state
- Issue has `has_context_pack` label
- Issue does NOT have `needs_improve_context_pack` label

---

## Your Role: Reviewer

You are reviewing the Context Pack to answer ONE question:

**Is there enough information here for a spec agent to write a complete, accurate spec?**

The spec agent will ONLY have:
1. This Context Pack
2. `docs/systems/architecture/ARCHITECTURE-simple.md`

They cannot read any other files. If the Context Pack says "see file X" or "follow the pattern in Y" without including the actual content, that's a failure.

---

## Step 1: Find and Read the Context Pack

1. **Find the Context Pack URL** in the Linear issue comments
   - Look for `**Context Pack:**` followed by a URL

2. **Read the entire Context Pack**
   ```bash
   python "$REPO_ROOT/project-management/tools/linear.py" document get <document-id>
   ```
   (Extract document ID from the URL's last segment)

---

## Step 2: Evaluate Against Quality Checklist

Review the Context Pack against these criteria:

### MUST have (required for spec work):
- [ ] Clear one-sentence goal
- [ ] Non-goals section populated (anti-scope-creep)
- [ ] Architecture constraints with specific section citations
- [ ] Acceptance criteria that are testable (given/when/then or checkable)
- [ ] Source Map with at least 2-3 entries

### SHOULD have (for completeness):
- [ ] Impact map identifying affected components
- [ ] Edge cases and failure modes
- [ ] Existing patterns to copy — **with actual code snippets, not just file paths**
- [ ] Potential gotchas (if external libs/APIs involved)

### CRITICAL checks:
- [ ] **No "see file X" without content** — If a file is referenced, its relevant content must be included
- [ ] **No "follow pattern in Y" without code** — Actual code snippets must be present
- [ ] **Acceptance criteria are testable** — Can a test be written for each one?
- [ ] **Architecture constraints are cited** — Source doc + section for each

---

## Step 3: Make the Decision

### If Context Pack is SUFFICIENT

The Context Pack has enough information for a spec agent to write a complete spec.

```bash
# Move to Ready for Spec
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --state "Ready for Spec"

# Comment with review summary
python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Context Pack review complete — APPROVED.

**Context Pack:** <URL>

**Review summary:**
- Quality checklist: PASSED
- All required sections present and complete
- Spec agent has sufficient context to proceed

Ready for spec work.

**Next steps:** Run \`/checkout CON-XXX\` to start spec work."
```

### If Context Pack NEEDS IMPROVEMENT

The Context Pack is missing critical information or has gaps.

```bash
# Stay in Context Pack In Review (don't change state)
# Add the improvement label
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --add-label needs_improve_context_pack

# Comment with specific gaps
python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Context Pack review complete — NEEDS IMPROVEMENT.

**Context Pack:** <URL>

**Gaps found:**
1. <specific gap 1 — be concrete>
2. <specific gap 2>
3. <etc>

**What the spec agent will need:**
- <specific information that must be added>

**Next steps:** Run \`/checkout CON-XXX\` to improve the context pack."
```

---

## Step 4: Report to Human and STOP

Report the outcome and **STOP**. Do not continue to other tasks.

```
Context Pack review complete for CON-XXX.

**Status:** <Ready for Spec | Needs Improvement>
**Context Pack:** <URL>

**Next steps:** Run `/checkout CON-XXX` to continue.
```

**Return to main:**
```bash
git checkout main
```

---

## What Happens Next

**If approved (Ready for Spec):**
1. Issue moves to "Ready for Spec" state
2. Next `/checkout` routes to SPEC.md

**If needs improvement (label added):**
1. Issue stays in "Context Pack In Review" with `needs_improve_context_pack` label
2. Next `/checkout` routes to CONTEXT_PACK_IMPROVE.md
3. After improvement, goes directly to "Ready for Spec" (no re-review)

---

## If You Need Human Input

If the context pack has fundamental problems requiring human decisions:

```bash
python "$REPO_ROOT/project-management/tools/linear.py" issue update CON-XXX --add-label human_input
python "$REPO_ROOT/project-management/tools/linear.py" issue comment CON-XXX "Agent [Model Name] $AGENT_NAME: Context Pack review blocked.

**Requires human decision:**
- <question 1>
- <question 2>

Please resolve these questions, then run \`/checkout CON-XXX\` to continue."
```

Do NOT change state or add improvement label until human resolves the questions.
