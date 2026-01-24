# Design Readiness Report

**App**: app5
**Run**: 1
**Date**: 2026-01-23
**Docs Path**: app5/docs

## Status: READY_FOR_SPEC

All blocking issues resolved. Ready for spec creation.

---

## Summary

| Metric | Count |
|--------|-------|
| Total Issues | 12 |
| Blocking | 2 |
| Non-Blocking | 10 |
| Fixed | 2 |

---

## Blocking Issues (Fixed)

### Issue #10: Concurrent Edit Protection Missing from Critical Operations
**Category**: feasibility
**Files**: app5/docs/systems/database/schema.md, app5/docs/systems/cli/interface.md

**Problem:**
Optimistic locking is required for edit command but not specified for merge command. The merge operation modifies the target contact, which could suffer from the same lost update problem described for edit.

**Relevant Text (from scout):**
> Schema.md describes optimistic locking: When editing a contact, read current updated_at value. Before saving, verify updated_at is unchanged. If changed, fail with conflict error. Interface.md merge behavior does not mention optimistic locking.

**Judge's Reasoning:**
> This is a data integrity issue. The spec explicitly requires optimistic locking for concurrent safety on edits, but omits it for merge which also modifies contacts. Implementing without this could cause silent data loss in concurrent scenarios. The spec needs to clarify whether merge requires optimistic locking before implementation proceeds - if yes, the implementation pattern changes.

**Fix Applied:**
Added Concurrent Safety subsection to Atomic Operations (Merge Command) section requiring optimistic locking when updating target contact during merge

---

### Issue #12: Phone Normalization Extension Handling Ambiguity
**Category**: feasibility
**Files**: app5/docs/systems/cli/interface.md

**Problem:**
Two examples contradict each other. Under the stated rule (remove all non-digit except leading +), both examples should produce the same result, but the documentation claims different outputs.

**Relevant Text (from scout):**
> Interface.md: Input 555-123-4567 ext 123 -> Normalized: 5551234567 (extension stripped). Input 555-123-4567x123 -> Normalized: 5551234567123 (x is treated as separator, digits kept). But the rule says remove all non-digit characters except leading +.

**Judge's Reasoning:**
> This is a direct contradiction in the specification. The stated algorithm says remove all non-digits, which would produce 5551234567123 for both examples. But the documentation shows different outputs for semantically similar inputs. An implementer cannot determine the correct behavior - following the algorithm produces different results than the examples. This must be resolved before implementation.

**Fix Applied:**
Updated phone normalization examples to show consistent output (5551234567123 for both); removed special ext keyword handling

---

## Non-Blocking Issues (Reported Only)

These issues were identified but do not block implementation. Consider addressing them during or after implementation.

### Issue #1: Email Validation Regex Choice Left to Implementer
**Category**: architecture
**Files**: app5/docs/systems/cli/interface.md

**Problem:**
The documentation presents two email validation options but doesn't definitively choose which one to implement. It states local-style emails "MUST be explicitly documented as a configuration option," but the vision.md lists "no configuration" as a design goal. This creates ambiguity about whether to implement configuration support or just pick the standard regex.

**Judge's Reasoning:**
> There is a clear default choice available: use the standard regex with domain validation. The "no configuration" design goal from vision.md provides sufficient guidance to resolve the ambiguity - implementers should choose the simpler standard regex without configuration support. Implementation can proceed with the sensible default.

---

### Issue #2: Phone Extension Normalization Strategy Ambiguous
**Category**: architecture
**Files**: app5/docs/systems/cli/interface.md

**Problem:**
The normalization algorithm is inconsistent: "ext 123" strips the extension (including digits), but "x123" keeps the digits after 'x'. The docs say "Remove all non-digit characters EXCEPT leading +" but then show different behavior for 'ext' vs 'x'. An implementer would need to decide whether to special-case "ext" keyword or use a simpler rule.

**Judge's Reasoning:**
> The core rule is clear: "Remove all non-digit characters EXCEPT leading +". Phone normalization is not core functionality - it's a usability convenience. Implementation variance here would not break the application or create data inconsistency issues. Implementers can proceed with the straightforward interpretation of the rule.

---

### Issue #3: vCard Empty Name Handling Placeholder Not Specified
**Category**: architecture
**Files**: app5/docs/design/technical.md

**Problem:**
While the exact placeholder string "[No Name]" is specified, there's a contradiction: the docs say empty names "should be prevented by validation" (name is required per schema and validation rules), so this case should be impossible. The docs don't clarify whether this is defensive programming for database corruption or if there's a scenario where names can actually be empty.

**Judge's Reasoning:**
> The placeholder "[No Name]" IS specified in the documentation. This is standard defensive programming practice - handling edge cases even when upstream validation should prevent them. The implementation path is clear: implement the defensive check with the specified placeholder.

---

### Issue #4: Database Permissions on Windows Not Specified
**Category**: architecture
**Files**: app5/docs/design/technical.md, app5/docs/systems/database/schema.md

**Problem:**
The docs state that Windows ACLs are "documented as a deployment consideration" but don't actually specify whether the application should: 1) Simply document the limitation in user-facing help/README, 2) Warn the user on Windows that permissions aren't enforced, 3) Attempt to verify ACLs and warn if insecure, or 4) Skip the os.open() call entirely on Windows.

**Judge's Reasoning:**
> Windows ACL handling is a deployment documentation concern, not a functional implementation concern. The application will work correctly on Windows without programmatic ACL handling. The Unix permission call still functions on Windows (mode is simply ignored). Given the tool's scope as a personal CLI utility, documenting Windows limitations in user-facing documentation is an acceptable approach.

---

### Issue #5: Path Validation Implementation Inconsistency
**Category**: feasibility
**Files**: app5/docs/systems/architecture/ARCHITECTURE-simple.md, app5/docs/design/technical.md, app5/docs/systems/cli/interface.md

**Problem:**
Interface.md contradicts architecture spec. Interface.md says to verify resolved path does not contain .. after resolution, but ARCHITECTURE-simple.md explicitly states this check was removed as redundant.

**Judge's Reasoning:**
> The architecture document provides the correct implementation. This is a documentation cleanup task - interface.md references outdated validation. Implementers can follow the architecture spec which is technically correct. The fix is simply removing one line from interface.md.

---

### Issue #6: Foreign Key Enforcement Warning vs Implementation Reality
**Category**: feasibility
**Files**: app5/docs/systems/database/schema.md

**Problem:**
If any code path opens a connection without PRAGMA foreign_keys = ON, cascading deletes will fail silently. The get_connection() context manager enforces this, but direct connections would bypass it.

**Judge's Reasoning:**
> The architecture already provides a safe pattern via get_connection() context manager. This is a code review checkpoint - adding an explicit prohibition on direct sqlite3.connect() calls strengthens the spec but the safe path already exists. Implementers following the documented patterns will be fine.

---

### Issue #7: Email Validation Regex Inconsistency
**Category**: feasibility
**Files**: app5/docs/systems/cli/interface.md

**Problem:**
Two different regex patterns presented for email validation: one requires domain dot, one allows local-style emails. The docs mention making it configurable but there is no config system defined.

**Judge's Reasoning:**
> The implementation code in the scout report uses pattern #1 (requires dot). The alternative pattern is mentioned as an option for dev environments. Implementers can proceed with the standard pattern shown in the implementation example. The scout correctly identified this as a spec cleanup task, not a blocker.

---

### Issue #8: CSV Import Conflict Resolution TOCTOU Race
**Category**: feasibility
**Files**: app5/docs/systems/cli/interface.md

**Problem:**
Time-of-Check-Time-of-Use vulnerability in import process. Between checking if email/phone exists and inserting, another process could create a duplicate, causing UNIQUE constraint violation.

**Judge's Reasoning:**
> The scout provided a clear workaround: catch IntegrityError at insert time and treat it as a conflict. This is standard practice for handling database races. The fix is straightforward and the scout explicitly notes this is not blocking - it is a documentation addition for completeness.

---

### Issue #9: Merge Operation Email Conflict Undefined Timing
**Category**: feasibility
**Files**: app5/docs/systems/cli/interface.md, app5/docs/design/technical.md

**Problem:**
Documentation does not specify WHEN to check for email conflicts during merge - before the transaction (TOCTOU risk) or during (catch constraint violation). Error handling flow is ambiguous.

**Judge's Reasoning:**
> The transaction semantics are clear (rollback on any error). The ambiguity is only about whether to pre-check or catch the constraint violation. Both approaches work correctly - one fails earlier with a friendlier message, the other is simpler. Implementers can choose either approach and meet the spec requirements.

---

### Issue #11: Import File Size Limit TOCTOU Mitigation Incomplete
**Category**: feasibility
**Files**: app5/docs/systems/cli/interface.md

**Problem:**
The provided code accumulates lines in a list, holding up to 10MB in memory. Also encodes every line to UTF-8 just to count size. Should use an iterator wrapper that counts bytes as consumed.

**Judge's Reasoning:**
> The provided code is functionally correct - it prevents the TOCTOU vulnerability and correctly enforces the size limit. The issue is memory efficiency for edge cases near the 10MB limit. This is an optimization concern, not a blocker. Implementers can use the provided pattern and optimize later if needed.

---

## Audit Trail

- Scout reports: `app5/doc_reviews/run_1/scouts/`
- Judge evaluations: `app5/doc_reviews/run_1/judge/`
- Fix summaries: `app5/doc_reviews/run_1/fixes/`
