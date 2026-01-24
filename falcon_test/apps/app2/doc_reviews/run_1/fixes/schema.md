# Fixes Applied to falcon_test/apps/app2/docs/systems/database/schema.md

## Changes Made

### Gap ID 17: Database file permissions enforcement undefined
**What Changed**: Added new section "File Permissions Enforcement" under "Database File" section explaining when and how permissions are enforced
**Lines Affected**: Lines 14-23 (new section added after line 12)
**Content Added/Modified**:
```markdown
### File Permissions Enforcement

**When enforced:** Automatically on database creation (init command) and when opening database files for write operations.

**How enforced:** The application uses `safe_open_file()` (defined in technical.md S2) which sets mode 0o600 for all write operations. This ensures:
- New database files created by `init` command have 0600 permissions
- Any write operation to the database file maintains 0600 permissions
- Only the file owner can read or write the database

**User responsibility:** If users manually create database files or modify permissions outside the application, they are responsible for ensuring proper permissions. The application will not check or correct existing file permissions on open—it only enforces permissions when creating or writing files.
```

### Gap ID 34: Database schema lacks CHECK constraints for field validation
**What Changed**: Added clarifying notes to column specification tables explaining why string length validation is application-layer only, and added "Validation Strategy" note under Accounts table
**Lines Affected**: Lines 76, 85, 97, 102 (modified existing table rows and added note)
**Content Added/Modified**:
```markdown
# Modified table rows to add clarification:
| `name` | TEXT | No | - | UNIQUE | Max 50 chars (app-enforced). No DB CHECK due to lack of string length constraints in SQLite. |

| `description` | TEXT | Yes | NULL | - | Max 500 chars (app-enforced). No DB CHECK due to lack of string length constraints in SQLite. |

# Added validation strategy note:
**Validation Strategy:** Length validation (50 char max for names) is enforced at the application layer because SQLite lacks native string length CHECK constraints. The application MUST validate lengths before INSERT/UPDATE operations. See validation.md for enforcement details.
```

### Gap ID 36: Budget report calculation logic not expressed as schema
**What Changed**: Added comprehensive new section "Budget Report Calculation Logic" after the get_month_boundaries() helper function
**Lines Affected**: Lines 382-426 (new section added after line 379)
**Content Added/Modified**:
```markdown
### Budget Report Calculation Logic

The budget report query returns raw data (budget_cents, spent_cents). The application layer calculates derived fields using BudgetReportItem dataclass:

**Field Calculations:**

1. **spent_cents**: Extracted from SQL query (sum of absolute values of negative transactions for the category in the month)

2. **remaining_cents**: Calculated as `budget_cents - spent_cents`
   - Result can be positive (under budget), zero (exactly at budget), or negative (over budget)

3. **percent_used**: Calculated as `(spent_cents / budget_cents) * 100` rounded to 1 decimal place
   - **Edge case - Division by zero:** If `budget_cents == 0`, set `percent_used = 0.0`
   - Rationale: A zero budget means "no budget set", not "infinite spending allowed". Display as 0% usage rather than error or infinity.
   - **Edge case - Over budget:** `percent_used` can exceed 100% (e.g., 125.5% means spent $125.50 for every $100 budgeted)

**Python Implementation Reference** (see components.md for full code):
[Code example showing calculate_percent_used function]

**Display Format** (see interface.md for full output format):
[Example showing budget report output format]
```

## Summary
- Gaps addressed: 3
- Sections added: 2 (File Permissions Enforcement, Budget Report Calculation Logic)
- Sections modified: 4 (Accounts table, Categories table, Transactions table column specs, validation notes)

All gaps have been addressed with minimal changes to existing content. The documentation now explicitly specifies:
1. When and how file permissions are enforced (automatic via safe_open_file on write operations)
2. Why string length validation is application-layer only (SQLite limitation) and where to find enforcement details
3. Complete budget report calculation formulas with edge case handling (division by zero, over-budget scenarios)
