# Components: Personal Finance Tracker CLI

## Module Overview

```
finance_cli/
├── __init__.py          # Package marker, version
├── __main__.py          # Entry point: python -m finance_cli
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

**Purpose**: Entry point for `python -m finance_cli`

**Contents**:
```python
from finance_cli.cli import main
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
- `main()` -> entry point, parses args, calls commands

**Dependencies**: `commands`, `exceptions`

**Does NOT**: Execute business logic, access database directly

---

### `commands.py`

**Purpose**: Business logic for each CLI command

**Responsibilities**:
1. Implement each command as a function
2. Coordinate between database and formatters
3. Enforce business rules (e.g., amount conversion, budget calculations)

**Public interface**:
- `cmd_init(db_path: str, force: bool) -> None`
- `cmd_add_account(db_path: str, name: str, account_type: str) -> int`
- `cmd_add_category(db_path: str, name: str, category_type: str) -> int`
- `cmd_add_transaction(db_path: str, account: str, amount: Decimal, category: str, description: str | None, date: str) -> int`
  # Transaction boundary: Per AD6 in technical.md, this entire operation is a single transaction.
  # All steps (lookup account, lookup category, insert transaction) MUST be wrapped in the same
  # database transaction via get_connection() context manager. If any step fails (e.g., account
  # not found raises NotFoundError), the context manager automatically rolls back. No partial
  # state is committed.
- `cmd_list_transactions(db_path: str, account: str | None, category: str | None, from_date: str | None, to_date: str | None, limit: int | None) -> list[Transaction]`
- `cmd_balance(db_path: str, account: str | None) -> list[AccountBalance]`
- `cmd_set_budget(db_path: str, category: str, month: str, amount: Decimal) -> None`
  # MUST validate category is expense type (not income) before setting budget
  # This is application-level validation (cannot be enforced via DB CHECK constraint)
  # If category is income type, MUST raise ValidationError with message per interface.md
- `cmd_budget_report(db_path: str, month: str) -> list[BudgetReportItem]`
- `cmd_export_csv(db_path: str, output: str, from_date: str | None, to_date: str | None, force: bool) -> int`
  # CRITICAL: MUST check if output file exists. If exists and force=False, MUST raise ValidationError.
  # Never silently overwrite existing files. The force parameter enables explicit overwrite.
- `cmd_import_csv(db_path: str, input_path: str) -> int`
  # Two-phase import process:
  # Phase 1 - Validation: Load and parse all CSV rows into memory, validate all fields,
  #   resolve all account/category references. If any account or category name is not found
  #   in the database, validation MUST fail immediately with a ValidationError including
  #   the row number. For MVP, in-memory validation is acceptable for typical personal
  #   finance CSV files (<10k rows). If validation fails for any row, abort before
  #   database insert phase.
  # Phase 2 - Insert: Wrap all inserts in a single database transaction. Insert all
  #   transactions. If any insert fails, the entire transaction is rolled back
  #   (per AD6 in technical.md).
  # Memory handling: For MVP, load entire CSV into memory. Typical personal finance CSVs
  #   are small (<10k rows). Large file handling (streaming) is out of scope for MVP.

**Dependencies**: `database`, `models`, `exceptions`

**Does NOT**: Parse CLI arguments, format output, handle exit codes

---

### `database.py`

**Purpose**: Database connection and SQL operations

**Responsibilities**:
1. Create/connect to SQLite database
2. Run schema migrations (create tables)
3. Execute parameterized queries
4. Handle transactions
5. Ensure atomic file access to prevent TOCTOU race conditions

**Public interface**:
- `init_database(path: str) -> None` -- Creates database file and runs schema creation. Idempotent. MUST use atomic file creation to prevent TOCTOU attacks. MUST set file permissions to 0600 (owner read/write only) immediately after creation. **Implementation sequence**: (1) Create parent directory if needed, (2) Use os.open() with O_CREAT|O_EXCL and mode 0o600 to atomically create an empty file with correct permissions, (3) Close that file descriptor, (4) Call sqlite3.connect() which will open the existing file. This sequence satisfies SQLite API constraints while enforcing secure permissions from creation. **CRITICAL**: MUST use get_connection() internally to obtain a database connection (which automatically enables PRAGMA foreign_keys = ON as required by schema.md). All schema DDL operations must be executed through this connection to ensure foreign key constraints are enforced during table creation.
- `get_connection(path: str) -> ContextManager[sqlite3.Connection]` -- Context manager that yields connection, commits on success, rollbacks on exception, always closes. Path validation and database open MUST be atomic. On first open of existing database file, SHOULD verify permissions are 0600 and emit warning to stderr if more permissive (but do not fail, as user may have valid reasons for different permissions). **CRITICAL**: MUST execute `PRAGMA foreign_keys = ON` immediately after opening the connection, before yielding to caller. This is required by schema.md and must be enforced on EVERY connection.
- `insert_account(conn, account: Account) -> int`
- `insert_category(conn, category: Category) -> int`
- `insert_transaction(conn, transaction: Transaction) -> int`
- `insert_or_update_budget(conn, budget: Budget) -> None`
- `find_account_by_name(conn, name: str) -> Account | None`
- `find_category_by_name(conn, name: str) -> Category | None`
- `get_all_accounts(conn) -> list[Account]`
- `get_all_categories(conn) -> list[Category]`
- `search_transactions(conn, account_id: int | None, category_id: int | None, from_date: str | None, to_date: str | None, limit: int | None) -> list[Transaction]`
- `get_account_balances(conn, account_id: int | None) -> list[AccountBalance]`
- `get_budget_report(conn, month: str) -> list[BudgetReportItem]`
- `get_transactions_for_export(conn, from_date: str | None, to_date: str | None) -> list[Transaction]`

**Dependencies**: `models`, `exceptions`

**Does NOT**: Validate business rules, format output

**Critical constraint**: ALL queries use parameterized placeholders (`?`). No string interpolation.

---

### `models.py`

**Purpose**: Data classes and validation logic

**Location Note**: All validation functions including `validate_path()` are defined in this module (models.py), not in database.py or cli.py. This centralizes validation logic and makes it reusable across the application. See ARCHITECTURE-simple.md S2 for detailed path validation security requirements.

**Responsibilities**:
1. Define dataclasses for all entities
2. Validate field constraints
3. Handle currency conversion (cents <-> decimal)

**Public interface**:
```python
@dataclass
class Account:
    id: int | None
    name: str
    account_type: str  # checking, savings, credit, cash
    created_at: str

@dataclass
class Category:
    id: int | None
    name: str
    category_type: str  # income, expense
    created_at: str

@dataclass
class Transaction:
    id: int | None
    account_id: int
    category_id: int
    amount_cents: int
    description: str | None
    transaction_date: str
    created_at: str
    # Denormalized for display:
    account_name: str | None = None
    category_name: str | None = None

@dataclass
class Budget:
    id: int | None
    category_id: int
    month: str  # YYYY-MM
    amount_cents: int

@dataclass
class AccountBalance:
    account_id: int
    account_name: str
    account_type: str
    balance_cents: int

@dataclass
class BudgetReportItem:
    category_id: int
    category_name: str
    budget_cents: int
    spent_cents: int
    remaining_cents: int
    percent_used: float
    # Note: When budget_cents is 0, percent_used should be 0.0 (not infinity or NaN)
    # to avoid division by zero errors
    #
    # Budget Report Calculation Specification:
    # 1. spent_cents: Sum of all transaction.amount_cents for this category in the month
    #    (calculated by SQL query in get_budget_report, see schema.md)
    # 2. remaining_cents = budget_cents - spent_cents
    # 3. percent_used = calculate_percent_used(spent_cents, budget_cents)
    #    - Returns 0.0 when budget_cents == 0 (division by zero safe)
    #    - Otherwise: (spent_cents / budget_cents) * 100, rounded to 1 decimal place
    # 4. All monetary values use integer cents for precision (no float arithmetic)

def calculate_percent_used(spent_cents: int, budget_cents: int) -> float:
    """Safely calculate percentage of budget used.

    Args:
        spent_cents: Amount spent in cents
        budget_cents: Budget amount in cents

    Returns:
        Percentage as float (e.g., 25.1 for 25.1%)
        Returns 0.0 if budget_cents is 0 to avoid division by zero

    Example:
        calculate_percent_used(2500, 10000)  # Returns 25.0
        calculate_percent_used(5000, 0)      # Returns 0.0 (safe division)
    """
    if budget_cents == 0:
        return 0.0
    return round((spent_cents / budget_cents) * 100, 1)

def validate_account_name(name: str) -> str:
    """Validate account name.

    Args:
        name: Account name to validate

    Returns:
        Validated account name (stripped of leading/trailing whitespace)

    Raises:
        ValidationError: If name is empty or exceeds 50 characters
    """

def validate_category_name(name: str) -> str:
    """Validate category name.

    Args:
        name: Category name to validate

    Returns:
        Validated category name (stripped of leading/trailing whitespace)

    Raises:
        ValidationError: If name is empty or exceeds 50 characters
    """

def validate_account_type(account_type: str) -> str:
    """Validate account type.

    Args:
        account_type: Account type to validate

    Returns:
        Validated account type (lowercase)

    Raises:
        ValidationError: If account_type is not one of:
            'checking', 'savings', 'credit', 'cash'
    """

def validate_category_type(category_type: str) -> str:
    """Validate category type.

    Args:
        category_type: Category type to validate

    Returns:
        Validated category type (lowercase)

    Raises:
        ValidationError: If category_type is not one of:
            'income', 'expense'
    """
def validate_amount(amount: str) -> int:
    """Validate and convert amount string to cents.

    Args:
        amount: Amount string (e.g., "-45.67", "1234", "5.00")

    Returns:
        Amount in cents as integer

    Raises:
        ValidationError: If amount is invalid

    Validation rules:
    - Must match regex: ^-?\d+(\.\d{1,2})?$
    - MUST reject amounts with more than 2 decimal places
    - MUST reject amounts > 999999999.99 (exceeds cents storage)
    - MUST reject amounts < -999999999.99
    """
def validate_budget_amount(amount_str: str) -> int:
    """Validate and convert budget amount to cents.

    Budget amounts must be:
    - Positive (> 0) - reject 0.00 and negative values
    - Max 2 decimal places - MUST reject amounts with > 2 decimal places
    - MUST reject amounts > 999999999.99 (same limit as regular amounts)

    Validation rules (explicit):
    - Must match regex: ^[0-9]+(\.[0-9]{1,2})?$ (no negative sign allowed)
    - MUST reject amounts with more than 2 decimal places (e.g., 100.123)
    - MUST reject amounts == 0 or < 0
    - MUST reject amounts > 999999999.99

    Returns: amount in cents
    Raises: ValidationError if invalid
    """
def validate_date(date: str) -> str  # raises ValidationError
def validate_month(month: str) -> str:
    """Validate month string in YYYY-MM format.

    Args:
        month: Month string to validate (e.g., '2026-01')

    Returns:
        Validated month string

    Raises:
        ValidationError: If month is invalid

    Validation rules:
    - Must match format YYYY-MM
    - Year must be 4 digits
    - Month must be 01-12
    - Invalid months like '2026-13' or '2026-00' MUST be rejected
    """
def validate_description(desc: str | None) -> str | None:
    """Validate transaction description.

    Args:
        desc: Description string or None

    Returns:
        Validated description or None

    Raises:
        ValidationError: If description exceeds 500 characters

    Behavior:
    - None input returns None (no description)
    - Empty string ("") is converted to None for database consistency
      - Rationale: Avoids storing empty strings vs NULL, which are semantically equivalent
        but create inconsistency in queries and display logic
    - Non-empty strings are validated for length and returned as-is
    - Max length: 500 characters

    Note: This empty-to-None conversion is a design choice. It simplifies
    downstream logic by ensuring descriptions are either meaningful strings or NULL,
    never empty strings.
    """
def validate_limit(limit: int) -> int:
    """Validate limit parameter for list queries.

    Args:
        limit: Maximum number of results to return

    Returns:
        Validated limit (unchanged if valid)

    Raises:
        ValidationError: If limit is not a positive integer

    Validation rules:
    - MUST be greater than 0
    - limit=0 raises ValidationError("Limit must be greater than 0")
    - Negative values raise ValidationError("Limit must be greater than 0")
    """
def validate_date_range(from_date: str | None, to_date: str | None) -> tuple[str | None, str | None]:
    """Validate date range for transaction queries.

    Args:
        from_date: Start date (YYYY-MM-DD format) or None
        to_date: End date (YYYY-MM-DD format) or None

    Returns:
        Tuple of (from_date, to_date), both validated

    Raises:
        ValidationError: If dates are invalid or from_date > to_date

    Validation rules:
    - Both dates are optional (None allowed)
    - If provided, dates must be valid YYYY-MM-DD format
    - If both provided, from_date MUST be <= to_date
    - from_date > to_date raises ValidationError("Invalid date range: 'from' date must be before 'to' date.")
    """
def validate_path(path: str, base_dir: str = None) -> str:
    """Validate and normalize a file path.

    Args:
        path: User-provided path (relative or absolute)
        base_dir: Allowed base directory (defaults to cwd)

    Returns:
        Normalized absolute path

    Raises:
        ValidationError: If path fails validation

    Security checks performed:
    1. URL-decode the path BEFORE validation (prevents %2e%2e bypass for '..')
    2. Reject paths containing '..' in both raw and decoded forms (path traversal)
    3. Resolve symlinks with os.path.realpath()
    4. Verify resolved path is contained within base_dir
    5. Block absolute paths that resolve outside base_dir

    CRITICAL: Paths MUST be URL-decoded before validation. Check for '..' in
    both raw and decoded forms to prevent bypasses using URL-encoded characters
    like %2e%2e for '..'.

    CRITICAL - TOCTOU Prevention: Path validation and file access MUST be atomic.
    Use os.open() to open the resolved path, then use os.fstat() on the fd rather
    than os.stat() on the path. This prevents symlink substitution attacks between
    validation and access. For read operations, use O_NOFOLLOW flag. For write
    operations, use O_CREAT | O_EXCL for new files.
    """

def safe_open_file(path: str, mode: str, flags: int = None) -> int:
    """Atomically open a file with security checks.

    Args:
        path: Validated file path (must be already validated via validate_path)
        mode: File open mode ('r', 'w', etc.)
        flags: Optional os.open() flags (e.g., os.O_CREAT | os.O_EXCL)

    Returns:
        File descriptor (int)

    Raises:
        ValidationError: If file access fails security checks
        OSError: If file operation fails

    Security guarantees:
    - Uses os.open() with appropriate flags for atomic operations
    - For reads: Uses O_NOFOLLOW to prevent symlink attacks
    - For writes: Supports O_CREAT | O_EXCL for atomic creation
    - Combines with validate_path() to prevent TOCTOU race conditions

    Usage example:
        validated_path = validate_path(user_input)
        fd = safe_open_file(validated_path, 'r', os.O_RDONLY | os.O_NOFOLLOW)
        file_obj = os.fdopen(fd, 'r')
    """
def cents_to_decimal(cents: int) -> Decimal:
    """Convert integer cents to Decimal amount.

    Args:
        cents: Amount in cents (e.g., 4567 for $45.67)

    Returns:
        Decimal representation (e.g., Decimal('45.67'))

    CRITICAL: Never use float for monetary values. Always use Decimal.
    """

def decimal_to_cents(amount: Decimal) -> int:
    """Convert Decimal amount to integer cents.

    Uses ROUND_HALF_EVEN (banker's rounding) for any rounding operations.

    IMPORTANT: Amounts with more than 2 decimal places MUST be rejected
    during validation, not rounded here. This function assumes the input
    has already been validated to have at most 2 decimal places.

    Args:
        amount: Decimal amount (e.g., Decimal('45.67'))

    Returns:
        Amount in cents as integer (e.g., 4567)

    Note:
        This function should NOT receive amounts with >2 decimal places.
        The validate_amount() function must reject such inputs first.

    CRITICAL: Never use float for monetary values. Always use Decimal.
    """

# CRITICAL - Currency Conversion Precision Rules:
# 1. All monetary values MUST be stored as integers (cents) or Decimal with exactly 2 decimal places
# 2. Never use float for any monetary calculations
# 3. Currency conversions MUST use Decimal with at least 6 decimal places for intermediate calculations
# 4. Rounding to 2 decimal places MUST only occur for final display or storage
#
# Example of correct currency conversion:
#   # Import required Decimal components:
#   from decimal import Decimal, ROUND_HALF_EVEN
#
#   rate = Decimal('1.234567')  # Keep full precision for rate
#   amount = Decimal('100.00')
#   intermediate = amount * rate  # Decimal('123.4567') - keep full precision
#   final = intermediate.quantize(Decimal('0.01'), rounding=ROUND_HALF_EVEN)  # Only round at end
```

**Dependencies**: `exceptions`

**Does NOT**: Access database, format output

---

### `formatters.py`

**Purpose**: Format data for output (table, JSON, CSV)

**Responsibilities**:
1. Format transaction lists as ASCII tables
2. Format data as JSON
3. Write/read CSV files

**Public interface**:
- `format_transactions_table(transactions: list[Transaction]) -> str`
- `format_transactions_json(transactions: list[Transaction]) -> str`
- `format_balance_table(balances: list[AccountBalance]) -> str`
- `format_balance_json(balances: list[AccountBalance]) -> str`
- `format_budget_report_table(items: list[BudgetReportItem]) -> str`
- `format_budget_report_json(items: list[BudgetReportItem]) -> str`
- `format_accounts_table(accounts: list[Account]) -> str`
- `format_categories_table(categories: list[Category]) -> str`
- `write_transactions_csv(transactions: list[Transaction], file_obj: io.TextIOWrapper, force: bool = False) -> None`
  # CRITICAL - Atomic File Operations: This function accepts a file-like object (io.TextIOWrapper)
  # rather than a string path. The CLI layer (commands.py) is responsible for atomic file creation
  # using the pattern documented in models.py validate_path(): os.open() with O_CREAT | O_EXCL flags
  # to prevent TOCTOU race conditions, then wrapping the file descriptor with os.fdopen(fd, 'w').
  # The CLI layer passes the resulting file-like object to this function for writing.
  #
  # Example calling pattern from commands.py:
  #   validated_path = validate_path(output)
  #   if not force and os.path.exists(validated_path):
  #       raise ValidationError(f"File already exists: {validated_path}")
  #   if force:
  #       file_obj = open(validated_path, 'w')  # Normal overwrite
  #   else:
  #       fd = os.open(validated_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
  #       file_obj = os.fdopen(fd, 'w')  # Atomic create with exclusive access
  #   try:
  #       write_transactions_csv(transactions, file_obj)
  #   finally:
  #       file_obj.close()
  #
  # CRITICAL - CSV Injection Prevention: MUST prefix any field starting with =, +, -, @, \t, or \r
  # with a single quote (') to prevent formula injection attacks in spreadsheet applications.
- `read_transactions_csv(path: str) -> list[dict]`

**Dependencies**: `models`

**Does NOT**: Access database, validate input

---

### `exceptions.py`

**Purpose**: Custom exception hierarchy

**Contents**:
```python
class FinanceError(Exception):
    """Base exception for finance CLI."""
    exit_code = 1

class ValidationError(FinanceError):
    """Invalid input data."""
    exit_code = 1

class DatabaseError(FinanceError):
    """Database operation failed."""
    exit_code = 2

class NotFoundError(FinanceError):
    """Requested entity does not exist."""
    exit_code = 3

class DuplicateError(FinanceError):
    """Entity with this identifier already exists."""
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
