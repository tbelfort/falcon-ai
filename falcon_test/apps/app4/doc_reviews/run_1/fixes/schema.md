# Fixes Applied to app4/docs/systems/database/schema.md

## Changes Made

### Issue ID 10: Database Connection Error Handling Unspecified
**What Changed**: Added comprehensive database connection error handling specification to the Connection Management section, including exception mapping and error handling for all connection failure modes.

**Content Added/Modified**:
```python
@contextmanager
def get_connection(db_path: str) -> Generator[sqlite3.Connection, None, None]:
    """Context manager for database connections.

    CRITICAL: Sets busy_timeout to handle concurrent access gracefully.

    Raises:
        DatabaseError: On connection failure, PRAGMA failure, or database corruption
    """
    conn = None
    try:
        conn = sqlite3.connect(db_path)
    except sqlite3.OperationalError as e:
        # Connection failures: file not found, permission denied, not a database
        if "unable to open database" in str(e):
            raise DatabaseError(f"Cannot open database '{os.path.basename(db_path)}': File not found.") from e
        elif "readonly database" in str(e):
            raise DatabaseError(f"Cannot write to '{os.path.basename(db_path)}': Permission denied.") from e
        elif "disk I/O error" in str(e) or "database disk image is malformed" in str(e):
            raise DatabaseError(f"Database '{os.path.basename(db_path)}' is corrupted. Restore from backup or recreate with --force.") from e
        else:
            raise DatabaseError(f"Cannot connect to database: {e}") from e
    except Exception as e:
        raise DatabaseError(f"Database connection failed: {e}") from e

    try:
        conn.row_factory = sqlite3.Row  # Enable column access by name
        conn.execute("PRAGMA foreign_keys = ON")  # Enable FK constraints
        conn.execute("PRAGMA busy_timeout = 5000")  # Wait up to 5 seconds for lock
    except sqlite3.OperationalError as e:
        conn.close()
        raise DatabaseError(f"Database initialization failed: {e}") from e

    try:
        yield conn
        conn.commit()
    except sqlite3.OperationalError as e:
        conn.rollback()
        # SQLITE_BUSY after timeout exhausted
        if "database is locked" in str(e):
            raise DatabaseError("Database is locked by another process. Try again in a moment.") from e
        else:
            raise DatabaseError(f"Database operation failed: {e}") from e
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

**Exception Mapping Table Added:**

| SQLite Error | Condition | Exception Type | User Message |
|--------------|-----------|----------------|--------------|
| `sqlite3.OperationalError` "unable to open database" | File not found, invalid path | `DatabaseError` | Cannot open database '{filename}': File not found. |
| `sqlite3.OperationalError` "readonly database" | Permission denied on write | `DatabaseError` | Cannot write to '{filename}': Permission denied. |
| `sqlite3.OperationalError` "database disk image is malformed" | Database corruption | `DatabaseError` | Database '{filename}' is corrupted. Restore from backup or recreate with --force. |
| `sqlite3.OperationalError` "disk I/O error" | Disk failure, filesystem corruption | `DatabaseError` | Database '{filename}' is corrupted. Restore from backup or recreate with --force. |
| `sqlite3.OperationalError` "database is locked" | SQLITE_BUSY after timeout | `DatabaseError` | Database is locked by another process. Try again in a moment. |
| PRAGMA execution failure | Invalid database state | `DatabaseError` | Database initialization failed: {error} |
| Other connection failures | Unknown error | `DatabaseError` | Cannot connect to database: {error} |

**Additional Notes Added:**
- CRITICAL - Filename Privacy: All error messages MUST use `os.path.basename(db_path)` instead of full path to prevent exposing user directory structure
- CRITICAL - NULL due_date Handling: Tasks with NULL due_date are NOT considered overdue

---

### Issue ID 18: Overdue Task Filter Logic Ambiguous
**What Changed**: Added comprehensive "Overdue Task Filter Specification" section and updated all overdue-related queries to use consistent logic with explicit NULL handling.

**Content Added/Modified**:

**New Section: Overdue Task Filter Specification**
```
## Overdue Task Filter Specification

**CRITICAL - Consistent Overdue Logic:**

Overdue tasks are defined as tasks that meet ALL of the following criteria:
1. `due_date IS NOT NULL` - Tasks without due dates are never overdue
2. `due_date < today` - Due date is in the past (NOT including today)
3. `status NOT IN ('completed', 'archived')` - Includes both 'pending' and 'in_progress' tasks

**Rationale:**
- Tasks due TODAY are not overdue (they're on time)
- Tasks with NULL due_date have no deadline and cannot be "late"
- Both pending and in_progress tasks can be overdue
- Completed and archived tasks are excluded from overdue counts

This specification applies to:
- `list --overdue` command (interface.md line 783)
- `due overdue` command filter
- `report` command overdue count (interface.md line 854)
- All statistics queries involving overdue tasks
```

**Updated Search Tasks Query:**
```python
if overdue:
    query += " AND due_date IS NOT NULL AND due_date < ? AND status NOT IN ('completed', 'archived')"
    params.append(today)
```

**Updated Tasks Due in Range Query:**
```sql
SELECT id, title, description, status, priority, due_date, project_id, created_at, updated_at, completed_at
FROM tasks
WHERE due_date IS NOT NULL AND due_date >= ? AND due_date <= ? AND status NOT IN ('completed', 'archived')
ORDER BY due_date ASC, CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END;
```

**Updated Statistics Query:**
```sql
-- Currently overdue (exclude archived, exclude NULL due_date)
SELECT COUNT(*) FROM tasks WHERE due_date IS NOT NULL AND due_date < ? AND status NOT IN ('completed', 'archived');
```

**Key Resolution:**
- Resolved inconsistency between `status != 'completed'` (line 783) and `status NOT IN ('completed', 'archived')` (line 854) by standardizing on `status NOT IN ('completed', 'archived')`
- Added explicit NULL handling to all due date queries
- Clarified that both 'pending' and 'in_progress' tasks can be overdue
- Added cross-references to interface.md to ensure consistency

---

## Summary
- Issues fixed: 2
- Sections added: 2 (Exception Mapping table, Overdue Task Filter Specification)
- Sections modified: 3 (Connection Management code, Search Tasks query, Statistics queries)
- Lines changed: ~80 lines added/modified

**Impact:**
- Issue 10: Implementers now have clear specifications for handling all database connection failure modes with user-friendly error messages
- Issue 18: All overdue task filtering logic is now consistently specified with explicit NULL handling and clear status filtering rules
