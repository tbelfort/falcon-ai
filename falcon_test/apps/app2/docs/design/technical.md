# Technical Design: Personal Finance Tracker CLI

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
- Handles 100,000+ transactions easily
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
FinanceError (base)
├── ValidationError      -> exit 1
├── DatabaseError        -> exit 2
├── NotFoundError        -> exit 3
└── DuplicateError       -> exit 4
```

**Rationale**: Callers can catch specific errors. Exit codes are predictable.

See `errors.md` for complete exception specifications, error message templates, and handling rules.

### AD4: Parameterized Queries Only

**All SQL queries MUST use parameterized placeholders (`?`).**

Never:
```python
cursor.execute(f"SELECT * FROM accounts WHERE name = '{name}'")  # WRONG
```

Always:
```python
cursor.execute("SELECT * FROM accounts WHERE name = ?", (name,))  # RIGHT
```

**Rationale**: Prevents SQL injection. Non-negotiable.

### AD5: Input Validation at Boundary

Validate all user input in the CLI layer before passing to commands:
- Account name: non-empty, max 50 chars
- Category name: non-empty, max 50 chars
- Amount: valid decimal, max 2 decimal places
- Budget amount: positive (> 0), max 2 decimal places
- Budget category: MUST be expense type (not income) - reject with error if income category
- Date: ISO 8601 format (YYYY-MM-DD)
- Description: max 500 chars
- Path: valid filesystem path (MUST be URL-decoded before validation; check for '..' in both raw and decoded forms)

**Rationale**: Fail fast with clear error messages. Don't let bad data reach database layer.

### AD6: Atomic Database Operations

Each command is a single transaction. Either fully succeeds or fully fails.

**Rationale**: No partial updates. Database always in consistent state.

**Recurring Transaction Locking**: If recurring transaction generation is implemented, it MUST use `BEGIN IMMEDIATE TRANSACTION` or equivalent locking to prevent duplicate generation when multiple processes run concurrently. Check-then-insert operations MUST be atomic to prevent race conditions.

### AD7: Decimal for Currency (not float)

Store amounts as INTEGER cents in database. Display as decimal.

**Rationale**: Avoid floating-point precision errors with money. `$45.67` stored as `4567` cents.

**Rounding Mode**: When conversion requires rounding, use ROUND_HALF_EVEN (banker's rounding). However, amounts with more than 2 decimal places MUST be rejected during validation, not rounded silently. The `validate_amount()` function must reject inputs like `45.678` before they reach `decimal_to_cents()`.

**Currency Conversion Precision**: Currency conversions (if supported in future) MUST use `Decimal` with at least 6 decimal places for intermediate calculations. Rounding to 2 decimal places MUST only occur for final display or storage. Never use `float` for any monetary calculations.

**Monetary Value Storage**: All monetary values MUST be stored as integers (cents) or `Decimal` with exactly 2 decimal places. Never use `float` for monetary values. This applies to:
- Database storage (INTEGER cents)
- In-memory calculations (Decimal)
- Intermediate computation results (Decimal with 6+ decimal places)
- Final display values (Decimal with 2 decimal places)

---

## Data Model

### Accounts Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| account_type | TEXT | NOT NULL (checking/savings/credit/cash) |
| created_at | TEXT | ISO 8601 timestamp |

### Categories Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | UNIQUE NOT NULL |
| category_type | TEXT | NOT NULL (income/expense) |
| created_at | TEXT | ISO 8601 timestamp |

### Transactions Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| account_id | INTEGER | FOREIGN KEY, NOT NULL |
| category_id | INTEGER | FOREIGN KEY, NOT NULL |
| amount_cents | INTEGER | NOT NULL (positive=income, negative=expense) |
| description | TEXT | nullable |
| transaction_date | TEXT | NOT NULL, ISO 8601 date |
| created_at | TEXT | ISO 8601 timestamp |

### Budgets Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| category_id | INTEGER | FOREIGN KEY, NOT NULL |
| month | TEXT | NOT NULL (YYYY-MM format) |
| amount_cents | INTEGER | NOT NULL, > 0 |
| UNIQUE(category_id, month) | | |

---

## Output Formats

### Table Format (default)

Human-readable, fixed-width columns:
```
Date       | Account   | Category  | Amount    | Description
-----------|-----------|-----------|-----------|------------------
2026-01-15 | Checking  | Groceries | -$45.67   | Weekly groceries
```

### JSON Format (`--format json`)

Machine-readable, stable schema:
```json
[
  {
    "id": 1,
    "date": "2026-01-15",
    "account": "Checking",
    "category": "Groceries",
    "amount": "-45.67",
    "description": "Weekly groceries"
  }
]
```

**Schema Stability Guarantees**: The JSON output format follows stability guarantees defined in vision.md success criterion #4:
- **Existing fields**: Field names, types, and semantics remain stable within a major version
- **Backward compatibility**: New optional fields may be added in minor versions (scripts that ignore unknown fields continue to work)
- **Breaking changes**: Field removal, renaming, or type changes require a major version bump
- **Field ordering**: Not guaranteed to be stable (scripts must parse JSON by key name, not by position)
- **Version detection**: Future versions may include a `"schema_version"` field to allow scripts to detect and handle schema changes

For complete JSON output specifications including null handling, precision rules, and type naming conventions, see interface.md lines 768-779.

### CSV Format (export only)

RFC 4180 compliant:
- Comma separator
- Double-quote escaping
- UTF-8 encoding
- Header row included

**CRITICAL - CSV Injection Prevention**: To prevent formula injection attacks when CSV files are opened in Excel/LibreOffice/Google Sheets, **TEXT fields** starting with the following characters MUST be prefixed with a single quote (`'`):
- `=` (equals)
- `+` (plus)
- `-` (minus) - See note below about amount fields
- `@` (at sign)
- Tab character (`\t`)
- Carriage return (`\r`)

Example: If a description field contains `=1+1`, it must be exported as `'=1+1` to prevent spreadsheet applications from interpreting it as a formula.

This applies ONLY to **text fields** in CSV export:
- Transaction descriptions
- Account names
- Category names

**IMPORTANT - Amount Field Exception**: The `amount` column contains numeric data (e.g., `-45.67`, `500.00`) and MUST NOT be prefixed with a single quote. Numeric fields starting with `-` represent negative values, not formulas. Spreadsheet applications recognize numeric patterns and do not interpret them as formulas.

**Implementation**: The CSV writer in `formatters.py` MUST:
1. Check the first character of each **text** field (description, account name, category name)
2. Prepend a single quote if it matches any injection character above
3. Leave numeric fields (id, amount) unchanged

---

## Performance Targets

| Operation | Target | Max dataset | Rationale |
|-----------|--------|-------------|-----------|
| init | <500ms | n/a | Schema creation is one-time setup, sub-second acceptable |
| add-transaction | <50ms | n/a | Frequent operation, must feel instant for daily use |
| balance | <100ms | 100,000 transactions | Interactive command, <100ms feels responsive |
| list-transactions | <100ms | 100,000 transactions | Interactive command with filters/pagination, <100ms acceptable |
| budget-report | <100ms | 100,000 transactions | Monthly review command, <100ms provides good UX |
| export-csv | <5s | 100,000 transactions | Bulk operation with I/O, users tolerate longer waits for large exports |

**Note:** These targets are based on typical user workflows and SQLite performance characteristics. The 100,000 transaction dataset size represents ~10 years of daily transactions for a typical user.

---

## Security Considerations

1. **SQL Injection**: Mitigated by AD4 (parameterized queries only)
2. **Path Traversal**: Validate `--db` and `--output` paths. Paths MUST be URL-decoded before validation to prevent bypasses using encoded characters like %2e%2e for '..'
3. **TOCTOU Race Condition**: Path validation and file access MUST be atomic. Use `os.open()` to open the resolved path, then use `os.fstat()` on the fd rather than `os.stat()` on the path. This prevents symlink substitution attacks between validation and access.
   - For **database paths**: Use `os.path.realpath()` to resolve symlinks, then open the resolved path
   - For **export (new files)**: Use `O_CREAT | O_EXCL` flags to atomically create and fail if exists
   - The single-user CLI design accepts a small TOCTOU window for existence checks, but new file creation should use atomic flags
4. **Error Message Leakage**: Don't expose SQL errors or file paths in user-facing messages
5. **Financial Data Protection**: Database files MUST have restrictive permissions (0600) to prevent unauthorized access
   - **Creation-time enforcement**: The `safe_open_file()` function (defined in ARCHITECTURE-simple.md S2) automatically sets mode `0o600` when creating new files with write mode, ensuring proper permissions are applied atomically during file creation
   - **Application responsibility**: The `init` command and any database operations MUST use `safe_open_file()` for file creation to guarantee correct permissions
   - **No runtime checks**: The application does NOT check, verify, or modify permissions of existing database files during open or write operations. Permission setting occurs ONLY during initial file creation.
   - **User responsibility**: If users modify permissions of existing database files after creation, that is their responsibility. The application does not validate or warn about permissive permissions on existing files.
   - **Security note**: Never log transaction details or other financial data to logs or error messages
