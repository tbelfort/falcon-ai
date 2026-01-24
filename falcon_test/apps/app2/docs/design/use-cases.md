# Use Cases: Personal Finance Tracker CLI

## UC1: Initial Setup

**Actor**: User setting up finance tracking for the first time

**Flow**:
1. Install tool: `pip install finance-cli`
2. Initialize database: `finance-cli init` (uses default `./finances.db` path, or `finance-cli init --db ./custom.db` to specify)
3. Add accounts: checking, savings, credit card
4. Add categories: groceries, utilities, income-freelance, etc.

**Success**: Database created with accounts and categories ready

**Failure modes**:
- Database path not writable -> clear error message
- Database already exists -> refuse without `--force`

---

## UC2: Viewing Available Accounts

**Actor**: User checking which accounts exist

**Flow**:
1. `finance-cli list-accounts` (default table format)
2. `finance-cli list-accounts --format json` (for programmatic use)

**Success**: List of all accounts with ID, name, type, and creation date

**Failure modes**:
- No accounts exist -> shows "No accounts found." message, exit 0
- Database error -> exit 2

---

## UC3: Viewing Available Categories

**Actor**: User checking which categories exist before recording a transaction

**Flow**:
1. `finance-cli list-categories` (default table format)
2. `finance-cli list-categories --format json` (for programmatic use)

**Success**: List of all categories with ID, name, type (income/expense), and creation date

**Failure modes**:
- No categories exist -> shows "No categories found." message, exit 0
- Database error -> exit 2

---

## UC4: Recording Daily Expense

**Actor**: User recording a purchase

**Flow**:
1. `finance-cli add-transaction --account checking --amount -45.67 --category groceries --description "Weekly groceries"`

**Success**: Transaction recorded, new balance shown

**Failure modes**:
- Account not found -> exit 3, suggest `add-account`
- Category not found -> exit 3, suggest `add-category`
- Invalid amount format -> exit 1, show format help

---

## UC5: Recording Income

**Actor**: Freelancer recording client payment

**Flow**:
1. `finance-cli add-transaction --account checking --amount 2500.00 --category income-freelance --description "Client ABC invoice #123" --date 2026-01-15`

**Success**: Income recorded with specified date

**Failure modes**:
- Invalid date format -> exit 1, show expected format
- Future date warning (optional, allowed)

---

## UC6: Checking Account Balance

**Actor**: User checking current financial status

**Flow**:
1. `finance-cli balance` (all accounts)
2. `finance-cli balance --account checking` (specific account)

**Success**: Current balance displayed with account details

**Failure modes**:
- Account not found -> exit 3
- No accounts exist -> helpful message

---

## UC7: Monthly Budget Review

**Actor**: User checking spending against budgets

**Flow**:
1. `finance-cli budget-report --month 2026-01`

**Success**: Report showing category spending vs budget, over/under

**Failure modes**:
- Invalid month format -> exit 1
- No budgets set -> show spending without budget comparison

---

## UC8: Transaction History Review

**Actor**: User reviewing past transactions

**Flow**:
1. `finance-cli list-transactions --from 2026-01-01 --to 2026-01-31`
2. `finance-cli list-transactions --category groceries --limit 20`
3. `finance-cli list-transactions --account checking --format json`

**Success**: Filtered transaction list displayed

**Failure modes**:
- Invalid date range (from > to) -> exit 1
- No matching transactions -> empty result, exit 0

---

## UC9: Data Export for Tax Prep

**Actor**: User exporting data for accountant

**Flow**:
1. `finance-cli export-csv --output transactions-2025.csv --from 2025-01-01 --to 2025-12-31`
2. Open CSV in Excel

**Success**: CSV file with all transaction data

**Failure modes**:
- File exists -> require `--force`
- Path not writable -> exit 1

---

## Non-Goals (Out of Scope)

The following features are explicitly **NOT** included in the MVP:

### Account/Category Deletion
- No `delete-account` or `delete-category` commands
- **Rationale**: Deletion is complex due to referential integrity. If an account or category has associated transactions, deletion would either:
  - Cascade delete all related transactions (data loss risk)
  - Be blocked by foreign key constraints (user frustration)
  - Require soft-deletion or archival logic (added complexity)
- **Workaround**: Users can simply stop using an account/category. The database will retain historical records for reporting purposes.
- **Future consideration**: If deletion is added later, it should require explicit confirmation and clearly warn about data implications.

### Transaction Editing/Deletion
- No `edit-transaction` or `delete-transaction` commands
- **Rationale**: Financial records should be immutable for audit trail purposes. Corrections should be made via reversal transactions.
- **Workaround**: Add a new correcting transaction to fix errors

### Account/Category Renaming
- No rename commands for accounts or categories
- **Rationale**: Names are used as identifiers in the CLI. Renaming would require updating all references, which adds complexity.
- **Workaround**: Create a new account/category with the desired name and transition to using it for new transactions
