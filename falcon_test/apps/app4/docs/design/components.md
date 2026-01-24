# Components: Task Manager CLI

## Module Overview

```
task_cli/
├── __init__.py          # Package marker, version
├── __main__.py          # Entry point: python -m task_cli
├── cli.py               # Argument parsing, command routing
├── commands.py          # Business logic for each command
├── database.py          # Database connection, queries
├── models.py            # Data classes, validation
├── formatters.py        # Output formatting (table, JSON, CSV)
└── exceptions.py        # Custom exception hierarchy
```

---

## Component Details

### `__init__.py`

**Purpose**: Package marker and version constant

**Contents**:
```python
__version__ = "0.1.0"
```

**Dependencies**: None

---

### `__main__.py`

**Purpose**: Entry point for `python -m task_cli`

**Contents**:
```python
from task_cli.cli import main
main()
```

**Dependencies**: `cli`

---

### `cli.py`

**Purpose**: Parse command-line arguments, route to command handlers

**Responsibilities**:
1. Define argument parser with subcommands
2. Validate input at boundary (before passing to commands)
3. Map exceptions to exit codes
4. Handle `--verbose` flag for debug output

**Public interface**:
- `main()` - entry point, parses args, calls commands

**Parser Structure:**
The argument parser MUST be structured as follows:
1. **Root parser**: Create with `argparse.ArgumentParser(description="...", prog="task")`
2. **Global options**: Add directly to root parser BEFORE creating subparsers:
   - `--db PATH` (default: `~/.task/tasks.db`)
   - `--verbose` (action: store_true)
   - `--version` (action: version)
3. **Subparsers**: Create with `add_subparsers(dest="command", required=True)`
4. **Command subparsers**: Each subcommand (init, add, edit, list, etc.) is added with `subparsers.add_parser(name, help="...")`
5. **Command-specific arguments**: Added to individual subparsers
6. **Routing**: After `args = parser.parse_args()`, use `args.command` to dispatch to corresponding `cmd_*` function in commands.py
7. **Nested subcommands**: For project/label groups, create intermediate subparsers with their own `dest` attributes (e.g., `dest="project_action"`)

**Example structure**:
```python
parser = ArgumentParser(description="Task Manager CLI")
parser.add_argument("--db", default="~/.task/tasks.db")
parser.add_argument("--verbose", action="store_true")
subparsers = parser.add_subparsers(dest="command", required=True)

# Simple command
add_parser = subparsers.add_parser("add", help="Add task")
add_parser.add_argument("title", help="Task title")

# Nested subcommands (project group)
project_parser = subparsers.add_parser("project", help="Manage projects")
project_subs = project_parser.add_subparsers(dest="project_action", required=True)
proj_add = project_subs.add_parser("add", help="Add project")
```

**Dependencies**: `commands`, `exceptions`, `formatters`

**MUST NOT**:
- Access database directly
- Import `sqlite3`
- Contain business logic
- Format output (delegate to formatters)

---

### `commands.py`

**Purpose**: Business logic for each CLI command

**Responsibilities**:
1. Implement each command as a function
2. Coordinate between database and formatters
3. Enforce business rules (e.g., task must be completed before archiving)

**Public interface**:
- `cmd_init(db_path: str, force: bool) -> None`
- `cmd_add(db_path: str, title: str, description: str | None, priority: str, due_date: str | None, project: str | None, status: str) -> int`
- `cmd_edit(db_path: str, task_id: int, title: str | None, description: str | None, priority: str | None, due_date: str | None, project: str | None, status: str | None) -> None`
- `cmd_list(db_path: str, filters: dict) -> list[Task]`
- `cmd_show(db_path: str, task_id: int) -> Task`
- `cmd_done(db_path: str, task_ids: list[int]) -> list[Task]`
- `cmd_archive(db_path: str, task_ids: list[int], all_completed: bool = False) -> list[Task]`
- `cmd_project_add(db_path: str, name: str, description: str | None) -> int`
- `cmd_project_list(db_path: str, include_archived: bool) -> list[Project]`
- `cmd_project_archive(db_path: str, name: str) -> None`
- `cmd_project_unarchive(db_path: str, name: str) -> None`
- `cmd_label_add(db_path: str, task_id: int, label_name: str) -> None`
- `cmd_label_remove(db_path: str, task_id: int, label_name: str) -> None`
- `cmd_label_list(db_path: str) -> list[dict]`
- `cmd_due(db_path: str, period: str) -> list[Task]`
- `cmd_report(db_path: str, period: str) -> ReportStats`
- `cmd_export_csv(db_path: str, output: str, filters: dict, force: bool) -> int`

**Archived Project Enforcement:**
The business rules for archived projects (defined in interface.md) MUST be enforced as follows:

1. **Check location**: In `cmd_add()` and `cmd_edit()`, AFTER resolving project name to project_id, but BEFORE database operations
2. **Implementation sequence**:
   ```python
   # In cmd_add() and cmd_edit()
   if project_name:
       project = database.find_project_by_name(conn, project_name)
       if not project:
           raise NotFoundError(f"Project '{project_name}' not found")
       if project.status == "archived":
           raise ValidationError(f"Cannot add tasks to archived project '{project_name}'")
       project_id = project.id
   ```
3. **Exception for done/archive**: The `cmd_done()` and `cmd_archive()` functions MUST NOT check project archived status (they operate on existing tasks only)
4. **Error messages**: Use exact messages from interface.md:
   - Add: `"Cannot add tasks to archived project '{project_name}'"`
   - Edit: `"Cannot move task to archived project '{project_name}'"`
5. **Race conditions**: Handled by transaction isolation (connection context manager in database.py commits atomically)
6. **Performance**: Single additional SELECT query per add/edit operation when project is specified (acceptable overhead)

**Filter Parameter Validation:** When filters contain numeric values (task_id, project_id, label_id), the following edge cases MUST be handled:
- Negative values: Raise ValidationError (IDs must be positive)
- Zero values: Raise ValidationError (IDs start at 1)
- Very large numbers exceeding SQLite INTEGER max (9,223,372,036,854,775,807): Raise ValidationError
- Non-numeric strings: Raise ValidationError with clear message
- This validation applies to all search/filter functions that accept ID parameters

**Dependencies**: `database`, `models`, `exceptions`

**MUST NOT**:
- Parse CLI arguments
- Print to stdout/stderr (return data only)
- Handle exit codes
- Catch exceptions (let them propagate)

---

### `database.py`

**Purpose**: Database connection and SQL operations

**Responsibilities**:
1. Create/connect to SQLite database
2. Run schema migrations (create tables)
3. Execute parameterized queries
4. Handle transactions

**Public interface**:
- `init_database(path: str) -> None` - Creates database file and runs schema creation. Idempotent.
- `get_connection(path: str) -> ContextManager[sqlite3.Connection]` - Context manager that yields connection, commits on success, rollbacks on exception, always closes.
- `insert_task(conn, task: Task) -> int`
- `update_task(conn, task: Task) -> None`
- `find_task_by_id(conn, task_id: int) -> Task | None`
- `search_tasks(conn, filters: dict) -> list[Task]`
- `get_tasks_due(conn, start_date: str, end_date: str) -> list[Task]`
- `insert_project(conn, project: Project) -> int`
- `find_project_by_name(conn, name: str) -> Project | None`
- `find_project_by_id(conn, project_id: int) -> Project | None`
- `list_projects(conn, include_archived: bool) -> list[Project]`
- `update_project(conn, project: Project) -> None`
- `insert_label(conn, name: str) -> int`
- `find_label_by_name(conn, name: str) -> Label | None`
- `add_task_label(conn, task_id: int, label_id: int) -> None`
- `remove_task_label(conn, task_id: int, label_id: int) -> None`
- `get_task_labels(conn, task_id: int) -> list[Label]`
- `get_tasks_by_label(conn, label_name: str) -> list[Task]`
- `get_all_labels_with_counts(conn) -> list[dict]`
- `get_stats(conn, start_date: str, end_date: str) -> dict`
- `get_all_tasks(conn, filters: dict) -> list[Task]`

**Dependencies**: `models`, `exceptions`

**MUST NOT**:
- Validate business rules
- Format output
- Use string interpolation in queries (SECURITY CRITICAL)

**Critical constraint**: ALL queries use parameterized placeholders (`?`). No string interpolation.

---

### `models.py`

**Purpose**: Data classes and validation logic

**Responsibilities**:
1. Define dataclasses for all entities
2. Validate field constraints

**Public interface**:
```python
from dataclasses import dataclass, field

@dataclass
class Task:
    id: int | None
    title: str
    description: str | None
    status: str
    priority: str
    due_date: str | None
    project_id: int | None
    created_at: str
    updated_at: str
    completed_at: str | None = None
    project_name: str | None = None  # Populated during query with JOIN
    labels: list[str] = field(default_factory=list)  # populated separately

@dataclass
class Project:
    id: int | None
    name: str
    description: str | None
    status: str
    created_at: str
    updated_at: str

@dataclass
class Label:
    id: int | None
    name: str
    created_at: str

@dataclass
class ReportStats:
    period_start: str
    period_end: str
    total_completed: int
    total_created: int
    total_pending: int
    total_overdue: int
    by_priority: dict[str, int]
    by_project: dict[str, int]

# Validation functions
def validate_title(title: str) -> str  # raises ValidationError; max 500 chars
def validate_description(desc: str | None) -> str | None  # max 2000 chars for task descriptions
def validate_priority(priority: str) -> str
def validate_status(status: str) -> str
def validate_due_date(due_date: str | None) -> str | None
def validate_project_name(name: str) -> str  # non-empty, max 100 chars
def validate_project_description(desc: str | None) -> str | None  # max 500 chars
def validate_label_name(name: str) -> str  # 1-50 chars, pattern ^[A-Za-z0-9_-]+$ (alphanumeric, underscore, hyphen only)
def validate_path(path: str, allowed_base: str | None = None) -> str  # Validates no ".." traversal, resolves symlinks, checks within allowed_base; see ARCHITECTURE-simple.md S3
def validate_task_id(task_id_str: str) -> int  # CRITICAL: validates bounds (1 to 9,223,372,036,854,775,807) and format; MUST be called for ALL task ID inputs
```

**Dependencies**: `exceptions`

**MUST NOT**:
- Access database
- Format output

---

### `formatters.py`

**Purpose**: Format data for output (table, JSON, CSV)

**Responsibilities**:
1. Format task lists as ASCII tables
2. Format task lists as JSON
3. Write task lists to CSV files
4. Format project lists
5. Format report statistics

**Public interface**:
- `format_task_table(tasks: list[Task]) -> str`
- `format_task_json(tasks: list[Task]) -> str`
- `format_task_detail(task: Task) -> str`
- `format_project_table(projects: list[Project]) -> str`
- `format_project_json(projects: list[Project]) -> str`
- `format_label_table(labels: list[dict]) -> str`
- `format_label_json(labels: list[dict]) -> str`
- `format_report(stats: ReportStats) -> str`
- `format_report_json(stats: ReportStats) -> str`
- `write_csv(tasks: list[Task], path: str) -> None`

**Dependencies**: `models`

**MUST NOT**:
- Access database
- Validate input

**CSV Injection Prevention (CRITICAL):**
The `write_csv()` function MUST escape all field values to prevent formula injection attacks. Implementation requirements:

1. **Escaping function**: Create `escape_csv_field(value: str | None) -> str | None` that:
   - Returns None unchanged (for optional fields)
   - Returns empty string unchanged
   - If value starts with `=`, `+`, `-`, `@`, `\t`, `\r`, or `\n`: prefix with single quote `'`
   - Otherwise returns value unchanged

2. **CSV module interaction**: Use Python's csv.writer with the following configuration:
   - Quoting mode: `csv.QUOTE_MINIMAL` (default)
   - Call `escape_csv_field()` on ALL field values BEFORE passing rows to csv.writer
   - The csv module will then handle additional quoting if fields contain delimiters/quotes

3. **Processing order**:
   ```python
   # Step 1: Apply injection escaping
   escaped_value = escape_csv_field(task.title)
   # Step 2: Pass to csv.writer (it handles delimiter quoting)
   writer.writerow([escaped_value, ...])
   ```

4. **Edge cases**:
   - Empty strings: No escaping needed (not vulnerable)
   - None values: Return None (caller handles as empty field)
   - Unicode characters: No special handling (pass through)
   - Multi-line values: Only escape if FIRST character is dangerous; newlines elsewhere are safe and handled by csv module's quoting
   - Already-quoted values: Still apply escaping (no detection needed; defensive approach)

This two-layer approach ensures: (1) injection prevention via quote prefix, (2) proper CSV formatting via csv.QUOTE_MINIMAL. See technical.md "CSV Format" section for detailed implementation.

---

### `exceptions.py`

**Purpose**: Custom exception hierarchy

**Contents**:
```python
class TaskError(Exception):
    """Base exception for task CLI."""
    exit_code: int = 1

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)

class ValidationError(TaskError):
    """Invalid input data."""
    exit_code = 1

class DatabaseError(TaskError):
    """Database operation failed."""
    exit_code = 2

class NotFoundError(TaskError):
    """Requested item does not exist."""
    exit_code = 3

class DuplicateError(TaskError):
    """Item with this identifier already exists."""
    exit_code = 4
```

**Dependencies**: None

---

## Dependency Graph

```
cli.py
  ├── commands.py
  │     ├── database.py
  │     │     ├── models.py
  │     │     └── exceptions.py
  │     ├── models.py
  │     └── exceptions.py
  ├── formatters.py
  │     └── models.py
  └── exceptions.py
```

**Rule**: No circular dependencies. Lower layers don't import from higher layers.
