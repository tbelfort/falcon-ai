# Architecture Feasibility Scout Report

## Status: ISSUES_FOUND

## Findings Summary

| # | Title | Affected Files |
|---|-------|----------------|
| 1 | TOCTOU Race Condition Mitigation Incomplete in Path Validation | ARCHITECTURE-simple.md, components.md, interface.md |
| 2 | Contradictory Guidance on os.O_NOFOLLOW Platform Behavior | ARCHITECTURE-simple.md |
| 3 | Inconsistent CSV Injection Prevention Rules for Minus Sign | technical.md, interface.md |
| 4 | URL Decoding Loop Could Cause Denial of Service | ARCHITECTURE-simple.md, components.md |
| 5 | Missing Implementation Guidance for Atomic File Operations | ARCHITECTURE-simple.md, components.md, interface.md |
| 6 | Budget Report Query Division by Zero Risk | schema.md, components.md |
| 7 | Parameterized Query Pattern in schema.md May Confuse Implementers | schema.md |
| 8 | CSV Import Two-Phase Validation Creates Memory Pressure | interface.md |
| 9 | No Guidance on Maximum CSV File Size | interface.md |
| 10 | Foreign Key Enforcement Pragma Not Mentioned in init_database | components.md, schema.md |

## Finding Details

#### Finding 1: TOCTOU Race Condition Mitigation Incomplete in Path Validation
**Description:** The architecture documents describe a TOCTOU mitigation strategy using `os.open()` + `os.fstat()`, but the implementation guidance is incomplete and potentially contradictory. ARCHITECTURE-simple.md (lines 247-301) describes a `safe_open_file()` function that should be called AFTER `validate_path()`, but components.md (lines 408-414) states that TOCTOU prevention is part of `validate_path()` itself. This creates confusion about where the atomic file access actually happens.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md (lines 247-301)
- falcon_test/apps/app2/docs/design/components.md (lines 408-414)
- falcon_test/apps/app2/docs/systems/cli/interface.md (line 602)

**Evidence:**
The `validate_path()` function (ARCHITECTURE-simple.md lines 186-241) performs path validation but does NOT actually open files. The docstring for `validate_path()` at line 410 in components.md claims "Path validation and file access MUST be atomic" but the function signature only returns a string path, not a file descriptor. The actual atomic file access happens in `safe_open_file()` (lines 250-300), which is a separate function. However, components.md line 112 states `get_connection()` must ensure "Path validation and database open MUST be atomic" - but there's no guidance on HOW to integrate these two functions.

**Suggested Fix:**
1. Clarify in components.md that `validate_path()` performs path validation only, while atomic file access requires calling `safe_open_file()` on the validated path.
2. Add explicit guidance that the validated path from `validate_path()` should be immediately passed to `safe_open_file()` without intervening operations.
3. Add implementation guidance for `get_connection()` showing how to integrate both functions.

#### Finding 2: Contradictory Guidance on os.O_NOFOLLOW Platform Behavior
**Description:** ARCHITECTURE-simple.md line 278-283 describes platform-specific behavior of O_NOFOLLOW and recommends checking `os.path.islink()` explicitly for cross-platform safety. However, the `safe_open_file()` function (lines 289-292) uses `os.path.islink()` before opening for read operations, which reintroduces a TOCTOU vulnerability - a symlink could be created between the `islink()` check and the `os.open()` call.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md (lines 278-292)

**Evidence:**
Line 289-292 shows:
```python
if os.path.islink(validated_path):
    raise ValidationError("Cannot read symlink directly...")
return os.open(validated_path, os.O_RDONLY)
```
This creates a TOCTOU window where a symlink substitution attack could occur between the `islink()` check and the `open()` call, defeating the entire purpose of the atomic file access pattern.

**Suggested Fix:**
Either:
1. Use O_NOFOLLOW on platforms that support it (Linux) and document that macOS/BSD cannot fully prevent symlink attacks for read operations, OR
2. Remove the `islink()` check and rely on the fact that `validate_path()` already resolved symlinks via `os.path.realpath()` - any symlink created after validation is outside the security boundary.

#### Finding 3: Inconsistent CSV Injection Prevention Rules for Minus Sign
**Description:** The CSV injection prevention guidance is inconsistent about handling minus signs. technical.md (lines 211-232) states that fields starting with `-` MUST be prefixed with a single quote, but then line 226 says "IMPORTANT - Amount Field Exception: The `amount` column contains numeric data (e.g., `-45.67`) and MUST NOT be prefixed with a single quote." This creates ambiguity: should transaction DESCRIPTIONS starting with `-` be prefixed or not?

**Affected Files:**
- falcon_test/apps/app2/docs/design/technical.md (lines 211-232)
- falcon_test/apps/app2/docs/systems/cli/interface.md (lines 795-805)

**Evidence:**
Consider a transaction description: `-15% discount applied`. According to line 214, this should be prefixed because it starts with `-`. But line 226 says numeric fields starting with `-` should NOT be prefixed. A description is not a numeric field, but the guidance doesn't clearly state whether descriptions like `-cmd` or `-15% off` should be sanitized.

**Suggested Fix:**
Clarify that:
1. TEXT fields (description, account name, category name) starting with `-` MUST be prefixed with a single quote
2. NUMERIC fields (amount, id) starting with `-` MUST NOT be prefixed
3. Add an example showing a description like `-15% discount` being sanitized to `'-15% discount` in CSV output

#### Finding 4: URL Decoding Loop Could Cause Denial of Service
**Description:** The `validate_path()` function (ARCHITECTURE-simple.md lines 208-216, components.md lines 399-407) uses an unbounded while loop to repeatedly URL-decode paths until stable. A maliciously crafted path with deeply nested URL encoding (e.g., 1000 levels of encoding) could cause the loop to run for an extremely long time, causing a denial-of-service.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md (lines 208-216)
- falcon_test/apps/app2/docs/design/components.md (lines 399-407)

**Evidence:**
```python
while True:
    new_decoded = urllib.parse.unquote(decoded_path)
    if new_decoded == decoded_path:
        break
    decoded_path = new_decoded
```
No iteration limit is specified. An attacker could provide a path like `%25%32%65%25%32%65` (which decodes to `%2e%2e`, which decodes to `..`) repeated hundreds of times.

**Suggested Fix:**
Add a maximum iteration limit (e.g., 5) to the decoding loop. After 5 iterations, raise a ValidationError stating "Path contains excessive URL encoding (possible attack)."

#### Finding 5: Missing Implementation Guidance for Atomic File Operations
**Description:** Multiple places mention that export operations should use atomic file creation (O_CREAT | O_EXCL), but there's no integration guidance showing HOW formatters.py should coordinate with the atomic file operations described in ARCHITECTURE-simple.md.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md (lines 256-257, 295-298)
- falcon_test/apps/app2/docs/design/components.md (lines 489-494)
- falcon_test/apps/app2/docs/systems/cli/interface.md (lines 587-602)

**Evidence:**
- components.md line 489 states `write_transactions_csv()` "MUST check if file exists before writing"
- interface.md line 589 states export "MUST check if output file exists"
- interface.md line 602 references "atomic file creation pattern when `--force` is not set"
- But components.md line 489 signature is `write_transactions_csv(transactions: list[Transaction], path: str, force: bool = False) -> None` - it takes a STRING path, not a file descriptor

The formatter function receives a path string, but the atomic operations require file descriptors. How should formatters.py integrate with safe_open_file()?

**Suggested Fix:**
1. Either change `write_transactions_csv()` to accept a file descriptor parameter instead of a path, OR
2. Add explicit guidance that `write_transactions_csv()` should internally call `validate_path()` then `safe_open_file()`, OR
3. Make the CLI layer responsible for opening the file and passing a file-like object to the formatter

#### Finding 6: Budget Report Query Division by Zero Risk
**Description:** The budget report query (schema.md lines 321-346) calculates percent_used, but the SQL doesn't handle division by zero when budget_cents is 0. While components.md provides a `calculate_percent_used()` function (lines 199-216) that safely handles zero budgets, the query itself could return division-by-zero if implemented naively.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/database/schema.md (lines 321-346)
- falcon_test/apps/app2/docs/design/components.md (lines 199-216)

**Evidence:**
The query at line 321-346 returns `budget_cents` and `spent_cents` but doesn't calculate `percent_used` in SQL. components.md line 196 shows `BudgetReportItem` has a `percent_used: float` field, and lines 199-216 provide a safe calculation function. However, schema.md doesn't mention this function or explain that percentage calculation should be done in Python, not SQL. An implementer might add `(spent_cents / budget_cents * 100)` directly in the SQL query, causing runtime errors.

**Suggested Fix:**
Add a note in schema.md stating: "Note: percent_used calculation is NOT performed in SQL to avoid division by zero errors. The application layer MUST calculate this using the safe calculate_percent_used() function defined in models.py."

#### Finding 7: Parameterized Query Pattern in schema.md May Confuse Implementers
**Description:** The "Search Transactions" query pattern (schema.md lines 266-293) uses a pattern like `(? IS NULL OR column = ?)` which requires passing the same parameter value twice. The pattern is explained at line 287, but the Python example showing correct parameter construction (lines 294-319) is FAR below the query definition. An implementer reading the query might not realize they need to pass doubled parameters.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/database/schema.md (lines 266-319)

**Evidence:**
Line 285 shows: `Parameters: (account_id, account_id, category_id, category_id, from_date, from_date, to_date, to_date, limit)` - but this appears AFTER the query definition and could be easily missed. Line 287 has a note, but the Python example at lines 294-319 is the only place that clearly shows HOW to construct the parameters correctly.

**Suggested Fix:**
Move the Python example immediately after the SQL query (before line 266) so implementers see both the query and the parameter construction pattern together.

#### Finding 8: CSV Import Two-Phase Validation Creates Memory Pressure
**Description:** interface.md lines 669-683 describes a two-phase import process where ALL rows are validated in-memory before any database insertion. For large CSV files (e.g., 100,000 transactions as mentioned in vision.md line 42), this could consume significant memory and potentially cause the process to be killed by the OS.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/cli/interface.md (lines 669-683)
- falcon_test/apps/app2/docs/design/vision.md (line 42)

**Evidence:**
vision.md line 42 states "All commands complete in <100ms for databases up to 100,000 transactions." A CSV with 100,000 rows would need to be fully loaded and validated in memory before any insertions occur. Assuming ~200 bytes per row (date, account name, category name, amount, description), that's ~20MB of raw data plus Python object overhead - likely 50-100MB total. While not catastrophic, this contradicts the "works fully offline" goal if the system requires significant RAM.

**Suggested Fix:**
1. Either: Add a note that import is memory-intensive and may fail for very large CSVs, OR
2. Modify the approach to use streaming validation with a rollback on error (slightly more complex but more scalable)

#### Finding 9: No Guidance on Maximum CSV File Size
**Description:** The export and import commands have no documented limits on CSV file size. interface.md lines 563-632 describe export/import but don't specify maximum file sizes, row counts, or expected memory usage. Without limits, an attacker could cause resource exhaustion by importing a maliciously large CSV file.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/cli/interface.md (lines 563-707)

**Evidence:**
There's no mention of:
- Maximum CSV file size (e.g., "must be under 50MB")
- Maximum row count (e.g., "must be under 100,000 rows")
- Streaming vs loading-all-at-once tradeoffs
This is a problem because interface.md line 669-683 describes loading ALL rows into memory for validation.

**Suggested Fix:**
Add explicit limits to interface.md:
- Import/export MUST reject CSV files larger than 50MB (configurable)
- Import/export SHOULD warn if file contains more than 50,000 rows
- Document expected memory usage for large imports

#### Finding 10: Foreign Key Enforcement Pragma Not Mentioned in init_database
**Description:** schema.md lines 508-517 (under "S5: Foreign Key Enforcement") states that `PRAGMA foreign_keys = ON` MUST be executed on EVERY connection. However, components.md line 111 defines `init_database(path: str) -> None` which "Creates database file and runs schema creation" - but doesn't mention that this function also needs to enable foreign keys when creating the schema. If foreign keys aren't enabled during schema creation, the constraints may not be properly registered.

**Affected Files:**
- falcon_test/apps/app2/docs/design/components.md (line 111)
- falcon_test/apps/app2/docs/systems/database/schema.md (lines 508-517)

**Evidence:**
schema.md line 443 shows a `get_connection()` context manager that enables foreign keys, but `init_database()` is a separate function. If `init_database()` opens its own connection (not using `get_connection()`), it might not enable foreign keys. This is a gap in the implementation guidance.

**Suggested Fix:**
Add explicit guidance in components.md that `init_database()` MUST either:
1. Use `get_connection()` internally to ensure foreign keys are enabled, OR
2. Execute `PRAGMA foreign_keys = ON` explicitly before running schema creation SQL

## Feasibility Summary
- Architecture sound: NO
- Issues found: 10

The proposed architecture is MOSTLY sound, but has several critical implementation gaps and security concerns:

**Critical Issues (Must Fix):**
- Finding 1: TOCTOU mitigation is incompletely specified
- Finding 2: Symlink check creates new TOCTOU vulnerability
- Finding 4: Unbounded URL decoding loop enables DoS attacks
- Finding 5: No clear integration between formatters and atomic file operations
- Finding 10: Foreign key enforcement might not be enabled during database creation

**High Priority (Should Fix):**
- Finding 3: Inconsistent CSV injection rules create implementation confusion
- Finding 6: Division by zero risk in budget calculations
- Finding 9: No resource limits for CSV import/export

**Medium Priority (Nice to Fix):**
- Finding 7: Query pattern explanation could be clearer
- Finding 8: Memory pressure from two-phase import

The architecture CAN work if these implementation details are clarified. The core technology choices (Python 3.10+, SQLite, argparse) are solid and compatible. However, the security-critical path validation and file handling sections need significant clarification before implementation to avoid introducing vulnerabilities.
