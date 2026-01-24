# Fixes Applied to falcon_test/apps/app2/docs/design/components.md

## Changes Made

### Gap ID 13: Import CSV validation phase implementation details undefined
**What Changed**: Added detailed documentation of the two-phase CSV import process to `cmd_import_csv()` function specification
**Lines Affected**: Lines 91-103 (after `cmd_import_csv` declaration)
**Content Added/Modified**:
```python
# Two-phase import process:
# Phase 1 - Validation: Load and parse all CSV rows into memory, validate all fields,
#   resolve all account/category references. This phase creates in-memory Account and
#   Category objects for any missing entities. For MVP, in-memory validation is acceptable
#   for typical personal finance CSV files (<10k rows). If validation fails for any row,
#   abort before database insert phase.
# Phase 2 - Insert: Wrap all inserts in a single database transaction. Insert missing
#   accounts/categories first, then insert all transactions. If any insert fails, the
#   entire transaction is rolled back (per AD6 in technical.md).
# Duplicate resolution: If multiple CSV rows reference the same missing account/category
#   name, create only one entity. Use a dict to track created entities during Phase 1.
# Memory handling: For MVP, load entire CSV into memory. Typical personal finance CSVs
#   are small (<10k rows). Large file handling (streaming) is out of scope for MVP.
```

### Gap ID 17: Database file permissions enforcement undefined
**What Changed**: Specified automatic permission enforcement in `init_database()` and verification in `get_connection()`
**Lines Affected**: Lines 111-113 (database.py public interface section)
**Content Added/Modified**:
```python
- `init_database(path: str) -> None` -- ... MUST set file permissions to 0600 (owner read/write only) immediately after creation using os.chmod(). This enforces restrictive permissions automatically without user intervention.
- `get_connection(path: str) -> ContextManager[sqlite3.Connection]` -- ... On first open of existing database file, SHOULD verify permissions are 0600 and emit warning to stderr if more permissive (but do not fail, as user may have valid reasons for different permissions).
```

### Gap ID 20: Error recovery/rollback behavior for multi-step operations undefined
**What Changed**: Added explicit transaction boundary documentation to `cmd_add_transaction()` function specification
**Lines Affected**: Lines 80-85 (after `cmd_add_transaction` declaration)
**Content Added/Modified**:
```python
# Transaction boundary: Per AD6 in technical.md, this entire operation is a single transaction.
# All steps (lookup account, lookup category, insert transaction) MUST be wrapped in the same
# database transaction via get_connection() context manager. If any step fails (e.g., account
# not found raises NotFoundError), the context manager automatically rolls back. No partial
# state is committed.
```

### Gap ID 36: Budget report calculation logic not expressed as schema
**What Changed**: Added consolidated Budget Report Calculation Specification to the BudgetReportItem dataclass documentation
**Lines Affected**: Lines 189-203 (BudgetReportItem dataclass)
**Content Added/Modified**:
```python
# Budget Report Calculation Specification:
# 1. spent_cents: Sum of all transaction.amount_cents for this category in the month
#    (calculated by SQL query in get_budget_report, see schema.md)
# 2. remaining_cents = budget_cents - spent_cents
# 3. percent_used = calculate_percent_used(spent_cents, budget_cents)
#    - Returns 0.0 when budget_cents == 0 (division by zero safe)
#    - Otherwise: (spent_cents / budget_cents) * 100, rounded to 1 decimal place
# 4. All monetary values use integer cents for precision (no float arithmetic)
```

## Summary
- Gaps addressed: 4
- Sections added: 0 (all additions were inline documentation within existing sections)
- Sections modified: 3 (commands.py public interface, database.py public interface, models.py BudgetReportItem)

All gaps have been addressed with targeted, minimal edits that preserve the existing structure and style of the document. The changes clarify implementation details that were previously ambiguous while maintaining consistency with the overall design specification.
