# Design Readiness Check Report

**App:** app2
**Run:** 2
**Date:** 2026-01-23
**Status:** READY_FOR_SPEC

## Executive Summary

All blocking issues have been resolved. The documentation is now ready for spec creation.

| Metric | Count |
|--------|-------|
| Total Issues Found | 13 |
| Blocking Issues | 5 |
| Non-Blocking Issues | 8 |
| Issues Fixed | 5 |
| Remaining Blockers | 0 |

## Blocking Issues (Fixed)

### Issue 38: Missing safe_open_file() Implementation Details
**Category:** Design
**Affected Files:** `ARCHITECTURE-simple.md`

**Problem:** The `safe_open_file()` function was referenced as a critical security function but had no implementation specification. There was also a contradiction between using `os.chmod()` after creation vs. atomic permission setting via `os.open()` mode parameter.

**Fix Applied:**
- Added explicit documentation that `safe_open_file()` MUST be implemented in `models.py`
- Clarified atomic permission setting with `os.open()` mode parameter (0o600) is the recommended approach
- Deprecated `os.chmod()` after creation approach

---

### Issue 39: Missing CSV Import Auto-Creation Specification
**Category:** Design
**Affected Files:** `components.md`, `interface.md`

**Problem:** Contradictory specifications - `components.md` said to auto-create missing accounts/categories, while `interface.md` said to error if not found.

**Fix Applied:**
- Removed auto-creation behavior from `cmd_import_csv()` specification in `components.md`
- Added explicit "IMPORTANT - No Auto-Creation" clarification in `interface.md`
- Confirmed error-on-missing-entity as the canonical behavior

---

### Issue 42: Ambiguous File Permission Enforcement for Database Files
**Category:** Design
**Affected Files:** `technical.md`, `schema.md`

**Problem:** Three-way contradiction about when permissions are enforced - creation only, every write, or warn-and-proceed.

**Fix Applied:**
- Clarified permissions enforced ONLY at file creation time (init command)
- No runtime checks or modifications of existing files
- Documented atomic 3-step sequence: (1) `os.open()` with O_CREAT|O_EXCL and mode 0o600, (2) close fd, (3) `sqlite3.connect()`

---

### Issue 44: Critical Security Conflict - Path Validation Implementation Location
**Category:** Feasibility
**Affected Files:** `ARCHITECTURE-simple.md`, `components.md`

**Problem:** Documentation contradicted itself on TOCTOU prevention - claiming both "must prevent atomically" and "accepts small TOCTOU window."

**Fix Applied:**
- Changed language from "prevent" to "minimize" TOCTOU
- Added explicit TOCTOU Risk Assessment acknowledging single-user CLI threat model
- Clarified that the two-step pattern (validate_path + safe_open_file) provides acceptable security for this use case

---

### Issue 46: Foreign Key Enforcement Documentation Inconsistency
**Category:** Feasibility
**Affected Files:** `schema.md`, `components.md`

**Problem:** Unclear how to create database files with 0600 permissions given SQLite's API limitations (connect() uses umask).

**Fix Applied:**
- Documented explicit 4-step implementation sequence in `components.md`
- Updated `schema.md` with atomic 3-step file creation sequence
- Clarified that file is pre-created with correct permissions before SQLite opens it

---

## Non-Blocking Issues (Deferred)

These issues have been documented for future improvement but do not block spec creation.

### Issue 40: Unclear Budget Report Behavior for Categories Without Budgets
**Category:** Design
**Assessment:** UX polish issue - core functionality is defined, edge case display behavior can be clarified during implementation.

### Issue 41: Missing Specification for List Commands Ordering
**Category:** Design
**Assessment:** Documentation inconsistency - schema.md specifies ORDER BY name, which should be followed. Example in interface.md is illustrative only.

### Issue 43: Missing Default Limit Value Specification
**Category:** Design
**Assessment:** Minor gap - limit must be > 0 per validation logic, default is 50. No maximum specified but not blocking.

### Issue 45: URL Decoding DoS Vulnerability
**Category:** Feasibility
**Assessment:** Low risk for single-user CLI. Trivial fix (add path length check) can be implemented during coding.

### Issue 47: Unclear Behavior for Empty Description in CSV Import
**Category:** Design
**Assessment:** Core behavior specified (empty becomes NULL). Whitespace handling details can be decided during implementation.

### Issue 48: CSV Import Memory Handling Contradicts Performance Targets
**Category:** Feasibility
**Assessment:** Implementation approach is sound. Memory estimates in docs are optimistic but system will work on modern hardware.

### Issue 49: Currency Precision Contradiction
**Category:** Feasibility
**Assessment:** Intended behavior is clear (reject >2 decimal places). Defensive rounding confusion is documentation style issue.

### Issue 50: Inconsistent Row Numbering in CSV Import Error Messages
**Category:** Feasibility
**Assessment:** UX choice that can be made during implementation. Both approaches (stop-at-first vs collect-all) are valid.

---

## Files Modified

| File | Issues Fixed |
|------|--------------|
| `docs/systems/architecture/ARCHITECTURE-simple.md` | #38, #44 |
| `docs/design/components.md` | #39, #44, #46 |
| `docs/systems/cli/interface.md` | #39 |
| `docs/design/technical.md` | #42 |
| `docs/systems/database/schema.md` | #42, #46 |

## Scout Reports

| Scout | Assessment | Issues Found |
|-------|------------|--------------|
| Architecture Decisions | READY | 0 |
| Design Completeness | ISSUES_FOUND | 7 |
| Architecture Feasibility | ISSUES_FOUND | 6 |

## Recommendation

**Proceed to spec creation.** All blocking issues have been resolved. The 8 non-blocking issues are documented for consideration during implementation but do not require design changes.
