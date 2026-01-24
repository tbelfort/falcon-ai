# Design Completeness Scout Report

## Assessment: ISSUES_FOUND

The design documentation is comprehensive but has several significant gaps and inconsistencies that would likely cause implementation blockers or require implementers to make design decisions.

## Issues

### Issue 1: Missing safe_open_file() Implementation Details

**Affected Files:** ["falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md"]

**Relevant Text From Docs:**
```
**Coordination Pattern:** Callers MUST follow this sequence:
1. Call `validate_path()` to get a validated path (string)
2. IMMEDIATELY pass the validated path to `safe_open_file()` to get a file descriptor
3. Use the file descriptor for all operations (do NOT use the path string after opening)

**Security Rationale:** The validate_path() function returns a string path, not a file descriptor. Between validation and opening, an attacker could potentially swap a symlink. The safe_open_file() function closes this window by using os.open() with appropriate flags and immediately returning a file descriptor. Callers MUST use the fd for all subsequent operations.
```

And from components.md:
```
- `init_database(path: str) -> None` -- Creates database file and runs schema creation. Idempotent. MUST use atomic file creation to prevent TOCTOU attacks. MUST set file permissions to 0600 (owner read/write only) immediately after creation using os.chmod(). This enforces restrictive permissions automatically without user intervention. **CRITICAL**: MUST use get_connection() internally to obtain a database connection (which automatically enables PRAGMA foreign_keys = ON as required by schema.md). All schema DDL operations must be executed through this connection to ensure foreign key constraints are enforced during table creation.
```

**What's Missing/Wrong:**

The ARCHITECTURE-simple.md document introduces `safe_open_file()` as a critical security function for atomic file access, but this function is NOT mentioned anywhere in the components.md specification for the database.py module. The components.md says `init_database()` must use "atomic file creation" and set permissions with `os.chmod()`, but ARCHITECTURE-simple.md says to use `safe_open_file()` which sets permissions via the os.open() mode parameter.

There's a fundamental inconsistency:
- Where should `safe_open_file()` be implemented? (It's not listed in any module specification)
- Should database.py use `safe_open_file()` or directly use `os.open()` with flags?
- The components.md says to set permissions with `os.chmod()` AFTER creation, but ARCHITECTURE-simple.md's `safe_open_file()` sets permissions atomically during creation with the mode parameter - which approach is correct?

An implementer would need to make architectural decisions about where this function lives and which approach to use.

**Assessment:**

This is likely to block implementation. The security requirements are critical, and there are two contradictory specifications for how to implement them.

---

### Issue 2: Missing CSV Import Auto-Creation Specification

**Affected Files:** ["falcon_test/apps/app2/docs/design/components.md", "falcon_test/apps/app2/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From components.md:
```
- `cmd_import_csv(db_path: str, input_path: str) -> int`
  # Two-phase import process:
  # Phase 1 - Validation: Load and parse all CSV rows into memory, validate all fields,
  #   resolve all account/category references. This phase creates in-memory Account and
  #   Category objects for any missing entities. For MVP, in-memory validation is acceptable
  #   for typical personal finance CSV files (<10k rows). If validation fails for any row,
  #   abort before database insert phase.
  # Phase 2 - Insert: Wrap all inserts in a single database transaction. Insert missing
  #   accounts/categories first, then insert all transactions. If any insert fails, the
  #   entire transaction is rolled back (per AD6 in technical.md).
```

From interface.md:
```
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
```

And also from interface.md:
```
**Duplicate Account/Category Resolution:**
During validation phase, each row's account and category names are looked up exactly once:
- Account lookup: `SELECT id FROM accounts WHERE name = ?` (case-sensitive exact match)
- Category lookup: `SELECT id FROM categories WHERE name = ?` (case-sensitive exact match)
- If multiple CSV rows reference the same account/category name, they all resolve to the same database ID
- If an account/category name is not found, validation fails immediately for that row with error message indicating row number
```

**What's Missing/Wrong:**

There are two completely contradictory specifications for CSV import behavior:

1. Components.md says: "This phase creates in-memory Account and Category objects for any missing entities" and "Insert missing accounts/categories first, then insert all transactions"

2. Interface.md says: "Find account by name (error if not found)" and "If an account/category name is not found, validation fails immediately"

These are fundamentally different behaviors:
- Should import auto-create missing accounts/categories? (components.md says YES)
- Or should it error if they don't exist? (interface.md says YES)

If auto-creation is the design, then critical details are missing:
- What account_type should be used for auto-created accounts? (no default specified)
- What category_type should be used for auto-created categories? (no default specified)
- Should there be a command-line flag to control this behavior?

An implementer cannot proceed without knowing which specification is correct.

**Assessment:**

This is a critical blocking issue. The two specifications describe entirely different user experiences and implementation approaches.

---

### Issue 3: Unclear Budget Report Behavior for Categories Without Budgets

**Affected Files:** ["falcon_test/apps/app2/docs/systems/database/schema.md"]

**Relevant Text From Docs:**
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
```

And from use-cases.md:
```
## UC7: Monthly Budget Review

**Actor**: User checking spending against budgets

**Flow**:
1. `finance-cli budget-report --month 2026-01`

**Success**: Report showing category spending vs budget, over/under

**Failure modes**:
- Invalid month format -> exit 1
- No budgets set -> show spending without budget comparison
```

**What's Missing/Wrong:**

The query uses LEFT JOIN and COALESCE to include ALL expense categories in the report, even those without budgets (budget_cents = 0). However, the design doesn't specify:

1. Should categories with NO spending and NO budget appear in the report?
   - If Groceries has budget=$500 and spent=$0, it should appear (clear)
   - If Entertainment has NO budget and spent=$0, should it appear? (unclear)

2. The use case says "No budgets set -> show spending without budget comparison" but doesn't clarify if this means:
   - Show ALL categories that have spending (even without budgets)? OR
   - Show an empty report with a message? OR
   - Show only categories that have budgets set?

3. For categories without budgets, what should percent_used display?
   - The calculation says "If budget_cents == 0, set percent_used = 0.0"
   - But showing "0% used" for a category with no budget is confusing to users
   - Should these rows be filtered out? Or shown with a special indicator like "N/A"?

An implementer would need to decide whether the report should include:
- All expense categories (regardless of budget/spending)
- Only categories with budgets set
- Only categories with spending (regardless of budget)
- Only categories with EITHER budget OR spending

**Assessment:**

This is likely to cause implementation confusion. The behavior for edge cases is not clearly specified, and different interpretations would lead to significantly different user experiences.

---

### Issue 4: Missing Specification for List Commands Ordering

**Affected Files:** ["falcon_test/apps/app2/docs/systems/cli/interface.md", "falcon_test/apps/app2/docs/systems/database/schema.md"]

**Relevant Text From Docs:**

From interface.md list-accounts:
```
**Output (table format):**
```
ID | Account       | Type     | Created
---|---------------|----------|---------------------
1  | Main Checking | checking | 2026-01-01T10:00:00Z
2  | Savings       | savings  | 2026-01-01T10:00:00Z
3  | Credit Card   | credit   | 2026-01-01T10:00:00Z
```
```

From schema.md Get All Accounts:
```
### Get All Accounts

```sql
SELECT id, name, account_type, created_at
FROM accounts
ORDER BY name;
```

Parameters: none
```

**What's Missing/Wrong:**

There's an inconsistency in the ordering specification:
- The schema.md says accounts should be ordered by NAME
- The interface.md example shows accounts in ID order (1, 2, 3)

If ordered by name, the output should be:
```
1  | Credit Card   | credit   | ...
1  | Main Checking | checking | ...
2  | Savings       | savings  | ...
```

But the example shows ID order. Which is correct?

The same issue exists for list-categories (schema says ORDER BY name, but no example to verify).

This inconsistency would cause test failures when the implementer writes the code according to schema.md but tests against interface.md examples.

**Assessment:**

This is a minor issue that won't block implementation, but will cause confusion and potentially rework when tests fail.

---

### Issue 5: Ambiguous File Permission Enforcement for Database Files

**Affected Files:** ["falcon_test/apps/app2/docs/design/technical.md", "falcon_test/apps/app2/docs/systems/database/schema.md"]

**Relevant Text From Docs:**

From technical.md:
```
5. **Financial Data Protection**: Database files MUST have restrictive permissions (0600) to prevent unauthorized access
   - **Enforcement**: The `safe_open_file()` function (defined in ARCHITECTURE-simple.md S2) automatically sets mode `0o600` when creating new files with write mode, ensuring proper permissions are applied atomically during file creation
   - **Application responsibility**: The `init` command and any database operations MUST use `safe_open_file()` for file creation to guarantee correct permissions
   - **Runtime checks**: The application does NOT check permissions of existing database files on open - permission setting occurs only during file creation
   - **User responsibility**: Users opening pre-existing database files are responsible for verifying proper permissions are already set (e.g., via `chmod 600 finance.db` before first use)
```

From schema.md:
```
### File Permissions Enforcement

**When enforced:** Automatically on database creation (init command) and when opening database files for write operations.

**How enforced:** The application uses `safe_open_file()` (defined in technical.md S2) which sets mode 0o600 for all write operations. This ensures:
- New database files created by `init` command have 0600 permissions
- Any write operation to the database file maintains 0600 permissions
- Only the file owner can read or write the database

**User responsibility:** If users manually create database files or modify permissions outside the application, they are responsible for ensuring proper permissions. The application will not check or correct existing file permissions on open—it only enforces permissions when creating or writing files.
```

**What's Missing/Wrong:**

The two documents contradict each other on when permissions are enforced:

1. Technical.md says: "The application does NOT check permissions of existing database files on open - permission setting occurs only during file creation"

2. Schema.md says: "Automatically on database creation (init command) and when opening database files for write operations" and "Any write operation to the database file maintains 0600 permissions"

This raises questions:
- Does every write operation re-set permissions? (This seems excessive and could fail if the user changes permissions)
- Or are permissions only set on file CREATION? (This is what technical.md says)
- If a user changes permissions to 0644 and then runs add-transaction, does the app:
  a) Error out because permissions are wrong?
  b) Silently fix the permissions back to 0600?
  c) Continue without checking/changing permissions?

From components.md:
```
- `get_connection(path: str) -> ContextManager[sqlite3.Connection]` -- Context manager that yields connection, commits on success, rollbacks on exception, always closes. Path validation and database open MUST be atomic. On first open of existing database file, SHOULD verify permissions are 0600 and emit warning to stderr if more permissive (but do not fail, as user may have valid reasons for different permissions).
```

Wait, now components.md says it SHOULD check permissions and emit a warning! This is a third different specification.

**Assessment:**

This is likely to cause implementation issues. The three documents give three different answers to "what happens when we open an existing database file with wrong permissions?"

---

### Issue 6: Missing Default Limit Value Specification

**Affected Files:** ["falcon_test/apps/app2/docs/systems/cli/interface.md", "falcon_test/apps/app2/docs/systems/database/schema.md"]

**Relevant Text From Docs:**

From interface.md:
```
### `list-transactions`

**All options are optional:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| --account ACCT | string | (all) | Filter by account name |
| --category CAT | string | (all) | Filter by category name |
| --from DATE | string | (none) | Start date (YYYY-MM-DD) |
| --to DATE | string | (none) | End date (YYYY-MM-DD) |
| --limit N | integer | 50 | Maximum transactions to return |
| --format FORMAT | string | `table` | `table` or `json` |
```

From schema.md:
```
**Note:** The `limit` parameter is required. The CLI layer must always provide a value (default 50).
The database layer does not handle NULL/None limits - the SQL requires an integer.
```

**What's Missing/Wrong:**

Both documents agree the default limit is 50, which is good. However, the interface.md doesn't specify what happens when the user explicitly passes `--limit 0`. According to the validation rules in models.py from components.md:

```
def validate_limit(limit: int) -> int:
    """Validate limit parameter for list queries.

    ...

    Validation rules:
    - MUST be greater than 0
    - limit=0 raises ValidationError("Limit must be greater than 0")
    - Negative values raise ValidationError("Limit must be greater than 0")
    """
```

So `--limit 0` is an error. But this isn't documented in the interface.md command specification. The interface should clarify:
- What's the valid range for limit? (1 to what maximum?)
- Should there be a maximum limit to prevent performance issues? (e.g., max 10000?)

The use case document mentions "100,000 transactions" as the performance target, but doesn't say if users can query all 100k at once with `--limit 100000` or if there's a cap.

**Assessment:**

Minor issue. An implementer would probably figure this out, but it's an ambiguity that should be documented in the CLI interface specification.

---

### Issue 7: Unclear Behavior for Empty Description in CSV Import

**Affected Files:** ["falcon_test/apps/app2/docs/systems/cli/interface.md", "falcon_test/apps/app2/docs/design/components.md"]

**Relevant Text From Docs:**

From interface.md:
```
**Column Specifications:**

| Column | Position | Required | Format | Constraints |
|--------|----------|----------|--------|-------------|
| `date` | 1 | Yes | YYYY-MM-DD | ISO 8601 date format |
| `account` | 2 | Yes | string | Must match existing account name (case-sensitive) |
| `category` | 3 | Yes | string | Must match existing category name (case-sensitive) |
| `amount` | 4 | Yes | decimal | Negative for expenses, positive for income. Format: `-?\d+(\.\d{1,2})?` |
| `description` | 5 | No | string | Max 500 chars. Empty cell = NULL. Column may be omitted from header entirely (all rows have NULL). |

...

**Format Rules:**
...
- **Empty cells:** Treated as NULL for description column. Empty cells in required columns (date, account, category, amount) are validation errors.
- **Missing description column:** If header omits `description` entirely, all transactions have NULL description. This is distinct from an empty cell (both result in NULL, but column omission is a global schema difference).
```

From components.md validate_description:
```
def validate_description(desc: str | None) -> str | None:
    """Validate transaction description.

    ...

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
```

**What's Missing/Wrong:**

The interface.md says "Empty cell = NULL" which is correct, but it doesn't specify how the CSV reader should handle this. The validate_description function converts empty strings to None, but the CSV import flow needs clarification:

1. Does the CSV reader parse empty cells as empty strings ("") which then get validated to None?
2. Or does the CSV reader parse empty cells directly as None?

More critically for import validation: What if a CSV has a description that's just whitespace (e.g., "   ")?
- Should this be treated as empty and converted to NULL?
- Or should it be stored as-is (possibly failing validation if it exceeds length)?
- The validate_description spec doesn't mention whitespace handling

Also, the CSV validation example shows:
```
2026-01-16,Savings,Transfer,500.00,
```

But it doesn't clarify if this trailing comma with nothing after it is parsed as empty string or None by the CSV parser. Different CSV libraries might handle this differently.

**Assessment:**

Minor gap that could cause subtle bugs. An implementer might make different assumptions about whitespace handling and empty vs. None, leading to inconsistent behavior.

---

No issues found.

