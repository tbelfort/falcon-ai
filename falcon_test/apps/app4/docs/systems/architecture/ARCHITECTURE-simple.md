# Architecture: Task Manager CLI

**Status:** [DRAFT]

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    USER (Terminal)                       │
└─────────────────────────┬───────────────────────────────┘
                          │ CLI arguments
                          ▼
┌─────────────────────────────────────────────────────────┐
│                      cli.py                              │
│  - Parse arguments (argparse)                           │
│  - Validate input at boundary                           │
│  - Route to command handlers                            │
│  - Map exceptions to exit codes                         │
└─────────────────────────┬───────────────────────────────┘
                          │ Validated parameters
                          ▼
┌─────────────────────────────────────────────────────────┐
│                    commands.py                           │
│  - Business logic per command                           │
│  - Coordinate database + formatters                     │
│  - Enforce business rules                               │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────┐  ┌───────────────────────────┐
│      database.py         │  │      formatters.py        │
│  - SQL queries           │  │  - Table output           │
│  - Transactions          │  │  - JSON output            │
│  - Connection mgmt       │  │  - CSV export             │
└──────────────┬───────────┘  └───────────────────────────┘
               │
               ▼
┌──────────────────────────┐
│    SQLite (file)         │
│    tasks.db              │
└──────────────────────────┘
```

---

## Layer Rules

### CLI Layer (`cli.py`)

**MUST:**
- Parse all arguments using `argparse`
- Validate all user input before passing to commands
- Catch `TaskError` subclasses and convert to exit codes
- Print user-facing messages to stdout/stderr

**MUST NOT:**
- Access database directly
- Import `sqlite3`
- Contain business logic
- Format output (delegate to formatters)

### Command Layer (`commands.py`)

**MUST:**
- Implement one function per CLI command
- Accept validated, typed parameters
- Return data (not formatted strings)
- Raise specific exception types for errors

**MUST NOT:**
- Parse CLI arguments
- Print to stdout/stderr
- Handle exit codes
- Catch exceptions (let them propagate)

### Database Layer (`database.py`)

**MUST:**
- Use parameterized queries exclusively (`?` placeholders)
- Use context managers for connections
- Use transactions for multi-statement operations
- Return model objects (not raw tuples)

**MUST NOT:**
- Validate business rules
- Format output
- Use string interpolation in queries (SECURITY CRITICAL)

### Formatter Layer (`formatters.py`)

**MUST:**
- Accept model objects as input
- Return strings (for table/JSON) or write files (for CSV)
- Handle edge cases (empty lists, None values)

**MUST NOT:**
- Access database
- Make business decisions

---

## Data Flow Examples

### Add Task

```
User: task-cli add "Fix login bug" --priority high --due 2026-01-25
                            │
cli.py: parse args          │
cli.py: validate_title("Fix login bug")      ✓
cli.py: validate_priority("high")            ✓
cli.py: validate_due_date("2026-01-25")      ✓
                            │
commands.py: cmd_add(db_path, title, priority, due_date, ...)
commands.py: create Task model
commands.py: call database.insert_task()
                            │
database.py: INSERT INTO tasks (...) VALUES (?, ?, ?, ...)
database.py: return inserted id
                            │
cli.py: print "Task created: 1 - Fix login bug"
cli.py: exit(0)
```

### Search (with SQL injection attempt)

```
User: task-cli list --search "'; DROP TABLE--"
                            │
cli.py: parse args          │
cli.py: passes search term through (search is lenient)
                            │
commands.py: cmd_list(db_path, filters={"search": "'; DROP TABLE--"})
                            │
database.py: SELECT ... WHERE title LIKE ?
             query param: ("%'; DROP TABLE--%",)
             → SQLite treats as literal string
             → Returns empty result (no injection)
                            │
cli.py: print "No tasks found."
cli.py: exit(0)
```

---

## Critical Security Rules

### S1: Parameterized Queries Only

```python
# CORRECT
cursor.execute("SELECT * FROM tasks WHERE title = ?", (title,))

# WRONG - SQL INJECTION VULNERABILITY
cursor.execute(f"SELECT * FROM tasks WHERE title = '{title}'")
```

**Enforcement:** Code review. Any string interpolation in SQL is a blocking issue.

**LIKE Pattern Escaping (CRITICAL):**
When using LIKE queries with user input, escape the wildcard characters `%` and `_` to prevent pattern injection:
```python
# WRONG - Pattern injection vulnerability
cursor.execute("SELECT * FROM tasks WHERE title LIKE ?", (f"%{search}%",))
# User input "50%" would match "50" followed by anything

# CORRECT - Escape wildcards
escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
cursor.execute("SELECT * FROM tasks WHERE title LIKE ? ESCAPE '\\'", (f"%{escaped}%",))
```

### S2: Input Validation

For priority, status, due_date:
- Priority MUST be one of: `high`, `medium`, `low`
- Status MUST be one of: `pending`, `in_progress`, `completed`, `archived`
- Due date MUST be valid ISO format (YYYY-MM-DD) or null

```python
VALID_PRIORITIES = {"high", "medium", "low"}
VALID_STATUSES = {"pending", "in_progress", "completed", "archived"}

def validate_priority(priority: str) -> str:
    if priority not in VALID_PRIORITIES:
        raise ValidationError(f"Invalid priority '{priority}'. Must be one of: {', '.join(sorted(VALID_PRIORITIES))}")
    return priority
```

### S3: Path Traversal Prevention

**Requirement:** All user-provided paths MUST be validated before use.

**Validation Steps (in order - ORDER IS CRITICAL):**
1. **Check for ".." BEFORE any path resolution:**
   - `if ".." in user_path: raise ValidationError("Path cannot contain '..'.")`
   - This prevents directory traversal attempts before normalization
   - Also check for URL-encoded variants: %2e, %2E
2. **Resolve to absolute path:** `abs_path = os.path.realpath(user_path)`
   - This resolves symlinks and normalizes the path
3. **Check for parent directory escape:**
   - The resolved path must be within the allowed directory (cwd or specified base)
   - `if not abs_path.startswith(allowed_base + os.sep): raise ValidationError`
4. **CRITICAL:** Steps 1-3 prevent path traversal but NOT symlink TOCTOU attacks
   - After validation, attacker could create symlink before file is opened
   - See "Symlink TOCTOU Prevention" section below for atomic write protection

**CRITICAL: Symlink TOCTOU Prevention**

Path validation alone is insufficient for write operations. After validation, a symlink could be created before the file is opened, redirecting the write to an unauthorized location (TOCTOU vulnerability).

**For Write Operations (export-csv, init):**
Use `os.open()` with `O_NOFOLLOW` flag to prevent following symlinks atomically:

```python
import os
import errno
from task_cli.exceptions import ValidationError

def safe_create_file(validated_path: str, mode: int = 0o600) -> int:
    """Create file atomically without following symlinks.

    Args:
        validated_path: Already-validated absolute path
        mode: File permissions (default 0o600 for databases, use 0o644 for CSV exports)

    Returns: File descriptor
    Raises: ValidationError if symlink exists at path
    """
    try:
        # O_NOFOLLOW: fail if path is a symlink (TOCTOU prevention)
        # O_CREAT | O_EXCL: fail if file already exists
        # O_WRONLY: write-only access
        fd = os.open(validated_path,
                     os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     mode)
        return fd
    except OSError as e:
        if e.errno == errno.ELOOP:
            raise ValidationError(f"Path '{os.path.basename(validated_path)}' is a symlink")
        raise

def fd_to_file(fd: int, mode: str = 'w') -> object:
    """Convert file descriptor to file object for use with csv.writer.

    Args:
        fd: File descriptor from safe_create_file()
        mode: File mode ('w' for text, 'wb' for binary)

    Returns: File object (caller must close)

    Note: The returned file object takes ownership of the fd.
    Closing the file object will close the fd.
    """
    return os.fdopen(fd, mode, encoding='utf-8' if 'b' not in mode else None)
```

**For Database Paths:**
Database creation MUST use the same `O_NOFOLLOW` pattern. See database/schema.md for details.

**Atomic Overwrite Pattern (for --force operations):**
When overwriting existing files (e.g., export-csv --force, init --force), use atomic rename to prevent TOCTOU:

```python
import os
import tempfile
from task_cli.exceptions import ValidationError

def safe_atomic_overwrite(target_path: str, write_func, mode: int = 0o644):
    """Atomically overwrite file using temp file + rename.

    Args:
        target_path: Already-validated absolute path to overwrite
        write_func: Callable that accepts file object and writes content
        mode: File permissions for new file (0o644 for CSV, 0o600 for database)

    Raises: ValidationError, OSError on failure

    Implementation:
    1. Create temp file in same directory as target (required for atomic rename)
    2. Write content to temp file
    3. Atomically rename temp over target
    4. Clean up temp on error
    """
    dir_path = os.path.dirname(os.path.abspath(target_path))
    fd = None
    temp_path = None

    try:
        # Create temp file with O_NOFOLLOW | O_CREAT | O_EXCL
        # tempfile.mkstemp returns (fd, path)
        fd, temp_path = tempfile.mkstemp(dir=dir_path, prefix='.tmp_', suffix='.tmp')

        # Set correct permissions (mkstemp creates with 0o600)
        os.chmod(temp_path, mode)

        # Convert fd to file object and write content
        with fd_to_file(fd, 'w') as f:
            fd = None  # fdopen takes ownership
            write_func(f)

        # Atomic rename (POSIX guarantees atomicity on same filesystem)
        # Note: os.rename() does NOT fail if target is a symlink
        # The symlink itself is replaced, not its target
        os.rename(temp_path, target_path)
        temp_path = None  # Successfully renamed, no cleanup needed

    except Exception:
        # Clean up temp file on any error
        if fd is not None:
            os.close(fd)
        if temp_path is not None and os.path.exists(temp_path):
            os.unlink(temp_path)
        raise
```

**Windows Compatibility (CRITICAL):**
The O_NOFOLLOW flag is not supported on Windows (it's a POSIX-only feature). Implementations MUST handle this gracefully:

```python
import sys

# Check platform capability
HAS_O_NOFOLLOW = hasattr(os, 'O_NOFOLLOW') and sys.platform != 'win32'

def safe_create_file(validated_path: str, mode: int = 0o600) -> int:
    """Create file atomically without following symlinks.

    On Windows: Falls back to standard O_CREAT | O_EXCL (no symlink protection)
    On POSIX: Uses O_NOFOLLOW for full TOCTOU prevention

    Windows Limitation: Symlink attacks are still possible on Windows.
    Document this as a known limitation.
    """
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if HAS_O_NOFOLLOW:
        flags |= os.O_NOFOLLOW

    try:
        fd = os.open(validated_path, flags, mode)
        return fd
    except OSError as e:
        if HAS_O_NOFOLLOW and e.errno == errno.ELOOP:
            raise ValidationError(f"Path '{os.path.basename(validated_path)}' is a symlink")
        raise
```

**Known Limitation:** On Windows, symlink TOCTOU attacks cannot be fully prevented due to lack of O_NOFOLLOW support. The application still validates paths and uses O_EXCL to prevent overwriting existing files, providing partial protection.

**Implementation:**
```python
import os
import urllib.parse
from task_cli.exceptions import ValidationError

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

# CRITICAL: After validate_path(), use safe_create_file() with O_NOFOLLOW for write operations
```

**Error Messages:**
- `Error: Path '{basename}' is outside allowed directory.` (exit 1)
- `Error: Path '{basename}' is a symlink.` (exit 1)

### S4: Error Message Sanitization

Error messages to users must NOT include:
- Full file paths (only basename)
- SQL query text
- Stack traces (unless --verbose)
- Database internal errors

```python
# CORRECT
"Error: Database file not found"

# WRONG - exposes internal path
"Error: sqlite3.OperationalError: unable to open database file: /home/user/secret/path/db.sqlite"
```

**Verbose mode exception:** When `--verbose` is set, S4 restrictions are relaxed for debugging:
- Full file paths may be shown
- Stack traces are printed
- Internal error details are included

However, even in verbose mode:
- SQL query text is NOT shown (parameter values could contain sensitive data)
- Credentials/secrets are NEVER shown

---

## File Locations

| File | Purpose |
|------|---------|
| `task_cli/__init__.py` | Package marker, `__version__` |
| `task_cli/__main__.py` | Entry: `python -m task_cli` |
| `task_cli/cli.py` | Argument parsing, routing |
| `task_cli/commands.py` | Command business logic |
| `task_cli/database.py` | SQL operations |
| `task_cli/models.py` | Data classes |
| `task_cli/formatters.py` | Output formatting |
| `task_cli/exceptions.py` | Exception hierarchy |

---

## Entry Points

### As Module
```bash
python -m task_cli [command] [args]
```

### As Script (if installed)
```bash
task-cli [command] [args]
```

Both invoke `cli.main()`.
