# Fixes Applied to falcon_test/apps/app2/docs/design/use-cases.md

## Changes Made

### Gap ID 11: list-accounts command missing from use cases
**What Changed**: Added new UC2 "Viewing Available Accounts" that documents when and how users would list existing accounts
**Lines Affected**: Lines 21-36 (inserted after UC1 Initial Setup)
**Content Added/Modified**:
```
## UC2: Viewing Available Accounts

**Actor**: User checking which accounts exist

**Flow**:
1. `finance-cli list-accounts` (default table format)
2. `finance-cli list-accounts --format json` (for programmatic use)

**Success**: List of all accounts with ID, name, type, and creation date

**Failure modes**:
- No accounts exist -> shows "No accounts found." message, exit 0
- Database error -> exit 2
```

### Gap ID 12: list-categories command missing from use cases
**What Changed**: Added new UC3 "Viewing Available Categories" that documents when and how users would list existing categories before recording transactions
**Lines Affected**: Lines 38-53 (inserted after UC2)
**Content Added/Modified**:
```
## UC3: Viewing Available Categories

**Actor**: User checking which categories exist before recording a transaction

**Flow**:
1. `finance-cli list-categories` (default table format)
2. `finance-cli list-categories --format json` (for programmatic use)

**Success**: List of all categories with ID, name, type (income/expense), and creation date

**Failure modes**:
- No categories exist -> shows "No categories found." message, exit 0
- Database error -> exit 2
```

### Sequential Renumbering
**What Changed**: Renumbered all subsequent use cases (UC2->UC4, UC3->UC5, UC4->UC6, UC5->UC7, UC6->UC8, UC7->UC9) to maintain sequential ordering after inserting two new use cases
**Lines Affected**: Multiple sections throughout the document
**Content Added/Modified**: No content changes, only numbering adjustments to maintain document consistency

## Summary
- Gaps addressed: 2
- Sections added: 2
- Sections modified: 7 (6 renumbered sections + 2 new sections)

## Rationale
The new use cases were inserted immediately after UC1 (Initial Setup) because:
1. They represent discovery/viewing operations that users would naturally perform after setup
2. Users need to know what accounts and categories exist before recording transactions (referenced in UC4's failure modes)
3. Logical flow: Setup -> View what exists -> Record transactions -> Review/Export

Both new use cases follow the existing document's format:
- Clear actor definition
- Simple flow with command examples
- Success criteria
- Explicit failure modes with exit codes
- Consistent with technical specifications in interface.md
