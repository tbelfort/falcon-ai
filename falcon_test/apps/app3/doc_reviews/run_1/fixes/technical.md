# Fixes Applied to technical.md

## Changes Made

### Issue ID 6: Optimistic Concurrency Control Without Actual Conflict Detection
**What Changed**: Replaced the flawed mtime-check-after-edit approach with a temp-file-then-atomic-rename strategy that actually prevents data loss from concurrent edits.

**Content Added/Modified**:
```
### Concurrent Edit Protection

**v1 Implementation: Temp-File-Then-Atomic-Rename Strategy**

The `cmd_edit()` function MUST use a temp-file-then-atomic-rename strategy to provide actual conflict detection:

1. Copy original file to temp location
2. Open temp file in editor
3. After editor exits, check if original file changed (using content hash)
4. If changed: conflict detected, reject save
5. If unchanged: atomically rename temp over original

The implementation:
- Records original file mtime AND content hash before copying
- User edits a temporary copy (original file unchanged during edit)
- After editor exits, checks if original file was modified by comparing hash
- If modified: raises ConflictError, temp file deleted, user's changes not saved
- If unchanged: atomically renames temp file over original
- Validates content (binary check, length check) before committing
- Updates database after successful file save

This prevents the data loss scenario where two concurrent editors both overwrite
the file because they're both editing the same file directly.
```

**Rationale**: The original approach had a fundamental flaw - it checked mtime AFTER the editor already wrote to the file. This meant both concurrent editors would detect a "conflict" but both would have already saved their changes, with the last one silently destroying the other's work. The temp-file approach prevents this by:
1. Keeping the original file unmodified during the edit
2. Detecting conflicts based on content hash (not just mtime)
3. Rejecting the save entirely if a conflict is detected, rather than overwriting

---

### Issue ID 14: Transaction Rollback and File Operations Inconsistency
**What Changed**: Added new Architecture Decision (AD10) specifying a file-first strategy with compensating actions to handle the fundamental tension between rollbackable database transactions and non-rollbackable filesystem operations.

**Content Added/Modified**:
```
### AD10: Transaction Rollback and Filesystem Operations Strategy

**Strategy: File-First, Then Database (with Compensating Actions)**

All commands that modify both filesystem and database MUST follow this order:

1. Validate inputs (fail fast before any changes)
2. Perform filesystem operation (create/update/delete file)
3. Perform database operation (within transaction)
4. On database failure: Compensating filesystem action (undo step 2)

**Rationale:**
- Filesystem operations are the source of truth (files survive DB corruption)
- Database is an index/cache of filesystem state
- `cmd_sync()` can always rebuild database from filesystem
- Better to have "file exists but not indexed" than "indexed but file missing"

Includes complete implementation examples for:
- cmd_new(): Create file first, then DB insert. On DB failure, delete orphaned file.
- cmd_delete(): Delete file first, then DB cleanup. On DB failure, file is already gone (CRITICAL).
- cmd_rename(): Rename file first, then DB update. On DB failure, rename back.

**Critical Scenarios table documents:**
- File create succeeds, DB fails → Compensating action deletes file
- File delete succeeds, DB fails → CRITICAL: File lost permanently
- File rename succeeds, DB fails → Compensating action renames back
- Compensating actions can themselves fail → User must run sync
```

**Rationale**: The spec had no strategy for handling failures when database operations succeed but file operations fail, or vice versa. This would lead to:
- Inconsistent implementations across different commands
- Silent data loss scenarios
- No guidance for developers on error handling

The file-first strategy was chosen because:
1. Files are the source of truth (users can read them without the app)
2. Database can be rebuilt from files via `cmd_sync()`
3. Orphaned files (exist but not indexed) are better than phantom entries (indexed but missing)

The spec now includes:
- Clear ordering for all operations
- Compensating actions for each failure scenario
- Critical scenario table documenting outcomes
- Known limitations (especially for delete operations)
- Recovery guidance (run sync after errors)

Also updated AD7's "Concurrent Edit Handling" section to reference the new temp-file strategy instead of the old "last-write-wins" approach.

---

## Summary
- Issues fixed: 2
- Sections added: 1 (AD10)
- Sections modified: 2 (Concurrent Edit Protection, AD7)
- Code examples added: 4 (temp-file edit implementation, cmd_new with compensating action, cmd_delete with compensating action, cmd_rename with compensating action)
- Total new content: ~150 lines of specification and implementation guidance

Both blocking issues are now resolved with concrete, implementable specifications that prevent data loss and provide clear error handling strategies.
