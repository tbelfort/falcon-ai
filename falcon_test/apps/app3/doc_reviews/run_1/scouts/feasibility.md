# Architecture Feasibility Scout Report

## Assessment: ISSUES_FOUND

This architecture has several significant feasibility issues that need resolution before implementation, particularly around FTS5 transaction guarantees, race condition handling, and inconsistent validation rules that will cause user-facing problems.

## Issues

### Issue 1: FTS5 External Content Transaction Guarantees

**Affected Files:** ["falcon_test/apps/app3/docs/systems/database/schema.md"]

**Relevant Text From Docs:**
```
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
```

**What's Missing/Wrong:**

The architecture assumes FTS5 virtual tables participate in SQLite transactions in the same way as regular tables. This is technically true BUT has a critical limitation: FTS5 uses external content mode (`content=''`) which means the index is separate from the content source. The problem is that the content lives in FILESYSTEM FILES, not in a database table.

The transaction can ensure that the notes table and notes_fts table are atomically updated, but it CANNOT ensure atomicity between the database transaction and filesystem file writes. This creates a fundamental TOCTOU (time-of-check-time-of-use) gap:

1. User edits file in `$EDITOR` (filesystem write happens outside transaction)
2. Editor exits, file is already written to disk
3. Code reads file content
4. Code updates database + FTS in transaction

Between steps 1-4, another process could:
- Modify the file again
- Delete the file
- Read stale content from the database

The architecture acknowledges file/database consistency issues in one place but doesn't provide a coherent solution that works across all commands.

**Assessment:**

This is a fundamental architectural tension, not a fatal flaw. The architecture should explicitly acknowledge this limitation and document a consistent strategy:

**Option A:** Accept eventual consistency - document that file changes may not be immediately reflected in search until next sync. This is pragmatic for a single-user CLI tool.

**Option B:** Implement file locking during edit operations (mentioned but rejected in technical.md). This would prevent concurrent edits but adds complexity.

The current design tries to have it both ways - claiming transactional atomicity while using external file storage. Pick one approach and document it clearly.

---

### Issue 2: Wiki Link Character Mismatch Creates Broken Links By Design

**Affected Files:** ["falcon_test/apps/app3/docs/design/components.md"]

**Relevant Text From Docs:**
```
**Known Limitation: Character Set Mismatch**

Note titles allow more characters than wiki link targets. Title validation allows: `^[^/\\:*?"<>|]{1,200}$` (anything except forbidden OS path characters), while link targets allow only: `^[A-Za-z0-9 _-]+$` (alphanumeric, spaces, hyphens, underscores).

**Impact:** A note titled "My Note (2024)" cannot be linked to with `[[My Note (2024)]]` since parentheses fail link validation.

**Workaround:** Users should use only alphanumeric characters, spaces, hyphens, and underscores in note titles if they intend to link to those notes.

**Rationale:** This restriction prevents path traversal and injection attacks via link targets, which is a higher priority than full character set support for linking.
```

**What's Missing/Wrong:**

This is not a limitation - it's a design flaw that will cause constant user frustration. The system allows users to create notes with titles containing parentheses, apostrophes, periods, etc. (common in real note titles like "John's Notes", "API v2.0", "Meeting (Q1 2024)"), but then silently breaks linking to those notes.

The security rationale is flawed: you can validate link targets to prevent path traversal WITHOUT restricting the character set to alphanumeric-only. The validation should:
1. Check that the link target matches an existing note title (database lookup)
2. Ensure the sanitized filename (already computed) doesn't contain path traversal
3. Use the title-to-filename mapping that already exists

The current design creates a system where:
- Users create notes with normal titles
- They try to link between notes
- Links silently fail validation and aren't created
- No error is shown (links are "logged as warnings, excluded from returned link list")
- Users discover their wiki isn't actually linked together

**Assessment:**

This is a fixable design flaw, not a fundamental impossibility. The architecture should either:
1. Restrict note titles to the same character set as links (breaking change but consistent)
2. Fix link validation to allow any characters that appear in note titles (better solution)
3. At minimum, reject note creation if the title contains characters that can't be linked (fail fast)

The current approach of allowing incompatible titles and silently breaking links will result in a poor user experience.

---

### Issue 3: Optimistic Concurrency Control Without Actual Conflict Detection

**Affected Files:** ["falcon_test/apps/app3/docs/design/technical.md"]

**Relevant Text From Docs:**
```
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
```

**What's Missing/Wrong:**

This conflict detection strategy has a fundamental flaw: the `$EDITOR` subprocess ALREADY WRITES THE FILE before the conflict check runs. The flow is:

1. Record original_mtime
2. Open $EDITOR (vim, nano, etc.)
3. User edits and saves IN THE EDITOR
4. Editor writes file to disk (mtime changes)
5. Editor exits
6. Code checks if mtime changed

The problem: step 4 happens BEFORE step 5. When the editor exits, the file is already written. The conflict check in step 6 is checking "did someone else modify the file while the editor was open", but it's too late - both edits have already happened.

The actual sequence with concurrent edits:
- Process A opens editor at t=0 (original_mtime = t=0)
- Process B opens editor at t=1 (original_mtime = t=0)
- Process B's editor saves at t=2 (file mtime = t=2)
- Process B's editor exits at t=3
- Process B's code checks: mtime(t=2) > original_mtime(t=0) = TRUE, warns but does nothing (file already written)
- Process A's editor saves at t=4 (file mtime = t=4, overwrites B's changes)
- Process A's editor exits at t=5
- Process A's code checks: mtime(t=4) > original_mtime(t=0) = TRUE, warns but does nothing (file already written)

Both processes show warnings, but Process A has silently destroyed Process B's work. The user of Process A sees "Warning: File was modified by another process" but their content is already saved - there's no opportunity to merge or recover.

**Assessment:**

This is broken as designed. The architecture should either:
1. Remove the conflict detection entirely and document "last-write-wins, no detection" (honest but risky)
2. Implement actual file locking (mentioned but rejected, would actually work)
3. Use a different editor integration strategy (create temp file, check original hasn't changed, atomic rename)
4. Document this as a known limitation: "Concurrent edits will result in data loss with no prevention mechanism"

The current approach gives false confidence - users think they have conflict detection, but it's security theater that doesn't prevent data loss.

---

### Issue 4: FTS5 Search Sanitization May Break Legitimate Queries

**Affected Files:** ["falcon_test/apps/app3/docs/systems/database/schema.md"]

**Relevant Text From Docs:**
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
```

**What's Missing/Wrong:**

The sanitization strategy strips asterisks and carets from user input, which will break legitimate searches:

- User searches for "TODO: fix bug" → asterisk stripped → "TODO fix bug" (different results)
- User searches for "x^2 + y^2 = r^2" → carets stripped → "x2 + y2 = r2" (won't find notes about math formulas)
- User searches for "footnote marker [*]" → asterisk stripped → "footnote marker []" (won't match)

The wrapping in double-quotes already makes these characters literal, so stripping them is unnecessary AND harmful. FTS5 treats everything inside double-quotes as a literal phrase - no operator interpretation.

The documentation says "no escape sequence exists for *" but that's misleading: double-quote wrapping IS the escape mechanism. You don't need a separate escape sequence.

**Assessment:**

This is a fixable bug in the sanitization strategy. The correct approach:

```python
# Escape internal quotes by doubling
safe_input = user_input.replace('"', '""')
# Wrap in quotes - this makes ALL special chars literal
safe_query = '"' + safe_input + '"'
# DO NOT strip * or ^ - they're literal inside quotes
```

Test this with: search for "C++ code with ** markdown **" - should work, not be stripped.

If prefix matching is desired (using *), that should be an explicit opt-in flag (`--prefix`), but stripping it from literal searches breaks valid queries.

---

### Issue 5: Database Permissions Check Happens After File Creation

**Affected Files:** ["falcon_test/apps/app3/docs/systems/database/schema.md"]

**Relevant Text From Docs:**
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
```

**What's Missing/Wrong:**

The code claims "no race window" but then does `os.chmod()` AFTER creation as "defense in depth". This is contradictory:

1. If umask(0o077) works correctly, the file is created with 0600 permissions - chmod is redundant
2. If umask doesn't work (some filesystems, some OSes), the chmod happens AFTER creation - there IS a race window

The real issue: `sqlite3.connect()` may do multiple filesystem operations (create file, write header, create journal files). The umask applies to the initial creation, but SQLite's internal operations might create temp files with different permissions.

Additionally, the chmod after creation has a TOCTOU gap:
- File created with umask (maybe 0600, maybe not depending on filesystem)
- Another process could access file here (race window)
- chmod applies 0600

**Assessment:**

This is a minor issue for a single-user local tool, but the documentation should be honest about limitations:

1. Umask approach is correct for initial file creation
2. Remove the chmod call OR acknowledge it's a race condition mitigation, not "defense in depth"
3. Document that SQLite creates auxiliary files (.db-journal, .db-wal) which may need separate permission handling
4. Document that on some filesystems (FAT32, SMB shares), Unix permissions don't apply - vault encryption at filesystem level is the real solution

The current design claims atomic security that doesn't exist on all platforms.

---

### Issue 6: Sync Command Destructive Rename Handling

**Affected Files:** ["falcon_test/apps/app3/docs/systems/database/schema.md"]

**Relevant Text From Docs:**
```
**Sync Command Behavior:**

The `sync` command does NOT implement rename detection in v1. When a file is renamed externally:
1. The old filename is treated as deleted (database record removed, backlinks become broken)
2. The new filename is treated as a new note (new database record created)
3. This is a documented limitation; users who need to preserve backlinks during rename should use the database title as the stable identifier and not rename files directly
```

**What's Missing/Wrong:**

This behavior will cause catastrophic data loss in a common scenario:

User workflow:
1. Create note "Project Ideas" (filename: project-ideas.md) with tags, backlinks from 10 other notes
2. Reorganize vault - rename file to "project-ideas-2024.md" for clarity
3. Run `sync` to update the database
4. Result:
   - Original note is DELETED from database (loses all tags, backlinks are now broken)
   - New note is created (starts with no tags, no backlinks to it)
   - All links FROM other notes TO this note are now broken
   - User has lost metadata

The documentation says "users should not rename files directly" but this is a CLI tool for developers who are used to working with files. The vault is explicitly designed to be "human-readable, versionable with git" - renaming files is a normal part of git workflows (git mv, refactoring branches, etc.).

The architecture prioritizes filename-based synchronization but then punishes users for manipulating filenames.

**Assessment:**

This needs one of:
1. **Content-based rename detection**: Hash note content, detect when same content appears under new filename (like git does)
2. **Metadata-based ID**: Store a UUID in the markdown file frontmatter, sync uses this as stable ID
3. **Explicit rename command**: Provide `notes-cli rename "old title" "new title"` that updates backlinks atomically
4. **Better documentation**: Prominently warn in init command output and README that renaming files breaks links

Option 3 is most feasible for v1. The current design makes a system that claims to be "standard markdown files, usable with any tool" but then breaks if you actually use standard tools to manipulate those files.

---

### Issue 7: Backup Command Will Silently Lose Data on Filename Collisions

**Affected Files:** ["falcon_test/apps/app3/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**
```
**Zip Archive Structure:**
- Flat directory with all `.md` files and `.notes.db` at root (no subdirectory nesting)
- Subdirectories within vault are NOT preserved (all files at root level)
- Hidden files (except `.notes.db`) are excluded
- Example contents: `note1.md`, `note2.md`, `.notes.db`

**Known Limitation:** Backup flattens subdirectories. When restoring from a backup, the original directory structure is lost. This is acceptable for v1 since the database tracks metadata, not filesystem structure.

**Warning:** If notes in different subdirectories have the same filename (e.g., `subdir1/readme.md` and `subdir2/readme.md`), the backup will overwrite one with the other. Users should ensure unique filenames across all subdirectories, or use the `sync` command to reindex after restore and manually recover any lost files from source control.
```

**What's Missing/Wrong:**

The backup command will SILENTLY lose data when filename collisions occur, with no warning to the user. The documented behavior is:

1. Scan vault, find `subdir1/readme.md` and `subdir2/readme.md`
2. Add first to zip as `readme.md`
3. Add second to zip as `readme.md` (overwrites first)
4. Report "Backed up 2 notes to backup.zip"
5. Zip actually contains only 1 note

The user has no indication that data was lost until they try to restore and discover notes are missing.

The warning says "users should ensure unique filenames" but the tool doesn't enforce this or even warn when it's violated. The suggestion to "use sync command to reindex after restore and manually recover from source control" assumes:
- User has source control (not guaranteed)
- User will notice files are missing (they won't)
- User can manually identify which file was lost (difficult if backups are old)

**Assessment:**

This is a data loss bug disguised as a "known limitation". The backup command should:

1. **Detect collisions BEFORE creating the backup**: Scan all files, build a map of basenames, error if duplicates found
2. **Preserve directory structure**: Include subdirectories in the zip (simple fix)
3. **Use a different naming scheme**: Flatten but use hash-based unique names (complex)
4. **At minimum**: Count files scanned vs files added to zip, error if they differ

The current design will cause silent data loss, which is unacceptable for a backup feature. Users will discover months later that their backups are incomplete.

---

### Issue 8: Editor Exit Code Handling is Underspecified

**Affected Files:** ["falcon_test/apps/app3/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**
```
**Editor exit handling:**
- Check editor exit code: non-zero = user cancelled or error
- Compare file mtime before/after: unchanged = no save occurred
- **Cancellation detection**: Operation is cancelled if exit_code != 0 OR mtime unchanged (boolean OR logic)
- If cancelled: delete the created file, do not insert into database
- Empty file after edit: warn user but allow (some users may want empty notes)
```

**What's Missing/Wrong:**

The logic `exit_code != 0 OR mtime unchanged` will cause false cancellations. Consider these scenarios:

**Scenario 1: User saves and exits with :wq in vim**
- exit_code = 0 (success)
- mtime changed (file was written)
- Result: NOT cancelled ✓ (correct)

**Scenario 2: User exits without saving (:q in vim)**
- exit_code = 0 (success - vim exits cleanly when no changes)
- mtime unchanged (no write occurred)
- Result: cancelled ✓ (correct)

**Scenario 3: Vim crashes or user kills terminal**
- exit_code = non-zero (SIGTERM, SIGKILL, etc.)
- mtime changed (vim may have written buffer before crash)
- Result: cancelled ✗ (WRONG - user's edit is lost!)

**Scenario 4: User makes a change and then undoes it (write+undo+:wq in vim)**
- exit_code = 0 (success)
- mtime unchanged (some editors don't update mtime if content identical to original)
- Result: cancelled ✗ (WRONG - user explicitly saved!)

The OR logic is too aggressive. A non-zero exit code should only cancel if the file wasn't written. The correct logic:

```python
if exit_code != 0 and mtime unchanged:
    # Editor failed/crashed AND didn't write anything
    cancel = True
elif exit_code == 0 and mtime unchanged:
    # User exited cleanly without saving
    cancel = True
else:
    # File was written, accept it even if exit_code non-zero
    # (editor may have written buffer then crashed)
    cancel = False
```

**Assessment:**

This is a logic error that will cause user frustration. The boolean OR should be AND with proper case handling. Additionally, mtime-based detection is fragile (filesystem latency, identical content, etc.). A better approach:
1. Read file content before and after
2. Compare content hashes
3. Only cancel if content unchanged AND exit_code suggests cancellation

---

## Summary

The architecture is mostly sound but has several issues that will cause real user pain:

**Critical (blocking):**
- Issue 2: Wiki link character mismatch will break linking in normal usage
- Issue 7: Backup command silently loses data on filename collisions
- Issue 3: Optimistic concurrency doesn't actually detect conflicts

**Significant (should fix):**
- Issue 6: Sync destroys metadata on file rename
- Issue 4: Search sanitization breaks legitimate queries
- Issue 8: Editor exit handling logic errors

**Architectural (needs clarity):**
- Issue 1: FTS/filesystem transaction boundaries need honest documentation
- Issue 5: Database permissions approach has platform limitations

The system is implementable, but these issues should be resolved before shipping to avoid creating a tool that silently loses user data or breaks in common workflows.
