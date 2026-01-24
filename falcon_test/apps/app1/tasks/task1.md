# Task 1: Data Layer

Implement the foundation modules for the Warehouse Inventory CLI.

## Context

Read before starting:
- `docs/design/technical.md` - Architecture decisions (especially AD1-AD6)
- `docs/design/components.md` - Module specifications
- `docs/systems/database/schema.md` - SQLite schema and query patterns
- `docs/systems/errors.md` - Exception hierarchy

## Scope

- [ ] `warehouse_cli/__init__.py` - Package marker with `__version__ = "0.1.0"`
- [ ] `warehouse_cli/exceptions.py` - Full exception hierarchy:
  - WarehouseError (base class, exit_code=1)
  - ValidationError (inherits WarehouseError, exit_code=1)
  - DatabaseError (inherits WarehouseError, exit_code=2)
  - ItemNotFoundError (inherits WarehouseError, exit_code=3)
  - DuplicateItemError (inherits WarehouseError, exit_code=4)
- [ ] `warehouse_cli/models.py` - Product and LowStockItem dataclasses, validation functions
  - **Product dataclass fields:** id (int | None), sku (str, max 50 chars), name (str, max 255 chars), description (str | None, max 4096 chars), quantity (int, 0-999999999), min_stock_level (int, 0-999999999, default 10), location (str | None, max 100 chars), created_at (str, ISO 8601), updated_at (str, ISO 8601)
  - **LowStockItem dataclass fields:** sku (str), name (str), quantity (int), min_stock_level (int), deficit (int, calculated as min_stock_level - quantity)
- [ ] `warehouse_cli/database.py` - Connection management, schema creation, all query functions:
  - init_database(path: str) → None - Create database file and schema
  - get_connection(path: str) → ContextManager[Connection] - Read operations context manager
  - get_write_connection(path: str) → ContextManager[Connection] - Write operations context manager with BEGIN IMMEDIATE
  - insert_product(conn, product: Product) → int - Insert new product, return id
  - update_product_quantity(conn, sku: str, new_quantity: int) → None - Update quantity
  - find_product_by_sku(conn, sku: str) → Product | None - Find single product by SKU
  - search_products(conn, sku: str | None, name: str | None, location: str | None) → list[Product] - Search with optional criteria
  - find_low_stock(conn, threshold: int | None) → list[LowStockItem] - Low stock report
  - get_all_products(conn, location: str | None) → list[Product] - Get all products for export

## Constraints

- **AD1**: Layered architecture - database layer must not validate business rules
- **AD4**: All queries MUST use parameterized placeholders (`?`). No string interpolation.
- **AD6**: Use context managers for all database connections

## Tests Required

- Unit tests for `validate_sku()`, `validate_name()`, `validate_quantity()`, `validate_min_stock_level()`, `validate_location()`, `validate_description()`
- Unit tests for `validate_path()` - valid path, path with `..`, non-existent parent directory
- Unit tests for each database function using in-memory SQLite
- Test exception hierarchy (exit codes, inheritance)
- Test DatabaseError when database file cannot be opened (e.g., file not found, permission denied)
- **Database file permissions test (Unix only):** Verify that `init_database()` creates files with 0600 permissions on Unix systems. Use `os.stat(db_path).st_mode & 0o777` to check.

### Additional Validation Test Cases

**Max length constraints:**
- SKU at exactly 50 characters (valid)
- SKU at 51 characters (invalid)
- Name at exactly 255 characters (valid)
- Name at 256 characters (invalid)
- Description at exactly 4096 characters (valid)
- Description at 4097 characters (invalid)
- Location at exactly 100 characters (valid)
- Location at 101 characters (invalid)

**Special characters:**
- SKU with only allowed chars: `A-Za-z0-9_-` (valid)
- SKU with spaces (invalid)
- SKU with special chars: `@#$%` (invalid)
- Name with special chars and punctuation (valid - any printable)
- Description with HTML-like content: `<script>` (valid - stored as literal)

**Unicode handling:**
- Name with Unicode: `Widget` (valid)
- Name with emoji: `Widget` (valid - any printable)
- Location with Unicode: `Aisle-A` (valid)

**Boundary values:**
- Quantity at 0 (valid minimum)
- Quantity at -1 (invalid)
- Quantity at 999,999,999 (valid maximum - this is the MAX_INT referenced in the codebase, defined in schema.md CHECK constraints)
- Quantity at 1,000,000,000 (invalid - exceeds maximum)
- min_stock_level at 0 (valid minimum)
- min_stock_level at -1 (invalid)
- min_stock_level at 999,999,999 (valid maximum)

## Not In Scope

- CLI argument parsing (Task 2)
- Command business logic (Task 3)
- Output formatting (Task 3)
- CSV export (Task 4)

## Acceptance Criteria

```python
# Can create database and insert a product
import tempfile
import os
from warehouse_cli.database import init_database, get_connection, insert_product
from warehouse_cli.models import Product

# Use temp file (not :memory: which creates separate DBs per connection)
with tempfile.TemporaryDirectory() as tmpdir:
    db_path = os.path.join(tmpdir, "test.db")
    init_database(db_path)
    with get_connection(db_path) as conn:
        product = Product(id=None, sku="WH-001", name="Widget", ...)
        product_id = insert_product(conn, product)
        assert product_id == 1
```

**Test database location guidance:**

All test files SHOULD use `tempfile.TemporaryDirectory()` for test databases to ensure:
1. Tests are isolated and don't interfere with each other
2. Test databases are automatically cleaned up after tests
3. Tests work reliably in CI environments without permission issues

**Avoid** using relative paths like `./test.db` in test code, as these can cause test pollution and cleanup issues.
