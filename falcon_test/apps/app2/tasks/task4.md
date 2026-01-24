# Task 4: CSV Export/Import

Implement the export-csv and import-csv commands with file handling.

## Context

Read before starting:
- `docs/design/components.md` - formatters.py CSV specification
- `docs/systems/cli/interface.md` - export-csv and import-csv command specifications
- `docs/systems/database/schema.md` - Get Transactions for Export query
- `docs/systems/architecture/ARCHITECTURE-simple.md` - S2 path validation

## Scope

- [ ] `export-csv` command in commands.py
- [ ] `import-csv` command in commands.py
- [ ] CSV writing in formatters.py (RFC 4180 compliant)
- [ ] CSV reading in formatters.py
- [ ] File existence checking with `--force` handling
- [ ] Date range filter support for export (`--from`, `--to`)
- [ ] Path validation (no `..` traversal)

## Constraints

- **S2**: Validate paths - must not contain `..`
- CSV must be RFC 4180 compliant (comma delimiter, double-quote escaping, UTF-8)
- Must handle existing file gracefully (require --force to overwrite)
- Error messages must use basename only, not full path
- Import must validate account/category existence before inserting transactions

## Import Atomicity Implementation

The import-csv command MUST use a two-phase approach:
1. **Validation Phase:** Read and validate ALL rows before any database writes
   - Check CSV format, required columns, data types
   - Validate all accounts exist, all categories exist
   - Collect all validation errors
2. **Insert Phase:** Only if validation passes for ALL rows, insert in single transaction
   - Begin transaction
   - Insert all rows
   - Commit (or rollback on any error)

This ensures partial imports never occur - it's all-or-nothing.

## Tests Required

### Export tests
- Export creates valid CSV with header row
- CSV has correct columns: `id,date,account,category,amount,description`
- CSV properly escapes fields with commas (e.g., description "Lunch, coffee")
- CSV properly escapes fields with quotes (e.g., description `She said "hello"`)
- CSV injection prevention: description starting with `=` is prefixed with `'` (e.g., `=1+1` becomes `'=1+1`)
- CSV injection prevention: description starting with `+`, `-`, `@`, tab, or CR is prefixed with `'`
- CSV injection prevention: account/category names starting with formula characters are prefixed
- CSV injection prevention: amount field `-45.67` is NOT prefixed (numeric fields are exempt)
- Date range filter `--from` works correctly
- Date range filter `--to` works correctly
- Combined date range filter works correctly
- File exists without `--force` -> exit 1
- File exists with `--force` -> overwrites, exit 0
- Path with `..` -> exit 1
- Output path not writable -> exit 1

### Import tests
- Import reads valid CSV with header row
- Import creates transactions with correct amounts (converted to cents)
- Import validates account existence -> exit 3 with row number
- Import validates category existence -> exit 3 with row number
- Import handles malformed CSV gracefully (missing columns) -> exit 1
- Import handles invalid date format in CSV -> exit 1 with row number
- Import handles invalid amount format in CSV -> exit 1 with row number
- Path with `..` -> exit 1
- File not found -> exit 1

## Not In Scope

- All other commands (completed in Tasks 1-3)

## Acceptance Criteria

```bash
# Export all transactions
python -m finance_cli export-csv --output transactions.csv --db ./test.db
# Output: Exported 150 transactions to transactions.csv
# Exit: 0
# File header: id,date,account,category,amount,description

# Verify CSV content
cat transactions.csv
# id,date,account,category,amount,description
# 1,2026-01-18,Main Checking,Groceries,-45.67,Weekly groceries
# 2,2026-01-15,Main Checking,Salary,5000.00,Monthly salary

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

# Path traversal blocked (export)
python -m finance_cli export-csv --output ../../../etc/passwd --db ./test.db
# Output: Error: Path cannot contain '..'.
# Exit: 1

# Import CSV
python -m finance_cli import-csv --input import.csv --db ./test.db
# Output: Imported 50 transactions from import.csv
# Exit: 0

# Import CSV - file not found
python -m finance_cli import-csv --input nonexistent.csv --db ./test.db
# Output: Error: File 'nonexistent.csv' not found.
# Exit: 1

# Import CSV - account not found
# (where import.csv row 5 references account "Unknown")
python -m finance_cli import-csv --input bad-import.csv --db ./test.db
# Output: Error: Account 'Unknown' not found in row 5.
# Exit: 3

# Path traversal blocked (import)
python -m finance_cli import-csv --input ../../../etc/passwd --db ./test.db
# Output: Error: Path cannot contain '..'.
# Exit: 1
```

## CSV Format Specification

### Export CSV columns (in order):
```
id,date,account,category,amount,description
```

### Import CSV columns (expected header):
```
date,account,category,amount,description
```

Note: Import does not include `id` column (auto-generated on insert).

**Important:** Export and import CSV formats differ intentionally:
- Export includes `id` column (for reference/auditing)
- Import does NOT accept `id` column (IDs are auto-generated)

To re-import exported data, users must remove the `id` column first.
This is by design - the `id` is database-specific and not portable.

### Amount format in CSV:
- Decimal format with exactly 2 decimal places
- Negative for expenses: `-45.67`
- Positive for income: `5000.00`
- No currency symbol or commas in CSV
