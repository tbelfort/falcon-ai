# Database Schema: Task Manager CLI

**Status:** [DRAFT]

---

## Database File

- **Engine:** SQLite 3
- **File:** User-specified via `--db` (default: `./tasks.db`)
- **Encoding:** UTF-8
- **Permissions:** MUST be 0600 (owner read/write only)

**File Permission Enforcement (CRITICAL):**
The database file MUST be created with secure permissions atomically to prevent race conditions. Use `os.open()` with explicit flags:

```python
import os
import sqlite3
import errno
from task_cli.exceptions import ValidationError, DatabaseError

def init_database(path: str) -> None:
    """Create database with secure permissions atomically.

    SECURITY: Database file MUST be created with 0600 permissions
    and MUST NOT follow symlinks to prevent:
    1. Unauthorized access to task data
    2. Symlink TOCTOU attacks (redirecting DB to unauthorized location)
    """
    fd = None
    try:
        # Create file with secure permissions atomically
        # O_CREAT | O_EXCL: fail if file already exists
        # O_RDWR: read/write access
        # O_NOFOLLOW: fail if path is a symlink (TOCTOU prevention)
        # 0o600: owner read/write only (MUST be specified atomically)
        fd = os.open(path,
                     os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW,
                     mode=0o600)
        # CRITICAL: Do NOT close fd before sqlite3.connect() - keep file open
        # to prevent TOCTOU race where attacker replaces file with symlink
        # between close() and connect()
    except OSError as e:
        if e.errno == errno.ELOOP:
            raise ValidationError(f"Database path '{os.path.basename(path)}' is a symlink")
        elif e.errno == errno.EEXIST:
            raise ValidationError(f"Database already exists at {os.path.basename(path)}. Use --force to recreate.")
        raise DatabaseError(f"Cannot create database: {e}")

    try:
        # Connect using the file path (file already exists and is secured)
        # The fd is kept open during connect to prevent replacement
        conn = sqlite3.connect(path)
        # ... execute schema creation ...
        conn.close()
    finally:
        # Close the original fd after sqlite connection is established
        if fd is not None:
            os.close(fd)
```

This approach:
1. Creates the file atomically with 0600 permissions (owner read/write only)
2. Uses `O_EXCL` to fail if file already exists
3. Uses `O_NOFOLLOW` to fail if path is a symlink (prevents TOCTOU)
4. Prevents race condition where file is created with default permissions then chmod'd

---

## Schema Definition

```sql
-- Projects table: task containers
CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL UNIQUE,
    description     TEXT,
    status          TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);

-- Tasks table: core task data
CREATE TABLE IF NOT EXISTS tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT    NOT NULL,
    description     TEXT,
    status          TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'archived')),
    priority        TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    due_date        TEXT,
    project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    completed_at    TEXT
);

-- Labels table: tag definitions
CREATE TABLE IF NOT EXISTS labels (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL UNIQUE,
    created_at      TEXT    NOT NULL
);

-- Task-Label junction table (many-to-many)
CREATE TABLE IF NOT EXISTS task_labels (
    task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id        INTEGER NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

-- Note: idx_projects_name and idx_labels_name are implicitly created by SQLite
-- due to the UNIQUE constraint on projects.name and labels.name columns.
-- These provide O(log n) lookups for project/label name queries.
```

---

## Column Specifications

### tasks table

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `title` | TEXT | No | - | - | Max 500 chars (app-enforced) |
| `description` | TEXT | Yes | NULL | - | Max 2000 chars (app-enforced) |
| `status` | TEXT | No | 'pending' | CHECK IN values | Enumerated |
| `priority` | TEXT | No | 'medium' | CHECK IN values | Enumerated |
| `due_date` | TEXT | Yes | NULL | - | ISO 8601 date (YYYY-MM-DD) |
| `project_id` | INTEGER | Yes | NULL | FOREIGN KEY | ON DELETE SET NULL |
| `created_at` | TEXT | No | - | - | ISO 8601 timestamp |
| `updated_at` | TEXT | No | - | - | ISO 8601 timestamp |
| `completed_at` | TEXT | Yes | NULL | - | Set when status -> completed |

### projects table

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `name` | TEXT | No | - | UNIQUE | Max 100 chars (app-enforced) |
| `description` | TEXT | Yes | NULL | - | Max 500 chars (app-enforced) |
| `status` | TEXT | No | 'active' | CHECK IN values | active/archived |
| `created_at` | TEXT | No | - | - | ISO 8601 timestamp |
| `updated_at` | TEXT | No | - | - | ISO 8601 timestamp |

### labels table

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `name` | TEXT | No | - | UNIQUE | Max 50 chars (app-enforced) |
| `created_at` | TEXT | No | - | - | ISO 8601 timestamp |

### task_labels table

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `task_id` | INTEGER | No | - | FK, CASCADE | Deletes with task |
| `label_id` | INTEGER | No | - | FK, CASCADE | Deletes with label |
| PRIMARY KEY | - | - | - | (task_id, label_id) | Composite |

---

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

---

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

---

## Query Patterns

### Insert Task

```sql
INSERT INTO tasks (title, description, status, priority, due_date, project_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);
```

Parameters: `(title, description, status, priority, due_date, project_id, created_at, updated_at)`

Returns: `cursor.lastrowid` for the new task ID

### Update Task

**With Optimistic Locking (CRITICAL):**
To prevent lost updates from concurrent edits, include `updated_at` in WHERE clause:

```sql
UPDATE tasks
SET title = ?, description = ?, status = ?, priority = ?, due_date = ?, project_id = ?, updated_at = ?, completed_at = ?
WHERE id = ? AND updated_at = ?;
```

Parameters: `(title, description, status, priority, due_date, project_id, new_updated_at, completed_at, id, original_updated_at)`

**Critical:** After executing UPDATE, check `cursor.rowcount`:
- If 0: Task was modified by another process (raise ValidationError)
- If 1: Update succeeded

See technical.md "Concurrent Edit Detection" section for full implementation.

### Find Task by ID

```sql
SELECT id, title, description, status, priority, due_date, project_id, created_at, updated_at, completed_at
FROM tasks
WHERE id = ?;
```

Parameters: `(id,)`

### Search Tasks (combined criteria)

Build query dynamically to combine filters:

```python
query = """
SELECT id, title, description, status, priority, due_date, project_id, created_at, updated_at, completed_at
FROM tasks
WHERE 1=1
"""
params = []
if status:
    query += " AND status = ?"
    params.append(status)
if priority:
    query += " AND priority = ?"
    params.append(priority)
if project_id:
    query += " AND project_id = ?"
    params.append(project_id)
if search:
    query += " AND LOWER(title) LIKE LOWER(?) ESCAPE '\\'"
    # SECURITY: Escape LIKE wildcards (% and _) to prevent pattern injection
    # User input like "50%" should match literal "50%", not "50" followed by anything
    escaped_search = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    params.append(f"%{escaped_search}%")
if overdue:
    query += " AND due_date IS NOT NULL AND due_date < ? AND status NOT IN ('completed', 'archived')"
    params.append(today)
query += " ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, due_date ASC NULLS LAST, created_at DESC"
```

### Search Tasks with Project Name (for CSV export)

When exporting tasks with project names (e.g., for CSV), use a JOIN to include project name:

```sql
SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date,
       t.project_id, p.name as project_name, t.created_at, t.updated_at, t.completed_at
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE 1=1
-- (additional filters as needed)
ORDER BY t.id;
```

This pattern is used by the `export-csv` command to populate the `project` column with the project name rather than just the ID.

### Tasks Due in Range

```sql
SELECT id, title, description, status, priority, due_date, project_id, created_at, updated_at, completed_at
FROM tasks
WHERE due_date IS NOT NULL AND due_date >= ? AND due_date <= ? AND status NOT IN ('completed', 'archived')
ORDER BY due_date ASC, CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END;
```

Parameters: `(start_date, end_date)`

**CRITICAL - NULL due_date Handling:**
All due date range queries MUST explicitly check `due_date IS NOT NULL` to exclude tasks without due dates. Tasks with NULL due_date are not "due" on any date and should not appear in due date filters.

### Insert Project

```sql
INSERT INTO projects (name, description, status, created_at, updated_at)
VALUES (?, ?, ?, ?, ?);
```

Parameters: `(name, description, 'active', created_at, updated_at)`

### Find Project by Name

```sql
SELECT id, name, description, status, created_at, updated_at
FROM projects
WHERE name = ?;
```

Parameters: `(name,)`

**Case Sensitivity:** Project name matching is case-sensitive. "Backend" and "backend" are different projects. This matches the behavior of task title searches which use `LOWER()` for case-insensitive partial matching (line 244), but project lookups require exact case match for consistency with the UNIQUE constraint on projects.name.

### List Projects

```sql
-- Active projects only
SELECT id, name, description, status, created_at, updated_at
FROM projects
WHERE status = 'active'
ORDER BY name;

-- All projects including archived
SELECT id, name, description, status, created_at, updated_at
FROM projects
ORDER BY status, name;
```

### Archive Project

```sql
UPDATE projects
SET status = 'archived', updated_at = ?
WHERE name = ?;
```

Parameters: `(updated_at, name)`

**Foreign Key Behavior:**
- Archiving a project does NOT affect its tasks (project_id remains set)
- Tasks in archived projects remain visible in queries but cannot be modified (see cli/interface.md Archived Project Rules)
- If a project is deleted (not archived), tasks.project_id is SET NULL per ON DELETE SET NULL constraint (line 81)
- Note: v1.0 CLI does not expose project deletion; only archival is supported

### Insert Label

```sql
INSERT INTO labels (name, created_at)
VALUES (?, ?);
```

Parameters: `(name, created_at)`

### Find Label by Name

```sql
SELECT id, name, created_at
FROM labels
WHERE name = ?;
```

Parameters: `(name,)`

### Add Label to Task

```sql
INSERT OR IGNORE INTO task_labels (task_id, label_id)
VALUES (?, ?);
```

Parameters: `(task_id, label_id)`

### Remove Label from Task

```sql
DELETE FROM task_labels
WHERE task_id = ? AND label_id = ?;
```

Parameters: `(task_id, label_id)`

### Get Labels for Task

```sql
SELECT l.id, l.name, l.created_at
FROM labels l
JOIN task_labels tl ON l.id = tl.label_id
WHERE tl.task_id = ?;
```

Parameters: `(task_id,)`

### Get Tasks with Label

```sql
SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.project_id, t.created_at, t.updated_at, t.completed_at
FROM tasks t
JOIN task_labels tl ON t.id = tl.task_id
JOIN labels l ON tl.label_id = l.id
WHERE l.name = ?;
```

Parameters: `(label_name,)`

### List All Labels with Task Counts

```sql
SELECT l.name, COUNT(tl.task_id) as task_count
FROM labels l
LEFT JOIN task_labels tl ON l.id = tl.label_id
GROUP BY l.id
ORDER BY l.name;
```

> **Note**: DELETE operations are intentionally omitted from these query patterns.
> The Task Manager CLI uses an archive-only lifecycle for tasks. Labels may be removed
> from tasks (via `task_labels` junction table deletion), but the `labels` table
> itself does not support deletion via CLI. If internal cleanup is needed in the future,
> use: `DELETE FROM labels WHERE id = ?;`

### Statistics Queries

**CRITICAL:** All report statistics MUST exclude archived tasks per interface.md line 793.

```sql
-- Completed in period (exclude archived)
SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND completed_at >= ? AND completed_at < ?;

-- Created in period (exclude archived)
SELECT COUNT(*) FROM tasks WHERE created_at >= ? AND created_at < ? AND status != 'archived';

-- Currently pending (exclude archived - already filtered by status = 'pending')
SELECT COUNT(*) FROM tasks WHERE status = 'pending';

-- Currently overdue (exclude archived, exclude NULL due_date)
SELECT COUNT(*) FROM tasks WHERE due_date IS NOT NULL AND due_date < ? AND status NOT IN ('completed', 'archived');

-- By priority (pending only, archived already excluded by status filter)
SELECT priority, COUNT(*) FROM tasks WHERE status = 'pending' GROUP BY priority;

-- By project (pending only, archived already excluded by status filter)
SELECT p.name, COUNT(*) FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.status = 'pending'
GROUP BY t.project_id;
```

---

## Example Data

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

INSERT INTO labels (name, created_at)
VALUES
    ('urgent', '2026-01-15T10:00:00.000000+00:00'),
    ('bug', '2026-01-15T10:00:00.000000+00:00'),
    ('feature', '2026-01-15T10:00:00.000000+00:00');

INSERT INTO task_labels (task_id, label_id)
VALUES
    (1, 1),  -- Fix login bug -> urgent
    (1, 2);  -- Fix login bug -> bug
```

---

## Extended Schema (v1.1)

The following tables support subtasks, dependencies, and recurring tasks.

### Subtasks

Subtasks are implemented via a self-referential `parent_id` column on the tasks table:

```sql
-- Add parent_id to tasks table for subtask support
ALTER TABLE tasks ADD COLUMN parent_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE;

-- Index for efficient subtask queries
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
```

**Subtask Rules:**
- Subtasks have independent priority from parent (default: 'medium')
- Subtasks inherit project_id from parent if not specified
- Deleting a parent task cascades to all subtasks
- Maximum nesting depth: 1 level (subtasks cannot have subtasks)

### Task Dependencies

```sql
-- Task dependencies table (task A depends on task B)
CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    created_at      TEXT    NOT NULL,
    PRIMARY KEY (task_id, depends_on_id),
    CHECK (task_id != depends_on_id)  -- Cannot depend on self
);

CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends ON task_dependencies(depends_on_id);
```

**Dependency Rules (CRITICAL):**
- Before creating a dependency, MUST check for cycles using depth-first traversal
- If adding dependency would create a cycle, operation MUST fail
- Deleting a task removes it from all dependency chains

### Recurring Tasks

```sql
-- Recurring task definitions
CREATE TABLE IF NOT EXISTS recurring_tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_template_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    recurrence_rule TEXT    NOT NULL,  -- iCalendar RRULE format
    next_due_date   TEXT,              -- Next scheduled occurrence
    last_generated  TEXT,              -- Last generated instance date
    is_active       BOOLEAN NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);

-- Generated recurring task instances (for idempotency)
CREATE TABLE IF NOT EXISTS recurring_task_instances (
    recurring_task_id INTEGER NOT NULL REFERENCES recurring_tasks(id) ON DELETE CASCADE,
    scheduled_date    TEXT    NOT NULL,
    generated_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    created_at        TEXT    NOT NULL,
    PRIMARY KEY (recurring_task_id, scheduled_date)  -- Ensures idempotency
);

CREATE INDEX IF NOT EXISTS idx_recurring_next_due ON recurring_tasks(next_due_date) WHERE is_active = 1;
```

**Recurring Task Rules (CRITICAL):**
- Generation MUST be idempotent using `INSERT OR IGNORE` with unique constraint on `(recurring_task_id, scheduled_date)`
- Use `BEGIN IMMEDIATE TRANSACTION` when generating to prevent race conditions
- Generated tasks copy from template but are independent entities

---

## Migration Strategy

This is version 1 with all core tables. Future versions may add:
- Subtasks table (parent_id reference) - Added in v1.1
- Task dependencies table - Added in v1.1
- Recurring tasks tables - Added in v1.1
- Comments table
- Attachments table

**Migration approach:**
1. Check for table existence before CREATE
2. Use `IF NOT EXISTS` on all CREATE statements
3. No ALTER TABLE in v1 (schema is fixed)

---

## Connection Management

```python
import sqlite3
from contextlib import contextmanager
from typing import Generator
from task_cli.exceptions import DatabaseError

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

**Rules:**
- Always use context manager (ensures close)
- Always enable foreign keys
- Always set busy_timeout (handles concurrent access)
- Always commit or rollback (no implicit transactions)
- Set `row_factory = sqlite3.Row` for named column access

**Busy Timeout (CRITICAL):**
The `busy_timeout` PRAGMA MUST be set to 5000 milliseconds (5 seconds) on every connection. This allows the CLI to wait for locks to be released instead of immediately failing with `SQLITE_BUSY`. Without this setting, concurrent CLI invocations will fail unpredictably under contention.

### Connection Error Handling

**Exception Mapping:**

| SQLite Error | Condition | Exception Type | User Message |
|--------------|-----------|----------------|--------------|
| `sqlite3.OperationalError` "unable to open database" | File not found, invalid path | `DatabaseError` | Cannot open database '{filename}': File not found. |
| `sqlite3.OperationalError` "readonly database" | Permission denied on write | `DatabaseError` | Cannot write to '{filename}': Permission denied. |
| `sqlite3.OperationalError` "database disk image is malformed" | Database corruption | `DatabaseError` | Database '{filename}' is corrupted. Restore from backup or recreate with --force. |
| `sqlite3.OperationalError` "disk I/O error" | Disk failure, filesystem corruption | `DatabaseError` | Database '{filename}' is corrupted. Restore from backup or recreate with --force. |
| `sqlite3.OperationalError` "database is locked" | SQLITE_BUSY after timeout | `DatabaseError` | Database is locked by another process. Try again in a moment. |
| PRAGMA execution failure | Invalid database state | `DatabaseError` | Database initialization failed: {error} |
| Other connection failures | Unknown error | `DatabaseError` | Cannot connect to database: {error} |

**CRITICAL - NULL due_date Handling:**
Tasks with NULL due_date are NOT considered overdue. Overdue filtering MUST use `due_date IS NOT NULL AND due_date < today` to exclude NULL values.

**CRITICAL - Filename Privacy:**
All error messages MUST use `os.path.basename(db_path)` instead of full path to prevent exposing user directory structure (see ARCHITECTURE-simple.md S4).
