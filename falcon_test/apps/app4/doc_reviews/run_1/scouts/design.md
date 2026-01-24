# Design Completeness Scout Report

## Assessment: ISSUES_FOUND

The design documentation is comprehensive and detailed, but several areas lack sufficient specification to prevent implementation ambiguity. Most critically, the CLI argument parsing structure is undefined, several command behaviors have ambiguous edge cases, and some security-critical implementations lack concrete specifications.

## Issues

### Issue 1: CLI Argument Parser Structure Unspecified

**Affected Files:** ["app4/docs/design/components.md", "app4/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From components.md (lines 49-68):
```
### `cli.py`

**Purpose**: Parse command-line arguments, route to command handlers

**Responsibilities**:
1. Define argument parser with subcommands
2. Validate input at boundary (before passing to commands)
3. Map exceptions to exit codes
4. Handle `--verbose` flag for debug output

**Public interface**:
- `main()` - entry point, parses args, calls commands

**Dependencies**: `commands`, `exceptions`, `formatters`

**MUST NOT**:
- Access database directly
- Import `sqlite3`
- Contain business logic
- Format output (delegate to formatters)
```

From interface.md (lines 7-17):
```
## Global Options

These options apply to all commands:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--db PATH` | string | `./tasks.db` | Path to SQLite database file |
| `--verbose` | flag | false | Enable debug output |
| `--help` | flag | - | Show help for command |
| `--version` | flag | - | Show version number |
```

**What's Missing/Wrong:**

The documentation describes what the CLI should do but provides no specification for HOW to structure the argparse parser. Critical missing details:

1. **Subcommand structure**: Should this use `add_subparsers()` with individual parsers for each command (add, edit, list, etc.)? Should it use argument groups?

2. **Global option placement**: Where should `--db`, `--verbose`, `--help`, `--version` be defined? On the main parser before subparsers are added? Should they be available on subparsers too?

3. **Argument parser configuration**: Should the parser use `description`, `epilog`, `formatter_class` parameters? What help text formatting?

4. **Subcommand routing**: Should the CLI use `set_defaults(func=cmd_add)` pattern, or manual if/elif dispatch, or a command registry pattern?

5. **Nested subcommands**: The `project` and `label` commands have subcommands (e.g., `project add`, `project list`). How should these nested subparsers be structured?

An implementer would need to make design decisions about parser structure that could lead to inconsistent help output, difficult-to-maintain code, or errors in argument handling.

**Assessment:**
This is a moderate blocking issue. Without a clear parser structure spec, different implementers would create incompatible CLI interfaces, and refactoring later would be difficult.

---

### Issue 2: Database Connection Error Handling Unspecified

**Affected Files:** ["app4/docs/systems/database/schema.md", "app4/docs/systems/errors.md"]

**Relevant Text From Docs:**

From schema.md (lines 571-607):
```
## Connection Management

```python
import sqlite3
from contextlib import contextmanager
from typing import Generator

@contextmanager
def get_connection(db_path: str) -> Generator[sqlite3.Connection, None, None]:
    """Context manager for database connections.

    CRITICAL: Sets busy_timeout to handle concurrent access gracefully.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # Enable column access by name
    conn.execute("PRAGMA foreign_keys = ON")  # Enable FK constraints
    conn.execute("PRAGMA busy_timeout = 5000")  # Wait up to 5 seconds for lock
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

**Rules:**
- Always use context manager (ensures close)
- Always enable foreign keys
- Always set busy_timeout (handles concurrent access)
- Always commit or rollback (no implicit transactions)
- Set `row_factory = sqlite3.Row` for named column access

**Busy Timeout (CRITICAL):**
The `busy_timeout` PRAGMA MUST be set to 5000 milliseconds (5 seconds) on every connection. This allows the CLI to wait for locks to be released instead of immediately failing with `SQLITE_BUSY`. Without this setting, concurrent CLI invocations will fail unpredictably under contention.
```

From errors.md (lines 106-115):
```
### Database Errors (Exit 2)

```
Error: Cannot create database '{filename}': Permission denied.
Error: Cannot open database '{filename}': File not found.
Error: Database operation failed. Run with --verbose for details.
Error: Cannot write to '{filename}': Permission denied.
```

**Note:** Use basename only (`{filename}`), not full path. See S4 in ARCHITECTURE-simple.md.
```

**What's Missing/Wrong:**

The documentation shows the connection context manager but doesn't specify how to handle specific connection failures:

1. **sqlite3.connect() failure modes**: What if the database file path is a directory? What if it's a read-only file? What if the parent directory doesn't exist? Each raises different sqlite3 exceptions - which should be caught and converted to DatabaseError vs ValidationError?

2. **PRAGMA failure handling**: What if `PRAGMA foreign_keys = ON` fails (e.g., older SQLite versions)? Should this be a fatal error or a warning?

3. **SQLITE_BUSY handling**: The busy_timeout is set, but what if a connection STILL times out after 5 seconds? Should this retry, or fail immediately with a specific error message?

4. **Database corruption**: What if `sqlite3.connect()` succeeds but the database is corrupted? How should this be detected and reported?

5. **Exception mapping**: The `get_connection()` context manager catches `Exception` and re-raises. Which sqlite3 exception types should be caught and converted to `DatabaseError` with user-friendly messages?

An implementer would need to experiment with different failure modes to figure out appropriate error handling, leading to inconsistent behavior.

**Assessment:**
This is a moderate blocking issue. Database connection errors are common (wrong path, permissions, corruption), and without clear handling specs, users will get inconsistent or confusing error messages.

---

### Issue 3: Task ID Validation Implementation Ambiguity

**Affected Files:** ["app4/docs/systems/cli/interface.md", "app4/docs/design/components.md"]

**Relevant Text From Docs:**

From interface.md (lines 969-1001):
```
### Task ID
- Must be a positive integer
- Must be >= 1 and <= 9,223,372,036,854,775,807 (SQLite INTEGER max)
- Regex: `^[1-9]\d*$`
- **CRITICAL:** Task ID validation MUST be applied to ALL commands accepting task IDs (edit, show, done, archive, label add, label remove)
- **Validation logic:**
  ```python
  from task_cli.exceptions import ValidationError

  def validate_task_id(task_id_str: str) -> int:
      """Validate task ID is a positive integer within bounds.

      CRITICAL: This function MUST be called for ALL task ID inputs
      before passing to database layer.

      Raises:
          ValidationError: If not numeric, not positive, or exceeds max
      """
      # Reject non-digits, empty strings, and leading zeros (including "0")
      if not task_id_str.isdigit() or task_id_str[0] == '0':
          raise ValidationError(f"Invalid task ID '{task_id_str}' - must be positive integer")

      task_id = int(task_id_str)
      # Note: task_id >= 1 is guaranteed by the check above (no leading zeros, all digits)
      if task_id > 9223372036854775807:
          raise ValidationError(f"Invalid task ID '{task_id}' - exceeds maximum value")

      return task_id
  ```
- Non-numeric input produces ValidationError (exit 1)
- Out of bounds produces ValidationError (exit 1)
- ID not found produces NotFoundError (exit 3)
```

From components.md (lines 221-224):
```
def validate_task_id(task_id_str: str) -> int  # CRITICAL: validates bounds (1 to 9,223,372,036,854,775,807) and format; MUST be called for ALL task ID inputs
```

**What's Missing/Wrong:**

The validation logic is provided, but several edge cases are ambiguous:

1. **String with whitespace**: What about `" 123"` or `"123 "` or `"12 3"`? Should whitespace be stripped first, or rejected?

2. **Plus sign**: What about `"+123"`? The regex `^[1-9]\d*$` would reject it, but `isdigit()` would also reject it, so this is unclear.

3. **Scientific notation**: What about `"1e5"` or `"1.23e10"`? These are numeric but not integers.

4. **Hex/octal**: What about `"0x10"` or `"0o10"`? These are valid in some contexts but should probably be rejected.

5. **Integer overflow during int() conversion**: The validation checks `> 9223372036854775807` AFTER calling `int()`. But Python's `int()` can handle arbitrarily large integers. What if someone passes `"99999999999999999999999999999999"`? The `int()` succeeds, but then the comparison might be expensive or behave unexpectedly.

6. **Where is validate_task_id defined?**: The interface doc shows the implementation but doesn't specify which module. Components.md suggests it's in `models.py`, but should it be in `cli.py` or a validation module?

Without clarification, an implementer might strip whitespace (making `" 123"` valid), or might not check for scientific notation, leading to cryptic errors later.

**Assessment:**
This is a minor blocking issue. The core validation is specified, but edge cases could lead to confusing behavior or security issues (e.g., accepting unexpected formats).

---

### Issue 4: CSV Injection Escaping Implementation Unclear

**Affected Files:** ["app4/docs/design/technical.md", "app4/docs/design/components.md"]

**Relevant Text From Docs:**

From technical.md (lines 223-248):
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

This prevents spreadsheet applications from interpreting field content as formulas or commands.
```

From components.md (lines 263-265):
```
**CSV Injection Prevention (CRITICAL):**
The `write_csv()` function MUST escape all field values to prevent formula injection attacks. If a field value starts with any of these characters: `=`, `+`, `-`, `@`, `\t` (tab), `\r` (carriage return), `\n` (newline), the field MUST be prefixed with a single quote (`'`) before CSV encoding. This prevents spreadsheet applications from interpreting field content as formulas or commands. See technical.md "CSV Format" section for detailed implementation.
```

**What's Missing/Wrong:**

The escaping rule is specified, but the interaction with Python's csv module is unclear:

1. **CSV quoting interaction**: Python's `csv.writer` has quoting modes (`QUOTE_MINIMAL`, `QUOTE_ALL`, `QUOTE_NONNUMERIC`, `QUOTE_NONE`). If a field value is `"'=1+1"` (with our added quote prefix), will the csv module quote it correctly? Will it become `"'=1+1"` or `"\"'=1+1\""` in the output?

2. **Double escaping risk**: If a field value already starts with a single quote (e.g., `"'hello"`), and we prefix it, it becomes `"''hello"`. Is this correct behavior, or does it need special handling?

3. **Escaping order**: Should the formula injection prefix be applied BEFORE passing to csv.writer, or AFTER? The example suggests before, but the phrase "before CSV encoding" is ambiguous.

4. **Empty string vs None**: The example shows `if value is None: return ""`. But should None fields be written as empty strings `""` or left as null/blank in the CSV? The CSV columns spec doesn't clarify.

5. **Unicode handling**: What about fields starting with Unicode characters that look like `=` or `-` (e.g., full-width equals `＝` or minus sign `−`)? Should these also be escaped, or only ASCII characters?

6. **Multi-line field values**: Fields with newlines will be quoted by csv.writer. If a field is `"line1\nline2"` and starts with `\n`, it becomes `"'\nline1\nline2"`. Will spreadsheet apps interpret this correctly?

An implementer might apply the escaping in the wrong order or use the wrong quoting mode, leading to malformed CSV or ineffective injection prevention.

**Assessment:**
This is a moderate blocking issue. CSV injection is marked CRITICAL, but the implementation details are underspecified, risking either ineffective protection or malformed output.

---

### Issue 5: Archived Project Enforcement Mechanism Unspecified

**Affected Files:** ["app4/docs/systems/cli/interface.md", "app4/docs/design/components.md"]

**Relevant Text From Docs:**

From interface.md (lines 649-676):
```
### Archived Project Rules (CRITICAL)

Archived projects are read-only. The following rules MUST be enforced:

1. **New tasks MUST NOT be created in archived projects.**
   - `task-cli add "Task" --project archivedProject` MUST fail
   - Error: "Error: Project '{name}' is archived. Choose an active project or create a new one."
   - Exit code: 1 (ValidationError)

2. **Existing tasks in archived projects MUST NOT be modifiable.**
   - `task-cli edit <id> --title "New title"` MUST fail if task is in an archived project
   - Error: "Error: Cannot modify task in archived project '{name}'. Unarchive the project first."
   - Exit code: 1 (ValidationError)
   - Exception: The `done` and `archive` commands still work on tasks in archived projects
   - Rationale: Status changes (completing/archiving work) are terminal operations that don't modify task content, so they're safe to perform even after project is archived for historical record-keeping

3. **Tasks MUST NOT be reassigned to archived projects.**
   - `task-cli edit <id> --project archivedProject` MUST fail
   - Error: "Error: Project '{name}' is archived. Choose an active project or create a new one."
   - Exit code: 1 (ValidationError)

4. **To modify tasks in an archived project:**
   - First unarchive the project: `task-cli project unarchive <name>`
   - Then modify tasks as needed
   - Optionally re-archive the project

**Rationale:** Archived projects represent completed or abandoned work. Preventing modifications ensures historical integrity and prevents accidental changes to closed projects.
```

From components.md (lines 120-125):
```
**Behavior:**
1. Find task by ID
2. If not found -> error, exit 3
3. If `--project` specified, verify project exists
4. If project is archived, return error: "Error: Project '{name}' is archived. Choose an active project or create a new one." (exit 1)
5. If `--status` specified, validate status transition
6. Apply changes
7. Print updated task
```

**What's Missing/Wrong:**

The rules are clear, but the WHERE and HOW of enforcement is unspecified:

1. **Check location for add command**: Should the archive check happen in `cli.py` during input validation, or in `commands.py` during business logic, or in `database.py` during project lookup? The order matters for error reporting.

2. **Check location for edit command**: For rule #2 (can't edit tasks in archived projects), the check requires knowing BOTH the task's current project AND whether that project is archived. Should this be:
   - A JOIN query in the database layer that returns project status with task?
   - Two separate queries (get task, then get project status)?
   - Cached project status in memory?

3. **done/archive exception**: Rule #2 says `done` and `archive` commands still work on tasks in archived projects. But the spec doesn't say WHERE this exception is implemented. Should `cmd_edit()` have a special case? Should there be a separate `can_modify_task()` function?

4. **Error message ambiguity**: When editing a task in an archived project, should the error message include the task ID, or just the project name? The spec shows `"Cannot modify task in archived project '{name}'"` - does `{name}` refer to project name or task title?

5. **Race condition**: What if a project is archived BETWEEN when we check its status and when we insert/update the task? Should there be a transaction? Should the check be part of the query using a WHERE clause?

6. **Performance concern**: If we need to check project archive status on every task modification, should we cache the project status in the Task model, or query it every time? What about tasks with no project?

Without specification of WHERE these checks happen and HOW they're implemented, different implementers would create different architectures, potentially with race conditions or performance issues.

**Assessment:**
This is a significant blocking issue. The business rules are well-defined, but the enforcement mechanism is completely unspecified, which could lead to architectural inconsistency or bugs.

---

### Issue 6: Batch Operation Partial Failure Reporting Underspecified

**Affected Files:** ["app4/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From interface.md (lines 402-421):
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

And from lines 447-456:
```
**Output (success):**
```
Completed: 1, 3, 5
```

**Output (partial):**
```
Completed: 1, 3. Not found: 99. Already completed: 5.
```

**Exit codes:**
- 0: At least one task completed successfully
- 1: All IDs had validation errors (invalid format)
- 2: Database error during processing
- 3: All valid IDs were not found in database
```

**What's Missing/Wrong:**

The error handling rules are specified, but the output format for mixed success/failure is underspecified:

1. **Error message timing**: Should validation errors for individual IDs be printed immediately as they're encountered, or batched at the end? The example suggests individual messages, but the "Output (partial)" shows a summary format.

2. **Output format inconsistency**: The example shows individual error lines (`Error: Task {id} not found`), but the "Output (partial)" shows a single-line summary (`Completed: 1, 3. Not found: 99.`). Which format should be used, or both?

3. **Multiple error types**: What if batch has validation errors, not found errors, AND already-completed tasks? Should the output be:
   - `Completed: 1. Validation errors: abc, -5. Not found: 99. Already completed: 5.`
   - Or individual error lines?

4. **stderr vs stdout**: Should error messages for individual IDs go to stderr, while the summary goes to stdout? Or all to stderr?

5. **Exit code determination order**: The spec says "Exit 0 if at least one succeeded", but what if there's also a database error midway? Should that override the exit 0, or should exit 0 take precedence because partial success occurred?

6. **Transaction atomicity**: The spec mentions `BEGIN IMMEDIATE` for locking, but doesn't clarify: if ID 1 succeeds and ID 2 fails, is ID 1's change committed, or rolled back? The phrase "continue to next ID" suggests partial commits, but this conflicts with transaction atomicity.

An implementer might choose different output formats or transaction boundaries, leading to inconsistent user experience.

**Assessment:**
This is a moderate blocking issue. Batch operations are common, and unclear output/error handling specs will lead to confusing UX and potential data inconsistency.

---

### Issue 7: Project Name Case Sensitivity Not Consistently Specified

**Affected Files:** ["app4/docs/systems/database/schema.md", "app4/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From schema.md (lines 302-312):
```
### Find Project by Name

```sql
SELECT id, name, description, status, created_at, updated_at
FROM projects
WHERE name = ?;
```

Parameters: `(name,)`

**Case Sensitivity:** Project name matching is case-sensitive. "Backend" and "backend" are different projects. This matches the behavior of task title searches which use `LOWER()` for case-insensitive partial matching (line 244), but project lookups require exact case match for consistency with the UNIQUE constraint on projects.name.
```

From interface.md (lines 243):
```
| `--project NAME` | string | - | Filter by project name (case-sensitive exact match) |
```

**What's Missing/Wrong:**

The case sensitivity is specified for project lookups, but not consistently applied across the documentation:

1. **User expectation mismatch**: The spec says task title searches are case-INSENSITIVE (`LOWER()`), but project name searches are case-SENSITIVE. This inconsistency will confuse users. Should there be a note in the interface docs explaining WHY this difference exists?

2. **add command behavior**: When doing `task-cli add "Task" --project backend`, if the database has "Backend" but user types "backend", the command will fail with "Project 'backend' not found". The error message doesn't suggest trying different case. Should it?

3. **project archive command**: The spec says `task-cli project archive NAME` is case-sensitive, but there's no mention of suggesting similar names if case doesn't match. Should there be fuzzy matching or case-insensitive search with a warning?

4. **Label name case sensitivity**: interface.md line 710 says "Label names are case-sensitive", but there's no similar note for projects in the project commands section. Should there be?

5. **list --project filtering**: When filtering with `--project NAME`, the docs say it's case-sensitive exact match. But what if a user has multiple projects with similar names ("Backend", "backend", "BACKEND")? Should the tool warn about potential confusion, or just silently use exact match?

6. **Design rationale clarity**: The schema.md note explains case sensitivity is for "consistency with the UNIQUE constraint", but UNIQUE constraints in SQLite are case-INSENSITIVE by default for TEXT columns (unless COLLATE BINARY is used). So the explanation doesn't match SQLite's actual behavior. Is this a documentation error, or should the schema use COLLATE BINARY?

An implementer might assume case-insensitive matching (based on task search behavior), or might not understand the rationale, leading to implementation errors.

**Assessment:**
This is a minor blocking issue. Case sensitivity is a source of user confusion, and the inconsistent specification will lead to unclear behavior and poor error messages.

---

### Issue 8: Symlink TOCTOU Prevention Implementation Incomplete

**Affected Files:** ["app4/docs/systems/architecture/ARCHITECTURE-simple.md", "app4/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From ARCHITECTURE-simple.md (lines 209-242):
```
**CRITICAL: Symlink TOCTOU Prevention**

Path validation alone is insufficient for write operations. After validation, a symlink could be created before the file is opened, redirecting the write to an unauthorized location (TOCTOU vulnerability).

**For Write Operations (export-csv, init):**
Use `os.open()` with `O_NOFOLLOW` flag to prevent following symlinks atomically:

```python
import os
import errno
from task_cli.exceptions import ValidationError

def safe_create_file(validated_path: str) -> int:
    """Create file atomically without following symlinks.

    Args:
        validated_path: Already-validated absolute path

    Returns: File descriptor
    Raises: ValidationError if symlink exists at path
    """
    try:
        # O_NOFOLLOW: fail if path is a symlink (TOCTOU prevention)
        # O_CREAT | O_EXCL: fail if file already exists
        # O_WRONLY: write-only access
        fd = os.open(validated_path,
                     os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600)
        return fd
    except OSError as e:
        if e.errno == errno.ELOOP:
            raise ValidationError(f"Path '{os.path.basename(validated_path)}' is a symlink")
        raise
```
```

From interface.md (lines 888-903):
```
**Force Flag Behavior:**
- If output file exists: `--force` performs atomic overwrite (see below)
- If output file does not exist: `--force` has no effect; file is created normally using `O_CREAT | O_EXCL | O_NOFOLLOW`
- Without `--force` and file exists: operation fails with error (exit 1)

**Atomic Overwrite with --force (CRITICAL):**
When `--force` is set and file exists, the overwrite MUST be atomic to prevent TOCTOU race conditions:
1. Generate a unique temporary filename in the same directory (e.g., `.output.csv.tmp.{random}`)
2. Create the new CSV at the temporary path using `O_CREAT | O_EXCL | O_NOFOLLOW | 0o644`
3. Write CSV content to the temporary file
4. Use `os.rename()` to atomically replace the original file
5. `os.rename()` is atomic on POSIX systems when source and destination are on the same filesystem

**Rationale:** Simply checking then overwriting leaves a race window where an attacker could create a symlink between check and write, redirecting the CSV export to an unauthorized location (e.g., overwriting ~/.bashrc).
```

**What's Missing/Wrong:**

The TOCTOU prevention approach is specified, but several implementation details are missing or contradictory:

1. **File descriptor to file object conversion**: The `safe_create_file()` function returns a file descriptor (int), but the csv module's `csv.writer()` requires a file object. How should the fd be converted? Should we use `os.fdopen(fd, 'w')`, or `io.open(fd, 'w')`, or something else? What about buffering settings?

2. **Permission mismatch**: `safe_create_file()` uses `0o600` (owner read/write only), but the atomic overwrite section says temp file should use `0o644` (owner read/write, others read). Which is correct for CSV exports? Why the difference?

3. **Temp file cleanup on error**: The atomic overwrite says to create a temp file, write to it, then rename. But what if the write fails midway (disk full, etc.)? The spec doesn't say to clean up the temp file. Should there be a try/finally block?

4. **Temp file naming**: The spec says use `.output.csv.tmp.{random}` pattern. Should this use `tempfile.mkstemp()` for secure random naming, or `uuid.uuid4()`, or something else? What about race conditions in temp file creation?

5. **O_NOFOLLOW on rename target**: The spec says create temp file with `O_NOFOLLOW`, which prevents following symlinks during creation. But `os.rename()` WILL follow symlinks at the destination. If an attacker replaces the original file with a symlink after we create the temp file but before we rename, the rename will follow that symlink. How should this be prevented?

6. **Windows compatibility**: The spec mentions "POSIX systems" and `O_NOFOLLOW`. But Windows doesn't support `O_NOFOLLOW` (it's a no-op). Should there be separate code paths, or a Windows-specific implementation note?

7. **Database file creation**: The schema.md file shows database creation should also use `O_NOFOLLOW`, but it keeps the fd open during `sqlite3.connect()` to prevent replacement. Should CSV export use a similar approach, or is the rename-based approach sufficient?

An implementer might not handle fd-to-file-object conversion correctly, or might leave temp files on error, or might not realize the Windows limitation.

**Assessment:**
This is a moderate blocking issue. TOCTOU prevention is marked CRITICAL in multiple places, but the implementation has gaps that could lead to either security vulnerabilities or non-functional code on Windows.

---

### Issue 9: Timestamp Format Inconsistency Between Spec and Examples

**Affected Files:** ["app4/docs/systems/database/schema.md", "app4/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From schema.md (lines 173-188):
```
## Timestamp Format

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

From interface.md (lines 1037-1040):
```
### Timestamp Formats in JSON Output
- `due_date`: Date only, format `YYYY-MM-DD` (e.g., `"2026-01-25"`)
- `created_at`, `updated_at`, `completed_at`: ISO 8601 timestamp with timezone, format `YYYY-MM-DDTHH:MM:SS.ffffff+00:00` (e.g., `"2026-01-20T10:00:00.000000+00:00"`)
```

From schema.md example data (lines 452-462):
```sql
INSERT INTO projects (name, description, status, created_at, updated_at)
VALUES
    ('backend', 'Backend API development', 'active', '2026-01-15T10:00:00.000000+00:00', '2026-01-15T10:00:00.000000+00:00'),
    ('frontend', 'React UI work', 'active', '2026-01-15T10:00:00.000000+00:00', '2026-01-15T10:00:00.000000+00:00');

INSERT INTO tasks (title, description, status, priority, due_date, project_id, created_at, updated_at, completed_at)
VALUES
    ('Fix login bug', 'Users report intermittent login failures', 'pending', 'high', '2026-01-25', 1, '2026-01-20T10:00:00.000000+00:00', '2026-01-20T10:00:00.000000+00:00', NULL),
    ('Update API docs', NULL, 'pending', 'medium', '2026-01-30', 1, '2026-01-20T11:00:00.000000+00:00', '2026-01-20T11:00:00.000000+00:00', NULL),
    ('Refactor auth module', 'Extract common auth logic', 'completed', 'medium', '2026-01-18', 1, '2026-01-15T09:00:00.000000+00:00', '2026-01-18T16:00:00.000000+00:00', '2026-01-18T16:00:00.000000+00:00'),
    ('Design new dashboard', NULL, 'in_progress', 'high', '2026-01-28', 2, '2026-01-19T14:00:00.000000+00:00', '2026-01-21T09:00:00.000000+00:00', NULL);
```

**What's Missing/Wrong:**

The spec says both `Z` and `+00:00` formats are acceptable, but examples and implementation guidance conflict:

1. **Implementation guidance inconsistency**: schema.md says "Implementations SHOULD output '+00:00' for consistency but MUST accept both on read." But interface.md only shows the `+00:00` format in examples, with no mention of accepting `Z` format. Should parsing code explicitly handle both, or rely on Python's `datetime.fromisoformat()` which handles both?

2. **Microseconds precision**: All examples show 6 decimal places (`.000000`), but Python's `isoformat()` will omit microseconds if they're zero (e.g., `2026-01-21T15:30:45+00:00` without `.000000`). Should the code explicitly format to always include 6 digits, or is variable precision allowed?

3. **Reading both formats**: The spec says "MUST accept both on read", but doesn't specify where. Should the database layer accept both when parsing `created_at` from query results? Or is this only for user input (which shouldn't happen for timestamps)? This requirement seems misplaced since timestamps are generated by the system, not user input.

4. **Timezone handling edge case**: Python's `datetime.now(timezone.utc).isoformat()` produces `+00:00`, but `datetime.utcnow().isoformat()` produces no timezone suffix (naive datetime). Should the code explicitly check that timestamps have timezone info before storing?

5. **String vs datetime storage**: SQLite stores timestamps as TEXT. Should the code store pre-formatted ISO strings, or store datetime objects and let SQLite adapter handle formatting? The schema doc shows string examples but doesn't specify the storage approach.

6. **CSV export format**: The CSV export command doesn't specify timestamp format. Should it use the same ISO format, or a different format for spreadsheet compatibility?

An implementer might produce timestamps without microseconds, or might not handle both Z and +00:00 formats correctly, leading to parsing errors or inconsistent data.

**Assessment:**
This is a minor blocking issue. Timestamp format inconsistency could lead to subtle bugs in data parsing or storage, especially if different parts of the system produce different formats.

---

### Issue 10: Overdue Task Filter Logic Ambiguous

**Affected Files:** ["app4/docs/systems/cli/interface.md", "app4/docs/systems/database/schema.md"]

**Relevant Text From Docs:**

From interface.md (lines 776-796):
```
**Required:**

| Argument | Type | Values | Description |
|----------|------|--------|-------------|
| `PERIOD` | string | today, week, overdue | Time period |

- `today`: Due today (due_date = today)
- `week`: Due within next 7 days inclusive (today <= due_date <= today + 6 days)
- `overdue`: Past due date, not completed (due_date < today AND status != 'completed')

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format FORMAT` | string | table | Output format (table/json) |

**Output (table):**
```
ID | Title            | Priority | Due        | Project
---|------------------|----------|------------|----------
1  | Fix login bug    | high     | 2026-01-21 | backend
```
```

And from line 854:
```
- Overdue: due_date < today AND status NOT IN ('completed', 'archived') - includes both 'pending' and 'in_progress' tasks
```

From schema.md (lines 284-290):
```sql
### Tasks Due in Range

```sql
SELECT id, title, description, status, priority, due_date, project_id, created_at, updated_at, completed_at
FROM tasks
WHERE due_date >= ? AND due_date <= ? AND status NOT IN ('completed', 'archived')
ORDER BY due_date ASC, CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END;
```
```

**What's Missing/Wrong:**

The overdue logic is defined in multiple places with subtle inconsistencies:

1. **Inconsistent status filtering**: Line 783 says `status != 'completed'`, but line 854 says `status NOT IN ('completed', 'archived')`. Which is correct? Should overdue tasks include archived tasks, or exclude them?

2. **Null due_date handling**: What if a task has `due_date = NULL`? The query `due_date < today` will evaluate to NULL (not true, not false) in SQL. Should tasks with no due date be:
   - Excluded from overdue list (never overdue if no deadline)?
   - Included in overdue list (interpret NULL as "should have been done already")?
   - Handled with explicit `AND due_date IS NOT NULL` check?

3. **Time zone edge case**: The spec says "today" is determined by `datetime.date.today()`, which uses local system time. But what if a task has `due_date = "2026-01-21"` and it's currently `2026-01-21T23:59:59` locally but `2026-01-22T00:00:00` in UTC? Is the task overdue or not? The spec says due dates are "date only", but doesn't clarify how timezone differences affect overdue calculation.

4. **Due today vs overdue**: If a task is due today (`due_date = today`), the condition `due_date < today` is false, so it won't appear in overdue list. But should tasks due today appear in overdue list if it's late in the day? Or should "overdue" strictly mean "past due date"?

5. **in_progress tasks**: Line 854 says overdue includes both 'pending' and 'in_progress' tasks. But line 783 uses `status != 'completed'`, which would also include archived. These don't match. Which is the correct requirement?

6. **Completed today**: If a task was due yesterday but completed today, it's not overdue (status = completed). But should historical reports count it as "was overdue at some point"? This isn't specified.

An implementer might make different assumptions about NULL handling or status filtering, leading to inconsistent overdue task lists.

**Assessment:**
This is a moderate blocking issue. "Overdue" is a critical feature for task management, and ambiguous logic will lead to user confusion and potential data quality issues.

---

No further issues found.
