# Fixes Applied to schema.md

## Changes Made

### Issue ID 5: Sync Command Behavior Underspecified
**What Changed**: Added comprehensive specification for sync command behavior including title/filename reconstruction, update detection, transaction boundaries, partial failure handling, link re-parsing, and concurrent modification handling.

**Content Added/Modified**:
```markdown
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
[Full implementation provided with code example]

**Transaction Boundaries:**

All sync operations for a single note MUST be within a single transaction:
[Full implementation provided with code example]

**Partial Failure Handling:**

The `sync` command processes each file individually with separate transactions. If syncing one file fails, other files still sync successfully:
[Full implementation provided with code example]

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
```

**Location**: Replaced the "Sync Command Behavior" section (originally lines 225-231) with comprehensive specification

---

### Issue ID 11: Sync Command Destructive Rename Handling
**What Changed**: Added new section "Rename Command (Required for Metadata Preservation)" specifying a dedicated rename command to preserve metadata and backlinks. Documented the destructive behavior of external file renames and provided user workflow guidance plus future enhancement path for rename detection.

**Content Added/Modified**:
```markdown
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
[Full implementation approach provided with code example]

This would require:
1. Store SHA-256 content hash in `notes` table
2. Update hash on every sync
3. Enable with `notes-cli sync --detect-renames` flag
4. Perform rename operation instead of delete+create

**Priority:** High (prevents data loss in git workflows)
```

**Location**: Added new section before "Timestamp Format" section (inserted before original line 232)

---

## Summary
- **Issues fixed**: 2
- **Sections added**: 1 (new "Rename Command" section)
- **Sections modified**: 1 (expanded "Sync Command Behavior" section)

## Key Improvements

1. **Title/Filename Reconstruction**: Resolved the circular dependency by specifying that the database (`title` + `filename` columns) is the source of truth, and sync uses filename matching first before extracting title from file content for new notes.

2. **Update Detection**: Specified mtime-based detection with 1-second tolerance for comparing filesystem modification times against database `updated_at` timestamps.

3. **Transaction Boundaries**: Each file sync operation is isolated in its own transaction for fault tolerance, with detailed pseudocode for atomic operations.

4. **Partial Failure Handling**: Files are processed independently so one failure doesn't block others, with error reporting in sync summary.

5. **Link Re-parsing**: Explicitly specified that links are deleted and re-parsed during updates to keep the link graph accurate.

6. **Concurrent Modification**: Documented as explicitly unsupported with clear user workflow guidance (single-user assumption).

7. **Rename Command**: Added complete specification for a dedicated rename command that preserves metadata and updates backlinks atomically.

8. **Destructive Rename Behavior**: Documented the data loss issue when files are renamed externally, with comparison table and required user workflow.

9. **Future Path**: Provided detailed design for rename detection in v2 using content hashing.

Both blocking issues are now resolved with complete specifications that enable implementation.
