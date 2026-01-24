# App4: Task Manager CLI - Implementation Plan

This document specifies exactly what needs to be created for app4, following the same structure as app1 (Warehouse Inventory CLI).

---

## 1. App Overview

**Name:** Task Manager CLI (`task-cli`)

**Purpose:** A pip-installable command-line tool for managing personal tasks and projects with priorities, due dates, and labels. Designed for individual developers using GTD-style workflows.

**Target User:** Alex, a software developer who needs to track tasks across multiple projects without switching to heavy project management tools. Works offline frequently (commute, travel), wants shell-scriptable task management for integration with other tools.

**Key Features:**
- Create and manage tasks with priorities (high/medium/low) and due dates
- Organize tasks into projects
- Tag tasks with multiple labels (many-to-many relationship)
- Filter tasks by status, project, priority, due date range
- Export data to CSV for reporting
- Productivity statistics (completed today/week, overdue count)

**Non-Goals:**
- Multi-user/team collaboration
- Cloud sync or web interface
- Time tracking
- Recurring tasks
- Calendar integration
- Notifications

**Success Criteria:**
1. User can go from `pip install` to tracking tasks in under 3 minutes
2. All commands complete in <100ms for databases up to 10,000 tasks
3. Works fully offline after install
4. Shell scripts can parse output reliably (stable JSON schema)

---

## 2. Directory Structure

```
app4/
├── docs/
│   ├── design/
│   │   ├── INDEX.md              # Navigation and document map
│   │   ├── vision.md             # Problem, user, solution, non-goals
│   │   ├── use-cases.md          # 7 detailed usage scenarios
│   │   ├── technical.md          # Tech choices, AD1-AD7, data model
│   │   └── components.md         # Module breakdown, interfaces
│   └── systems/
│       ├── architecture/
│       │   └── ARCHITECTURE-simple.md   # Layer diagram, rules, security
│       ├── database/
│       │   └── schema.md         # Schema, column specs, query patterns
│       ├── cli/
│       │   └── interface.md      # All commands with full specs
│       └── errors.md             # Exit codes, exceptions, messages
├── tasks/
│   ├── task1.md                  # Data Layer
│   ├── task2.md                  # CLI Framework + Init
│   ├── task3.md                  # Core Commands + Formatters
│   └── task4.md                  # Advanced Features
└── task_cli/                     # (created during implementation)
    ├── __init__.py
    ├── __main__.py
    ├── cli.py
    ├── commands.py
    ├── database.py
    ├── models.py
    ├── formatters.py
    └── exceptions.py
```

---

## 3. Design Docs Outline

### 3.1 docs/design/INDEX.md

**Purpose:** Navigation hub for all documentation.

**Required Sections:**

#### Document Map Table
| Document | Purpose | Read When |
|----------|---------|-----------|
| `vision.md` | Why we're building this | Always (provides context) |
| `use-cases.md` | How the tool is used | Any user-facing change |
| `technical.md` | Architecture decisions | Any structural change |
| `components.md` | Module breakdown | Implementation work |

#### Systems Documentation Table
| Document | Purpose | Read When |
|----------|---------|-----------|
| `systems/architecture/ARCHITECTURE-simple.md` | Layer rules, data flow | Always |
| `systems/database/schema.md` | SQLite schema, queries | Database work |
| `systems/cli/interface.md` | Command specifications | CLI work |
| `systems/errors.md` | Exception handling | Error handling work |

#### Component Mapping Table
| Component | Design Doc | Systems Doc |
|-----------|------------|-------------|
| `cli.py` | `components.md` | `cli/interface.md`, `errors.md` |
| `commands.py` | `components.md` | `architecture/ARCHITECTURE-simple.md` |
| `database.py` | `technical.md`, `components.md` | `database/schema.md` |
| `models.py` | `components.md` | `database/schema.md` |
| `formatters.py` | `components.md` | `cli/interface.md` |
| `exceptions.py` | `technical.md`, `components.md` | `errors.md` |

#### Architecture Decisions Table
| ID | Decision | Impact |
|----|----------|--------|
| AD1 | Layered architecture | Module structure |
| AD2 | No global state | All modules |
| AD3 | Explicit error types | `exceptions.py`, `cli.py` |
| AD4 | Parameterized queries only | `database.py` |
| AD5 | Input validation at boundary | `cli.py` |
| AD6 | Atomic database operations | `database.py`, `commands.py` |
| AD7 | Strict date parsing | `models.py`, `cli.py` |

#### Security Considerations
1. **SQL Injection Prevention** - reference AD4, S1
2. **Input Validation** - reference AD5, AD7, S2
3. **Error Message Sanitization** - reference S3

---

### 3.2 docs/design/vision.md

**Purpose:** Define problem space and solution boundaries.

**Required Sections:**

#### Problem Statement
Individual developers need task management that:
- Works offline (no cloud dependency)
- Integrates with shell workflows (scriptable)
- Doesn't require a GUI or browser
- Handles project organization without enterprise overhead

#### Target User
**Alex, the solo developer:**
- Manages tasks across 3-5 active projects
- Uses terminal for most work
- Wants to script task creation from git hooks, CI failures, etc.
- Needs quick "what's due today" checks
- Works offline frequently

#### Solution
A pip-installable CLI tool that:
1. Stores tasks in a local SQLite database (no server required)
2. Provides commands for task lifecycle (add, edit, complete, archive)
3. Supports project grouping and label tagging
4. Outputs machine-readable formats (JSON, CSV) for scripting
5. Runs on any system with Python 3.10+ (no external dependencies)

#### Non-Goals (explicit exclusions)
- **Multi-user access**: Single-user only. No auth, no concurrent writes.
- **Cloud sync**: No sync, no mobile app, no web interface.
- **Time tracking**: Track completion, not time spent.
- **Recurring tasks**: Manual task creation only.
- **Calendar integration**: No iCal, Google Calendar, etc.
- **Notifications**: User must check manually.

#### Success Criteria
1. User can go from `pip install` to tracking tasks in under 3 minutes
2. All commands complete in <100ms for databases up to 10,000 tasks
3. Works fully offline after install
4. Shell scripts can parse output reliably (stable JSON schema)

---

### 3.3 docs/design/use-cases.md

**Purpose:** Define concrete usage scenarios.

**Required Use Cases (7 total):**

#### UC1: Initial Setup
- **Actor:** Developer setting up task tracking
- **Flow:**
  1. `pip install task-cli`
  2. `task-cli init --db ./tasks.db`
  3. Optionally create initial project: `task-cli project add "My Project"`
- **Success:** Database created, ready to accept tasks
- **Failures:**
  - Database path not writable -> exit 2, clear error
  - Database already exists -> exit 1, require `--force`

#### UC2: Creating a Task
- **Actor:** Developer adding new work item
- **Flow:**
  1. `task-cli add "Fix login bug" --project backend --priority high --due 2026-01-25`
  2. Optionally add labels: `task-cli label add 1 urgent`
- **Success:** Task created with ID, shown to user
- **Failures:**
  - Invalid date format -> exit 1, show expected format
  - Project doesn't exist -> exit 3, suggest creating project
  - Invalid priority -> exit 1, show allowed values

#### UC3: Daily Task Review
- **Actor:** Developer starting workday
- **Flow:**
  1. Check today's tasks: `task-cli due today`
  2. Check overdue: `task-cli list --status pending --overdue`
  3. Pick task to work on
- **Success:** Clear view of urgent work
- **Failures:**
  - Database not found -> exit 2

#### UC4: Completing Tasks
- **Actor:** Developer finishing work
- **Flow:**
  1. Mark complete: `task-cli done 1` (by ID)
  2. Or mark multiple: `task-cli done 1 2 3`
- **Success:** Tasks marked completed with timestamp
- **Failures:**
  - Task not found -> exit 3
  - Task already completed -> exit 1, warn user

#### UC5: Project Management
- **Actor:** Developer organizing work
- **Flow:**
  1. Create project: `task-cli project add "API Redesign"`
  2. List projects: `task-cli project list`
  3. View project tasks: `task-cli list --project "API Redesign"`
  4. Archive project: `task-cli project archive "API Redesign"`
- **Success:** Projects created, listed, archived
- **Failures:**
  - Duplicate project name -> exit 4
  - Project not found -> exit 3

#### UC6: Weekly Report
- **Actor:** Developer tracking productivity
- **Flow:**
  1. Get stats: `task-cli report --period week`
  2. Export completed: `task-cli export-csv --output weekly.csv --status completed --since 2026-01-14`
- **Success:** Stats displayed, CSV created
- **Failures:**
  - File exists without --force -> exit 1

#### UC7: Searching and Filtering
- **Actor:** Developer finding specific tasks
- **Flow:**
  1. Search by title: `task-cli list --search "bug"`
  2. Filter by label: `task-cli list --label urgent`
  3. Filter by multiple criteria: `task-cli list --project backend --priority high --status pending`
- **Success:** Matching tasks displayed
- **Failures:**
  - No search criteria -> show all pending tasks

---

### 3.4 docs/design/technical.md

**Purpose:** Define technology choices and architecture decisions.

**Required Sections:**

#### Technology Choices

**Language: Python 3.10+**
- **Rationale:** Target users likely have Python installed. Rich standard library. Type hints for code quality.
- **Constraint:** Standard library only. No pip dependencies.

**Database: SQLite3**
- **Rationale:** Zero configuration, single file, included in Python stdlib, handles 10,000+ rows easily.
- **Constraint:** Use `sqlite3` module only. No ORM.

**CLI Framework: argparse**
- **Rationale:** Standard library, sufficient for our needs, no external dependencies.
- **Rejected alternatives:** Click (external), Typer (external), Fire (magic behavior)

#### Architecture Decisions

**AD1: Layered Architecture**
```
CLI Layer (cli.py)
    ↓ parses args, routes commands
Command Layer (commands.py)
    ↓ business logic, validation
Database Layer (database.py)
    ↓ SQL queries, connection management
```
**Rationale:** Separation of concerns. CLI parsing separate from business logic separate from data access.

**AD2: No Global State**
Each command receives explicit parameters. No module-level database connections or configuration objects.
**Rationale:** Testability, predictability, no hidden coupling.

**AD3: Explicit Error Types**
Custom exception hierarchy maps to exit codes:
```python
TaskError (base)
├── ValidationError      -> exit 1
├── DatabaseError        -> exit 2
├── NotFoundError        -> exit 3
└── DuplicateError       -> exit 4
```
**Rationale:** Callers can catch specific errors. Exit codes are predictable.

**AD4: Parameterized Queries Only**
**All SQL queries MUST use parameterized placeholders (`?`).**
```python
# NEVER:
cursor.execute(f"SELECT * FROM tasks WHERE title = '{title}'")  # WRONG
# ALWAYS:
cursor.execute("SELECT * FROM tasks WHERE title = ?", (title,))  # RIGHT
```
**Rationale:** Prevents SQL injection. Non-negotiable.

**AD5: Input Validation at Boundary**
Validate all user input in the CLI layer before passing to commands:
- Title: non-empty string, max 500 chars
- Description: max 2000 chars
- Priority: must be one of `high`, `medium`, `low`
- Status: must be one of `pending`, `in_progress`, `completed`, `archived`
- Due date: valid ISO date (YYYY-MM-DD)
- Project/label names: non-empty, max 100 chars

**Rationale:** Fail fast with clear error messages. Don't let bad data reach database layer.

**AD6: Atomic Database Operations**
Each command is a single transaction. Either fully succeeds or fully fails.
**Rationale:** No partial updates. Database always in consistent state.

**AD7: Strict Date Parsing**
Due dates must be in ISO format (YYYY-MM-DD). No fuzzy parsing.
**Rationale:** Predictable behavior, no locale issues, scriptable.

#### Data Model

**Tasks Table**
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| title | TEXT | NOT NULL |
| description | TEXT | nullable |
| status | TEXT | NOT NULL, CHECK IN ('pending','in_progress','completed','archived') |
| priority | TEXT | NOT NULL DEFAULT 'medium', CHECK IN ('high','medium','low') |
| due_date | TEXT | nullable, ISO 8601 date |
| project_id | INTEGER | nullable, FOREIGN KEY |
| created_at | TEXT | NOT NULL, ISO 8601 timestamp |
| updated_at | TEXT | NOT NULL, ISO 8601 timestamp |
| completed_at | TEXT | nullable, ISO 8601 timestamp |

**Projects Table**
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL UNIQUE |
| description | TEXT | nullable |
| status | TEXT | NOT NULL DEFAULT 'active', CHECK IN ('active','archived') |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

**Labels Table**
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL UNIQUE |
| created_at | TEXT | NOT NULL |

**Task_Labels Table (junction)**
| Column | Type | Constraints |
|--------|------|-------------|
| task_id | INTEGER | NOT NULL, FOREIGN KEY tasks(id) ON DELETE CASCADE |
| label_id | INTEGER | NOT NULL, FOREIGN KEY labels(id) ON DELETE CASCADE |
| PRIMARY KEY (task_id, label_id) |

**Indexes:**
- `idx_tasks_status` on `tasks(status)`
- `idx_tasks_priority` on `tasks(priority)`
- `idx_tasks_due_date` on `tasks(due_date)`
- `idx_tasks_project_id` on `tasks(project_id)`
- `idx_projects_name` on `projects(name)` (unique)
- `idx_labels_name` on `labels(name)` (unique)

#### Output Formats

**Table Format (default):** Human-readable, fixed-width columns
**JSON Format (`--format json`):** Machine-readable, stable schema
**CSV Format (export only):** RFC 4180 compliant

#### Performance Targets
| Operation | Target | Max dataset |
|-----------|--------|-------------|
| init | <500ms | n/a |
| add | <50ms | n/a |
| edit | <50ms | n/a |
| list | <100ms | 10,000 tasks |
| due | <100ms | 10,000 tasks |
| report | <200ms | 10,000 tasks |
| export-csv | <3s | 10,000 tasks |

#### Security Considerations
1. **SQL Injection:** Mitigated by AD4 (parameterized queries only)
2. **Input Validation:** Dates, priorities, status values strictly validated
3. **Path Validation:** `--db` and `--output` paths validated for traversal
4. **Error Message Leakage:** Don't expose SQL or file paths in user-facing messages

---

### 3.5 docs/design/components.md

**Purpose:** Define module structure and interfaces.

**Required Sections:**

#### Module Overview
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

#### Component Details

**`__init__.py`**
- Purpose: Package marker and version constant
- Contents: `__version__ = "0.1.0"`
- Dependencies: None

**`__main__.py`**
- Purpose: Entry point for `python -m task_cli`
- Contents: Import and call `cli.main()`
- Dependencies: `cli`

**`cli.py`**
- Purpose: Parse command-line arguments, route to command handlers
- Responsibilities:
  1. Define argument parser with subcommands
  2. Validate input at boundary (before passing to commands)
  3. Map exceptions to exit codes
  4. Handle `--verbose` flag
- Public interface: `main()`
- Dependencies: `commands`, `exceptions`, `formatters`
- MUST NOT: Access database directly, import `sqlite3`, contain business logic

**`commands.py`**
- Purpose: Business logic for each CLI command
- Responsibilities:
  1. Implement one function per CLI command
  2. Coordinate between database and formatters
  3. Enforce business rules
- Public interface:
  - `cmd_init(db_path: str, force: bool) -> None`
  - `cmd_add(db_path: str, title: str, ...) -> int`
  - `cmd_edit(db_path: str, task_id: int, ...) -> None`
  - `cmd_list(db_path: str, filters: dict) -> list[Task]`
  - `cmd_show(db_path: str, task_id: int) -> Task`
  - `cmd_done(db_path: str, task_ids: list[int]) -> list[Task]`
  - `cmd_archive(db_path: str, task_ids: list[int]) -> list[Task]`
  - `cmd_project_add(db_path: str, name: str, description: str | None) -> int`
  - `cmd_project_list(db_path: str) -> list[Project]`
  - `cmd_project_archive(db_path: str, name: str) -> None`
  - `cmd_label_add(db_path: str, task_id: int, label_name: str) -> None`
  - `cmd_label_remove(db_path: str, task_id: int, label_name: str) -> None`
  - `cmd_due(db_path: str, period: str) -> list[Task]`
  - `cmd_report(db_path: str, period: str) -> ReportStats`
  - `cmd_export_csv(db_path: str, output: str, filters: dict, force: bool) -> int`
- Dependencies: `database`, `models`, `exceptions`
- MUST NOT: Parse CLI arguments, print to stdout/stderr, handle exit codes

**`database.py`**
- Purpose: Database connection and SQL operations
- Responsibilities:
  1. Create/connect to SQLite database
  2. Run schema migrations
  3. Execute parameterized queries
  4. Handle transactions
- Public interface:
  - `init_database(path: str) -> None`
  - `get_connection(path: str) -> ContextManager[sqlite3.Connection]`
  - `insert_task(conn, task: Task) -> int`
  - `update_task(conn, task: Task) -> None`
  - `find_task_by_id(conn, task_id: int) -> Task | None`
  - `search_tasks(conn, filters: dict) -> list[Task]`
  - `get_tasks_due(conn, start_date: str, end_date: str) -> list[Task]`
  - `insert_project(conn, project: Project) -> int`
  - `find_project_by_name(conn, name: str) -> Project | None`
  - `find_project_by_id(conn, project_id: int) -> Project | None`
  - `list_projects(conn) -> list[Project]`
  - `update_project(conn, project: Project) -> None`
  - `insert_label(conn, name: str) -> int`
  - `find_label_by_name(conn, name: str) -> Label | None`
  - `add_task_label(conn, task_id: int, label_id: int) -> None`
  - `remove_task_label(conn, task_id: int, label_id: int) -> None`
  - `get_task_labels(conn, task_id: int) -> list[Label]`
  - `get_stats(conn, start_date: str, end_date: str) -> dict`
- Dependencies: `models`, `exceptions`
- **Critical constraint:** ALL queries use parameterized placeholders (`?`). No string interpolation.

**`models.py`**
- Purpose: Data classes and validation logic
- Contents:
  ```python
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
      completed_at: str | None
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
  def validate_title(title: str) -> str  # raises ValidationError
  def validate_description(desc: str | None) -> str | None
  def validate_priority(priority: str) -> str
  def validate_status(status: str) -> str
  def validate_due_date(due_date: str | None) -> str | None
  def validate_project_name(name: str) -> str
  def validate_label_name(name: str) -> str
  def validate_path(path: str) -> str
  ```
- Dependencies: `exceptions`

**`formatters.py`**
- Purpose: Format data for output
- Public interface:
  - `format_task_table(tasks: list[Task]) -> str`
  - `format_task_json(tasks: list[Task]) -> str`
  - `format_task_detail(task: Task) -> str`
  - `format_project_table(projects: list[Project]) -> str`
  - `format_project_json(projects: list[Project]) -> str`
  - `format_report(stats: ReportStats) -> str`
  - `format_report_json(stats: ReportStats) -> str`
  - `write_csv(tasks: list[Task], path: str) -> None`
- Dependencies: `models`

**`exceptions.py`**
- Purpose: Custom exception hierarchy
- Contents:
  ```python
  class TaskError(Exception):
      """Base exception for task CLI."""
      exit_code = 1

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
- Dependencies: None

#### Dependency Graph
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
**Rule:** No circular dependencies. Lower layers don't import from higher layers.

---

## 4. Systems Docs Outline

### 4.1 docs/systems/architecture/ARCHITECTURE-simple.md

**Purpose:** Define system layers, rules, data flow, and security rules.

**Required Sections:**

#### System Overview Diagram
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

#### Layer Rules

**CLI Layer (`cli.py`):**
- **MUST:** Parse all arguments using `argparse`
- **MUST:** Validate all user input before passing to commands
- **MUST:** Catch `TaskError` subclasses and convert to exit codes
- **MUST:** Print user-facing messages to stdout/stderr
- **MUST NOT:** Access database directly, import `sqlite3`, contain business logic, format output (delegate to formatters)

**Command Layer (`commands.py`):**
- **MUST:** Implement one function per CLI command
- **MUST:** Accept validated, typed parameters
- **MUST:** Return data (not formatted strings)
- **MUST:** Raise specific exception types for errors
- **MUST NOT:** Parse CLI arguments, print to stdout/stderr, handle exit codes, catch exceptions (let them propagate)

**Database Layer (`database.py`):**
- **MUST:** Use parameterized queries exclusively (`?` placeholders)
- **MUST:** Use context managers for connections
- **MUST:** Use transactions for multi-statement operations
- **MUST:** Return model objects (not raw tuples)
- **MUST NOT:** Validate business rules, format output, use string interpolation in queries (SECURITY CRITICAL)

**Formatter Layer (`formatters.py`):**
- **MUST:** Accept model objects as input
- **MUST:** Return strings (for table/JSON) or write files (for CSV)
- **MUST:** Handle edge cases (empty lists, None values)
- **MUST NOT:** Access database, make business decisions

#### Data Flow Examples

**Add Task:**
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

**Search (with SQL injection attempt):**
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

#### Critical Security Rules

**S1: Parameterized Queries Only**
```python
# CORRECT
cursor.execute("SELECT * FROM tasks WHERE title = ?", (title,))

# WRONG - SQL INJECTION VULNERABILITY
cursor.execute(f"SELECT * FROM tasks WHERE title = '{title}'")
```
**Enforcement:** Code review. Any string interpolation in SQL is a blocking issue.

**S2: Input Validation**
For priority, status, due_date:
- Priority MUST be one of: `high`, `medium`, `low`
- Status MUST be one of: `pending`, `in_progress`, `completed`, `archived`
- Due date MUST be valid ISO format (YYYY-MM-DD) or null

```python
VALID_PRIORITIES = {"high", "medium", "low"}
VALID_STATUSES = {"pending", "in_progress", "completed", "archived"}

def validate_priority(priority: str) -> str:
    if priority not in VALID_PRIORITIES:
        raise ValidationError(f"Invalid priority '{priority}'. Must be one of: {', '.join(VALID_PRIORITIES)}")
    return priority
```

**S3: Path Validation**
For `--db` and `--output` arguments:
- Must not contain `..` (path traversal)
- Must be absolute path or relative to cwd
- Must be writable by current user

```python
def validate_path(path: str) -> str:
    if ".." in path:
        raise ValidationError("Path cannot contain '..'")
    return os.path.abspath(path)
```

**S4: Error Message Sanitization**
Error messages to users must NOT include:
- Full file paths (only basename)
- SQL query text
- Stack traces (unless --verbose)
- Database internal errors

#### File Locations Table
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

#### Entry Points
```bash
# As Module
python -m task_cli [command] [args]

# As Script (if installed)
task-cli [command] [args]
```

---

### 4.2 docs/systems/database/schema.md

**Purpose:** Define exact database schema, constraints, and query patterns.

**Required Sections:**

#### Database File
- **Engine:** SQLite 3
- **File:** User-specified via `--db` (default: `./tasks.db`)
- **Encoding:** UTF-8
- **Permissions:** Should be 0600 (owner read/write only)

#### Schema Definition
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
```

#### Column Specifications

**tasks table:**
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

**projects table:**
| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `name` | TEXT | No | - | UNIQUE | Max 100 chars (app-enforced) |
| `description` | TEXT | Yes | NULL | - | Max 500 chars (app-enforced) |
| `status` | TEXT | No | 'active' | CHECK IN values | active/archived |
| `created_at` | TEXT | No | - | - | ISO 8601 timestamp |
| `updated_at` | TEXT | No | - | - | ISO 8601 timestamp |

**labels table:**
| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `name` | TEXT | No | - | UNIQUE | Max 50 chars (app-enforced) |
| `created_at` | TEXT | No | - | - | ISO 8601 timestamp |

**task_labels table:**
| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `task_id` | INTEGER | No | - | FK, CASCADE | Deletes with task |
| `label_id` | INTEGER | No | - | FK, CASCADE | Deletes with label |
| PRIMARY KEY | - | - | - | (task_id, label_id) | Composite |

#### Timestamp Format
All timestamps use ISO 8601 format:
- **Timestamps:** `YYYY-MM-DDTHH:MM:SS.ffffffZ` (with time)
- **Dates:** `YYYY-MM-DD` (date only, for due_date)

```python
from datetime import datetime, timezone
timestamp = datetime.now(timezone.utc).isoformat()  # 2026-01-21T15:30:45.123456+00:00
date_only = datetime.now().strftime("%Y-%m-%d")     # 2026-01-21
```

#### Query Patterns

**Insert Task:**
```sql
INSERT INTO tasks (title, description, status, priority, due_date, project_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);
```
Parameters: `(title, description, status, priority, due_date, project_id, created_at, updated_at)`

**Update Task:**
```sql
UPDATE tasks
SET title = ?, description = ?, status = ?, priority = ?, due_date = ?, project_id = ?, updated_at = ?, completed_at = ?
WHERE id = ?;
```
Parameters: `(title, description, status, priority, due_date, project_id, updated_at, completed_at, id)`

**Find Task by ID:**
```sql
SELECT id, title, description, status, priority, due_date, project_id, created_at, updated_at, completed_at
FROM tasks
WHERE id = ?;
```
Parameters: `(id,)`

**Search Tasks (combined criteria):**
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
    query += " AND LOWER(title) LIKE LOWER(?)"
    params.append(f"%{search}%")
if overdue:
    query += " AND due_date < ? AND status NOT IN ('completed', 'archived')"
    params.append(today)
query += " ORDER BY due_date ASC NULLS LAST, priority_order, created_at DESC"
```

**Tasks Due in Range:**
```sql
SELECT id, title, description, status, priority, due_date, project_id, created_at, updated_at, completed_at
FROM tasks
WHERE due_date >= ? AND due_date <= ? AND status NOT IN ('completed', 'archived')
ORDER BY due_date ASC, priority_order;
```
Parameters: `(start_date, end_date)`

**Note on priority ordering:** Use CASE statement:
```sql
ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END
```

**Insert Project:**
```sql
INSERT INTO projects (name, description, status, created_at, updated_at)
VALUES (?, ?, ?, ?, ?);
```

**Find Project by Name:**
```sql
SELECT id, name, description, status, created_at, updated_at
FROM projects
WHERE name = ?;
```

**List Active Projects:**
```sql
SELECT id, name, description, status, created_at, updated_at
FROM projects
WHERE status = 'active'
ORDER BY name;
```

**Insert Label:**
```sql
INSERT INTO labels (name, created_at)
VALUES (?, ?);
```

**Find Label by Name:**
```sql
SELECT id, name, created_at
FROM labels
WHERE name = ?;
```

**Add Label to Task:**
```sql
INSERT OR IGNORE INTO task_labels (task_id, label_id)
VALUES (?, ?);
```

**Remove Label from Task:**
```sql
DELETE FROM task_labels
WHERE task_id = ? AND label_id = ?;
```

**Get Labels for Task:**
```sql
SELECT l.id, l.name, l.created_at
FROM labels l
JOIN task_labels tl ON l.id = tl.label_id
WHERE tl.task_id = ?;
```

**Get Tasks with Label:**
```sql
SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.project_id, t.created_at, t.updated_at, t.completed_at
FROM tasks t
JOIN task_labels tl ON t.id = tl.task_id
JOIN labels l ON tl.label_id = l.id
WHERE l.name = ?;
```

**Statistics Query:**
```sql
-- Completed in period
SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND completed_at >= ? AND completed_at < ?;

-- Created in period
SELECT COUNT(*) FROM tasks WHERE created_at >= ? AND created_at < ?;

-- Currently pending
SELECT COUNT(*) FROM tasks WHERE status = 'pending';

-- Currently overdue
SELECT COUNT(*) FROM tasks WHERE due_date < ? AND status NOT IN ('completed', 'archived');

-- By priority (pending only)
SELECT priority, COUNT(*) FROM tasks WHERE status = 'pending' GROUP BY priority;

-- By project (pending only)
SELECT p.name, COUNT(*) FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.status = 'pending'
GROUP BY t.project_id;
```

#### Connection Management
```python
import sqlite3
from contextlib import contextmanager

@contextmanager
def get_connection(db_path: str):
    """Context manager for database connections."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")  # Enable FK constraints
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
- Always commit or rollback (no implicit transactions)
- Set `row_factory = sqlite3.Row` for named column access

---

### 4.3 docs/systems/cli/interface.md

**Purpose:** Define all CLI commands with exact specifications.

**Required Sections:**

#### Global Options
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--db PATH` | string | `./tasks.db` | Path to SQLite database file |
| `--verbose` | flag | false | Enable debug output |
| `--help` | flag | - | Show help for command |
| `--version` | flag | - | Show version number |

#### Commands

**`init`** - Initialize a new task database

Syntax: `task-cli init [--db PATH] [--force]`

Options:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--force` | flag | false | Overwrite existing database |

Behavior:
1. Check if database file exists
2. If exists and `--force` not set -> error, exit 1
3. If exists and `--force` set -> delete existing file
4. Create new database file
5. Execute schema creation SQL
6. Print success message

Output (success): `Database initialized at ./tasks.db`
Output (exists, no force): `Error: Database already exists at tasks.db. Use --force to recreate.`

Exit codes:
- 0: Success
- 1: Database exists (without --force)
- 2: Cannot create file (permissions, invalid path)

---

**`add`** - Create a new task

Syntax: `task-cli add TITLE [options]`

Required:
| Argument | Type | Constraints | Description |
|----------|------|-------------|-------------|
| `TITLE` | string | 1-500 chars | Task title (positional) |

Optional:
| Option | Type | Default | Constraints | Description |
|--------|------|---------|-------------|-------------|
| `--description DESC` | string | NULL | max 2000 chars | Task description |
| `--priority PRIORITY` | string | medium | high/medium/low | Task priority |
| `--due DATE` | string | NULL | YYYY-MM-DD | Due date |
| `--project NAME` | string | NULL | existing project | Project to assign |
| `--status STATUS` | string | pending | pending/in_progress | Initial status |

Behavior:
1. Validate all inputs
2. If `--project` specified, verify project exists
3. Insert task into database
4. Return created task ID

Output (success): `Task created: 1 - Fix login bug`
Output (invalid priority): `Error: Invalid priority 'urgent'. Must be one of: high, medium, low`
Output (project not found): `Error: Project 'backend' not found.`
Output (invalid date): `Error: Invalid date format '01/25/2026'. Use YYYY-MM-DD.`

Exit codes:
- 0: Success
- 1: Validation error
- 2: Database error
- 3: Project not found

---

**`edit`** - Modify an existing task

Syntax: `task-cli edit TASK_ID [options]`

Required:
| Argument | Type | Description |
|----------|------|-------------|
| `TASK_ID` | integer | ID of task to edit |

Optional (at least one required):
| Option | Type | Description |
|--------|------|-------------|
| `--title TITLE` | string | New title |
| `--description DESC` | string | New description |
| `--priority PRIORITY` | string | New priority |
| `--due DATE` | string | New due date (use "" to clear) |
| `--project NAME` | string | New project (use "" to unassign) |
| `--status STATUS` | string | New status |

Behavior:
1. Find task by ID
2. If not found -> error, exit 3
3. Apply changes
4. Print updated task

Output (success): `Task 1 updated.`
Output (not found): `Error: Task 1 not found.`

Exit codes:
- 0: Success
- 1: Validation error, or no changes specified
- 2: Database error
- 3: Task not found

---

**`list`** - List tasks with filters

Syntax: `task-cli list [options]`

Options:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--status STATUS` | string | pending | Filter by status (or "all") |
| `--priority PRIORITY` | string | - | Filter by priority |
| `--project NAME` | string | - | Filter by project name |
| `--label LABEL` | string | - | Filter by label |
| `--search TEXT` | string | - | Search in title (partial, case-insensitive) |
| `--overdue` | flag | false | Show only overdue tasks |
| `--format FORMAT` | string | table | Output format (table/json) |

Behavior:
1. Build query with filters
2. Default shows pending tasks only (use `--status all` for everything)
3. Multiple filters are AND'd
4. Return matching tasks

Output (table):
```
ID  | Title            | Priority | Due        | Project
----|------------------|----------|------------|----------
1   | Fix login bug    | high     | 2026-01-25 | backend
3   | Update docs      | low      | -          | -
```

Output (no matches): `No tasks found.`

Output (JSON):
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

Exit codes:
- 0: Success (including empty results)
- 2: Database error

---

**`show`** - Show detailed task information

Syntax: `task-cli show TASK_ID [--format FORMAT]`

Required:
| Argument | Type | Description |
|----------|------|-------------|
| `TASK_ID` | integer | ID of task to show |

Options:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format FORMAT` | string | detail | Output format (detail/json) |

Output (detail format):
```
Task #1: Fix login bug
----------------------------------------
Status:      pending
Priority:    high
Due:         2026-01-25
Project:     backend
Labels:      urgent, bug

Description:
Users report intermittent login failures...

Created:     2026-01-20 10:30:00
Updated:     2026-01-21 14:15:00
```

Exit codes:
- 0: Success
- 2: Database error
- 3: Task not found

---

**`done`** - Mark tasks as completed

Syntax: `task-cli done TASK_ID [TASK_ID ...]`

Required:
| Argument | Type | Description |
|----------|------|-------------|
| `TASK_ID` | integer | One or more task IDs |

Behavior:
1. For each task ID:
   - Find task
   - If not found -> error for that ID, continue
   - If already completed -> warn, continue
   - Mark as completed, set completed_at timestamp
2. Print summary

Output (success): `Completed: 1, 3, 5`
Output (partial): `Completed: 1, 3. Not found: 99. Already completed: 5.`

Exit codes:
- 0: At least one task completed
- 3: All specified tasks not found

---

**`archive`** - Archive completed tasks

Syntax: `task-cli archive [TASK_ID ...] [--all-completed]`

Options:
| Option | Type | Description |
|--------|------|-------------|
| `--all-completed` | flag | Archive all completed tasks |

Behavior:
1. If `--all-completed`: archive all tasks with status=completed
2. If TASK_IDs specified: archive those specific tasks
3. Task must be completed to be archived (or use done+archive)

Output: `Archived 5 tasks.`

Exit codes:
- 0: Success
- 1: Task not completed (cannot archive)
- 3: Task not found

---

**`project add`** - Create a new project

Syntax: `task-cli project add NAME [--description DESC]`

Required:
| Argument | Type | Constraints | Description |
|----------|------|-------------|-------------|
| `NAME` | string | 1-100 chars, unique | Project name |

Optional:
| Option | Type | Description |
|--------|------|-------------|
| `--description DESC` | string | Project description |

Output (success): `Project created: backend (ID: 1)`
Output (duplicate): `Error: Project 'backend' already exists.`

Exit codes:
- 0: Success
- 1: Validation error
- 4: Duplicate name

---

**`project list`** - List all projects

Syntax: `task-cli project list [--all] [--format FORMAT]`

Options:
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--all` | flag | false | Include archived projects |
| `--format FORMAT` | string | table | Output format (table/json) |

Output (table):
```
ID | Name     | Status | Tasks
---|----------|--------|-------
1  | backend  | active | 5
2  | frontend | active | 3
```

Exit codes:
- 0: Success

---

**`project archive`** - Archive a project

Syntax: `task-cli project archive NAME`

Behavior:
1. Find project by name
2. Set status to 'archived'
3. Does NOT affect tasks in project

Output: `Project 'backend' archived.`

Exit codes:
- 0: Success
- 3: Project not found

---

**`label add`** - Add label to a task

Syntax: `task-cli label add TASK_ID LABEL_NAME`

Behavior:
1. Find task by ID
2. Create label if doesn't exist
3. Add association

Output: `Label 'urgent' added to task 1.`
Output (already has): `Task 1 already has label 'urgent'.`

Exit codes:
- 0: Success
- 3: Task not found

---

**`label remove`** - Remove label from a task

Syntax: `task-cli label remove TASK_ID LABEL_NAME`

Output: `Label 'urgent' removed from task 1.`

Exit codes:
- 0: Success
- 3: Task or label not found

---

**`label list`** - List all labels

Syntax: `task-cli label list [--format FORMAT]`

Output (table):
```
Name     | Tasks
---------|-------
urgent   | 3
bug      | 5
feature  | 2
```

Exit codes:
- 0: Success

---

**`due`** - Show tasks due in period

Syntax: `task-cli due PERIOD [--format FORMAT]`

Required:
| Argument | Type | Values | Description |
|----------|------|--------|-------------|
| `PERIOD` | string | today, week, overdue | Time period |

- `today`: Due today
- `week`: Due within next 7 days
- `overdue`: Past due date, not completed

Output (table):
```
ID | Title            | Priority | Due        | Project
---|------------------|----------|------------|----------
1  | Fix login bug    | high     | 2026-01-21 | backend
```

Exit codes:
- 0: Success

---

**`report`** - Show productivity statistics

Syntax: `task-cli report [--period PERIOD] [--format FORMAT]`

Options:
| Option | Type | Default | Values |
|--------|------|---------|--------|
| `--period PERIOD` | string | week | today, week, month |
| `--format FORMAT` | string | text | text, json |

Output (text):
```
Task Report: 2026-01-14 to 2026-01-21
=====================================

Summary:
  Completed:  12
  Created:    15
  Pending:    8
  Overdue:    2

By Priority (pending):
  High:    3
  Medium:  4
  Low:     1

By Project (pending):
  backend:   4
  frontend:  2
  (none):    2
```

Exit codes:
- 0: Success

---

**`export-csv`** - Export tasks to CSV

Syntax: `task-cli export-csv --output PATH [options]`

Required:
| Option | Type | Description |
|--------|------|-------------|
| `--output PATH` | string | Output file path |

Optional:
| Option | Type | Description |
|--------|------|-------------|
| `--status STATUS` | string | Filter by status |
| `--project NAME` | string | Filter by project |
| `--since DATE` | string | Tasks created/completed since date |
| `--force` | flag | Overwrite existing file |

CSV columns: `id,title,description,status,priority,due_date,project,labels,created_at,updated_at,completed_at`

Output (success): `Exported 150 tasks to tasks.csv`
Output (file exists): `Error: File 'tasks.csv' already exists. Use --force to overwrite.`
Output (path traversal): `Error: Path cannot contain '..'.`

Exit codes:
- 0: Success
- 1: File exists (without --force), path validation error
- 2: Database error

---

#### Input Validation Rules

**Title:**
- Non-empty
- Maximum 500 characters

**Description:**
- Maximum 2000 characters
- Can be empty/null

**Priority:**
- Must be: `high`, `medium`, or `low`
- Case-sensitive

**Status:**
- Must be: `pending`, `in_progress`, `completed`, or `archived`
- Case-sensitive

**Due Date:**
- Must be ISO format: `YYYY-MM-DD`
- Validation regex: `^\d{4}-\d{2}-\d{2}$`
- Must be valid calendar date

**Project/Label Name:**
- Non-empty
- Maximum 100/50 characters respectively
- Any printable characters allowed

**Path (--db, --output):**
- Must not contain `..`
- Converted to absolute path internally

---

#### Output Standards

**Table Format:**
- Column headers in first row
- Separator line of dashes and pipes
- Fixed-width columns with padding
- Truncate long values with `...`

**JSON Format:**
- Pretty-printed with 2-space indent
- Arrays for lists (even single item)
- UTF-8 encoding
- NULL values: include key with `null` value

**Error Messages:**
- Prefix: `Error: `
- Written to stderr
- No stack traces (unless --verbose)
- No internal paths or SQL

---

### 4.4 docs/systems/errors.md

**Purpose:** Define exit codes, exception hierarchy, and error message templates.

**Required Sections:**

#### Exit Codes
| Code | Name | Meaning |
|------|------|---------|
| 0 | SUCCESS | Operation completed successfully |
| 1 | GENERAL_ERROR | Invalid arguments, validation failure, general errors |
| 2 | DATABASE_ERROR | Database connection failed, query failed, file issues |
| 3 | NOT_FOUND | Requested item does not exist |
| 4 | DUPLICATE | Item with this identifier already exists |

#### Exception Hierarchy
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
    """
    exit_code = 1


class DatabaseError(TaskError):
    """Database operation failed.

    Examples:
    - Cannot connect to database
    - Query execution failed
    - Cannot create database file
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

#### Error Message Templates

**Validation Errors (Exit 1):**
```
Error: Title cannot be empty.
Error: Title must be 500 characters or fewer. Got: 750
Error: Invalid priority 'urgent'. Must be one of: high, medium, low.
Error: Invalid status 'done'. Must be one of: pending, in_progress, completed, archived.
Error: Invalid date format '01/25/2026'. Use YYYY-MM-DD.
Error: Invalid date '2026-02-30'. Not a valid calendar date.
Error: Project name cannot be empty.
Error: Label name cannot be empty.
Error: Path cannot contain '..'.
Error: At least one change required (--title, --description, --priority, --due, --project, or --status).
Error: File '{filename}' already exists. Use --force to overwrite.
Error: Database already exists at {path}. Use --force to recreate.
Error: Task must be completed before archiving. Current status: pending.
```

**Database Errors (Exit 2):**
```
Error: Cannot create database '{filename}': Permission denied.
Error: Cannot open database '{filename}': File not found.
Error: Database operation failed. Run with --verbose for details.
Error: Cannot write to '{filename}': Permission denied.
```

**Note:** Use basename only (`{filename}`), not full path.

**Not Found Errors (Exit 3):**
```
Error: Task {id} not found.
Error: Project '{name}' not found.
Error: Label '{name}' not found.
```

**Duplicate Errors (Exit 4):**
```
Error: Project '{name}' already exists.
Error: Label '{name}' already exists.
```

#### Error Handling Rules

**Rule 1: Catch at CLI Layer**
```python
def main():
    try:
        result = dispatch_command(args)
        sys.exit(0)
    except TaskError as e:
        print(f"Error: {e.message}", file=sys.stderr)
        sys.exit(e.exit_code)
    except Exception as e:
        if args.verbose:
            traceback.print_exc()
        print("Error: An unexpected error occurred.", file=sys.stderr)
        sys.exit(1)
```

**Rule 2: Never Expose Internals**
- No full file system paths (use basename only)
- No SQL query text
- No stack traces (unless --verbose)
- No internal exception types

**Rule 3: Be Specific**
Report the first validation error found:
```python
def validate_add_task(title, priority, due_date):
    if not title:
        raise ValidationError("Title cannot be empty.")
    if len(title) > 500:
        raise ValidationError(f"Title must be 500 characters or fewer. Got: {len(title)}")
    # continue...
```

**Rule 4: Distinguish Error Types**
| Situation | Exception |
|-----------|-----------|
| Bad user input | `ValidationError` |
| SQLite can't connect | `DatabaseError` |
| Task ID not in database | `NotFoundError` |
| Project name already exists | `DuplicateError` |

**Rule 5: Preserve Original Exceptions**
```python
try:
    cursor.execute(query, params)
except sqlite3.IntegrityError as e:
    if "UNIQUE constraint" in str(e):
        raise DuplicateError(f"Project '{name}' already exists.") from e
    raise DatabaseError("Database constraint violation.") from e
```

#### Verbose Mode
When `--verbose` is set:
1. Print debug information during execution
2. On error, print full stack trace
3. Include full file paths in error messages

**Verbose mode does NOT expose:**
- SQL query text
- Credentials or secrets

---

## 5. Tasks Breakdown

### 5.1 tasks/task1.md - Data Layer

**Scope:**
- `task_cli/__init__.py` - Package marker with `__version__ = "0.1.0"`
- `task_cli/exceptions.py` - Full exception hierarchy (TaskError, ValidationError, DatabaseError, NotFoundError, DuplicateError)
- `task_cli/models.py` - Task, Project, Label, ReportStats dataclasses; all validation functions
- `task_cli/database.py` - Connection management, schema creation, all query functions

**Constraints to Reference:**
- AD1: Layered architecture - database layer must not validate business rules
- AD4: All queries MUST use parameterized placeholders (`?`). No string interpolation.
- AD6: Use context managers for all database connections
- AD7: Strict date parsing for due_date validation
- S1: Parameterized queries only (from ARCHITECTURE-simple.md)

**Tests Required:**
- Unit tests for all validation functions (`validate_title()`, `validate_priority()`, `validate_status()`, `validate_due_date()`, etc.)
- Unit tests for each database function using in-memory SQLite
- Test exception hierarchy (exit codes, inheritance)
- Test foreign key constraints (cascade delete on task_labels)

**Not In Scope:**
- CLI argument parsing (Task 2)
- Command business logic (Task 3)
- Output formatting (Task 3)
- CSV export (Task 4)

**Acceptance Criteria:**
```python
# Can create database with all tables
from task_cli.database import init_database, get_connection, insert_task
from task_cli.models import Task

init_database(":memory:")
with get_connection(":memory:") as conn:
    task = Task(id=None, title="Test task", description=None, status="pending",
                priority="high", due_date="2026-01-25", project_id=None,
                created_at="2026-01-21T10:00:00Z", updated_at="2026-01-21T10:00:00Z",
                completed_at=None)
    task_id = insert_task(conn, task)
    assert task_id == 1

# Validation works
from task_cli.models import validate_priority, validate_due_date
from task_cli.exceptions import ValidationError

validate_priority("high")  # OK
try:
    validate_priority("urgent")  # Fails
except ValidationError as e:
    assert "high, medium, low" in e.message

validate_due_date("2026-01-25")  # OK
try:
    validate_due_date("01/25/2026")  # Fails
except ValidationError as e:
    assert "YYYY-MM-DD" in e.message
```

---

### 5.2 tasks/task2.md - CLI Framework + Init Command

**Scope:**
- `task_cli/__main__.py` - Entry point for `python -m task_cli`
- `task_cli/cli.py` - argparse setup with all global options and subcommands (stubs for commands not yet implemented)
- `init` command fully working with `--force` flag
- Exception-to-exit-code mapping in CLI layer
- `--verbose` flag implementation
- `--version` flag

**Constraints to Reference:**
- AD5: Validate all user input at CLI boundary before passing to commands
- CLI layer MUST NOT import sqlite3 or access database directly
- CLI layer MUST NOT contain business logic
- Use argparse only (no Click, Typer, etc.)
- S3: Error message sanitization (from ARCHITECTURE-simple.md)

**Tests Required:**
- CLI parses all global options correctly (`--db`, `--verbose`, `--version`)
- CLI routes to correct subcommand
- `init` creates database file with all tables
- `init` refuses to overwrite without `--force`
- `init --force` recreates database
- Exit codes are correct for each error type
- `--version` outputs correct version

**Not In Scope:**
- add, edit, list, show, done, archive commands (Task 3)
- project, label, due, report commands (Task 3)
- export-csv command (Task 4)
- Output formatting (Task 3)

**Acceptance Criteria:**
```bash
# Creates new database
python -m task_cli init --db ./test.db
# Output: Database initialized at ./test.db
# Exit: 0

# Refuses to overwrite
python -m task_cli init --db ./test.db
# Output: Error: Database already exists at test.db. Use --force to recreate.
# Exit: 1

# Force recreates
python -m task_cli init --db ./test.db --force
# Output: Database initialized at ./test.db
# Exit: 0

# Shows version
python -m task_cli --version
# Output: task-cli 0.1.0
```

---

### 5.3 tasks/task3.md - Core Commands + Formatters

**Scope:**
- `task_cli/commands.py` - Business logic for: add, edit, list, show, done, archive, project (add/list/archive), label (add/remove/list), due, report
- `task_cli/formatters.py` - Table, JSON, and detail formatters for tasks, projects, labels, reports
- Integration of all commands into cli.py argument parser
- Input validation for all command arguments

**Constraints to Reference:**
- AD1: Commands return data, CLI layer handles formatting and printing
- AD4: All queries use parameterized placeholders
- AD5: Validate inputs at CLI boundary
- AD7: Strict date parsing for --due option
- S2: Input validation for priority, status, date (from ARCHITECTURE-simple.md)
- Commands MUST NOT print to stdout/stderr (return data only)
- Commands MUST NOT catch exceptions (let them propagate to CLI)

**Tests Required:**
- add: success, invalid priority (exit 1), invalid date (exit 1), project not found (exit 3)
- edit: success, not found (exit 3), no changes specified (exit 1)
- list: by status, by priority, by project, by label, search, overdue, combined filters, no results
- show: success, not found (exit 3)
- done: success, not found (exit 3), already completed (warn)
- archive: success, not completed (exit 1)
- project add: success, duplicate (exit 4)
- project list: with and without archived
- label add/remove: success, task not found
- due: today, week, overdue periods
- report: all periods, correct counts
- Table format: proper column widths, truncation, empty message
- JSON format: proper structure, null handling, empty array

**Not In Scope:**
- export-csv command (Task 4)
- CSV formatting (Task 4)

**Acceptance Criteria:**
```bash
# Add task
python -m task_cli add "Fix login bug" --priority high --due 2026-01-25 --db ./test.db
# Output: Task created: 1 - Fix login bug
# Exit: 0

# Add with project
python -m task_cli project add "backend" --db ./test.db
python -m task_cli add "Fix API" --project backend --db ./test.db
# Output: Task created: 2 - Fix API
# Exit: 0

# List pending tasks
python -m task_cli list --db ./test.db
# Output: Table with task 1 and 2
# Exit: 0

# Complete task
python -m task_cli done 1 --db ./test.db
# Output: Completed: 1
# Exit: 0

# Show task
python -m task_cli show 1 --db ./test.db
# Output: Detailed task view with status=completed
# Exit: 0

# Due today
python -m task_cli due today --db ./test.db
# Output: Tasks due today (or empty)
# Exit: 0

# Report
python -m task_cli report --period week --db ./test.db
# Output: Statistics for the week
# Exit: 0
```

---

### 5.4 tasks/task4.md - Export and Advanced Features

**Scope:**
- `export-csv` command in commands.py
- CSV writing in formatters.py (RFC 4180 compliant)
- File existence checking with `--force` handling
- Filter support (--status, --project, --since)
- Path validation (no `..` traversal)

**Constraints to Reference:**
- S3: Path validation - must not contain `..` (from ARCHITECTURE-simple.md)
- CSV must be RFC 4180 compliant (comma delimiter, double-quote escaping, UTF-8)
- Must handle existing file gracefully (require --force to overwrite)
- Error messages must use basename only, not full path

**Tests Required:**
- Export creates valid CSV with header row
- CSV has correct columns in correct order (id,title,description,status,priority,due_date,project,labels,created_at,updated_at,completed_at)
- CSV properly escapes fields with commas and quotes
- Status filter works correctly
- Project filter works correctly
- --since filter works correctly
- File exists without --force -> exit 1
- File exists with --force -> overwrites, exit 0
- Path with `..` -> exit 1
- Output path not writable -> exit 2

**Not In Scope:**
- All other commands (completed in Tasks 1-3)

**Acceptance Criteria:**
```bash
# Export all tasks
python -m task_cli export-csv --output tasks.csv --db ./test.db
# Output: Exported 10 tasks to tasks.csv
# Exit: 0
# File created with header: id,title,description,status,priority,due_date,project,labels,created_at,updated_at,completed_at

# File exists error
python -m task_cli export-csv --output tasks.csv --db ./test.db
# Output: Error: File 'tasks.csv' already exists. Use --force to overwrite.
# Exit: 1

# Force overwrite
python -m task_cli export-csv --output tasks.csv --force --db ./test.db
# Output: Exported 10 tasks to tasks.csv
# Exit: 0

# Filter by status
python -m task_cli export-csv --output completed.csv --status completed --db ./test.db
# Output: Exported 5 tasks to completed.csv
# Exit: 0

# Filter by project
python -m task_cli export-csv --output backend.csv --project backend --db ./test.db
# Output: Exported 3 tasks to backend.csv
# Exit: 0

# Path traversal blocked
python -m task_cli export-csv --output ../../../etc/passwd --db ./test.db
# Output: Error: Path cannot contain '..'.
# Exit: 1
```

---

## 6. Security Test Cases for Falcon

The following scenarios are designed to test Falcon's pattern detection:

### B01: SQL Injection Vulnerabilities
- Task title with SQL injection: `"Test'; DROP TABLE tasks;--"`
- Project name with injection: `"Project' OR '1'='1"`
- Search parameter with injection: `"'; SELECT * FROM sqlite_master;--"`
- Label name with injection: `"label\"; DELETE FROM labels;--"`

**Expected behavior:** All inputs treated as literal strings via parameterized queries.

### B02: Input Validation Bypass
- Invalid priority: `"URGENT"`, `"critical"`, `"1"`
- Invalid status: `"done"`, `"COMPLETED"`, `"finished"`
- Invalid date formats: `"01/25/2026"`, `"25-01-2026"`, `"January 25, 2026"`, `"2026/01/25"`
- Invalid date values: `"2026-02-30"`, `"2026-13-01"`, `"2026-00-15"`
- Oversized inputs: Title > 500 chars, Description > 2000 chars
- Empty required fields: Empty title, empty project name

**Expected behavior:** ValidationError with clear message, exit code 1.

### B03: Path Traversal
- Database path: `"--db ../../../etc/passwd"`
- Export path: `"--output ../../../tmp/evil.csv"`
- Path with encoded traversal: `"--db ..%2F..%2Fetc%2Fpasswd"`

**Expected behavior:** ValidationError for paths containing `..`, exit code 1.

### B04: Error Message Information Leakage
- Invalid SQL should not expose query text
- File errors should show basename only, not full paths
- Database errors should be generic without internal details

**Expected behavior:** Sanitized error messages without internal details.

---

## Summary

This plan provides complete specifications for implementing app4 (Task Manager CLI) following the exact structure of app1. The implementation agent should:

1. Create all files in the directory structure
2. Follow the design docs for architecture decisions and rationale
3. Follow the systems docs for exact schemas, queries, and interfaces
4. Implement in task order (1 -> 2 -> 3 -> 4)
5. Ensure all security rules (S1-S4) are enforced
6. Test against the Falcon test cases to validate pattern detection
