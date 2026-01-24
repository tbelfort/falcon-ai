# Task 3: Core Commands + Formatters

Implement transaction, balance, and budget commands with output formatting.

## Context

Read before starting:
- `docs/design/components.md` - commands.py and formatters.py specifications
- `docs/systems/cli/interface.md` - Command specifications for all core commands
- `docs/systems/database/schema.md` - Query patterns including search and budget report
- `docs/systems/architecture/ARCHITECTURE-simple.md` - Layer rules

## Scope

- [ ] `finance_cli/commands.py` - Business logic for:
  - `cmd_add_transaction()`
  - `cmd_list_transactions()`
  - `cmd_balance()`
  - `cmd_set_budget()`
  - `cmd_budget_report()`
- [ ] `finance_cli/formatters.py` - Table and JSON formatters:
  - `format_transactions_table()` / `format_transactions_json()`
  - `format_balance_table()` / `format_balance_json()`
  - `format_budget_report_table()` / `format_budget_report_json()`
  - `format_accounts_table()` / `format_categories_table()`
- [ ] Integration of commands into cli.py argument parser
- [ ] Input validation for all command arguments

## Constraints

- **AD1**: Commands return data, CLI layer handles formatting and printing
- **AD4**: All queries use parameterized placeholders (`?`)
- **AD5**: Validate inputs at CLI boundary
- **AD7**: Display amounts as decimal from cents (use `cents_to_decimal()`)
- Commands MUST NOT print to stdout/stderr (return data only)
- Commands MUST NOT catch exceptions (let them propagate to CLI)

## Tests Required

### add-transaction tests
- Success case: transaction recorded with correct amount in cents
- Account not found -> exit 3
- Category not found -> exit 3
- Invalid amount format -> exit 1
- Invalid date format -> exit 1
- Default date is today when not specified

### list-transactions tests
- Filter by account
- Filter by category
- Filter by date range
- Combined filters
- No results returns empty list (exit 0)
- Invalid date range (from > to) -> exit 1
- Limit parameter works correctly
- Limit of 0 -> exit 1 with error "Limit must be greater than 0"
- Negative limit -> exit 1 with error "Limit must be greater than 0"
- CLI default is 50 when --limit not specified
- Non-existent account filter returns empty list (exit 0)
- Non-existent category filter returns empty list (exit 0)

### balance tests
- All accounts balance
- Specific account balance
- Account not found -> exit 3
- Empty database returns zero balances

### set-budget tests
- Success case
- Category not found -> exit 3
- Invalid month format -> exit 1
- Invalid amount (negative) -> exit 1
- Budget amount zero -> exit 1
- Budget amount with >2 decimal places (e.g., 100.123) -> exit 1 with "Invalid amount format"
- Budget amount at max boundary (999999999.99) -> exit 0 (success)
- Budget amount over max boundary (1000000000.00) -> exit 1 with "Amount exceeds maximum"
- Update existing budget (upsert)

### budget-report tests
- Report with budgets set
- Report without budgets (shows $0 budget)
- Report with spending over budget
- Invalid month format -> exit 1
- December budget report (month='2025-12') calculates month_end as '2026-01-01' correctly
- January budget report (month='2026-01') calculates month_end as '2026-02-01' correctly
- Budget with zero spending shows percent_used=0.0
- Category with spending but no budget shows percent_used=0.0 (not infinity)
- Category with budget_cents=0 (edge case) shows percent_used=0.0 (not infinity or NaN) - validates division by zero handling per components.md line 191

### Formatter tests
- Table format: proper column widths, amount formatting with `$` and commas
- Table format: empty list shows "No transactions found." message
- JSON format: proper structure, amounts as strings
- JSON format: null handling for optional fields
- JSON format: empty array `[]` for no results

## Not In Scope

- export-csv, import-csv commands (Task 4)
- CSV formatting (Task 4)

## Acceptance Criteria

```bash
# Add transaction (expense)
python -m finance_cli add-transaction --account "Main Checking" --amount -45.67 --category Groceries --description "Weekly groceries" --db ./test.db
# Output: Transaction recorded: -$45.67 to Groceries (ID: 1)
# Exit: 0

# Add transaction (income)
python -m finance_cli add-transaction --account "Main Checking" --amount 5000.00 --category Salary --date 2026-01-15 --db ./test.db
# Output: Transaction recorded: $5,000.00 to Salary (ID: 2)
# Exit: 0

# List transactions
python -m finance_cli list-transactions --category Groceries --db ./test.db
# Output: Table with transaction
# Exit: 0

# List transactions (JSON)
python -m finance_cli list-transactions --format json --db ./test.db
# Output: [{"id": 1, "date": "2026-01-21", "account": "Main Checking", ...}]
# Exit: 0

# Balance
python -m finance_cli balance --db ./test.db
# Output: Table with account balances
# Exit: 0

# Balance specific account
python -m finance_cli balance --account "Main Checking" --db ./test.db
# Output: Table with single account balance
# Exit: 0

# Set budget
python -m finance_cli set-budget --category Groceries --month 2026-01 --amount 500.00 --db ./test.db
# Output: Budget set: Groceries for 2026-01 = $500.00
# Exit: 0

# Budget report
python -m finance_cli budget-report --month 2026-01 --db ./test.db
# Output: Table with budget vs spent
# Exit: 0

# Budget report (JSON)
python -m finance_cli budget-report --month 2026-01 --format json --db ./test.db
# Output: [{"category": "Groceries", "budget": "500.00", "spent": "45.67", ...}]
# Exit: 0
```
