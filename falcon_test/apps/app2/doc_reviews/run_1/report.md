# Design Readiness Report

**App**: falcon_test/apps/app2
**Run**: 1
**Date**: 2026-01-23
**Docs Path**: falcon_test/apps/app2/docs

## Status: NEEDS_HUMAN_REVIEW

Human review required. There are 20 dismissed findings that need confirmation to ensure no real issues were missed.

---

## Pipeline Summary

| Stage | Count |
|-------|-------|
| Scout Findings | 37 |
| Judge Confirmed | 17 |
| Judge Dismissed | 20 |
| Blocking Issues | 4 |
| Fixes Verified | 17 |
| Fixes Partial | 0 |
| Fixes Rejected | 0 |
| **Escalated (3+ failures)** | 0 |

---

## Findings by Category

| Category | Found | Confirmed | Dismissed | Fixed | Verified |
|----------|-------|-----------|-----------|-------|----------|
| Design | 12 | 6 | 6 | 6 | 6 |
| Architecture | 0 | 0 | 0 | 0 | 0 |
| Feasibility | 10 | 8 | 2 | 8 | 8 |
| API/Schema | 15 | 3 | 12 | 3 | 3 |

---

## All Fixed Issues (Detailed)

### BLOCKING Issues (4)

---

#### Gap #1: TOCTOU Race Condition Mitigation Incomplete in Path Validation
**Severity**: HIGH | BLOCKING
**Scout**: Architecture Feasibility Scout
**Files Affected**: ARCHITECTURE-simple.md, components.md

**Problem:**
The architecture documents describe a TOCTOU mitigation strategy using os.open() + os.fstat(), but the implementation guidance is incomplete about where atomic file access actually happens. validate_path() returns a string path, not a file descriptor, while safe_open_file() is separately defined. There is no explicit guidance on how these functions should be coordinated.

**What Was Fixed:**
Added explicit coordination pattern showing the required calling sequence: validate_path() -> safe_open_file() -> use fd. Added security rationale explaining why callers MUST immediately pass the validated path to safe_open_file() and use the resulting fd for all operations.

---

#### Gap #4: URL Decoding Loop Could Cause Denial of Service
**Severity**: HIGH | BLOCKING
**Scout**: Architecture Feasibility Scout
**Files Affected**: ARCHITECTURE-simple.md, components.md

**Problem:**
ARCHITECTURE-simple.md shows an unbounded while loop for URL decoding with no iteration limit. While decoding typically converges quickly, a maliciously crafted input with many encoding layers could cause excessive iterations.

**What Was Fixed:**
Replaced unbounded while True loop with bounded for loop (max 10 iterations). Added ValidationError when iteration limit exceeded to prevent denial-of-service attacks.

---

#### Gap #5: Missing Implementation Guidance for Atomic File Operations in Formatters
**Severity**: HIGH | BLOCKING
**Scout**: Architecture Feasibility Scout
**Files Affected**: ARCHITECTURE-simple.md, components.md, interface.md

**Problem:**
Disconnect between atomic file operation guidance (using os.open with O_CREAT | O_EXCL returning file descriptor) and formatter functions which take string paths. components.md shows write_transactions_csv(path: str), but safe_open_file() returns int fd. No explicit guidance on how to connect these.

**What Was Fixed:**
Changed formatter function signature from accepting path: str to file_obj: io.TextIOWrapper. Added comprehensive documentation explaining that the CLI layer is responsible for atomic file creation using os.open() with O_CREAT | O_EXCL flags, then wrapping the fd with os.fdopen() before passing to formatters.

---

#### Gap #10: Foreign Key Enforcement Pragma Not Mentioned in init_database
**Severity**: HIGH | BLOCKING
**Scout**: Architecture Feasibility Scout
**Files Affected**: components.md, schema.md

**Problem:**
components.md defines init_database() but does not mention foreign key enforcement. schema.md states PRAGMA foreign_keys = ON MUST be on every connection. No guidance that init_database() should use get_connection() or enable foreign keys itself.

**What Was Fixed:**
Added CRITICAL annotations to both init_database() and get_connection() establishing the chain of responsibility. init_database() MUST use get_connection() internally, and get_connection() MUST execute PRAGMA foreign_keys = ON immediately after opening, before yielding to caller.

---

### NON_BLOCKING Issues - MEDIUM Severity (6)

---

#### Gap #2: Symlink Check in safe_open_file Creates TOCTOU Window
**Severity**: MEDIUM | NON_BLOCKING
**Scout**: Architecture Feasibility Scout
**Files Affected**: ARCHITECTURE-simple.md

**Problem:**
The safe_open_file() function uses os.path.islink() before opening for read operations, which theoretically creates a TOCTOU window.

**What Was Fixed:**
Added explicit note clarifying that islink() is defense-in-depth, NOT the primary security mechanism. Documented that the primary defense is realpath() resolution in validate_path().

---

#### Gap #9: No Explicit CSV File Size Limits Documented
**Severity**: MEDIUM | NON_BLOCKING
**Scout**: Architecture Feasibility Scout
**Files Affected**: interface.md

**Problem:**
No explicit file size limits documented for CSV import/export.

**What Was Fixed:**
Added explicit file size recommendations: maximum 100MB or 100,000 rows for both import and export. Documented memory implications and best practices for handling larger datasets.

---

#### Gap #13: Import CSV validation phase implementation details undefined
**Severity**: MEDIUM | NON_BLOCKING
**Scout**: Design Completeness Scout
**Files Affected**: interface.md, components.md

**Problem:**
interface.md specifies a two-phase import approach (validation then insert), but the exact implementation of the validation phase is ambiguous.

**What Was Fixed:**
Added detailed Implementation Details subsection explaining in-memory validation approach with file size limits and duplicate resolution strategy.

---

#### Gap #17: Database file permissions enforcement undefined
**Severity**: MEDIUM | NON_BLOCKING
**Scout**: Design Completeness Scout
**Files Affected**: technical.md, schema.md, components.md

**Problem:**
technical.md says database files should have restrictive permissions (0600) but there is no specification for HOW this is enforced.

**What Was Fixed:**
Added explicit guidance that safe_open_file() automatically sets mode 0o600. Clarified that init_database() uses safe_open_file() to guarantee correct permissions.

---

#### Gap #20: Error recovery/rollback behavior for multi-step operations undefined
**Severity**: MEDIUM | NON_BLOCKING
**Scout**: Design Completeness Scout
**Files Affected**: interface.md, components.md

**Problem:**
Several commands involve multi-step operations. If step 2 fails, what happens?

**What Was Fixed:**
Added "Transaction Boundaries" explanation to add-transaction command explicitly stating all steps execute in a single atomic transaction with automatic rollback on failure.

---

#### Gap #33: Missing structured schema for import CSV format
**Severity**: MEDIUM | NON_BLOCKING
**Scout**: API/Schema Coverage Scout
**Files Affected**: interface.md

**Problem:**
CSV import format partially specified without formal schema.

**What Was Fixed:**
Added formal CSV schema specification with detailed column specifications table, format rules, and validation examples.

---

#### Gap #36: Budget report calculation logic not expressed as schema
**Severity**: MEDIUM | NON_BLOCKING
**Scout**: API/Schema Coverage Scout
**Files Affected**: components.md, schema.md

**Problem:**
BudgetReportItem dataclass exists but calculation formulas and edge cases not in formal schema.

**What Was Fixed:**
Added consolidated "Budget Report Calculation Specification" section documenting all calculation formulas and edge case handling.

---

### NON_BLOCKING Issues - LOW Severity (5)

---

#### Gap #7: Parameterized Query Pattern Documentation Could Be Clearer
**Severity**: LOW | NON_BLOCKING
**Scout**: Architecture Feasibility Scout
**Files Affected**: schema.md

**Problem:**
The Python example is separated from the query definition.

**What Was Fixed:**
Added concise inline note bridging the query definition and Python example, explaining the doubled parameter pattern.

---

#### Gap #8: CSV Import Two-Phase Validation Memory Considerations
**Severity**: LOW | NON_BLOCKING
**Scout**: Architecture Feasibility Scout
**Files Affected**: interface.md, vision.md

**Problem:**
Two-phase validation memory implications not documented as intentional design choice.

**What Was Fixed:**
Documented that in-memory validation is an intentional design choice prioritizing atomicity over memory efficiency.

---

#### Gap #11: list-accounts command missing from use cases
**Severity**: LOW | NON_BLOCKING
**Scout**: Design Completeness Scout
**Files Affected**: use-cases.md, interface.md

**Problem:**
The list-accounts command has no corresponding use case.

**What Was Fixed:**
Added UC2 "Viewing Available Accounts" with actor definition, command flow, success criteria, and failure modes.

---

#### Gap #12: list-categories command missing from use cases
**Severity**: LOW | NON_BLOCKING
**Scout**: Design Completeness Scout
**Files Affected**: use-cases.md, interface.md

**Problem:**
The list-categories command has no corresponding use case.

**What Was Fixed:**
Added UC3 "Viewing Available Categories" documenting the workflow for checking available categories.

---

#### Gap #21: JSON schema stability guarantees undefined
**Severity**: LOW | NON_BLOCKING
**Scout**: Design Completeness Scout
**Files Affected**: technical.md, vision.md, interface.md

**Problem:**
vision.md says "stable JSON schema" but doesn't define what stable means.

**What Was Fixed:**
Added schema stability guarantees defining: fields maintain names/types within major versions, new optional fields may be added, breaking changes require major version bumps.

---

#### Gap #34: Database schema lacks CHECK constraints for field validation
**Severity**: LOW | NON_BLOCKING
**Scout**: API/Schema Coverage Scout
**Files Affected**: schema.md

**Problem:**
Many validation rules enforced only at application layer.

**What Was Fixed:**
Added clarification notes explaining why string length validation is application-layer only (SQLite limitation) and that this is intentional.

---

## HUMAN REVIEW: Dismissed Gaps

These gaps were dismissed by the judge. Review the reasoning to confirm these are not real issues.

### Design Category Dismissals (6)

1. **Table formatting specifics are vague** - Intentionally implementation-defined per interface.md
2. **Success criteria not verifiable without metrics** - Vision statements, not implementation specs
3. **Import CSV duplicate detection strategy undefined** - Explicitly documented behavior
4. **CSV quote escaping details incomplete** - RFC 4180 reference is sufficient
5. **Month boundary edge cases not specified** - validate_month() is fully specified
6. **Atomic file creation flags missing** - ARCHITECTURE-simple.md provides complete guidance

### Feasibility Category Dismissals (2)

1. **CSV Injection Prevention Rules inconsistent** - Documentation is clear about text vs numeric field handling
2. **Budget Report Division by Zero Risk** - Calculation intentionally delegated to application layer with safe function

### API/Schema Category Dismissals (12)

All 12 dismissals relate to REST API features (endpoints, HTTP methods, authentication, rate limiting, JSON Schema, OpenAPI specs) that are explicitly out of scope per vision.md Non-Goals section. This is a CLI-only tool with no REST API by design.

**Your Action**: Confirm dismissals are correct OR re-flag specific items for fixing

---

## Cost Summary

| Phase | Model | Est. Cost |
|-------|-------|-----------|
| Scout | sonnet | $0.80 |
| Judge | opus | $3.00 |
| Fix | sonnet | $1.20 |
| Review | opus | $0.60 |
| Fix (feasibility) | sonnet | $0.80 |
| Review (feasibility) | opus | $0.60 |
| **Total** | | **$7.00** |

---

## Audit Trail

- Scout reports: `falcon_test/apps/app2/doc_reviews/run_1/scouts/`
- Judge evaluations: `falcon_test/apps/app2/doc_reviews/run_1/judge/`
- Fix summaries: `falcon_test/apps/app2/doc_reviews/run_1/fixes/`
- Review verification: `falcon_test/apps/app2/doc_reviews/run_1/review/verification.md`
- Review verification (feasibility): `falcon_test/apps/app2/doc_reviews/run_1/review/verification_feasibility.md`
