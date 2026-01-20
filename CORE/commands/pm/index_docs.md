---
description: Check all docs/ folders and update INDEX.md files with missing entries
argument-hint: "[--check-only] (optional - only report missing entries, don't update)"
---

# PM: Index Docs

You are the Project Manager agent. Your task is to scan all `docs/` folders, find any markdown files not listed in their INDEX.md, and update the indexes.

**Arguments:** $ARGUMENTS

---

## Overview

The `docs/` folder has several subfolders, each with an INDEX.md that should reference all documents in that folder. This command ensures those indexes stay up to date.

---

## Step 1: Find All INDEX.md Files

Scan for all INDEX.md files in the docs folder:

```bash
find docs -name "INDEX.md" -type f
```

Expected locations:
- `docs/systems/architecture/INDEX.md`
- `docs/design/INDEX.md`
- `docs/support/incidents/INDEX.md`
- `docs/support/ops/INDEX.md`

---

## Step 2: For Each INDEX.md, Check for Missing Files

For each folder containing an INDEX.md:

1. **List all .md files in that folder** (excluding INDEX.md and README.md):
   ```bash
   find docs/<folder> -maxdepth 1 -name "*.md" -type f | grep -v INDEX.md | grep -v README.md
   ```

2. **Read the INDEX.md content**

3. **Check if each .md file is referenced** in the INDEX.md
   - A file is "referenced" if its filename (without path) appears in the INDEX.md
   - Example: `ARCHITECTURE.md` should appear somewhere in the index

4. **Track missing files** for each folder

### Special Cases

- **docs/systems/architecture/**: Check for files like `ARCHITECTURE.md`, `LAYERS.md`, etc.
- **docs/design/**: Has subfolders for apps/features - check those too
- **docs/support/incidents/**: Files follow `YYYY-MM-DD-description.md` pattern
- **docs/support/ops/**: Check for runbooks and solution docs

---

## Step 3: Report Findings

Report what you found:

```
## Docs Index Check Results

### docs/systems/architecture/INDEX.md
Status: OK (or X missing files)
Missing:
- NEW-DOC.md

### docs/design/INDEX.md
Status: OK
(all files indexed)

### docs/support/incidents/INDEX.md
Status: 2 missing files
Missing:
- 2026-01-05-some-incident.md
- 2026-01-07-another-incident.md

### docs/support/ops/INDEX.md
Status: OK
```

---

## Step 4: Update Indexes (unless --check-only)

If `--check-only` was NOT passed and there are missing files:

### Protected Folders (Report Only)

**DO NOT update these indexes directly:**
- `docs/systems/architecture/INDEX.md` - Protected, requires DOC-MANAGER role
- `docs/design/INDEX.md` - Protected, requires DOC-MANAGER role

For protected folders, only report the missing files. The human or DOC-MANAGER must update these.

### For docs/support/incidents/INDEX.md

Add to the Incidents table:
```markdown
| <date> | [<filename>](<filename>) | <summary from file> |
```

### For docs/support/ops/INDEX.md

Add to "Problems & Solutions" or "Runbooks" table as appropriate:
```markdown
| <problem> | [<filename>](<filename>) | <command if any> |
```

---

## Step 5: Report Updates

After updating, report what was changed:

```
## Updates Made

### docs/support/incidents/INDEX.md
Added 2 entries:
- 2026-01-05-some-incident.md
- 2026-01-07-another-incident.md

### docs/support/ops/INDEX.md
Added 1 entry:
- new-runbook.md

**Total:** 3 files added to indexes
```

---

## Index Format Reference

### docs/support/incidents/INDEX.md
```markdown
| Date | File | Summary |
|------|------|---------|
| YYYY-MM-DD | [filename](filename) | Brief summary |
```

### docs/support/ops/INDEX.md
```markdown
| Problem | Solution Doc | Command |
|---------|--------------|---------|
| Description | [filename](filename) | `/command` or Manual |
```

---

## DO NOT

- Modify the structure or format of existing INDEX.md files
- Remove any existing entries
- Add files from `archive/` subfolders to main indexes
- Add README.md files to indexes (they are entry points, not indexed content)
- Update `docs/systems/architecture/INDEX.md` or `docs/design/INDEX.md` without DOC-MANAGER role (these are protected - report only, don't update)

---

## Notes

- If a folder has no INDEX.md, report it but don't create one
- `ai_docs/` subfolders are for agent research notes and don't need indexing
- Archive folders (`*/archive/`) are excluded from indexing
