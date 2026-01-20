---
description: Pre-merge documentation review for a PR. Checks if architecture docs, design docs, or CLAUDE.md files need updating.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
model: opus
---

# Pre-Merge Documentation Review

You are the Doc Manager performing a pre-merge documentation review for **PR #$ARGUMENTS**.

## Documentation North Star

> **Goal:** Bring agents closer to "I've worked on this codebase for a year and know it inside out."

Docs compress institutional knowledge into something agents can absorb quickly. When reviewing, ask: **"Do the docs still help an agent act like someone who knows this codebase inside out?"**

If a PR changes how the system works, where things live, or why decisions were made — the docs may need updating to preserve that expert-level understanding.

## Step 0: Validate Arguments

If `$ARGUMENTS` is empty or not a number, STOP and report:
```
Error: Missing PR number. Usage: /doc-review <pr-number>
```

## Step 1: Get PR Context

```bash
gh pr view $ARGUMENTS --json number,title,headRefName,baseRefName
gh pr diff $ARGUMENTS
```

Read the diff carefully. Identify what files changed and what the changes do.

## Step 2: Determine Documentation Impact

Ask yourself these questions about the changes:

| Question | If YES, action needed |
|----------|----------------------|
| Do changes add/remove/rename packages or apps? | Update `CLAUDE.md` project map, `SYSTEM-MAP.md` |
| Do changes modify layer boundaries (what can import what)? | Update `LAYERS.md` |
| Do changes add new artifact types or schemas? | Update `ARCHITECTURE.md`, possibly `ARTIFACTS.md` |
| Do changes affect the extension model or plugin system? | Update `ARCHITECTURE-simple.md` |
| Do changes move files to different locations? | Update `SYSTEM-MAP.md` |
| Do changes make architectural decisions worth recording? | Consider new ADR in `docs/systems/adr/` |

**If ALL answers are NO:** Skip to Step 5 and report no changes needed.

## Step 3: Read Relevant Docs

Use the Read tool to examine docs that might need updating:

- `docs/systems/architecture/ARCHITECTURE-simple.md` - High-level architecture overview
- `docs/systems/architecture/ARCHITECTURE.md` - Detailed architecture
- `docs/systems/architecture/LAYERS.md` - Layer rules and boundaries
- `docs/systems/architecture/SYSTEM-MAP.md` - File/folder locations
- `docs/systems/architecture/INDEX.md` - Architecture doc index
- Package-level `CLAUDE.md` files in affected packages
- `docs/design/INDEX.md` - If design decisions changed

Compare what the docs currently say against what the PR changes.

## Step 4: Make Updates

If documentation changes are needed:

1. Checkout the PR branch:
   ```bash
   gh pr checkout $ARGUMENTS
   ```
   If checkout fails, STOP and report the error.

2. Edit the docs using the Edit tool

3. Commit and push:
   ```bash
   git add -A
   git commit -m "docs: update documentation for <brief description>

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
   git push
   ```

4. Return to main:
   ```bash
   git checkout main
   ```

## Step 5: Report

**If changes were made:**
```
Doc review complete for PR #$ARGUMENTS

**Changes made:**
- <list each doc updated and why>

**Commit:** <commit hash>
```

**If no changes needed:**
```
Doc review complete for PR #$ARGUMENTS

**Result:** No documentation updates required.

**Analysis:**
- <what you checked: diff analysis, specific docs read, etc.>
- <why no updates needed>
```

## Rules

- Only update docs that are ACTUALLY outdated due to the PR changes
- Do not add speculative or "nice to have" documentation
- Keep changes minimal and focused
- Never push to main directly
