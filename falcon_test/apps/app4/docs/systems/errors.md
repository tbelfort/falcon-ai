# Error Handling: Task Manager CLI

**Status:** [DRAFT]

---

## Exit Codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | SUCCESS | Operation completed successfully |
| 1 | GENERAL_ERROR | Invalid arguments, validation failure, general errors |
| 2 | DATABASE_ERROR | Database connection failed, query failed, file issues |
| 3 | NOT_FOUND | Requested item does not exist |
| 4 | DUPLICATE | Item with this identifier already exists |

---

## Exception Hierarchy

```python
class TaskError(Exception):
    """Base exception for all task CLI errors."""
    exit_code: int = 1

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class ValidationError(TaskError):
    """Invalid input data.

    Examples:
    - Empty title
    - Invalid priority value
    - Invalid date format
    - Path with traversal
    - Assigning task to archived project
    """
    exit_code = 1


class DatabaseError(TaskError):
    """Database operation failed.

    Examples:
    - Cannot connect to database
    - Query execution failed
    - Cannot create database file
    - Constraint violation (generic)
    """
    exit_code = 2


class NotFoundError(TaskError):
    """Requested item does not exist.

    Examples:
    - Task ID not found
    - Project name not found
    - Label not found
    """
    exit_code = 3


class DuplicateError(TaskError):
    """Item with this identifier already exists.

    Examples:
    - Project name already exists
    - Label name already exists
    """
    exit_code = 4
```

---

## Error Message Templates

### Validation Errors (Exit 1)

```
Error: Title cannot be empty.
Error: Title must be 500 characters or fewer. Got: 750
Error: Invalid priority 'urgent'. Must be one of: high, medium, low.
Error: Invalid status 'done'. Must be one of: pending, in_progress, completed, archived.
Error: Invalid date format '01/25/2026'. Use YYYY-MM-DD.
Error: Invalid date '2026-02-30'. Not a valid calendar date.
Error: Project name cannot be empty.
Error: Project name must be 100 characters or fewer. Got: 150
Error: Label name cannot be empty.
Error: Label name must be 50 characters or fewer. Got: 75
Error: Path cannot contain '..'.
Error: At least one change required (--title, --description, --priority, --due, --project, or --status).
Error: File '{filename}' already exists. Use --force to overwrite.
Error: Database already exists at {path}. Use --force to recreate.
Error: Task must be completed before archiving. Current status: pending.
Error: Project '{name}' is archived. Choose an active project or create a new one.
Error: Cannot modify task in archived project '{name}'. Unarchive the project first.
Error: Cannot create dependency: would create circular dependency chain.
Error: Cannot complete task {id}: {count} subtasks are incomplete. Use --force to auto-complete all subtasks.
Error: Task {id} was modified by another process. Retry the operation.
```

### Database Errors (Exit 2)

```
Error: Cannot create database '{filename}': Permission denied.
Error: Cannot open database '{filename}': File not found.
Error: Database operation failed. Run with --verbose for details.
Error: Cannot write to '{filename}': Permission denied.
```

**Note:** Use basename only (`{filename}`), not full path. See S4 in ARCHITECTURE-simple.md.

### Not Found Errors (Exit 3)

```
Error: Task {id} not found.
Error: Project '{name}' not found.
Error: Label '{name}' not found.
```

### Duplicate Errors (Exit 4)

```
Error: Project '{name}' already exists.
```

**Note:** There is no "Label already exists" error because labels are auto-created via `label add` and have no standalone creation command. The `label add` command is idempotent - if the label already exists on the task, it returns exit 0 with "Task X already has label Y".

---

## Database Connection Error Handling

### Connection Failure Modes

The `get_connection()` context manager (schema.md line 578-596) must handle specific SQLite connection failures and map them to appropriate user-facing errors:

```python
import sqlite3
from contextlib import contextmanager
from task_cli.exceptions import DatabaseError

@contextmanager
def get_connection(db_path: str):
    """Context manager for database connections with error handling."""
    conn = None
    try:
        # Attempt connection - can raise various sqlite3 exceptions
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        # PRAGMA failures are critical - re-raise as DatabaseError
        try:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("PRAGMA busy_timeout = 5000")
        except sqlite3.Error as e:
            raise DatabaseError(f"Cannot configure database: {e}") from e

        yield conn
        conn.commit()

    except sqlite3.OperationalError as e:
        # Connection failures: file not found, permissions, corruption
        error_msg = str(e).lower()
        if "unable to open database" in error_msg or "no such file" in error_msg:
            raise DatabaseError(f"Cannot open database '{os.path.basename(db_path)}': File not found.") from e
        elif "disk i/o error" in error_msg:
            raise DatabaseError(f"Cannot access database '{os.path.basename(db_path)}': Disk I/O error.") from e
        elif "database is locked" in error_msg or "database is busy" in error_msg:
            # Should be rare with busy_timeout, but can occur
            raise DatabaseError("Database is locked by another process. Retry in a moment.") from e
        elif "database disk image is malformed" in error_msg:
            raise DatabaseError(f"Database '{os.path.basename(db_path)}' is corrupted. Restore from backup.") from e
        else:
            raise DatabaseError("Database operation failed. Run with --verbose for details.") from e

    except PermissionError as e:
        # File system permission denied
        raise DatabaseError(f"Cannot write to '{os.path.basename(db_path)}': Permission denied.") from e

    except sqlite3.DatabaseError as e:
        # Corruption or malformed database
        raise DatabaseError(f"Database '{os.path.basename(db_path)}' is corrupted. Restore from backup.") from e

    except Exception:
        # Rollback on any error
        if conn:
            conn.rollback()
        raise

    finally:
        if conn:
            conn.close()
```

### Exception Type Mapping

| SQLite Exception | User-Facing Error | Exit Code |
|------------------|-------------------|-----------|
| `sqlite3.OperationalError: unable to open database` | "Cannot open database '{filename}': File not found." | 2 |
| `sqlite3.OperationalError: disk I/O error` | "Cannot access database '{filename}': Disk I/O error." | 2 |
| `sqlite3.OperationalError: database is locked` | "Database is locked by another process. Retry in a moment." | 2 |
| `sqlite3.OperationalError: database disk image is malformed` | "Database '{filename}' is corrupted. Restore from backup." | 2 |
| `sqlite3.DatabaseError` (corruption) | "Database '{filename}' is corrupted. Restore from backup." | 2 |
| `PermissionError` during connect | "Cannot write to '{filename}': Permission denied." | 2 |
| PRAGMA execution failure | "Cannot configure database: {error}" | 2 |
| Other `sqlite3.OperationalError` | "Database operation failed. Run with --verbose for details." | 2 |

### SQLITE_BUSY Handling

With `PRAGMA busy_timeout = 5000` set (schema.md line 587), SQLite will automatically retry for up to 5 seconds when the database is locked. If the lock is not released within this timeout:

1. `sqlite3.OperationalError: database is locked` is raised
2. Map to: "Database is locked by another process. Retry in a moment."
3. Exit code: 2

This provides graceful handling of concurrent access without requiring manual retry logic.

### Database Corruption Detection

Two scenarios indicate corruption:

1. **During connection**: `sqlite3.OperationalError: database disk image is malformed`
2. **During operation**: `sqlite3.DatabaseError` with corruption-related message

Both map to: "Database '{filename}' is corrupted. Restore from backup."

**Note:** Corruption is catastrophic and requires manual intervention. The CLI should not attempt automatic repair.

---

## Error Handling Rules

### Rule 1: Catch at CLI Layer

Exceptions bubble up from command/database layers. The CLI layer catches them and:
1. Prints user-friendly message to stderr
2. Exits with appropriate code

```python
# cli.py
import sys
import traceback
from task_cli.exceptions import TaskError

def main():
    args = None  # Initialize to handle parsing failures
    try:
        # parse args and dispatch to command
        args = parse_args()
        result = dispatch_command(args)
        # print result
        sys.exit(0)
    except KeyboardInterrupt:
        # Handle Ctrl+C gracefully - no error message needed
        print("", file=sys.stderr)  # Print newline after ^C
        sys.exit(130)  # Standard exit code for SIGINT (128 + 2)
    except TaskError as e:
        print(f"Error: {e.message}", file=sys.stderr)
        sys.exit(e.exit_code)
    except Exception as e:
        if args is not None and args.verbose:
            traceback.print_exc()
        print("Error: An unexpected error occurred.", file=sys.stderr)
        sys.exit(1)
```

### Rule 2: Never Expose Internals

User-facing error messages must NOT include:
- Full file system paths (use basename only)
- SQL query text
- Stack traces (unless --verbose)
- Internal exception types
- Database schema details

**Bad:**
```
Error: sqlite3.IntegrityError: UNIQUE constraint failed: projects.name
```

**Good:**
```
Error: Project 'backend' already exists.
```

### Rule 3: Be Specific

When multiple validation errors could apply, report the first one found:

```python
def validate_add_task(title, priority, due_date):
    if not title:
        raise ValidationError("Title cannot be empty.")
    if len(title) > 500:
        raise ValidationError(f"Title must be 500 characters or fewer. Got: {len(title)}")
    # ... continue validation
```

### Rule 4: Distinguish Error Types

Use the specific exception type that matches the error:

| Situation | Exception |
|-----------|-----------|
| Bad user input | `ValidationError` |
| SQLite can't connect | `DatabaseError` |
| Task ID not in database | `NotFoundError` |
| Project name already exists | `DuplicateError` |
| File permission issue (path) | `ValidationError` |
| File permission issue (db) | `DatabaseError` |

### Rule 5: Preserve Original Exceptions

When catching and re-raising, preserve the original exception for debugging:

```python
try:
    cursor.execute(query, params)
except sqlite3.IntegrityError as e:
    if "UNIQUE constraint" in str(e):
        raise DuplicateError(f"Project '{name}' already exists.") from e
    raise DatabaseError("Database constraint violation.") from e
```

---

## Verbose Mode

When `--verbose` is set:
1. Print debug information during execution
2. On error, print full stack trace
3. Include full file paths in error messages

**Verbose mode does NOT expose:**
- SQL query text (parameter values could contain sensitive data)
- Credentials or secrets

```python
if args.verbose:
    print(f"DEBUG: Connecting to {db_path}", file=sys.stderr)
    print(f"DEBUG: Executing search", file=sys.stderr)  # Don't log query text
```

---

## Testing Error Conditions

Each error path should have a test:

```python
def test_add_task_empty_title():
    result = run_cli("add", "")
    assert result.exit_code == 1
    assert "Title cannot be empty" in result.stderr

def test_add_task_invalid_priority():
    result = run_cli("add", "Test task", "--priority", "urgent")
    assert result.exit_code == 1
    assert "Invalid priority" in result.stderr
    assert "high, medium, low" in result.stderr

def test_add_task_project_not_found():
    result = run_cli("add", "Test task", "--project", "nonexistent")
    assert result.exit_code == 3
    assert "not found" in result.stderr

def test_project_add_duplicate():
    run_cli("project", "add", "backend")
    result = run_cli("project", "add", "backend")
    assert result.exit_code == 4
    assert "already exists" in result.stderr

def test_done_task_not_found():
    result = run_cli("done", "999")
    assert result.exit_code == 3
    assert "not found" in result.stderr

def test_export_path_traversal():
    result = run_cli("export-csv", "--output", "../../../etc/passwd")
    assert result.exit_code == 1
    assert "cannot contain '..'" in result.stderr
```
