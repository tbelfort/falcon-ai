# Task 1: Data Layer

Implement the foundation modules for the Contact Book CLI.

## Context

Read before starting:
- `docs/design/technical.md` - Architecture decisions (especially AD1-AD7)
- `docs/design/components.md` - Module specifications
- `docs/systems/database/schema.md` - SQLite schema and query patterns
- `docs/systems/errors.md` - Exception hierarchy

## Scope

- [ ] `contact_book_cli/__init__.py` - Package marker with `__version__ = "0.1.0"`
- [ ] `contact_book_cli/exceptions.py` - Full exception hierarchy (ContactBookError, ValidationError, DatabaseError, ContactNotFoundError, GroupNotFoundError, DuplicateError)
- [ ] `contact_book_cli/models.py` - Contact and Group dataclasses, all validation functions
- [ ] `contact_book_cli/database.py` - Connection management, schema creation, all query functions

## Constraints

- **AD1**: Layered architecture - database layer must not validate business rules
- **AD2**: No global state - each function receives explicit parameters (no module-level connections)
- **AD3**: Explicit error types - custom exception hierarchy maps to exit codes
- **AD4**: All queries MUST use parameterized placeholders (`?`). No string interpolation.
- **AD6**: Atomic database operations - each command is a single transaction; use context managers for connections
- **AD7**: Do not log PII values
- **S1**: Parameterized queries only - see ARCHITECTURE-simple.md for SQL injection prevention

## Tests Required

- Unit tests for all `validate_*()` functions (name, email, phone, company, notes, group_name, path)
- Unit tests for each database function using in-memory SQLite
- Test exception hierarchy (exit codes, inheritance)
- Test foreign key cascade behavior (deleting contact removes from groups, deleting group removes membership)

## Not In Scope

- CLI argument parsing (Task 2)
- Command business logic (Task 3)
- Output formatting (Task 3)
- Export/import commands (Task 4)

## Acceptance Criteria

```python
# Can create database and insert a contact
import tempfile
import os
from contact_book_cli.database import init_database, get_connection, insert_contact
from contact_book_cli.models import Contact

with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
    db_path = f.name

try:
    init_database(db_path)
    with get_connection(db_path) as conn:
        contact = Contact(
            id=None,
            name="Jane Smith",
            email="jane@example.com",
            phone="+1-555-123-4567",
            company="Acme Corp",
            notes="Met at TechConf",
            created_at="2026-01-15T10:00:00.000000+00:00",
            updated_at="2026-01-15T10:00:00.000000+00:00"
        )
        # Note: Timestamp format uses +00:00 suffix per schema.md (Python isoformat() output)
        contact_id = insert_contact(conn, contact)
        assert contact_id == 1

        # Can create group and add contact to it
        from contact_book_cli.database import insert_group, add_contact_to_group, get_groups_for_contact
        from contact_book_cli.models import Group

        group = Group(
            id=None,
            name="Clients",
            description="Business clients",
            created_at="2026-01-14T09:00:00.000000+00:00"
        )
        group_id = insert_group(conn, group)
        add_contact_to_group(conn, contact_id, group_id)
        groups = get_groups_for_contact(conn, contact_id)
        assert len(groups) == 1
        assert groups[0].name == "Clients"
finally:
    os.unlink(db_path)
```
