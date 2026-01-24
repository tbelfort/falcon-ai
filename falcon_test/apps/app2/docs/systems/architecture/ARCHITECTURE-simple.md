# Architecture: Personal Finance Tracker CLI

**Status:** [FINAL]

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
│    finances.db           │
└──────────────────────────┘
```

---

## Layer Rules

### CLI Layer (`cli.py`)

**MUST:**
- Parse all arguments using `argparse`
- Validate all user input before passing to commands
- Catch `FinanceError` subclasses and convert to exit codes
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

### Add Transaction

```
User: finance-cli add-transaction --account checking --amount -45.67 --category groceries
                            │
cli.py: parse args          │
cli.py: validate_amount("-45.67") -> -4567 cents  ✓
cli.py: validate_account_name("checking")         ✓
cli.py: validate_category_name("groceries")       ✓
                            │
commands.py: cmd_add_transaction(...)
commands.py: find_account_by_name("checking") -> Account
commands.py: find_category_by_name("groceries") -> Category
commands.py: create Transaction model
commands.py: call database.insert_transaction()
                            │
database.py: INSERT INTO transactions (...) VALUES (?, ?, ?, ...)
database.py: return inserted id
                            │
cli.py: print "Transaction recorded: -$45.67 (ID: 42)"
cli.py: exit(0)
```

### Search with SQL Injection Attempt

```
User: finance-cli list-transactions --category "'; DROP TABLE--"
                            │
cli.py: parse args          │
cli.py: validate_category_name("'; DROP TABLE--")
       -> passes through (search is lenient)
                            │
commands.py: cmd_list_transactions(...)
commands.py: find_category_by_name("'; DROP TABLE--") -> None
commands.py: return empty list (category not found returns no transactions)
                            │
OR if category filter is passed directly:
database.py: SELECT ... WHERE category_id = ?
             query param: (category_id_lookup_result,)
             -> SQLite treats as literal
             -> Returns empty result (no injection)
                            │
cli.py: print empty table
cli.py: exit(0)
```

---

## Critical Security Rules

### S1: Parameterized Queries Only

```python
# CORRECT
cursor.execute("SELECT * FROM accounts WHERE name = ?", (name,))

# WRONG - SQL INJECTION VULNERABILITY
cursor.execute(f"SELECT * FROM accounts WHERE name = '{name}'")
```

**Enforcement:** Code review. Any string interpolation in SQL is a blocking issue.

### S2: Path Validation

**Implementation Location:** Both `validate_path()` and `safe_open_file()` MUST be implemented in `models.py` (not database.py or cli.py) to centralize validation logic. See components.md for the complete function specification.

For `--db` and `--output` arguments:
- Paths MUST be URL-decoded before validation. Check for '..' in both raw and decoded forms.
- Must not contain `..` (path traversal)
- Must resolve symlinks and verify containment within allowed directory
- Absolute paths outside the current working directory are blocked
- Must be writable by current user
- Path validation and file access MUST be atomic. Use `os.open()` to open the resolved path, then use `os.fstat()` on the fd rather than `os.stat()` on the path.

```python
import os
import urllib.parse
from finance_cli.exceptions import ValidationError

def validate_path(path: str, base_dir: str = None) -> str:
    """Validate and normalize a file path.

    Args:
        path: User-provided path (relative or absolute)
        base_dir: Allowed base directory (defaults to cwd)

    Returns:
        Normalized absolute path

    Raises:
        ValidationError: If path fails validation

    Security checks performed:
    1. URL-decode the path repeatedly until stable (catches double/triple encoding)
    2. Reject paths containing '..' in both raw and decoded forms (path traversal)
    3. Resolve symlinks with os.path.realpath()
    4. Verify resolved path is contained within base_dir
    5. Block absolute paths that resolve outside base_dir
    """
    if base_dir is None:
        base_dir = os.getcwd()

    # CRITICAL: URL-decode the path repeatedly until stable
    # This prevents bypasses using double/triple encoding like %252e%252e
    # which decodes to %2e%2e, then to ..
    # Maximum 10 iterations to prevent DoS from deeply nested encoding
    decoded_path = path
    max_iterations = 10
    for iteration in range(max_iterations):
        new_decoded = urllib.parse.unquote(decoded_path)
        if new_decoded == decoded_path:
            break
        decoded_path = new_decoded
    else:
        # Exceeded iteration limit
        raise ValidationError("Path contains excessive URL encoding layers (possible DoS attempt)")

    # Check for null bytes which can cause path truncation attacks
    if '\x00' in path or '\x00' in decoded_path:
        raise ValidationError("Path cannot contain null bytes.")

    # Check for path traversal attempts in BOTH raw and decoded forms
    if ".." in path or ".." in decoded_path:
        raise ValidationError("Path cannot contain '..' (including URL-encoded forms like %2e%2e).")

    # Resolve to absolute path, following symlinks
    resolved = os.path.realpath(os.path.abspath(decoded_path))
    base_resolved = os.path.realpath(base_dir)

    # Containment check: resolved path must be within base directory
    if not resolved.startswith(base_resolved + os.sep) and resolved != base_resolved:
        raise ValidationError("Path must be within the current working directory")

    # For write operations, verify parent directory exists
    # (file may not exist yet, but parent must exist for writing)
    parent_dir = os.path.dirname(resolved)
    if not os.path.isdir(parent_dir):
        raise ValidationError(f"Parent directory does not exist")

    return resolved
```

**Note:** Absolute paths outside the current working directory are blocked to prevent writing to sensitive system locations. All paths are resolved through `os.path.realpath()` to follow symlinks before the containment check.

**Edge case:** When resolving symlinks, the parent directory of the resolved path must exist. If a symlink points to a non-existent location, the validation should fail with an appropriate error.

**CRITICAL - Atomic File Access:** To minimize TOCTOU (time-of-check-time-of-use) race conditions with symlinks, file operations MUST open files atomically after path validation using the two-step coordination pattern below.

**Coordination Pattern:** Callers MUST follow this sequence:
1. Call `validate_path()` to get a validated path (string)
2. IMMEDIATELY pass the validated path to `safe_open_file()` to get a file descriptor
3. Use the file descriptor for all operations (do NOT use the path string after opening)

**Security Rationale:** The validate_path() function returns a string path, not a file descriptor. Between validation and opening, there is a small window where an attacker could potentially swap a symlink. The safe_open_file() function minimizes this window by using os.open() with appropriate flags and immediately returning a file descriptor. Callers MUST use the fd for all subsequent operations.

**TOCTOU Risk Assessment:** This is a single-user CLI application running in a personal environment, not a multi-tenant system. The TOCTOU window between validate_path() and safe_open_file() is acceptably small for this threat model. Defense-in-depth checks in safe_open_file() (symlink detection, O_EXCL for new files, secure permissions) provide additional mitigation. For higher-security contexts, consider platform-specific atomic validation+access mechanisms.

```python
import os

def safe_open_file(validated_path: str, mode: str, force: bool = False) -> int:
    """Open a file atomically after path validation.

    MUST be implemented in models.py alongside validate_path().

    Args:
        validated_path: Path that has already been validated by validate_path()
        mode: 'r' for read, 'w' for write
        force: If True, allow overwriting existing files (only for mode='w')

    Returns:
        File descriptor (int) that can be used with os.fdopen()

    Raises:
        OSError: If file cannot be opened
        FileExistsError: If mode='w', force=False, and file exists
        ValidationError: If path is a symlink (for read mode)

    Usage:
        fd = safe_open_file(path, 'r')
        with os.fdopen(fd, 'r') as f:
            content = f.read()

    Implementation notes:
    - For read operations: Check if path is a symlink BEFORE opening, then use os.O_RDONLY
    - For write (new file): use os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
    - For write (overwrite with force): use os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600

    IMPORTANT: O_NOFOLLOW behavior varies by platform (Linux vs macOS/BSD). For
    cross-platform safety, we explicitly check os.path.islink() before opening
    for read operations.

    IMPORTANT: This function sets file permissions atomically during creation using
    the mode parameter of os.open() (0o600). This is the RECOMMENDED approach for
    setting file permissions securely. Do NOT use os.chmod() after file creation
    as that creates a window where the file has incorrect permissions.

    NOTE ON DEFENSE-IN-DEPTH: The validate_path() function already resolves symlinks
    via os.path.realpath(), so by the time we reach safe_open_file(), the path
    should be the resolved absolute path. The islink() check here is defense-in-depth,
    NOT the primary security mechanism. It provides additional protection against
    symlinks created between validation and opening. The primary defense against
    path traversal and symlink attacks is the realpath() resolution in validate_path().

    Then use os.fstat(fd) instead of os.stat(path) to check file properties.
    This ensures the check and use happen on the same file descriptor,
    preventing symlink substitution attacks between validation and access.
    """
    if mode == 'r':
        # Defense-in-depth: reject symlinks even though validate_path() resolves them
        # This catches cases where a symlink was created after validation
        if os.path.islink(validated_path):
            raise ValidationError("Cannot read symlink directly. Path must resolve to a regular file.")
        return os.open(validated_path, os.O_RDONLY)
    elif mode == 'w':
        if force:
            return os.open(validated_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        else:
            return os.open(validated_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    else:
        raise ValueError(f"Invalid mode: {mode}. Use 'r' or 'w'.")
```

### S3: Error Message Sanitization

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

**Verbose mode exception:** When `--verbose` is set, S3 restrictions are relaxed for debugging:
- Full file paths may be shown (but use basename when sufficient)
- Stack traces are printed
- Internal error details are included

However, even in verbose mode:
- SQL query text is NOT shown (parameter values could contain sensitive data)
- Credentials/secrets are NEVER shown

**CRITICAL - Verbose mode PII prohibition:** Verbose mode MUST NOT log any of the following sensitive financial data:
- Transaction amounts
- Transaction descriptions
- Account names (even in generic debug messages like "Looking up account")
- Category names (even in generic debug messages like "Found category")
- Any financial totals or balances
- Account IDs or Category IDs when associated with names

Debug output MUST use generic placeholders like "Processing transaction ID {id}", "Looking up entity by name", "Found entity ID: {id}" rather than exposing actual financial details. This prohibition is ABSOLUTE - there are no exceptions even for debugging purposes.

**Rationale:** Financial data is PII. Logging PII in debug output creates security risks (log files, terminal history, screenshots). Generic identifiers provide sufficient debugging information without exposing sensitive data.

See errors.md for detailed verbose mode examples and consistent behavior specification.

### S4: Financial Data Protection

- Never log transaction amounts or descriptions in debug output
- Error messages must not reveal financial details
- Database file should have restrictive permissions (0600)

```python
# CORRECT debug output
print(f"DEBUG: Processing transaction ID {tx_id}", file=sys.stderr)

# WRONG - exposes financial data
print(f"DEBUG: Processing transaction: ${amount} - {description}", file=sys.stderr)
```

---

## File Locations

| File | Purpose |
|------|---------|
| `finance_cli/__init__.py` | Package marker, `__version__` |
| `finance_cli/__main__.py` | Entry: `python -m finance_cli` |
| `finance_cli/cli.py` | Argument parsing, routing |
| `finance_cli/commands.py` | Command business logic |
| `finance_cli/database.py` | SQL operations |
| `finance_cli/models.py` | Data classes |
| `finance_cli/formatters.py` | Output formatting |
| `finance_cli/exceptions.py` | Exception hierarchy |

---

## Entry Points

### As Module
```bash
python -m finance_cli [command] [args]
```

### As Script (if installed)
```bash
finance-cli [command] [args]
```

Both invoke `cli.main()`.
