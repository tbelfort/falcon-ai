# Architecture Feasibility Analysis

## Status: READY

The proposed architecture for the Warehouse Inventory CLI is fundamentally sound and implementable. The technology choices are compatible, the layered architecture is well-defined, and the security model is comprehensive. No critical feasibility blockers were identified.

## Feasibility Issues

### Issue 1: Substring Search Performance Target May Be Unrealistic

**Problem**: The technical.md document specifies a <100ms performance target for name searches on datasets up to 50,000 items. However, the search implementation uses `LIKE '%substring%'` which cannot use B-tree indexes and requires full table scans.

**Why It Fails**: SQLite's B-tree indexes only support prefix matching (`LIKE 'prefix%'`). Substring searches (`LIKE '%value%'`) bypass all indexes and scan the entire table. The schema.md documentation acknowledges this: "The <100ms target in technical.md may NOT be achievable for name searches on large datasets."

**Affected Files**:
- "/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app1/docs/design/technical.md"
- "/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app1/docs/systems/database/schema.md"

**Suggested Resolution**: The documentation already provides mitigations (FTS5 virtual table for production at scale, pagination enforcement). Consider either:
1. Adjusting the performance target for name searches to <500ms (already specified as an alternative)
2. Making FTS5 a mandatory feature for datasets >25,000 items
3. Clearly documenting the performance difference between SKU search (<100ms with index) and name search (<500ms full scan)

**Severity**: Warning (documentation inconsistency, not a technical impossibility)

---

### Issue 2: Windows Permission Verification Dependency on icacls

**Problem**: The Windows permission verification relies on parsing `icacls` command output, which has known limitations including localization issues, format variations across Windows versions, and potential parsing ambiguities.

**Why It Fails**: The schema.md explicitly acknowledges these limitations: "icacls Parsing Limitations and Mitigations" section notes issues with username substring matching, localized output, and format stability across Windows versions. The fallback to pywin32 is marked as "SHOULD" (optional), not "MUST" (required).

**Affected Files**:
- "/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app1/docs/systems/database/schema.md"

**Suggested Resolution**: The documentation provides comprehensive mitigations:
1. Windows version detection is required
2. Fail-closed behavior on parse errors is mandated
3. pywin32 fallback is recommended

Consider upgrading pywin32 fallback from SHOULD to MUST for production deployments on shared Windows systems. This would ensure reliable permission verification across all Windows environments.

**Severity**: Warning (implementation complexity, not impossibility)

---

### Issue 3: Network Filesystem Detection Not Universally Reliable

**Problem**: The architecture explicitly blocks network filesystems (NFS, SMB) due to WAL mode corruption risks, but the documentation acknowledges that "Network filesystem detection requires platform-specific checks and is not universally reliable."

**Why It Fails**: There is no universal API to detect whether a path is on a network filesystem. The `validate_path()` function blocks UNC paths on Windows, but mapped network drives (`Z:\`) cannot be reliably detected. On Unix, detecting NFS/SMB mounts requires reading `/proc/mounts` or similar platform-specific mechanisms.

**Affected Files**:
- "/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app1/docs/systems/architecture/ARCHITECTURE-simple.md"
- "/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app1/docs/systems/database/schema.md"

**Suggested Resolution**: The documentation already acknowledges this limitation and places responsibility on users for mapped drives. Consider adding:
1. A startup check that attempts a WAL mode enable and verifies it succeeds
2. Clear warning messages when WAL mode fails that mention network storage as a possible cause
3. Documentation in the deployment checklist about verifying local storage

**Severity**: Warning (operational guidance gap, architecture is still sound)

---

### Issue 4: Rate Limiter State Not Persisted Across Process Restarts

**Problem**: The `SearchRateLimiter` class in technical.md maintains rate limit state in memory using a sliding window. In a CLI tool where each command invocation is a separate process, this state is lost between invocations.

**Why It Fails**: Each CLI invocation starts with a fresh `SearchRateLimiter` instance. The documented "100 searches per minute" limit cannot be enforced because the timestamp history is not persisted between process invocations.

**Affected Files**:
- "/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app1/docs/design/technical.md"

**Suggested Resolution**: For a single-user CLI tool, this may be acceptable since the rate limiting is primarily DoS protection for server scenarios. Options include:
1. Document that rate limiting is per-process only (appropriate for CLI use case)
2. For daemon/service deployments, use a persistent store (SQLite table) for rate limit state
3. Rely on the pagination limit (max 1000 results) as the primary resource protection

**Severity**: Warning (design intent vs implementation gap for specific deployment modes)

---

### Issue 5: Circuit Breaker State Shared Across Operations in Single Process Only

**Problem**: The `DatabaseCircuitBreaker` class is implemented as a module-level singleton. Similar to the rate limiter, this state is not persisted and resets with each process invocation.

**Why It Fails**: For a CLI tool, this means the circuit breaker cannot actually protect against cascading failures across multiple CLI invocations. Each invocation starts with a closed circuit.

**Affected Files**:
- "/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app1/docs/systems/errors.md"

**Suggested Resolution**:
1. Document that circuit breaker protection applies to long-running operations within a single process (batch imports, exports)
2. For multi-process scenarios, rely on SQLite's built-in busy_timeout and the automatic retry logic
3. Consider this a future enhancement for daemon deployments if needed

**Severity**: Warning (implementation scope clarification needed)

---

## Feasibility Summary

- **Architecture sound**: YES
- **Critical issues**: 0
- **Warnings**: 5

### Overall Assessment

The proposed architecture is **feasible and well-designed** for its intended use case: a single-user CLI tool for small warehouse operations (<10,000 SKUs, 1-3 employees). The technology choices (Python 3.10+, SQLite, argparse) are appropriate and well-integrated.

Key architectural strengths:
1. **Layered architecture** with clear separation of concerns is well-defined and enforceable
2. **Security model** is comprehensive with defense-in-depth (S1-S3 rules)
3. **No external dependencies** beyond Python standard library reduces deployment complexity
4. **SQLite with WAL mode** is appropriate for the concurrency requirements
5. **Error handling** is thoroughly specified with clear exit codes

The warnings identified are mostly documentation clarifications or edge cases that are already acknowledged in the documentation. None represent fundamental architectural flaws that would prevent successful implementation.

### Recommendations for Implementation

1. Clearly document the per-process nature of rate limiting and circuit breaker in the context of CLI usage
2. Consider making the <500ms name search target the primary documented expectation
3. Add startup validation that confirms WAL mode enabled successfully
4. For Windows deployments, recommend pywin32 installation in the deployment guide
