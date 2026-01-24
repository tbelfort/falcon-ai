# Architecture Feasibility Scout Report

## Assessment: ISSUES_FOUND

The architecture has several technical feasibility issues including potential race conditions in file creation, inconsistent timestamp handling, unclear concurrent edit detection implementation, and incomplete path validation that could lead to security vulnerabilities.

## Issues

### Issue 1: File Creation Race Condition in init --force

**Affected Files:** ["app4/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**
```
**Atomic Overwrite with --force (CRITICAL):**
When `--force` is set and file exists, the overwrite MUST be atomic to prevent TOCTOU race conditions:
1. Generate a unique temporary filename in the same directory (e.g., `.tasks.db.tmp.{random}`)
2. Create the new database at the temporary path using `O_CREAT | O_EXCL | O_NOFOLLOW | 0o600`
3. Execute schema creation on the temporary file
4. Use `os.rename()` to atomically replace the original file
5. `os.rename()` is atomic on POSIX systems when source and destination are on the same filesystem

def init_database_force(path: str) -> None:
    """Atomically recreate database with --force."""
    dir_path = os.path.dirname(os.path.abspath(path))
    # Create temp file in same directory (required for atomic rename)
    fd, temp_path = tempfile.mkstemp(dir=dir_path, prefix='.tmp_', suffix='.db')
    try:
        os.close(fd)
        # Initialize the temp database
        _init_schema(temp_path)
        # Atomic replace
        os.rename(temp_path, path)
    except Exception:
        # Clean up temp file on failure
        # Note: Use Exception, not bare except, to not catch KeyboardInterrupt/SystemExit
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise
```

**What's Missing/Wrong:**
The implementation closes the file descriptor from `tempfile.mkstemp()` immediately, then calls `_init_schema(temp_path)`. This creates a TOCTOU vulnerability between `os.close(fd)` and when `_init_schema()` opens the file. An attacker could replace the temp file with a symlink during this window, redirecting the database write to an unauthorized location. The schema.md file demonstrates the correct pattern (lines 31-60) of keeping the fd open during sqlite connection, but this code contradicts that guidance.

**Assessment:**
This is a security flaw that undermines the TOCTOU protection. The implementation needs to either keep the fd open during schema initialization or use `O_NOFOLLOW` when opening the file in `_init_schema()`.

---

### Issue 2: Timestamp Format Inconsistency

**Affected Files:** ["app4/docs/systems/database/schema.md"]

**Relevant Text From Docs:**
```
**Timestamp Format**

All timestamps use ISO 8601 format:
- **Timestamps:** `YYYY-MM-DDTHH:MM:SS.ffffff` with UTC timezone (for created_at/updated_at)
  - Both `Z` suffix and `+00:00` suffix are acceptable UTC representations
  - Example: `2026-01-21T15:30:45.123456Z` or `2026-01-21T15:30:45.123456+00:00`
- **Dates:** `YYYY-MM-DD` (date only, for due_date)

**Timestamp Format Consistency:**
Both 'Z' suffix and '+00:00' suffix are valid for UTC timestamps. Implementations SHOULD output '+00:00' for consistency but MUST accept both on read.

```python
from datetime import datetime, timezone
timestamp = datetime.now(timezone.utc).isoformat()  # 2026-01-21T15:30:45.123456+00:00
# Note: Python's isoformat() produces +00:00 format; both this and Z suffix are valid
date_only = datetime.now().strftime("%Y-%m-%d")     # 2026-01-21
```
```

**What's Missing/Wrong:**
The documentation says implementations "SHOULD output '+00:00' for consistency but MUST accept both on read," but there's no specification for how to parse and normalize timestamps on read. SQLite stores timestamps as TEXT, and string comparisons (used in the statistics queries at lines 423-445) will fail if timestamps mix 'Z' and '+00:00' formats. The code example shows Python's `isoformat()` produces '+00:00', but there's no guarantee all future code paths will use this method consistently, and there's no parsing/normalization function specified.

**Assessment:**
This could lead to subtle bugs where timestamp comparisons fail or statistics queries return incorrect results. The system needs a centralized timestamp parsing function that normalizes both formats before storage, or the "MUST accept both on read" requirement should be dropped in favor of strict format enforcement.

---

### Issue 3: Concurrent Edit Detection Implementation Gap

**Affected Files:** ["app4/docs/design/technical.md"]

**Relevant Text From Docs:**
```
**Example:**
```python
from datetime import datetime, timezone
from task_cli.exceptions import ValidationError, NotFoundError
from task_cli.database import find_task_by_id

def update_task(conn, task_id: int, changes: dict, original_updated_at: str) -> None:
    """Update task with optimistic locking.

    Args:
        conn: Database connection
        task_id: Task to update
        changes: Fields to update
        original_updated_at: Timestamp when task was read

    Raises:
        ValidationError: If task was modified concurrently
    """
    new_updated_at = datetime.now(timezone.utc).isoformat()

    cursor = conn.execute("""
        UPDATE tasks
        SET title = ?, description = ?, updated_at = ?
        WHERE id = ? AND updated_at = ?
    """, (changes['title'], changes['description'], new_updated_at,
          task_id, original_updated_at))

    if cursor.rowcount == 0:
        # Either task doesn't exist or was modified
        task = find_task_by_id(conn, task_id)
        if task is None:
            raise NotFoundError(f"Task {task_id} not found")
        else:
            raise ValidationError(f"Task {task_id} was modified by another process. Retry the operation.")
```
```

**What's Missing/Wrong:**
The `edit` command requires the `original_updated_at` timestamp for optimistic locking, but the CLI interface specification (interface.md) doesn't document how this timestamp is obtained or passed through the command. The CLI layer would need to read the task first (to get current `updated_at`), present it to the user somehow, then pass it to the update function. But there's no specification for how the user provides this timestamp back. The example assumes a programmatic API where the caller holds the timestamp between read and write, but the CLI is interactive - the user could edit a task hours after viewing it.

**Assessment:**
This is a design gap rather than a fundamental flaw. The optimistic locking mechanism can work, but it needs clarification: either (1) the CLI reads the task immediately before update (no user input between read/write), making the window very small, or (2) the edit command accepts an optional `--expect-updated-at` parameter for scripting use cases. Without this clarification, implementers won't know how to correctly implement the feature.

---

### Issue 4: Path Validation Missing URL-Decoded Check on Initial Input

**Affected Files:** ["app4/docs/systems/architecture/ARCHITECTURE-simple.md"]

**Relevant Text From Docs:**
```
def validate_path(path: str, allowed_base: str | None = None) -> str:
    """Validate path is safe and within allowed directory.

    Args:
        path: User-provided path (relative or absolute)
        allowed_base: Base directory path must be within.
                      Defaults to current working directory.

    Returns: Resolved absolute path
    Raises: ValidationError if path escapes allowed directory

    CRITICAL: This function prevents path traversal but NOT symlink TOCTOU.
    For write operations, caller MUST use safe_create_file() with O_NOFOLLOW.
    """
    if allowed_base is None:
        allowed_base = os.getcwd()

    # STEP 1: Check for ".." BEFORE resolving (prevents traversal)
    if ".." in path:
        raise ValidationError(f"Path '{os.path.basename(path)}' cannot contain '..'")

    # Also check URL-encoded variants
    decoded = urllib.parse.unquote(path)
    if ".." in decoded:
        raise ValidationError(f"Path '{os.path.basename(path)}' cannot contain encoded '..'")

    # STEP 2: Resolve to absolute, following symlinks
    resolved = os.path.realpath(os.path.join(allowed_base, path))
    base_resolved = os.path.realpath(allowed_base)

    # STEP 3: Check path is within allowed directory
    if not resolved.startswith(base_resolved + os.sep) and resolved != base_resolved:
        raise ValidationError(f"Path '{os.path.basename(path)}' is outside allowed directory")

    return resolved
```

**What's Missing/Wrong:**
The validation checks for ".." in the original path, then checks ".." in the URL-decoded version. However, if the original input is `%2e%2e` (fully URL-encoded), the first check passes and only the second check catches it. But the code continues to use the *original* path variable (not the decoded version) for `os.path.join(allowed_base, path)` at line in STEP 2. This means if someone passes `%2e%2e/etc/passwd`, the URL-decode check would fail and raise an error (good), but if there are other URL-encoded characters that aren't ".." (like `%2Fetc%2Fpasswd`), they wouldn't be caught by the ".." checks and would be passed to `os.path.join` in encoded form.

**Assessment:**
Minor security issue. The validation should either (1) use the decoded path for all subsequent operations, or (2) reject any path containing URL-encoding characters entirely (% followed by hex digits). The current approach is inconsistent - it decodes to check for ".." but doesn't decode for the actual path operations. However, `os.path.realpath()` and the final boundary check (STEP 3) should catch most attacks, so this is defense-in-depth issue rather than a critical vulnerability.

---

### Issue 5: Batch Operation Exit Code Logic Ambiguity

**Affected Files:** ["app4/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**
```
### Batch Operation Error Handling

When multiple task IDs are provided:
1. **Invalid ID format** (non-numeric, negative, zero): Report validation error, continue to next ID
   - Message: `Error: Invalid task ID '{value}' - must be positive integer`
2. **Task not found**: Report not found error, continue to next ID
   - Message: `Error: Task {id} not found`
3. **Exit code logic:**
   - Exit 0: At least one task was successfully processed
   - Exit 1: All IDs had validation errors (none were valid format)
   - Exit 3: All valid IDs were not found (none existed)
   - Exit 2: Database error during processing

Example: `done 1 abc -5 999`
- ID 1: processed successfully
- ID abc: validation error (not numeric)
- ID -5: validation error (not positive)
- ID 999: not found error
- Result: Exit 0 (one success), with error messages for failures
```

**What's Missing/Wrong:**
The exit code logic creates ambiguity when there's a mix of validation errors and not-found errors with zero successes. Example: `done abc 999` where "abc" is invalid format (validation error) and "999" doesn't exist (not found). According to the rules: exit 1 applies if "All IDs had validation errors (none were valid format)" - but 999 IS valid format, it just doesn't exist. So we can't use exit 1. Exit 3 applies if "All valid IDs were not found" - this is true (the one valid ID, 999, was not found). But what's the priority? The doc doesn't specify which rule takes precedence when multiple conditions are true.

**Assessment:**
This is an implementation detail that needs clarification to ensure consistent behavior. Suggested priority: database errors (exit 2) > at least one success (exit 0) > all valid IDs not found (exit 3) > all IDs invalid format (exit 1). But without explicit ordering, different implementations could behave differently.

---

### Issue 6: Missing Database Busy Timeout Handling in Batch Operations

**Affected Files:** ["app4/docs/systems/cli/interface.md", "app4/docs/systems/database/schema.md"]

**Relevant Text From Docs:**

From interface.md:
```
**Implementation Requirement:**
- All batch operations MUST start with: `conn.execute("BEGIN IMMEDIATE TRANSACTION")`
- `BEGIN IMMEDIATE` acquires an exclusive write lock at the START of the transaction
- This prevents concurrent batch operations from interfering with each other
- Without IMMEDIATE, SQLite uses deferred locking (waits until first write), creating race condition window
- If lock cannot be acquired within busy_timeout (5 seconds), fail with database error (exit 2)
```

From schema.md:
```
**Busy Timeout (CRITICAL):**
The `busy_timeout` PRAGMA MUST be set to 5000 milliseconds (5 seconds) on every connection. This allows the CLI to wait for locks to be released instead of immediately failing with `SQLITE_BUSY`. Without this setting, concurrent CLI invocations will fail unpredictably under contention.
```

**What's Missing/Wrong:**
The documentation states that `BEGIN IMMEDIATE` will wait for the busy_timeout period, then "fail with database error (exit 2)". However, the standard `conn.execute("BEGIN IMMEDIATE")` call will raise `sqlite3.OperationalError` with "database is locked" if it can't acquire the lock within the timeout. The docs don't specify whether this exception should be caught and converted to a user-friendly DatabaseError, or allowed to bubble up as an internal exception (violating Rule 2 from errors.md which says never expose internal exception types). The error handling specification in errors.md only shows catching `sqlite3.IntegrityError` but not `sqlite3.OperationalError`.

**Assessment:**
This is a documentation completeness issue. The system will technically work - SQLite will enforce the timeout and raise an exception. But implementers need explicit guidance on catching `sqlite3.OperationalError` (or more broadly, all sqlite3 exceptions) and converting to user-friendly DatabaseError with appropriate messaging. Without this, users might see raw SQLite errors violating the "Never Expose Internals" rule.

---

### Issue 7: CSV Injection Escaping Incomplete for Newlines

**Affected Files:** ["app4/docs/design/technical.md"]

**Relevant Text From Docs:**
```
**CSV Injection Prevention (CRITICAL):**
To prevent formula injection attacks when CSV files are opened in spreadsheet applications, the following characters MUST be escaped if they appear at the start of any field:
- `=` (equals)
- `+` (plus)
- `-` (minus/hyphen)
- `@` (at sign)
- `\t` (tab)
- `\r` (carriage return)
- `\n` (newline)

**Escaping Rule:**
If a field value starts with any of these characters, prefix the field with a single quote (`'`) character before CSV encoding.

**Example:**
```python
def escape_csv_field(value: str | None) -> str:
    """Escape CSV field to prevent formula injection."""
    if value is None:
        return ""
    if value and value[0] in ('=', '+', '-', '@', '\t', '\r', '\n'):
        return "'" + value
    return value
```
```

**What's Missing/Wrong:**
The CSV escaping function only checks `value[0]` (the first character). But task descriptions can contain multi-line text with newlines in the middle. If a description is "Normal text\n=malicious formula", the newline is not at the start, so it won't be escaped. When this field is written to CSV and opened in Excel, the CSV library will properly quote the field (because it contains a newline), resulting in something like `"Normal text\n=malicious formula"`. Excel will render this as multiple lines within the cell, with "=malicious formula" on the second line. While Excel won't execute this as a formula (because the field starts with "Normal text"), the protection is inconsistent - the docs say newlines at the *start* are dangerous, but newlines in the middle aren't handled.

**Assessment:**
This is likely a documentation error rather than a security flaw. The real threat is field values that start with dangerous characters being interpreted as formulas. Newlines in the middle of fields are safe because they're properly CSV-encoded. The documentation should clarify that only *leading* characters are dangerous, or remove `\t`, `\r`, `\n` from the list entirely since they're not actually formula injection vectors (the main threats are `=`, `+`, `-`, `@`).

---

### Issue 8: Subtask Completion Propagation Missing Transaction Isolation Level

**Affected Files:** ["app4/docs/design/technical.md"]

**Relevant Text From Docs:**
```
**Behavior:**
```bash
# Force-completes parent and all subtasks
$ task-cli done 1 --force
Completed: 1 (and 3 subtasks)
```

**Implementation:**
- Check for incomplete subtasks BEFORE marking parent as done
- With `--force`: mark all incomplete subtasks as completed first, then parent
- Set `completed_at` timestamp for all completed tasks
- This operation MUST be atomic (all or nothing)
```

**What's Missing/Wrong:**
The documentation says the operation "MUST be atomic (all or nothing)" but doesn't specify the transaction isolation level. With SQLite's default isolation (serializable), there's still a potential race condition: Process A checks for incomplete subtasks, finds some, begins marking them complete. Process B (concurrent `edit` command) changes one of the subtasks back to 'pending' status after Process A's check but before Process A's commit. Process A commits, believing it completed all subtasks, but one is now pending again. The parent is marked complete with an incomplete subtask. The `BEGIN IMMEDIATE` lock pattern described for batch operations (interface.md lines 423-432) should be applied here but isn't mentioned.

**Assessment:**
This is a concurrency safety issue, though mitigated by the fact that the window is small and the documented use case is single-user. However, the documentation explicitly supports concurrent CLI invocations (technical.md lines 266-274), so this race condition could occur. The fix is to use `BEGIN IMMEDIATE TRANSACTION` as specified for other batch operations, but this connection isn't made in the subtask documentation.

---

## Summary

The architecture is fundamentally sound but has several implementation-level issues that need addressing:

1. **Security Issues**: File creation TOCTOU vulnerability (Issue 1), path validation inconsistency (Issue 4)
2. **Data Integrity Issues**: Timestamp format inconsistency (Issue 2), subtask completion race condition (Issue 8)
3. **Design Gaps**: Concurrent edit detection missing CLI integration (Issue 3), error handling coverage gaps (Issue 6)
4. **Documentation Issues**: Batch operation exit code ambiguity (Issue 5), CSV escaping over-specification (Issue 7)

None of these are architecture showstoppers - they're all solvable with clarification or minor design adjustments. The biggest risk is Issue 1 (TOCTOU in init --force) which directly contradicts security guidance elsewhere in the documentation.
