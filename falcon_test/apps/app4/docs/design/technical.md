# Technical Design: Task Manager CLI

## Technology Choices

### Language: Python 3.10+

**Rationale**:
- Target users likely have Python installed (common on macOS/Linux)
- Rich standard library reduces dependencies
- Type hints (3.10+) improve code quality
- Cross-platform without compilation

**Constraint**: Standard library only. No pip dependencies.

### Database: SQLite3

**Rationale**:
- Zero configuration, single file
- Included in Python standard library
- Handles 10,000+ tasks easily
- Supports concurrent reads (single writer)

**Constraint**: Use `sqlite3` module only. No ORM, no SQLAlchemy.

### CLI Framework: argparse

**Rationale**:
- Standard library (no dependencies)
- Sufficient for our command structure
- Well-documented, familiar to Python developers

**Rejected alternatives**:
- Click: External dependency
- Typer: External dependency
- Fire: Magic behavior, harder to control

---

## Architecture Decisions

### AD1: Layered Architecture

```
CLI Layer (cli.py)
    | parses args, routes commands
Command Layer (commands.py)
    | business logic, validation
Database Layer (database.py)
    | SQL queries, connection management
```

**Rationale**: Separation of concerns. CLI parsing separate from business logic separate from data access.

### AD2: No Global State

Each command receives explicit parameters. No module-level database connections or configuration objects.

**Rationale**: Testability, predictability, no hidden coupling.

### AD3: Explicit Error Types

Custom exception hierarchy maps to exit codes:

```python
TaskError (base)
├── ValidationError      -> exit 1
├── DatabaseError        -> exit 2
├── NotFoundError        -> exit 3
└── DuplicateError       -> exit 4
```

**Rationale**: Callers can catch specific errors. Exit codes are predictable.

### AD4: Parameterized Queries Only

**All SQL queries MUST use parameterized placeholders (`?`).**

Never:
```python
cursor.execute(f"SELECT * FROM tasks WHERE title = '{title}'")  # WRONG
```

Always:
```python
cursor.execute("SELECT * FROM tasks WHERE title = ?", (title,))  # RIGHT
```

**Rationale**: Prevents SQL injection. Non-negotiable.

### AD5: Input Validation at Boundary

Validate all user input in the CLI layer before passing to commands:
- Title: non-empty string, max 500 chars
- Description: max 2000 chars
- Priority: must be one of `high`, `medium`, `low`
- Status: must be one of `pending`, `in_progress`, `completed`, `archived`
- Due date: valid ISO date (YYYY-MM-DD)
- Project/label names: non-empty, max 100/50 chars respectively

**Rationale**: Fail fast with clear error messages. Don't let bad data reach database layer.

### AD6: Atomic Database Operations

Each command is a single transaction. Either fully succeeds or fully fails.

**Rationale**: No partial updates. Database always in consistent state.

### AD7: Strict Date Parsing

Due dates must be in ISO format (YYYY-MM-DD). No fuzzy parsing.

**Rationale**: Predictable behavior, no locale issues, scriptable.

### AD8: Date Comparison Timezone

**Decision:** Due date comparisons use the LOCAL system date.

**Rationale:**
- Due dates are user-facing concepts ("due today", "overdue")
- Users think in their local timezone, not UTC
- The CLI runs locally, so local date is appropriate

**Implementation:**
- `due_date` column stores YYYY-MM-DD (date only, no timezone)
- "today" is determined by `datetime.date.today()` (local system date)
- "overdue" means `due_date < date.today()`
- Timestamps (`created_at`, `updated_at`) remain UTC for consistency

**Note:** This means the same task could appear "overdue" or "due today" depending on the user's timezone. This is acceptable for a single-user CLI tool.

---

## Data Model

### Tasks Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| title | TEXT | NOT NULL |
| description | TEXT | nullable |
| status | TEXT | NOT NULL DEFAULT 'pending', CHECK IN ('pending','in_progress','completed','archived') |
| priority | TEXT | NOT NULL DEFAULT 'medium', CHECK IN ('high','medium','low') |
| due_date | TEXT | nullable, ISO 8601 date |
| project_id | INTEGER | nullable, FOREIGN KEY projects(id) |
| created_at | TEXT | NOT NULL, ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL, ISO 8601 timestamp |
| completed_at | TEXT | nullable, ISO 8601 timestamp |

### Projects Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL UNIQUE |
| description | TEXT | nullable |
| status | TEXT | NOT NULL DEFAULT 'active', CHECK IN ('active','archived') |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

### Labels Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL UNIQUE |
| created_at | TEXT | NOT NULL |

### Task_Labels Table (junction)

| Column | Type | Constraints |
|--------|------|-------------|
| task_id | INTEGER | NOT NULL, FOREIGN KEY tasks(id) ON DELETE CASCADE |
| label_id | INTEGER | NOT NULL, FOREIGN KEY labels(id) ON DELETE CASCADE |
| PRIMARY KEY (task_id, label_id) |

**Indexes**:
- `idx_tasks_status` on `tasks(status)`
- `idx_tasks_priority` on `tasks(priority)`
- `idx_tasks_due_date` on `tasks(due_date)`
- `idx_tasks_project_id` on `tasks(project_id)`
- `idx_projects_name` on `projects(name)` (unique)
- `idx_labels_name` on `labels(name)` (unique)

---

## Output Formats

### Table Format (default)

Human-readable, fixed-width columns:
```
ID  | Title            | Priority | Due        | Project
----|------------------|----------|------------|----------
1   | Fix login bug    | high     | 2026-01-25 | backend
3   | Update docs      | low      | -          | -
```

### JSON Format (`--format json`)

Machine-readable, stable schema:
```json
[
  {
    "id": 1,
    "title": "Fix login bug",
    "priority": "high",
    "due_date": "2026-01-25",
    "project": "backend",
    "labels": ["urgent"]
  }
]
```

### CSV Format (export only)

RFC 4180 compliant:
- Comma separator
- Double-quote escaping
- UTF-8 encoding
- Header row included

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

**Integration with Python csv Module:**

The escaping MUST be applied BEFORE passing values to `csv.writer`. The interaction is as follows:

1. **Escaping Order**: Apply `escape_csv_field()` first, then pass result to `csv.writer.writerow()`
   ```python
   import csv
   writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
   row = [escape_csv_field(task.title), escape_csv_field(task.description), ...]
   writer.writerow(row)
   ```

2. **CSV Quoting Mode**: Use `csv.QUOTE_MINIMAL` (default). The csv module will add double-quotes around fields containing commas, newlines, or double-quotes. This happens AFTER our single-quote prefix is added.
   - Input: `"=SUM(A1:A10)"`
   - After escaping: `"'=SUM(A1:A10)"`
   - CSV output: `'=SUM(A1:A10)` (no quotes needed, no special chars)
   - Input: `"=SUM(A1:A10), total"`
   - After escaping: `"'=SUM(A1:A10), total"`
   - CSV output: `"'=SUM(A1:A10), total"` (quoted by csv module due to comma)

3. **Double Escaping Prevention**: The single-quote prefix is NOT subject to CSV quoting rules (it's just a regular character). No double-escaping occurs.

4. **Empty String vs None Handling**:
   - `None` → empty string `""`
   - Empty string `""` → empty string `""`
   - Both produce empty CSV fields

5. **Unicode Handling**: UTF-8 encoding is used. The csv module in Python 3 handles Unicode natively. No special treatment needed for Unicode characters.

6. **Multi-line Field Values**: Fields containing newlines are handled by csv module's quoting:
   - Input: `"First line\nSecond line"`
   - After escaping: `"First line\nSecond line"` (no prefix, doesn't start with dangerous char)
   - CSV output: `"First line\nSecond line"` (quoted by csv module)
   - Input: `"\n=Formula"`
   - After escaping: `"'\n=Formula"` (prefixed because starts with \n)
   - CSV output: `"'\n=Formula"` (quoted by csv module)

7. **Important**: Only check the FIRST character of the field value. If a dangerous character appears later in the string (e.g., `"Hello =SUM()"`), it does NOT need escaping because spreadsheets only interpret formulas at the start of cells.

---

## Performance Targets

| Operation | Target | Max dataset |
|-----------|--------|-------------|
| init | <500ms | n/a |
| add | <50ms | n/a |
| edit | <50ms | n/a |
| list | <100ms | 10,000 tasks |
| due | <100ms | 10,000 tasks |
| report | <200ms | 10,000 tasks |
| export-csv | <3s | 10,000 tasks |

---

## Concurrency

### SQLite Serialization
SQLite uses file-level locking for write operations. The CLI relies on SQLite's built-in serialization:
- **Readers**: Multiple concurrent readers are allowed
- **Writers**: Only one writer at a time; other writers block until lock is released
- **Lock timeout (CRITICAL)**: MUST set `PRAGMA busy_timeout = 5000` (5 seconds) on every connection; operation fails with `SQLITE_BUSY` if lock not acquired within timeout. See database/schema.md Connection Management section.

### Batch Operation Locking (CRITICAL)
Batch operations (done, archive) MUST acquire an exclusive lock before processing to prevent concurrent modifications that could lead to inconsistent state.

**Implementation Requirement:**
- Batch operations MUST be wrapped in a transaction using `BEGIN IMMEDIATE` to acquire an exclusive lock at the start
- This prevents race conditions where concurrent batch operations could interfere with each other
- Example:
  ```python
  # CORRECT - Acquires lock immediately
  conn.execute("BEGIN IMMEDIATE TRANSACTION")
  try:
      for task_id in task_ids:
          # process task
      conn.commit()
  except:
      conn.rollback()
      raise

  # WRONG - May not acquire lock until first write
  for task_id in task_ids:
      # process task - race condition possible
  ```

### Recurring Task Generation Locking (v1.1)
Recurring task generation MUST be idempotent to prevent duplicate task creation when multiple processes run concurrently.

**Implementation Requirement:**
- Use `INSERT OR IGNORE` with a unique constraint on `(parent_recurring_id, scheduled_date)` or equivalent
- Alternatively, use advisory locking or database-level locking before generating recurring tasks
- The system MUST NOT create duplicate recurring task instances even if the generation process runs multiple times

### No Application-Level Retry Logic
The CLI does NOT implement retry logic for concurrent access:
- If a write operation fails due to lock contention, it returns a database error (exit 2)
- Scripts running multiple CLI commands concurrently should handle errors appropriately

### Concurrent Edit Detection (CRITICAL)

**Problem:** Two users could simultaneously read a task, modify it, and write back, with the second write silently overwriting the first user's changes (lost update problem).

**Solution:** Optimistic locking using the `updated_at` timestamp.

**Implementation Requirement:**
1. When reading a task for editing, record its current `updated_at` value
2. When writing the update, include `updated_at` in the WHERE clause:
   ```sql
   UPDATE tasks
   SET title = ?, description = ?, ..., updated_at = ?
   WHERE id = ? AND updated_at = ?
   ```
3. Check `cursor.rowcount` after UPDATE:
   - If 0 rows updated → task was modified by another process
   - Raise ValidationError: "Task {id} was modified by another process. Retry the operation."
   - Exit code: 1
4. If rowcount == 1 → update succeeded

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

**Applies to:**
- `edit` command: MUST use optimistic locking (updated_at check)
- `done` command with single task ID: MUST use optimistic locking (updated_at check)
- Batch operations (done with multiple IDs, archive multiple): Do NOT use optimistic locking; rely on BEGIN IMMEDIATE exclusive lock instead
- Rationale: Batch operations acquire exclusive write lock upfront via BEGIN IMMEDIATE, preventing any concurrent modifications during the batch. Optimistic locking is redundant and would add unnecessary complexity.

### Recommended Usage for Scripts
- Execute commands sequentially, not in parallel
- If parallel execution is required, implement retry logic in the calling script
- The `edit` command may fail with "modified by another process" error if concurrent edits occur
- Example pattern:
  ```bash
  # Sequential (recommended)
  task-cli add "Task 1" && task-cli add "Task 2"

  # Parallel (not recommended - may fail under contention)
  task-cli add "Task 1" &
  task-cli add "Task 2" &
  wait
  ```

---

## Extended Features (v1.1)

> **Note:** The following features (Task Dependencies, Subtask Rules, Recurring Tasks) are part of v1.1 extended schema. They are documented here for future implementation but are NOT part of v1.0 core CLI commands. See `database/schema.md` "Extended Schema (v1.1)" section for database definitions.

## Task Dependencies (v1.1)

### Dependency Cycle Detection (CRITICAL)

Before creating a task dependency, the system MUST perform a cycle check to prevent circular dependencies (e.g., A depends on B depends on C depends on A).

**Implementation Requirement:**
- Use depth-first traversal starting from the target task
- Check if adding the dependency would create a path back to the source task
- If a cycle would be created, the operation MUST fail with an error

**Algorithm:**
```python
from task_cli.database import get_task_dependencies

def would_create_cycle(conn, source_id: int, target_id: int) -> bool:
    """Check if adding dependency source -> target would create a cycle.

    Returns True if target can reach source through existing dependencies.
    """
    visited = set()
    stack = [target_id]

    while stack:
        current = stack.pop()
        if current == source_id:
            return True  # Cycle detected
        if current in visited:
            continue
        visited.add(current)
        # Get all tasks that current depends on
        dependents = get_task_dependencies(conn, current)
        stack.extend(d.id for d in dependents)

    return False
```

**Error Message:**
```
Error: Cannot create dependency: would create circular dependency chain.
```

**Exit Code:** 1 (ValidationError)

---

## Subtask Rules (v1.1)

### Subtask Priority Inheritance

Subtasks have independent priority from parent tasks. This allows fine-grained prioritization within a parent task's work breakdown.

**Rules:**
- Default priority for new subtasks is 'medium' unless explicitly specified via `--priority`
- Changing a parent task's priority does NOT automatically change subtask priorities
- Subtasks can have higher or lower priority than their parent

**Example:**
```bash
# Parent task with high priority
task-cli add "Major feature" --priority high  # ID: 1

# Subtask with default (medium) priority
task-cli subtask add 1 "Research phase"  # Defaults to medium

# Subtask with explicit priority
task-cli subtask add 1 "Critical bugfix" --priority high
```

### Subtask Completion Propagation (CRITICAL)

When marking a parent task as done, the system MUST check for incomplete subtasks.

**Rules:**
1. If any subtasks are incomplete (status != 'completed'), the operation MUST fail
2. Error message MUST list the incomplete subtasks
3. Use `--force` flag to auto-complete all subtasks along with the parent

**Behavior:**
```bash
# Fails if subtasks are incomplete
$ task-cli done 1
Error: Cannot complete task 1: 3 subtasks are incomplete.
  - Subtask 5: "Research phase" (pending)
  - Subtask 6: "Implementation" (in_progress)
  - Subtask 7: "Testing" (pending)
Use --force to auto-complete all subtasks.

# Force-completes parent and all subtasks
$ task-cli done 1 --force
Completed: 1 (and 3 subtasks)
```

**Implementation:**
- Check for incomplete subtasks BEFORE marking parent as done
- With `--force`: mark all incomplete subtasks as completed first, then parent
- Set `completed_at` timestamp for all completed tasks
- This operation MUST be atomic (all or nothing)

**Exit Code (without --force):** 1 (ValidationError)

---

## Security Considerations

1. **SQL Injection**: Mitigated by AD4 (parameterized queries only)
2. **Input Validation**: Dates, priorities, status values strictly validated (AD5, AD7)
3. **Path Traversal**: Validate `--db` and `--output` paths (see ARCHITECTURE-simple.md S3)
4. **Error Message Leakage**: Don't expose SQL errors or file paths in user-facing messages (see ARCHITECTURE-simple.md S4)
5. **File Permissions (CRITICAL)**: Database files MUST be created atomically with 0600 permissions using `os.open()` with `O_CREAT | O_EXCL | O_RDWR` flags. Never create file then chmod (TOCTOU vulnerability). See database/schema.md for implementation.
6. **CSV Injection**: All CSV exports MUST escape fields starting with `=`, `+`, `-`, `@`, tab, carriage return, or newline by prefixing with single quote. See technical.md CSV Format section.
