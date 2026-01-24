# Technical Design: Note-taking/Wiki CLI

## Technology Choices

### Language: Python 3.10+

**Rationale**:
- Target users likely have Python installed (common on macOS/Linux)
- Rich standard library reduces dependencies
- Type hints (3.10+) improve code quality and IDE support
- Cross-platform without compilation

**Constraint**: Standard library only. No pip dependencies.

### Database: SQLite3

**Rationale**:
- Zero configuration, single file
- Included in Python standard library
- Handles 10,000+ notes easily
- Full-text search via FTS5 extension
- Supports concurrent reads (single writer)

**Constraint**: Use `sqlite3` module only. No ORM, no SQLAlchemy.

**Usage**: Metadata only - note content lives in markdown files, not database.

### CLI Framework: argparse

**Rationale**:
- Standard library (no dependencies)
- Sufficient for our command structure
- Well-documented, familiar to Python developers

**Rejected alternatives**:
- Click: External dependency
- Typer: External dependency
- Fire: Magic behavior, harder to control

### Editor Integration: $EDITOR / $VISUAL

**Rationale**:
- Standard Unix convention
- Users already have preferred editors configured
- No need to build editing UI

**Fallback chain**: `$VISUAL` -> `$EDITOR` -> `vim` -> `nano` -> `vi`

**Integration**: `subprocess.call()` for synchronous editing

---

## Architecture Decisions

### AD1: Layered Architecture

```
CLI Layer (cli.py)
    | parses args, routes commands
    v
Command Layer (commands.py)
    | business logic, validation
    v
Database Layer (database.py)
    | SQL queries, connection management
    v
Filesystem Layer (via commands.py)
    | reads/writes markdown files
```

**Rationale**: Separation of concerns. CLI parsing separate from business logic separate from data access.

### AD2: No Global State

Each command receives explicit parameters. No module-level database connections or configuration objects.

**Rationale**: Testability, predictability, no hidden coupling.

### AD3: Explicit Error Types

Custom exception hierarchy maps to exit codes:

```python
NotesError (base)
+-- ValidationError      -> exit 1
+-- DatabaseError        -> exit 2
+-- NoteNotFoundError    -> exit 3
+-- DuplicateNoteError   -> exit 4
+-- VaultError           -> exit 5
```

**Rationale**: Callers can catch specific errors. Exit codes are predictable and scriptable.

### AD4: Parameterized Queries Only

**All SQL queries MUST use parameterized placeholders (`?`).**

Never:
```python
cursor.execute(f"SELECT * FROM notes WHERE title = '{title}'")  # WRONG
```

Always:
```python
cursor.execute("SELECT * FROM notes WHERE title = ?", (title,))  # RIGHT
```

**Rationale**: Prevents SQL injection. Non-negotiable security requirement.

### AD5: Input Validation at Boundary

Validate all user input in the CLI layer before passing to commands:
- **Note title**: non-empty, max 200 chars, no path separators (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
- **Note content**: max 1,000,000 characters (1MB) to prevent DoS via memory exhaustion
- **Tag name**: alphanumeric + hyphen + underscore, max 50 chars
- **Search query**: non-empty, max 500 chars
- **Vault path**: no `..`, must be absolute or resolve to absolute
- **Output path**: no `..`, must be writable

**Content Length Enforcement:**

Note content MUST be validated for maximum length at these points:
1. After editor exits in `cmd_new()` and `cmd_edit()` - read file and check length
2. During `cmd_sync()` when reading files from filesystem

```python
MAX_CONTENT_LENGTH = 1_000_000  # 1MB / ~1 million characters

def validate_content_length(content: str, filename: str) -> None:
    """Validate note content does not exceed maximum length.

    Raises:
        ValidationError if content exceeds MAX_CONTENT_LENGTH
    """
    if len(content) > MAX_CONTENT_LENGTH:
        raise ValidationError(
            f"Note content exceeds maximum length of {MAX_CONTENT_LENGTH:,} characters. "
            f"Current length: {len(content):,}"
        )
```

If content exceeds limit:
- `cmd_new()` / `cmd_edit()`: Reject with error, prompt user to reduce content
- `cmd_sync()`: Log warning and skip file (do not index), continue with other files

**Case Sensitivity:**
- Note titles are case-sensitive ("My Note" and "my note" are different notes)
- Tags are case-sensitive ("Database" and "database" are different tags)
- Search (FTS5) is case-insensitive by default

**Rationale**: Fail fast with clear error messages. Don't let bad data reach database or filesystem layers.

### AD6: Atomic Database Operations

Each command is a single transaction. Either fully succeeds or fully fails.

**Rationale**: No partial updates. Database always in consistent state.

### AD7: Content in Files, Metadata in SQLite

- **Markdown files** in vault directory: actual note content
- **SQLite database** (`.notes.db`): title, filename, created_at, updated_at, tags, links

**Rationale**:
- Files are human-readable without special tools
- Files can be versioned with git
- Files survive database corruption
- Database enables fast search and link queries

**File/Database Consistency:**
- File operations and database updates SHOULD be in the same transaction where possible
- If file deletion occurs between DB query and file read, raise `FileNotFoundError`
- `cmd_sync()` reconciles filesystem/database state and should be used to recover from inconsistencies

**Concurrent Edit Handling:**
- Temp-file-then-atomic-rename strategy provides conflict detection (see Concurrent Edit Protection section)
- If conflict detected, reject edit with clear error message
- Users sharing a vault must coordinate externally (e.g., communication, git branches)

### AD10: Transaction Rollback and Filesystem Operations Strategy

**Problem:** Database transactions can rollback, but filesystem operations (create file, delete file, rename) cannot be rolled back. This creates risk of inconsistent state.

**Strategy: File-First, Then Database (with Compensating Actions)**

All commands that modify both filesystem and database MUST follow this order:

1. **Validate inputs** (fail fast before any changes)
2. **Perform filesystem operation** (create/update/delete file)
3. **Perform database operation** (within transaction)
4. **On database failure**: Compensating filesystem action (undo step 2)

**Rationale:**
- Filesystem operations are the source of truth (files survive DB corruption)
- Database is an index/cache of filesystem state
- `cmd_sync()` can always rebuild database from filesystem
- Better to have "file exists but not indexed" than "indexed but file missing"

**Implementation Requirements:**

```python
def cmd_new(vault_path: str, title: str, tags: list[str]) -> None:
    """Create new note with file-first strategy."""

    # 1. Validate inputs (fail before any changes)
    validate_title(title)
    for tag in tags:
        validate_tag(tag)

    filename = sanitize_filename(title)
    filepath = os.path.join(vault_path, filename)

    # Check file doesn't already exist
    if os.path.exists(filepath):
        raise FileExistsError(f"File already exists: {filename}")

    # 2. Create file FIRST (source of truth)
    try:
        content = expand_template(DEFAULT_TEMPLATE, title, filename)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
    except OSError as e:
        raise IOError(f"Failed to create note file: {e}")

    # 3. Add to database (index the file)
    conn = get_connection(vault_path)
    try:
        conn.execute('BEGIN IMMEDIATE')

        # Insert note metadata
        cursor = conn.execute(
            'INSERT INTO notes (title, filename, created_at, updated_at) VALUES (?, ?, ?, ?)',
            (title, filename, now_iso(), now_iso())
        )
        note_id = cursor.lastrowid

        # Insert tags
        for tag in tags:
            tag_id = get_or_create_tag(conn, tag)
            conn.execute(
                'INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)',
                (note_id, tag_id)
            )

        # Insert FTS entry
        conn.execute(
            'INSERT INTO notes_fts (rowid, title, content) VALUES (?, ?, ?)',
            (note_id, title, content)
        )

        conn.commit()

    except sqlite3.Error as e:
        conn.rollback()

        # 4. COMPENSATING ACTION: Remove file since DB insert failed
        try:
            os.unlink(filepath)
        except OSError:
            # Log warning but don't raise - DB rollback is more important
            print(f"Warning: Failed to clean up file {filepath} after database error",
                  file=sys.stderr)

        raise DatabaseError(f"Failed to create note in database: {e}")


def cmd_delete(vault_path: str, title: str) -> None:
    """Delete note with file-first strategy."""

    conn = get_connection(vault_path)

    # 1. Find note in database
    note = find_note_by_title(conn, title)
    filepath = os.path.join(vault_path, note.filename)

    # 2. Delete file FIRST
    file_deleted = False
    try:
        os.unlink(filepath)
        file_deleted = True
    except FileNotFoundError:
        # File already gone - acceptable, just clean up DB
        file_deleted = True
    except OSError as e:
        raise IOError(f"Failed to delete note file: {e}")

    # 3. Remove from database
    try:
        conn.execute('BEGIN IMMEDIATE')

        # Delete from FTS
        conn.execute('DELETE FROM notes_fts WHERE rowid = ?', (note.id,))

        # Delete tags junction
        conn.execute('DELETE FROM note_tags WHERE note_id = ?', (note.id,))

        # Delete links
        conn.execute('DELETE FROM links WHERE source_note_id = ? OR target_note_id = ?',
                     (note.id, note.id))

        # Delete note
        conn.execute('DELETE FROM notes WHERE id = ?', (note.id,))

        conn.commit()

    except sqlite3.Error as e:
        conn.rollback()

        # 4. COMPENSATING ACTION: Restore file from... nowhere
        # We can't restore deleted file content!
        # This is the fundamental limitation of file-first strategy for deletes
        if file_deleted:
            print(
                f"CRITICAL: File {filepath} was deleted but database cleanup failed.\n"
                f"The file cannot be recovered. Run 'sync' to update database index.\n"
                f"Database error: {e}",
                file=sys.stderr
            )
        raise DatabaseError(f"Failed to delete note from database: {e}")


def cmd_rename(vault_path: str, old_title: str, new_title: str) -> None:
    """Rename note with file-first strategy."""

    # 1. Validate
    validate_title(new_title)

    conn = get_connection(vault_path)
    note = find_note_by_title(conn, old_title)

    old_filepath = os.path.join(vault_path, note.filename)
    new_filename = sanitize_filename(new_title)
    new_filepath = os.path.join(vault_path, new_filename)

    if os.path.exists(new_filepath):
        raise FileExistsError(f"Target file already exists: {new_filename}")

    # 2. Rename file FIRST
    old_filename_backup = note.filename  # For compensating action
    try:
        os.rename(old_filepath, new_filepath)
    except OSError as e:
        raise IOError(f"Failed to rename file: {e}")

    # 3. Update database
    try:
        conn.execute('BEGIN IMMEDIATE')

        conn.execute(
            'UPDATE notes SET title = ?, filename = ?, updated_at = ? WHERE id = ?',
            (new_title, new_filename, now_iso(), note.id)
        )

        # Update FTS
        conn.execute(
            'UPDATE notes_fts SET title = ? WHERE rowid = ?',
            (new_title, note.id)
        )

        # Update links referencing this note by title
        conn.execute(
            'UPDATE links SET target_title = ? WHERE target_title = ?',
            (new_title, old_title)
        )

        conn.commit()

    except sqlite3.Error as e:
        conn.rollback()

        # 4. COMPENSATING ACTION: Rename file back
        try:
            os.rename(new_filepath, old_filepath)
        except OSError:
            print(
                f"CRITICAL: File was renamed to {new_filename} but database update failed.\n"
                f"Failed to rename back to {old_filename_backup}.\n"
                f"Manual intervention required. Run 'sync' after fixing filename.\n"
                f"Database error: {e}",
                file=sys.stderr
            )
        raise DatabaseError(f"Failed to update note in database: {e}")
```

**Critical Scenarios:**

| Scenario | Outcome | Recovery |
|----------|---------|----------|
| File create succeeds, DB insert fails | File orphaned (not indexed) | Compensating action deletes file |
| File delete succeeds, DB delete fails | DB has stale entry | **CRITICAL**: File lost, run sync |
| File rename succeeds, DB update fails | File renamed, DB stale | Compensating action renames back |
| File create fails | No changes | Immediate failure, no cleanup needed |
| File delete fails | No changes | Immediate failure, no cleanup needed |

**Known Limitations:**

1. **Delete is unrecoverable**: If file deletion succeeds but DB cleanup fails, the file content is permanently lost. There is no way to restore it from the database.

2. **Race condition window**: Between filesystem operation and database transaction commit, another process could see inconsistent state.

3. **Compensating actions can fail**: If compensating action (e.g., delete orphaned file) fails, system is left in inconsistent state. Users must run `cmd_sync()` to reconcile.

**Recommendation:**
Users SHOULD run `cmd_sync()` after any error to reconcile filesystem and database state.

### Version Conflict Resolution Strategy

**Conflict Scenario:**
When two processes or users edit the same note simultaneously, the following conflict resolution strategy applies:

**Strategy: Last-Write-Wins with Warning**

1. **Detection**: Before saving, check if file mtime has changed since edit started
2. **Resolution**: If conflict detected, last write wins BUT user is warned
3. **Preservation**: Original content is NOT automatically preserved (user responsibility)

**Implementation:**

```python
def save_note_with_conflict_check(
    filepath: str,
    new_content: str,
    original_mtime: float
) -> tuple[bool, str]:
    """Save note content with conflict detection.

    Args:
        filepath: Path to note file
        new_content: Content to save
        original_mtime: File mtime when edit started

    Returns:
        Tuple of (conflict_detected: bool, message: str)
    """
    current_mtime = os.path.getmtime(filepath)

    if current_mtime > original_mtime:
        # File was modified by another process
        # LAST-WRITE-WINS: Save anyway, but warn user
        with open(filepath, 'w') as f:
            f.write(new_content)
        return (True, "Warning: File was modified by another process. Your changes have been saved, overwriting the other changes.")

    # No conflict
    with open(filepath, 'w') as f:
        f.write(new_content)
    return (False, "")
```

**User Warning Output:**
```
Warning: Note 'My Note' was modified while you were editing.
Your changes have been saved. The previous changes were overwritten.
Consider using version control (git) for shared vaults.
```

**Alternative Strategy (NOT implemented in v1):**

For stricter conflict handling, fail with conflict error requiring manual resolution:
```python
if current_mtime > original_mtime:
    raise ConflictError(
        f"Note '{title}' was modified by another process. "
        f"Your changes were NOT saved. "
        f"Re-open the note to see current content."
    )
```

**Recommendation for Users:**
- Use git for version control if sharing vault
- Don't run multiple instances editing same note
- Use `sync` command to detect external changes

### Concurrent Edit Protection

**Problem:** Multiple processes or users editing the same note can cause data loss.

**v1 Implementation: Temp-File-Then-Atomic-Rename Strategy**

The `cmd_edit()` function MUST use a temp-file-then-atomic-rename strategy to provide actual conflict detection:

```python
def cmd_edit(vault_path: str, title: str) -> None:
    """Edit an existing note with conflict detection.

    Uses temp-file-then-atomic-rename to detect concurrent edits:
    1. Copy original file to temp location
    2. Open temp file in editor
    3. After editor exits, check if original file changed
    4. If changed: conflict detected, reject save
    5. If unchanged: atomically rename temp over original
    """
    import tempfile
    import shutil

    # 1. Find note and get file path
    note = find_note_by_title(conn, title)
    filepath = os.path.join(vault_path, note.filename)

    # 2. Record original mtime and content hash BEFORE copying
    original_mtime = os.path.getmtime(filepath)
    with open(filepath, 'rb') as f:
        original_content = f.read()
    original_hash = hashlib.sha256(original_content).hexdigest()

    # 3. Copy to temp file for editing
    temp_fd, temp_path = tempfile.mkstemp(suffix='.md', prefix='note_edit_')
    os.close(temp_fd)  # Close descriptor, editor will reopen
    shutil.copy2(filepath, temp_path)

    try:
        # 4. Open editor on temp file
        editor_result = open_editor(temp_path)

        if editor_result.cancelled:
            # User cancelled, remove temp file
            os.unlink(temp_path)
            return

        # 5. Check for conflict BEFORE committing changes
        current_mtime = os.path.getmtime(filepath)
        with open(filepath, 'rb') as f:
            current_content = f.read()
        current_hash = hashlib.sha256(current_content).hexdigest()

        if current_hash != original_hash:
            # Original file was modified by another process during edit
            # Do NOT overwrite - conflict detected
            os.unlink(temp_path)
            raise ConflictError(
                f"Conflict detected: Note '{title}' was modified by another process.\n"
                f"Your changes were NOT saved to prevent data loss.\n"
                f"Your edits are still in your editor's undo history.\n"
                f"Consider re-opening the note to see current content."
            )

        # 6. No conflict - atomically replace original with edited version
        # Read edited content for database update
        with open(temp_path, 'rb') as f:
            edited_content = f.read()

        # Validate edited content
        if is_binary_content(edited_content):
            os.unlink(temp_path)
            raise ValidationError("File contains binary content. Only text/markdown files are supported.")

        edited_text = edited_content.decode('utf-8')
        validate_content_length(edited_text, filepath)

        # Atomic rename (POSIX guarantees atomicity)
        # On Windows, may need to remove target first
        if os.name == 'nt':  # Windows
            os.unlink(filepath)
        os.rename(temp_path, filepath)

        # 7. Update database (FTS, links, timestamp)
        # If this fails, file is already saved but DB is stale
        # User can run sync to fix
        update_note_metadata(conn, note.id, edited_text)

    except Exception:
        # Clean up temp file on any error
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise
```

**File Locking (NOT implemented in v1):**

For stricter protection, file locking could be implemented:

```python
import fcntl

def acquire_edit_lock(filepath: str) -> int:
    """Acquire exclusive lock on note file.

    Returns: File descriptor (must be closed to release lock)
    Raises: LockError if lock cannot be acquired
    """
    lock_path = filepath + '.lock'
    fd = os.open(lock_path, os.O_CREAT | os.O_WRONLY, 0o600)
    try:
        # Non-blocking exclusive lock
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return fd
    except BlockingIOError:
        os.close(fd)
        raise LockError(f"Note is being edited by another process")

def release_edit_lock(fd: int, filepath: str):
    """Release edit lock."""
    fcntl.flock(fd, fcntl.LOCK_UN)
    os.close(fd)
    lock_path = filepath + '.lock'
    try:
        os.unlink(lock_path)
    except FileNotFoundError:
        pass
```

**Why File Locking is NOT in v1:**
- Adds complexity
- Lock files can become stale if process crashes
- Cross-platform issues (Windows locking is different)
- Single-user scenario doesn't typically need it

**Documented Limitation:**
Users MUST be warned in documentation and `--help` output that concurrent editing is not protected. Recommendation: use git branches for collaborative workflows.

### Note History/Versioning (Future Feature)

**Current v1 Scope:**
Note history/versioning is NOT implemented in v1. Users MUST use git for version control.

**Note:** Detailed implementation requirements for note history have been removed from this document as they are not part of v1 scope. If this feature is implemented in a future version, refer to the archived design documents or create a new specification at that time.

### AD8: Filename Sanitization for Note Titles

Note titles become filenames via sanitization:
- Title `"My Note/Ideas"` becomes `my-note-ideas.md`
- Rules: lowercase, replace spaces with hyphens, remove special characters
- Max filename length: 100 characters (excluding `.md`)

**Rationale**: Safe filenames that work across all operating systems.

### AD9: Template Variable Expansion Security

When creating new notes, a template is used with the title as the H1 header. Template variables MUST only expand predefined safe variables, not arbitrary expressions.

**Allowed Template Variables:**

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `{title}` | Note title (sanitized) | `My Note` |
| `{date}` | Current date (ISO 8601) | `2026-01-22` |
| `{datetime}` | Current datetime (ISO 8601) | `2026-01-22T15:30:00Z` |
| `{filename}` | Sanitized filename | `my-note.md` |

**Disallowed:**
- Arbitrary Python expressions: `{__import__('os').system('rm -rf /')}`
- File path access: `{open('/etc/passwd').read()}`
- Environment variables: `{os.environ['SECRET']}`
- Any callable execution

**Safe Template Implementation:**

```python
from datetime import datetime, timezone
import re

# ONLY these variables are allowed - whitelist approach
SAFE_TEMPLATE_VARS = {'title', 'date', 'datetime', 'filename'}

def expand_template(template: str, title: str, filename: str) -> str:
    """Safely expand template variables.

    Only predefined safe variables are expanded.
    Unknown variables are left as-is (not evaluated).
    """
    now = datetime.now(timezone.utc)

    # Define safe variable values
    safe_values = {
        'title': title,
        'date': now.strftime('%Y-%m-%d'),
        'datetime': now.isoformat().replace('+00:00', 'Z'),
        'filename': filename,
    }

    # Use simple string replacement, NOT str.format() or f-strings
    # This prevents {expression} evaluation
    result = template
    for var, value in safe_values.items():
        result = result.replace('{' + var + '}', value)

    return result

# Default note template
DEFAULT_TEMPLATE = """# {title}

Created: {date}

"""
```

**Security Warning:**

NEVER use these for template expansion:
```python
# DANGEROUS - allows arbitrary code execution
template.format(**user_controlled_dict)
f"{user_input}"
eval(template)
exec(template)
```

Always use explicit string replacement with a whitelist of allowed variables.

---

## Data Model

### Notes Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| title | TEXT | UNIQUE NOT NULL |
| filename | TEXT | UNIQUE NOT NULL |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |

### Tags Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |

### Note_Tags Junction Table

| Column | Type | Constraints |
|--------|------|-------------|
| note_id | INTEGER | FK to notes |
| tag_id | INTEGER | FK to tags |
| PRIMARY KEY | (note_id, tag_id) | |

### Links Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| source_note_id | INTEGER | FK to notes |
| target_title | TEXT | NOT NULL (may not exist yet) |
| target_note_id | INTEGER | FK to notes, nullable |

### Full-Text Search (notes_fts)

A FTS5 virtual table for full-text search capability. See `docs/systems/database/schema.md` for complete FTS5 configuration including tokenizer settings and query patterns.

---

## Performance Targets

| Operation | Target | Max dataset |
|-----------|--------|-------------|
| init | <500ms | n/a |
| new | <100ms | n/a |
| show | <50ms | n/a |
| search | <100ms | 10,000 notes |
| list | <100ms | 10,000 notes |
| sync | <60s | 10,000 notes |
| backup | <30s | 10,000 notes |

---

## Security Considerations

1. **SQL Injection**: Mitigated by AD4 (parameterized queries only)
2. **Path Traversal**: Validate vault and output paths, reject `..` sequences
3. **Filename Injection**: Sanitize note titles before creating files (AD8)
4. **Error Message Leakage**: Don't expose SQL errors, full file paths, or stack traces in user messages
5. **File Permissions**: Database file should have restrictive permissions (0600)
6. **Wiki Link Path Traversal**: Wiki link targets MUST be validated to prevent path traversal (see below)
7. **Attachment Path Security**: If attachments are added in future versions, they MUST be validated (see below)

### Wiki Link and Attachment Path Security

**Wiki Link Validation:**

Wiki link targets (`[[target]]`) MUST be validated to prevent:
- Path traversal attacks (`[[../../../etc/passwd]]`)
- Absolute path references (`[[/etc/passwd]]`)
- URL injection (`[[javascript:alert(1)]]`, `[[file:///etc/passwd]]`)

Validation requirements (see `link_parser.py` in components.md):
- Only allow alphanumeric characters, spaces, hyphens, and underscores
- Maximum length of 200 characters
- No path separators (`/`, `\`)
- No URL schemes (`:` followed by `//`)

**Attachment Path Security (Future Feature):**

If/when attachment support is added, attachment references MUST be validated:

```python
def validate_attachment_path(attachment_ref: str, vault_path: str) -> str:
    """Validate attachment reference stays within attachments directory.

    Args:
        attachment_ref: User-provided attachment reference
        vault_path: Path to vault directory

    Returns:
        Validated absolute path to attachment

    Raises:
        ValidationError if path escapes attachments directory
    """
    # Attachments MUST be stored in vault/attachments/ subdirectory
    attachments_dir = os.path.join(vault_path, 'attachments')

    # Resolve the full path
    resolved = os.path.realpath(os.path.join(attachments_dir, attachment_ref))
    base_resolved = os.path.realpath(attachments_dir)

    # Containment check: resolved path MUST be within attachments directory
    if not resolved.startswith(base_resolved + os.sep):
        raise ValidationError("Attachment path must be within attachments directory")

    return resolved
```

**Disallowed attachment references:**
- Absolute paths: `/etc/passwd`
- Parent directory traversal: `../secret.txt`, `foo/../../bar`
- Symlinks pointing outside attachments directory
- URL schemes: `file:///`, `http://`

### Markdown Sanitization for Rendering

**HTML in Markdown:**

Markdown allows inline HTML, which creates XSS risks if content is rendered in a web context (e.g., export to HTML, future web UI). The following sanitization rules MUST be applied:

**Current Scope (CLI-only, v1):**

For v1 (CLI text output only), HTML sanitization is minimal:
- `show` command outputs raw markdown to terminal (safe - terminals don't interpret HTML)
- `export --format txt` strips markdown formatting AND HTML tags
- `export --format html` is explicitly not implemented in v1

**Sanitization for Text Export:**

```python
import re

def strip_markdown_formatting(content: str) -> str:
    """Strip markdown formatting for plain text export.

    Used for export --format txt command.

    Removes:
    - Headers (# ## ###)
    - Bold (**text** and __text__)
    - Italic (*text* and _text_)
    - Links [[wiki-link]] -> wiki-link
    - Inline code `code` -> code
    - Code blocks ```code``` -> code (preserves content)
    - Horizontal rules (---, ***, ___)
    - Lists (* - + numbered) -> plain text (indent preserved)
    - Blockquotes (>) -> plain text
    - HTML tags and entities
    """
    # Remove code blocks first (preserve content, remove delimiters)
    content = re.sub(r'```[^\n]*\n(.*?)\n```', r'\1', content, flags=re.DOTALL)

    # Remove inline code backticks
    content = re.sub(r'`([^`]+)`', r'\1', content)

    # Remove headers (# ## ### etc)
    content = re.sub(r'^#+\s+', '', content, flags=re.MULTILINE)

    # Remove bold and italic
    content = re.sub(r'\*\*([^*]+)\*\*', r'\1', content)  # **bold**
    content = re.sub(r'__([^_]+)__', r'\1', content)  # __bold__
    content = re.sub(r'\*([^*]+)\*', r'\1', content)  # *italic*
    content = re.sub(r'_([^_]+)_', r'\1', content)  # _italic_

    # Remove wiki links (keep link text)
    content = re.sub(r'\[\[([^\]]+)\]\]', r'\1', content)

    # Remove markdown links (keep link text)
    content = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', content)

    # Remove horizontal rules
    content = re.sub(r'^[-*_]{3,}$', '', content, flags=re.MULTILINE)

    # Remove blockquote markers (keep content)
    content = re.sub(r'^>\s*', '', content, flags=re.MULTILINE)

    # Remove list markers (keep content, preserve indent)
    content = re.sub(r'^(\s*)[*+-]\s+', r'\1', content, flags=re.MULTILINE)
    content = re.sub(r'^(\s*)\d+\.\s+', r'\1', content, flags=re.MULTILINE)

    # Remove HTML tags
    content = re.sub(r'<[^>]+>', '', content)

    # Decode common HTML entities
    content = content.replace('&lt;', '<')
    content = content.replace('&gt;', '>')
    content = content.replace('&amp;', '&')
    content = content.replace('&quot;', '"')
    content = content.replace('&#39;', "'")

    return content
```

**Future HTML Export Requirements (NOT in v1):**

If/when HTML export is implemented, rendered markdown MUST:

1. **Option A: Strip all HTML** (safest)
   ```python
   # Use a whitelist of allowed markdown elements only
   # Strip ALL raw HTML from input before rendering
   ```

2. **Option B: Sanitize HTML** (if HTML needed)
   ```python
   # Use a proper HTML sanitizer library (e.g., bleach, nh3)
   # Whitelist only safe tags: <p>, <em>, <strong>, <code>, <pre>, <ul>, <ol>, <li>, <blockquote>
   # Strip all attributes except: href (for <a>, validated), src (for <img>, validated)
   # Remove all: <script>, <style>, <iframe>, <object>, <embed>, event handlers (onclick, etc.)
   ```

**Dangerous HTML patterns to block:**
- `<script>` tags
- `<style>` tags
- Event handlers: `onclick`, `onerror`, `onload`, etc.
- `javascript:` URLs
- `data:` URLs with executable content
- `<iframe>`, `<object>`, `<embed>` tags
- CSS expressions: `expression()`, `url()`

### Binary File Handling

**v1 Scope:**
Binary file attachments are NOT supported in v1 (see Non-Goals in vision.md). Notes MUST be text/markdown only.

**Binary File Detection and Rejection:**

When reading or creating note files, binary content MUST be detected and rejected:

```python
def is_binary_content(content: bytes) -> bool:
    """Detect if content appears to be binary.

    Uses null-byte detection heuristic.

    Known limitation: This may have false positives for text files containing
    null bytes as part of their content encoding or representation. This is
    an acceptable trade-off for simplicity in v1; users should ensure notes
    are standard UTF-8 text without embedded null bytes.
    """
    # Check first 8KB for null bytes
    sample = content[:8192]
    return b'\x00' in sample

def validate_text_file(filepath: str) -> str:
    """Read and validate file is text, not binary.

    Returns: File content as string
    Raises: ValidationError if file is binary
    """
    with open(filepath, 'rb') as f:
        raw_content = f.read()

    if is_binary_content(raw_content):
        raise ValidationError(
            f"File appears to be binary. Only text/markdown files are supported. "
            f"Binary files should be stored separately (e.g., in a git-lfs repository)."
        )

    try:
        return raw_content.decode('utf-8')
    except UnicodeDecodeError:
        raise ValidationError(
            f"File is not valid UTF-8 text. Only UTF-8 encoded text files are supported."
        )
```

**Enforcement Points:**

| Operation | Check | Action on Binary |
|-----------|-------|------------------|
| `cmd_new()` | After editor exits | Reject, show error |
| `cmd_edit()` | After editor exits | Reject, show error |
| `cmd_sync()` | When reading each file | Skip file, log warning |
| `cmd_show()` | Before display | Show error |
| `cmd_export()` | Before export | Show error |

**Error Messages:**

```
Error: Cannot save 'My Note': File contains binary content.
Only text/markdown files are supported.

Error: Cannot index 'binary-file.md' during sync: File appears to be binary.
Skipping. (Use --verbose for details)
```

**Future Attachment Support:**

If/when binary attachments are added:
1. Binary files MUST be stored in `vault/attachments/` subdirectory
2. Binary files MUST NOT be indexed in FTS
3. Binary files MUST have path traversal protection (see Attachment Path Security)
4. References in notes use special syntax: `![[attachment:filename.png]]`
5. Maximum attachment size: 10MB per file, 100MB total per vault
