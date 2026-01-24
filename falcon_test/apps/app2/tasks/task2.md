# Task 2: CLI Framework + Init/Setup Commands

Implement argument parsing, command routing, and the initialization commands.

## Context

Read before starting:
- `docs/design/components.md` - cli.py and __main__.py specifications
- `docs/systems/cli/interface.md` - Global options, init, add-account, add-category command specs
- `docs/systems/errors.md` - Error handling rules
- `docs/systems/architecture/ARCHITECTURE-simple.md` - CLI layer rules

## Scope

- [ ] `finance_cli/__main__.py` - Entry point for `python -m finance_cli`
- [ ] `finance_cli/cli.py` - argparse setup with all global options and subcommands
- [ ] `init` command fully working with `--force` flag
- [ ] `add-account` command
- [ ] `add-category` command
- [ ] `list-accounts` command in commands.py
- [ ] `list-categories` command in commands.py
- [ ] Exception-to-exit-code mapping in CLI layer
- [ ] `--verbose` flag implementation

Note: `list-accounts` and `list-categories` commands are implemented in Task 2,
but use placeholder/simple output. The formatted table output (format_accounts_table,
format_categories_table) is added in Task 3. Task 2 acceptance criteria should use
simple output verification; Task 3 tests verify formatted output.

## Constraints

- **AD5**: Validate all user input at CLI boundary before passing to commands
- CLI layer MUST NOT import sqlite3 or access database directly
- CLI layer MUST NOT contain business logic
- Use argparse only (no Click, Typer, etc.)

## Tests Required

- CLI parses all global options correctly (`--db`, `--verbose`, `--help`, `--version`)
- CLI routes to correct subcommand
- `init` creates database file
- `init` refuses to overwrite without `--force`
- `init --force` recreates database
- `add-account` creates account with valid inputs
- `add-account` rejects invalid account type (exit 1)
- `add-account` rejects duplicate name (exit 4)
- `add-category` creates category with valid inputs
- `add-category` rejects invalid category type (exit 1)
- `add-category` rejects duplicate name (exit 4)
- `list-accounts` returns all accounts in table format (exit 0)
- `list-accounts --format json` returns JSON array (exit 0)
- `list-accounts` with no accounts returns "No accounts found." (exit 0)
- `list-categories` returns all categories in table format (exit 0)
- `list-categories --format json` returns JSON array (exit 0)
- `list-categories` with no categories returns "No categories found." (exit 0)
- Exit codes are correct for each error type

## Not In Scope

- add-transaction, list-transactions, balance commands (Task 3)
- set-budget, budget-report commands (Task 3)
- export-csv, import-csv commands (Task 4)
- Output formatting (Task 3)

## Acceptance Criteria

```bash
# Creates new database
python -m finance_cli init --db ./test.db
# Output: Database initialized at ./test.db
# Exit: 0

# Refuses to overwrite
python -m finance_cli init --db ./test.db
# Output: Error: Database already exists at test.db. Use --force to recreate.
# Exit: 1

# Force recreates
python -m finance_cli init --db ./test.db --force
# Output: Database initialized at ./test.db
# Exit: 0

# Add account
python -m finance_cli add-account --name "Main Checking" --type checking --db ./test.db
# Output: Account created: Main Checking (ID: 1)
# Exit: 0

# Add account - invalid type
python -m finance_cli add-account --name "Bad" --type invalid --db ./test.db
# Output: Error: Account type must be one of: checking, savings, credit, cash
# Exit: 1

# Add account - duplicate
python -m finance_cli add-account --name "Main Checking" --type savings --db ./test.db
# Output: Error: Account 'Main Checking' already exists.
# Exit: 4

# Add category
python -m finance_cli add-category --name "Groceries" --type expense --db ./test.db
# Output: Category created: Groceries (ID: 1)
# Exit: 0

# Add category - invalid type
python -m finance_cli add-category --name "Bad" --type invalid --db ./test.db
# Output: Error: Category type must be one of: income, expense
# Exit: 1

# Shows version
python -m finance_cli --version
# Output: finance-cli 0.1.0
```
