# Architecture Feasibility Scout Report

## Status: ISSUES_FOUND

## Findings Summary

| # | Title | Affected Files |
|---|-------|----------------|
| 1 | In-memory rate limiting ineffective for CLI process model | technical.md |
| 2 | Search pagination claims conflict with LIMIT implementation | technical.md, cli/interface.md |
| 3 | Retry budget tracking relies on per-process state | errors.md |
| 4 | Circuit breaker pattern incompatible with CLI invocation model | errors.md |
| 5 | icacls parsing fragility on non-English Windows | schema.md |
| 6 | SQLite busy timeout math doesn't match stated behavior | errors.md |
| 7 | Security review script uses unvalidated random SKU | cli/interface.md |
| 8 | Concurrent transaction serialization example shows wrong final quantity | technical.md |
| 9 | Windows permission verification requires pywin32 but not listed as dependency | schema.md |
| 10 | FTS5 referenced but not implemented in schema | technical.md |

## Finding Details

#### Finding 1: In-memory rate limiting ineffective for CLI process model
**Description:** The `SearchRateLimiter` class uses in-memory state that resets with each CLI invocation. For a CLI tool where each command is a separate process, this provides no protection against rapid-fire searches.

**Affected Files:**
- "falcon_test/apps/app1/docs/design/technical.md" (lines 406-500)

**Evidence:** The document includes a `SearchRateLimiter` class with warning text stating "WARNING: This in-memory implementation is ONLY effective for long-running processes" (line 456), but then shows usage pattern for CLI commands (lines 491-500) which contradicts the warning. The document acknowledges the limitation but still shows implementation that won't work for the stated use case.

**Suggested Fix:**
1. Remove the in-memory `SearchRateLimiter` class entirely, OR
2. Implement SQLite-based rate limiting as shown in lines 413-438, OR
3. Remove all rate limiting claims from documentation if not implementing persistent tracking

---

#### Finding 2: Search pagination claims conflict with LIMIT implementation
**Description:** The performance targets table (technical.md, lines 366-374) states that search operations are "paginated" with "limit=100 default, max=1000". However, the CLI interface specification doesn't show any `--limit` or `--offset` flags for the search command.

**Affected Files:**
- "falcon_test/apps/app1/docs/design/technical.md" (lines 366-374)
- "falcon_test/apps/app1/docs/systems/cli/interface.md" (search command specification)

**Evidence:** Technical.md line 372 states "search (by SKU) | <100ms | 50,000 items | **Yes (limit=100 default, max=1000)**" but cli/interface.md doesn't show `--limit` or `--offset` parameters for the search command. Users have no way to paginate results.

**Suggested Fix:**
1. Add `--limit` and `--offset` flags to search command specification in cli/interface.md, OR
2. Remove pagination claims from performance targets and note that all results are returned

---

#### Finding 3: Retry budget tracking relies on per-process state
**Description:** The `ProcessRetryBudget` class (errors.md, lines 526-596) uses in-memory deque for sliding window tracking. Like the rate limiter, this provides no cross-invocation protection for CLI usage.

**Affected Files:**
- "falcon_test/apps/app1/docs/systems/errors.md" (lines 526-596)

**Evidence:** Lines 509-523 explicitly document this limitation: "The `ProcessRetryBudget` implementation below uses in-memory state that resets with each CLI invocation." However, the security warning at line 492 states "An attacker who can trigger database lock contention...can cause legitimate operations to: Consume 5x resources per operation" which implies protection that doesn't exist for CLI invocations.

**Suggested Fix:**
1. Clarify that retry budget only protects within a single long-running operation (like batch import with 100 items), OR
2. Implement persistent retry tracking as suggested in lines 516-523, OR
3. Remove security claims about DoS protection via retry budgets

---

#### Finding 4: Circuit breaker pattern incompatible with CLI invocation model
**Description:** The `DatabaseCircuitBreaker` class (errors.md, lines 598-676) maintains circuit state in memory. For CLI commands, the circuit state resets on every invocation, making it ineffective.

**Affected Files:**
- "falcon_test/apps/app1/docs/systems/errors.md" (lines 598-676)

**Evidence:** Lines 653-655 show a singleton instance `_circuit_breaker = DatabaseCircuitBreaker()` but this singleton is recreated on every CLI process. After 10 failures, the circuit opens - but only for that one process. The next CLI invocation gets a fresh circuit breaker that allows another 10 failures.

**Suggested Fix:**
1. Remove circuit breaker pattern entirely for CLI usage, OR
2. Implement file-based circuit state (e.g., `.circuit_state` file with timestamps), OR
3. Document that circuit breaker only applies to batch operations within a single invocation

---

#### Finding 5: icacls parsing fragility on non-English Windows
**Description:** The Windows permission verification function (schema.md, lines 314-395) parses icacls text output. The documentation warns about "Localized output" (line 403) but doesn't fail-closed on non-English Windows.

**Affected Files:**
- "falcon_test/apps/app1/docs/systems/database/schema.md" (lines 314-395, table at 399-407)

**Evidence:** Line 404 states "Localized output | Non-English Windows may have different output format | Fail closed on parse errors; document English locale requirement" but the implementation at lines 350-378 doesn't detect locale or verify that icacls output is in English before parsing. An attacker on German Windows could exploit parsing failures.

**Suggested Fix:**
1. Add locale detection: Check `LANG` or `LC_ALL` environment variable and require English, OR
2. Use pywin32 library as primary implementation and make icacls the fallback only, OR
3. Add explicit warning in vision.md that Windows deployments require English locale for security

---

#### Finding 6: SQLite busy timeout math doesn't match stated behavior
**Description:** Error message states "Database is busy after 30 seconds (5 retry attempts exhausted)" (errors.md, line 989) but the retry strategy (lines 478-491) shows delays of 100ms, 200ms, 400ms, 800ms, 1600ms which total only ~3.1 seconds, not 30 seconds.

**Affected Files:**
- "falcon_test/apps/app1/docs/systems/errors.md" (lines 989, 478-491, 1019)

**Evidence:** Line 1019 states "The 30-second timeout uses SQLite's `busy_timeout` (25s) plus application-level retry (~5s)" but the exponential backoff table at lines 485-490 shows total application retry time of ~3.1 seconds (100+200+400+800+1600). Math doesn't add up to "~5s" claimed.

**Suggested Fix:**
1. Fix retry delay calculation to actually sum to ~5 seconds (may need different initial delay or more attempts), OR
2. Update error message to reflect actual timeout (e.g., "after 28 seconds" if SQLite timeout is 25s + 3.1s retry), OR
3. Document the discrepancy and explain that timeout is approximate

---

#### Finding 7: Security review script uses unvalidated random SKU
**Description:** The deployment health check script (cli/interface.md, lines 479-480) generates a random SKU using `head -c 8 /dev/urandom | xxd -p` but doesn't validate that the generated string meets SKU format requirements (alphanumeric/hyphen/underscore only).

**Affected Files:**
- "falcon_test/apps/app1/docs/systems/cli/interface.md" (lines 447-491)

**Evidence:** Line 479 shows `RANDOM_SKU="__hc_$(head -c 8 /dev/urandom | xxd -p 2>/dev/null || date +%s)__"`. The `xxd -p` output is hexadecimal (0-9a-f) which is valid, but the fallback `date +%s` produces numeric timestamps which are valid SKUs. However, this assumes SKU validation allows underscores at start/end. If SKU validation rejects leading underscores, this health check will fail.

**Suggested Fix:**
1. Validate that the generated SKU format matches SKU rules defined in models.py validation, OR
2. Use a known-valid SKU format: `HC$(date +%s%N | sha256sum | head -c 8)` (alphanumeric only), OR
3. Document SKU format requirements for health check scripts

---

#### Finding 8: Concurrent transaction serialization example shows wrong final quantity
**Description:** The serialization example in technical.md (lines 266-293) shows Process A updating quantity from 10 to 2 (removed 8), then Process B reading 2 and updating to 0 (removed 2). But Process B supposedly started with intent to remove items before Process A committed. The final quantity should reflect what both processes intended to remove from the original state.

**Affected Files:**
- "falcon_test/apps/app1/docs/design/technical.md" (lines 266-293)

**Evidence:** The table shows:
- T2: Process A reads qty=10
- T3: Process A updates qty=2 (implies removed 8)
- T5: Process B reads qty=2 (after A commits)
- T6: Process B updates qty=0 (implies removed 2)

This is a "read-after-write" scenario which is correct behavior for `BEGIN IMMEDIATE`, but doesn't demonstrate the "lost update" problem that `BEGIN IMMEDIATE` is supposed to prevent. A lost update would be if both processes read 10, both try to set to 8, and one update is overwritten. This example doesn't show that failure mode.

**Suggested Fix:**
1. Revise the example to show both processes intending to remove 5 items each, demonstrating that without serialization, you'd lose one update (end with qty=5 instead of qty=0), OR
2. Add a second example showing the "lost update" scenario that `BEGIN IMMEDIATE` prevents, OR
3. Clarify that this example demonstrates correct serialization behavior, not a prevented failure

---

#### Finding 9: Windows permission verification requires pywin32 but not listed as dependency
**Description:** Schema.md states that pywin32 (>=305) is "a hard dependency for Windows deployments handling sensitive data" (line 411) but the installation instructions don't show pywin32 in requirements.

**Affected Files:**
- "falcon_test/apps/app1/docs/systems/database/schema.md" (lines 409-466)
- "falcon_test/apps/app1/docs/design/technical.md" (lines 13-33, dependency section)

**Evidence:** Line 411 states "pywin32 (>=305) is a hard dependency for Windows deployments handling sensitive data (pricing, supplier information, proprietary SKUs as defined in the Data Classification table)." But technical.md line 13 shows "**Constraint**: Standard library only. No pip dependencies." This is a direct contradiction.

**Suggested Fix:**
1. Add pywin32 as optional dependency for Windows installations: `pip install warehouse-cli[windows]`, OR
2. Downgrade pywin32 to "recommended" instead of "hard dependency", OR
3. Remove the claims about secure Windows deployments and document that Windows multi-user security relies on icacls parsing which has known limitations

---

#### Finding 10: FTS5 referenced but not implemented in schema
**Description:** Technical.md line 372 note references "schema.md FTS5 section" for improved substring search performance, but schema.md doesn't show any FTS5 virtual table implementation.

**Affected Files:**
- "falcon_test/apps/app1/docs/design/technical.md" (line 372)
- "falcon_test/apps/app1/docs/systems/database/schema.md"

**Evidence:** Technical.md states "For improved substring search performance in production, see schema.md FTS5 section." But searching schema.md for "FTS5" or "full-text" returns no results. The products table (schema.md, lines 299-321) doesn't show any FTS5 virtual table.

**Suggested Fix:**
1. Add FTS5 implementation to schema.md with instructions for enabling it, OR
2. Remove the reference to FTS5 from technical.md, OR
3. Document that FTS5 is a future enhancement and current implementation uses LIKE queries only

---

## Feasibility Summary

- Architecture sound: **NO** - Contains 10 implementation gaps and contradictions
- Issues found: **10**

**Critical Issues (Block Implementation):**
- Finding 1: Rate limiting won't work as designed
- Finding 3: Retry budget provides no cross-invocation protection
- Finding 4: Circuit breaker ineffective for CLI usage
- Finding 9: Dependency contradiction (stdlib-only vs pywin32 requirement)

**High Priority (Must Address Before Release):**
- Finding 2: Pagination API missing
- Finding 5: Windows security relies on fragile parsing
- Finding 6: Timeout math incorrect
- Finding 8: Transaction example doesn't demonstrate claimed protection

**Medium Priority (Documentation Issues):**
- Finding 7: Health check script may fail on valid systems
- Finding 10: Missing feature referenced as implemented

**Recommendation:** Address critical issues before implementation begins. The CLI process model fundamentally conflicts with stateful patterns (rate limiter, retry budget, circuit breaker) designed for long-running server processes. Either redesign these components for CLI usage or remove the claims.
