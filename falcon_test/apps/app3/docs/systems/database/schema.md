# Database Schema: Note-taking/Wiki CLI

**Status:** [FINAL]

---

## Database File

- **Engine:** SQLite 3
- **File:** `.notes.db` in vault directory
- **Encoding:** UTF-8
- **Permissions:** MUST be 0600 (owner read/write only) on Unix systems

---

## Schema Definition

```sql
-- Notes table: core note metadata
CREATE TABLE IF NOT EXISTS notes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT    NOT NULL UNIQUE,
    filename    TEXT    NOT NULL UNIQUE,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

-- Tags table
CREATE TABLE IF NOT EXISTS tags (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE
);

-- Note-Tag junction table
CREATE TABLE IF NOT EXISTS note_tags (
    note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

-- Links table: tracks [[wiki-links]]
CREATE TABLE IF NOT EXISTS links (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_note_id  INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_title    TEXT    NOT NULL,
    target_note_id  INTEGER REFERENCES notes(id) ON DELETE SET NULL
);

-- Full-text search virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title,
    content,
    content='',
    tokenize='porter'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_note_id);
CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_note_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id ON note_tags(tag_id);
```

---

## Column Specifications

### notes table

| Column | Type | Nullable | Constraints | Notes |
|--------|------|----------|-------------|-------|
| `id` | INTEGER | No | PRIMARY KEY | Auto-increment |
| `title` | TEXT | No | UNIQUE | Max 200 chars (app-enforced) |
| `filename` | TEXT | No | UNIQUE | Sanitized from title |
| `created_at` | TEXT | No | - | ISO 8601 format |
| `updated_at` | TEXT | No | - | ISO 8601 format |

### tags table

| Column | Type | Nullable | Constraints | Notes |
|--------|------|----------|-------------|-------|
| `id` | INTEGER | No | PRIMARY KEY | Auto-increment |
| `name` | TEXT | No | UNIQUE | Max 50 chars, alphanumeric+hyphen |

### note_tags table

| Column | Type | Nullable | Constraints | Notes |
|--------|------|----------|-------------|-------|
| `note_id` | INTEGER | No | FK notes | ON DELETE CASCADE |
| `tag_id` | INTEGER | No | FK tags | ON DELETE CASCADE |

### links table

| Column | Type | Nullable | Constraints | Notes |
|--------|------|----------|-------------|-------|
| `id` | INTEGER | No | PRIMARY KEY | Auto-increment |
| `source_note_id` | INTEGER | No | FK notes | Note containing the link |
| `target_title` | TEXT | No | - | `[[link-target]]` text |
| `target_note_id` | INTEGER | Yes | FK notes | NULL if target doesn't exist |

**Broken Link Detection:** The `target_note_id` column uses `ON DELETE SET NULL`. When a target note is deleted (via filesystem), `target_note_id` becomes NULL but `target_title` is preserved. This allows detecting broken links: any row where `target_note_id IS NULL` represents a link to a non-existent note. The `links` command uses this to display "(broken)" status for such links.

**Broken Link Repair:** `cmd_sync()` MUST repair broken links when the target note is created later. For each link with `target_note_id = NULL`, check if `target_title` now matches an existing note title. If a match is found, update `target_note_id`.

```sql
-- Repair broken links during sync
UPDATE links
SET target_note_id = (SELECT id FROM notes WHERE title = links.target_title)
WHERE target_note_id IS NULL
  AND EXISTS (SELECT 1 FROM notes WHERE title = links.target_title);
```

**Known Limitation:** Link repair uses exact title matching. If a note is linked using a different case or variation (e.g., `[[redis]]` vs actual title "Redis"), the link will not auto-repair. Users should ensure link text exactly matches target note titles. This is a documented trade-off for simplicity; fuzzy matching would add complexity and ambiguity.

---

## Backlink Updates on Note Rename

**Requirement:** When a note is renamed (title change), all wiki links pointing to that note MUST be updated within the same transaction.

**Note Rename Scenarios:**

1. **Via `sync` command**: If user renames file on filesystem, sync detects title change
2. **Future `rename` command**: If implemented, must update backlinks atomically

**Backlink Update Transaction Pattern:**

```sql
-- All operations MUST be in same transaction

-- 1. Update the note's title in notes table
UPDATE notes SET title = ?, filename = ?, updated_at = ? WHERE id = ?;

-- 2. Update all wiki links pointing to the old title
UPDATE links SET target_title = ? WHERE target_title = ?;

-- 3. Update the actual [[link]] text in all source note files
-- (This requires reading and rewriting each source file)
```

**Implementation Requirements:**

```python
def rename_note(conn, old_title: str, new_title: str, vault_path: str):
    """Rename a note and update all backlinks.

    MUST be atomic - all changes in single transaction.
    """
    cursor = conn.cursor()
    try:
        # 1. Get note ID and find all source notes with links to this note
        cursor.execute(
            "SELECT id FROM notes WHERE title = ?", (old_title,)
        )
        note = cursor.fetchone()
        if not note:
            raise NoteNotFoundError(f"Note '{old_title}' not found")
        note_id = note[0]

        # 2. Find all notes that link to the old title
        cursor.execute(
            """SELECT DISTINCT n.id, n.filename
               FROM links l
               JOIN notes n ON l.source_note_id = n.id
               WHERE l.target_title = ?""",
            (old_title,)
        )
        source_notes = cursor.fetchall()

        # 3. Update each source note's file content
        for source_id, source_filename in source_notes:
            filepath = os.path.join(vault_path, source_filename)
            with open(filepath, 'r') as f:
                content = f.read()

            # Replace [[old_title]] with [[new_title]]
            new_content = content.replace(
                f'[[{old_title}]]',
                f'[[{new_title}]]'
            )

            with open(filepath, 'w') as f:
                f.write(new_content)

        # 4. Update links table
        cursor.execute(
            "UPDATE links SET target_title = ? WHERE target_title = ?",
            (new_title, old_title)
        )

        # 5. Update notes table
        new_filename = sanitize_title_to_filename(new_title)
        cursor.execute(
            "UPDATE notes SET title = ?, filename = ?, updated_at = ? WHERE id = ?",
            (new_title, new_filename, get_timestamp(), note_id)
        )

        # 6. Rename the actual file
        old_filepath = os.path.join(vault_path, old_title_to_filename(old_title))
        new_filepath = os.path.join(vault_path, new_filename)
        os.rename(old_filepath, new_filepath)

        # 7. Update FTS index
        cursor.execute("DELETE FROM notes_fts WHERE title = ?", (old_title,))
        with open(new_filepath, 'r') as f:
            content = f.read()
        cursor.execute(
            "INSERT INTO notes_fts (title, content) VALUES (?, ?)",
            (new_title, content)
        )

        conn.commit()
    except Exception:
        conn.rollback()
        raise
```

**Failure Handling:**

If any step fails, the entire operation MUST be rolled back:
- Database changes are rolled back via transaction
- File changes should be reverted if possible (complex; may require backup)

**Sync Command Behavior:**

The `sync` command synchronizes the database state with the filesystem state. It MUST perform the following operations:

**Title/Filename Reconstruction:**

The sync command faces a circular dependency: titles→filenames is a lossy transformation (spaces become hyphens, special chars removed), but sync needs to reverse it. This is resolved as follows:

1. **Filename → Title Mapping:** Store both `title` and `filename` in database as the source of truth
2. **Sync Strategy:** During sync, for each `.md` file found:
   - First, try to match by `filename` column (fast lookup via UNIQUE index)
   - If no match, this is a NEW note: extract title from first `# heading` in file content
   - The `sanitize_title_to_filename()` function is only used for NEW notes during creation

**Update Detection:**

Updates are detected using file modification time (mtime):

```python
def detect_updates(conn, vault_path: str) -> tuple[set, set, set]:
    """Detect new, modified, and deleted notes.

    Returns: (new_files, modified_files, deleted_files)
    """
    cursor = conn.cursor()

    # Get all files from filesystem
    fs_files = {f for f in os.listdir(vault_path) if f.endswith('.md')}

    # Get all files from database with their updated_at timestamps
    cursor.execute("SELECT filename, updated_at FROM notes")
    db_files = {row['filename']: row['updated_at'] for row in cursor.fetchall()}

    new_files = fs_files - db_files.keys()
    deleted_files = db_files.keys() - fs_files

    # Check mtime for existing files
    modified_files = set()
    for filename in (fs_files & db_files.keys()):
        filepath = os.path.join(vault_path, filename)
        file_mtime = datetime.fromtimestamp(os.path.getmtime(filepath), timezone.utc)
        db_updated = datetime.fromisoformat(db_files[filename])

        # Compare mtime with database updated_at (tolerance: 1 second)
        if abs((file_mtime - db_updated).total_seconds()) > 1.0:
            modified_files.add(filename)

    return new_files, modified_files, deleted_files
```

**Transaction Boundaries:**

All sync operations for a single note MUST be within a single transaction:

```python
def sync_single_note(conn, vault_path: str, filename: str, operation: str):
    """Sync a single note (new, modified, or deleted).

    All operations in single transaction for atomicity.
    """
    cursor = conn.cursor()
    try:
        if operation == "new":
            # 1. Read file to extract title and content
            filepath = os.path.join(vault_path, filename)
            with open(filepath, 'r') as f:
                content = f.read()
            title = extract_title_from_content(content)
            timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

            # 2. Insert into notes table
            cursor.execute(
                "INSERT INTO notes (title, filename, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (title, filename, timestamp, timestamp)
            )
            note_id = cursor.lastrowid

            # 3. Parse and store links
            links = parse_wiki_links(content)
            for link_title in links:
                cursor.execute(
                    "INSERT INTO links (source_note_id, target_title, target_note_id) VALUES (?, ?, (SELECT id FROM notes WHERE title = ?))",
                    (note_id, link_title, link_title)
                )

            # 4. Update FTS index
            cursor.execute("INSERT INTO notes_fts (title, content) VALUES (?, ?)", (title, content))

        elif operation == "modified":
            # Similar pattern: read file, update notes, update links, update FTS
            # All in same transaction
            pass

        elif operation == "deleted":
            # 1. Get note info before deletion
            cursor.execute("SELECT id, title FROM notes WHERE filename = ?", (filename,))
            note = cursor.fetchone()
            if not note:
                return  # Already deleted

            # 2. Delete from notes (CASCADE deletes links, note_tags)
            cursor.execute("DELETE FROM notes WHERE filename = ?", (filename,))

            # 3. Delete from FTS
            cursor.execute("DELETE FROM notes_fts WHERE title = ?", (note['title'],))

            # 4. Repair broken links (set target_note_id to NULL for links pointing to deleted note)
            # This is handled automatically by ON DELETE SET NULL

        conn.commit()  # Atomic commit
    except Exception:
        conn.rollback()
        raise
```

**Partial Failure Handling:**

The `sync` command processes each file individually with separate transactions. If syncing one file fails, other files still sync successfully:

```python
def cmd_sync(vault_path: str):
    """Sync database with filesystem.

    Each file is processed in a separate transaction for fault isolation.
    """
    with get_connection(vault_path) as conn:
        new_files, modified_files, deleted_files = detect_updates(conn, vault_path)

        results = {
            'success': [],
            'failed': []
        }

        # Process each file in separate transaction
        for filename in new_files:
            try:
                sync_single_note(conn, vault_path, filename, "new")
                results['success'].append(('new', filename))
            except Exception as e:
                results['failed'].append(('new', filename, str(e)))
                # Continue processing other files

        # ... same pattern for modified_files and deleted_files ...

        # Print summary
        print(f"Synced {len(results['success'])} files")
        if results['failed']:
            print(f"Failed to sync {len(results['failed'])} files:")
            for op, filename, error in results['failed']:
                print(f"  {op}: {filename} - {error}")
```

**Link Re-parsing During Update:**

When a note is modified, links MUST be re-parsed and database updated:

1. Delete all existing links with `source_note_id = <note_id>`
2. Parse links from updated file content
3. Insert new link records
4. This ensures link graph stays accurate even if user adds/removes `[[links]]`

**Concurrent Modification Handling:**

The sync command does NOT handle concurrent modifications (multiple processes editing files simultaneously). This is documented as follows:

- **Single-user assumption:** The CLI is designed for single-user vaults
- **Git workflow:** Users should NOT run sync while files are being edited
- **Safe workflow:** Edit → save → close editor → run sync
- **Undefined behavior:** If sync runs while file is being written, behavior is undefined (may read partial content, corrupt FTS index, etc.)
- **Future consideration:** File locking could be added in v2 if multi-process access is required

**Rename Detection (v1 Limitation):**

The `sync` command does NOT implement rename detection in v1. When a file is renamed externally:
1. The old filename is treated as deleted (database record removed, backlinks become broken)
2. The new filename is treated as a new note (new database record created)
3. This is a documented limitation; users who need to preserve backlinks during rename should use a dedicated `rename` command (see Rename Command section below)

---

## Rename Command (Required for Metadata Preservation)

**Requirement:** To preserve metadata and backlinks when renaming notes, a dedicated `rename` command MUST be provided.

**Command Signature:**
```
notes-cli rename <old-title> <new-title> [--vault PATH]
```

**Behavior:**

The rename command performs the following operations atomically (all in single transaction):

1. Verify old note exists, new title doesn't conflict
2. Update the note's title and filename in `notes` table
3. Rename the physical `.md` file on filesystem
4. Update all `[[wiki-links]]` in source note files that reference the old title
5. Update the `target_title` column in `links` table for all backlinks
6. Update FTS index with new title

See the "Backlink Updates on Note Rename" section above for detailed implementation.

**Rename vs External File Rename:**

| Operation | Metadata Preserved | Backlinks Updated | Command |
|-----------|-------------------|-------------------|---------|
| `rename` command | Yes | Yes | `notes-cli rename "Old" "New"` |
| External file rename | No (creates new note) | No (old links break) | mv old.md new.md |
| Sync after external rename | No (treats as delete+create) | No | notes-cli sync |

**Destructive Rename Handling (Issue #11 Resolution):**

When a file is renamed externally (e.g., `git mv redis-caching.md database-caching.md`), the sync command treats this as:
- DELETE: `redis-caching.md` → database record removed, backlinks broken
- CREATE: `database-caching.md` → new database record, new note ID

This destroys metadata (tags, creation date, backlinks). To prevent this data loss:

**Required User Workflow:**
1. Use `notes-cli rename` command for all renames (preserves metadata)
2. If you must rename files externally (e.g., in git), do NOT run sync
3. Future enhancement: Add `--detect-renames` flag to sync (v2)

**Future Enhancement: Rename Detection in Sync (v2):**

A future version could detect renames using content similarity:

```python
def detect_renames(conn, vault_path: str, deleted_files: set, new_files: set) -> dict:
    """Detect renamed files by comparing content hashes.

    Returns: {old_filename: new_filename} for detected renames
    """
    renames = {}

    # For each deleted file, compare with new files
    for old_file in deleted_files:
        # Get old file's content hash from last known state
        # (would require storing content hash in database)
        old_hash = get_stored_content_hash(conn, old_file)

        for new_file in new_files:
            # Hash new file content
            new_hash = hash_file_content(vault_path, new_file)

            if old_hash == new_hash:
                renames[old_file] = new_file
                break

    return renames
```

This would require:
1. Store SHA-256 content hash in `notes` table
2. Update hash on every sync
3. Enable with `notes-cli sync --detect-renames` flag
4. Perform rename operation instead of delete+create

**Priority:** High (prevents data loss in git workflows)

---

## Timestamp Format

All timestamps use ISO 8601 format with UTC timezone:

```
YYYY-MM-DDTHH:MM:SS.ffffffZ
```

Example: `2026-01-21T15:30:45.123456Z`

**Timezone Requirements:**
- Timestamps MUST include `Z` suffix (UTC) when writing to database
- Both `Z` and `+00:00` are acceptable on read (treat as equivalent)
- Display in `show` command uses UTC (no local timezone conversion)
- **Storage Format Normalization:** On write, ALWAYS use `Z` suffix (not `+00:00`). On read, normalize `+00:00` to `Z` for consistent display.

**Python generation:**
```python
from datetime import datetime, timezone
timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
```

---

## Query Patterns

### Insert Note

```sql
INSERT INTO notes (title, filename, created_at, updated_at)
VALUES (?, ?, ?, ?);
```

Parameters: `(title, filename, created_at, updated_at)`

Returns: `cursor.lastrowid` for the new note ID

### Update Note Timestamp

```sql
UPDATE notes SET updated_at = ? WHERE id = ?;
```

Parameters: `(updated_at, note_id)`

### Find Note by Title

```sql
SELECT id, title, filename, created_at, updated_at
FROM notes WHERE title = ?;
```

Parameters: `(title,)`

### Find Note by Filename

```sql
SELECT id, title, filename, created_at, updated_at
FROM notes WHERE filename = ?;
```

Parameters: `(filename,)`

### List Notes (with optional tag filter)

**Without tag filter:**
```sql
SELECT n.id, n.title, n.filename, n.created_at, n.updated_at
FROM notes n
ORDER BY n.updated_at DESC
LIMIT ?;
```

Parameters: `(limit,)`

**With tag filter:**
```sql
SELECT n.id, n.title, n.filename, n.created_at, n.updated_at
FROM notes n
JOIN note_tags nt ON n.id = nt.note_id
JOIN tags t ON nt.tag_id = t.id
WHERE t.name = ?
ORDER BY n.updated_at DESC
LIMIT ?;
```

Parameters: `(tag_name, limit)`

### Search Notes (full-text)

```sql
SELECT n.id, n.title, n.filename, n.created_at, n.updated_at,
       snippet(notes_fts, 1, '**', '**', '...', 32) as snippet,
       -- snippet() parameters: (table, column, prefix, suffix, ellipsis, tokens)
       -- tokens=32 means ~32 words of context around the match
       -rank as score  -- Negate rank: FTS5 rank is negative (more negative = better)
FROM notes_fts
JOIN notes n ON notes_fts.title = n.title
WHERE notes_fts MATCH ?
ORDER BY rank ASC;  -- ASC gives best matches first (most negative rank values)
```

### Search Result Snippet Security (XSS Prevention)

**Snippet Marker Requirements:**

- Use `**` text markers (not HTML `<mark>` tags) for match highlighting
- This prevents XSS if output is later rendered as HTML or copied to web context

**Snippet Content Sanitization:**

Search snippets MUST escape HTML/special characters before display:

```python
import html

def sanitize_snippet(raw_snippet: str) -> str:
    """Sanitize search snippet for safe display.

    Escapes HTML special characters to prevent XSS.
    """
    # Escape HTML entities
    safe_snippet = html.escape(raw_snippet)

    # The ** markers are safe (not HTML)
    # They were added by FTS5 snippet() function

    return safe_snippet

def format_snippet_for_table(snippet: str) -> str:
    """Format snippet for table output."""
    # Sanitize first
    safe = sanitize_snippet(snippet)
    # Truncate if needed
    if len(safe) > 60:
        safe = safe[:57] + '...'
    return safe

def format_snippet_for_json(snippet: str) -> str:
    """Format snippet for JSON output.

    JSON output returns PLAIN TEXT without highlight markers.
    """
    # Remove ** markers for JSON (plain text)
    plain = snippet.replace('**', '')
    # Still sanitize (defense in depth)
    return sanitize_snippet(plain)
```

**Why This Matters:**

User-controlled content (note content) appears in snippets. Without sanitization:
```
# Malicious note content:
<script>alert('XSS')</script>

# Could appear in snippet as:
...found <script>alert('XSS')</script> in results...
```

With sanitization:
```
...found &lt;script&gt;alert('XSS')&lt;/script&gt; in results...
```

**Output Format Security:**

| Format | Markers | HTML Escaped | Notes |
|--------|---------|--------------|-------|
| table | `**text**` | Yes | Safe for terminal and basic HTML |
| JSON | (none) | Yes | Plain text, consumers must handle |

Parameters: `(query,)`

**Notes:**
- Parameterized queries prevent SQL injection, but user search queries MUST also be sanitized for FTS5 to prevent FTS5 operator injection (AND, OR, NOT, NEAR, *, ^, etc.).

**FTS5 Input Sanitization Requirements:**

User search input MUST be sanitized using ONE of the following approaches:

**Option A: Double-quote wrapping with escaping (RECOMMENDED)**
```python
# Safe FTS5 query - treats user input as literal phrase
# 1. Escape all internal double-quotes by doubling them
# 2. Strip asterisks (no escape sequence exists for *)
# 3. Strip carets (^ is column filter operator)
# 4. Wrap entire query in double quotes
safe_input = user_input.replace('"', '""')
safe_input = safe_input.replace('*', '').replace('^', '')
safe_query = '"' + safe_input + '"'
cursor.execute('SELECT ... WHERE notes_fts MATCH ?', (safe_query,))
```

**Option B: Whitelist approach (more restrictive)**
```python
# Only allow alphanumeric characters, spaces, and basic punctuation
import re
safe_input = re.sub(r'[^a-zA-Z0-9\s\-_.,!?]', '', user_input)
safe_query = '"' + safe_input + '"'
cursor.execute('SELECT ... WHERE notes_fts MATCH ?', (safe_query,))
```

**FTS5 Special Characters/Operators that MUST be handled:**
- `"` - phrase delimiter (escape by doubling: `""`)
- `*` - prefix matching wildcard (strip - no escape sequence)
- `^` - column filter (strip - no escape sequence)
- `AND`, `OR`, `NOT` - boolean operators (neutralized by double-quote wrapping)
- `NEAR` - proximity operator (neutralized by double-quote wrapping)
- `(`, `)` - grouping (neutralized by double-quote wrapping)
- `+`, `-` - required/excluded terms (neutralized by double-quote wrapping)

If prefix matching is desired, it should be explicitly enabled via a separate `--prefix` flag, not via user-controlled input.
- The `rank` column is negated (`-rank`) because FTS5 rank values are negative (more negative = better match). Negating provides a positive score where higher = better relevance.

### Add Tag to Note

```sql
-- First, ensure tag exists
INSERT OR IGNORE INTO tags (name) VALUES (?);

-- Get tag id
SELECT id FROM tags WHERE name = ?;

-- Link note to tag
INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?);
```

Parameters: First `(tag_name,)`, then `(tag_name,)`, then `(note_id, tag_id)`

### Remove Tag from Note

```sql
DELETE FROM note_tags
WHERE note_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?);
```

Parameters: `(note_id, tag_name)`

### Get Note Tags

```sql
SELECT t.name
FROM tags t
JOIN note_tags nt ON t.id = nt.tag_id
WHERE nt.note_id = ?
ORDER BY t.name;
```

Parameters: `(note_id,)`

### Get All Tags with Counts

```sql
SELECT t.name, COUNT(nt.note_id) as count
FROM tags t
LEFT JOIN note_tags nt ON t.id = nt.tag_id
GROUP BY t.id, t.name
ORDER BY count DESC, t.name ASC;
```

Parameters: None

### Save Links (delete old, insert new)

```sql
-- Delete existing links from this note
DELETE FROM links WHERE source_note_id = ?;

-- Insert new links (one per link)
INSERT INTO links (source_note_id, target_title, target_note_id)
VALUES (?, ?, (SELECT id FROM notes WHERE title = ?));
```

Parameters: First `(note_id,)`, then for each link `(note_id, target_title, target_title)`

### Get Outgoing Links

```sql
SELECT l.target_title, n.title as resolved_title,
       CASE WHEN l.target_note_id IS NOT NULL THEN 1 ELSE 0 END as exists
FROM links l
LEFT JOIN notes n ON l.target_note_id = n.id
WHERE l.source_note_id = ?;
```

Parameters: `(note_id,)`

### Get Incoming Links (backlinks)

```sql
SELECT n.title as source_title
FROM links l
JOIN notes n ON l.source_note_id = n.id
WHERE l.target_note_id = ?;
```

Parameters: `(note_id,)`

### Update FTS Index

The FTS5 table is created with `content=''` (external content mode), meaning the FTS index stores only the search index, not the original content. This design choice keeps the database smaller since note content lives in `.md` files on the filesystem.

**Sync Workflow:**

When a note is created or updated, the application must:
1. Read the `.md` file content from the filesystem
2. Update the FTS index with the title and file content

```sql
-- On note create/update, update FTS
INSERT INTO notes_fts (title, content) VALUES (?, ?);

-- On note update, delete old entry first
DELETE FROM notes_fts WHERE title = ?;
INSERT INTO notes_fts (title, content) VALUES (?, ?);

-- On note delete (manual filesystem deletion detected)
DELETE FROM notes_fts WHERE title = ?;
```

Parameters: `(title, content)` where `content` is the full text read from the `.md` file, or `(title,)` for delete.

**Important:** Since note content lives in filesystem files (not in the `notes` table), the `content` parameter for FTS indexing must be read from the `.md` file at index time. The search query then joins FTS results back to the `notes` table by title to retrieve metadata.

### FTS External Content Sync Transaction Requirements (CRITICAL)

**Race Condition Prevention:**

Because FTS uses external content mode (`content=''`), the FTS index can become inconsistent with the notes table if updates are not properly synchronized. FTS external content updates MUST be performed within the same transaction as content table updates.

**Required Transaction Pattern:**

```python
def update_note_with_fts(conn, note_id: int, title: str, content: str, updated_at: str):
    """Update note metadata and FTS index atomically.

    All operations MUST be in same transaction to prevent race conditions.
    """
    cursor = conn.cursor()
    try:
        # Begin transaction (implicit with sqlite3)

        # 1. Update notes table timestamp
        cursor.execute(
            "UPDATE notes SET updated_at = ? WHERE id = ?",
            (updated_at, note_id)
        )

        # 2. Update FTS index (delete old, insert new) - SAME TRANSACTION
        cursor.execute("DELETE FROM notes_fts WHERE title = ?", (title,))
        cursor.execute(
            "INSERT INTO notes_fts (title, content) VALUES (?, ?)",
            (title, content)
        )

        # 3. Update links - SAME TRANSACTION
        # ... link updates ...

        conn.commit()  # Atomic commit of all changes
    except Exception:
        conn.rollback()
        raise
```

**Race Condition Scenarios to Prevent:**

1. **Partial Update**: If notes table updates but FTS update fails, search results will be stale
2. **Concurrent Access**: If another process reads between notes update and FTS update, inconsistent state
3. **Crash Recovery**: If crash occurs between updates, database left inconsistent

**Enforcement Rules:**

- MUST NOT commit between notes table update and FTS update
- MUST NOT release connection between notes table update and FTS update
- MUST wrap all related updates in single transaction
- On any failure, MUST rollback entire transaction

---

## FTS Index Update Points

The FTS index MUST be updated at these points:

| Operation | FTS Action | Notes |
|-----------|------------|-------|
| `cmd_new()` | INSERT into notes_fts | After note file created and DB record inserted |
| `cmd_edit()` | DELETE then INSERT into notes_fts | After user saves and exits editor. MUST update FTS index for the edited note. |
| `cmd_sync()` | Full rebuild | DELETE all, re-INSERT from files |
| Note deletion | DELETE from notes_fts | When note file is deleted |

**Implementation:** Call `update_fts_index(note_id, title, content)` after any content change.
For sync, call `rebuild_fts_index()` which truncates and repopulates.

---

## FTS Index Rebuild Triggers

The FTS index MUST be rebuilt (full rebuild via `cmd_sync()`) in these scenarios:

### Automatic Rebuild Triggers

| Trigger | Action | Implementation |
|---------|--------|----------------|
| External file modification | Rebuild on next sync | Detect via mtime comparison |
| Database corruption detected | Rebuild required | Check FTS integrity on startup |
| Version upgrade | Rebuild if schema changed | Store schema version, compare on startup |

### Manual Rebuild Triggers

The `sync` command MUST support explicit FTS rebuild:

```
notes-cli sync [--rebuild-fts] [--vault PATH]
```

| Option | Description |
|--------|-------------|
| `--rebuild-fts` | Force complete FTS index rebuild even if files unchanged |

**When to use `--rebuild-fts`:**
- After restoring vault from backup
- After manual database repair
- After external tools modified note files
- When search results seem stale or incomplete
- After FTS tokenizer configuration changes

### FTS Integrity Check

On vault open (any command), perform lightweight FTS integrity check:

```python
def check_fts_integrity(conn) -> bool:
    """Check FTS index integrity.

    Returns: True if FTS index appears valid, False if rebuild needed
    """
    try:
        # Check FTS table exists and is queryable
        cursor = conn.execute("SELECT COUNT(*) FROM notes_fts")
        fts_count = cursor.fetchone()[0]

        # Compare with notes table count
        cursor = conn.execute("SELECT COUNT(*) FROM notes")
        notes_count = cursor.fetchone()[0]

        # If counts differ significantly, index may be stale
        if abs(fts_count - notes_count) > 0:
            return False  # Rebuild recommended

        return True
    except Exception:
        return False  # FTS table corrupted, rebuild required
```

If integrity check fails, print warning:
```
Warning: FTS search index may be out of sync. Run 'notes-cli sync' to rebuild.
```

---

## Example Data

```sql
INSERT INTO notes (title, filename, created_at, updated_at)
VALUES
    ('Redis Caching', 'redis-caching.md', '2026-01-15T10:00:00Z', '2026-01-20T14:30:00Z'),
    ('HTTP Caching', 'http-caching.md', '2026-01-15T11:00:00Z', '2026-01-21T09:15:00Z'),
    ('CDN Setup', 'cdn-setup.md', '2026-01-16T11:00:00Z', '2026-01-16T11:00:00Z');

INSERT INTO tags (name) VALUES ('performance'), ('infrastructure'), ('caching');

INSERT INTO note_tags (note_id, tag_id) VALUES (1, 1), (1, 3), (2, 3), (3, 2);

INSERT INTO links (source_note_id, target_title, target_note_id)
VALUES
    (1, 'HTTP Caching', 2),
    (1, 'CDN Setup', 3),
    (2, 'Redis Caching', 1);
```

---

## Connection Management

```python
import sqlite3
from contextlib import contextmanager

@contextmanager
def get_connection(vault_path: str):
    """Context manager for database connections."""
    db_path = os.path.join(vault_path, '.notes.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # Enable column access by name
    conn.execute("PRAGMA foreign_keys = ON")  # Enable foreign key constraints
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

**Rules:**
- Always use context manager (ensures close)
- Always commit or rollback (no implicit transactions)
- Set `row_factory = sqlite3.Row` for named column access
- Enable foreign keys with PRAGMA

**Permission Enforcement:**

Database file MUST have 0600 permissions on Unix systems.

**Required Implementation (umask approach):**

The umask approach MUST be used for atomic creation with correct permissions:
```python
import os
import stat

# REQUIRED: Set umask before creation (no race window)
old_umask = os.umask(0o077)
try:
    # Create database file here - created with 0600 permissions
    conn = sqlite3.connect(db_path)
finally:
    os.umask(old_umask)

# After creation, verify permissions (defense in depth):
os.chmod(db_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600
```

**Rationale:** The umask approach ensures the file is created with correct permissions atomically, with no window where the file exists with overly permissive permissions.

If chmod fails, raise `DatabaseError`. On Windows, Unix permissions do not apply; document this as a platform limitation.
