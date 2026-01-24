# Fixes Applied to app5/docs/systems/database/schema.md

## Changes Made

### Issue ID 10: Concurrent Edit Protection Missing from Critical Operations
**What Changed**: Added explicit requirement for optimistic locking in the merge command's "Atomic Operations" section. The spec already detailed optimistic locking for edit operations but failed to specify it for merge operations, which also modify contacts and are vulnerable to concurrent access issues.

**Content Added/Modified**:
```markdown
**Concurrent Safety:** The merge command MUST use optimistic locking when updating the target contact (step 1). Before updating, verify the target contact's `updated_at` value has not changed since it was read. If changed, fail with conflict error (exit code 5) to prevent silent data loss in concurrent scenarios.

Implementation pattern:
```python
with get_connection(db_path) as conn:
    try:
        # Step 1: Update target contact with optimistic locking
        update_contact_safe(conn, target_id, updates, expected_updated_at)
        # Step 2: Transfer group memberships
        # Step 3: Delete source contact
        conn.commit()
    except Exception:
        conn.rollback()
        raise
```
```

---

## Summary
- Issues fixed: 1
- Sections added: 0
- Sections modified: 1 (Atomic Operations - Merge Command)

## Details
The fix adds a "Concurrent Safety" clause to the existing "Atomic Operations (Merge Command)" section, explicitly requiring optimistic locking for the target contact update. This brings merge operations into consistency with edit operations, which already specify optimistic locking. The implementation pattern was updated to show the use of `update_contact_safe()` (the function already defined earlier in the document for optimistic locking) rather than a generic comment.
