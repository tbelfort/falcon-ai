# App2 Implementation Plan: Personal Finance Tracker CLI

This document specifies EXACTLY what needs to be created for app2. An implementation agent should be able to create all files without ambiguity.

---

## 1. App Overview

**Personal Finance Tracker CLI** is a pip-installable command-line tool for personal budget tracking and financial management.

### Target User

**Alex, a freelance consultant**:
- Manages income from multiple clients and various expense categories
- Needs to track spending against monthly budgets
- Wants to generate reports for tax preparation
- Prefers offline tools that work without internet
- Has basic command-line familiarity

### Core Features

1. **Account Management**: Track multiple accounts (checking, savings, credit cards, cash)
2. **Transaction Tracking**: Record income and expenses with categories, dates, descriptions
3. **Category System**: Customizable income/expense categories
4. **Budget Tracking**: Set and monitor monthly spending limits per category
5. **Reporting**: Balance summaries, budget reports, transaction listings
6. **Data Export/Import**: CSV export and import for backups and spreadsheet analysis

### Technical Constraints

- Python 3.10+ only
- Standard library only (no pip dependencies)
- SQLite for local storage
- Single-user, offline operation

### Security Surfaces for Falcon Testing

- **B01**: SQL injection via transaction descriptions, category names, account names
- **B02**: Input validation on amounts (decimals), dates, names
- **B03**: Sensitive financial data in error messages or logs
- **B04**: Proper decimal/currency handling (avoid floating-point errors)

---

## 2. Directory Structure

```
app2/
├── docs/
│   ├── design/
│   │   ├── INDEX.md
│   │   ├── vision.md
│   │   ├── use-cases.md
│   │   ├── technical.md
│   │   └── components.md
│   └── systems/
│       ├── architecture/
│       │   └── ARCHITECTURE-simple.md
│       ├── database/
│       │   └── schema.md
│       ├── cli/
│       │   └── interface.md
│       └── errors.md
└── tasks/
    ├── task1.md
    ├── task2.md
    ├── task3.md
    └── task4.md
```

---

## 3. Design Docs Outline

### 3.1 `docs/design/INDEX.md`

**Purpose**: Navigation and document map for Context Pack agents.

**Required Sections**:

1. **Document Map Table**
   | Document | Purpose | Read When |
   |----------|---------|-----------|
   | `vision.md` | Why we're building this | Always |
   | `use-cases.md` | How the tool is used | Any user-facing change |
   | `technical.md` | Architecture decisions | Any structural change |
   | `components.md` | Module breakdown | Implementation work |

2. **Systems Documentation Table**
   | Document | Purpose | Read When |
   |----------|---------|-----------|
   | `systems/architecture/ARCHITECTURE-simple.md` | Layer rules, data flow | Always |
   | `systems/database/schema.md` | SQLite schema, queries | Database work |
   | `systems/cli/interface.md` | Command specifications | CLI work |
   | `systems/errors.md` | Exception handling | Error handling work |

3. **Component Mapping Table**
   | Component | Design Doc | Systems Doc |
   |-----------|------------|-------------|
   | `cli.py` | `components.md` | `cli/interface.md`, `errors.md` |
   | `commands.py` | `components.md` | `architecture/ARCHITECTURE-simple.md` |
   | `database.py` | `technical.md`, `components.md` | `database/schema.md` |
   | `models.py` | `components.md` | `database/schema.md` |
   | `formatters.py` | `components.md` | `cli/interface.md` |
   | `exceptions.py` | `technical.md`, `components.md` | `errors.md` |

4. **Architecture Decisions Table**
   | ID | Decision | Impact |
   |----|----------|--------|
   | AD1 | Layered architecture | Module structure |
   | AD2 | No global state | All modules |
   | AD3 | Explicit error types | `exceptions.py`, `cli.py` |
   | AD4 | Parameterized queries only | `database.py` |
   | AD5 | Input validation at boundary | `cli.py` |
   | AD6 | Atomic database operations | `database.py`, `commands.py` |
   | AD7 | Decimal for currency (not float) | `models.py`, `database.py` |

5. **Security Considerations**
   - SQL Injection Prevention -> `technical.md` (AD4), `architecture/ARCHITECTURE-simple.md` (S1)
   - Path Validation -> `architecture/ARCHITECTURE-simple.md` (S2)
   - Error Message Sanitization -> `architecture/ARCHITECTURE-simple.md` (S3)
   - Financial Data Protection -> `architecture/ARCHITECTURE-simple.md` (S4)

---

### 3.2 `docs/design/vision.md`

**Required Sections**:

1. **Problem Statement**
   - Freelancers and individuals need personal budget tracking
   - Existing solutions are overkill (enterprise), cloud-dependent (subscription), or not scriptable (GUI-only)
   - Need offline, local-first financial tracking

2. **Target User**
   - Alex, freelance consultant
   - Manages income from 3-5 clients
   - Tracks expenses across ~10 categories
   - Needs monthly budget reports for financial planning
   - Wants to export data for tax preparation
   - Works offline frequently (coffee shops, travel)

3. **Solution**
   - Pip-installable CLI tool
   - Local SQLite database (no server)
   - Simple commands for daily operations (add transaction, check balance)
   - Machine-readable outputs (JSON, CSV) for scripting
   - No external dependencies (Python standard library only)

4. **Non-Goals**
   - Multi-user access (single user only)
   - Cloud sync or mobile app
   - Investment tracking or stock portfolio
   - Bill payment or bank integration
   - Receipt scanning or OCR
   - Multi-currency support (single currency assumed)

5. **Success Criteria**
   - User can go from `pip install` to tracking finances in under 5 minutes
   - All commands complete in <100ms for databases up to 100,000 transactions
   - Works fully offline after install
   - Shell scripts can parse output reliably (stable JSON schema)

---

### 3.3 `docs/design/use-cases.md`

**Required Use Cases** (7 total):

#### UC1: Initial Setup
- **Actor**: User setting up finance tracking for the first time
- **Flow**:
  1. Install: `pip install finance-cli`
  2. Initialize: `finance-cli init --db ./finances.db`
  3. Add accounts: checking, savings, credit card
  4. Add categories: groceries, utilities, income-freelance, etc.
- **Success**: Database created with accounts and categories ready
- **Failure modes**:
  - Database path not writable -> clear error message
  - Database already exists -> refuse without `--force`

#### UC2: Recording Daily Expense
- **Actor**: User recording a purchase
- **Flow**:
  1. `finance-cli add-transaction --account checking --amount -45.67 --category groceries --description "Weekly groceries"`
- **Success**: Transaction recorded, new balance shown
- **Failure modes**:
  - Account not found -> exit 3, suggest `add-account`
  - Category not found -> exit 3, suggest `add-category`
  - Invalid amount format -> exit 1, show format help

#### UC3: Recording Income
- **Actor**: Freelancer recording client payment
- **Flow**:
  1. `finance-cli add-transaction --account checking --amount 2500.00 --category income-freelance --description "Client ABC invoice #123" --date 2026-01-15`
- **Success**: Income recorded with specified date
- **Failure modes**:
  - Invalid date format -> exit 1, show expected format
  - Future date warning (optional, allowed)

#### UC4: Checking Account Balance
- **Actor**: User checking current financial status
- **Flow**:
  1. `finance-cli balance` (all accounts)
  2. `finance-cli balance --account checking` (specific account)
- **Success**: Current balance displayed with account details
- **Failure modes**:
  - Account not found -> exit 3
  - No accounts exist -> helpful message

#### UC5: Monthly Budget Review
- **Actor**: User checking spending against budgets
- **Flow**:
  1. `finance-cli budget-report --month 2026-01`
- **Success**: Report showing category spending vs budget, over/under
- **Failure modes**:
  - Invalid month format -> exit 1
  - No budgets set -> show spending without budget comparison

#### UC6: Transaction History Review
- **Actor**: User reviewing past transactions
- **Flow**:
  1. `finance-cli list-transactions --from 2026-01-01 --to 2026-01-31`
  2. `finance-cli list-transactions --category groceries --limit 20`
  3. `finance-cli list-transactions --account checking --format json`
- **Success**: Filtered transaction list displayed
- **Failure modes**:
  - Invalid date range (from > to) -> exit 1
  - No matching transactions -> empty result, exit 0

#### UC7: Data Export for Tax Prep
- **Actor**: User exporting data for accountant
- **Flow**:
  1. `finance-cli export-csv --output transactions-2025.csv --from 2025-01-01 --to 2025-12-31`
  2. Open CSV in Excel
- **Success**: CSV file with all transaction data
- **Failure modes**:
  - File exists -> require `--force`
  - Path not writable -> exit 1

---

### 3.4 `docs/design/technical.md`

**Required Sections**:

1. **Technology Choices**

   **Language: Python 3.10+**
   - Type hints for code quality
   - Rich standard library
   - Cross-platform

   **Constraint**: Standard library only. No pip dependencies.

   **Database: SQLite3**
   - Zero configuration, single file
   - Included in Python standard library
   - Handles 100,000+ transactions easily

   **Constraint**: Use `sqlite3` module only. No ORM.

   **CLI Framework: argparse**
   - Standard library
   - Sufficient for command structure

   **Rejected alternatives**: Click (external), Typer (external), Fire (magic behavior)

2. **Architecture Decisions**

   **AD1: Layered Architecture**
   ```
   CLI Layer (cli.py)
       ↓ parses args, routes commands
   Command Layer (commands.py)
       ↓ business logic, validation
   Database Layer (database.py)
       ↓ SQL queries, connection management
   ```
   Rationale: Separation of concerns.

   **AD2: No Global State**
   Each command receives explicit parameters. No module-level database connections.
   Rationale: Testability, predictability.

   **AD3: Explicit Error Types**
   Custom exception hierarchy maps to exit codes:
   ```python
   FinanceError (base)
   ├── ValidationError      → exit 1
   ├── DatabaseError        → exit 2
   ├── NotFoundError        → exit 3
   └── DuplicateError       → exit 4
   ```
   Rationale: Predictable exit codes for scripting.

   **AD4: Parameterized Queries Only**
   ALL SQL queries MUST use parameterized placeholders (`?`).

   Never:
   ```python
   cursor.execute(f"SELECT * FROM accounts WHERE name = '{name}'")  # WRONG
   ```

   Always:
   ```python
   cursor.execute("SELECT * FROM accounts WHERE name = ?", (name,))  # RIGHT
   ```
   Rationale: Prevents SQL injection. Non-negotiable.

   **AD5: Input Validation at Boundary**
   Validate all user input in CLI layer:
   - Account name: non-empty, max 50 chars
   - Category name: non-empty, max 50 chars
   - Amount: valid decimal, max 2 decimal places
   - Date: ISO 8601 format (YYYY-MM-DD)
   - Description: max 500 chars
   - Path: valid filesystem path

   Rationale: Fail fast with clear error messages.

   **AD6: Atomic Database Operations**
   Each command is a single transaction.
   Rationale: No partial updates, consistent state.

   **AD7: Decimal for Currency (not float)**
   Store amounts as INTEGER cents in database. Display as decimal.
   Rationale: Avoid floating-point precision errors with money.

3. **Data Model**

   **Accounts Table**
   | Column | Type | Constraints |
   |--------|------|-------------|
   | id | INTEGER | PRIMARY KEY AUTOINCREMENT |
   | name | TEXT | UNIQUE NOT NULL |
   | account_type | TEXT | NOT NULL (checking/savings/credit/cash) |
   | created_at | TEXT | ISO 8601 timestamp |

   **Categories Table**
   | Column | Type | Constraints |
   |--------|------|-------------|
   | id | INTEGER | PRIMARY KEY AUTOINCREMENT |
   | name | TEXT | UNIQUE NOT NULL |
   | category_type | TEXT | NOT NULL (income/expense) |
   | created_at | TEXT | ISO 8601 timestamp |

   **Transactions Table**
   | Column | Type | Constraints |
   |--------|------|-------------|
   | id | INTEGER | PRIMARY KEY AUTOINCREMENT |
   | account_id | INTEGER | FOREIGN KEY, NOT NULL |
   | category_id | INTEGER | FOREIGN KEY, NOT NULL |
   | amount_cents | INTEGER | NOT NULL (positive=income, negative=expense) |
   | description | TEXT | nullable |
   | transaction_date | TEXT | NOT NULL, ISO 8601 date |
   | created_at | TEXT | ISO 8601 timestamp |

   **Budgets Table**
   | Column | Type | Constraints |
   |--------|------|-------------|
   | id | INTEGER | PRIMARY KEY AUTOINCREMENT |
   | category_id | INTEGER | FOREIGN KEY, NOT NULL |
   | month | TEXT | NOT NULL (YYYY-MM format) |
   | amount_cents | INTEGER | NOT NULL, > 0 |
   | UNIQUE(category_id, month) | | |

4. **Output Formats**

   **Table Format (default)**: Human-readable fixed-width columns
   **JSON Format (`--format json`)**: Machine-readable, stable schema
   **CSV Format (export only)**: RFC 4180 compliant

5. **Performance Targets**
   | Operation | Target | Max dataset |
   |-----------|--------|-------------|
   | init | <500ms | n/a |
   | add-transaction | <50ms | n/a |
   | balance | <100ms | 100,000 transactions |
   | list-transactions | <100ms | 100,000 transactions |
   | budget-report | <100ms | 100,000 transactions |
   | export-csv | <5s | 100,000 transactions |

6. **Security Considerations**
   - SQL Injection: Mitigated by AD4
   - Path Traversal: Validate `--db` and `--output` paths
   - Error Message Leakage: Don't expose SQL or file paths
   - Financial Data: Don't log transaction details

---

### 3.5 `docs/design/components.md`

**Required Sections**:

1. **Module Overview**
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

2. **Component Details** (for each module):

   **`__init__.py`**
   - Purpose: Package marker and version constant
   - Contents: `__version__ = "0.1.0"`
   - Dependencies: None

   **`__main__.py`**
   - Purpose: Entry point for `python -m finance_cli`
   - Contents: Import and call `cli.main()`
   - Dependencies: `cli`

   **`cli.py`**
   - Purpose: Parse command-line arguments, route to command handlers
   - Responsibilities:
     1. Define argument parser with subcommands
     2. Validate input at boundary
     3. Map exceptions to exit codes
     4. Handle `--verbose` flag
   - Public interface: `main()`
   - Dependencies: `commands`, `exceptions`
   - Does NOT: Access database directly, execute business logic

   **`commands.py`**
   - Purpose: Business logic for each CLI command
   - Responsibilities:
     1. Implement each command as a function
     2. Coordinate database and formatters
     3. Enforce business rules
   - Public interface:
     - `cmd_init(db_path: str, force: bool) -> None`
     - `cmd_add_account(db_path: str, name: str, account_type: str) -> int`
     - `cmd_add_category(db_path: str, name: str, category_type: str) -> int`
     - `cmd_add_transaction(db_path: str, account: str, amount: Decimal, category: str, description: str | None, date: str) -> int`
     - `cmd_list_transactions(db_path: str, account: str | None, category: str | None, from_date: str | None, to_date: str | None, limit: int | None) -> list[Transaction]`
     - `cmd_balance(db_path: str, account: str | None) -> list[AccountBalance]`
     - `cmd_set_budget(db_path: str, category: str, month: str, amount: Decimal) -> None`
     - `cmd_budget_report(db_path: str, month: str) -> list[BudgetReportItem]`
     - `cmd_export_csv(db_path: str, output: str, from_date: str | None, to_date: str | None, force: bool) -> int`
     - `cmd_import_csv(db_path: str, input_path: str) -> int`
   - Dependencies: `database`, `models`, `exceptions`
   - Does NOT: Parse CLI arguments, format output, handle exit codes

   **`database.py`**
   - Purpose: Database connection and SQL operations
   - Responsibilities:
     1. Create/connect to SQLite database
     2. Run schema migrations
     3. Execute parameterized queries
     4. Handle transactions
   - Public interface:
     - `init_database(path: str) -> None`
     - `get_connection(path: str) -> ContextManager[sqlite3.Connection]`
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
   - Dependencies: `models`, `exceptions`
   - Does NOT: Validate business rules, format output
   - Critical constraint: ALL queries use parameterized placeholders

   **`models.py`**
   - Purpose: Data classes and validation logic
   - Public interface:
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

     def validate_account_name(name: str) -> str  # raises ValidationError
     def validate_category_name(name: str) -> str  # raises ValidationError
     def validate_account_type(account_type: str) -> str  # raises ValidationError
     def validate_category_type(category_type: str) -> str  # raises ValidationError
     def validate_amount(amount: str) -> int  # returns cents, raises ValidationError
     def validate_date(date: str) -> str  # raises ValidationError
     def validate_month(month: str) -> str  # raises ValidationError, YYYY-MM format
     def validate_description(desc: str | None) -> str | None  # raises ValidationError
     def validate_path(path: str) -> str  # raises ValidationError
     def cents_to_decimal(cents: int) -> Decimal
     def decimal_to_cents(amount: Decimal) -> int
     ```
   - Dependencies: `exceptions`
   - Does NOT: Access database, format output

   **`formatters.py`**
   - Purpose: Format data for output
   - Public interface:
     - `format_transactions_table(transactions: list[Transaction]) -> str`
     - `format_transactions_json(transactions: list[Transaction]) -> str`
     - `format_balance_table(balances: list[AccountBalance]) -> str`
     - `format_balance_json(balances: list[AccountBalance]) -> str`
     - `format_budget_report_table(items: list[BudgetReportItem]) -> str`
     - `format_budget_report_json(items: list[BudgetReportItem]) -> str`
     - `format_accounts_table(accounts: list[Account]) -> str`
     - `format_categories_table(categories: list[Category]) -> str`
     - `write_transactions_csv(transactions: list[Transaction], path: str) -> None`
     - `read_transactions_csv(path: str) -> list[dict]`
   - Dependencies: `models`
   - Does NOT: Access database, validate input

   **`exceptions.py`**
   - Purpose: Custom exception hierarchy
   - Contents:
     ```python
     class FinanceError(Exception):
         exit_code = 1

     class ValidationError(FinanceError):
         exit_code = 1

     class DatabaseError(FinanceError):
         exit_code = 2

     class NotFoundError(FinanceError):
         exit_code = 3

     class DuplicateError(FinanceError):
         exit_code = 4
     ```
   - Dependencies: None

3. **Dependency Graph**
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
   Rule: No circular dependencies. Lower layers don't import from higher layers.

---

## 4. Systems Docs Outline

### 4.1 `docs/systems/architecture/ARCHITECTURE-simple.md`

**Required Sections**:

1. **System Overview** (ASCII diagram)
   ```
   ┌─────────────────────────────────────────────────────────┐
   │                    USER (Terminal)                       │
   └─────────────────────────┬───────────────────────────────┘
                             │ CLI arguments
                             ▼
   ┌─────────────────────────────────────────────────────────┐
   │                      cli.py                              │
   │  - Parse arguments (argparse)                           │
   │  - Validate input at boundary                           │
   │  - Route to command handlers                            │
   │  - Map exceptions to exit codes                         │
   └─────────────────────────┬───────────────────────────────┘
                             │ Validated parameters
                             ▼
   ┌─────────────────────────────────────────────────────────┐
   │                    commands.py                           │
   │  - Business logic per command                           │
   │  - Coordinate database + formatters                     │
   │  - Enforce business rules                               │
   └──────────────┬──────────────────────────┬───────────────┘
                  │                          │
                  ▼                          ▼
   ┌──────────────────────────┐  ┌───────────────────────────┐
   │      database.py         │  │      formatters.py        │
   │  - SQL queries           │  │  - Table output           │
   │  - Transactions          │  │  - JSON output            │
   │  - Connection mgmt       │  │  - CSV export             │
   └──────────────┬───────────┘  └───────────────────────────┘
                  │
                  ▼
   ┌──────────────────────────┐
   │    SQLite (file)         │
   │    finances.db           │
   └──────────────────────────┘
   ```

2. **Layer Rules**

   **CLI Layer (`cli.py`)**
   - MUST: Parse arguments with argparse, validate input, catch FinanceError and convert to exit codes, print user-facing messages
   - MUST NOT: Access database directly, import sqlite3, contain business logic, format output

   **Command Layer (`commands.py`)**
   - MUST: Implement one function per command, accept validated typed parameters, return data (not formatted strings), raise specific exceptions
   - MUST NOT: Parse CLI arguments, print to stdout/stderr, handle exit codes, catch exceptions

   **Database Layer (`database.py`)**
   - MUST: Use parameterized queries exclusively, use context managers, use transactions, return model objects
   - MUST NOT: Validate business rules, format output, use string interpolation in queries (SECURITY CRITICAL)

   **Formatter Layer (`formatters.py`)**
   - MUST: Accept model objects, return strings or write files, handle edge cases
   - MUST NOT: Access database, make business decisions

3. **Data Flow Examples**

   **Add Transaction**
   ```
   User: finance-cli add-transaction --account checking --amount -45.67 --category groceries
                               │
   cli.py: parse args          │
   cli.py: validate_amount("-45.67") → -4567 cents  ✓
   cli.py: validate_account_name("checking")         ✓
   cli.py: validate_category_name("groceries")       ✓
                               │
   commands.py: cmd_add_transaction(...)
   commands.py: find_account_by_name("checking") → Account
   commands.py: find_category_by_name("groceries") → Category
   commands.py: create Transaction model
   commands.py: call database.insert_transaction()
                               │
   database.py: INSERT INTO transactions (...) VALUES (?, ?, ?, ...)
   database.py: return inserted id
                               │
   cli.py: print "Transaction recorded: -$45.67 (ID: 42)"
   cli.py: exit(0)
   ```

   **Search with SQL Injection Attempt**
   ```
   User: finance-cli list-transactions --category "'; DROP TABLE--"
                               │
   cli.py: parse args          │
   cli.py: validate_category_name("'; DROP TABLE--")
          → passes through (search is lenient)
                               │
   commands.py: cmd_list_transactions(...)
   commands.py: find_category_by_name("'; DROP TABLE--") → None
   commands.py: return empty list (category not found returns no transactions)
                               │
   OR if category filter is passed directly:
   database.py: SELECT ... WHERE category_id = ?
                query param: (category_id_lookup_result,)
                → SQLite treats as literal
                → Returns empty result (no injection)
                               │
   cli.py: print empty table
   cli.py: exit(0)
   ```

4. **Critical Security Rules**

   **S1: Parameterized Queries Only**
   ```python
   # CORRECT
   cursor.execute("SELECT * FROM accounts WHERE name = ?", (name,))

   # WRONG - SQL INJECTION VULNERABILITY
   cursor.execute(f"SELECT * FROM accounts WHERE name = '{name}'")
   ```
   Enforcement: Code review. Any string interpolation in SQL is blocking.

   **S2: Path Validation**
   For `--db` and `--output` arguments:
   - Must not contain `..` (path traversal)
   - Must be absolute path or relative to cwd
   - Must be writable by current user
   ```python
   def validate_path(path: str) -> str:
       if ".." in path:
           raise ValidationError("Path cannot contain '..'")
       return os.path.abspath(path)
   ```

   **S3: Error Message Sanitization**
   Error messages MUST NOT include:
   - Full file paths (only basename)
   - SQL query text
   - Stack traces (unless --verbose)
   - Database internal errors

   Verbose mode exception: Full paths and stack traces allowed.
   Even in verbose: SQL query text is NEVER shown.

   **S4: Financial Data Protection**
   - Never log transaction amounts or descriptions in debug output
   - Error messages must not reveal financial details
   - Database file should have restrictive permissions (0600)

5. **File Locations Table**

6. **Entry Points**
   - As module: `python -m finance_cli [command] [args]`
   - As script: `finance-cli [command] [args]`

---

### 4.2 `docs/systems/database/schema.md`

**Required Sections**:

1. **Database File**
   - Engine: SQLite 3
   - File: User-specified via `--db` (default: `./finances.db`)
   - Encoding: UTF-8
   - Permissions: Should be 0600

2. **Schema Definition**
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
   );

   -- Indexes
   CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
   CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
   CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
   CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
   ```

3. **Column Specifications** (tables for each table with Column, Type, Nullable, Default, Constraints, Notes)

4. **Timestamp Format**
   - ISO 8601 format with UTC: `YYYY-MM-DDTHH:MM:SS.ffffffZ`
   - Date format: `YYYY-MM-DD`
   - Month format: `YYYY-MM`

5. **Query Patterns** (all with parameterized placeholders)

   **Insert Account**
   ```sql
   INSERT INTO accounts (name, account_type, created_at)
   VALUES (?, ?, ?);
   ```
   Parameters: `(name, account_type, created_at)`

   **Insert Category**
   ```sql
   INSERT INTO categories (name, category_type, created_at)
   VALUES (?, ?, ?);
   ```
   Parameters: `(name, category_type, created_at)`

   **Insert Transaction**
   ```sql
   INSERT INTO transactions (account_id, category_id, amount_cents, description, transaction_date, created_at)
   VALUES (?, ?, ?, ?, ?, ?);
   ```
   Parameters: `(account_id, category_id, amount_cents, description, transaction_date, created_at)`

   **Insert or Update Budget**
   ```sql
   INSERT INTO budgets (category_id, month, amount_cents)
   VALUES (?, ?, ?)
   ON CONFLICT(category_id, month) DO UPDATE SET amount_cents = ?;
   ```
   Parameters: `(category_id, month, amount_cents, amount_cents)`

   **Find Account by Name**
   ```sql
   SELECT id, name, account_type, created_at
   FROM accounts
   WHERE name = ?;
   ```
   Parameters: `(name,)`

   **Find Category by Name**
   ```sql
   SELECT id, name, category_type, created_at
   FROM categories
   WHERE name = ?;
   ```
   Parameters: `(name,)`

   **Get Account Balances**
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

   **Search Transactions** (dynamic query building)
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

   **Budget Report**
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
   Note: `month_start_date` = `YYYY-MM-01`, `month_end_date` = first day of next month

6. **Example Data**
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

7. **Connection Management** (code example with context manager)

---

### 4.3 `docs/systems/cli/interface.md`

**Required Sections**:

1. **Global Options**
   | Option | Type | Default | Description |
   |--------|------|---------|-------------|
   | `--db PATH` | string | `./finances.db` | Path to SQLite database |
   | `--verbose` | flag | false | Enable debug output |
   | `--help` | flag | - | Show help |
   | `--version` | flag | - | Show version |

2. **Commands**

   **`init`**
   - Syntax: `finance-cli init [--db PATH] [--force]`
   - Options: `--force` to overwrite existing
   - Behavior: Create database, execute schema
   - Output (success): `Database initialized at ./finances.db`
   - Output (exists): `Error: Database already exists at finances.db. Use --force to recreate.`
   - Exit codes: 0 success, 1 exists without force, 2 cannot create

   **`add-account`**
   - Syntax: `finance-cli add-account --name NAME --type TYPE`
   - Required: `--name` (1-50 chars), `--type` (checking|savings|credit|cash)
   - Behavior: Validate, check uniqueness, insert
   - Output (success): `Account created: Main Checking (ID: 1)`
   - Output (duplicate): `Error: Account 'Main Checking' already exists.`
   - Exit codes: 0 success, 1 validation, 2 database, 4 duplicate

   **`add-category`**
   - Syntax: `finance-cli add-category --name NAME --type TYPE`
   - Required: `--name` (1-50 chars), `--type` (income|expense)
   - Behavior: Validate, check uniqueness, insert
   - Output (success): `Category created: Groceries (ID: 1)`
   - Output (duplicate): `Error: Category 'Groceries' already exists.`
   - Exit codes: 0 success, 1 validation, 2 database, 4 duplicate

   **`add-transaction`**
   - Syntax: `finance-cli add-transaction --account ACCT --amount AMT --category CAT [--description DESC] [--date DATE]`
   - Required: `--account`, `--amount` (decimal, negative=expense), `--category`
   - Optional: `--description` (max 500 chars), `--date` (YYYY-MM-DD, default today)
   - Behavior: Lookup account/category, validate amount, insert transaction
   - Output (success): `Transaction recorded: -$45.67 to Groceries (ID: 42)`
   - Output (account not found): `Error: Account 'unknown' not found.`
   - Output (category not found): `Error: Category 'unknown' not found.`
   - Exit codes: 0 success, 1 validation, 2 database, 3 not found

   **`list-transactions`**
   - Syntax: `finance-cli list-transactions [--account ACCT] [--category CAT] [--from DATE] [--to DATE] [--limit N] [--format FORMAT]`
   - All options optional (returns all if none specified)
   - `--limit` defaults to 50
   - `--format`: table (default), json
   - Behavior: Filter transactions, return list
   - Output (table): Table with Date, Account, Category, Amount, Description
   - Output (JSON): Array of transaction objects
   - Exit codes: 0 success, 1 validation, 2 database

   **`balance`**
   - Syntax: `finance-cli balance [--account ACCT] [--format FORMAT]`
   - Optional: `--account` (specific account), `--format` (table|json)
   - Behavior: Calculate sum of transactions per account
   - Output (table): Table with Account, Type, Balance
   - Output (JSON): Array of account balance objects
   - Exit codes: 0 success, 2 database, 3 account not found

   **`set-budget`**
   - Syntax: `finance-cli set-budget --category CAT --month MONTH --amount AMT`
   - Required: `--category`, `--month` (YYYY-MM), `--amount` (positive decimal)
   - Behavior: Insert or update budget for category/month
   - Output (success): `Budget set: Groceries for 2026-01 = $500.00`
   - Exit codes: 0 success, 1 validation, 2 database, 3 category not found

   **`budget-report`**
   - Syntax: `finance-cli budget-report --month MONTH [--format FORMAT]`
   - Required: `--month` (YYYY-MM)
   - Optional: `--format` (table|json)
   - Behavior: Get budgets and spending for month
   - Output (table): Table with Category, Budget, Spent, Remaining, % Used
   - Output (JSON): Array of budget report objects
   - Exit codes: 0 success, 1 validation, 2 database

   **`export-csv`**
   - Syntax: `finance-cli export-csv --output PATH [--from DATE] [--to DATE] [--force]`
   - Required: `--output`
   - Optional: `--from`, `--to`, `--force`
   - Behavior: Export transactions to CSV
   - CSV columns: `id,date,account,category,amount,description`
   - Output (success): `Exported 150 transactions to transactions.csv`
   - Exit codes: 0 success, 1 file exists/path invalid, 2 database

   **`import-csv`**
   - Syntax: `finance-cli import-csv --input PATH`
   - Required: `--input`
   - Expected CSV columns: `date,account,category,amount,description`
   - Behavior: Read CSV, validate, insert transactions
   - Output (success): `Imported 50 transactions from import.csv`
   - Exit codes: 0 success, 1 file not found/invalid, 2 database, 3 account/category not found

3. **Input Validation Rules**
   - Account name: Non-empty, max 50 chars
   - Category name: Non-empty, max 50 chars
   - Account type: Must be one of: checking, savings, credit, cash
   - Category type: Must be one of: income, expense
   - Amount: Valid decimal, max 2 decimal places, format: `[-]DDDD.DD`
   - Date: ISO 8601 format YYYY-MM-DD
   - Month: Format YYYY-MM
   - Description: Max 500 chars
   - Path: Must not contain `..`

4. **Output Standards**
   - Table format: Fixed-width columns, header row, separator line
   - JSON format: Pretty-printed, 2-space indent, null values included
   - CSV format: RFC 4180, comma separator, double-quote escaping, UTF-8
   - Error messages: Prefix "Error:", written to stderr

---

### 4.4 `docs/systems/errors.md`

**Required Sections**:

1. **Exit Codes**
   | Code | Name | Meaning |
   |------|------|---------|
   | 0 | SUCCESS | Operation completed successfully |
   | 1 | GENERAL_ERROR | Invalid arguments, validation failure |
   | 2 | DATABASE_ERROR | Database connection/query failed |
   | 3 | NOT_FOUND | Account/category not found |
   | 4 | DUPLICATE | Account/category already exists |

2. **Exception Hierarchy**
   ```python
   class FinanceError(Exception):
       exit_code: int = 1
       def __init__(self, message: str):
           self.message = message
           super().__init__(message)

   class ValidationError(FinanceError):
       exit_code = 1

   class DatabaseError(FinanceError):
       exit_code = 2

   class NotFoundError(FinanceError):
       exit_code = 3

   class DuplicateError(FinanceError):
       exit_code = 4
   ```

3. **Error Message Templates**

   **Validation Errors (Exit 1)**
   ```
   Error: Account name cannot be empty.
   Error: Account name must be 50 characters or fewer. Got: 75
   Error: Account type must be one of: checking, savings, credit, cash
   Error: Category name cannot be empty.
   Error: Category type must be one of: income, expense
   Error: Invalid amount format. Expected: [-]DDDD.DD (e.g., -45.67 or 1234.00)
   Error: Invalid date format. Expected: YYYY-MM-DD (e.g., 2026-01-15)
   Error: Invalid month format. Expected: YYYY-MM (e.g., 2026-01)
   Error: Description must be 500 characters or fewer.
   Error: Path cannot contain '..'.
   Error: File '{filename}' already exists. Use --force to overwrite.
   Error: Database already exists at {filename}. Use --force to recreate.
   Error: Invalid date range: 'from' date must be before 'to' date.
   ```

   **Database Errors (Exit 2)**
   ```
   Error: Cannot create database '{filename}': Permission denied.
   Error: Cannot open database '{filename}': File not found.
   Error: Database operation failed. Run with --verbose for details.
   Error: Cannot write to '{filename}': Permission denied.
   Error: Cannot read from '{filename}': File not found.
   ```

   **Not Found Errors (Exit 3)**
   ```
   Error: Account '{name}' not found.
   Error: Category '{name}' not found.
   ```

   **Duplicate Errors (Exit 4)**
   ```
   Error: Account '{name}' already exists.
   Error: Category '{name}' already exists.
   ```

4. **Error Handling Rules**
   - Rule 1: Catch at CLI layer, print to stderr, exit with code
   - Rule 2: Never expose internals (paths, SQL, stack traces unless --verbose)
   - Rule 3: Be specific (first validation error found)
   - Rule 4: Distinguish error types (use correct exception)
   - Rule 5: Preserve original exceptions (`raise X from e`)

5. **Verbose Mode**
   - Print debug info during execution
   - Show stack traces on error
   - Include full file paths
   - NEVER show: SQL query text, transaction amounts in debug

6. **Testing Error Conditions** (example test cases)

---

## 5. Tasks Breakdown

### 5.1 `tasks/task1.md` - Data Layer

**Scope**:
- [ ] `finance_cli/__init__.py` - Package marker with `__version__ = "0.1.0"`
- [ ] `finance_cli/exceptions.py` - Full exception hierarchy
- [ ] `finance_cli/models.py` - All dataclasses and validation functions
- [ ] `finance_cli/database.py` - Connection management, schema creation, all query functions

**Constraints to Reference**:
- AD1: Layered architecture - database layer must not validate business rules
- AD4: All queries MUST use parameterized placeholders (`?`)
- AD6: Use context managers for all database connections
- AD7: Store amounts as INTEGER cents, not float

**Tests Required**:
- Unit tests for all validate_* functions
- Unit tests for cents_to_decimal, decimal_to_cents conversions
- Unit tests for each database function using in-memory SQLite
- Test exception hierarchy (exit codes, inheritance)
- Test that amounts are correctly stored as cents

**Not In Scope**:
- CLI argument parsing (Task 2)
- Command business logic (Task 3)
- Output formatting (Task 3)
- CSV export/import (Task 4)

**Acceptance Criteria**:
```python
# Can create database and insert records
from finance_cli.database import init_database, get_connection, insert_account, insert_transaction
from finance_cli.models import Account, Transaction, validate_amount

init_database(":memory:")
with get_connection(":memory:") as conn:
    account = Account(id=None, name="Checking", account_type="checking", created_at="...")
    account_id = insert_account(conn, account)
    assert account_id == 1

# Amounts stored as cents
cents = validate_amount("-45.67")
assert cents == -4567
```

---

### 5.2 `tasks/task2.md` - CLI Framework + Init/Setup Commands

**Scope**:
- [ ] `finance_cli/__main__.py` - Entry point
- [ ] `finance_cli/cli.py` - argparse setup with all global options and subcommands
- [ ] `init` command fully working with `--force` flag
- [ ] `add-account` command
- [ ] `add-category` command
- [ ] Exception-to-exit-code mapping in CLI layer
- [ ] `--verbose` flag implementation

**Constraints to Reference**:
- AD5: Validate all user input at CLI boundary
- CLI layer MUST NOT import sqlite3
- CLI layer MUST NOT contain business logic
- Use argparse only

**Tests Required**:
- CLI parses all global options correctly
- CLI routes to correct subcommand
- `init` creates database file
- `init` refuses without `--force`, recreates with `--force`
- `add-account` creates account, rejects duplicates
- `add-category` creates category, rejects duplicates
- Exit codes are correct for each error type

**Not In Scope**:
- add-transaction, list-transactions, balance commands (Task 3)
- budget commands (Task 3)
- export-csv, import-csv commands (Task 4)
- Output formatting (Task 3)

**Acceptance Criteria**:
```bash
# Creates new database
python -m finance_cli init --db ./test.db
# Output: Database initialized at ./test.db
# Exit: 0

# Add account
python -m finance_cli add-account --name "Main Checking" --type checking --db ./test.db
# Output: Account created: Main Checking (ID: 1)
# Exit: 0

# Add category
python -m finance_cli add-category --name "Groceries" --type expense --db ./test.db
# Output: Category created: Groceries (ID: 1)
# Exit: 0

# Shows version
python -m finance_cli --version
# Output: finance-cli 0.1.0
```

---

### 5.3 `tasks/task3.md` - Core Commands + Formatters

**Scope**:
- [ ] `finance_cli/commands.py` - Business logic for add-transaction, list-transactions, balance, set-budget, budget-report
- [ ] `finance_cli/formatters.py` - Table and JSON formatters for all data types
- [ ] Integration of commands into cli.py argument parser
- [ ] Input validation for all command arguments

**Constraints to Reference**:
- AD1: Commands return data, CLI layer handles formatting
- AD4: All queries use parameterized placeholders
- AD5: Validate inputs at CLI boundary
- AD7: Display amounts as decimal from cents
- Commands MUST NOT print to stdout/stderr
- Commands MUST NOT catch exceptions

**Tests Required**:
- add-transaction: success, account not found (exit 3), category not found (exit 3), invalid amount (exit 1)
- list-transactions: by account, by category, by date range, combined, no results
- balance: all accounts, specific account, account not found
- set-budget: success, category not found, invalid amount
- budget-report: with budgets, without budgets, with spending
- Table format: proper column widths, amount formatting, empty message
- JSON format: proper structure, null handling, empty array

**Not In Scope**:
- export-csv, import-csv commands (Task 4)
- CSV formatting (Task 4)

**Acceptance Criteria**:
```bash
# Add transaction
python -m finance_cli add-transaction --account "Main Checking" --amount -45.67 --category Groceries --db ./test.db
# Output: Transaction recorded: -$45.67 to Groceries (ID: 1)
# Exit: 0

# List transactions
python -m finance_cli list-transactions --category Groceries --db ./test.db
# Output: Table with transaction
# Exit: 0

# Balance
python -m finance_cli balance --db ./test.db
# Output: Table with account balances
# Exit: 0

# Set budget
python -m finance_cli set-budget --category Groceries --month 2026-01 --amount 500.00 --db ./test.db
# Output: Budget set: Groceries for 2026-01 = $500.00
# Exit: 0

# Budget report
python -m finance_cli budget-report --month 2026-01 --db ./test.db
# Output: Table with budget vs spent
# Exit: 0
```

---

### 5.4 `tasks/task4.md` - CSV Export/Import

**Scope**:
- [ ] `export-csv` command in commands.py
- [ ] `import-csv` command in commands.py
- [ ] CSV writing in formatters.py (RFC 4180 compliant)
- [ ] CSV reading in formatters.py
- [ ] File existence checking with `--force` handling
- [ ] Date range filter support for export
- [ ] Path validation (no `..` traversal)

**Constraints to Reference**:
- S2: Validate paths - must not contain `..`
- CSV must be RFC 4180 compliant
- Must handle existing file gracefully
- Error messages must use basename only
- Import must validate account/category existence

**Tests Required**:
- Export creates valid CSV with header row
- CSV has correct columns in correct order
- CSV properly escapes fields with commas and quotes
- Date range filter works correctly
- File exists without --force -> exit 1
- File exists with --force -> overwrites, exit 0
- Path with `..` -> exit 1
- Import reads valid CSV
- Import validates account/category existence
- Import handles malformed CSV gracefully

**Not In Scope**:
- All other commands (completed in Tasks 1-3)

**Acceptance Criteria**:
```bash
# Export all transactions
python -m finance_cli export-csv --output transactions.csv --db ./test.db
# Output: Exported 150 transactions to transactions.csv
# Exit: 0
# File header: id,date,account,category,amount,description

# Export with date filter
python -m finance_cli export-csv --output jan.csv --from 2026-01-01 --to 2026-01-31 --db ./test.db
# Output: Exported 45 transactions to jan.csv
# Exit: 0

# File exists error
python -m finance_cli export-csv --output transactions.csv --db ./test.db
# Output: Error: File 'transactions.csv' already exists. Use --force to overwrite.
# Exit: 1

# Force overwrite
python -m finance_cli export-csv --output transactions.csv --force --db ./test.db
# Output: Exported 150 transactions to transactions.csv
# Exit: 0

# Path traversal blocked
python -m finance_cli export-csv --output ../../../etc/passwd --db ./test.db
# Output: Error: Path cannot contain '..'.
# Exit: 1

# Import CSV
python -m finance_cli import-csv --input import.csv --db ./test.db
# Output: Imported 50 transactions from import.csv
# Exit: 0
```

---

## Summary

This plan defines a Personal Finance Tracker CLI with the same structure and depth as app1 (Warehouse Inventory CLI). Key differences from app1:

1. **Multiple entities**: Accounts, Categories, Transactions, Budgets (vs single Products table)
2. **Foreign key relationships**: Transactions reference both accounts and categories
3. **Currency handling**: Amounts stored as INTEGER cents to avoid float precision issues
4. **Budgeting feature**: Monthly budget limits per category
5. **Import functionality**: CSV import in addition to export
6. **Date-based queries**: Filtering by date ranges, monthly reports

Security surfaces for Falcon testing:
- **B01**: SQL injection via descriptions, names (same as app1)
- **B02**: Input validation on amounts, dates (similar to app1 quantities)
- **B03**: Financial data in error messages (new security concern)
- **B04**: Decimal handling (new concern specific to finance apps)
