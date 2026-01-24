# Error Handling: Personal Finance Tracker CLI

**Status:** [FINAL]

---

## Exit Codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | SUCCESS | Operation completed successfully |
| 1 | GENERAL_ERROR | Invalid arguments, validation failure, general errors |
| 2 | DATABASE_ERROR | Database connection failed, query failed, file issues |
| 3 | NOT_FOUND | Requested account or category does not exist |
| 4 | DUPLICATE | Account or category with this name already exists |

---

## Exception Hierarchy

```python
class FinanceError(Exception):
    """Base exception for all finance CLI errors."""
    exit_code: int = 1

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class ValidationError(FinanceError):
    """Invalid input data.

    Examples:
    - Empty account name
    - Invalid amount format
    - Invalid date format
    - Path contains '..'
    """
    exit_code = 1


class DatabaseError(FinanceError):
    """Database operation failed.

    Examples:
    - Cannot connect to database
    - Query execution failed
    - Cannot create database file
    - Constraint violation (generic)
    """
    exit_code = 2


class NotFoundError(FinanceError):
    """Requested entity does not exist.

    Examples:
    - Account not found
    - Category not found
    """
    exit_code = 3


class DuplicateError(FinanceError):
    """Entity with this identifier already exists.

    Examples:
    - Account name already exists
    - Category name already exists
    """
    exit_code = 4
```

---

## Error Message Templates

### Validation Errors (Exit 1)

```
Error: Account name cannot be empty.
Error: Account name must be 50 characters or fewer. Got: 75
Error: Account type must be one of: checking, savings, credit, cash
Error: Category name cannot be empty.
Error: Category name must be 50 characters or fewer. Got: 75
Error: Category type must be one of: income, expense
Error: Invalid amount format. Expected decimal with up to 2 decimal places (e.g., -45.67, 1234, or 5.00)
Error: Invalid date format. Expected: YYYY-MM-DD (e.g., 2026-01-15)
Error: Invalid month format. Expected: YYYY-MM (e.g., 2026-01)
Error: Description must be 500 characters or fewer.
Error: Path cannot contain '..' (including URL-encoded forms like %2e%2e).
Error: Path cannot contain null bytes.
Error: File '{filename}' already exists. Use --force to overwrite.
Error: Database already exists at {filename}. Use --force to recreate.
Error: Invalid date range: 'from' date must be before 'to' date.
Error: Cannot set budget on income category '{name}'. Budgets apply to expense categories only.
Error: Budget amount must be greater than zero.
Error: Amount must be less than 999,999,999.99.
Error: Amount must be greater than -999,999,999.99.
```

### Database Errors (Exit 2)

```
Error: Cannot create database '{filename}': Permission denied.
Error: Cannot open database '{filename}': File not found.
Error: Database operation failed. Run with --verbose for details.
Error: Cannot write to '{filename}': Permission denied.
Error: Cannot read from '{filename}': File not found.
```

**Note:** Use basename only (`{filename}`), not full path. See S3 in ARCHITECTURE-simple.md.

### CSV Import Errors (Exit 1 or 3)

```
Error: Invalid CSV format: missing required column '{column}'.
Error: Invalid date format in row {row}. Expected: YYYY-MM-DD
Error: Invalid amount format in row {row}. Expected: [-]DDDD.DD
Error: Account '{name}' not found in row {row}.
Error: Category '{name}' not found in row {row}.
```

**Note:** CSV import stops at first error (no partial import). Validation errors (format issues) use exit code 1, while not found errors use exit code 3.

**Row numbering:** Row numbers in error messages start at 1 and include the header row. So the first data row is row 2, the second data row is row 3, etc.

**Example CSV file with row numbers:**
```
Row 1 (header):  date,account,category,amount,description
Row 2 (data):    2026-01-15,Checking,Groceries,-45.67,Weekly shopping
Row 3 (data):    2026-01-16,Savings,Salary,5000.00,Monthly pay
Row 4 (data):    2026-01-17,Checking,INVALID_CAT,-10.00,Coffee
```

If the category "INVALID_CAT" doesn't exist in row 4, the error message would be:
```
Error: Category 'INVALID_CAT' not found in row 4.
```

This row numbering matches how most text editors and spreadsheet applications number rows, making it easier for users to locate and fix errors in their CSV files.

### Not Found Errors (Exit 3)

```
Error: Account '{name}' not found.
Error: Category '{name}' not found.
```

### Duplicate Errors (Exit 4)

```
Error: Account '{name}' already exists.
Error: Category '{name}' already exists.
```

---

## Error Handling Rules

### Rule 1: Catch at CLI Layer

Exceptions bubble up from command/database layers. The CLI layer catches them and:
1. Prints user-friendly message to stderr
2. Exits with appropriate code

```python
# cli.py
def main():
    try:
        # parse args and dispatch to command
        result = dispatch_command(args)
        # print result
        sys.exit(0)
    except FinanceError as e:
        print(f"Error: {e.message}", file=sys.stderr)
        sys.exit(e.exit_code)
    except Exception as e:
        if args.verbose:
            traceback.print_exc()
        print("Error: An unexpected error occurred.", file=sys.stderr)
        sys.exit(1)
```

### Rule 2: Never Expose Internals

User-facing error messages must NOT include:
- Full file system paths (use basename only)
- SQL query text
- Stack traces (unless --verbose)
- Internal exception types
- Database schema details
- Financial data (amounts, descriptions)

**Bad:**
```
Error: sqlite3.IntegrityError: UNIQUE constraint failed: accounts.name
```

**Good:**
```
Error: Account 'Main Checking' already exists.
```

### Rule 3: Be Specific

When multiple validation errors could apply, report the first one found:

```python
def validate_add_account(name, account_type):
    if not name:
        raise ValidationError("Account name cannot be empty.")
    if len(name) > 50:
        raise ValidationError(f"Account name must be 50 characters or fewer. Got: {len(name)}")
    if account_type not in ('checking', 'savings', 'credit', 'cash'):
        raise ValidationError("Account type must be one of: checking, savings, credit, cash")
    # ... continue validation
```

### Rule 4: Distinguish Error Types

Use the specific exception type that matches the error:

| Situation | Exception |
|-----------|-----------|
| Bad user input | `ValidationError` |
| SQLite can't connect | `DatabaseError` |
| Account not in database | `NotFoundError` |
| Account name already in database | `DuplicateError` |
| File permission issue | `ValidationError` (if path) or `DatabaseError` (if db file) |
| Invalid date format | `ValidationError` |
| Date range invalid (from > to) | `ValidationError` |

### Rule 5: Preserve Original Exceptions

When catching and re-raising, preserve the original exception for debugging:

```python
try:
    cursor.execute(query, params)
except sqlite3.IntegrityError as e:
    if "UNIQUE constraint" in str(e):
        raise DuplicateError(f"Account '{name}' already exists.") from e
    raise DatabaseError("Database constraint violation.") from e
```

---

## Verbose Mode

When `--verbose` is set:
1. Print debug information during execution
2. On error, print full stack trace
3. Include full file paths in error messages

**Verbose mode does NOT expose:**
- SQL query text (parameter values could contain sensitive data)
- Credentials or secrets
- Transaction amounts or descriptions in debug output

**CRITICAL - Verbose mode PII prohibition:** Verbose mode MUST NOT log any of the following sensitive financial data:
- Transaction amounts
- Transaction descriptions
- Account names (even in debug messages like "Looking up account")
- Category names (even in debug messages like "Found category")
- Any financial totals or balances
- Account IDs or Category IDs when associated with names

Debug output MUST use generic identifiers only (e.g., "Processing transaction ID 42", "Looking up entity by name", "Found entity ID: 3") and MUST NOT expose actual financial details (e.g., NOT "Processing transaction: $500.00 - Groceries", NOT "Looking up account 'Checking'").

**Rationale:** Financial data is personally identifiable information (PII). Even in debug mode, logging PII creates security risks (log files, terminal history, screenshots). Generic identifiers provide sufficient debugging information without exposing sensitive data.

```python
if args.verbose:
    # CORRECT - no PII
    print(f"DEBUG: Connecting to {os.path.basename(db_path)}", file=sys.stderr)
    print(f"DEBUG: Looking up entity by name", file=sys.stderr)  # Don't log name
    print(f"DEBUG: Found entity ID: {id}", file=sys.stderr)  # ID only, no name
    print(f"DEBUG: Inserting transaction", file=sys.stderr)  # Don't log amount/description

    # WRONG - exposes PII
    print(f"DEBUG: Looking up account 'Checking'", file=sys.stderr)  # WRONG
    print(f"DEBUG: Inserting $50.00", file=sys.stderr)  # WRONG
```

This prohibition applies to ARCHITECTURE-simple.md S3 as well. See ARCHITECTURE-simple.md for consistent verbose mode behavior.

---

## Testing Error Conditions

Each error path should have a test:

```python
def test_add_account_empty_name():
    result = run_cli("add-account", "--name", "", "--type", "checking")
    assert result.exit_code == 1
    assert "Account name cannot be empty" in result.stderr

def test_add_account_duplicate():
    run_cli("add-account", "--name", "Checking", "--type", "checking")
    result = run_cli("add-account", "--name", "Checking", "--type", "savings")
    assert result.exit_code == 4
    assert "already exists" in result.stderr

def test_add_transaction_account_not_found():
    result = run_cli("add-transaction", "--account", "NONEXISTENT", "--amount", "-50.00", "--category", "Groceries")
    assert result.exit_code == 3
    assert "not found" in result.stderr

def test_invalid_amount_format():
    result = run_cli("add-transaction", "--account", "Checking", "--amount", "not-a-number", "--category", "Groceries")
    assert result.exit_code == 1
    assert "Invalid amount format" in result.stderr

def test_invalid_date_format():
    result = run_cli("add-transaction", "--account", "Checking", "--amount", "-50.00", "--category", "Groceries", "--date", "01-15-2026")
    assert result.exit_code == 1
    assert "Invalid date format" in result.stderr

def test_path_traversal_blocked():
    result = run_cli("export-csv", "--output", "../../../etc/passwd")
    assert result.exit_code == 1
    assert "cannot contain '..'" in result.stderr

def test_file_exists_without_force():
    # First export succeeds
    run_cli("export-csv", "--output", "test.csv")
    # Second export fails without --force
    result = run_cli("export-csv", "--output", "test.csv")
    assert result.exit_code == 1
    assert "already exists" in result.stderr
    assert "--force" in result.stderr
```
