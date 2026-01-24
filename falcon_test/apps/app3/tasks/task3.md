# Task 3: Core Commands + Formatters

Implement show, list, search, edit, and tag commands with output formatting.

## Context

Read before starting:
- `docs/design/components.md` - commands.py and formatters.py specifications
- `docs/systems/cli/interface.md` - Command specifications for show, list, search, edit, tag
- `docs/systems/database/schema.md` - Query patterns including full-text search
- `docs/systems/architecture/ARCHITECTURE-simple.md` - Layer rules, S1 security rule

## Scope

- [ ] `notes_cli/commands.py` - Business logic for edit, show, list, search, tag add, tag remove, tag list
- [ ] `cmd_sync()` in commands.py - Rebuild FTS index and detect external changes
- [ ] `cmd_orphans()` in commands.py - Find notes with no incoming links
- [ ] `notes_cli/formatters.py` - Table and JSON formatters for all output types
- [ ] Integration of commands into cli.py argument parser
- [ ] Input validation for all command arguments
- [ ] Link parsing on edit (update links in database when note is saved)

## Constraints

- **AD1**: Commands return data, CLI layer handles formatting and printing
- **AD4**: All queries use parameterized placeholders (especially critical for search)
- **AD5**: Validate inputs at CLI boundary
- **S1**: Parameterized queries only - critical for search command
- Commands MUST NOT print to stdout/stderr (return data only)
- Commands MUST NOT catch exceptions (let them propagate to CLI)

## Tests Required

- **edit**: opens correct file, updates timestamp, reparses links after save
- **show**: displays content, tags, links; not found (exit 3); JSON format works
- **list**: default order (by updated_at), tag filter works, limit works, JSON format, empty results
- **search**: full-text matches, snippets with context, no results returns empty, SQL injection attempt handled safely
- **FTS Security Tests**:
  - Search with FTS5 syntax attempt: `search "NEAR(foo bar)"` -> treats as literal text, no error
  - Search with operators: `search "foo OR bar"` -> treats as literal text
  - Search with parentheses: `search "(test)"` -> treats as literal text
  - Search with asterisk: `search "test*"` -> treats as literal text (no wildcard expansion)
  - Search with caret: `search "^title:test"` -> treats as literal text (caret stripped, no column filter)
  - Note: FTS5 special syntax should be treated as literal search terms, not executed as FTS operators. The MATCH query MUST escape user input by wrapping in double quotes AND stripping unescapable characters:
    ```python
    # 1. Escape double quotes by doubling
    safe_input = user_input.replace('"', '""')
    # 2. Strip asterisks and carets (no escape sequence exists for these)
    safe_input = safe_input.replace('*', '').replace('^', '')
    # 3. Wrap in double quotes to treat as literal phrase
    safe_query = '"' + safe_input + '"'
    cursor.execute('SELECT ... WHERE notes_fts MATCH ?', (safe_query,))
    ```
- **tag add**: success, note not found (exit 3), invalid tag name (exit 1)
- **tag remove**: success, idempotent (no error if tag not present)
- **tag list**: shows all tags with counts, JSON format
- Table format: proper column widths, truncation with `...`, empty table message
- JSON format: proper structure, null handling, empty array `[]`
- **orphans**: finds notes with no incoming links, excludes Index/Home/README by convention
- **orphans**: table format shows title/tags/updated, JSON format has proper structure
- **orphans**: returns empty list if all notes have incoming links

## Not In Scope

- export command (Task 4)
- backup command (Task 4)
- links command (Task 4)

## Acceptance Criteria

```bash
# Show note
python -m notes_cli show "Test Note" --vault /tmp/test_vault
# Output: Note content with metadata (tags, links, dates)

# Show note JSON
python -m notes_cli show "Test Note" --format json --vault /tmp/test_vault
# Output: {"title": "Test Note", "content": "...", "tags": [...], ...}

# List notes
python -m notes_cli list --vault /tmp/test_vault
# Output: Table of notes sorted by updated_at

# List notes filtered by tag
python -m notes_cli list --tag database --vault /tmp/test_vault
# Output: Table of notes with 'database' tag

# List notes JSON
python -m notes_cli list --format json --vault /tmp/test_vault
# Output: [{"title": "...", ...}, ...]

# Search
python -m notes_cli search "keyword" --vault /tmp/test_vault
# Output: Search results with snippets

# SQL injection attempt
python -m notes_cli search "'; DROP TABLE notes;--" --vault /tmp/test_vault
# Output: No results (not SQL error)
# Exit: 0

# Add tags
python -m notes_cli tag add "Test Note" --tags "database,performance" --vault /tmp/test_vault
# Output: Added tags [database, performance] to 'Test Note'

# Remove tags
python -m notes_cli tag remove "Test Note" --tags "performance" --vault /tmp/test_vault
# Output: Removed tags [performance] from 'Test Note'

# List all tags
python -m notes_cli tag list --vault /tmp/test_vault
# Output: Table of tags with counts

# Note not found
python -m notes_cli show "Nonexistent" --vault /tmp/test_vault
# Output: Error: Note 'Nonexistent' not found.
# Exit: 3

# Invalid tag name
python -m notes_cli tag add "Test Note" --tags "invalid@tag!" --vault /tmp/test_vault
# Output: Error: Tag name must be alphanumeric...
# Exit: 1
```

### sync command
- Rebuilds FTS index from all .md files in vault
- Detects notes deleted outside CLI (removes from database)
- Detects notes added outside CLI (adds to database)
- Skips files that fail validation (binary content, exceeds 1MB, UTF-8 decode error)
- Reports count of changes: "Synced X notes (Y added, Z updated, W deleted)" or "Synced X notes (Y added, Z updated, W deleted, N skipped)" if any were skipped
- Exit 0 on success, exit 2 on database error
- **Broken link repair**: When a new note is added that matches a broken link's `target_title`, the `target_note_id` is updated to point to the new note (test: create note A linking to [[B]], then create note B, run sync, verify link is no longer broken)
- **Skipped file test**: Create a binary file with .md extension, run sync, verify file is skipped and warning logged
- **Orphaned tag cleanup test**: Create note with tag, delete note file externally, run sync, verify tag with 0 associated notes is removed from database

### orphans command
```bash
# Find orphan notes
python -m notes_cli orphans --vault /tmp/test_vault
# Output: Table of notes with no incoming links

# Orphans JSON format
python -m notes_cli orphans --format json --vault /tmp/test_vault
# Output: {"orphan_notes": [...], "count": N}

# No orphans found
python -m notes_cli orphans --vault /tmp/test_vault
# Output: No orphan notes found. All notes have incoming links.
```
