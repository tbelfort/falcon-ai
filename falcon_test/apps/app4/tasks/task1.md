# Task 1: Data Layer

Implement the foundation modules for the Task Manager CLI.

## Context

Read before starting:
- `docs/design/technical.md` - Architecture decisions (especially AD1-AD7)
- `docs/design/components.md` - Module specifications
- `docs/systems/database/schema.md` - SQLite schema and query patterns
- `docs/systems/errors.md` - Exception hierarchy

## Scope

- [ ] `task_cli/__init__.py` - Package marker with `__version__ = "0.1.0"`
- [ ] `task_cli/exceptions.py` - Full exception hierarchy (TaskError, ValidationError, DatabaseError, NotFoundError, DuplicateError)
- [ ] `task_cli/models.py` - Task, Project, Label, ReportStats dataclasses; all validation functions
- [ ] `task_cli/database.py` - Connection management, schema creation, all query functions

## Constraints

- **AD1**: Layered architecture - database layer must not validate business rules
- **AD4**: All queries MUST use parameterized placeholders (`?`). No string interpolation.
- **AD6**: Atomic Database Operations - each command is a single transaction
- **Database Rule**: Use context managers for all database connections (see schema.md Connection Management)
- **AD7**: Strict date parsing for due_date validation
- **S1**: Parameterized queries only (from ARCHITECTURE-simple.md)

## Tests Required

- Unit tests for all validation functions (`validate_title()`, `validate_priority()`, `validate_status()`, etc.)
- `validate_due_date()` - valid date, invalid format, invalid calendar date (2026-02-30),
  leap year handling (2028-02-29 valid, 2026-02-29 invalid), far future date
- Unit tests for each database function using in-memory SQLite
- Test exception hierarchy (exit codes, inheritance)
- Test foreign key constraints (cascade delete on task_labels)

## Not In Scope

- CLI argument parsing (Task 2)
- Command business logic (Task 3)
- Output formatting (Task 3)
- CSV export (Task 4)

## Acceptance Criteria

```python
# Can create database with all tables
import tempfile
import os
from task_cli.database import init_database, get_connection, insert_task
from task_cli.models import Task

with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
    db_path = f.name

try:
    init_database(db_path)
    with get_connection(db_path) as conn:
        task = Task(id=None, title="Test task", description=None, status="pending",
                    priority="high", due_date="2026-01-25", project_id=None,
                    created_at="2026-01-21T10:00:00Z", updated_at="2026-01-21T10:00:00Z",
                    completed_at=None)
        task_id = insert_task(conn, task)
        assert task_id == 1
finally:
    os.unlink(db_path)

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
