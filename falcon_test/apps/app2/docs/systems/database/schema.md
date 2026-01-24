# Database Schema: Personal Finance Tracker CLI

**Status:** [FINAL]

---

## Database File

- **Engine:** SQLite 3
- **File:** User-specified via `--db` (default: `./finances.db`)
- **Encoding:** UTF-8
- **Permissions:** 0600 (owner read/write only)

### File Permissions Enforcement

**When enforced:** Automatically on database creation (init command) ONLY. Permissions are NOT enforced on subsequent write operations.

**How enforced:** The application creates database files with secure permissions using the following atomic sequence:
1. Use `os.open()` with flags `O_CREAT|O_EXCL` and mode `0o600` to create the file atomically with correct permissions
2. Close the file descriptor
3. Call `sqlite3.connect()` on the existing file

This ensures:
- New database files created by `init` command have 0600 permissions from creation
- File creation is atomic (fails if file already exists)
- Only the file owner can read or write the database

**User responsibility:** If users manually create database files or modify permissions outside the application, they are responsible for ensuring proper permissions. The application will not check or correct existing file permissions on subsequent opens—it only enforces permissions during initial file creation.

---

## Schema Definition

```sql
-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    account_type TEXT    NOT NULL CHECK (account_type IN ('checking', 'savings', 'credit', 'cash')),
    created_at   TEXT    NOT NULL
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL UNIQUE,
    category_type TEXT    NOT NULL CHECK (category_type IN ('income', 'expense')),
    created_at    TEXT    NOT NULL
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id       INTEGER NOT NULL REFERENCES accounts(id),
    category_id      INTEGER NOT NULL REFERENCES categories(id),
    amount_cents     INTEGER NOT NULL,
    description      TEXT,
    transaction_date TEXT    NOT NULL,
    created_at       TEXT    NOT NULL
);

-- Budgets table
CREATE TABLE IF NOT EXISTS budgets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id   INTEGER NOT NULL REFERENCES categories(id),
    month         TEXT    NOT NULL,
    amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
    UNIQUE(category_id, month)
    -- Note: The constraint that budgets can only be set on expense categories
    -- (not income categories) is enforced at the application layer (CLI validation),
    -- not via a CHECK constraint. This is because SQLite CHECK constraints cannot
    -- reference other tables (categories.category_type). The application MUST
    -- validate category type before allowing budget creation.
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
```

---

## Column Specifications

### Accounts Table

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `name` | TEXT | No | - | UNIQUE | Max 50 chars (app-enforced). No DB CHECK due to lack of string length constraints in SQLite. |
| `account_type` | TEXT | No | - | CHECK IN ('checking', 'savings', 'credit', 'cash') | Account classification |
| `created_at` | TEXT | No | - | - | ISO 8601 format |

**Validation Strategy:** Length validation (50 char max for names) is enforced at the application layer because SQLite lacks native string length CHECK constraints. The application MUST validate lengths before INSERT/UPDATE operations. See validation.md for enforcement details.

### Categories Table

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `name` | TEXT | No | - | UNIQUE | Max 50 chars (app-enforced). No DB CHECK due to lack of string length constraints in SQLite. |
| `category_type` | TEXT | No | - | CHECK IN ('income', 'expense') | Category classification |
| `created_at` | TEXT | No | - | - | ISO 8601 format |

### Transactions Table

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `account_id` | INTEGER | No | - | FOREIGN KEY | References accounts(id) |
| `category_id` | INTEGER | No | - | FOREIGN KEY | References categories(id) |
| `amount_cents` | INTEGER | No | - | - | Positive=income, Negative=expense. MUST be INTEGER (never float). |
| `description` | TEXT | Yes | NULL | - | Max 500 chars (app-enforced). No DB CHECK due to lack of string length constraints in SQLite. |
| `transaction_date` | TEXT | No | - | - | ISO 8601 date (YYYY-MM-DD) |
| `created_at` | TEXT | No | - | - | ISO 8601 timestamp |

**CRITICAL - Monetary Value Storage**: All monetary values MUST be stored as INTEGER cents. Never use REAL/float for monetary values. This prevents floating-point precision errors in financial calculations.

### Budgets Table

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `category_id` | INTEGER | No | - | FOREIGN KEY | References categories(id) |
| `month` | TEXT | No | - | - | Format: YYYY-MM |
| `amount_cents` | INTEGER | No | - | CHECK > 0 | Budget amount in cents. MUST be INTEGER (never float). |
| - | - | - | - | UNIQUE(category_id, month) | One budget per category/month |

---

## Timestamp Format

All timestamps use ISO 8601 format with UTC timezone:

```
YYYY-MM-DDTHH:MM:SS.ffffffZ
```

Example: `2026-01-21T15:30:45.123456Z`

**Date format (transaction_date):**
```
YYYY-MM-DD
```

Example: `2026-01-21`

**Month format (budgets.month):**
```
YYYY-MM
```

Example: `2026-01`

**Python generation:**
```python
from datetime import datetime, timezone

# Import required datetime modules at the beginning of your file:
# from datetime import datetime, timezone

# Timestamp with Z suffix (matches documented format)
timestamp = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
# OR explicitly format:
timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

# Note: Plain isoformat() returns '+00:00' instead of 'Z':
# datetime.now(timezone.utc).isoformat()  # Returns: '2026-01-21T15:30:45.123456+00:00'
# Both '+00:00' and 'Z' are valid ISO 8601, but 'Z' suffix is preferred for consistency.

# Date only
date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

# Month only
month_str = datetime.now(timezone.utc).strftime("%Y-%m")
```

---

## Query Patterns

### Insert Account

```sql
INSERT INTO accounts (name, account_type, created_at)
VALUES (?, ?, ?);
```

Parameters: `(name, account_type, created_at)`

Returns: `cursor.lastrowid` for the new account ID

### Insert Category

```sql
INSERT INTO categories (name, category_type, created_at)
VALUES (?, ?, ?);
```

Parameters: `(name, category_type, created_at)`

Returns: `cursor.lastrowid` for the new category ID

### Insert Transaction

```sql
INSERT INTO transactions (account_id, category_id, amount_cents, description, transaction_date, created_at)
VALUES (?, ?, ?, ?, ?, ?);
```

Parameters: `(account_id, category_id, amount_cents, description, transaction_date, created_at)`

Returns: `cursor.lastrowid` for the new transaction ID

### Insert or Update Budget

```sql
INSERT INTO budgets (category_id, month, amount_cents)
VALUES (?, ?, ?)
ON CONFLICT(category_id, month) DO UPDATE SET amount_cents = ?;
```

Parameters: `(category_id, month, amount_cents, amount_cents)`

### Find Account by Name

```sql
SELECT id, name, account_type, created_at
FROM accounts
WHERE name = ?;
```

Parameters: `(name,)`

### Find Category by Name

```sql
SELECT id, name, category_type, created_at
FROM categories
WHERE name = ?;
```

Parameters: `(name,)`

### Get All Accounts

```sql
SELECT id, name, account_type, created_at
FROM accounts
ORDER BY name;
```

Parameters: none

### Get All Categories

```sql
SELECT id, name, category_type, created_at
FROM categories
ORDER BY name;
```

Parameters: none

### Get Account Balances

```sql
SELECT
    a.id,
    a.name,
    a.account_type,
    COALESCE(SUM(t.amount_cents), 0) as balance_cents
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
WHERE (? IS NULL OR a.id = ?)
GROUP BY a.id, a.name, a.account_type
ORDER BY a.name;
```

Parameters: `(account_id, account_id)`

### Search Transactions

```sql
SELECT
    t.id, t.account_id, t.category_id, t.amount_cents,
    t.description, t.transaction_date, t.created_at,
    a.name as account_name, c.name as category_name
FROM transactions t
JOIN accounts a ON t.account_id = a.id
JOIN categories c ON t.category_id = c.id
WHERE 1=1
    AND (? IS NULL OR t.account_id = ?)
    AND (? IS NULL OR t.category_id = ?)
    AND (? IS NULL OR t.transaction_date >= ?)
    AND (? IS NULL OR t.transaction_date <= ?)
ORDER BY t.transaction_date DESC, t.id DESC
LIMIT ?;
```

Parameters: `(account_id, account_id, category_id, category_id, from_date, from_date, to_date, to_date, limit)`

**Note:** Parameters must be passed in pairs for optional filters. Each optional filter uses the pattern `(? IS NULL OR column = ?)`, requiring the same value twice. See Python example below for correct parameter construction.

**Note:** Use `NULL` for unused filters. The `(? IS NULL OR column = ?)` pattern allows optional filtering.

**Note:** The `limit` parameter is required. The CLI layer must always provide a value (default 50).
The database layer does not handle NULL/None limits - the SQL requires an integer.

**Note:** The `limit` parameter MUST be a positive integer. CLI layer MUST validate `limit > 0` before calling database layer.

**Python Example - Correct Parameter Construction:**
```python
def search_transactions(conn, account_id=None, category_id=None, from_date=None, to_date=None, limit=50):
    """Search transactions with optional filters.

    Critical: Parameters must be passed in pairs for optional filters.
    Each optional filter uses the pattern (? IS NULL OR column = ?),
    so the same value must appear twice in the parameter tuple.

    Args:
        conn: Database connection
        account_id: Optional account ID filter (or None for all accounts)
        category_id: Optional category ID filter (or None for all categories)
        from_date: Optional start date filter (or None for no start limit)
        to_date: Optional end date filter (or None for no end limit)
        limit: Maximum number of results (required, must be > 0)

    Returns:
        List of Transaction objects matching the filters
    """
    # Critical: Parameters must be passed in pairs for optional filters
    params = (account_id, account_id, category_id, category_id, from_date, from_date, to_date, to_date, limit)

    cursor = conn.execute(SEARCH_TRANSACTIONS_SQL, params)
    return [Transaction(**row) for row in cursor.fetchall()]
```

### Budget Report

```sql
SELECT
    c.id as category_id,
    c.name as category_name,
    COALESCE(b.amount_cents, 0) as budget_cents,
    COALESCE(ABS(SUM(CASE WHEN t.amount_cents < 0 THEN t.amount_cents ELSE 0 END)), 0) as spent_cents
FROM categories c
LEFT JOIN budgets b ON b.category_id = c.id AND b.month = ?
LEFT JOIN transactions t ON t.category_id = c.id
    AND t.transaction_date >= ?
    AND t.transaction_date < ?
WHERE c.category_type = 'expense'
GROUP BY c.id, c.name, b.amount_cents
ORDER BY c.name;
```

Parameters: `(month, month_start_date, month_end_date)`

**Note:** `month_start_date` = `YYYY-MM-01`, `month_end_date` = first day of next month

**Note:** Budget reports only include expense categories. This query filters by `category_type='expense'` and assumes the validation layer prevents budgets from being created on income categories. Attempting to set a budget on an income category should be rejected at the command layer with an appropriate error message.

**Python helper for calculating month boundaries:**
```python
import re

def get_month_boundaries(month: str) -> tuple[str, str]:
    """Get start and end dates for a month (YYYY-MM format).

    Args:
        month: Month string in YYYY-MM format (e.g., '2026-01')
                Must be pre-validated by validate_month() before calling this function.

    Returns:
        Tuple of (start_date, end_date) where:
        - start_date is YYYY-MM-01
        - end_date is first day of next month

    Raises:
        ValueError: If month format is invalid (defense-in-depth check)

    Note: This function assumes the input has been validated by validate_month().
          The format check here is defense-in-depth only.
    """
    # Defense-in-depth: verify format even though validate_month() should have checked
    if not re.match(r'^\d{4}-(0[1-9]|1[0-2])$', month):
        raise ValueError(f"Invalid month format: {month}. Expected YYYY-MM with month 01-12.")

    year, month_num = map(int, month.split('-'))
    start = f"{year}-{month_num:02d}-01"
    # Calculate first day of next month (handles December -> January)
    if month_num == 12:
        end = f"{year + 1}-01-01"
    else:
        end = f"{year}-{month_num + 1:02d}-01"
    return start, end
```

### Budget Report Calculation Logic

The budget report query returns raw data (budget_cents, spent_cents). The application layer calculates derived fields using BudgetReportItem dataclass:

**Field Calculations:**

1. **spent_cents**: Extracted from SQL query (sum of absolute values of negative transactions for the category in the month)

2. **remaining_cents**: Calculated as `budget_cents - spent_cents`
   - Result can be positive (under budget), zero (exactly at budget), or negative (over budget)

3. **percent_used**: Calculated as `(spent_cents / budget_cents) * 100` rounded to 1 decimal place
   - **Edge case - Division by zero:** If `budget_cents == 0`, set `percent_used = 0.0`
   - Rationale: A zero budget means "no budget set", not "infinite spending allowed". Display as 0% usage rather than error or infinity.
   - **Edge case - Over budget:** `percent_used` can exceed 100% (e.g., 125.5% means spent $125.50 for every $100 budgeted)

**Python Implementation Reference** (see components.md for full code):
```python
def calculate_percent_used(spent_cents: int, budget_cents: int) -> float:
    """Calculate percentage of budget used.

    Returns:
        Percentage rounded to 1 decimal place.
        Returns 0.0 if budget is zero (avoid division by zero).
    """
    if budget_cents == 0:
        return 0.0
    return round((spent_cents / budget_cents) * 100, 1)
```

**Display Format** (see interface.md for full output format):
```
Category: Groceries
Budget: $500.00
Spent: $312.45
Remaining: $187.55
Percent Used: 62.5%
```

### Get Transactions for Export

```sql
SELECT
    t.id, t.account_id, t.category_id, t.amount_cents,
    t.description, t.transaction_date, t.created_at,
    a.name as account_name, c.name as category_name
FROM transactions t
JOIN accounts a ON t.account_id = a.id
JOIN categories c ON t.category_id = c.id
WHERE 1=1
    AND (? IS NULL OR t.transaction_date >= ?)
    AND (? IS NULL OR t.transaction_date <= ?)
ORDER BY t.transaction_date ASC, t.id ASC;
```

Parameters: `(from_date, from_date, to_date, to_date)`

---

## Example Data

```sql
-- Accounts
INSERT INTO accounts (name, account_type, created_at) VALUES
    ('Main Checking', 'checking', '2026-01-01T10:00:00Z'),
    ('Savings', 'savings', '2026-01-01T10:00:00Z'),
    ('Credit Card', 'credit', '2026-01-01T10:00:00Z');

-- Categories
INSERT INTO categories (name, category_type, created_at) VALUES
    ('Salary', 'income', '2026-01-01T10:00:00Z'),
    ('Freelance', 'income', '2026-01-01T10:00:00Z'),
    ('Groceries', 'expense', '2026-01-01T10:00:00Z'),
    ('Utilities', 'expense', '2026-01-01T10:00:00Z'),
    ('Entertainment', 'expense', '2026-01-01T10:00:00Z');

-- Transactions
INSERT INTO transactions (account_id, category_id, amount_cents, description, transaction_date, created_at) VALUES
    (1, 1, 500000, 'Monthly salary', '2026-01-15', '2026-01-15T09:00:00Z'),
    (1, 3, -12567, 'Weekly groceries', '2026-01-18', '2026-01-18T14:30:00Z'),
    (3, 5, -4999, 'Movie tickets', '2026-01-19', '2026-01-19T20:00:00Z');

-- Budgets
INSERT INTO budgets (category_id, month, amount_cents) VALUES
    (3, '2026-01', 50000),   -- Groceries: $500
    (4, '2026-01', 20000),   -- Utilities: $200
    (5, '2026-01', 15000);   -- Entertainment: $150
```

---

## Connection Management

```python
import sqlite3
from contextlib import contextmanager

@contextmanager
def get_connection(db_path: str):
    """Context manager for database connections."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")  # Enable foreign key enforcement
    conn.row_factory = sqlite3.Row  # Enable column access by name
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
- Always commit or rollback (no implicit transactions)
- Set `row_factory = sqlite3.Row` for named column access
- Enable foreign keys with `PRAGMA foreign_keys = ON` (SQLite has foreign key enforcement OFF by default; this must be enabled per-connection)

---

## Concurrency and Locking

### Recurring Transaction Generation (OUT OF SCOPE)

**Note:** Recurring transactions are NOT implemented in the current MVP (Tasks 1-4). The following guidance is provided for future reference only.

**CRITICAL - Race Condition Prevention**: If recurring transaction generation is implemented in the future, it MUST use proper locking to prevent duplicate generation when multiple processes run concurrently.

**Required Pattern:**
```sql
-- SQLite approach: Use IMMEDIATE transaction to acquire write lock immediately
BEGIN IMMEDIATE TRANSACTION;

-- Check if recurring transaction was already generated for this period
SELECT id FROM recurring_transaction_log
WHERE recurring_rule_id = ? AND period = ?;

-- If not found, generate the transaction
INSERT INTO transactions (...) VALUES (...);

-- Log that this period was processed
INSERT INTO recurring_transaction_log (recurring_rule_id, period, generated_at)
VALUES (?, ?, ?);

COMMIT;
```

**Alternative approach using application-level locking:**
```python
# Use file-based locking for single-user CLI
import fcntl

def generate_recurring_transactions(db_path: str):
    lock_file = f"{db_path}.lock"
    with open(lock_file, 'w') as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)  # Exclusive lock
        try:
            # Perform recurring transaction generation
            pass
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
```

**Note:** SQLite does not support `SELECT ... FOR UPDATE` syntax. Use `BEGIN IMMEDIATE TRANSACTION` or `BEGIN EXCLUSIVE TRANSACTION` to acquire write locks at transaction start, preventing concurrent modifications.

### S5: Foreign Key Enforcement (CRITICAL)

**`PRAGMA foreign_keys = ON` MUST be executed on every new database connection.**

Without this pragma, SQLite silently ignores all `REFERENCES` constraints, allowing:
- Transactions referencing non-existent accounts
- Transactions referencing non-existent categories
- Budgets referencing non-existent categories

This is a security-critical rule. The `get_connection()` context manager MUST execute this pragma immediately after opening the connection, before any other operations.
