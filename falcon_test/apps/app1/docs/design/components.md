# Components: Warehouse Inventory CLI

## Module Overview

```
warehouse_cli/
├── __init__.py          # Package marker, version
├── __main__.py          # Entry point: python -m warehouse_cli
├── cli.py               # Argument parsing, command routing
├── commands.py          # Business logic for each command
├── database.py          # Database connection, queries
├── models.py            # Data classes, validation
├── formatters.py        # Output formatting (table, JSON, CSV)
├── exceptions.py        # Custom exception hierarchy
└── security.py          # Security verification (permissions, multi-user detection)
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

**Purpose**: Entry point for `python -m warehouse_cli`

**Contents**:
```python
from warehouse_cli.cli import main
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
- `main()` → entry point, parses args, calls commands

**Dependencies**: `commands`, `exceptions`

**Does NOT**: Execute business logic, access database directly

---

### `commands.py`

**Purpose**: Business logic for each CLI command

**Responsibilities**:
1. Implement each command as a function
2. Coordinate database operations and return structured data to cli.py
3. Enforce business rules (e.g., quantity >= 0)

**Public interface**:
- `cmd_init(db_path: str, force: bool) → None`
- `cmd_add_item(db_path: str, sku: str, name: str, quantity: int, ...) → int`
- `cmd_update_stock(db_path: str, sku: str, operation: str, amount: int) → tuple[int, int]`
- `cmd_search(db_path: str, sku: str | None, name: str | None, location: str | None) → list[Product]`

**Search Validation:** Search inputs use lenient validation (any characters allowed) because parameterized queries prevent SQL injection. See technical.md AD5 for the full specification.
- `cmd_low_stock_report(db_path: str, threshold: int | None) → list[LowStockItem]`
- `cmd_export_csv(db_path: str, output: str, filter_location: str | None, force: bool) → int`
- `cmd_delete_item(db_path: str, sku: str, force: bool) → None`
- `cmd_update_item(db_path: str, sku: str, name: str | None, description: str | None, location: str | None, min_stock_level: int | None) → Product`

**Dependencies**: `database`, `models`, `formatters`, `exceptions`

**Does NOT**: Parse CLI arguments, handle exit codes

**Data Flow to Formatters:**

The data flow for output formatting works as follows:
1. `commands.py` executes business logic and returns structured data objects (dataclasses, dicts) to `cli.py`
2. `cli.py` receives the data and invokes `formatters.py` to convert it into user-facing output (table, JSON, CSV)

The dependency `commands.py -> formatters.py` in the dependency graph exists because commands.py imports model types that formatters.py also uses, but the actual formatting call is made by `cli.py`. This design keeps cli.py responsible for all output presentation while commands.py focuses purely on business logic.

**Command Specifications:**

**`cmd_delete_item(db_path: str, sku: str, force: bool) → None`**

Deletes an item from the inventory by SKU.

- **Parameters:**
  - `db_path`: Path to the database file
  - `sku`: The SKU of the item to delete (validated using `validate_sku`)
  - `force`: If False, prompts for confirmation before deletion; if True, deletes without confirmation
- **Behavior:**
  - Validates SKU format
  - Raises `ItemNotFoundError` if no item with the given SKU exists
  - If `force=False`, requires user confirmation (handled by cli.py before calling this function)
  - Deletes the product record from the database
  - Operation is atomic (uses database transaction)
- **Returns:** None on success
- **Raises:** `ValidationError`, `ItemNotFoundError`, `DatabaseError`

**`cmd_update_item(db_path: str, sku: str, name: str | None, description: str | None, location: str | None, min_stock_level: int | None) → Product`**

Updates non-quantity fields of an existing item. Use `cmd_update_stock` for quantity changes.

- **Parameters:**
  - `db_path`: Path to the database file
  - `sku`: The SKU of the item to update (cannot be changed)
  - `name`: New name for the item (if provided, validated using `validate_name`)
  - `description`: New description (if provided, validated using `validate_description`)
  - `location`: New location (if provided, validated using `validate_location`)
  - `min_stock_level`: New minimum stock level (if provided, validated using `validate_min_stock_level`)
- **Behavior:**
  - At least one field must be provided for update; raises `ValidationError` if all optional fields are None
  - Validates SKU format and each provided field
  - Raises `ItemNotFoundError` if no item with the given SKU exists
  - Updates only the provided fields; unchanged fields retain their current values
  - Updates `updated_at` timestamp
  - Operation is atomic (uses database transaction)
- **Null/Empty Value Handling:**
  - **Not provided (None)**: Field is not updated, retains current value
  - **Empty string (`""`)**: For optional fields (description, location), normalized to NULL in database
  - **Value provided**: Field is updated with the validated and normalized value
  - Example: `update-item WH-001 --description ""` sets description to NULL (clears the field)
  - Example: `update-item WH-001 --name "New Name"` updates name, leaves other fields unchanged
- **Returns:** The updated `Product` object
- **Raises:** `ValidationError`, `ItemNotFoundError`, `DatabaseError`

---

### `database.py`

**Purpose**: Database connection and SQL operations

**Responsibilities**:
1. Create/connect to SQLite database
2. Run schema migrations (create tables)
3. Execute parameterized queries
4. Handle transactions

**Public interface**:
- `init_database(path: str) → None` — Creates database file and runs schema creation. Idempotent.
- `get_connection(path: str) → ContextManager[sqlite3.Connection]` — Context manager that yields connection, commits on success, rollbacks on exception, always closes.
- `insert_product(conn, product: Product) → int`
- `update_product_quantity(conn, sku: str, new_quantity: int) → None`
- `find_product_by_sku(conn, sku: str) → Product | None`
- `search_products(conn, sku: str | None, name: str | None, location: str | None) → list[Product]`
- `find_low_stock(conn, threshold: int | None) → list[LowStockItem]`
- `get_all_products(conn, location: str | None) → list[Product]`
- `delete_product(conn, sku: str) → None`
- `update_product(conn, sku: str, name: str | None, description: str | None, location: str | None, min_stock_level: int | None) → Product`

**Dependencies**: `models`, `exceptions`

**Does NOT**: Validate business rules, format output

**Critical constraint**: ALL queries use parameterized placeholders (`?`). No string interpolation.

**Connection Management Strategy:**

The context manager pattern is the ONLY supported connection strategy for v1. This design decision has the following implications:

| Aspect | Current Design | Alternative (Not Implemented) |
|--------|---------------|------------------------------|
| Connection lifecycle | Per-command (short-lived) | Connection pooling |
| Concurrency model | Single connection per operation | Pool with multiple connections |
| Exception handling | Context manager auto-rollback | Manual transaction management |
| Future extensibility | See upgrade path below | N/A |

**Rollback behavior on exceptions:**
- ANY unhandled exception within the `with get_connection(...)` block triggers automatic rollback
- This includes `ValidationError`, `ItemNotFoundError`, and unexpected exceptions
- Callers MUST NOT catch exceptions inside the context manager if transaction integrity is required
- If partial work within a transaction must be preserved, refactor into separate transactions

**Future Extensibility - Connection Pooling:**

If concurrency requirements increase beyond single-user CLI usage, the following upgrade path is available WITHOUT breaking the public interface:

```python
# Future: get_connection() can internally use a pool while maintaining the same interface
# This is a non-breaking change as the context manager protocol remains identical

class ConnectionPool:
    """Future enhancement for high-concurrency scenarios."""
    def __init__(self, db_path: str, max_connections: int = 5):
        self._pool = queue.Queue(max_connections)
        for _ in range(max_connections):
            self._pool.put(sqlite3.connect(db_path))

    @contextmanager
    def get_connection(self):
        conn = self._pool.get()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self._pool.put(conn)  # Return to pool instead of closing
```

**Note:** Connection pooling is NOT implemented in v1. The current per-command connection strategy is sufficient for the single-user CLI use case and simpler to reason about.

---

### `models.py`

**Purpose**: Data classes and validation logic

**Responsibilities**:
1. Define `Product` dataclass
2. Define `LowStockItem` dataclass
3. Validate field constraints

**Public interface**:
```python
@dataclass
class Product:
    id: int | None
    sku: str
    name: str
    description: str | None
    quantity: int
    min_stock_level: int
    location: str | None
    created_at: str
    updated_at: str

@dataclass
class LowStockItem:
    sku: str                    # Format: /^[A-Z0-9-]+$/, max 50 chars, non-empty
    name: str                   # Max 200 chars, non-empty
    quantity: int               # >= 0, must be < min_stock_level for item to appear in report
    min_stock_level: int        # >= 0
    deficit: int                # Calculated field: min_stock_level - quantity, always > 0

def validate_sku(sku: str) → str  # raises ValidationError
def validate_name(name: str) → str  # raises ValidationError
def validate_quantity(quantity: int) → int  # raises ValidationError
def validate_min_stock_level(level: int) → int  # raises ValidationError
def validate_description(description: str | None) → str | None  # raises ValidationError
def validate_location(location: str | None) → str | None  # raises ValidationError
def validate_path(path: str) → str  # raises ValidationError, returns absolute path
```

**Validator normalization behavior:**

Input normalization transforms user data into a consistent format before storage (e.g., stripping whitespace, converting empty strings to NULL). This is unrelated to database schema normalization.

| Validator | Strips whitespace? | Other normalization | Example |
|-----------|-------------------|---------------------|---------|
| `validate_sku` | Yes (leading/trailing) | None | `"  WH-001  "` -> `"WH-001"` |
| `validate_name` | Yes (leading/trailing) | None | `"  Widget  "` -> `"Widget"` |
| `validate_quantity` | N/A (int input) | None | `100` -> `100` |
| `validate_description` | Yes (leading/trailing) | Empty string becomes None | `"  "` -> `None` |
| `validate_location` | Yes (leading/trailing) | Empty string becomes None | `"Aisle-A "` -> `"Aisle-A"` |
| `validate_path` | Yes (leading/trailing) | Converts to absolute path | `"./db.sqlite"` -> `"/full/path/db.sqlite"` |

**Important:** All string validators strip leading and trailing whitespace BEFORE validation. This means:
- `"  WH-001  "` becomes `"WH-001"` (valid)
- `"  "` (only whitespace) becomes `""` and fails non-empty validation
- The returned value is the normalized (stripped) version

**Whitespace-only optional fields:** For optional fields (description, location), whitespace-only strings like `"   "` strip to `""` and become `None`. This ensures whitespace-only input is treated as "no value provided".

**Empty string handling:** Explicit empty strings (`""`) are treated the same as whitespace-only strings for optional fields - they become `None`. For required fields (sku, name), empty strings fail validation with "cannot be empty" error.

**Dependencies**: `exceptions`

**Does NOT**: Access database, format output

---

### `formatters.py`

**Purpose**: Format data for output (table, JSON, CSV)

**Responsibilities**:
1. Format product lists as ASCII tables
2. Format product lists as JSON
3. Write product lists to CSV files

**Public interface**:
- `format_table(products: list[Product], columns: list[str]) → str`
- `format_json(products: list[Product]) → str`
- `write_csv(products: list[Product], path: str) → None`
- `format_low_stock_table(items: list[LowStockItem]) → str`
- `format_low_stock_json(items: list[LowStockItem]) → str`

**Dependencies**: `models`

**Does NOT**: Access database, validate input

---

### `exceptions.py`

**Purpose**: Custom exception hierarchy

**Contents**:
```python
class WarehouseError(Exception):
    """Base exception for warehouse CLI."""
    exit_code = 1

class ValidationError(WarehouseError):
    """Invalid input data."""
    exit_code = 1

class DatabaseError(WarehouseError):
    """Database operation failed."""
    exit_code = 2

class ItemNotFoundError(WarehouseError):
    """Requested item does not exist."""
    exit_code = 3

class DuplicateItemError(WarehouseError):
    """Item with this SKU already exists."""
    exit_code = 4

class SecurityError(WarehouseError):
    """Security violation detected.

    Examples:
    - Database file not owned by current user
    - Cannot verify file permissions
    - Symlink detected where regular file expected

    Note: SecurityError uses exit_code = 2 (same as DatabaseError) because
    security violations typically occur during database operations and should
    block database access. The separate exception type allows catching
    security issues specifically while maintaining consistent exit behavior.
    """
    exit_code = 2
```

**Dependencies**: None

---

### `security.py`

**Purpose**: Security verification for database operations

**Responsibilities**:
1. Detect multi-user environments
2. Verify secure file permissions
3. Prevent unauthorized database access

**Public interface**:
- `detect_multiuser_environment() → bool` — Detects if the system has multiple users with potential access to the database. Returns True if multi-user environment detected, False otherwise. Results are cached in-memory for process lifetime.
- `verify_secure_permissions(db_path: Path) → None` — Verifies database file has secure permissions (0600 on Unix/Linux, restrictive ACLs on Windows). Raises SecurityError if permissions are incorrect or cannot be verified.

**Implementation Details**:
- **Multi-user Detection:**
  - Unix/Linux: Uses `getent passwd` to count users with UID >= 1000, checks group membership via `getent group`
  - Windows: Checks NTFS ACLs for multiple user principals with access to database directory
  - Fallback: If detection tools unavailable, checks directory permissions (mode & 0o077 != 0)
  - Caching: Detection runs once per CLI invocation, results cached in-memory
  - Timeout: Windows ACL lookups timeout after 5 seconds

- **Permission Verification:**
  - Atomic permission setting: Uses `os.open()` with O_CREAT | O_EXCL for new files
  - Unix/Linux: Verifies mode == 0o600 via `os.stat(db_path).st_mode & 0o777`
  - Windows: Verifies restrictive ACLs (owner-only access)
  - Raises SecurityError on permission violations or verification failures

**Dependencies**: `exceptions`

**Does NOT**: Modify database content, format output

---

## Dependency Graph

```
__main__.py  # Entry point: python -m warehouse_cli
  └── cli.py
        ├── commands.py
        │     ├── database.py
        │     │     ├── security.py
        │     │     │     └── exceptions.py
        │     │     ├── models.py
        │     │     └── exceptions.py
        │     ├── models.py
        │     └── exceptions.py
        ├── formatters.py
        │     └── models.py
        └── exceptions.py
```

**Rule**: No circular dependencies. Lower layers don't import from higher layers.

**Security Module Integration:**
- `security.py` is a dependency of `database.py`, called during database initialization
- Security checks occur before any database operations begin
- `database.py` imports and calls `verify_secure_permissions()` during `init_database()`
- `database.py` imports and calls `detect_multiuser_environment()` during connection setup

### Dependency Design Rationale

The dependency graph shows multiple modules importing from shared lower-level modules (`models.py`, `exceptions.py`). This is intentional and does NOT create circular dependencies:

**Why multiple imports of shared modules (`models.py`, `exceptions.py`) are safe:**

Both `models.py` and `exceptions.py` are "leaf" modules with no upward dependencies - they only import from Python's standard library or each other. Multiple modules can safely import from them without creating circular dependencies. The "diamond" pattern (e.g., both `commands.py` and `database.py` importing `models.py`) is intentional and safe.

**Architectural constraint to prevent future issues:**
- `models.py` MUST NOT import from `database.py`, `commands.py`, `cli.py`, or `formatters.py`
- `exceptions.py` MUST NOT import from any application module
- If `models.py` ever needs database-specific logic, that logic MUST be placed in a separate module or in `database.py` itself

**Tight coupling mitigation:**
While `exceptions.py` is imported by multiple layers, this is acceptable because:
1. Exception types are part of the public API contract between layers
2. Changes to exception types are rare and require coordinated updates
3. The alternative (layer-specific exceptions) would create more complexity without benefit

**Exception Extensibility Guidelines:**

When adding new exception types, follow this decision process:

| Scenario | Where to Add | Rationale |
|----------|--------------|-----------|
| New error for existing exit code | Add to `exceptions.py` | Maintains centralized exception hierarchy |
| New exit code needed | Add to `exceptions.py` with new `exit_code` | Exit codes are part of public CLI contract |
| Layer-specific internal error | Add to `exceptions.py` | Even internal errors benefit from centralized location |
| Temporary/experimental exception | Add to `exceptions.py` with `# EXPERIMENTAL` comment | Prevents proliferation of exception locations |

**Adding a New Exception Type (REQUIRED process):**

1. Add the new exception class to `exceptions.py`:
   ```python
   class NewErrorType(WarehouseError):
       """Description of when this error occurs."""
       exit_code = N  # Choose unused exit code or reuse existing
   ```

2. Update `cli.py` exception handler if new exit code is introduced

3. Document the new exception in this file (components.md)

4. Add test cases for the new exception type

**Why NOT to use layer-specific exceptions:**
- Layer-specific exceptions (e.g., `DatabaseSpecificError` in `database.py`) would create import complexity
- Catching exceptions across layers would require importing from multiple modules
- The CLI's exception-to-exit-code mapping would become fragmented
- The current design keeps all exception types visible in one place

**Design Decision: Output Formatting Location**

The `cli.py` module calls `formatters.py`, not `commands.py`. This keeps business logic (commands.py) separate from presentation (formatters.py). Commands return structured data; cli.py handles all output formatting.

---

## CLI Command Data Schemas

This section defines formal type definitions for command inputs and outputs. All commands accept inputs via CLI arguments and return structured data types.

### Common Type Definitions

```typescript
// Base product structure
interface Product {
  id: number | null;          // Auto-generated, null for new products
  sku: string;                // Format: /^[A-Z0-9-]+$/, max 50 chars
  name: string;               // Non-empty, max 200 chars
  description: string | null; // Optional, max 1000 chars
  quantity: number;           // >= 0
  min_stock_level: number;    // >= 0
  location: string | null;    // Optional, max 100 chars
  created_at: string;         // ISO 8601 timestamp
  updated_at: string;         // ISO 8601 timestamp
}

// Low stock item structure
interface LowStockItem {
  sku: string;                // Format: /^[A-Z0-9-]+$/, max 50 chars, non-empty
  name: string;               // Max 200 chars, non-empty
  quantity: number;           // >= 0, must be < min_stock_level for item to appear in report
  min_stock_level: number;    // >= 0
  deficit: number;            // Calculated field: min_stock_level - quantity, always > 0
}
```

### Command Schemas

#### `init` Command

**Input:**
```typescript
interface InitCommandInput {
  db_path: string;            // Path to database file (required)
  force?: boolean;            // Overwrite existing database (default: false)
}
```

**Output:**
```typescript
interface InitCommandOutput {
  status: "success";
  message: string;            // e.g., "Database initialized at /path/to/db.sqlite"
}
```

**Exit Codes:**
- 0: Success
- 1: ValidationError (invalid path)
- 2: DatabaseError (cannot create database)

#### `add` Command

**Input:**
```typescript
interface AddCommandInput {
  db_path: string;                // Path to database file (required)
  sku: string;                    // Required, validated by validate_sku
  name: string;                   // Required, validated by validate_name
  quantity: number;               // Required, >= 0
  min_stock_level?: number;       // Optional, >= 0 (default: 10)
  description?: string | null;    // Optional
  location?: string | null;       // Optional
}
```

**Output:**
```typescript
interface AddCommandOutput {
  status: "success";
  item_id: number;                // Database ID of newly created item
  message: string;                // e.g., "Added item WH-001"
}
```

**Exit Codes:**
- 0: Success
- 1: ValidationError (invalid input)
- 2: DatabaseError (database operation failed)
- 4: DuplicateItemError (SKU already exists)

#### `update-stock` Command

**Input:**
```typescript
interface UpdateStockCommandInput {
  db_path: string;            // Path to database file (required)
  sku: string;                // Required, validated by validate_sku
  operation: "set" | "add" | "subtract";  // Required
  amount: number;             // Required, >= 0
}
```

**Output:**
```typescript
interface UpdateStockCommandOutput {
  status: "success";
  old_quantity: number;       // Quantity before update
  new_quantity: number;       // Quantity after update
  message: string;            // e.g., "Updated stock for WH-001: 50 -> 75"
}
```

**Exit Codes:**
- 0: Success
- 1: ValidationError (invalid input or negative result)
- 2: DatabaseError
- 3: ItemNotFoundError

#### `search` Command

**Input:**
```typescript
interface SearchCommandInput {
  db_path: string;            // Path to database file (required)
  sku?: string | null;        // Optional filter
  name?: string | null;       // Optional filter (case-insensitive substring match)
  location?: string | null;   // Optional filter
  format?: "table" | "json";  // Output format (default: "table")
}
```

**Output:**
```typescript
interface SearchCommandOutput {
  status: "success";
  items: Product[];           // Array of matching products
  count: number;              // Number of results
}
```

**Exit Codes:**
- 0: Success (even if no results found)
- 1: ValidationError
- 2: DatabaseError

#### `low-stock` Command

**Input:**
```typescript
interface LowStockCommandInput {
  db_path: string;            // Path to database file (required)
  threshold?: number | null;  // Optional, defaults to item's min_stock_level
  format?: "table" | "json";  // Output format (default: "table")
}
```

**Output:**
```typescript
interface LowStockCommandOutput {
  status: "success";
  items: LowStockItem[];      // Array of items below threshold
  count: number;              // Number of low-stock items
}
```

**Exit Codes:**
- 0: Success (even if no low-stock items)
- 1: ValidationError
- 2: DatabaseError

#### `export` Command

**Input:**
```typescript
interface ExportCommandInput {
  db_path: string;            // Path to database file (required)
  output: string;             // Output CSV file path (required)
  location?: string | null;   // Optional filter
  force?: boolean;            // Overwrite existing file (default: false)
}
```

**Output:**
```typescript
interface ExportCommandOutput {
  status: "success";
  records_exported: number;   // Number of records written to CSV
  output_path: string;        // Absolute path to output file
  message: string;            // e.g., "Exported 42 records to /path/to/output.csv"
}
```

**Exit Codes:**
- 0: Success
- 1: ValidationError (invalid paths or file exists without --force)
- 2: DatabaseError

#### `delete` Command

**Input:**
```typescript
interface DeleteCommandInput {
  db_path: string;            // Path to database file (required)
  sku: string;                // Required, validated by validate_sku
  force?: boolean;            // Skip confirmation (default: false)
}
```

**Output:**
```typescript
interface DeleteCommandOutput {
  status: "success";
  message: string;            // e.g., "Deleted item WH-001"
}
```

**Exit Codes:**
- 0: Success
- 1: ValidationError or user cancelled confirmation
- 2: DatabaseError
- 3: ItemNotFoundError

#### `update` Command

**Input:**
```typescript
interface UpdateCommandInput {
  db_path: string;                // Path to database file (required)
  sku: string;                    // Item to update (required, cannot be changed)
  name?: string | null;           // Optional, validated by validate_name
  description?: string | null;    // Optional, validated by validate_description
  location?: string | null;       // Optional, validated by validate_location
  min_stock_level?: number | null; // Optional, >= 0
}
```

**Note:** At least one optional field must be provided.

**Three-State Field Behavior:**

Each optional field supports three states:
1. **Not provided (field absent or value is None)**: Field retains current database value
2. **Empty string (`""`)**: For string fields (name, description, location), normalized to NULL (clears the field)
3. **Value provided**: Field is updated with the validated and normalized value

**Examples:**
- `update --sku WH-001 --description ""` → Clears description (sets to NULL)
- `update --sku WH-001 --name "New Name"` → Updates name, leaves description/location/min_stock_level unchanged
- `update --sku WH-001 --location "Aisle-B" --description ""` → Updates location, clears description

**Output:**
```typescript
interface UpdateCommandOutput {
  status: "success";
  item: Product;              // Updated product object
  message: string;            // e.g., "Updated item WH-001"
}
```

**Exit Codes:**
- 0: Success
- 1: ValidationError (no fields provided or invalid values)
- 2: DatabaseError
- 3: ItemNotFoundError

### Error Response Schema

All commands may return error responses in the following format:

```typescript
interface ErrorResponse {
  status: "error";                                                    // Type: string (literal "error")
  error_type: "ValidationError" | "DatabaseError" | "ItemNotFoundError" |
              "DuplicateItemError" | "SecurityError";                // Type: string (enum of error types)
  message: string;                                                    // Type: string - Human-readable error description
  exit_code: 1 | 2 | 3 | 4;                                          // Type: number (literal union of valid exit codes)
  details?: {                                                         // Type: object (optional) - Additional error context
    field?: string;                                                   // Type: string (optional) - Field that failed validation
    value?: string | number | null;                                  // Type: string | number | null (optional) - Invalid value
    constraint?: string;                                              // Type: string (optional) - Constraint that was violated
  };
}
```

**Error Code Enumeration:**

| Exit Code | Error Type | Description | Example Scenarios |
|-----------|------------|-------------|-------------------|
| 1 | ValidationError | Invalid input data | Invalid SKU format, negative quantity, empty required field |
| 2 | DatabaseError | Database operation failed | Cannot connect, disk full, schema error |
| 2 | SecurityError | Security violation detected | File permission error, symlink detected |
| 3 | ItemNotFoundError | Requested item does not exist | Search by non-existent SKU |
| 4 | DuplicateItemError | Item with SKU already exists | Attempting to add item with duplicate SKU |

**Note:** SecurityError uses exit_code 2 (same as DatabaseError) because security violations typically occur during database operations and should block database access.

### Validation Rules Reference

| Field | Type | Constraints | Normalization |
|-------|------|-------------|---------------|
| `sku` | string | Non-empty, alphanumeric + hyphens, max 50 chars | Strip whitespace |
| `name` | string | Non-empty, max 200 chars | Strip whitespace |
| `description` | string \| null | Max 1000 chars, empty becomes null | Strip whitespace |
| `location` | string \| null | Max 100 chars, empty becomes null | Strip whitespace |
| `quantity` | number | >= 0 | None |
| `min_stock_level` | number | >= 0 | None |
| `db_path` | string | Valid file path | Convert to absolute path |
| `output` | string | Valid file path | Convert to absolute path |

### JSON Output Format

When commands use `--format json`, the output follows this structure:

```typescript
interface JSONOutput {
  status: "success" | "error";
  data?: Product[] | LowStockItem[] | Product;  // Command-specific data
  count?: number;                               // For list operations
  error?: string;                               // For error status
}
```

**Example JSON output:**
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "sku": "WH-001",
      "name": "Widget",
      "description": "Standard widget",
      "quantity": 50,
      "min_stock_level": 10,
      "location": "Aisle-A",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-20T14:22:00Z"
    }
  ],
  "count": 1
}
```
