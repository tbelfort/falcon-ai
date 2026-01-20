---
description: Create a Linear issue to propose documentation changes
argument-hint: <brief-title>
allowed-tools: Bash
---

# Create Documentation Change Request

You want to make a change to `docs/`. Since you are not the Doc Manager or Architect, you must create a Linear issue instead of editing directly.

## Arguments

`$ARGUMENTS` should be a brief title for the documentation change (e.g., "Add error taxonomy docs", "Update LAYERS.md with new rule").

If `$ARGUMENTS` is empty, ask the user what documentation change they want to propose.

## Step 1: Gather Information

Ask the user (or determine from context):

1. **What doc?** — Which file or folder in `docs/` needs to change?
2. **What change?** — Create new doc? Edit existing? Delete?
3. **Why?** — What problem does this solve? Why is it needed now?
4. **Content** — What should the doc contain? (Get the actual content or a detailed outline)

## Step 2: Create the Linear Issue

# Use /linear-tool skill for Linear operations

Create an issue with:
- Team: `<CONFIG>Linear team</CONFIG>`
- Project: `<CONFIG>Default project</CONFIG>`
- State: "Todo"
- Label: docs
- Description using this template:

```markdown
## Documentation Change Request

**Requested by:** Agent [Model Name] $AGENT_NAME
**Target:** <path in docs/>
**Change type:** <Create | Edit | Delete>

---

## Why This Change Is Needed

<Explain the problem or gap this addresses>

---

## Proposed Content

<The actual doc content or detailed outline goes here>

```markdown
<If creating/editing, include the full proposed content>
```

---

## Supporting Context

<Any additional context: related issues, code that prompted this, etc.>
```

## Step 3: Report

Tell the user:

```
Created documentation change request: CON-XXX

**Title:** <title>
**Target:** <docs/ path>

A Doc Manager or Architect will review and implement this change.

**Linear:** <URL>
```

## Rules

1. **Never edit docs/ directly** — This command exists because you can't
2. **Include actual content** — Don't just describe what should be written; write it
3. **Label must be `docs`** — This is what authorizes the Doc Manager to act
4. **Be specific** — Vague requests ("update the docs") will be rejected
