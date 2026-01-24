# Design Completeness Scout Report

## Assessment: ISSUES_FOUND

The documentation is comprehensive and well-structured, but several implementation gaps and ambiguities exist that would force developers to make design decisions during implementation. Most issues relate to incomplete specifications for error handling, edge cases, and operational behavior.

## Issues

### Issue 1: Missing Editor Invocation Specification

**Affected Files:** ["falcon_test/apps/app3/docs/design/components.md", "falcon_test/apps/app3/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From `technical.md`:
```
### Editor Integration: $EDITOR / $VISUAL

**Rationale**:
- Standard Unix convention
- Users already have preferred editors configured
- No need to build editing UI

**Fallback chain**: `$VISUAL` -> `$EDITOR` -> `vim` -> `nano` -> `vi`

**Integration**: `subprocess.call()` for synchronous editing
```

From `cli/interface.md` (new command):
```
**Behavior:**
...
5. Open in editor (fallback chain: `$VISUAL` -> `$EDITOR` -> `vim` -> `nano` -> `vi`)
6. On editor exit: check exit code and file modification
7. Validate content length (max 1,000,000 characters)
8. On save: parse `[[wiki-links]]`, update database

**Editor exit handling:**
- Check editor exit code: non-zero = user cancelled or error
- Compare file mtime before/after: unchanged = no save occurred
- **Cancellation detection**: Operation is cancelled if exit_code != 0 OR mtime unchanged (boolean OR logic)
- If cancelled: delete the created file, do not insert into database
- Empty file after edit: warn user but allow (some users may want empty notes)
```

**What's Missing/Wrong:**

The documentation does not specify:
1. How to check if each editor in the fallback chain exists (which system call? `which`? `shutil.which()`?)
2. What happens if ALL editors in the fallback chain are missing (error message is defined, but behavior is not)
3. Whether the editor process inherits stdin/stdout/stderr or runs detached
4. How to pass the filename to the editor (as argument? some editors have flags like `+` for line numbers)
5. Whether to wait for editor exit synchronously (mentioned `subprocess.call()`) or handle async
6. The exact mtime comparison logic (before opening editor vs after? tolerance for filesystem time resolution?)
7. How to handle editors that create temp files and then rename (vim, emacs swap files)

**Assessment:**

Likely to block implementation. Without knowing the exact editor invocation pattern, developers will make different choices that could lead to bugs (e.g., editors not found when they should be, incorrect cancellation detection, race conditions with mtime).

---

### Issue 2: FTS5 Query Sanitization Implementation Ambiguity

**Affected Files:** ["falcon_test/apps/app3/docs/systems/database/schema.md"]

**Relevant Text From Docs:**

From `database/schema.md`:
```
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
```

**What's Missing/Wrong:**

The specification provides TWO options (A and B) with different behavior but doesn't specify:
1. Which option should be implemented (says "RECOMMENDED" for A but doesn't mandate it)
2. Whether to make this configurable at runtime
3. What the user experience difference is (Option A preserves special chars, Option B strips them - user won't know why their search for "C++" returns nothing)
4. Whether to warn users when characters are stripped (Option B strips silently)
5. How to handle the "prefix matching" feature mentioned: "If prefix matching is desired, it should be explicitly enabled via a separate `--prefix` flag" - but no `--prefix` flag is defined in the CLI interface specification

This creates ambiguity: different developers will choose different options, leading to inconsistent behavior.

**Assessment:**

Moderate implementation blocker. The search command will work, but behavior will vary depending on developer choice. Could lead to user confusion ("why doesn't my search for 'C++' work?") and inconsistent security posture.

---

### Issue 3: Sync Command Behavior Underspecified

**Affected Files:** ["falcon_test/apps/app3/docs/systems/cli/interface.md", "falcon_test/apps/app3/docs/systems/database/schema.md"]

**Relevant Text From Docs:**

From `cli/interface.md`:
```
### `sync`

Synchronizes the database with the filesystem, rebuilding the FTS index.

**Behavior:**
1. Scan all .md files in vault directory
2. For each file: validate (text/UTF-8, content length), update/insert database record, rebuild FTS entry
3. Skip files that fail validation (binary content, exceeds 1MB, UTF-8 decode error)
4. Remove database records for deleted files
5. Clean up orphaned tags (tags with no associated notes)
6. Report: "Synced X notes (Y added, Z updated, W deleted)" or "Synced X notes (Y added, Z updated, W deleted, N skipped)" if any were skipped
```

From `database/schema.md`:
```
**Broken Link Repair:** `cmd_sync()` MUST repair broken links when the target note is created later. For each link with `target_note_id = NULL`, check if `target_title` now matches an existing note title. If a match is found, update `target_note_id`.

```sql
-- Repair broken links during sync
UPDATE links
SET target_note_id = (SELECT id FROM notes WHERE title = links.target_title)
WHERE target_note_id IS NULL
  AND EXISTS (SELECT 1 FROM notes WHERE title = links.target_title);
```
```

**What's Missing/Wrong:**

The sync command specification is incomplete:
1. **Title extraction from filename**: How do you determine the note title from the filename? The filename is sanitized (lowercase, hyphens), but the title stored in DB is the original case-sensitive string. The docs say "sanitize title to filename" but not "desanitize filename to title". How do you reconstruct "My Note" from "my-note.md"?
2. **Update detection**: "update/insert database record" - how do you determine if a note needs updating? Check mtime? Check content hash? Always update?
3. **Transaction boundaries**: Should sync be one big transaction or one transaction per file?
4. **Partial failure handling**: If 100 files are being synced and file #50 fails, do we rollback all changes or continue with the rest?
5. **Link re-parsing**: When updating an existing note during sync, should links be re-parsed from content? The behavior says "rebuild FTS entry" but doesn't mention links.
6. **Concurrent modification**: What if a file is modified during sync? (Another process writes to it between when sync reads it and updates the DB)

**Assessment:**

Major implementation blocker. The sync command is critical for database recovery and cannot be implemented without knowing how to map filenames back to titles. This is a circular dependency: titles become filenames (one-way lossy transformation), but sync needs to reverse it.

---

### Issue 4: Link Character Set Mismatch Unresolved

**Affected Files:** ["falcon_test/apps/app3/docs/design/components.md"]

**Relevant Text From Docs:**

From `components.md`:
```
**Known Limitation: Character Set Mismatch**

Note titles allow more characters than wiki link targets. Title validation allows: `^[^/\\:*?"<>|]{1,200}$` (anything except forbidden OS path characters), while link targets allow only: `^[A-Za-z0-9 _-]+$` (alphanumeric, spaces, hyphens, underscores).

**Impact:** A note titled "My Note (2024)" cannot be linked to with `[[My Note (2024)]]` since parentheses fail link validation.

**Workaround:** Users should use only alphanumeric characters, spaces, hyphens, and underscores in note titles if they intend to link to those notes.

**Rationale:** This restriction prevents path traversal and injection attacks via link targets, which is a higher priority than full character set support for linking.
```

**What's Missing/Wrong:**

This is documented as a "known limitation" but there's no guidance for implementers on:
1. Should the `new` command warn users when they create a title that cannot be linked to?
2. Should the `edit` command warn when parsing links that reference unlinkable titles?
3. How should the `links` command display broken links that are broken due to character mismatch vs genuinely missing notes?
4. Should there be a validation flag like `--linkable-title-only` for the `new` command?

This limitation will cause user confusion ("I created a note called 'C++ Notes' but I can't link to it") with no clear error message or guidance.

**Assessment:**

Moderate blocker. The system will work, but users will encounter unexpected behavior with no clear explanation. The UX is underspecified.

---

### Issue 5: Filename Collision Detection Incomplete

**Affected Files:** ["falcon_test/apps/app3/docs/systems/architecture/ARCHITECTURE-simple.md"]

**Relevant Text From Docs:**

From `ARCHITECTURE-simple.md`:
```
**Filename Collision Note:**
Because sanitization is lossy (e.g., "My Note!" and "My Note?" both become "my-note.md"), both the note title AND the sanitized filename must be unique. When creating a note:
1. Check if title already exists in database -> `DuplicateNoteError` ("Note 'X' already exists")
2. Check if sanitized filename already exists -> `DuplicateNoteError` ("A note with filename 'x.md' already exists")

The database schema enforces UNIQUE constraints on both `title` and `filename` columns.
```

**What's Missing/Wrong:**

The specification says to check both title and filename, but doesn't specify:
1. The order of checks (check title first, then filename? or both at once?)
2. The error message when filename collision occurs: "A note with filename 'x.md' already exists" but it doesn't tell the user WHICH existing note is causing the collision (very important for user to understand the issue)
3. Whether to suggest an alternative filename (e.g., "my-note-2.md")
4. How the `sync` command handles this case (if it finds two files that would map to the same title/filename)
5. Whether to allow users to manually specify a filename to avoid collisions

Without this, users will see cryptic errors like "A note with filename 'my-note.md' already exists" when trying to create "My Note!" and won't know that "My Note?" is the conflicting title.

**Assessment:**

Minor-to-moderate blocker. The validation logic works but UX is poor. Users will be confused by filename collision errors and won't understand how to resolve them.

---

### Issue 6: Database Permissions Enforcement Platform Variance

**Affected Files:** ["falcon_test/apps/app3/docs/systems/database/schema.md"]

**Relevant Text From Docs:**

From `schema.md`:
```
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
```

**What's Missing/Wrong:**

The specification has several gaps:
1. **Windows behavior**: Says "Unix permissions do not apply" on Windows but doesn't specify what SHOULD happen (warning? error? skip silently?). Should Windows use NTFS ACLs instead?
2. **Verification failure**: "After creation, verify permissions (defense in depth): os.chmod(...)" - but what if `os.chmod()` fails? The code says "raise DatabaseError" but where? After the chmod call?
3. **Existing database**: This specifies creation behavior, but what about when opening an EXISTING database? Should permissions be verified and corrected on every open?
4. **Vault on network share**: What if the vault is on NFS/SMB where permissions behave differently?

The implementation is partially specified but edge cases are missing.

**Assessment:**

Minor blocker. Core functionality works on Unix, but Windows and edge case behavior is ambiguous. Could lead to security issues if permissions are not enforced consistently.

---

### Issue 7: Transaction Rollback and File Operations Inconsistency

**Affected Files:** ["falcon_test/apps/app3/docs/design/technical.md"]

**Relevant Text From Docs:**

From `technical.md`:
```
### AD6: Atomic Database Operations

Each command is a single transaction. Either fully succeeds or fully fails.

**Rationale**: No partial updates. Database always in consistent state.
```

And from the same file:
```
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
```

**What's Missing/Wrong:**

There's a fundamental tension here that's not resolved:
1. **Database transactions can rollback, but filesystem operations cannot**: If `cmd_new()` creates a file, inserts into DB, then the transaction fails and rolls back, what happens to the file? The file still exists but the DB has no record of it.
2. The spec says "File operations and database updates SHOULD be in the same transaction where possible" but SQLite transactions only cover database operations, not filesystem operations.
3. No specification for cleanup on failure: If database insert fails after file creation, should the file be deleted? If file creation fails after database insert, should the transaction be rolled back?
4. The `cmd_new()` specification says "If cancelled: delete the created file, do not insert into database" but what if file deletion fails?

This is a classic distributed transaction problem (2PC) and the docs don't provide a clear strategy.

**Assessment:**

Major implementation blocker. Without a clear strategy for maintaining consistency between filesystem and database operations, different developers will implement different approaches (some may leave orphaned files, others may leave orphaned DB records). The system could end up in an inconsistent state.

---

### Issue 8: Open Editor Function Not Specified

**Affected Files:** ["falcon_test/apps/app3/docs/design/components.md"]

**Relevant Text From Docs:**

From `components.md`, the module overview shows components but doesn't include an editor utility:
```
notes_cli/
+-- __init__.py          # Package marker, version
+-- __main__.py          # Entry point: python -m notes_cli
+-- cli.py               # Argument parsing, command routing
+-- commands.py          # Business logic for each command
+-- database.py          # Database connection, queries
+-- models.py            # Data classes, validation
+-- formatters.py        # Output formatting (table, JSON)
+-- exceptions.py        # Custom exception hierarchy
+-- link_parser.py       # Parse [[wiki-links]] from markdown
```

From `technical.md` (concurrent edit protection section):
```python
def cmd_edit(vault_path: str, title: str) -> None:
    """Edit an existing note with conflict detection."""

    # 1. Find note and get file path
    note = find_note_by_title(conn, title)
    filepath = os.path.join(vault_path, note.filename)

    # 2. Record original mtime BEFORE opening editor
    original_mtime = os.path.getmtime(filepath)

    # 3. Open editor
    editor_result = open_editor(filepath)

    if editor_result.cancelled:
        return  # User cancelled, no changes
```

**What's Missing/Wrong:**

The code references `open_editor(filepath)` which returns an `editor_result` object with a `.cancelled` property, but:
1. This function is not listed in the components.md module overview
2. No specification for what module it should live in
3. No specification for the return type structure (what is `editor_result`? A dataclass? A named tuple?)
4. No specification for other properties (just `.cancelled` shown, but what about `.exit_code`, `.mtime_changed`, etc.?)
5. Multiple code examples use different signatures: some show `open_editor(filepath)`, others might need vault_path too

This is referenced in multiple command implementations but never defined.

**Assessment:**

Major implementation blocker. Multiple commands depend on this function (`cmd_new()`, `cmd_edit()`), and without a clear specification, each developer will implement it differently, leading to inconsistent behavior.

---

### Issue 9: Snippet Sanitization Not Integrated Into Query Specification

**Affected Files:** ["falcon_test/apps/app3/docs/systems/database/schema.md"]

**Relevant Text From Docs:**

From `schema.md`:
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
```

And earlier in the same file:

```sql
### Search Notes (full-text)

```sql
SELECT n.id, n.title, n.filename, n.created_at, n.updated_at,
       snippet(notes_fts, 1, '**', '**', '...', 32) as snippet,
       -rank as score
FROM notes_fts
JOIN notes n ON notes_fts.title = n.title
WHERE notes_fts MATCH ?
ORDER BY rank ASC;
```
```

**What's Missing/Wrong:**

The specification shows:
1. A SQL query that returns a `snippet` column
2. A `sanitize_snippet()` function to sanitize the snippet

But it doesn't specify:
1. WHERE the sanitization should happen (in `database.py` when fetching results? in `formatters.py` when formatting output? in `commands.py`?)
2. WHEN it should be applied (always? only for table output? not for JSON?)
3. The section says "for table output" and "for JSON output" separately, with JSON removing `**` markers but table keeping them. This is specified in the function examples but not in the integration point.

This is a security requirement but the integration is not specified, so developers might forget to call it or call it in the wrong place.

**Assessment:**

Moderate blocker. The sanitization function is defined but not integrated into the data flow. Developers might skip this step, leading to XSS vulnerabilities if output is ever rendered in a web context (even though v1 is CLI-only, the spec mentions "defense in depth").

---

### Issue 10: Orphan Tag Cleanup During Sync Not Specified

**Affected Files:** ["falcon_test/apps/app3/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From `cli/interface.md`:
```
### `sync`

**Behavior:**
...
5. Clean up orphaned tags (tags with no associated notes)
...
```

**What's Missing/Wrong:**

This mentions cleaning up orphaned tags but doesn't specify:
1. The SQL query to find orphaned tags
2. Whether this happens in the same transaction as the file sync
3. Whether to report deleted tags to the user (e.g., "Removed 3 orphaned tags: old-tag, deprecated, unused")
4. Whether this is affected by the `--rebuild-fts` flag
5. Order of operations: clean up orphaned tags before or after syncing files?

This is mentioned but not specified in enough detail to implement consistently.

**Assessment:**

Minor blocker. The feature is clear but implementation details are missing. Different developers will implement different approaches (some may report deleted tags, others won't; some may do it in separate transaction).

---

## Summary

The documentation is very thorough and demonstrates strong architectural thinking, but it has gaps in these areas:

1. **Editor invocation mechanics** - critical implementation detail missing
2. **FTS5 query sanitization** - two options given, no mandate on which to use
3. **Sync command title reconstruction** - cannot reverse lossy filename sanitization
4. **Filesystem/database transaction consistency** - no strategy for 2-phase commit
5. **Utility function specifications** - `open_editor()` referenced but not defined
6. **UX for edge cases** - filename collisions, character set mismatches
7. **Platform-specific behavior** - Windows permissions not specified
8. **Security feature integration** - sanitization function defined but not integrated
9. **Minor operational details** - orphan tag cleanup, permission verification on open

Most critical: Issues 1, 3, 7, and 8 would block implementation entirely. Issues 2, 4, 5, 6, 9, 10 would lead to inconsistent implementations across developers.
