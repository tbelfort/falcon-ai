# Feasibility Judge Evaluation

## Summary

| Issue # | Title | Classification |
|---------|-------|----------------|
| 1 | Path Validation Implementation Inconsistency | NON_BLOCKING |
| 2 | Foreign Key Enforcement Warning vs Implementation Reality | NON_BLOCKING |
| 3 | Email Validation Regex Inconsistency | NON_BLOCKING |
| 4 | CSV Import Conflict Resolution TOCTOU Race | NON_BLOCKING |
| 5 | Merge Operation Email Conflict Undefined Timing | NON_BLOCKING |
| 6 | Concurrent Edit Protection Missing from Critical Operations | BLOCKING |
| 7 | Import File Size Limit TOCTOU Mitigation Incomplete | NON_BLOCKING |
| 8 | Phone Normalization Extension Handling Ambiguity | BLOCKING |

---

## Issue Details

### Issue 1: Path Validation Implementation Inconsistency

**Scout's Assessment:**
> This is a documentation inconsistency rather than a fundamental flaw. The architecture is sound - the realpath() + containment check is the correct approach. Interface.md needs to be updated to remove the outdated ".." check requirement.

**Classification:** NON_BLOCKING

**Reasoning:**
The architecture document provides the correct implementation. This is a documentation cleanup task - interface.md references outdated validation. Implementers can follow the architecture spec which is technically correct. The fix is simply removing one line from interface.md.

---

### Issue 2: Foreign Key Enforcement Warning vs Implementation Reality

**Scout's Assessment:**
> This is a minor architectural weakness but not a blocking flaw. The documentation should add an explicit rule: "ALL database connections MUST use the get_connection() context manager. Direct use of sqlite3.connect() is forbidden." This turns a runtime risk into a code review checkpoint.

**Classification:** NON_BLOCKING

**Reasoning:**
The architecture already provides a safe pattern via get_connection() context manager. This is a code review checkpoint - adding an explicit prohibition on direct sqlite3.connect() calls strengthens the spec but the safe path already exists. Implementers following the documented patterns will be fine.

---

### Issue 3: Email Validation Regex Inconsistency

**Scout's Assessment:**
> This is a specification ambiguity rather than a technical impossibility. The implementation can work either way, but the spec needs to pick one. Given the vision.md describes this as a "professional contact manager" for "boutique consulting firm" users, local-style emails are unlikely to be needed. The spec should commit to requiring dots in domain names (pattern #1) and remove the configuration option mention since there's no config system.

**Classification:** NON_BLOCKING

**Reasoning:**
The implementation code in the scout report uses pattern #1 (requires dot). The alternative pattern is mentioned as an option for dev environments. Implementers can proceed with the standard pattern shown in the implementation example. The scout correctly identified this as a spec cleanup task, not a blocker.

---

### Issue 4: CSV Import Conflict Resolution TOCTOU Race

**Scout's Assessment:**
> This is a real race condition but can be worked around. The implementation should:
> 1. Wrap each contact insert in a try/except
> 2. Catch sqlite3.IntegrityError for UNIQUE violations
> 3. Re-check the conflict and apply the appropriate strategy (skip/overwrite/merge)
> 4. Wrap the entire import in a transaction for atomicity
>
> The documentation should add this to the import-csv behavior section: "UNIQUE constraint violations during insert are caught and treated as conflicts, applying the selected conflict resolution strategy."

**Classification:** NON_BLOCKING

**Reasoning:**
The scout provided a clear workaround: catch IntegrityError at insert time and treat it as a conflict. This is standard practice for handling database races. The fix is straightforward and the scout explicitly notes this is not blocking - it is a documentation addition for completeness.

---

### Issue 5: Merge Operation Email Conflict Undefined Timing

**Scout's Assessment:**
> This is a specification gap rather than a technical impossibility. The merge will work, but the error handling path is ambiguous. The spec should clarify: "Email uniqueness is enforced by the database UNIQUE constraint. If the merge UPDATE would violate the constraint, catch sqlite3.IntegrityError, identify it as an email duplicate, rollback the transaction, and exit with code 4."

**Classification:** NON_BLOCKING

**Reasoning:**
The transaction semantics are clear (rollback on any error). The ambiguity is only about whether to pre-check or catch the constraint violation. Both approaches work correctly - one fails earlier with a friendlier message, the other is simpler. Implementers can choose either approach and meet the spec requirements.

---

### Issue 6: Concurrent Edit Protection Missing from Critical Operations

**Scout's Assessment:**
> This is a consistency issue in the specification. If the system supports concurrent access (which the optimistic locking design implies), then ALL contact modifications need the same protection, including merge. The merge behavior section should add: "4a. When updating target contact, use optimistic locking with the updated_at value read in step 1."

**Classification:** BLOCKING

**Reasoning:**
This is a data integrity issue. The spec explicitly requires optimistic locking for concurrent safety on edits, but omits it for merge which also modifies contacts. Implementing without this could cause silent data loss in concurrent scenarios. The spec needs to clarify whether merge requires optimistic locking before implementation proceeds - if yes, the implementation pattern changes significantly.

---

### Issue 7: Import File Size Limit TOCTOU Mitigation Incomplete

**Scout's Assessment:**
> This is a performance and memory efficiency issue, not a fundamental flaw. The import will work but will be slow and memory-hungry for large files. The spec should revise the implementation pattern to use an iterator wrapper instead of accumulating lines in a list.

**Classification:** NON_BLOCKING

**Reasoning:**
The provided code is functionally correct - it prevents the TOCTOU vulnerability and correctly enforces the size limit. The issue is memory efficiency for edge cases near the 10MB limit. This is an optimization concern, not a blocker. Implementers can use the provided pattern and optimize later if needed.

---

### Issue 8: Phone Normalization Extension Handling Ambiguity

**Scout's Assessment:**
> This is a specification error that will confuse implementers. The normalization algorithm needs to be clarified:
>
> Option A: Simple rule - strip all non-digits except leading +. Extensions are included in normalized form (both examples produce `5551234567123`).
>
> Option B: Complex rule - recognize extension keywords (ext, extension, x) and strip everything after them.
>
> Option A is simpler and aligns with the stated rule. The documentation should commit to this and update the examples to match, or explicitly define extension keyword handling if that's desired.

**Classification:** BLOCKING

**Reasoning:**
This is a direct contradiction in the specification. The stated algorithm says "remove all non-digit characters EXCEPT leading +" which would produce `5551234567123` for both examples. But the documentation shows different outputs for semantically similar inputs (`555-123-4567 ext 123` -> `5551234567` vs `555-123-4567x123` -> `5551234567123`). An implementer cannot determine the correct behavior - following the algorithm produces different results than the examples. This must be resolved before implementation.

---

## Statistics

- **Total issues:** 8
- **Blocking:** 2
- **Non-blocking:** 6
