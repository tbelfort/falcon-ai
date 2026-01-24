# Architecture Feasibility Scout Report

## Status: READY

## Findings Summary

| # | Title | Severity | Blocking | Confidence | Affected Files |
|---|-------|----------|----------|------------|----------------|
| 1 | SQLite Thread Safety with Threading-Based Timeouts | MEDIUM | NON_BLOCKING | HIGH | ["falcon_test/apps/app1/docs/systems/database/schema.md"] |
| 2 | Windows icacls Parsing Brittleness | MEDIUM | NON_BLOCKING | HIGH | ["falcon_test/apps/app1/docs/systems/database/schema.md"] |
| 3 | FTS5 Not Enabled by Default | LOW | NON_BLOCKING | MEDIUM | ["falcon_test/apps/app1/docs/systems/database/schema.md"] |

## Finding Details

#### Finding 1: SQLite Thread Safety with Threading-Based Timeouts
**Severity:** MEDIUM
**Blocking:** NON_BLOCKING
**Confidence:** HIGH
**Description:** The architecture specifies using threading-based timeouts for query execution (schema.md lines 761-806). While the documentation claims this is thread-safe because "each query creates its own isolated thread with local variables" and "conn.interrupt() method is designed to be safely called from another thread", there is a potential issue: SQLite connections are NOT thread-safe by default. The `conn.interrupt()` call from a different thread operates on a connection object that was created in the main thread, which may cause issues depending on SQLite's compile-time threading mode. The documentation does not specify setting `check_same_thread=False` when creating connections, nor does it verify the SQLite threading mode.
**Affected Files:** ["falcon_test/apps/app1/docs/systems/database/schema.md"]
**Evidence:** Schema.md states "Each query creates its own isolated thread with local variables" but the Connection object is shared across threads (created in main thread, `conn.interrupt()` called from timer thread). SQLite has three threading modes: single-thread, multi-thread, and serialized. The default Python sqlite3 module enforces same-thread access unless `check_same_thread=False` is set.
**Suggested Fix:** Add specification for connection creation with `check_same_thread=False` when timeout functionality is needed, or verify the SQLite compile-time threading mode. Also consider using `sqlite3.threadsafety` to verify threading support at runtime. Document that `conn.interrupt()` is one of the few methods explicitly designed to be called from a different thread.

---

#### Finding 2: Windows icacls Parsing Brittleness
**Severity:** MEDIUM
**Blocking:** NON_BLOCKING
**Confidence:** HIGH
**Description:** The architecture relies on parsing icacls command output for Windows permission verification (schema.md lines 314-395). The documentation acknowledges this has "known limitations" including localized output on non-English Windows, format stability across versions, and username substring matching issues. While pywin32 is mentioned as a fallback, the implementation is marked as optional ("SHOULD attempt") rather than mandatory. This creates a security gap on non-English Windows systems or older Windows versions where icacls parsing may silently fail or produce incorrect results.
**Affected Files:** ["falcon_test/apps/app1/docs/systems/database/schema.md"]
**Evidence:** Schema.md lines 397-461 document icacls parsing limitations including "Localized output: Non-English Windows may have different output format - Fail closed on parse errors; document English locale requirement". The "fail closed" approach is good, but the specification should make pywin32 REQUIRED rather than optional for production deployments on Windows.
**Suggested Fix:** Either: (1) Make pywin32 a hard requirement for Windows deployments with clear installation instructions, or (2) Document that Windows deployments are only supported on English-locale systems, or (3) Use the Windows Security API directly via ctypes rather than subprocess+parsing for a more robust solution.

---

#### Finding 3: FTS5 Not Enabled by Default
**Severity:** LOW
**Blocking:** NON_BLOCKING
**Confidence:** MEDIUM
**Description:** The architecture documents a performance target of <100ms for name searches on 50,000 items (technical.md), but also acknowledges that substring searches using LIKE '%value%' require full table scans and "may NOT be achievable" (schema.md lines 651-663). FTS5 is recommended as the solution but is commented out and marked as optional ("RECOMMENDED for production at scale"). This creates a contradiction where the documented performance targets cannot be met without FTS5, but FTS5 is not part of the default schema.
**Affected Files:** ["falcon_test/apps/app1/docs/systems/database/schema.md"]
**Evidence:** Schema.md lines 688-706 show FTS5 virtual table commented out. Technical.md performance table shows <100ms target for name searches. Schema.md explicitly states "Performance implications: Substring search (LIKE '%Widget%'): Full scan, O(n), up to 500ms at 50K items". This is a 5x miss on the stated target.
**Suggested Fix:** Either: (1) Update the performance targets in technical.md to reflect realistic substring search times (500ms), or (2) Make FTS5 enabled by default for production deployments, or (3) Change the search implementation to use prefix-only searches (LIKE 'name%') which can use the existing index.

---

## Feasibility Summary
- Architecture sound: YES
- Critical issues: 0
- Warnings: 3

## Overall Assessment

The proposed architecture is fundamentally sound and implementable. The technology choices (Python 3.10+, SQLite, argparse) are compatible and appropriate for a single-user CLI inventory tool. The layered architecture with clear separation between CLI, commands, database, and formatters is well-designed and prevents common architectural mistakes.

**Key Strengths:**
1. Zero external dependencies using only Python standard library
2. Clear layer boundaries with automated enforcement mechanisms
3. Comprehensive security controls (S1-S3 rules) for SQL injection, path traversal, and information leakage
4. Well-documented transaction management with proper rollback semantics
5. Cross-platform support with appropriate platform-specific handling

**Minor Concerns (Non-Blocking):**
1. Threading model for query timeouts needs clarification around SQLite thread safety
2. Windows permission verification via icacls parsing has known fragility
3. Performance targets for substring searches are optimistic without FTS5

None of these concerns represent fundamental architectural flaws. They are implementable with minor specification clarifications or documented limitations.
