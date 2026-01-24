# CLI Interface: Note-taking/Wiki CLI

**Status:** [FINAL]

---

## Global Options

These options apply to all commands:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--vault PATH` | string | `~/.notes` | Path to vault directory |
| `--verbose` | flag | false | Enable debug output |
| `--help` | flag | - | Show help for command |
| `--version` | flag | - | Show version number |

---

## Commands

### `init`

Initialize a new vault.

**Syntax:**
```
notes-cli init [--vault PATH] [--force]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--force` | flag | false | Reinitialize existing vault (keeps notes, recreates database) |

**Behavior:**
1. Check if vault directory exists
2. If exists and `--force` not set -> error, exit 5 (VaultError)
3. If exists and `--force` set -> delete `.notes.db` only (preserve note files)
4. Create vault directory if needed
5. Initialize database with schema
6. Print success message

**Important:** After `init --force`, the database is empty but note files remain on disk. Users MUST run `sync` to rebuild the database from existing note files. The success message should remind users: "Run 'notes-cli sync' to index existing notes."

**Output (success):**
```
Vault initialized at /path/to/vault
```

**Output (success with --force, existing notes):**
```
Vault reinitialized at /path/to/vault
Run 'notes-cli sync' to index existing notes.
```

**Output (exists, no force):**
```
Error: Vault already exists at /path. Use --force to reinitialize.
```

**Exit codes:**
- 0: Success
- 5: Vault exists (without --force), or cannot create vault directory

---

### `new`

Create a new note.

**Syntax:**
```
notes-cli new TITLE [--tags TAG1,TAG2] [--vault PATH]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `TITLE` | string | Note title (positional, required) |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--tags TAG1,TAG2` | string | - | Comma-separated tags |

**Behavior:**
1. Validate title (length, characters)
2. Sanitize title to filename
3. Check filename doesn't exist in vault
4. Create markdown file with title as H1 header
5. Open in editor (fallback chain: `$VISUAL` -> `$EDITOR` -> `vim` -> `nano` -> `vi`)
   - Editor detection: Check each editor in the fallback chain using `which <editor_name>` or `shutil.which()` in Python
   - If all editors in the chain are missing, exit with error (see "Output (no editor)" below)
   - Editor invocation: Use `subprocess.call([editor_path, file_path])` to inherit stdin/stdout/stderr from parent process
   - Pass the absolute file path as the only argument to the editor command
   - Record file mtime BEFORE launching editor (using `os.path.getmtime()`)
6. On editor exit: check exit code and file modification
   - Capture editor process exit code
   - Record file mtime AFTER editor exit
   - Compare before/after mtime values: if identical (down to microsecond precision), no save occurred
   - **Note on editors that use temp files**: Some editors (like `vi` on some systems) may create temporary files during editing. The mtime comparison is on the TARGET file specified in the command, not temp files. This works because editors write to the target file on save, updating its mtime.
7. Validate content length (max 1,000,000 characters)
8. On save: parse `[[wiki-links]]`, update database

**Editor exit handling:**
- Check editor exit code: non-zero = user cancelled or error
- Compare file mtime before/after: unchanged = no save occurred
- **Cancellation detection**: Operation is cancelled if exit_code != 0 OR mtime unchanged (boolean OR logic)
- If cancelled: delete the created file, do not insert into database
- Empty file after edit: warn user but allow (some users may want empty notes)

**Output (success):**
```
Created: my-note.md
```

**Output (duplicate):**
```
Error: Note 'My Note' already exists.
```

**Output (no editor):**
```
Error: No editor found. Set $EDITOR environment variable.
```

**Output (content too large):**
```
Error: Note content exceeds maximum length of 1,000,000 characters. Current length: 1,234,567
```

**Exit codes:**
- 0: Success
- 1: Validation error (including content length), no editor
- 4: Duplicate title
- 5: Vault error

---

### `edit`

Edit an existing note.

**Syntax:**
```
notes-cli edit TITLE [--vault PATH]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `TITLE` | string | Note title (positional, required) |

**Behavior:**
1. Find note by title in database
2. Open file in editor (fallback chain: `$VISUAL` -> `$EDITOR` -> `vim` -> `nano` -> `vi`)
   - Editor detection: Check each editor in the fallback chain using `which <editor_name>` or `shutil.which()` in Python
   - If all editors in the chain are missing, exit with error (exit code 1)
   - Editor invocation: Use `subprocess.call([editor_path, file_path])` to inherit stdin/stdout/stderr from parent process
   - Pass the absolute file path as the only argument to the editor command
   - Record file mtime BEFORE launching editor (using `os.path.getmtime()`)
3. On editor exit: check exit code and file modification
   - Capture editor process exit code
   - Record file mtime AFTER editor exit
   - Compare before/after mtime values: if identical (down to microsecond precision), no save occurred
   - **Note on editors that use temp files**: Some editors (like `vi` on some systems) may create temporary files during editing. The mtime comparison is on the TARGET file specified in the command, not temp files. This works because editors write to the target file on save, updating its mtime.
4. Validate content length (max 1,000,000 characters)
5. On save: reparse `[[wiki-links]]`, update database timestamp, update FTS index (DELETE then INSERT for the edited note)

**Editor exit handling:**
- Check editor exit code: non-zero = user cancelled or error
- Compare file mtime before/after: unchanged = no save occurred
- **Cancellation detection**: Operation is cancelled if exit_code != 0 OR mtime unchanged (boolean OR logic)
- If cancelled: no database update occurs
- Empty file after edit: warn user but allow (some users may want empty notes)

**Output (success):**
```
Updated: my-note.md
```

**Exit codes:**
- 0: Success
- 1: Validation error (including content length)
- 3: Note not found
- 5: Vault error

---

### `show`

Display a note.

**Syntax:**
```
notes-cli show TITLE [--format FORMAT] [--vault PATH]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `TITLE` | string | Note title (positional, required) |

**Options:**

| Option | Type | Default | Values | Description |
|--------|------|---------|--------|-------------|
| `--format FORMAT` | string | `text` | `text`, `json` | Output format |

**Output (text format):**
```
# My Note

Note content here...

---
Tags: database, performance
Links out: [[Redis]], [[Caching]]
Links in: [[Architecture Notes]]
Created: 2026-01-15
Updated: 2026-01-21
```

**Output (JSON format):**
```json
{
  "title": "My Note",
  "filename": "my-note.md",
  "content": "Note content here...",
  "tags": ["database", "performance"],
  "links_out": ["Redis", "Caching"],
  "links_in": ["Architecture Notes"],
  "created_at": "2026-01-15T10:00:00Z",
  "updated_at": "2026-01-21T14:30:00Z"
}
```

**Exit codes:**
- 0: Success
- 3: Note not found

---

### `list`

List notes.

**Syntax:**
```
notes-cli list [--tag TAG] [--limit N] [--format FORMAT] [--vault PATH]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--tag TAG` | string | - | Filter by tag |
| `--limit N` | integer | 20 | Max results |
| `--format FORMAT` | string | `table` | `table` or `json` |

**Output (table format):**
```
Title                | Tags               | Updated
---------------------|--------------------|------------
My Note              | database, perf     | 2026-01-21
Another Note         | design             | 2026-01-20
```

**Output (table, no notes):**
```
No notes found.
```

**Output (JSON format):**
```json
[
  {
    "title": "My Note",
    "filename": "my-note.md",
    "tags": ["database", "performance"],
    "updated_at": "2026-01-21T14:30:00Z"
  }
]
```

**Exit codes:**
- 0: Success (including empty results)
- 2: Database error

---

### `search`

Full-text search.

**Syntax:**
```
notes-cli search QUERY [--limit N] [--format FORMAT] [--vault PATH]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `QUERY` | string | Search query (positional, required) |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--limit N` | integer | 20 | Max results |
| `--format FORMAT` | string | `table` | `table` or `json` |

**Output (table format):**
```
Title                | Snippet                                  | Score
---------------------|------------------------------------------|------
Redis Caching        | ...configure **Redis** for...            | 0.95
HTTP Caching         | ...how **caching** works...              | 0.80
```

**Search Snippet Details:**
- Snippets show up to 32 tokens (~32 words) of context around the match
- Match highlighting uses `**` text markers (not HTML `<mark>` tags) to avoid XSS risks if output is later rendered as HTML
- Context window automatically adjusts to show relevant surrounding text

**Output (table, no matches):**
```
No matching notes found.
```

**Output (JSON format):**
```json
[
  {
    "title": "Redis Caching",
    "filename": "redis-caching.md",
    "snippet": "...configure Redis for...",
    "score": 0.95
  }
]
```

**Exit codes:**
- 0: Success (including empty results)
- 1: Empty query
- 2: Database error

---

### `tag add`

Add tags to a note.

**Syntax:**
```
notes-cli tag add TITLE --tags TAG1,TAG2 [--vault PATH]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `TITLE` | string | Note title (positional, required) |

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--tags TAG1,TAG2` | string | Comma-separated tags (required) |

**Output (success):**
```
Added tags [database, performance] to 'My Note'
```

**Exit codes:**
- 0: Success
- 1: Validation error (invalid tag name)
- 3: Note not found

---

### `tag remove`

Remove tags from a note.

**Syntax:**
```
notes-cli tag remove TITLE --tags TAG1,TAG2 [--vault PATH]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `TITLE` | string | Note title (positional, required) |

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--tags TAG1,TAG2` | string | Comma-separated tags (required) |

**Output (success):**
```
Removed tags [deprecated] from 'My Note'
```

**Exit codes:**
- 0: Success (idempotent - no error if tag not present)
- 3: Note not found

---

### `tag list`

List all tags.

**Syntax:**
```
notes-cli tag list [--format FORMAT] [--vault PATH]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format FORMAT` | string | `table` | `table` or `json` |

**Output (table format):**
```
Tag          | Count
-------------|------
database     | 15
performance  | 8
design       | 5
```

**Output (JSON format):**
```json
[
  {"name": "database", "count": 15},
  {"name": "performance", "count": 8}
]
```

**Exit codes:**
- 0: Success
- 2: Database error

---

### `links`

Show links for a note.

**Syntax:**
```
notes-cli links TITLE [--format FORMAT] [--vault PATH]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `TITLE` | string | Note title (positional, required) |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format FORMAT` | string | `text` | `text` or `json` |

**Output (text format):**
```
Outgoing links from 'My Note':
  -> [[Redis]] (exists)
  -> [[Missing Note]] (broken)

Incoming links to 'My Note':
  <- [[Architecture Notes]]
  <- [[Index]]
```

**Output (JSON format):**
```json
{
  "title": "My Note",
  "outgoing": [
    {"target": "Redis", "exists": true},
    {"target": "Missing Note", "exists": false}
  ],
  "incoming": [
    {"source": "Architecture Notes"},
    {"source": "Index"}
  ]
}
```

**Circular Link Detection:**

The `links` command MUST detect and warn about circular link references. A circular link occurs when following outgoing links eventually leads back to the original note (A -> B -> C -> A).

**Detection Requirements:**
- Perform depth-first traversal starting from each outgoing link target
- Track visited notes to detect cycles
- Maximum traversal depth: 100 levels (prevent infinite loops)
- Report ALL circular paths found, not just the first one

**Output (text format with circular link warning):**
```
Outgoing links from 'My Note':
  -> [[Redis]] (exists)
  -> [[HTTP Caching]] (exists)

Incoming links to 'My Note':
  <- [[Architecture Notes]]

Warning: Circular link detected: My Note -> Redis -> HTTP Caching -> My Note
```

**Output (JSON format with circular links):**
```json
{
  "title": "My Note",
  "outgoing": [
    {"target": "Redis", "exists": true},
    {"target": "HTTP Caching", "exists": true}
  ],
  "incoming": [
    {"source": "Architecture Notes"}
  ],
  "circular_links": [
    ["My Note", "Redis", "HTTP Caching", "My Note"]
  ]
}
```

**Exit codes:**
- 0: Success (circular links are warnings, not errors)
- 3: Note not found

---

### `export`

Export a single note.

**Syntax:**
```
notes-cli export TITLE --output PATH [--format FORMAT] [--force] [--vault PATH]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `TITLE` | string | Note title (positional, required) |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--output PATH` | string | - | Output file path (required) |
| `--format FORMAT` | string | `md` | `md`, `html`, `txt` |
| `--force` | flag | false | Overwrite existing file |

**Behavior:**
1. Validate output path (no `..`)
2. Check file doesn't exist (unless `--force`)
3. Convert note to specified format
4. Write to output file

**Export Format Conversion:**
- `md`: Raw markdown (direct copy of note content)
- `txt`: Strip markdown formatting (remove headers #, bold **, italic *, links, etc.)
- `html`: **Non-goal for v1.** Basic HTML conversion is complex and out of scope. If requested, return error: "HTML export is not supported in v1. Use --format md or --format txt."

**Output (success):**
```
Exported to note.md
```

**Output (file exists):**
```
Error: File 'note.md' already exists. Use --force to overwrite.
```

**Exit codes:**
- 0: Success
- 1: File exists (without --force), validation error
- 3: Note not found

---

### `backup`

Backup entire vault.

**Syntax:**
```
notes-cli backup --output PATH [--force] [--vault PATH]
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--output PATH` | string | Output zip file path (required) |
| `--force` | flag | Overwrite existing file |

**Behavior:**
1. Validate output path (no `..`)
2. Check file doesn't exist (unless `--force`)
3. Create zip archive containing all `.md` files and `.notes.db`
4. Print count of notes backed up

**Zip Archive Structure:**
- Flat directory with all `.md` files and `.notes.db` at root (no subdirectory nesting)
- Subdirectories within vault are NOT preserved (all files at root level)
- Hidden files (except `.notes.db`) are excluded
- Example contents: `note1.md`, `note2.md`, `.notes.db`

**Known Limitation:** Backup flattens subdirectories. When restoring from a backup, the original directory structure is lost. This is acceptable for v1 since the database tracks metadata, not filesystem structure.

**CRITICAL WARNING - Filename Collision Risk:**

If notes in different subdirectories have the same filename (e.g., `subdir1/readme.md` and `subdir2/readme.md`), the backup command will **silently lose data** by overwriting one file with the other in the flat zip archive.

**Required behavior to prevent silent data loss:**

1. **Pre-backup collision detection**: Before creating the zip file, scan all `.md` files in the vault (recursively) and build a list of basenames (filename without parent directory path)
2. **Collision check**: If any basename appears more than once, the backup MUST fail with an error
3. **Error output**:
   ```
   Error: Filename collision detected. The following files would overwrite each other in the backup:
     - subdir1/readme.md
     - subdir2/readme.md

   Please rename one of these files to ensure unique filenames across all subdirectories, then retry the backup.
   ```
4. **Exit code**: 1 (validation error)
5. **No zip file created**: If collision detected, do not create partial or empty zip file

**Alternative mitigation (if collision detection not implemented in v1):**
- Users should ensure unique filenames across all subdirectories before running backup
- After restore, use the `sync` command to reindex and manually recover any lost files from source control

**Edge Cases:**
- Empty vault (no .md files): Succeeds with "Backed up 0 notes to backup.zip" - zip contains only `.notes.db`

**Output (success):**
```
Backed up 150 notes to backup.zip
```

**Output (file exists):**
```
Error: File 'backup.zip' already exists. Use --force to overwrite.
```

**Exit codes:**
- 0: Success
- 1: Validation error, file exists
- 5: Vault error

---

### `orphans`

Find notes with no incoming links (orphan notes).

**Syntax:**
```
notes-cli orphans [--format FORMAT] [--vault PATH]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format FORMAT` | string | `table` | `table` or `json` |

**Behavior:**
1. Query database for all notes
2. Find notes where no other note links TO them (no incoming links)
3. Exclude notes that are explicitly marked as "index" or "home" (convention: notes titled "Index", "Home", or "README")
4. Return list of orphan notes sorted by title

**Output (table format):**
```
Orphan Notes (no incoming links):

Title                | Tags           | Updated
---------------------|----------------|------------
Forgotten Note       | misc           | 2026-01-15
Old Draft            |                | 2025-12-01

Found 2 orphan notes.
```

**Output (table, no orphans):**
```
No orphan notes found. All notes have incoming links.
```

**Output (JSON format):**
```json
{
  "orphan_notes": [
    {
      "title": "Forgotten Note",
      "filename": "forgotten-note.md",
      "tags": ["misc"],
      "updated_at": "2026-01-15T10:00:00Z"
    }
  ],
  "count": 1
}
```

**SQL Query:**
```sql
SELECT n.id, n.title, n.filename, n.updated_at
FROM notes n
WHERE n.id NOT IN (
    SELECT DISTINCT target_note_id
    FROM links
    WHERE target_note_id IS NOT NULL
)
AND n.title NOT IN ('Index', 'Home', 'README')
ORDER BY n.title;
```

**Exit codes:**
- 0: Success (including when no orphans found)
- 2: Database error
- 5: Vault not initialized

---

### `sync`

Synchronizes the database with the filesystem, rebuilding the FTS index.

**Usage:**
```
notes-cli sync [--rebuild-fts] [--vault PATH]
```

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--vault PATH` | string | `~/.notes` | Path to vault directory |
| `--verbose` | flag | false | Show detailed sync progress |
| `--rebuild-fts` | flag | false | Force complete FTS index rebuild even if files unchanged |

**When to use `--rebuild-fts`:**
- After restoring vault from backup
- After manual database repair
- After external tools modified note files
- When search results seem stale or incomplete

**Behavior:**
1. Scan all .md files in vault directory (recursively, including subdirectories)
2. For each file: validate (text/UTF-8, content length), update/insert database record, rebuild FTS entry
   - **Title reconstruction from filename**: Remove `.md` extension, replace hyphens with spaces, title-case each word
     - Example: `my-note.md` -> "My Note"
     - Example: `http-caching.md` -> "Http Caching" (accepts slight case variations)
     - **Known limitation**: This is a LOSSY transformation. Original title "HTTP Caching" becomes filename "http-caching.md", which reconstructs to "Http Caching". The sync command accepts this title variation as equivalent to the original.
     - If reconstructed title differs from existing database title (for same filename), **prefer the reconstructed title** (filesystem is source of truth during sync)
   - **Update detection**: Compare file mtime with database `updated_at` timestamp
     - If file mtime > database `updated_at`: file was modified externally, reparse content and update database
     - If file mtime <= database `updated_at`: file unchanged, skip reparse (unless `--rebuild-fts` flag set)
     - On update: read file content, parse `[[wiki-links]]`, update database record with new content and mtime
   - **Transaction boundaries**: Each file operation is independent (no multi-file transactions)
     - If file processing fails (validation error, parse error), log warning and continue to next file
     - Database changes for successfully processed files are committed even if later files fail
3. Skip files that fail validation (binary content, exceeds 1MB, UTF-8 decode error)
4. Remove database records for deleted files (files in database but not on filesystem)
5. Clean up orphaned tags (tags with no associated notes)
   - **Link re-parsing during update**: When a file is updated, ALL existing outgoing links from that note are deleted from the `links` table, then new links are inserted based on the current file content. This ensures link accuracy even if wiki-links were added, removed, or modified.
6. **Concurrent modification handling**: NOT SUPPORTED in v1
   - Sync assumes single-user access or manual coordination
   - If external tools modify files while sync is running, behavior is undefined (may miss updates or process stale content)
   - Users should ensure vault is not being modified during sync operation
7. **Partial failure handling**: Sync continues processing remaining files even if individual files fail
   - Each file failure is logged as a warning (if `--verbose` set)
   - Final report shows count of skipped files
   - Exit code 0 if at least some files processed successfully; exit code 2 only if catastrophic failure (e.g., cannot open database)
8. Report: "Synced X notes (Y added, Z updated, W deleted)" or "Synced X notes (Y added, Z updated, W deleted, N skipped)" if any were skipped

**Edge Cases:**
- Empty vault (no .md files): Succeeds with "Synced 0 notes (0 added, 0 updated, 0 deleted)"
- Orphaned tags: Tags that no longer have any associated notes are automatically deleted during sync
- Skipped files: Files that fail validation are logged as warnings and excluded from sync totals

**Exit codes:**
- 0: Success
- 2: Database error
- 5: Vault not initialized

---

## Input Validation Rules

### Title

- Non-empty, max 200 characters
- Cannot contain: `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`
- Validation regex: `^[^/\\:*?"<>|]{1,200}$`

### Tag

**Tag Name Validation Requirements:**

- Non-empty, maximum 50 characters
- Allowed characters: alphanumeric (A-Z, a-z, 0-9), hyphen (-), underscore (_)
- MUST start with alphanumeric character (no leading hyphens or underscores)
- MUST end with alphanumeric character (no trailing hyphens or underscores)
- Cannot consist of only hyphens or underscores
- Fully-numeric tags ARE allowed (e.g., "2024", "42")
- Validation regex: `^[A-Za-z0-9]([A-Za-z0-9_-]{0,48}[A-Za-z0-9])?$`
  - Allows single character tags (e.g., "a", "1")
  - For 2+ character tags, must start and end with alphanumeric

**Disallowed in tag names:**
- Spaces (use hyphens or underscores instead)
- Special characters: `!@#$%^&*()+=[]{}|;:'",.<>?/\``
- Unicode characters outside ASCII alphanumeric range
- Control characters
- Path separators

**Validation implementation:**
```python
import re

TAG_PATTERN = re.compile(r'^[A-Za-z0-9]([A-Za-z0-9_-]{0,48}[A-Za-z0-9])?$')
MAX_TAG_LENGTH = 50

def validate_tag(tag: str) -> str:
    """Validate tag name.

    Returns: Validated tag name
    Raises: ValidationError if invalid
    """
    if not tag:
        raise ValidationError("Tag name cannot be empty")

    if len(tag) > MAX_TAG_LENGTH:
        raise ValidationError(f"Tag name must be {MAX_TAG_LENGTH} characters or fewer. Got: {len(tag)}")

    if not TAG_PATTERN.match(tag):
        raise ValidationError(
            "Tag name must contain only alphanumeric characters, hyphens, and underscores, "
            "and must start and end with an alphanumeric character."
        )

    return tag
```

### Search Query

- Non-empty, max 500 characters

### Path (--vault, --output)

- Must not escape allowed base directory (path traversal prevention)
- Use `os.path.realpath()` to resolve symlinks before validation
- Containment check: resolved path must start with resolved base_dir
- For `--vault`: base is user's home directory or explicit `--vault` value
- For `--output`: base is current working directory
- Converted to absolute path internally using `os.path.realpath(os.path.abspath(path))`

---

## Output Standards

### Table Format

- Column headers in first row
- Separator line of dashes and pipes
- Fixed-width columns (pad with spaces)
- Truncate values exceeding column width: show first `(width-3)` chars + `...`
- Column widths: Title=40, Tags=15, Updated=12
- Optional `--no-truncate` flag may be added to show full values without truncation

### JSON Format

- Pretty-printed with 2-space indent
- Arrays for lists (even single item)
- UTF-8 encoding
- Single trailing newline (standard Unix convention for CLI output)
- NULL values: include key with `null` value (not omitted)
  ```json
  {"title": "My Note", "description": null}
  ```

### Error Messages

- Prefix: `Error: `
- Written to stderr
- No stack traces (unless --verbose)
- No internal paths or SQL
