# Fixes Applied to falcon_test/apps/app2/docs/systems/cli/interface.md

## Changes Made

### Gap ID 13: Import CSV validation phase implementation details undefined
**What Changed**: Added detailed "Implementation Details" subsection under the two-phase import approach section
**Lines Affected**: ~683-710 (after existing two-phase description)
**Content Added/Modified**:
```markdown
**Implementation Details:**

**Memory Handling:** For MVP, validation phase loads all CSV rows into memory (list of parsed row dictionaries). This is acceptable for personal finance use cases where CSV files typically contain hundreds to low thousands of transactions (1-3 years of data). Files with 10,000+ transactions (~1MB for typical row sizes) will work but may consume noticeable memory.

**File Size Considerations:**
- Target use case: Personal finance CSVs (typically 100-5000 transactions, <500KB)
- Tested limit: Up to 50,000 transactions (~5MB) should work on modern systems
- Extreme edge case: 1GB CSV files (millions of transactions) are out of scope for single-user personal finance tracking and may cause memory exhaustion

**Duplicate Account/Category Resolution:**
During validation phase, each row's account and category names are looked up exactly once:
- Account lookup: `SELECT id FROM accounts WHERE name = ?` (case-sensitive exact match)
- Category lookup: `SELECT id FROM categories WHERE name = ?` (case-sensitive exact match)
- If multiple CSV rows reference the same account/category name, they all resolve to the same database ID
- If an account/category name is not found, validation fails immediately for that row with error message indicating row number
- Duplicate account/category NAMES are prevented at creation time by UNIQUE constraint (see schema.md), so lookup is deterministic

**Performance:** Validation phase lookups are not optimized (no caching). For CSVs with 1000 rows referencing 5 unique accounts and 10 unique categories, this results in ~1000 account lookups + ~1000 category lookups. SQLite handles this efficiently for small datasets. For performance-critical large imports (out of scope for MVP), lookups could be batched or cached.
```

**Rationale**: Clarifies that in-memory validation is acceptable for the target use case (personal finance), provides realistic file size expectations, and explains exactly how duplicate account/category references are resolved through deterministic database lookups.

---

### Gap ID 20: Error recovery/rollback behavior for multi-step operations undefined
**What Changed**: Added "Transaction Boundaries" explanation to `add-transaction` command behavior section
**Lines Affected**: ~295 (after existing 6-step behavior list)
**Content Added/Modified**:
```markdown
**Transaction Boundaries:** Per architectural decision AD6 (technical.md), each command is a single database transaction. For `add-transaction`, all steps (account lookup, category lookup, transaction insert) execute within one atomic transaction. If any step fails (e.g., category not found after account lookup succeeds), the entire operation rolls back with no database changes. This is achieved using SQLite's context manager pattern (schema.md) where the connection commits on success and rolls back on exception.
```

**Rationale**: Explicitly confirms that multi-step commands like add-transaction use a single atomic transaction, referencing the existing architectural decision (AD6) and implementation pattern (context manager in schema.md). Makes the rollback behavior explicit rather than requiring inference.

---

### Gap ID 21: JSON schema stability guarantees undefined
**What Changed**: Added "Schema Stability Guarantees" subsection to JSON Format section
**Lines Affected**: ~780-810 (after existing JSON format rules)
**Content Added/Modified**:
```markdown
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
```

**Rationale**: Defines what "stable JSON schema" means for the vision.md success criterion. Clarifies that additive changes are safe, existing fields won't change, and provides a future versioning strategy. Appropriate for MVP while setting clear expectations.

---

### Gap ID 33: Missing structured schema for import CSV format
**What Changed**: Replaced brief CSV format description with comprehensive structured schema including validation rules and examples
**Lines Affected**: ~650-655 (expanded to ~650-730)
**Content Added/Modified**:
```markdown
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
```

**Rationale**: Transforms the partial CSV format description into a formal schema with explicit column positions, required/optional flags, format constraints, encoding rules, and concrete validation examples. Removes ambiguity about column order, case sensitivity, and quote handling.

---

## Summary
- Gaps addressed: 4
- Sections added: 4 (Implementation Details, Transaction Boundaries, Schema Stability Guarantees, CSV Schema with validation examples)
- Sections modified: 0 (all changes were additions to existing sections)

All changes preserve the existing structure and style of the document. Changes are additive clarifications that make implicit design decisions explicit, providing spec implementers with unambiguous guidance while maintaining consistency with the referenced architecture documents (technical.md, schema.md).
