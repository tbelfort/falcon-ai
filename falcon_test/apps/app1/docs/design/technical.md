# Technical Design: Warehouse Inventory CLI

## Technology Choices

### Language: Python 3.10+

**Rationale**:
- Target users likely have Python installed (common on macOS/Linux)
- Rich standard library reduces dependencies
- Type hints (3.10+) improve code quality
- Cross-platform without compilation

**Constraint**: Standard library only. No pip dependencies.

**Version Compatibility**:
- **Minimum version**: Python 3.10.0
- **Maximum tested version**: Python 3.12.x
- **Known incompatibilities**: None for Python 3.10-3.12. Python 3.13+ has not been tested and may have changes to standard library modules (sqlite3, argparse) that could affect compatibility.
- **Recommendation**: Use Python 3.10.x or 3.11.x for production deployments. Python 3.12+ should be tested in your environment before deployment.

**Windows Deployments with Sensitive Data:**

For Windows deployments requiring database file permission verification, `pywin32` (>=305) is an **optional dependency**. This is NOT a core dependency and is only needed when:
- Deploying on Windows (not needed on Linux/macOS which have native POSIX permission APIs)
- Sensitive data requires permission verification (production security requirement)
- Standard library `os.stat()` is insufficient (Windows ACLs require `pywin32` for detailed inspection)

**Installation (Windows only, when needed):**
```bash
pip install pywin32>=305
```

**Fallback behavior:** If `pywin32` is not available on Windows, the application MUST log a warning and skip permission verification, rather than failing. This allows the tool to function in development environments without the additional dependency.

**Required Standard Library Modules:**

All modules listed below are part of Python's standard library and are guaranteed to be available in Python 3.10+. No additional installation is required.

| Module | Purpose |
|--------|---------|
| `sqlite3` | Database operations |
| `argparse` | CLI argument parsing |
| `json` | JSON output formatting |
| `csv` | CSV export |
| `os` | File path operations, permissions |
| `stat` | File permission constants |
| `contextlib` | Context manager utilities |
| `dataclasses` | Model definitions |
| `datetime` | Timestamp generation |
| `typing` | Type hint support |
| `re` | Regular expressions for validation |
| `shutil` | File operations (backup) |

**Python 3.10+ Specific Features Used:**

| Feature | Syntax | Backport Alternative |
|---------|--------|---------------------|
| Union type syntax | `int \| None` | `Union[int, None]` from typing |
| Type parameter syntax | `list[Product]` | `List[Product]` from typing |
| Match statements | `match/case` | NOT USED (if/elif chains instead) |
| Parenthesized context managers | `with (open(...) as f, ...)` | NOT USED (nested with statements) |

**Backport Considerations:** If backporting to Python 3.8-3.9 is required:
1. Replace `X | None` with `Optional[X]` from typing
2. Replace `list[X]` with `List[X]` from typing
3. Replace `dict[K, V]` with `Dict[K, V]` from typing
4. No other code changes required (match statements not used)

### Database: SQLite3

**Rationale**:
- Zero configuration, single file
- Included in Python standard library
- Handles 50,000+ rows easily
- Supports concurrent reads (single writer)

**Constraint**: Use `sqlite3` module only. No ORM, no SQLAlchemy.

**Rejected Alternatives**:
- **PostgreSQL**: External server setup required. Adds operational complexity (server installation, user management, network configuration) incompatible with "zero configuration" goal. Overkill for single-user CLI tool with 50,000 row target.
- **MySQL**: Same operational overhead as PostgreSQL. Requires server process, network configuration, and user authentication. Not suitable for lightweight CLI applications.
- **DuckDB**: Not in Python standard library. Would require external dependency (violates constraint). While excellent for analytics, adds installation friction for simple inventory management.
- **JSON/CSV files**: No concurrent access support. No ACID transactions. Poor query performance for 50,000+ rows. Unsuitable for multi-user scenarios.

**SQLite Version Requirements**:
- Minimum SQLite version: 3.24.0 (required for WAL mode stability, released 2018-06-04)
- Required for: `BEGIN IMMEDIATE` transactions, WAL mode, `PRAGMA busy_timeout`
- Verification: Run `python3 -c "import sqlite3; print(sqlite3.sqlite_version)"` to check SQLite version
- Note: Python's bundled sqlite3 module version depends on the system's SQLite library

**SQLite Version Enforcement (MANDATORY):**

Implementations MUST perform runtime validation of the SQLite version at application startup. This check MUST occur before any database operations are attempted:

```python
import sqlite3

MINIMUM_SQLITE_VERSION = (3, 24, 0)

def validate_sqlite_version() -> None:
    """Validate SQLite version meets minimum requirements.

    REQUIRED: Call this at application startup, before any database operations.

    Raises:
        RuntimeError: If SQLite version is below minimum required version.
    """
    current_version = sqlite3.sqlite_version_info  # Returns tuple like (3, 39, 0)
    if current_version < MINIMUM_SQLITE_VERSION:
        raise RuntimeError(
            f"SQLite version {sqlite3.sqlite_version} is not supported. "
            f"Minimum required version is 3.24.0. "
            f"Please upgrade your system's SQLite library."
        )

# Call at module load or application entry point
validate_sqlite_version()
```

**Startup Integration:**
- The validation MUST be called in the CLI entry point (e.g., `cli.py:main()`) before parsing arguments
- The error message MUST include the current version and the minimum required version
- Exit code for version mismatch: 1 (ValidationError category)

### CLI Framework: argparse

**Rationale**:
- Standard library (no dependencies)
- Sufficient for our command structure
- Well-documented, familiar to Python developers

**Rejected alternatives**:
- Click: External dependency
- Typer: External dependency
- Fire: Magic behavior, harder to control

**Dependency Exception Process (for future consideration)**:

While this project maintains a zero external dependency constraint, the following process MUST be followed if a critical need arises:

| Criteria | Requirement |
|----------|-------------|
| Security vulnerability in stdlib | Document CVE, assess workaround feasibility, escalate to maintainers |
| Missing critical functionality | Document use case, evaluate stdlib alternatives, consider vendoring |
| Performance requirements | Benchmark stdlib solution first, document gap with metrics |

**Escape hatch**: If external dependencies become necessary:
1. Create a dedicated issue documenting the requirement and alternatives evaluated
2. Prefer pure-Python packages with minimal transitive dependencies
3. Pin exact versions and audit for security
4. Update deployment documentation to reflect new requirements

---

## Architecture Decisions

### AD1: Layered Architecture

```
CLI Layer (cli.py)
    ↓ parses args, routes commands
Command Layer (commands.py)
    ↓ business logic, validation
Database Layer (database.py)
    ↓ SQL queries, connection management
```

**Rationale**: Separation of concerns. CLI parsing separate from business logic separate from data access.

### AD2: No Global State

Each command receives explicit parameters. No module-level database connections or configuration objects.

**Rationale**: Testability, predictability, no hidden coupling.

### AD3: Explicit Error Types

Custom exception hierarchy maps to exit codes:

```python
WarehouseError (base)
├── ValidationError      → exit 1
├── DatabaseError        → exit 2
├── ItemNotFoundError    → exit 3
└── DuplicateItemError   → exit 4
```

**Rationale**: Callers can catch specific errors. Exit codes are predictable.

### AD4: Parameterized Queries Only

**All SQL queries MUST use parameterized placeholders (`?`).**

Never:
```python
cursor.execute(f"SELECT * FROM products WHERE sku = '{sku}'")  # WRONG
```

Always:
```python
cursor.execute("SELECT * FROM products WHERE sku = ?", (sku,))  # RIGHT
```

**Rationale**: Prevents SQL injection. Non-negotiable.

**Dynamic Query Verification:**

When building queries with optional parameters, verify placeholder count matches parameter count. The canonical implementation is in ARCHITECTURE-simple.md S1 which specifies:

```python
if query.count("?") != len(params):
    raise DatabaseError(f"Query/param mismatch: {query.count('?')} placeholders, {len(params)} params")
cursor.execute(query, params)
```

**Why `if/raise` instead of `assert`:** Python's `-O` flag disables assertions in production. Always use explicit runtime validation for security checks. See ARCHITECTURE-simple.md S1 for the complete specification including error message format and exception type requirements.

### AD5: Input Validation at Boundary

Validate all user input in the CLI layer before passing to commands:
- SKU: non-empty string, max 50 chars, alphanumeric/hyphen/underscore only
- Name: non-empty string, max 255 chars
- Quantity: non-negative integer, max 999,999,999
- Path: valid filesystem path, no `..` traversal

**Rationale**: Fail fast with clear error messages. Don't let bad data reach database layer.

**Search Command Leniency (part of AD5):**

Search accepts any characters in `--sku`, `--name`, `--location` (max 1000 chars). This is safe because parameterized queries prevent SQL injection.

Write commands (`add-item`, `update-stock`) still enforce strict validation.

### AD6: Atomic Database Operations

Each command is a single transaction. Either fully succeeds or fully fails.

**Rationale**: No partial updates. Database always in consistent state.

**Transaction management details:**

1. **Ownership**: The `database.py` module manages all transactions via the `get_connection()` context manager.

2. **Context manager behavior:**
   ```python
   @contextmanager
   def get_connection(db_path: str):
       conn = sqlite3.connect(db_path)
       conn.row_factory = sqlite3.Row
       try:
           yield conn
           conn.commit()  # Auto-commit on success
       except Exception:
           conn.rollback()  # Auto-rollback on any exception
           raise
       finally:
           conn.close()  # Always close
   ```

3. **Usage pattern in commands.py:**
   ```python
   def cmd_add_item(db_path: str, sku: str, name: str, ...):
       with get_connection(db_path) as conn:
           # All operations within this block are one transaction
           product = insert_product(conn, product)
           # If any exception occurs, rollback happens automatically
       # Commit happens automatically when block exits normally
   ```

4. **Rollback behavior:**
   - Any exception (including `ValidationError`, `DatabaseError`, etc.) triggers automatic rollback
   - The original exception is re-raised after rollback
   - No partial data is written to the database

5. **Commands MUST NOT:**
   - Call `conn.commit()` or `conn.rollback()` directly
   - Use nested transactions
   - Hold connections open between commands

6. **Stock adjustment operations:**

   Stock adjustments (`update-stock`) use `BEGIN IMMEDIATE` to acquire a write lock at transaction start. This ensures two people updating the same item's stock won't overwrite each other's changes.

   | Command | Transaction Type |
   |---------|------------------|
   | `update-stock` | BEGIN IMMEDIATE (read-modify-write) |
   | `add-item` | Regular (pure insert) |
   | `search`, `low-stock-report`, `export-csv` | Regular (read-only) |

   If the database is busy for 30+ seconds: "Database is busy. Please try again shortly." (exit code 2)

   **Concurrent Transaction Example - Lost Update Prevention:**

   The following demonstrates how `BEGIN IMMEDIATE` prevents lost updates in concurrent stock adjustments. First, the failure mode without proper locking:

   **WITHOUT BEGIN IMMEDIATE (Lost Update Scenario):**
   ```
   Time    Process A                          Process B
   ────────────────────────────────────────────────────────────────────
   T1      BEGIN                              BEGIN
   T2      SELECT qty FROM products           SELECT qty FROM products
           WHERE sku='WH-001'                 WHERE sku='WH-001'
           → qty = 10                         → qty = 10 (stale read!)
   T3      UPDATE products SET qty=2          UPDATE products SET qty=5
           WHERE sku='WH-001'                 WHERE sku='WH-001'
   T4      COMMIT                             COMMIT
           (qty now 2)                        (qty now 5 - overwrites A!)
   ```
   **Problem:** Process B's update to qty=5 overwrites Process A's update to qty=2 because both read the same initial value (10). The final quantity is 5, but it should reflect both operations. This is a lost update.

   **WITH BEGIN IMMEDIATE (Correct Serialization):**
   ```
   Time    Process A                          Process B
   ────────────────────────────────────────────────────────────────────
   T1      BEGIN IMMEDIATE
           (acquires write lock)
   T2      SELECT qty FROM products           BEGIN IMMEDIATE
           WHERE sku='WH-001'                 (blocks - waiting for lock)
           → qty = 10
   T3      UPDATE products SET qty=2          ... waiting ...
           WHERE sku='WH-001'
   T4      COMMIT                             ... waiting ...
           (releases write lock)
   T5                                         (acquires write lock)
                                              SELECT qty FROM products
                                              WHERE sku='WH-001'
                                              → qty = 2 (correct!)
   T6                                         UPDATE products SET qty=0
                                              WHERE sku='WH-001'
   T7                                         COMMIT
                                              (releases write lock)
   ```

   **Solution:** Process B is blocked from reading until Process A commits. Process B then reads the correct post-update value (qty=2), preventing lost updates. The write lock ensures serializable isolation.

---

## Data Model

### Products Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| sku | TEXT | UNIQUE NOT NULL |
| name | TEXT | NOT NULL |
| description | TEXT | nullable |
| quantity | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 AND <= 999999999 |
| min_stock_level | INTEGER | NOT NULL, DEFAULT 10, CHECK >= 0 AND <= 999999999 |
| location | TEXT | nullable |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |

**Indexes**:
- `sku` column: Implicit unique index created automatically by the UNIQUE constraint (do NOT create explicit `idx_products_sku`)
- `idx_products_created_at` on `created_at` (explicit, for timestamp-based queries)
- `idx_products_updated_at` on `updated_at` (explicit, for recently-updated queries)
- `idx_products_location` on `location` (explicit, for location filters)
- `idx_products_quantity` on `quantity` (explicit, for low-stock queries)
- `idx_products_location_quantity` on `(location, quantity)` (composite, for filtered low-stock reports)
- `idx_products_name` on `name` (explicit, for name prefix searches)

**Note:** SQLite automatically creates an internal index for UNIQUE constraints. See `systems/database/schema.md` for the complete index strategy and usage analysis.

**Note**: CHECK constraints are enforced at database level. See `systems/database/schema.md` for exact SQL.

---

## Output Formats

### Table Format (default)

Human-readable, fixed-width columns:
```
SKU       | Name      | Quantity | Location
----------|-----------|----------|----------
WH-001    | Widget A  | 100      | Aisle-A
```

### JSON Format (`--format json`)

Machine-readable, stable schema for non-paginated commands and `--format json-legacy`:
```json
[
  {
    "sku": "WH-001",
    "name": "Widget A",
    "quantity": 100,
    "location": "Aisle-A"
  }
]
```

**JSON Schema Selection:**
- For paginated commands (`search`, `low-stock-report`) with `--format json`: Use wrapped schema with pagination metadata (see Pagination Response Schema section)
- For non-paginated commands (`add-item`, `update-stock`) with `--format json`: Use bare array schema (backward compatible)
- **Backward Compatibility Flag:** `--format json-legacy` forces bare array output for paginated commands (MUST emit warning to stderr: "Warning: json-legacy format does not include pagination metadata. Use --format json for full response.")

**Field Type Specifications:**

| Field | Type | Format | Required | Description |
|-------|------|--------|----------|-------------|
| `sku` | string | max 50 chars | Yes | Product SKU identifier |
| `name` | string | max 255 chars | Yes | Product name |
| `description` | string or null | max 1000 chars | No | Product description (nullable) |
| `quantity` | integer | 0-999999999 | Yes | Current stock quantity |
| `min_stock_level` | integer | 0-999999999 | Yes | Minimum stock threshold |
| `location` | string or null | max 255 chars | No | Storage location (nullable) |
| `created_at` | string | ISO 8601 | Yes | Creation timestamp (YYYY-MM-DDTHH:MM:SS.mmmmmmZ) |
| `updated_at` | string | ISO 8601 | Yes | Last update timestamp (YYYY-MM-DDTHH:MM:SS.mmmmmmZ) |

**Example with all fields:**
```json
{
  "sku": "WH-001",
  "name": "Widget A",
  "description": "Premium widget",
  "quantity": 100,
  "min_stock_level": 10,
  "location": "Aisle-A",
  "created_at": "2026-01-23T10:30:00.000000Z",
  "updated_at": "2026-01-23T14:45:00.000000Z"
}
```

### CSV Format (export only)

RFC 4180 compliant:
- Comma separator
- Double-quote escaping
- UTF-8 encoding
- Header row included

---

## Pagination Response Schema

For commands that support pagination (`search`, `low-stock-report`), the response structure depends on output format:

### JSON Format with Pagination Metadata (MANDATORY for `--format json`)

When `--format json` is used with paginated commands, the response includes both data and metadata:

```json
{
  "data": [
    {
      "sku": "WH-001",
      "name": "Widget A",
      "quantity": 100,
      "location": "Aisle-A"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "count": 1,
    "total": 150,
    "has_more": true
  }
}
```

**Field Naming Consistency (MANDATORY):**
- Top-level results field: MUST be named `"data"` (not "results", not bare array)
- Metadata field: MUST be named `"pagination"` (not "meta", not "paging")
- This schema is the ONLY valid format for `--format json` with paginated commands
- For backward compatibility, `--format json-legacy` provides bare array output (see Output Formats section)

**Pagination Metadata Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `limit` | integer | Maximum number of results requested (1-1000) |
| `offset` | integer | Number of results skipped (0-based) |
| `count` | integer | Actual number of results returned in this response |
| `total` | integer | Total number of matching results in database |
| `has_more` | boolean | True if `offset + count < total` (more results available) |

**Link Relations (Optional Enhancement):**

For improved pagination navigation, implementations MAY include link relations:

```json
{
  "data": [...],
  "pagination": {
    "limit": 100,
    "offset": 100,
    "count": 100,
    "total": 250,
    "has_more": true,
    "links": {
      "self": "search --sku WH --limit 100 --offset 100",
      "first": "search --sku WH --limit 100 --offset 0",
      "prev": "search --sku WH --limit 100 --offset 0",
      "next": "search --sku WH --limit 100 --offset 200",
      "last": "search --sku WH --limit 100 --offset 200"
    }
  }
}
```

**Table Format (default) with Pagination:**

Table format does NOT include pagination metadata in output. Instead, pagination information is printed to stderr:

```
SKU       | Name      | Quantity | Location
----------|-----------|----------|----------
WH-001    | Widget A  | 100      | Aisle-A
...

[Showing results 101-200 of 250 total] (stderr)
```

**COUNT Query Performance Consideration (MANDATORY):**

Table format pagination requires executing a COUNT(*) query to display "X of Y total" information. For large datasets (50,000+ rows) with complex WHERE clauses, COUNT queries can be expensive (100-500ms). Two strategies for managing this:

1. **Eager COUNT (default):** Execute COUNT(*) before main query. If COUNT exceeds 5 seconds, log warning and display "results 101-200 of many" instead.
2. **Lazy COUNT (recommended for production):** Skip COUNT query by default. Add `--show-total` flag to explicitly request total count. Display "Showing results 101-200" without total.

**Implementation pattern:**
```python
def format_table_pagination(offset: int, count: int, total: int | None = None) -> str:
    """Format pagination info for table output (printed to stderr).

    Args:
        offset: Starting position (0-based)
        count: Number of results in current page
        total: Total matching results (optional - requires COUNT query)
    """
    start = offset + 1
    end = offset + count
    if total is not None:
        return f"[Showing results {start}-{end} of {total} total]"
    else:
        return f"[Showing results {start}-{end}]"
```

**For v1 implementation:** Use lazy COUNT approach (no total by default) to avoid performance impact. This resolves the COUNT query performance concern while maintaining usable pagination.

---

## Performance Targets

### Single-User Operations

| Operation | Target | Max dataset | Pagination Required | Notes |
|-----------|--------|-------------|---------------------|-------|
| init | <500ms | n/a | No | One-time setup |
| add-item | <50ms | n/a | No | Single insert |
| update-stock | <50ms | n/a | No | Single update |
| search (by SKU) | <100ms | 50,000 items | **Yes (limit=100 default, max=1000)** | **QUERY EXECUTION TIME ONLY** (excludes CLI startup overhead). Target assumes paginated results with LIMIT clause; uses B-tree index on sku column. CLI flags: `--limit N` (1-1000, default 100), `--offset N` (default 0). End-to-end CLI latency includes Python interpreter startup (80-170ms) plus query execution time. |
| search (by name, substring) | <500ms | 50,000 items | **Yes (limit=100 default, max=1000)** | **QUERY EXECUTION TIME ONLY** (excludes CLI startup overhead). Full table scan required (LIKE '%value%' cannot use B-tree index). For improved substring search performance in production, see schema.md FTS5 section. CLI flags: `--limit N` (1-1000, default 100), `--offset N` (default 0). End-to-end CLI latency includes Python interpreter startup (80-170ms) plus query execution time. |

> **Index Strategy Note:** Performance targets in this table assume queries use the default LIMIT clause (100 results). Without LIMIT, full result set retrieval can be significantly slower. The <100ms target for SKU search relies on the B-tree index defined in schema.md. See `systems/database/schema.md` "Index Definitions" section for the authoritative index strategy.

> **CLI Performance Characteristics - IMPORTANT CLARIFICATION:**
>
> The performance targets in this table measure **query execution time only**, not end-to-end CLI invocation latency. CLI-based applications have inherent startup overhead:
>
> - **Python interpreter startup**: 80-170ms (varies by system, Python version, and environment)
> - **Module import time**: 10-30ms (sqlite3, argparse, etc.)
> - **Query execution time**: As specified in targets above
> - **Total end-to-end latency**: Startup overhead + query execution time
>
> **Example - search by SKU:**
> - Query execution target: <100ms
> - Python startup overhead: ~120ms (typical)
> - **Total CLI invocation time: ~220ms** (100ms query + 120ms startup)
>
> **Rationale for measuring query execution time separately:**
> - Query performance is under our control (indexes, pagination, SQL optimization)
> - Startup overhead is a platform characteristic (not application-specific)
> - Query targets are meaningful for comparing database performance and index effectiveness
> - Applications embedding this as a library avoid CLI startup costs
>
> **For production applications requiring <100ms end-to-end latency:**
> - Consider a long-running server process or daemon mode (eliminates per-request startup overhead)
> - Use Python's `-S` flag to reduce startup time (skips site initialization)
> - Pre-warm the Python interpreter with a persistent process
>
> This distinction is critical for evaluating whether the architecture meets performance requirements. If your use case requires <100ms end-to-end response time including CLI invocation, the CLI-based architecture is not suitable. Consider a client-server architecture with a persistent Python process instead.
>
> **Daemon Mode Specification (OPTIONAL - Not Required for v1):**
>
> The vision document (vision.md Use Case 3: Order Fulfillment) describes warehouse operations requiring rapid successive commands where 220ms+ per-command latency is prohibitive. While CLI startup overhead makes sub-100ms end-to-end latency impossible, a daemon mode could eliminate this overhead.
>
> **If daemon mode is implemented, it MUST include:**
> - Long-running Python process listening on Unix domain socket (e.g., `/tmp/warehouse-cli.sock`)
> - Client command sends request via socket, receives response (no interpreter startup)
> - Daemon lifecycle management: `warehouse-cli daemon start`, `warehouse-cli daemon stop`, `warehouse-cli daemon status`
> - Security: Socket file with 0600 permissions, owned by user running daemon
> - Connection limit: Maximum 10 concurrent client connections per daemon
> - Timeout: 30 second idle timeout per connection
> - Error handling: Daemon crash recovery, automatic restart via systemd/launchd
>
> **Daemon mode is NOT specified for v1.** If use cases require <100ms end-to-end latency, implementers should escalate to stakeholders to decide whether daemon mode development is warranted or if CLI performance characteristics are acceptable.

**Rate Limiting for Search Operations (MANDATORY):**

> **Why rate limiting is needed:** Without rate limits, malicious users could perform many broad searches simultaneously, causing memory exhaustion and denying service to legitimate users. Each unbounded search could attempt to return thousands of rows, consuming significant server resources.

To prevent denial-of-service attacks through concurrent broad searches, implementations MUST enforce the following rate limits:

1. **Concurrent search limit:** Maximum 10 concurrent search operations per database (applies to multi-threaded or server mode; see "CLI Invocation Model Limitation" below for single-process CLI usage). When limit exceeded, return error: `"Error: Too many concurrent searches. Please wait and retry."` with exit code 1.

   **Clarification - Concurrent Limits:**
   - "10 concurrent search operations per database" is an application-level limit enforced by the rate limiter
   - "3 concurrent connections per process" (referenced in Concurrent Access Performance section) is a SQLite connection pool guideline
   - These are independent limits: a single search operation uses one connection, so 10 concurrent searches would require 10 connections (if not using connection pooling) or could share pooled connections

2. **Search rate limit:** Maximum 100 search operations per minute per process using a sliding window. This prevents rapid-fire search queries that could cause memory exhaustion.

3. **Pagination limit enforcement:**
   - When `--limit` exceeds 1000, implementations MUST reject with: `"Error: Limit cannot exceed 1000."` (exit code 1)
   - The application MUST NOT silently cap the limit; users must know their request was rejected

4. **Implementation pattern:**
   ```python
   def validate_search_limit(limit: int) -> None:
       """Validate search limit parameter."""
       if limit > 1000:
           raise ValidationError("Limit cannot exceed 1000")
       if limit < 1:
           raise ValidationError("Limit must be at least 1")
   ```

5. **Rate Limit Enforcement Implementation:**

   **IMPORTANT - CLI Invocation Model Limitation:**

   The in-memory `SearchRateLimiter` class shown below is effective ONLY for long-running server processes or multi-threaded applications. For CLI tools where each command invocation is a separate process, in-memory rate limiting state resets on each invocation, making it ineffective.

   **For CLI applications, choose one of these approaches:**

   a. **SQLite-based rate limiting (MANDATORY for CLI - v1 Implementation):** Store rate limit state in a dedicated SQLite table:

      **Schema Definition (REQUIRED):**
      ```sql
      CREATE TABLE IF NOT EXISTS rate_limits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation TEXT NOT NULL,
          timestamp TEXT NOT NULL,  -- ISO 8601 format: YYYY-MM-DDTHH:MM:SS.mmmmmmZ
          process_id INTEGER,       -- Optional: track by process for debugging
          CONSTRAINT chk_operation CHECK (operation IN ('search', 'export', 'low_stock_report'))
      );

      -- Index for efficient timestamp-based cleanup and counting
      CREATE INDEX IF NOT EXISTS idx_rate_limits_operation_timestamp
      ON rate_limits(operation, timestamp);
      ```

      **Implementation (with race condition fix):**
      ```python
      def acquire_rate_limit_sqlite(db_path: str, operation: str, max_per_minute: int = 100) -> bool:
          """Check rate limit using persistent SQLite storage.

          Creates/uses a rate_limits table to track operation timestamps across CLI invocations.

          Race condition mitigation: Uses BEGIN IMMEDIATE transaction to acquire write lock
          before checking count. This prevents TOCTOU (time-of-check-time-of-use) race.
          """
          with get_connection(db_path) as conn:
              # Acquire write lock immediately to prevent race condition
              conn.execute("BEGIN IMMEDIATE")

              try:
                  # Clean old entries (within same transaction)
                  conn.execute(
                      "DELETE FROM rate_limits WHERE timestamp < datetime('now', '-60 seconds')"
                  )

                  # Check current count (atomic with cleanup and insert)
                  count = conn.execute(
                      "SELECT COUNT(*) FROM rate_limits WHERE operation = ?",
                      (operation,)
                  ).fetchone()[0]

                  if count >= max_per_minute:
                      conn.rollback()
                      return False

                  # Record this operation (still within same transaction)
                  conn.execute(
                      "INSERT INTO rate_limits (operation, timestamp, process_id) "
                      "VALUES (?, datetime('now'), ?)",
                      (operation, os.getpid())
                  )

                  conn.commit()
                  return True
              except Exception:
                  conn.rollback()
                  raise
      ```

      **Error Handling:**
      - If rate limit database table doesn't exist, create it atomically during `init` command
      - If rate limit check fails due to database lock, treat as rate limit exceeded (fail closed)
      - Log all rate limit violations for security monitoring

   b. **File-based locking:** Use a lock file with timestamps for simpler deployments.

   c. **Remove rate limiting claims:** If neither persistent approach is implemented, remove the security claims about rate limiting from documentation to accurately reflect CLI model limitations.

   **In-Memory Implementation (for server/daemon mode only):**

   The following implementation is effective ONLY when the application runs as a long-lived process (e.g., server mode, daemon, or multi-threaded batch processing within a single invocation):

   ```python
   import threading
   import time
   from collections import deque

   class SearchRateLimiter:
       """Enforces concurrent search and rate limits.

       WARNING: This in-memory implementation is ONLY effective for long-running
       processes. For CLI tools with per-command invocations, use SQLite-based
       rate limiting instead.

       REQUIRED: This class MUST be instantiated as a singleton per database.
       """

       def __init__(self, max_concurrent: int = 10, max_per_minute: int = 100):
           self._semaphore = threading.Semaphore(max_concurrent)
           self._timestamps: deque = deque(maxlen=max_per_minute)
           self._lock = threading.Lock()
           self.max_per_minute = max_per_minute

       def acquire(self) -> bool:
           """Acquire rate limit slot. Returns False if rate exceeded."""
           # Check rate limit (sliding window)
           with self._lock:
               now = time.time()
               # Remove timestamps older than 60 seconds
               while self._timestamps and self._timestamps[0] < now - 60:
                   self._timestamps.popleft()
               if len(self._timestamps) >= self.max_per_minute:
                   return False
               self._timestamps.append(now)

           # Check concurrent limit (non-blocking)
           if not self._semaphore.acquire(blocking=False):
               return False
           return True

       def release(self) -> None:
           """Release concurrent search slot."""
           self._semaphore.release()

   # Usage in search command (server mode only):
   _rate_limiter = SearchRateLimiter()

   def cmd_search(db_path: str, ...):
       if not _rate_limiter.acquire():
           raise ValidationError("Too many concurrent searches. Please wait and retry.")
       try:
           # ... perform search ...
           pass
       finally:
           _rate_limiter.release()
   ```

   **Monitoring for rate limit violations (REQUIRED):**

   When rate limits are exceeded, implementations MUST log the event for security monitoring:
   ```python
   log_security_event({
       "event": "rate_limit_exceeded",
       "limit_type": "search_concurrent" | "search_rate",
       "timestamp": get_iso_timestamp(),
       "source": "search_command"
   })
   ```
| low-stock-report | <100ms | 50,000 items | **Yes (limit=100 default, max=1000)** | **QUERY EXECUTION TIME ONLY** (excludes CLI startup overhead). Target assumes paginated results. CLI flags: `--limit N` (1-1000, default 100), `--offset N` (default 0). End-to-end CLI latency includes Python interpreter startup (80-170ms) plus query execution time. |
| export-csv | <5s | 50,000 items | No | **MUST use streaming** (see note below). Performance target includes full end-to-end execution time including CLI startup. |

**Pagination Requirements (MANDATORY for search/low-stock-report):**
- Default `limit`: 100 results per query
- Maximum `limit`: 1000 results (enforced at application layer)
- Default `offset`: 0
- Implementations MUST enforce the maximum limit to prevent unbounded result sets
- The <100ms performance target is ONLY valid when pagination is properly enforced
- Without pagination enforcement, broad searches on 50,000 items could return thousands of rows, making the target unrealistic and potentially causing memory exhaustion

**Performance Target Validation (MANDATORY):**

Implementations MUST include automated performance validation to ensure targets are met:

```python
import time
from dataclasses import dataclass
from typing import Callable, Any

@dataclass
class PerformanceTarget:
    operation: str
    max_ms: int
    dataset_size: int
    with_pagination: bool

PERFORMANCE_TARGETS = [
    PerformanceTarget("search_sku", 100, 50000, True),
    PerformanceTarget("search_name", 500, 50000, True),
    PerformanceTarget("low_stock_report", 100, 50000, True),
    PerformanceTarget("export_csv", 5000, 50000, False),
]

def validate_performance(operation: Callable[[], Any], target: PerformanceTarget) -> bool:
    """Validate operation meets performance target.

    REQUIRED: Run as part of CI/CD pipeline on representative hardware.
    """
    start = time.perf_counter()
    operation()
    elapsed_ms = (time.perf_counter() - start) * 1000

    if elapsed_ms > target.max_ms:
        print(f"PERF FAIL: {target.operation} took {elapsed_ms:.0f}ms "
              f"(target: {target.max_ms}ms)", file=sys.stderr)
        return False
    return True
```

**CI Integration (REQUIRED):**
- Performance tests MUST run in CI pipeline on standardized hardware
- Tests MUST use synthetic dataset matching target size (50,000 items)
- Failures MUST block merge to prevent performance regressions

**Offset Edge Cases (MANDATORY validation):**

| Scenario | Behavior | Exit Code | Rationale |
|----------|----------|-----------|-----------|
| `offset` exceeds total count | Return empty result `[]` | 0 | Valid query with no results (not an error) |
| Negative `offset` | Reject with error | 1 | `"Error: Offset must be a non-negative integer. Got: {value}"` |
| Non-integer `offset` | Reject with error | 1 | `"Error: Offset must be an integer. Got: {value} (type: {type})"` |
| `offset` = 0 | Default behavior | 0 | Start from first result |

**Implementation pattern:**
```python
def validate_pagination(limit: int, offset: int) -> None:
    """Validate pagination parameters."""
    # Validate limit
    if not isinstance(limit, int) or isinstance(limit, bool):
        raise ValidationError(f"Limit must be an integer. Got: {limit!r} (type: {type(limit).__name__})")
    if limit < 1:
        raise ValidationError("Limit must be at least 1")
    if limit > 1000:
        raise ValidationError("Limit cannot exceed 1000")

    # Validate offset
    if not isinstance(offset, int) or isinstance(offset, bool):
        raise ValidationError(f"Offset must be an integer. Got: {offset!r} (type: {type(offset).__name__})")
    if offset < 0:
        raise ValidationError(f"Offset must be a non-negative integer. Got: {offset}")
```

**Note:** When offset exceeds total results, the query succeeds but returns an empty list. This is consistent with SQL behavior and allows callers to detect end-of-results by checking if the returned count is less than the requested limit.

**Note on export-csv streaming requirement:** The <5s target for export-csv assumes streaming implementation using cursor iteration. Implementations MUST NOT use fetchall() which would load all rows into memory. See schema.md "Memory-efficient export (streaming)" section for the required implementation pattern.

**Export Operation Limits (MANDATORY):**

To prevent resource exhaustion from concurrent export operations, implementations MUST enforce the following limits:

1. **Maximum concurrent exports:** 2 concurrent export-csv operations per database. Additional requests MUST be rejected with: `"Error: Maximum concurrent exports (2) exceeded. Please wait and retry."` (exit code 1)

2. **Memory limit per export:** Streaming implementation ensures constant memory usage (~10KB buffer per export) regardless of dataset size.

   **Memory Budget Specification (MANDATORY):**

   | Operation | Maximum Memory | Enforcement |
   |-----------|----------------|-------------|
   | search results | 10MB | Pagination limit (1000 rows max) |
   | export-csv | 10KB buffer | Streaming cursor iteration |
   | low-stock-report | 10MB | Pagination limit (1000 rows max) |
   | add-item / update-stock | 1KB | Single row operations |

   **Memory Control Mechanism:**

   **IMPORTANT:** Memory budgets are enforced through **pagination limits**, not runtime memory checks. The `sys.getsizeof()` function returns only the container object size (the list structure itself), not the size of its contents. This makes runtime memory estimation unreliable.

   **Actual enforcement mechanism:**
   - The pagination limit of 1000 rows maximum is the primary memory control
   - With an estimated ~10KB per row (worst case with maximum field lengths), 1000 rows = ~10MB maximum
   - This is enforced at the query level via the mandatory `LIMIT` clause

   **Why not use runtime memory checks:**
   ```python
   # UNRELIABLE - sys.getsizeof returns container size only (~56 bytes for list)
   # Does NOT include the size of list elements
   results = [{"sku": "...", "name": "...", ...} for _ in range(1000)]
   sys.getsizeof(results)  # Returns ~8056 bytes (list overhead), NOT actual data size

   # To get actual memory usage, you would need:
   # sum(sys.getsizeof(item) + sum(sys.getsizeof(v) for v in item.values()) for item in results)
   # This is expensive and still imprecise due to string interning and object sharing
   ```

   **Recommended approach - rely on pagination:**
   ```python
   MAX_PAGINATION_LIMIT = 1000  # Enforces ~10MB memory ceiling

   def validate_search_limit(limit: int) -> None:
       """Validate search limit to enforce memory budget.

       The 1000 row limit is the primary mechanism for memory control.
       """
       if limit > MAX_PAGINATION_LIMIT:
           raise ValidationError(
               f"Limit cannot exceed {MAX_PAGINATION_LIMIT}. "
               "This limit ensures memory usage stays within acceptable bounds."
           )
   ```

3. **Export timeout:** Export operations MUST complete within 60 seconds. If exceeded, abort with: `"Error: Export operation timed out after 60 seconds."` (exit code 2)

4. **Progress indicator for long exports:** For exports exceeding 2 seconds, implementations SHOULD output progress updates to stderr every 10,000 rows: `"Exporting... {count} items processed"`

5. **Implementation pattern (CROSS-PLATFORM - MANDATORY):**

   **WARNING:** The signal-based approach (SIGALRM) is Unix-only and MUST NOT be used.
   Implementations MUST use the cross-platform threading approach below:

   ```python
   import threading
   from typing import Optional

   class ExportTimeoutError(Exception):
       """Raised when export operation exceeds timeout."""
       pass

   def export_with_timeout(db_path: str, output_path: str, timeout_seconds: int = 60):
       """Export with cross-platform timeout protection.

       Uses threading for compatibility with Windows, Linux, and macOS.
       SIGALRM-based timeouts are NOT used as they are Unix-only.

       Args:
           db_path: Path to SQLite database
           output_path: Path for CSV output
           timeout_seconds: Maximum time allowed (default 60s)

       Raises:
           ExportTimeoutError: If export exceeds timeout
           DatabaseError: If database operation fails
       """
       export_error: Optional[Exception] = None
       export_complete = threading.Event()

       def do_export():
           nonlocal export_error
           try:
               # ... streaming export logic ...
               pass
           except Exception as e:
               export_error = e
           finally:
               export_complete.set()

       export_thread = threading.Thread(target=do_export)
       export_thread.start()

       # Wait for completion or timeout
       completed = export_complete.wait(timeout=timeout_seconds)

       if not completed:
           raise ExportTimeoutError(
               f"Export operation timed out after {timeout_seconds} seconds. "
               "The database may be under heavy load or the dataset is very large."
           )

       if export_error:
           raise export_error
   ```

   **Platform compatibility:** Works on Windows, Linux, and macOS. The deprecated
   SIGALRM pattern MUST NOT be used in implementations.

### Concurrent Access Performance

SQLite with WAL mode supports concurrent reads but single writer. Performance under concurrent access:

| Scenario | Expected Behavior | Performance Impact |
|----------|-------------------|-------------------|
| Multiple concurrent reads | All proceed simultaneously | Minimal - WAL allows concurrent reads |
| Single write | Exclusive lock held | No impact on reads |
| Multiple concurrent writes | Serialized via busy timeout | Writers queue; each waits up to 30s |
| Read during write | Reads proceed normally | No blocking with WAL mode |

**Concurrent write guidelines:**
- Practical limit: 2-3 concurrent write operations to minimize contention
- If timeout errors occur frequently, consider longer timeouts or serializing write operations
- This tool is designed for single-user or light multi-user scenarios, not high-concurrency workloads

**Testing concurrent access:** Manual testing with concurrent CLI invocations is sufficient for this tool's use case. No formal concurrent load testing is required for v1.

---

## Security Considerations

1. **SQL Injection**: Mitigated by AD4 (parameterized queries only)
2. **Path Traversal**: Validate `--db` and `--output` paths to prevent directory traversal:
   - Reject paths containing `..` (check BEFORE normalization)
   - Reject URL-encoded variants (`%2e%2e`, `%252e`)
   - On Windows: Reject UNC paths and alternate data streams

   See ARCHITECTURE-simple.md S2 for the canonical `validate_path()` implementation.
3. **CSV Injection Prevention**: CSV export MUST sanitize field values to prevent formula injection attacks:
   - Any field starting with the following characters MUST be prefixed with a single quote (`'`):
     - `=` (formula prefix in Excel, LibreOffice)
     - `+` (formula prefix)
     - `-` (formula prefix)
     - `@` (formula prefix in Excel, also used for SUM, etc.)
     - `\t` (tab - can be used for cell injection)
     - `\r` (carriage return - can break CSV parsing)
     - `|` (pipe - can execute commands in some parsers via DDE)
     - `!` (can trigger DDE in older Excel versions)
   - Additionally, implementations MUST handle:
     - Unicode lookalike characters (e.g., U+FF1D fullwidth equals '=', U+FF0B fullwidth plus '+')
     - Fields containing only whitespace followed by dangerous characters
   - This prevents spreadsheet applications from interpreting field values as formulas
   - Example: `=1+1` becomes `'=1+1` in CSV output
   - **Fields requiring sanitization**: sku, name, description, location (all user-input string fields)
   - **Fields NOT requiring sanitization**: created_at, updated_at (system-generated timestamps in fixed ISO 8601 format starting with digits, e.g., `2026-01-21T...`, which cannot start with dangerous characters)
   - **CRITICAL Implementation Note**: Single quote escaping may be stripped by some CSV parsers. Implementations SHOULD also:
     - Wrap fields containing dangerous characters in double quotes
     - Consider using tab-separated values (TSV) format option for maximum safety
   - See `cli/interface.md` for complete implementation requirements

   **Enforcement Requirements (MANDATORY - AUTOMATED):**

   Relying on manual code review for CSV sanitization is insufficient. Implementations MUST include automated enforcement:

   1. **Static Analysis (CI - REQUIRED):** Linter rule MUST detect CSV write operations that bypass `sanitize_csv_field()`:
      ```python
      # CI linter must detect and reject patterns like:
      writer.writerow([item.sku, item.name])  # FAIL: direct field access
      # Must be:
      writer.writerow([sanitize_csv_field(item.sku), sanitize_csv_field(item.name)])  # PASS
      ```

   2. **Wrapper Function (REQUIRED):** Export code MUST use a mandatory wrapper that applies sanitization:
      ```python
      def write_product_row(writer, product: Product) -> None:
          """Write product to CSV with MANDATORY sanitization."""
          writer.writerow([
              sanitize_csv_field(product.sku),
              sanitize_csv_field(product.name),
              sanitize_csv_field(product.description),
              sanitize_csv_field(product.location),
              product.created_at,  # System-generated, safe
              product.updated_at,  # System-generated, safe
          ])
      ```

   3. **Unit tests MUST verify each sanitized field:**
      - Test: `sku="=cmd"` results in CSV field `'=cmd`
      - Test: `name="+1234"` results in CSV field `'+1234`
      - Test: `description="-formula"` results in CSV field `'-formula`
      - Test: `location="@mention"` results in CSV field `'@mention`

   4. **Integration test MUST verify** exported CSV file does not trigger formula execution in spreadsheet parser

   - Code review checklist MUST include: "Verify `sanitize_csv_field()` is called on all user-input string fields before CSV write"

   **Double-Quote Escaping (RFC 4180 Compliance - MANDATORY):**

   In addition to formula injection prevention, CSV export MUST properly escape double quotes to prevent CSV parsing issues:
   - Any field containing a double quote (`"`) MUST have each double quote doubled (`""`)
   - Any field containing commas, newlines, or double quotes MUST be wrapped in double quotes
   - This is required by RFC 4180 and prevents CSV corruption

   **Implementation pattern:**
   ```python
   def escape_csv_field(value: str) -> str:
       """Escape a field value for CSV output per RFC 4180.

       1. Formula injection prevention: prefix dangerous characters with single quote
       2. RFC 4180 compliance: double quotes and wrap if needed
       """
       if value is None:
           return ""

       # Step 1: Formula injection prevention
       DANGEROUS_PREFIXES = ('=', '+', '-', '@', '\t', '\r', '|', '!')
       if value and value[0] in DANGEROUS_PREFIXES:
           value = "'" + value

       # Step 2: RFC 4180 double-quote escaping
       needs_quoting = False
       if '"' in value:
           value = value.replace('"', '""')
           needs_quoting = True
       if ',' in value or '\n' in value or '\r' in value:
           needs_quoting = True

       if needs_quoting:
           value = f'"{value}"'

       return value
   ```

   **Test cases for double-quote escaping:**
   | Input | Expected Output | Notes |
   |-------|-----------------|-------|
   | `Widget "Pro"` | `"Widget ""Pro"""` | Double quotes doubled and wrapped |
   | `Item, Large` | `"Item, Large"` | Comma triggers wrapping |
   | `Line1\nLine2` | `"Line1\nLine2"` | Newline triggers wrapping |
   | `"=cmd"` (with quotes and formula) | `"'""=cmd"""` | Both protections applied |

4. **Error Message Leakage**: Don't expose SQL errors or file paths in user-facing messages (use basename only)
5. **File Permissions**:
   - Database files MUST have restrictive permissions (0600) - owner read/write only
   - Any backup files (if implemented) MUST have the same 0600 permissions as the main database
   - Database file creation MUST use atomic permission setting (see schema.md for details)
   - CSV export files: Default to 0600 (restrictive) permissions. Exported data may contain sensitive inventory information.

     **SECURITY REQUIREMENT - Default to Restrictive Permissions:**

     CSV exports default to 0600 permissions because exported data may contain sensitive information (pricing, supplier data, proprietary SKUs). This follows the principle of secure-by-default.

     Implementations MUST support a `--shared` flag for CSV export to explicitly create files with relaxed permissions (0644) when data is intended for sharing:

     ```python
     def export_csv(output_path: str, shared: bool = False) -> None:
         """Export to CSV with secure-by-default permissions.

         Default: 0600 (owner-only) - secure by default
         With --shared: 0644 (world-readable) - explicit opt-in for sharing
         """
         if os.name != 'nt':
             if shared:
                 # Explicit opt-in for sharing (0644)
                 fd = os.open(output_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
             else:
                 # Default: restrictive permissions (0600)
                 fd = os.open(output_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
             with os.fdopen(fd, 'w', encoding='utf-8') as f:
                 # Write CSV data
                 pass
         else:
             # Windows: standard file creation (ACLs managed separately)
             with open(output_path, 'w', encoding='utf-8') as f:
                 # Write CSV data
                 pass
     ```

     **Usage:**
     - `warehouse-cli export-csv --output data.csv` - Default restrictive permissions (0600)
     - `warehouse-cli export-csv --output data.csv --shared` - World-readable (0644) for sharing

     **Rationale:** Secure-by-default. Inventory data may contain sensitive information (pricing, suppliers). The `--shared` flag provides an explicit opt-in for when data is intended for broader sharing.

     **Security Note:** When `--shared` is used, a warning MUST be displayed:
     ```
     Warning: Creating world-readable export file. Ensure this data is not confidential.
     ```

6. **Multi-User Environment Detection (REQUIRED):**

   To prevent deployment on shared systems without explicit acknowledgment, implementations MUST include startup validation:

   **Automatic Environment Detection:**

   Before database operations, the system MUST detect if the environment allows multi-user access:
   - **Unix/Linux:** Check if parent directory has group or world read permissions (mode & 0o077 != 0) AND multiple users exist in that group (via `getent group`)
   - **Windows:** Check NTFS ACLs for multiple user principals with access to the database directory

   **Implementation Details:**
   - **Responsible Module:** `systems/database/database.py` implements `detect_multiuser_environment()` and `verify_secure_permissions()` functions (NO separate security.py module exists)
   - **Unix/Linux Detection Logic:**
     - Primary check: Parse directory permissions using `os.stat(db_dir).st_mode & 0o077 != 0`
     - If permissions allow group/world access, check group membership: `subprocess.run(['getent', 'group', group_name])` and parse output for user count
     - Group is considered multi-user if it contains 2 or more users (excluding system accounts)
     - **False Positive Prevention:** Single-user with permissive umask (e.g., umask 0022) should NOT trigger multi-user detection. Check actual group membership count via getent.
   - **Windows Detection Logic:**
     - Requires `pywin32` library (optional dependency, see Technology Choices section)
     - Use `win32security.GetFileSecurity(db_dir, win32security.DACL_SECURITY_INFORMATION)` to retrieve DACL
     - Extract ACL entries: `dacl.GetAceCount()` and iterate with `dacl.GetAce(i)`
     - Count distinct user SIDs (excluding SYSTEM, Administrators group)
     - Environment is multi-user if 2+ distinct user SIDs have access
     - **Error Handling:** If `pywin32` unavailable, log warning and skip Windows ACL check (treat as single-user)
   - **Fallback Behavior:** If `getent` command is unavailable (non-standard systems), fall back to checking only directory permissions (mode & 0o077 != 0). Log warning: "Unable to verify group membership (getent unavailable). Detection based on permissions only."
   - **Caching Strategy:** Detection runs once per CLI invocation at database initialization. Results are cached in a module-level variable (`_multiuser_cache: dict[str, bool]`) keyed by database directory path to avoid repeated filesystem checks within the same process.
   - **Timeout Handling:** Windows ACL lookups timeout after 5 seconds using `threading.Timer`. If timeout occurs, assume single-user environment and log warning: "ACL lookup timeout. Proceeding with reduced security checks."

   **Enforcement Mechanism:**

   If multi-user environment detected AND no explicit override provided:
   - MUST fail with `SecurityError`: "Multi-user environment detected. This application requires explicit security configuration for shared systems. See vision.md Security Requirements."
   - Exit code: 2 (security/permission error)

   **Explicit Override Flag (`--allow-shared-system`):**
   - Acknowledges user has read and configured the security requirements
   - Logs warning: "Running in shared system mode. Ensure security controls from vision.md are implemented."
   - Continues execution only if file permissions are correctly configured (0600/restrictive ACLs)

   **Permission Verification Implementation:**
   - **Function:** `verify_secure_permissions(db_path: Path) -> None` in `systems/database/database.py`
   - **Atomic Permission Setting:** Uses `os.open()` with O_CREAT | O_EXCL for new files, then sets permissions via `os.chmod()` in same operation (race condition prevention)
   - **Cross-Platform Verification:**
     - **Unix/Linux:** Verify mode == 0o600 via `os.stat(db_path).st_mode & 0o777`
     - **Windows (requires pywin32):** Verify ACL contains only current user SID with full control via `win32security.GetFileSecurity(db_path, win32security.DACL_SECURITY_INFORMATION)`. Check that DACL has exactly one ACE (Access Control Entry) for current user SID with FILE_GENERIC_READ | FILE_GENERIC_WRITE permissions. Reject if inherited ACLs are present (check DACL flags for SE_DACL_PROTECTED).
     - **Windows (pywin32 unavailable):** Log warning "Windows ACL verification requires pywin32. Skipping permission check." and proceed without verification.
   - **Exceptions Raised:**
     - `PermissionError`: If file permissions are insecure (not 0600 or non-restrictive ACLs)
     - `SecurityError`: If permission verification fails due to access denied or unsupported filesystem

   **Network Filesystem Handling:**
   - **NFS Detection:** Check filesystem type via `os.statvfs(db_path).f_type` (Linux) or parse `mount` output for path (Unix/macOS). If NFS detected, log warning: "NFS detected. Permission enforcement may be unreliable due to UID mapping. Verify NFSv4 ACLs or use local filesystem for sensitive data."
   - **CIFS/SMB Detection:** Similar detection and warning. If permission verification fails on network filesystem, raise `SecurityError` with message: "Network filesystem detected with unreliable permission model. Use local filesystem for database storage."
   - **Windows Mapped Drives (CRITICAL - DATA CORRUPTION RISK):**
     - **MANDATORY REJECTION:** Implementations MUST detect and reject mapped network drives (e.g., Z:\) to prevent SQLite WAL mode data corruption
     - **Detection Method:** On Windows, use `win32file.GetDriveType(drive_letter)` to check if drive type is `DRIVE_REMOTE` (requires pywin32)
     - **Alternative Detection (pywin32 unavailable):** Parse `net use` command output to identify mapped drives
     - **Error Message:** "Database path '{db_path}' is on a mapped network drive ({drive_letter}:). SQLite WAL mode causes data corruption on network filesystems. Please use a local filesystem path (C:\, D:\, etc.)."
     - **Exit Code:** 2 (DatabaseError - configuration issue)
     - **Rationale:** Mapped drives ARE network filesystems. Blocking UNC paths (\\\server\share) but allowing Z:\ provides false security while enabling silent data corruption. This check MUST be enforced before any database operations.
   - **UNC Path Rejection (Windows):** Reject UNC paths (\\\\server\\share) with error: "UNC paths are not supported. Use a local filesystem or mapped drive." Exit code: 1 (ValidationError)
