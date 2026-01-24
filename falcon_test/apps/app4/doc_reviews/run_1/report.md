# Design Readiness Report

**App**: app4
**Run**: 1
**Date**: 2026-01-23
**Docs Path**: app4/docs

## Status: READY_FOR_SPEC

All blocking issues resolved. Ready for spec creation.

---

## Summary

| Metric | Count |
|--------|-------|
| Total Issues | 18 |
| Blocking | 8 |
| Non-Blocking | 10 |
| Fixed | 8 |

---

## Blocking Issues (Fixed)

### Issue #1: File Creation Race Condition in init --force
**Category**: feasibility
**Files**: app4/docs/systems/cli/interface.md

**Problem:**
The implementation closes the file descriptor from tempfile.mkstemp() immediately, then calls _init_schema(temp_path). This creates a TOCTOU vulnerability between os.close(fd) and when _init_schema() opens the file. An attacker could replace the temp file with a symlink during this window.

**Relevant Text (from scout):**
> The implementation closes the file descriptor from tempfile.mkstemp() immediately, then calls _init_schema(temp_path). This creates a TOCTOU vulnerability between os.close(fd) and when _init_schema() opens the file. An attacker could replace the temp file with a symlink during this window, redirecting the database write to an unauthorized location.

**Judge's Reasoning:**
> Security vulnerability that directly contradicts security guidance elsewhere in the documentation. The TOCTOU window between closing the fd and reopening the file in _init_schema() could allow symlink attacks. This MUST be resolved before implementation to ensure secure file handling.

**Fix Applied:**
Updated init_database_force() example code to use os.fdopen() for proper fd handling with CRITICAL security comments.

---

### Issue #9: CLI Argument Parser Structure Unspecified
**Category**: design
**Files**: app4/docs/design/components.md, app4/docs/systems/cli/interface.md

**Problem:**
Documentation describes what the CLI should do but provides no specification for HOW to structure the argparse parser. Missing: subcommand structure, global option placement, argument parser configuration, subcommand routing pattern, and nested subcommand handling.

**Relevant Text (from scout):**
> From components.md: cli.py Purpose: Parse command-line arguments, route to command handlers. From interface.md: Global Options table shows --db, --verbose, --help, --version but no structure spec.

**Judge's Reasoning:**
> Without a clear parser structure specification, implementers would need to make design decisions about fundamental CLI architecture. This affects code organization, help output formatting, and maintainability. Different implementations would be incompatible.

**Fix Applied:**
Added comprehensive "CLI Argument Parser Structure" section with 7-step implementation guide, parser configuration code, and nested subcommand examples.

---

### Issue #10: Database Connection Error Handling Unspecified
**Category**: design
**Files**: app4/docs/systems/database/schema.md, app4/docs/systems/errors.md

**Problem:**
The documentation shows the connection context manager but does not specify how to handle specific connection failures: sqlite3.connect() failure modes, PRAGMA failure handling, SQLITE_BUSY handling after timeout, database corruption detection, and exception type mapping.

**Relevant Text (from scout):**
> From schema.md: get_connection() context manager catches Exception and re-raises. From errors.md: Error messages for database errors listed but no mapping from exception types.

**Judge's Reasoning:**
> Database connection errors are common user-facing issues (wrong path, permissions, corruption). Without clear exception handling specs, users will receive inconsistent or confusing error messages. This directly impacts user experience and debuggability.

**Fix Applied:**
Added exception mapping table (8 SQLite error types), comprehensive get_connection() error handling code, and SQLITE_BUSY/corruption detection specs to both schema.md and errors.md.

---

### Issue #12: CSV Injection Escaping Implementation Unclear
**Category**: design
**Files**: app4/docs/design/technical.md, app4/docs/design/components.md

**Problem:**
The escaping rule is specified but interaction with Python's csv module is unclear: CSV quoting interaction, double escaping risk, escaping order, empty string vs None handling, Unicode handling, and multi-line field values.

**Relevant Text (from scout):**
> From technical.md: escape_csv_field() example shows prefixing dangerous characters with single quote. From components.md: CRITICAL marking for CSV injection prevention.

**Judge's Reasoning:**
> CSV injection is marked CRITICAL in multiple places, indicating security importance. The interaction between the escaping function and Python's csv module quoting modes is genuinely ambiguous and could result in either ineffective protection (security vulnerability) or malformed CSV output. This requires clarification before implementation.

**Fix Applied:**
Added "Integration with Python csv Module" section specifying escaping order (escape first, then csv.writer), QUOTE_MINIMAL mode, all edge cases (None, empty, Unicode, multi-line), and first-character-only check rationale.

---

### Issue #13: Archived Project Enforcement Mechanism Unspecified
**Category**: design
**Files**: app4/docs/systems/cli/interface.md, app4/docs/design/components.md

**Problem:**
The business rules for archived projects are well-defined but WHERE and HOW enforcement happens is unspecified: check location for add/edit commands, done/archive exception implementation, error message content, race condition handling, and performance implications.

**Relevant Text (from scout):**
> From interface.md: Archived Project Rules section defines 4 rules with error messages. From components.md: Behavior list mentions project archive check but not implementation location.

**Judge's Reasoning:**
> The scout correctly identifies this as significant. The business rules are clear but the enforcement architecture is completely unspecified. This could lead to inconsistent implementations, potential race conditions, and bugs. Implementers need to know which layer (CLI, commands, database) is responsible for these checks.

**Fix Applied:**
Added "Archived Project Enforcement Implementation" section specifying command handler layer enforcement, implementation sequence with code, exception for done/archive commands, and race condition handling via transactions.

---

### Issue #14: Batch Operation Partial Failure Reporting Underspecified
**Category**: design
**Files**: app4/docs/systems/cli/interface.md

**Problem:**
Error handling rules exist but output format for mixed success/failure is underspecified: error message timing, output format inconsistency, multiple error type handling, stderr vs stdout, exit code determination with database errors, and transaction atomicity.

**Relevant Text (from scout):**
> From interface.md: Batch Operation Error Handling shows exit code logic and example. Output (partial) shows summary format but conflicts with individual error examples.

**Judge's Reasoning:**
> The documentation shows conflicting output formats (individual error messages vs summary line). This affects user experience significantly - users need predictable error output for scripting and debugging. Transaction atomicity ambiguity could also lead to data inconsistency issues.

**Fix Applied:**
Added "Batch Operation Output Format" section specifying: stderr for immediate individual errors, stdout for summary, transaction atomicity rules (rollback on DB error, continue on validation errors), and exit code determination.

---

### Issue #16: Symlink TOCTOU Prevention Implementation Incomplete
**Category**: design
**Files**: app4/docs/systems/architecture/ARCHITECTURE-simple.md, app4/docs/systems/cli/interface.md

**Problem:**
TOCTOU prevention approach is specified but implementation details are missing or contradictory: file descriptor to file object conversion, permission mismatch (0o600 vs 0o644), temp file cleanup on error, temp file naming approach, O_NOFOLLOW on rename target, and Windows compatibility.

**Relevant Text (from scout):**
> From ARCHITECTURE-simple.md: safe_create_file() returns file descriptor with O_NOFOLLOW. But csv.writer needs file object. From interface.md: Atomic overwrite mentions temp file but no cleanup spec.

**Judge's Reasoning:**
> TOCTOU prevention is marked CRITICAL in multiple places. The gaps identified (fd-to-file conversion, permission inconsistency, temp file cleanup, Windows compatibility) are genuine implementation blockers. An implementer could create code that fails silently on Windows or leaves orphan temp files, which are real issues for a production CLI tool.

**Fix Applied:**
Added fd_to_file() and safe_atomic_overwrite() helper functions, mode parameter for permissions, try/except cleanup pattern, and Windows compatibility section with platform detection and graceful fallback.

---

### Issue #18: Overdue Task Filter Logic Ambiguous
**Category**: design
**Files**: app4/docs/systems/cli/interface.md, app4/docs/systems/database/schema.md

**Problem:**
Overdue logic is defined in multiple places with inconsistencies: status filtering differs (status != completed vs NOT IN completed, archived), NULL due_date handling unspecified, timezone edge cases, due today vs overdue boundary, and conflicting in_progress task handling.

**Relevant Text (from scout):**
> From interface.md line 783: status != completed. From line 854: status NOT IN (completed, archived). These conflict. NULL due_date handling not specified.

**Judge's Reasoning:**
> The scout correctly identifies genuine inconsistencies in the spec - two different status filter conditions are documented. Overdue task filtering is a core feature for a task management CLI. Without resolving which specification is correct, implementers would make arbitrary choices leading to inconsistent behavior and user confusion.

**Fix Applied:**
Added "Overdue Task Filter Specification" section standardizing on `status NOT IN ('completed', 'archived')`, explicit NULL due_date exclusion, and "due today vs overdue" boundary definition. Updated all related queries for consistency.

---

## Non-Blocking Issues (Reported Only)

These issues were identified but do not block implementation. Consider addressing them during or after implementation.

### Issue #2: Timestamp Format Inconsistency
**Category**: feasibility
**Files**: app4/docs/systems/database/schema.md

**Problem:**
The documentation allows both Z suffix and +00:00 suffix for UTC timestamps but provides no specification for how to parse and normalize timestamps on read. String comparisons in statistics queries will fail if timestamps mix formats.

**Judge's Reasoning:**
> While this could cause subtle bugs in statistics queries, implementers can reasonably proceed by choosing a consistent format (e.g., always use +00:00 as the docs suggest). The core functionality is not blocked - this is a specification clarification that can be addressed during implementation.

---

### Issue #3: Concurrent Edit Detection Implementation Gap
**Category**: feasibility
**Files**: app4/docs/design/technical.md

**Problem:**
The edit command requires the original_updated_at timestamp for optimistic locking, but the CLI interface specification does not document how this timestamp is obtained or passed through the command.

**Judge's Reasoning:**
> The scout correctly identifies this as a design gap rather than a fundamental flaw. The most reasonable implementation approach (CLI reads task immediately before update) is implied and workable.

---

### Issue #4: Path Validation Missing URL-Decoded Check on Initial Input
**Category**: feasibility
**Files**: app4/docs/systems/architecture/ARCHITECTURE-simple.md

**Problem:**
The validation checks for ".." in the original path and URL-decoded version, but continues to use the original path for os.path.join operations. This inconsistency could lead to security issues.

**Judge's Reasoning:**
> The primary protection (os.path.realpath and boundary check) will catch path traversal attempts. While the inconsistency should be noted, it does not block implementation since the core security mechanism remains intact.

---

### Issue #5: Batch Operation Exit Code Logic Ambiguity
**Category**: feasibility
**Files**: app4/docs/systems/cli/interface.md

**Problem:**
The exit code logic for batch operations creates ambiguity when there is a mix of validation errors and not-found errors with zero successes.

**Judge's Reasoning:**
> This is an edge case in exit code handling that affects consistency but not core functionality. Users of the CLI will still get appropriate error messages regardless of the exit code choice.

---

### Issue #6: Missing Database Busy Timeout Handling in Batch Operations
**Category**: feasibility
**Files**: app4/docs/systems/cli/interface.md, app4/docs/systems/database/schema.md

**Problem:**
The documentation states that BEGIN IMMEDIATE will wait for the busy_timeout period then fail, but does not specify whether sqlite3.OperationalError should be caught and converted to a user-friendly DatabaseError.

**Judge's Reasoning:**
> The underlying mechanism works correctly - SQLite will handle the busy timeout. The gap is in specifying the error conversion, which is a documentation completeness issue.

---

### Issue #7: CSV Injection Escaping Incomplete for Newlines
**Category**: feasibility
**Files**: app4/docs/design/technical.md

**Problem:**
The CSV escaping function only checks the first character for dangerous characters. Newlines in the middle of fields are not handled.

**Judge's Reasoning:**
> CSV properly handles embedded newlines through quoting. The only real threat is leading formula characters. The implementation will be secure; only the documentation needs cleanup.

---

### Issue #8: Subtask Completion Propagation Missing Transaction Isolation Level
**Category**: feasibility
**Files**: app4/docs/design/technical.md

**Problem:**
The documentation says subtask completion with --force MUST be atomic but does not specify the transaction isolation level.

**Judge's Reasoning:**
> The documentation already specifies BEGIN IMMEDIATE for batch operations elsewhere. An implementer following the existing patterns would naturally apply the same approach here.

---

### Issue #11: Task ID Validation Implementation Ambiguity
**Category**: design
**Files**: app4/docs/systems/cli/interface.md, app4/docs/design/components.md

**Problem:**
The validation logic is provided but edge cases are ambiguous: whitespace handling, plus sign handling, scientific notation, hex/octal formats, integer overflow.

**Judge's Reasoning:**
> The core validation logic is well-specified. Edge cases are unlikely in normal usage and would fail gracefully. Implementers can reasonably proceed.

---

### Issue #15: Project Name Case Sensitivity Not Consistently Specified
**Category**: design
**Files**: app4/docs/systems/database/schema.md, app4/docs/systems/cli/interface.md

**Problem:**
Case sensitivity is specified for project lookups but not consistently applied across all operations.

**Judge's Reasoning:**
> The core behavior (case-sensitive project names) is clearly stated. Users can proceed with implementation using exact match.

---

### Issue #17: Timestamp Format Inconsistency Between Spec and Examples
**Category**: design
**Files**: app4/docs/systems/database/schema.md, app4/docs/systems/cli/interface.md

**Problem:**
Both Z and +00:00 formats are specified as acceptable but implementation guidance conflicts.

**Judge's Reasoning:**
> The spec clearly states implementations SHOULD output +00:00 and MUST accept both on read. Python's datetime.fromisoformat() handles both formats natively.

---

## Audit Trail

- Scout reports: `app4/doc_reviews/run_1/scouts/`
- Judge evaluations: `app4/doc_reviews/run_1/judge/`
- Fix summaries: `app4/doc_reviews/run_1/fixes/`
