# Task 1: Data Layer

Implement the foundation modules for the Personal Finance Tracker CLI.

## Context

Read before starting:
- `docs/design/technical.md` - Architecture decisions (especially AD1-AD7)
- `docs/design/components.md` - Module specifications
- `docs/systems/database/schema.md` - SQLite schema and query patterns
- `docs/systems/errors.md` - Exception hierarchy

## Scope

- [ ] `finance_cli/__init__.py` - Package marker with `__version__ = "0.1.0"`
- [ ] `finance_cli/exceptions.py` - Full exception hierarchy (FinanceError, ValidationError, DatabaseError, NotFoundError, DuplicateError)
- [ ] `finance_cli/models.py` - All dataclasses (Account, Category, Transaction, Budget, AccountBalance, BudgetReportItem) and validation functions
- [ ] `finance_cli/database.py` - Connection management, schema creation, all query functions

## Constraints

- **AD1**: Layered architecture - database layer must not validate business rules
- **AD4**: All queries MUST use parameterized placeholders (`?`). No string interpolation.
- **AD6**: Use context managers for all database connections
- **AD7**: Store amounts as INTEGER cents, not float. Use `validate_amount()` to convert.
- **S5**: Enable foreign key enforcement (PRAGMA foreign_keys = ON) on every new database connection

## Tests Required

- Unit tests for all `validate_*` functions:
  - `validate_account_name()` - empty, too long, valid, whitespace-only (rejected as empty), leading/trailing whitespace (stripped)
  - `validate_category_name()` - empty, too long, valid, whitespace-only (rejected as empty), leading/trailing whitespace (stripped)
  - `validate_account_type()` - invalid, all valid types
  - `validate_category_type()` - invalid, all valid types
  - `validate_amount()` - invalid format, too many decimals, valid positive, valid negative, boundary test at 999999999.99, reject > 999999999.99
  - `validate_date()` - invalid format, valid, Feb 29 leap year valid (2024-02-29), Feb 30 invalid, Apr 31 invalid, 2100-02-29 invalid (not leap year), 2000-02-29 valid (is leap year)
  - `validate_month()` - invalid format, valid, month 00 invalid, month 13 invalid
  - `validate_description()` - too long, valid, None, empty string converted to None
  - `validate_path()` - contains `..`, valid, symlink resolution, containment check
  - `validate_date_range()` - both None, valid range, from > to (rejected), single date only
- Unit tests for currency conversion:
  - `cents_to_decimal()` - positive, negative, zero
  - `decimal_to_cents()` - positive, negative, zero, rounding
- Unit tests for each database function using in-memory SQLite
- Test exception hierarchy (exit codes, inheritance)
- Test that amounts are correctly stored as cents
- Test foreign key constraint enforcement:
  - Insert transaction with non-existent account_id raises error
  - Insert transaction with non-existent category_id raises error
  - Verify PRAGMA foreign_keys = ON is enabled in get_connection()

## Not In Scope

- CLI argument parsing (Task 2)
- Command business logic (Task 3)
- Output formatting (Task 3)
- CSV export/import (Task 4)

## Acceptance Criteria

```python
# Can create database and insert records
import tempfile
import os
from finance_cli.database import init_database, get_connection, insert_account, insert_category, insert_transaction
from finance_cli.models import Account, Category, Transaction, validate_amount

# Create a temporary database file for testing.
# Note: We use NamedTemporaryFile instead of ':memory:' because each ':memory:'
# connection creates a separate, independent database that cannot be shared between
# connections. A file-based temporary database allows us to test real file operations
# and connection sharing patterns.
with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
    db_path = f.name

try:
    init_database(db_path)
    with get_connection(db_path) as conn:
        # Create account
        account = Account(id=None, name="Checking", account_type="checking", created_at="2026-01-01T10:00:00Z")
        account_id = insert_account(conn, account)
        assert account_id == 1

        # Create category
        category = Category(id=None, name="Groceries", category_type="expense", created_at="2026-01-01T10:00:00Z")
        category_id = insert_category(conn, category)
        assert category_id == 1

        # Create transaction
        transaction = Transaction(
            id=None,
            account_id=1,
            category_id=1,
            amount_cents=-4567,  # -$45.67
            description="Weekly groceries",
            transaction_date="2026-01-15",
            created_at="2026-01-15T10:00:00Z"
        )
        tx_id = insert_transaction(conn, transaction)
        assert tx_id == 1
finally:
    os.unlink(db_path)

# Amounts stored as cents
cents = validate_amount("-45.67")
assert cents == -4567

cents = validate_amount("2500.00")
assert cents == 250000
```
