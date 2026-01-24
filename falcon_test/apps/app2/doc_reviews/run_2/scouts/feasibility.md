# Architecture Feasibility Scout Report

## Assessment: ISSUES_FOUND

The architecture is mostly sound but contains several critical inconsistencies and potential implementation problems that need resolution before development begins.

## Issues

### Issue 1: Critical Security Conflict - Path Validation Implementation Location

**Affected Files:** ["falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md", "falcon_test/apps/app2/docs/design/components.md"]

**Relevant Text From Docs:**

From ARCHITECTURE-simple.md (lines 170-246):
```
**Implementation Location:** The `validate_path()` function MUST be implemented in `models.py` (not database.py or cli.py) to centralize validation logic. See components.md for the complete function specification.

For `--db` and `--output` arguments:
- Paths MUST be URL-decoded before validation. Check for '..' in both raw and decoded forms.
- Must not contain `..` (path traversal)
- Must resolve symlinks and verify containment within allowed directory
- Absolute paths outside the current working directory are blocked
- Must be writable by current user
- Path validation and file access MUST be atomic. Use `os.open()` to open the resolved path, then use `os.fstat()` on the fd rather than `os.stat()` on the path.

def validate_path(path: str, base_dir: str = None) -> str:
    [... 50 lines of implementation code follow ...]
```

From components.md (lines 152-156):
```
### `models.py`

**Purpose**: Data classes and validation logic

**Location Note**: All validation functions including `validate_path()` are defined in this module (models.py), not in database.py or cli.py. This centralizes validation logic and makes it reusable across the application. See ARCHITECTURE-simple.md S2 for detailed path validation security requirements.
```

**What's Missing/Wrong:**

The architecture specifies validate_path() must be in models.py, but the atomicity requirement creates a fundamental implementation problem:

1. validate_path() returns a **string path** (line 195 in ARCHITECTURE-simple.md: "Returns: Normalized absolute path")
2. The architecture requires atomic file access using `safe_open_file()` which returns a **file descriptor** (lines 264-318 in ARCHITECTURE-simple.md)
3. BUT safe_open_file() is not documented in components.md as part of models.py's public interface
4. The coordination pattern (lines 256-259) requires callers to "IMMEDIATELY pass the validated path to safe_open_file()", creating a TOCTOU window between validation and opening

This creates an inconsistency: The validation function is in models.py but returns a string, then relies on an undocumented safe_open_file() function (location unknown) to provide atomicity. The two-step process contradicts the stated goal of atomic validation + access.

**Assessment:**

This is a solvable architectural flaw but needs clarification. Options:
1. Document safe_open_file() in models.py's public interface
2. Have validate_path() return a file descriptor instead of a string (breaking change to interface)
3. Accept the small TOCTOU window as documented (line 266: "The single-user CLI design accepts a small TOCTOU window")

The architecture documentation contradicts itself - it says TOCTOU must be prevented atomically, then says the single-user design accepts a small TOCTOU window. This needs resolution before implementation.

---

### Issue 2: URL Decoding DoS Vulnerability

**Affected Files:** ["falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md"]

**Relevant Text From Docs:**

From ARCHITECTURE-simple.md (lines 207-222):
```
# CRITICAL: URL-decode the path repeatedly until stable
# This prevents bypasses using double/triple encoding like %252e%252e
# which decodes to %2e%2e, then to ..
# Maximum 10 iterations to prevent DoS from deeply nested encoding
decoded_path = path
max_iterations = 10
for iteration in range(max_iterations):
    new_decoded = urllib.parse.unquote(decoded_path)
    if new_decoded == decoded_path:
        break
    decoded_path = new_decoded
else:
    # Exceeded iteration limit
    raise ValidationError("Path contains excessive URL encoding layers (possible DoS attempt)")
```

**What's Missing/Wrong:**

The iterative URL decoding approach with a 10-iteration limit creates a potential DoS vector:

1. An attacker provides a path with 10+ layers of URL encoding
2. Each urllib.parse.unquote() call processes the entire string
3. For a 1000-character path with 10 layers, this is 10,000 character operations
4. While the code limits iterations to 10, this doesn't prevent resource exhaustion from processing very long paths through all 10 iterations
5. The comment says "prevents DoS" but the implementation only limits iterations, not path length

The validation function has no check on the **input path length** before starting the decoding loop. A 100KB path with 10 encoding layers would consume significant CPU before being rejected.

**Assessment:**

Medium severity - exploitable in multi-user scenarios (e.g., if this CLI is ever wrapped in a web service). For the stated single-user personal finance use case, this is low risk. However, it contradicts the security-first design philosophy evident throughout the rest of the architecture.

Fix: Add `if len(path) > 4096: raise ValidationError("Path too long")` before the decoding loop.

---

### Issue 3: Foreign Key Enforcement Documentation Inconsistency

**Affected Files:** ["falcon_test/apps/app2/docs/systems/database/schema.md", "falcon_test/apps/app2/docs/design/components.md"]

**Relevant Text From Docs:**

From schema.md (lines 562-571):
```
### S5: Foreign Key Enforcement (CRITICAL)

**`PRAGMA foreign_keys = ON` MUST be executed on every new database connection.**

Without this pragma, SQLite silently ignores all `REFERENCES` constraints, allowing:
- Transactions referencing non-existent accounts
- Transactions referencing non-existent categories
- Budgets referencing non-existent categories

This is a security-critical rule. The `get_connection()` context manager MUST execute this pragma immediately after opening the connection, before any other operations.
```

From components.md (lines 129-130):
```
- `init_database(path: str) -> None` -- Creates database file and runs schema creation. Idempotent. MUST use atomic file creation to prevent TOCTOU attacks. MUST set file permissions to 0600 (owner read/write only) immediately after creation using os.chmod(). This enforces restrictive permissions automatically without user intervention. **CRITICAL**: MUST use get_connection() internally to obtain a database connection (which automatically enables PRAGMA foreign_keys = ON as required by schema.md). All schema DDL operations must be executed through this connection to ensure foreign key constraints are enforced during table creation.
```

From schema.md (lines 489-513):
```
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

**Rules:**
- Always use context manager (ensures close)
- Always commit or rollback (no implicit transactions)
- Set `row_factory = sqlite3.Row` for named column access
- Enable foreign keys with `PRAGMA foreign_keys = ON` (SQLite has foreign key enforcement OFF by default; this must be enabled per-connection)
```

**What's Missing/Wrong:**

The documentation is consistent and correct here, but there's a critical implementation ordering problem that's not addressed:

1. init_database() must create the database file with 0600 permissions
2. init_database() must use get_connection() to execute DDL
3. get_connection() opens the database with sqlite3.connect()
4. BUT the file permissions must be set BEFORE or DURING the connection, not after

The docs say "MUST set file permissions to 0600 (owner read/write only) immediately after creation using os.chmod()" but don't specify the atomic sequence. The problem:

```python
# This has a TOCTOU window:
init_database():
    create_file()  # Creates with default permissions
    os.chmod(path, 0o600)  # Window here - file exists with wrong permissions
    with get_connection(path):  # Now opens the file
        execute_schema()
```

SQLite's connect() will create the file if it doesn't exist, with default umask permissions. The architecture requires 0600 but doesn't specify HOW to atomically create-and-set-permissions for the SQLite database.

**Assessment:**

This is implementable but needs clarification on the exact sequence:
- Should init_database() pre-create the file with open(path, 'w') and os.chmod() before calling sqlite3.connect()?
- Or should it rely on umask manipulation (which is process-wide and not thread-safe)?
- Or use os.open() with mode 0o600, then pass fd to sqlite3.connect() (but sqlite3.connect() doesn't accept fds)?

The "MUST set file permissions to 0600 immediately after creation" is specified but the atomicity mechanism is unclear given SQLite's API constraints.

---

### Issue 4: CSV Import Memory Handling Contradicts Performance Targets

**Affected Files:** ["falcon_test/apps/app2/docs/systems/cli/interface.md", "falcon_test/apps/app2/docs/design/technical.md"]

**Relevant Text From Docs:**

From interface.md (lines 731-765):
```
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

**Recommended CSV File Size Limits:**
- **Maximum recommended:** 100MB or 100,000 rows
- **Behavior with larger files:** Files exceeding this limit may work but will:
  - Consume significant memory (all rows loaded during validation phase)
  - Take longer to process (proportional to row count)
  - Risk memory exhaustion on systems with limited RAM
```

From technical.md (lines 243-256):
```
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
```

**What's Missing/Wrong:**

The CSV import documentation says it supports "100MB or 100,000 rows" but doesn't provide a performance target, while all other operations have specific targets for 100,000 transactions. The two-phase validation approach with full in-memory loading creates a contradiction:

1. The system is designed for 100,000 transaction datasets (10 years of data per technical.md)
2. CSV import must load ALL rows into memory before validation (interface.md line 748)
3. 100,000 rows × ~200 bytes per row (average CSV row) = ~20MB raw data
4. Python dict overhead (parsed row dictionaries) = ~800 bytes per row × 100,000 = ~80MB
5. Total memory for validation phase: ~100MB+ for a 20MB CSV

The architecture claims "Files with 10,000+ transactions (~1MB for typical row sizes)" (line 748) but 10,000 rows is only 1-2MB, not representative of the 100,000 transaction target. The math doesn't align - typical CSV encoding for transaction data is ~200 bytes per row:
```
2026-01-15,Main Checking,Groceries,-125.67,"Weekly grocery shopping"
```
That's ~70 characters = ~70 bytes, but with escaping and overhead, easily 200 bytes.

**Assessment:**

This is feasible but the documentation is misleading about the memory implications. The two-phase validation approach will work for 100,000 rows but requires ~100-150MB of RAM during import, not the "~1MB for typical row sizes" claimed. For a personal finance CLI, this is acceptable on modern systems (even phones have 4GB+ RAM), but the docs should be honest about the memory cost.

Additionally, there's no performance target for import operations. Given the two-phase approach with 100K validation lookups (line 774: "~1000 account lookups + ~1000 category lookups" but for 100K rows this scales proportionally), import of 100,000 transactions could take 10+ seconds, which should be documented as acceptable for a bulk operation.

---

### Issue 5: Currency Precision Contradiction

**Affected Files:** ["falcon_test/apps/app2/docs/design/technical.md", "falcon_test/apps/app2/docs/design/components.md"]

**Relevant Text From Docs:**

From technical.md (lines 114-129):
```
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
```

From components.md (lines 454-474):
```
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
```

**What's Missing/Wrong:**

There's a logical contradiction in the rounding specification:

1. technical.md says: "When conversion requires rounding, use ROUND_HALF_EVEN" (line 120)
2. technical.md also says: "amounts with more than 2 decimal places MUST be rejected during validation, not rounded silently" (line 120)
3. components.md says: "This function assumes the input has already been validated to have at most 2 decimal places" (line 460)

If validation rejects amounts with >2 decimal places, then decimal_to_cents() will NEVER need to round because all inputs will have exactly 0, 1, or 2 decimal places. The function documentation says "Uses ROUND_HALF_EVEN for any rounding operations" but then says rounding should never happen.

This creates implementation confusion: Should decimal_to_cents() include rounding logic defensively (for future use cases), or should it assert that no rounding is needed (since validation guarantees this)?

The "Currency Conversion Precision" section (technical.md lines 122-128) mentions "intermediate calculations" with 6+ decimal places, but nowhere in the MVP scope is currency conversion implemented. This guidance applies to future features but contradicts the "MUST be rejected during validation" rule for current features.

**Assessment:**

This is a documentation clarity issue, not a fundamental flaw. The intended behavior is clear (reject >2 decimal places in validation), but the defensive rounding specification creates confusion. The implementation should either:
1. Remove the rounding logic from decimal_to_cents() and add an assertion that input has ≤2 decimal places
2. Keep the rounding as defensive programming for future features but document it as "should not be reached in MVP"

This won't block implementation but will cause developer confusion.

---

### Issue 6: Inconsistent Row Numbering in CSV Import Error Messages

**Affected Files:** ["falcon_test/apps/app2/docs/systems/errors.md"]

**Relevant Text From Docs:**

From errors.md (lines 115-142):
```
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
```

**What's Missing/Wrong:**

The row numbering specification conflicts with the two-phase validation approach documented in interface.md. From interface.md (lines 731-744), the import process has two phases:

1. **Validation Phase:** "Read and validate ALL rows before any database writes"
2. **Insert Phase:** "Only if ALL rows pass validation, insert in single transaction"

The errors.md specification says "CSV import stops at first error" (line 117), which implies sequential validation that halts on the first problem. But the two-phase approach in interface.md suggests all rows are validated before reporting errors.

This creates an implementation question: Should the validator:
- Report only the FIRST error (errors.md line 117) and stop parsing?
- Collect ALL validation errors across all rows (implied by "validate ALL rows" in interface.md)?

The example in errors.md shows a single error message, but doesn't clarify whether this is the only error or just the first of many. For a CSV with 100 rows and 50 validation errors, does the user see 1 error or 50?

**Assessment:**

This is a UX design issue that needs clarification before implementation. Options:
1. Stop at first error (faster, but requires multiple import attempts to fix all issues)
2. Report all errors (better UX, but more complex error output)

Neither approach is technically infeasible, but the documentation should be explicit about which behavior is intended. The "stops at first error" language in errors.md contradicts the "validate ALL rows" language in interface.md.

---

## Summary

The architecture is fundamentally sound for a personal finance CLI application, but has 6 issues requiring resolution:

1. **CRITICAL** - Path validation atomicity mechanism is underspecified (solvable, needs clarification on safe_open_file() location/interface)
2. **MEDIUM** - URL decoding DoS vulnerability (easy fix: add path length check)
3. **MEDIUM** - Database file permission setting mechanism unclear given SQLite API constraints (solvable, needs implementation sequence clarification)
4. **LOW** - CSV import memory documentation misleading about actual memory usage (documentation fix, implementation is feasible)
5. **LOW** - Currency rounding specification contradicts validation rules (documentation clarity issue)
6. **LOW** - CSV import error reporting behavior unclear (UX decision needed)

None of these issues are architectural showstoppers, but issues #1 and #3 need resolution before implementation begins to avoid security vulnerabilities. The rest are documentation clarity issues that could cause implementation confusion.
