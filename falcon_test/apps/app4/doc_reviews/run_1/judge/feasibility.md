# Feasibility Judge Evaluation

## Summary

| Issue # | Title | Classification |
|---------|-------|----------------|
| 1 | File Creation Race Condition in init --force | BLOCKING |
| 2 | Timestamp Format Inconsistency | NON_BLOCKING |
| 3 | Concurrent Edit Detection Implementation Gap | NON_BLOCKING |
| 4 | Path Validation Missing URL-Decoded Check on Initial Input | NON_BLOCKING |
| 5 | Batch Operation Exit Code Logic Ambiguity | NON_BLOCKING |
| 6 | Missing Database Busy Timeout Handling in Batch Operations | NON_BLOCKING |
| 7 | CSV Injection Escaping Incomplete for Newlines | NON_BLOCKING |
| 8 | Subtask Completion Propagation Missing Transaction Isolation Level | NON_BLOCKING |

## Issue Details

### Issue 1: File Creation Race Condition in init --force

**Scout's Assessment:**
> This is a security flaw that undermines the TOCTOU protection. The implementation needs to either keep the fd open during schema initialization or use O_NOFOLLOW when opening the file in _init_schema().

**Classification:** BLOCKING

**Reasoning:**
Security vulnerability that directly contradicts security guidance elsewhere in the documentation. The TOCTOU window between closing the fd and reopening the file in _init_schema() could allow symlink attacks. This MUST be resolved before implementation to ensure secure file handling. The scout correctly identifies that schema.md shows the correct pattern but interface.md contradicts it - this inconsistency in security-critical code is a blocker.

---

### Issue 2: Timestamp Format Inconsistency

**Scout's Assessment:**
> This could lead to subtle bugs where timestamp comparisons fail or statistics queries return incorrect results. The system needs a centralized timestamp parsing function that normalizes both formats before storage, or the "MUST accept both on read" requirement should be dropped in favor of strict format enforcement.

**Classification:** NON_BLOCKING

**Reasoning:**
While this could cause subtle bugs in statistics queries, implementers can reasonably proceed by choosing a consistent format (e.g., always use +00:00 as the docs suggest). The core functionality is not blocked - this is a specification clarification that can be addressed during implementation. The documentation already provides guidance ("SHOULD output '+00:00' for consistency"), which is sufficient for implementation.

---

### Issue 3: Concurrent Edit Detection Implementation Gap

**Scout's Assessment:**
> This is a design gap rather than a fundamental flaw. The optimistic locking mechanism can work, but it needs clarification: either (1) the CLI reads the task immediately before update (no user input between read/write), making the window very small, or (2) the edit command accepts an optional --expect-updated-at parameter for scripting use cases. Without this clarification, implementers won't know how to correctly implement the feature.

**Classification:** NON_BLOCKING

**Reasoning:**
The scout correctly identifies this as a design gap rather than a fundamental flaw. The most reasonable implementation approach (CLI reads task immediately before update) is implied and workable. Implementers can proceed with the common-sense approach of reading before writing, making the optimistic lock window minimal. This is a clarification that can be documented during implementation.

---

### Issue 4: Path Validation Missing URL-Decoded Check on Initial Input

**Scout's Assessment:**
> Minor security issue. The validation should either (1) use the decoded path for all subsequent operations, or (2) reject any path containing URL-encoding characters entirely (% followed by hex digits). The current approach is inconsistent - it decodes to check for ".." but doesn't decode for the actual path operations. However, os.path.realpath() and the final boundary check (STEP 3) should catch most attacks, so this is defense-in-depth issue rather than a critical vulnerability.

**Classification:** NON_BLOCKING

**Reasoning:**
The scout correctly identifies this as a minor/defense-in-depth issue. The primary protection (os.path.realpath and boundary check in STEP 3) will catch path traversal attempts. While the inconsistency should be noted and ideally fixed, it does not block implementation since the core security mechanism remains intact.

---

### Issue 5: Batch Operation Exit Code Logic Ambiguity

**Scout's Assessment:**
> This is an implementation detail that needs clarification to ensure consistent behavior. Suggested priority: database errors (exit 2) > at least one success (exit 0) > all valid IDs not found (exit 3) > all IDs invalid format (exit 1). But without explicit ordering, different implementations could behave differently.

**Classification:** NON_BLOCKING

**Reasoning:**
This is an edge case in exit code handling that affects consistency but not core functionality. The scout provides a reasonable suggested priority order that implementers can follow. Users of the CLI will still get appropriate error messages regardless of the exit code choice. This is a documentation refinement, not a blocker.

---

### Issue 6: Missing Database Busy Timeout Handling in Batch Operations

**Scout's Assessment:**
> This is a documentation completeness issue. The system will technically work - SQLite will enforce the timeout and raise an exception. But implementers need explicit guidance on catching sqlite3.OperationalError (or more broadly, all sqlite3 exceptions) and converting to user-friendly DatabaseError with appropriate messaging. Without this, users might see raw SQLite errors violating the "Never Expose Internals" rule.

**Classification:** NON_BLOCKING

**Reasoning:**
The underlying mechanism works correctly - SQLite will handle the busy timeout. The gap is in specifying the error conversion, which is a documentation completeness issue. Implementers can reasonably infer that all sqlite3 exceptions should be converted to user-friendly errors based on the "Never Expose Internals" rule mentioned in errors.md. The principle is documented; only the specific exception type is missing.

---

### Issue 7: CSV Injection Escaping Incomplete for Newlines

**Scout's Assessment:**
> This is likely a documentation error rather than a security flaw. The real threat is field values that start with dangerous characters being interpreted as formulas. Newlines in the middle of fields are safe because they're properly CSV-encoded. The documentation should clarify that only *leading* characters are dangerous, or remove \t, \r, \n from the list entirely since they're not actually formula injection vectors (the main threats are =, +, -, @).

**Classification:** NON_BLOCKING

**Reasoning:**
The scout correctly identifies this as a documentation clarification issue, not a real security flaw. CSV properly handles embedded newlines through quoting. The only real threat is leading formula characters (=, +, -, @). The implementation will be secure; only the documentation needs cleanup to avoid confusion.

---

### Issue 8: Subtask Completion Propagation Missing Transaction Isolation Level

**Scout's Assessment:**
> This is a concurrency safety issue, though mitigated by the fact that the window is small and the documented use case is single-user. However, the documentation explicitly supports concurrent CLI invocations (technical.md lines 266-274), so this race condition could occur. The fix is to use BEGIN IMMEDIATE TRANSACTION as specified for other batch operations, but this connection isn't made in the subtask documentation.

**Classification:** NON_BLOCKING

**Reasoning:**
While this is a valid concurrency concern, the documentation already specifies BEGIN IMMEDIATE for batch operations elsewhere. An implementer following the existing patterns would naturally apply the same approach here. The single-user nature and small race window make this a minor concern that can be addressed during implementation by applying the existing documented pattern consistently.

---

## Statistics

- Total issues: 8
- Blocking: 1
- Non-blocking: 7

## Blocking Issue Summary

The single blocking issue is **Issue 1: File Creation Race Condition in init --force**. This is a security vulnerability where the documented implementation closes a file descriptor from `tempfile.mkstemp()` before calling `_init_schema()`, creating a TOCTOU window for symlink attacks. This directly contradicts secure file handling guidance in schema.md and must be resolved before implementation proceeds.

All other issues are clarifications, documentation improvements, or edge cases that implementers can reasonably work around.
