# Task 4: Export, Backup, and Link Management

Implement the export, backup, and links commands with file handling.

## Context

Read before starting:
- `docs/design/components.md` - commands.py specifications for export, backup, links
- `docs/systems/cli/interface.md` - export, backup, links command specifications
- `docs/systems/database/schema.md` - Get Outgoing/Incoming Links queries
- `docs/systems/architecture/ARCHITECTURE-simple.md` - S2 path validation, S4 error sanitization

## Scope

- [ ] `notes_cli/commands.py` - `cmd_links()`, `cmd_export()`, `cmd_backup()` implementation
- [ ] `links` command showing outgoing/incoming links with broken link detection
- [ ] `export` command with format conversion (md, html, txt)
- [ ] `backup` command creating zip archive of vault
- [ ] File existence checking with `--force` handling
- [ ] Path validation (no `..` traversal)

## Constraints

- **S2**: Validate paths - must not contain `..`
- **S4**: Error messages use basename only, not full path
- Must handle existing file gracefully (require `--force` to overwrite)
- Backup must include all `.md` files and `.notes.db`
- Export formats:
  - `md`: raw markdown (copy)
  - `html`: **Non-goal for v1.** Return error: "HTML export is not supported in v1. Use --format md or --format txt."
  - `txt`: strip markdown formatting (remove headers #, bold **, italic *, links, etc.)

## Tests Required

- **links**: shows outgoing and incoming links, broken links marked as `(broken)`
- **links (circular detection)**: detects A->B->A cycle, reports in output
- **links (circular detection)**: detects longer cycles A->B->C->A
- **links (circular detection)**: max depth 100 prevents infinite loops - create chain of 101+ links and verify traversal stops at depth 100
- **links (circular detection)**: JSON format includes `circular_links` array
- **export**: creates file in correct format (md, html, txt)
- **export**: file exists without `--force` -> exit 1
- **export**: file exists with `--force` -> overwrites successfully
- **export**: path with `..` -> exit 1 with proper error
- **export**: note not found -> exit 3
- **backup**: creates valid zip with all notes and database
- **backup**: file exists without `--force` -> exit 1
- **backup**: file exists with `--force` -> overwrites
- **backup**: path with `..` -> exit 1
- **backup**: correct file count in output message
- **backup (filename collision warning)**: if subdirectories contain files with same name, log warning about potential data loss during backup

## Not In Scope

- All other commands (completed in Tasks 1-3)

## Acceptance Criteria

```bash
# Show links
python -m notes_cli links "Test Note" --vault /tmp/test_vault
# Output:
# Outgoing links from 'Test Note':
#   -> [[Redis]] (exists)
#   -> [[Missing Note]] (broken)
#
# Incoming links to 'Test Note':
#   <- [[Architecture Notes]]

# Links JSON format
python -m notes_cli links "Test Note" --format json --vault /tmp/test_vault
# Output: {"title": "Test Note", "outgoing": [...], "incoming": [...], "circular_links": [...]}

# Circular link detection (A links to B, B links to A)
python -m notes_cli links "A" --vault /tmp/test_vault
# Output includes: Warning: Circular link detected: A -> B -> A

# Circular link in JSON
python -m notes_cli links "A" --format json --vault /tmp/test_vault
# Output includes: "circular_links": [["A", "B", "A"]]

# Export single note (markdown)
python -m notes_cli export "Test Note" --output /tmp/note.md --vault /tmp/test_vault
# Output: Exported to note.md
# Exit: 0

# Export single note (HTML - not supported in v1)
python -m notes_cli export "Test Note" --output /tmp/note.html --format html --vault /tmp/test_vault
# Output: Error: HTML export is not supported in v1. Use --format md or --format txt.
# Exit: 1

# Export exists error
python -m notes_cli export "Test Note" --output /tmp/note.md --vault /tmp/test_vault
# Output: Error: File 'note.md' already exists. Use --force to overwrite.
# Exit: 1

# Export with force
python -m notes_cli export "Test Note" --output /tmp/note.md --force --vault /tmp/test_vault
# Output: Exported to note.md
# Exit: 0

# Export path traversal blocked
python -m notes_cli export "Test Note" --output ../../../etc/passwd --vault /tmp/test_vault
# Output: Error: Path cannot contain '..'
# Exit: 1

# Export note not found
python -m notes_cli export "Nonexistent" --output /tmp/note.md --vault /tmp/test_vault
# Output: Error: Note 'Nonexistent' not found.
# Exit: 3

# Backup entire vault
python -m notes_cli backup --output /tmp/backup.zip --vault /tmp/test_vault
# Output: Backed up 5 notes to backup.zip
# Exit: 0

# Verify backup contents
unzip -l /tmp/backup.zip
# Contains: all .md files, .notes.db

# Backup exists error
python -m notes_cli backup --output /tmp/backup.zip --vault /tmp/test_vault
# Output: Error: File 'backup.zip' already exists. Use --force to overwrite.
# Exit: 1

# Backup with force
python -m notes_cli backup --output /tmp/backup.zip --force --vault /tmp/test_vault
# Output: Backed up 5 notes to backup.zip
# Exit: 0

# Backup path traversal blocked
python -m notes_cli backup --output ../../../tmp/backup.zip --vault /tmp/test_vault
# Output: Error: Path cannot contain '..'
# Exit: 1
```
