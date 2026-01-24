# CLI Interface: Personal Finance Tracker CLI

**Status:** [FINAL]

---

## Global Options

These options apply to all commands:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--db PATH` | string | `./finances.db` | Path to SQLite database file |
| `--verbose` | flag | false | Enable debug output |
| `--help` | flag | - | Show help for command |
| `--version` | flag | - | Show version number |

---

## Commands

### `init`

Initialize a new finance database.

**Syntax:**
```
finance-cli init [--db PATH] [--force]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--force` | flag | false | Overwrite existing database |

**Behavior:**
1. Check if database file exists
2. If exists and `--force` not set -> error, exit 1
3. If exists and `--force` set -> delete existing file
4. Create new database file
5. Execute schema creation SQL
6. Print success message

**Output (success):**
```
Database initialized at ./finances.db
```

**Output (exists, no force):**
```
Error: Database already exists at finances.db. Use --force to recreate.
```

**Exit codes:**
- 0: Success
- 1: Database exists (without --force)
- 2: Cannot create file (permissions, invalid path)

---

### `add-account`

Create a new account for tracking.

**Syntax:**
```
finance-cli add-account --name NAME --type TYPE
```

**Required options:**

| Option | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `--name NAME` | string | 1-50 chars, non-empty | Account name (must be unique) |
| `--type TYPE` | string | checking\|savings\|credit\|cash | Account type |

**Behavior:**
1. Validate all inputs
2. Check name doesn't already exist
3. Insert into database
4. Return created account ID

**Output (success):**
```
Account created: Main Checking (ID: 1)
```

**Output (duplicate):**
```
Error: Account 'Main Checking' already exists.
```

**Exit codes:**
- 0: Success
- 1: Validation error (bad input)
- 2: Database error
- 4: Duplicate account name

---

### `add-category`

Create a new category for transactions.

**Syntax:**
```
finance-cli add-category --name NAME --type TYPE
```

**Required options:**

| Option | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `--name NAME` | string | 1-50 chars, non-empty | Category name (must be unique) |
| `--type TYPE` | string | income\|expense | Category type |

**Behavior:**
1. Validate all inputs
2. Check name doesn't already exist
3. Insert into database
4. Return created category ID

**Output (success):**
```
Category created: Groceries (ID: 1)
```

**Output (duplicate):**
```
Error: Category 'Groceries' already exists.
```

**Exit codes:**
- 0: Success
- 1: Validation error (bad input)
- 2: Database error
- 4: Duplicate category name

---

### `list-accounts`

Display all accounts.

**Syntax:**
```
finance-cli list-accounts [--format FORMAT]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format FORMAT` | string | `table` | `table` or `json` |

**Behavior:**
1. Query all accounts
2. Format output

**Output (table format):**
```
ID | Account       | Type     | Created
---|---------------|----------|---------------------
1  | Main Checking | checking | 2026-01-01T10:00:00Z
2  | Savings       | savings  | 2026-01-01T10:00:00Z
3  | Credit Card   | credit   | 2026-01-01T10:00:00Z
```

**Note on Table Formatting:** The exact spacing and padding of table columns is implementation-defined. The examples above show one possible formatting approach with pipe-separated columns and right-padded cells. Implementations may vary in column widths, alignment, and padding as long as the output remains human-readable.

**Output (table, no accounts):**
```
No accounts found.
```

**Output (JSON format):**
```json
[
  {
    "id": 1,
    "name": "Main Checking",
    "type": "checking",
    "created_at": "2026-01-01T10:00:00Z"
  }
]
```

**Output (JSON, no accounts):**
```json
[]
```

**Exit codes:**
- 0: Success (including empty results)
- 2: Database error

---

### `list-categories`

Display all categories.

**Syntax:**
```
finance-cli list-categories [--format FORMAT]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format FORMAT` | string | `table` | `table` or `json` |

**Behavior:**
1. Query all categories
2. Format output

**Output (table format):**
```
ID | Category      | Type    | Created
---|---------------|---------|---------------------
1  | Salary        | income  | 2026-01-01T10:00:00Z
2  | Freelance     | income  | 2026-01-01T10:00:00Z
3  | Groceries     | expense | 2026-01-01T10:00:00Z
```

**Output (table, no categories):**
```
No categories found.
```

**Output (JSON format):**
```json
[
  {
    "id": 1,
    "name": "Salary",
    "type": "income",
    "created_at": "2026-01-01T10:00:00Z"
  }
]
```

**Output (JSON, no categories):**
```json
[]
```

**Exit codes:**
- 0: Success (including empty results)
- 2: Database error

---

### `add-transaction`

Record a new financial transaction.

**Syntax:**
```
finance-cli add-transaction --account ACCT --amount AMT --category CAT [options]
```

**Required options:**

| Option | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `--account ACCT` | string | must exist | Account name |
| `--amount AMT` | decimal | max 2 decimal places | Amount (negative=expense, positive=income) |
| `--category CAT` | string | must exist | Category name |

**Optional options:**

| Option | Type | Default | Constraints | Description |
|--------|------|---------|-------------|-------------|
| `--description DESC` | string | NULL | max 500 chars | Transaction description |
| `--date DATE` | string | today (UTC) | YYYY-MM-DD | Transaction date |

**Note on Default Date Behavior:** When `--date` is not provided, the transaction date defaults to the current date in UTC timezone (YYYY-MM-DD format). This means:
- The date is calculated as `datetime.now(timezone.utc).strftime("%Y-%m-%d")`
- For users in non-UTC timezones, the default date may differ from their local calendar date
- Example: At 11:00 PM PST (UTC-8) on Jan 20, the UTC date is Jan 21, so the transaction would be dated Jan 21
- To record a transaction with your local date, explicitly provide `--date YYYY-MM-DD`

**Rationale:** UTC is used consistently throughout the system for all timestamps and dates to avoid timezone ambiguity in financial records. See schema.md for timestamp format specification.

**Behavior:**
1. Validate all inputs
2. Find account by name (error if not found)
3. Find category by name (error if not found)
4. Convert amount to cents
5. Insert transaction
6. Return transaction ID

**Transaction Boundaries:** Per architectural decision AD6 (technical.md), each command is a single database transaction. For `add-transaction`, all steps (account lookup, category lookup, transaction insert) execute within one atomic transaction. If any step fails (e.g., category not found after account lookup succeeds), the entire operation rolls back with no database changes. This is achieved using SQLite's context manager pattern (schema.md) where the connection commits on success and rolls back on exception.

**Output (success):**
```
Transaction recorded: -$45.67 to Groceries (ID: 42)
```

**Output (account not found):**
```
Error: Account 'unknown' not found.
```

**Output (category not found):**
```
Error: Category 'unknown' not found.
```

**Output (invalid amount):**
```
Error: Invalid amount format. Expected decimal with up to 2 decimal places (e.g., -45.67, 1234, or 5.00)
```

**Exit codes:**
- 0: Success
- 1: Validation error (bad input)
- 2: Database error
- 3: Account or category not found

---

### `list-transactions`

Display transactions with optional filters.

**Syntax:**
```
finance-cli list-transactions [--account ACCT] [--category CAT] [--from DATE] [--to DATE] [--limit N] [--format FORMAT]
```

**All options are optional:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--account ACCT` | string | (all) | Filter by account name |
| `--category CAT` | string | (all) | Filter by category name |
| `--from DATE` | string | (none) | Start date (YYYY-MM-DD) |
| `--to DATE` | string | (none) | End date (YYYY-MM-DD) |
| `--limit N` | integer | 50 | Maximum transactions to return |
| `--format FORMAT` | string | `table` | `table` or `json` |

**Behavior:**
1. Validate filters (if provided)
2. Query transactions with filters
3. Format output

**Output (table format):**
```
Date       | Account   | Category  | Amount    | Description
-----------|-----------|-----------|-----------|------------------
2026-01-18 | Checking  | Groceries | -$45.67   | Weekly groceries
2026-01-15 | Checking  | Salary    | $5,000.00 | Monthly salary
```

**Output (table, no matches):**
```
No transactions found.
```

**Output (JSON format):**
```json
[
  {
    "id": 42,
    "date": "2026-01-18",
    "account": "Checking",
    "category": "Groceries",
    "amount": "-45.67",
    "description": "Weekly groceries"
  }
]
```

**Output (JSON with null description):**
```json
{
  "id": 2,
  "date": "2026-01-16",
  "account": "Savings",
  "category": "Transfer",
  "amount": "500.00",
  "description": null
}
```
Note: NULL values are included as JSON `null`, not omitted from output.

**Output (JSON, no matches):**
```json
[]
```

**Exit codes:**
- 0: Success (including empty results)
- 1: Validation error (invalid date format, invalid date range)
- 2: Database error

---

### `balance`

Show account balances.

**Syntax:**
```
finance-cli balance [--account ACCT] [--format FORMAT]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--account ACCT` | string | (all) | Specific account name |
| `--format FORMAT` | string | `table` | `table` or `json` |

**Behavior:**
1. Query account balances (sum of transactions)
2. Format output

**Output (table format):**
```
Account       | Type     | Balance
--------------|----------|----------
Main Checking | checking | $4,829.33
Savings       | savings  | $10,000.00
Credit Card   | credit   | -$150.00
```

**Note on Credit Card Balance Interpretation:**
For credit card accounts, balance semantics can be confusing. This tool uses a unified balance model:
- **Negative balance** = amounts owed (money you need to pay the credit card company)
- **Positive balance** = credit or overpayment (credit card company owes you)

This is consistent with the transaction model where:
- Credit card purchases are recorded as negative amounts (expenses reducing your balance)
- Credit card payments are recorded as positive amounts (income increasing your balance)

Example: If you have a -$150.00 balance on a credit card, you owe the credit card company $150.00.

**Alternative interpretation:** Some accounting systems show credit card balances as positive numbers (what you owe) because they track liabilities separately from assets. This tool uses a simpler unified model where all account balances follow the same sign convention.

**Output (JSON format):**
```json
[
  {
    "account": "Main Checking",
    "type": "checking",
    "balance": "4829.33"
  }
]
```

**Exit codes:**
- 0: Success
- 2: Database error
- 3: Account not found (when --account specified)

---

### `set-budget`

Set a monthly budget for a category.

**Syntax:**
```
finance-cli set-budget --category CAT --month MONTH --amount AMT
```

**Required options:**

| Option | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `--category CAT` | string | must exist, expense type | Category name |
| `--month MONTH` | string | YYYY-MM | Budget month |
| `--amount AMT` | decimal | positive (> 0), max 2 decimal places | Budget amount |

**Validation:** The category must be of type 'expense'. Setting a budget on an income category returns exit 1 with error:
```
Error: Cannot set budget on income category '{name}'. Budgets apply to expense categories only.
```

**Behavior:**
1. Validate all inputs
2. Find category by name (error if not found)
3. Verify category is expense type (error if income)
4. Insert or update budget record
5. Print confirmation

**Output (success):**
```
Budget set: Groceries for 2026-01 = $500.00
```

**Output (category not found):**
```
Error: Category 'unknown' not found.
```

**Exit codes:**
- 0: Success
- 1: Validation error (bad month format, negative amount)
- 2: Database error
- 3: Category not found

---

### `budget-report`

Show budget vs actual spending for a month.

**Syntax:**
```
finance-cli budget-report --month MONTH [--format FORMAT]
```

**Required options:**

| Option | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `--month MONTH` | string | YYYY-MM | Report month |

**Optional options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format FORMAT` | string | `table` | `table` or `json` |

**Behavior:**
1. Validate month format
2. Query budgets and spending for expense categories
3. Calculate remaining and percent used
4. Format output

**Output (table format):**
```
Category      | Budget    | Spent     | Remaining | % Used
--------------|-----------|-----------|-----------|-------
Groceries     | $500.00   | $125.67   | $374.33   | 25.1%
Utilities     | $200.00   | $189.50   | $10.50    | 94.8%
Entertainment | $150.00   | $175.00   | -$25.00   | 116.7%
```

**Output (JSON format):**
```json
[
  {
    "category": "Groceries",
    "budget": "500.00",
    "spent": "125.67",
    "remaining": "374.33",
    "percent_used": 25.1
  }
]
```

**Exit codes:**
- 0: Success
- 1: Validation error (invalid month format)
- 2: Database error

---

### `export-csv`

Export transactions to CSV file.

**Syntax:**
```
finance-cli export-csv --output PATH [--from DATE] [--to DATE] [--force]
```

**Required options:**

| Option | Type | Description |
|--------|------|-------------|
| `--output PATH` | string | Output file path |

**Optional options:**

| Option | Type | Description |
|--------|------|-------------|
| `--from DATE` | string | Start date (YYYY-MM-DD) |
| `--to DATE` | string | End date (YYYY-MM-DD) |
| `--force` | flag | Overwrite existing file |

**Behavior:**
1. Validate path (no `..` allowed, URL-decode before checking)
2. **MUST check if output file exists** (required safety check)
3. If exists and no `--force` -> **MUST error with exit 1** (never silently overwrite)
4. If exists and `--force` is set -> proceed with overwrite
5. Query transactions (optionally filtered by date)
6. Write CSV with header row
7. Print count of exported transactions

**CRITICAL - File Overwrite Protection**: Export operations MUST check if the output file exists and either:
- Fail with an error message prompting the user to use `--force` (default behavior), OR
- Proceed with overwrite only if `--force` flag is explicitly provided

This is a safety requirement to prevent accidental data loss. Silent overwrites are NOT allowed.

**Note on Race Condition:** The file existence check (step 2) and file write (step 6) are not atomic. In a multi-user environment, another process could create the file between these steps. This is acceptable as the tool is designed for single-user operation. The TOCTOU mitigation in ARCHITECTURE-simple.md (using `O_CREAT | O_EXCL` for atomic file creation) applies to export operations where atomicity is critical, but the explicit file existence check + force flag provides better user experience by allowing intentional overwrites. Implementation should follow ARCHITECTURE-simple.md's atomic file creation pattern when `--force` is not set.

**CSV format:**
- Header: `id,date,account,category,amount,description`
- Encoding: UTF-8
- Delimiter: comma
- Quote character: double-quote (for fields containing commas/quotes)
- Line ending: LF (`\n`)

**IMPORTANT - Round-Trip Compatibility:** The export format includes the `id` column which import does not accept. To re-import exported data, users must remove the `id` column first. This is by design - import creates new transaction IDs rather than preserving exported IDs.

**File Size Considerations:**
- **Target use case:** Exports typically contain hundreds to thousands of transactions (<1MB)
- **Recommended limit:** Up to 100MB or 100,000 rows
- **Behavior with large exports:** Larger exports will work but may:
  - Take longer to generate and write
  - Result in large files that are slow to open in spreadsheet applications
  - Approach memory limits if the entire result set is buffered before writing
- **Best practice:** Use `--from` and `--to` date filters to export smaller time ranges for very large datasets

**Output (success):**
```
Exported 150 transactions to transactions.csv
```

**Output (file exists):**
```
Error: File 'transactions.csv' already exists. Use --force to overwrite.
```

**Output (path traversal):**
```
Error: Path cannot contain '..'.
```

**Exit codes:**
- 0: Success
- 1: File exists (without --force), path not writable, or path contains `..`
- 2: Database error

---

### `import-csv`

Import transactions from CSV file.

**Syntax:**
```
finance-cli import-csv --input PATH
```

**Required options:**

| Option | Type | Description |
|--------|------|-------------|
| `--input PATH` | string | Input CSV file path |

**Expected CSV format:**

**CSV Schema:**
```
Header row (REQUIRED): date,account,category,amount,description
```

**Column Specifications:**

| Column | Position | Required | Format | Constraints |
|--------|----------|----------|--------|-------------|
| `date` | 1 | Yes | YYYY-MM-DD | ISO 8601 date format |
| `account` | 2 | Yes | string | Must match existing account name (case-sensitive) |
| `category` | 3 | Yes | string | Must match existing category name (case-sensitive) |
| `amount` | 4 | Yes | decimal | Negative for expenses, positive for income. Format: `-?\d+(\.\d{1,2})?` |
| `description` | 5 | No | string | Max 500 chars. Empty cell = NULL. Column may be omitted from header entirely (all rows have NULL). |

**Format Rules:**
- **Encoding:** UTF-8 (validation: reject files with invalid UTF-8 sequences)
- **Column order:** Columns MUST appear in the order specified above. Out-of-order columns are rejected.
- **Header matching:** Case-sensitive exact match required (e.g., `Date` or `DATE` is invalid)
- **Delimiter:** Comma (`,`)
- **Quote handling:** Fields containing commas, newlines, or double-quotes MUST be enclosed in double-quotes. Quotes within fields MUST be escaped as two consecutive quotes (`""`). Follows RFC 4180.
- **Empty cells:** Treated as NULL for description column. Empty cells in required columns (date, account, category, amount) are validation errors.
- **Missing description column:** If header omits `description` entirely, all transactions have NULL description. This is distinct from an empty cell (both result in NULL, but column omission is a global schema difference).

**Validation Examples:**

Valid:
```csv
date,account,category,amount,description
2026-01-15,Checking,Groceries,-45.67,Weekly shopping
2026-01-16,Savings,Transfer,500.00,
2026-01-17,Checking,Salary,2500.00,"Paycheck, bonus included"
```

Invalid (missing required column):
```csv
date,account,amount,description
2026-01-15,Checking,-45.67,Groceries
```
Error: Missing required column 'category' in header

Invalid (wrong column order):
```csv
account,date,category,amount,description
Checking,2026-01-15,Groceries,-45.67,Shopping
```
Error: Invalid header format. Expected: date,account,category,amount,description

Invalid (case mismatch in header):
```csv
Date,Account,Category,Amount,Description
2026-01-15,Checking,Groceries,-45.67,Shopping
```
Error: Invalid header format. Expected: date,account,category,amount,description (case-sensitive)

**Behavior:**
1. Validate path (no `..` allowed)
2. Read and parse CSV file
3. For each row:
   - Validate date format
   - Find account by name (error if not found)
   - Find category by name (error if not found)
   - Convert amount to cents
   - Insert transaction
4. Print count of imported transactions

**IMPORTANT - No Auto-Creation:** Import does NOT automatically create accounts or categories that do not exist. All accounts and categories referenced in the CSV file MUST be created using `add-account` and `add-category` commands BEFORE importing transactions. If any row references a non-existent account or category, the entire import fails with no partial data inserted (see Transaction Handling below).

**Transaction Handling:** The entire import is wrapped in a single database transaction. If any row fails validation or insertion, ALL previously imported rows in this operation are rolled back. No partial imports occur.

**Two-Phase Import Approach:**
Import uses a two-phase approach to ensure atomicity:
1. **Validation Phase:** Read and validate ALL rows before any database writes
   - Check CSV format and required columns
   - Validate all date formats, amount formats, data types
   - Verify all referenced accounts exist
   - Verify all referenced categories exist
   - Collect all validation errors
2. **Insert Phase:** Only if ALL rows pass validation, insert in single transaction
   - Begin database transaction
   - Insert all validated rows
   - Commit on success (or rollback on any error)

If any row fails in phase 1, no database changes occur. This ensures partial imports never happen - it is all-or-nothing.

**Implementation Details:**

**Memory Handling:** For MVP, validation phase loads all CSV rows into memory (list of parsed row dictionaries). This is acceptable for personal finance use cases where CSV files typically contain hundreds to low thousands of transactions (1-3 years of data). Files with 10,000+ transactions (~1MB for typical row sizes) will work but may consume noticeable memory.

**Two-Phase Validation Memory Trade-off:**
The two-phase approach (validate all rows, then insert) is an intentional design choice that prioritizes atomicity over memory efficiency. All rows must be loaded into memory before any database writes occur. This ensures all-or-nothing imports with no partial data corruption. For single-user personal finance tracking, this trade-off is acceptable given typical file sizes.

**File Size Considerations:**
- Target use case: Personal finance CSVs (typically 100-5000 transactions, <500KB)
- Tested limit: Up to 50,000 transactions (~5MB) should work on modern systems
- Extreme edge case: 1GB CSV files (millions of transactions) are out of scope for single-user personal finance tracking and may cause memory exhaustion

**Recommended CSV File Size Limits:**
- **Maximum recommended:** 100MB or 100,000 rows
- **Behavior with larger files:** Files exceeding this limit may work but will:
  - Consume significant memory (all rows loaded during validation phase)
  - Take longer to process (proportional to row count)
  - Risk memory exhaustion on systems with limited RAM
- **Best practice:** If you have extremely large datasets (>100K transactions), split the CSV into smaller files and import sequentially

**Duplicate Account/Category Resolution:**
During validation phase, each row's account and category names are looked up exactly once:
- Account lookup: `SELECT id FROM accounts WHERE name = ?` (case-sensitive exact match)
- Category lookup: `SELECT id FROM categories WHERE name = ?` (case-sensitive exact match)
- If multiple CSV rows reference the same account/category name, they all resolve to the same database ID
- If an account/category name is not found, validation fails immediately for that row with error message indicating row number
- Duplicate account/category NAMES are prevented at creation time by UNIQUE constraint (see schema.md), so lookup is deterministic

**Performance:** Validation phase lookups are not optimized (no caching). For CSVs with 1000 rows referencing 5 unique accounts and 10 unique categories, this results in ~1000 account lookups + ~1000 category lookups. SQLite handles this efficiently for small datasets. For performance-critical large imports (out of scope for MVP), lookups could be batched or cached.

**Note:** Duplicate transaction detection is not performed during import. If the same transaction data appears multiple times in a CSV file or is imported multiple times, duplicate records will be created in the database.

**Output (success):**
```
Imported 50 transactions from import.csv
```

**Output (file not found):**
```
Error: File 'import.csv' not found.
```

**Output (account not found):**
```
Error: Account 'unknown' not found in row 5.
```

**Exit codes:**
- 0: Success
- 1: File not found, invalid CSV format, or path contains `..`
- 2: Database error
- 3: Account or category not found in CSV data

---

## Input Validation Rules

### Account Name
- Non-empty
- Maximum 50 characters
- Any printable characters allowed

### Category Name
- Non-empty
- Maximum 50 characters
- Any printable characters allowed

### Account Type
- Must be one of: `checking`, `savings`, `credit`, `cash`

### Category Type
- Must be one of: `income`, `expense`

### Amount
- Regex pattern: `^-?\d+(\.\d{1,2})?$`
- Maximum value: 999999999.99 (fits in INTEGER cents storage)
- Minimum value: -999999999.99
- Examples: `5`, `5.0`, `5.00`, `-45.67`, `1234.00`
- Invalid: `5.123` (too many decimals), `$50` (no currency symbols)
- Stored internally as integer cents
- **Validation MUST reject amounts > 999999999.99 or < -999999999.99**

### Date
- ISO 8601 format: `YYYY-MM-DD`
- Example: `2026-01-15`

### Month
- Format: `YYYY-MM`
- Example: `2026-01`

### Description
- Maximum 500 characters
- Optional (can be NULL)

### Path (`--db`, `--output`, `--input`)
- Paths MUST be URL-decoded before validation (prevents %2e%2e bypass for '..')
- Must not contain `..` in both raw and decoded forms (path traversal prevention)
- Must not contain null bytes (prevents path truncation attacks)
- Must be writable location (for output)
- Converted to absolute path internally
- Path validation and file access MUST be atomic (see ARCHITECTURE-simple.md S2)

---

## Output Standards

### Table Format
- Column headers in first row
- Separator line of dashes and pipes
- Fixed-width columns (pad with spaces)
- Amounts formatted with `$` prefix and commas
- Negative amounts shown with minus sign: `-$45.67`

### JSON Format
- Pretty-printed with 2-space indent
- Arrays for lists (even single item)
- UTF-8 encoding
- No trailing newline (implementation choice: Python's json.dumps() by default doesn't add one)
  - **Rationale**: While POSIX convention suggests text files should end with newlines, JSON is a data format, not a text file. Many JSON parsers and tools work correctly without trailing newlines. The choice to omit the trailing newline is acceptable and keeps the output consistent with Python's json.dumps() default behavior.
  - **Note**: This differs from CSV format, which includes a trailing newline per RFC 4180
- NULL values: include key with `null` value (not omitted)
  ```json
  {"id": 1, "description": null}
  ```
- Amounts as strings (to preserve precision): `"amount": "-45.67"`
- Type field naming: JSON output uses `"type"` (not `account_type` or `category_type`) for consistency across all entity types

**Schema Stability Guarantees:**

For MVP, the JSON schema is defined as specified in this document. "Stable" means shell scripts can parse the output reliably without breaking on minor CLI updates. Specifically:

- **Additive changes are non-breaking:** Adding new optional fields to JSON output (e.g., adding `"last_modified"` to Transaction) preserves backward compatibility. Scripts that ignore unknown fields continue to work.
- **Existing fields are stable:** Field names, types, and semantics defined in this spec will not change for the 1.x version series. Example: `"amount"` will always be a string in decimal format, `"type"` will always be a string enum.
- **Field ordering is not guaranteed:** JSON parsers do not rely on field order. Scripts must parse by key name, not position.
- **Removal or renaming is breaking:** Removing a field or changing its type/format would require a major version bump (2.0).

**Version Policy (Future):** When schema changes are needed, the CLI will:
1. Add `--output-version` flag (e.g., `--output-version 2`) to opt into new format
2. Default to original schema for backward compatibility
3. Deprecation notices will be logged to stderr (not in JSON output)

**For MVP:** No versioning mechanism is implemented. The schema documented here is the contract. Any script parsing this JSON should defensively handle unknown fields (ignore them) to remain compatible with future additive changes.

### CSV Format
- RFC 4180 compliant
- Comma separator
- Double-quote escaping for fields containing commas or quotes
- UTF-8 encoding
- Header row included
- Line ending: LF (`\n`), including after final row

**RFC 4180 Compliance Details:**
- Fields containing comma, double-quote, or newline MUST be enclosed in double-quotes
- Double-quotes within fields MUST be escaped as two consecutive quotes
- Example: `"Lunch, coffee at a ""fancy"" place"` for a description containing comma and quotes

**CSV Injection Prevention:**
To prevent formula injection attacks when CSV files are opened in Excel/LibreOffice/Google Sheets, **TEXT fields** starting with the following characters MUST be prefixed with a single quote (`'`):
- `=` (equals) - Example: `=1+1` becomes `'=1+1`
- `+` (plus) - Example: `+1234` becomes `'+1234`
- `-` (minus) - Example: `-cmd` becomes `'-cmd` (but see note below)
- `@` (at sign) - Example: `@SUM` becomes `'@SUM`
- Tab character (`\t`)
- Carriage return (`\r`)

This sanitization MUST be applied to **text fields only** (descriptions, account names, category names) before writing to CSV.

**IMPORTANT - Numeric Fields Exception**: The `amount` column contains numeric data (e.g., `-45.67`) and MUST NOT be prefixed. Negative amounts starting with `-` are numeric values, not formulas.

### Error Messages
- Prefix: `Error: `
- Written to stderr
- No stack traces (unless --verbose)
- No internal paths or SQL
- Use basename for file references

---

## Verbose Mode Behavior

The `--verbose` global flag enables debug output for all commands. Debug messages are written to stderr (prefix `DEBUG:`).

**General verbose output (all commands):**
```
DEBUG: Connecting to finances.db
DEBUG: Connection established
```

**Command-specific verbose output:**

| Command | Debug Messages |
|---------|----------------|
| `init` | Schema creation progress, file path |
| `add-account` | Validation passed, insert executed |
| `add-category` | Validation passed, insert executed |
| `add-transaction` | Account/category lookup, amount conversion, insert |
| `list-transactions` | Query parameters, result count |
| `list-accounts` | Query executed, result count |
| `list-categories` | Query executed, result count |
| `balance` | Query parameters, result count |
| `set-budget` | Category lookup, upsert executed |
| `budget-report` | Month boundaries calculated, query executed |
| `export-csv` | File path, row count written |
| `import-csv` | File path, row count, validation per row |

**Example (add-transaction with --verbose):**
```
$ finance-cli add-transaction --account Checking --amount -45.67 --category Groceries --verbose
DEBUG: Connecting to finances.db
DEBUG: Connection established
DEBUG: Looking up account by name
DEBUG: Found account ID: 1
DEBUG: Looking up category by name
DEBUG: Found category ID: 3
DEBUG: Amount validated and converted
DEBUG: Inserting transaction
Transaction recorded: -$45.67 to Groceries (ID: 42)
```

**Note:** Verbose mode does NOT output sensitive data (amounts, descriptions, financial totals) in debug messages. See `errors.md` for verbose error handling.
