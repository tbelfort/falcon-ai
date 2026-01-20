---
description: Import a build/sprint plan markdown file into Linear as properly-assigned issues
argument-hint: <path-to-build-plan.md>
---

# PM: Build Sprint

You are the Project Manager agent. Your task is to import implementation blocks from a build plan file into Linear.

**Build plan file:** $ARGUMENTS

---

## CRITICAL RULE: Projects = Physical Folders

**Every issue MUST be assigned to a project that maps to an Agentic Folder.** Projects are NOT conceptual groupings. They are physical folder paths in the monorepo.

### Agentic Folders Map

<CONFIG>Project folder mapping</CONFIG>

---

## Step 1: Read the Build Plan

Read the build plan file provided:

```
$ARGUMENTS
```

Identify all implementation blocks (IB###) and note:
- Task ID and title
- Dependencies (`**Depends on:**`)
- Which physical package/folder the work belongs to

---

## Step 2: Determine Project for Each Task

For EACH implementation block, determine which Agentic Folder project it belongs to based on:

1. **Explicit package references** in the task (e.g., "Implement `<module>`" → `<project>`)
2. **Folder path mentions** (e.g., "<CONFIG>Source directory</CONFIG>/<module>" → `<project>`)
3. **Module type** (based on <CONFIG>Component types</CONFIG>)

Common patterns:

<CONFIG>Project mapping patterns</CONFIG>

**If you cannot determine the project, STOP and ask the human.**

---

## Step 3: Add Project Fields to the Build Plan

The build plan MUST have `**Project:**` fields for each task. If they're missing, **you must add them**.

Format for each block:
```markdown
## IB### — Title here
**Depends on:** IB001, IB002 (or "none")
**Project:** <project-name>

### Goal
...
```

**After adding all Project fields, you MUST run validation before proceeding.**

---

## Step 4: Validate with the CLI Tool

**This step is MANDATORY after adding Project fields.**

Run validation to check for errors:

# Use /linear-tool skill for Linear operations

The validation checks:
- Every block has a `**Project:**` field
- All projects are valid Agentic Folder names
- All dependencies reference existing blocks

**If validation fails:**
1. Read the error messages
2. Fix the issues in the markdown file
3. Run validation again
4. Repeat until validation passes

**DO NOT proceed to Step 5 until validation passes.**

---

## Step 5: Dry Run

Preview what would be created:

# Use /linear-tool skill for Linear operations

Review the output. Confirm:
- Tasks are grouped by correct projects
- Dependencies are correctly parsed
- No missing or misassigned projects

---

## Step 6: Import to Linear

If dry run looks good, import:

# Use /linear-tool skill for Linear operations

This will:
1. Create all projects in Linear (if they don't exist)
2. Create all issues in their correct projects
3. Create blocked-by relationships
4. Update the markdown file with Linear links

---

## Step 7: Verify in Linear

After import, verify:
1. Issues appear in correct projects
2. Dependencies are linked correctly
3. All issues are in Backlog state

---

## Error Handling

**If validation fails:**
- Read the error messages carefully
- Fix the `**Project:**` fields in the markdown
- Re-run validation

**If project is ambiguous:**
- Ask the human: "Which project should IB### belong to?"
- Provide options from the Agentic Folders map

**If import fails:**
- Check Linear API key is set
- Check project names match exactly
- Try creating projects manually first

---

## DO NOT

- Create umbrella/conceptual projects like "Initial Build" or "Phase 1"
- Skip the validation step
- Guess at project assignments without checking the code references
- Import without `--dry-run` first
