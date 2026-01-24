# Design Completeness Scout Report

## Status: GAPS_FOUND

## Findings Summary

| # | Title | Affected Files |
|---|-------|----------------|
| 1 | `list-accounts` command missing from use cases | use-cases.md, interface.md |
| 2 | `list-categories` command missing from use cases | use-cases.md, interface.md |
| 3 | Import CSV validation phase implementation details undefined | components.md, interface.md |
| 4 | Table formatting specifics are vague | interface.md, formatters.py (components.md) |
| 5 | Success criteria not verifiable without metrics | vision.md, technical.md |
| 6 | Import CSV duplicate detection strategy undefined | use-cases.md, interface.md |
| 7 | Database file permissions enforcement undefined | technical.md, database.py (components.md) |
| 8 | CSV quote escaping details incomplete | interface.md, formatters.py (components.md) |
| 9 | Month boundary edge cases for budget reports not specified | schema.md, interface.md |
| 10 | Error recovery/rollback behavior for multi-step operations undefined | interface.md, commands.py (components.md) |
| 11 | JSON schema stability guarantees undefined | technical.md, interface.md |
| 12 | Atomic file creation flags for database init missing | database.py (components.md), ARCHITECTURE-simple.md |

## Finding Details

#### Finding 1: `list-accounts` command missing from use cases
**Description:** The vision.md and use-cases.md documents do not include a use case for listing existing accounts, yet the CLI interface defines `list-accounts` as a command. While the interface is fully specified, there's no corresponding user story or flow explaining when/why a user would list accounts.
**Affected Files:** ["falcon_test/apps/app2/docs/design/use-cases.md", "falcon_test/apps/app2/docs/systems/cli/interface.md"]
**Evidence:** interface.md lines 143-197 define `list-accounts` command with full specification. use-cases.md contains UC1-UC7 but no use case covers listing accounts. Vision.md mentions "simple commands" but doesn't enumerate listing operations.
**Suggested Fix:** Add UC8: Reviewing Accounts (user wants to see all configured accounts before adding a transaction or reviewing configuration)

#### Finding 2: `list-categories` command missing from use cases
**Description:** Similar to Finding 1, `list-categories` command exists in interface.md but has no corresponding use case. Users need to know what categories exist before recording transactions, but this flow is not documented.
**Affected Files:** ["falcon_test/apps/app2/docs/design/use-cases.md", "falcon_test/apps/app2/docs/systems/cli/interface.md"]
**Evidence:** interface.md lines 200-253 define `list-categories` command. use-cases.md doesn't include a use case for listing categories to see available options.
**Suggested Fix:** Add UC9: Reviewing Categories (user checking which categories are configured, especially for occasional users who forget category names)

#### Finding 3: Import CSV validation phase implementation details undefined
**Description:** interface.md specifies a "two-phase import approach" (validation then insert), but the exact implementation of the validation phase is ambiguous. Specifically: Does validation phase load all rows into memory? What happens if CSV is 1GB? How are duplicate accounts/categories resolved when multiple rows reference them?
**Affected Files:** ["falcon_test/apps/app2/docs/systems/cli/interface.md", "falcon_test/apps/app2/docs/design/components.md"]
**Evidence:** interface.md lines 669-683 describe two-phase approach but don't specify memory constraints or streaming vs. batch validation. components.md line 91 says `cmd_import_csv` returns int but doesn't specify validation implementation.
**Suggested Fix:** Clarify whether validation phase loads entire CSV into memory or streams with validation, and add max file size constraint or memory handling guidance.

#### Finding 4: Table formatting specifics are vague
**Description:** Multiple locations acknowledge that table formatting is "implementation-defined" (interface.md line 170), but this creates ambiguity for spec creators. The exact rules for column width calculation, padding, alignment, and truncation are not defined.
**Affected Files:** ["falcon_test/apps/app2/docs/systems/cli/interface.md", "falcon_test/apps/app2/docs/design/components.md"]
**Evidence:** interface.md line 170 says "exact spacing and padding of table columns is implementation-defined". components.md lines 481-485 list formatter functions but don't specify formatting algorithms. technical.md lines 179-185 show example output but note it's one "possible" approach.
**Suggested Fix:** Define table formatting rules: fixed-width columns based on max content width + padding, or dynamic width, alignment (left/right for text/numbers), truncation strategy for long values.

#### Finding 5: Success criteria not verifiable without metrics
**Description:** vision.md lists 4 success criteria but the design docs don't define how to measure them. "Works fully offline after initial install" is testable, but "User can go from pip install to tracking finances in under 5 minutes" requires UX metrics that aren't captured anywhere. Performance targets exist (technical.md) but no connection to success criteria.
**Affected Files:** ["falcon_test/apps/app2/docs/design/vision.md", "falcon_test/apps/app2/docs/design/technical.md"]
**Evidence:** vision.md lines 39-44 list success criteria. technical.md lines 236-245 list performance targets but don't map to success criteria #2 (5 minute onboarding) or #4 (stable JSON schema).
**Suggested Fix:** Add measurable metrics for each success criterion, or clarify which are aspirational vs. testable requirements.

#### Finding 6: Import CSV duplicate detection strategy undefined
**Description:** interface.md line 684 explicitly states "Duplicate transaction detection is not performed during import," but use-cases.md and vision.md don't explain whether this is intentional. If a user imports the same CSV twice, they'll get duplicate transactions. Is this acceptable behavior? Should there be a warning?
**Affected Files:** ["falcon_test/apps/app2/docs/systems/cli/interface.md", "falcon_test/apps/app2/docs/design/use-cases.md"]
**Evidence:** interface.md line 684 notes no duplicate detection. use-cases.md UC7 (data export) shows export workflow but doesn't cover re-import scenarios or duplicate prevention.
**Suggested Fix:** Add explicit non-goal or rationale explaining why duplicate detection is omitted (complexity, performance, or intentional for users who want to import multiple times). Or add use case for duplicate handling.

#### Finding 7: Database file permissions enforcement undefined
**Description:** technical.md line 12 says database files "should have restrictive permissions (0600)" and schema.md line 12 repeats this, but there's no specification for HOW this is enforced. Does `init` command set permissions? Does the application check permissions on open? Is this user responsibility?
**Affected Files:** ["falcon_test/apps/app2/docs/design/technical.md", "falcon_test/apps/app2/docs/systems/database/schema.md", "falcon_test/apps/app2/docs/design/components.md"]
**Evidence:** technical.md line 260 and schema.md line 12 both say "should be 0600" but use weak "should" language. components.md lines 111-112 define `init_database()` but don't specify permission setting. interface.md lines 22-59 define `init` command behavior but don't mention permissions.
**Suggested Fix:** Clarify whether permission setting is automatic (init sets 0600), manual (user responsibility), or optional (provide flag like `--secure`).

#### Finding 8: CSV quote escaping details incomplete
**Description:** interface.md mentions RFC 4180 compliance and gives examples of quote escaping (line 792), but components.md and formatters.py specification don't include escaping logic details. What about newlines within fields? What about edge cases like fields ending with backslash before quote?
**Affected Files:** ["falcon_test/apps/app2/docs/systems/cli/interface.md", "falcon_test/apps/app2/docs/design/components.md"]
**Evidence:** interface.md lines 789-793 mention RFC 4180 and show one example of quote escaping. components.md line 494 says `read_transactions_csv` exists but doesn't specify parsing edge cases. No examples of multi-line descriptions in CSV.
**Suggested Fix:** Add comprehensive CSV edge case examples: fields with newlines, fields with quotes at start/end, empty fields vs. NULL fields, fields with only whitespace.

#### Finding 9: Month boundary edge cases for budget reports not specified
**Description:** schema.md includes a `get_month_boundaries()` helper (lines 349-379) that handles December→January rollover, but interface.md doesn't specify what happens for invalid months like "2026-13" or "2026-00". The validation is mentioned (line 323) but error handling for edge cases is unclear.
**Affected Files:** ["falcon_test/apps/app2/docs/systems/database/schema.md", "falcon_test/apps/app2/docs/systems/cli/interface.md"]
**Evidence:** schema.md lines 368-369 show defense-in-depth format check but raise ValueError (not ValidationError). interface.md line 559 says validation error for "invalid month format" but doesn't specify exact messages for different invalid formats. components.md lines 306-324 specify validate_month() should reject invalid months but don't give error message format.
**Suggested Fix:** Specify exact error messages for month validation edge cases (month 00, month 13, month 1 without leading zero, year < 1000, etc.)

#### Finding 10: Error recovery/rollback behavior for multi-step operations undefined
**Description:** Several commands involve multi-step operations (e.g., add-transaction: lookup account, lookup category, insert transaction). If step 2 fails, what happens? components.md line 95 says "MUST NOT catch exceptions (let them propagate)" but doesn't clarify transaction boundaries.
**Affected Files:** ["falcon_test/apps/app2/docs/systems/cli/interface.md", "falcon_test/apps/app2/docs/design/components.md"]
**Evidence:** components.md lines 116-121 show add-transaction does multiple operations but no explicit transaction wrapping shown. schema.md lines 440-452 define get_connection() context manager with commit/rollback, but components.py specification doesn't mandate its use. AD6 (technical.md line 108) says "atomic database operations" but multi-lookup commands aren't explicitly atomic.
**Suggested Fix:** Specify which commands require explicit transaction wrapping (BEGIN/COMMIT) vs. relying on connection context manager. Clarify if lookups need to be in same transaction as inserts.

#### Finding 11: JSON schema stability guarantees undefined
**Description:** vision.md success criterion #4 says "Shell scripts can parse output reliably (stable JSON schema)" but there's no specification of what "stable" means. If we add a new field to Transaction model, does that break stability? What about field ordering?
**Affected Files:** ["falcon_test/apps/app2/docs/design/technical.md", "falcon_test/apps/app2/docs/design/vision.md", "falcon_test/apps/app2/docs/systems/cli/interface.md"]
**Evidence:** vision.md line 44 promises "stable JSON schema". technical.md lines 188-201 show JSON format but don't define versioning or stability guarantees. interface.md line 774 says "NULL values: include key with null value (not omitted)" which is good, but no general schema evolution policy.
**Suggested Fix:** Define JSON schema stability policy: additive changes allowed (new fields), no removal/renaming, field order undefined, version field to detect schema changes.

#### Finding 12: Atomic file creation flags for database init missing
**Description:** ARCHITECTURE-simple.md S2 specifies atomic file creation using O_CREAT | O_EXCL for preventing TOCTOU attacks, and components.md line 111 says init_database "MUST use atomic file creation to prevent TOCTOU attacks," but the exact flags and error handling for race conditions aren't specified in interface.md or components.md.
**Affected Files:** ["falcon_test/apps/app2/docs/design/components.md", "falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md", "falcon_test/apps/app2/docs/systems/cli/interface.md"]
**Evidence:** ARCHITECTURE-simple.md lines 252-301 define safe_open_file() with O_CREAT|O_EXCL but components.md line 111 says init_database should use atomic creation without specifying whether it uses safe_open_file() or direct os.open(). interface.md init command (lines 22-59) doesn't mention atomic creation flags or TOCTOU prevention.
**Suggested Fix:** Clarify whether init_database uses safe_open_file() helper or implements atomic creation directly. Specify error behavior if file is created by another process between check and create.

## Coverage Summary
- Features defined: 11/11 commands fully specified (init, add-account, add-category, list-accounts, list-categories, add-transaction, list-transactions, balance, set-budget, budget-report, export-csv, import-csv)
- User flows complete: 7/9 (UC1-UC7 documented, but missing list-accounts and list-categories use cases)
- Use cases addressed: 7/9 (initial setup, recording expense, recording income, checking balance, monthly budget review, transaction history review, data export; missing account/category listing flows)

## Analysis

The documentation is comprehensive and unusually detailed for a CLI tool design. Most features have corresponding designs, and the systems documentation (architecture, database schema, CLI interface, error handling) is thorough and specific.

However, there are gaps between the vision/use-case layer and the implementation specification layer:

1. **Missing use cases**: Two commands (list-accounts, list-categories) exist in the interface without corresponding user stories.
2. **Ambiguous implementation details**: Several areas use "implementation-defined" or "should" language where the spec creator would need to make decisions (table formatting, permission enforcement, validation implementation).
3. **Edge case gaps**: CSV parsing, month validation, error recovery, and duplicate handling have incomplete edge case specifications.
4. **Success criteria disconnect**: Vision promises measurable outcomes but design docs don't connect features to those metrics.
5. **Security implementation gaps**: Several security features (atomic file creation, permission setting, TOCTOU prevention) are mentioned in architecture but not fully specified in component interfaces.

These gaps don't represent missing features, but rather missing or ambiguous specifications that would force a spec creator to make assumptions or seek clarification.
