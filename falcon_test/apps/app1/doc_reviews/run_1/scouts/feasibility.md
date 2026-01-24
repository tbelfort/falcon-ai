# Architecture Feasibility Scout Report

## Status: ISSUES_FOUND

## Findings Summary

| # | Title | Affected Files |
|---|-------|----------------|
| 1 | No Web API Despite Claims of Programmatic Integration | ["falcon_test/apps/app1/docs/systems/cli/interface.md", "falcon_test/apps/app1/docs/design/vision.md"] |
| 2 | Real-Time Performance Impossible on CLI-Based Architecture | ["falcon_test/apps/app1/docs/design/technical.md", "falcon_test/apps/app1/docs/systems/architecture/ARCHITECTURE-simple.md"] |
| 3 | Rate Limiting Ineffective Due to CLI Process Model | ["falcon_test/apps/app1/docs/design/technical.md"] |
| 4 | Concurrent Access Claims Contradicted by Single-Writer Design | ["falcon_test/apps/app1/docs/design/vision.md", "falcon_test/apps/app1/docs/design/technical.md"] |
| 5 | Security Model Fundamentally Broken on Shared Systems | ["falcon_test/apps/app1/docs/design/vision.md", "falcon_test/apps/app1/docs/systems/database/schema.md"] |
| 6 | Circuit Breaker Pattern Won't Work in CLI Context | ["falcon_test/apps/app1/docs/systems/errors.md"] |
| 7 | Windows Permission Verification Requires External Dependency | ["falcon_test/apps/app1/docs/systems/database/schema.md", "falcon_test/apps/app1/docs/design/technical.md"] |
| 8 | Pagination + Streaming Incompatibility | ["falcon_test/apps/app1/docs/design/technical.md", "falcon_test/apps/app1/docs/systems/database/schema.md"] |

## Finding Details

#### Finding 1: No Web API Despite Claims of Programmatic Integration
**Description:** The documentation claims "programmatic integration" with ERPs and e-commerce platforms, but then explicitly states "There is NO HTTP/REST, GraphQL, or gRPC API." The suggested integration methods (shell scripting, subprocess invocation) are not viable for modern enterprise systems.

**Affected Files:**
- falcon_test/apps/app1/docs/systems/cli/interface.md (lines 1-42)
- falcon_test/apps/app1/docs/design/vision.md (line 98)

**Evidence:**
- interface.md states: "This is a CLI-only application with NO web API" yet proposes "programmatic integration" via shell scripts
- vision.md explicitly rules out "Real-time sync: No cloud sync, no mobile app, no web interface"
- The subprocess integration example shows JSON parsing from stdout, which is brittle and not transactional

**Technical Problem:**
1. Enterprise systems (SAP, Oracle, Shopify) expect REST/SOAP APIs, not subprocess calls
2. No transaction coordination between external system and database
3. Error handling relies on parsing stderr text, not structured error codes
4. Authentication/authorization impossible - file permissions are not API auth

**Suggested Fix:** Either:
1. Remove claims about "programmatic integration with ERPs/e-commerce platforms" (limit to shell scripting use cases)
2. Or add a lightweight HTTP API wrapper (FastAPI, Flask) with proper authentication

---

#### Finding 2: Real-Time Performance Impossible on CLI-Based Architecture
**Description:** The architecture claims <100ms search performance for 50,000 items while using a CLI tool with process spawn overhead. Each invocation incurs Python interpreter startup (~50-100ms), module loading, and database connection setup.

**Affected Files:**
- falcon_test/apps/app1/docs/design/technical.md (lines 496-507)
- falcon_test/apps/app1/docs/systems/architecture/ARCHITECTURE-simple.md (performance targets section)

**Evidence:**
```
| Operation | Target | Max dataset | Notes |
|-----------|--------|-------------|-------|
| search (by SKU) | <100ms | 50,000 items | Uses B-tree index |
```

**Technical Problem:**
- Python startup time: 50-100ms (measured with `time python3 -c "pass"`)
- Module import overhead: 20-50ms for argparse, sqlite3, etc.
- Database connection: 10-20ms
- **Total overhead: 80-170ms BEFORE any query execution**
- The documented <100ms target is physically impossible when overhead alone exceeds the budget

**Suggested Fix:**
1. Revise performance targets to <300ms accounting for CLI overhead
2. Or switch to daemon/service architecture where Python stays resident
3. Document that targets apply ONLY to query execution time, not end-to-end CLI latency

---

#### Finding 3: Rate Limiting Ineffective Due to CLI Process Model
**Description:** The documentation specifies in-memory rate limiting (SearchRateLimiter class) to prevent DoS attacks, but each CLI invocation is a separate process. The rate limiter resets on every command, making it completely ineffective.

**Affected Files:**
- falcon_test/apps/app1/docs/design/technical.md (lines 511-636)

**Evidence:**
```python
class SearchRateLimiter:
    def __init__(self, max_concurrent: int = 10, max_per_minute: int = 100):
        self._semaphore = threading.Semaphore(max_concurrent)
        self._timestamps: deque = deque(maxlen=max_per_minute)
```

**Technical Problem:**
1. Each `warehouse-cli search` spawns a NEW Python process
2. The `_timestamps` deque is created fresh every time
3. An attacker can run 1000 searches in parallel, each sees an empty deque
4. The documentation admits this: "CLI Invocation Model Limitation" but still includes the broken code

**Why This Matters:**
- The security claims are misleading - there is NO DoS protection
- The recommended SQLite-based rate limiting adds complexity and lock contention
- File-based locking is error-prone (stale locks, race conditions)

**Suggested Fix:**
1. Remove all rate limiting code and claims (acknowledge CLI tools can't rate-limit)
2. Or require deployment behind a rate-limiting proxy (nginx, API Gateway)
3. Document that DoS protection MUST be handled at OS/network layer

---

#### Finding 4: Concurrent Access Claims Contradicted by Single-Writer Design
**Description:** The vision doc claims "concurrent CLI invocations from the same user (e.g., parallel shell scripts) are handled gracefully" but SQLite only supports ONE writer at a time. The architecture will serialize ALL write operations.

**Affected Files:**
- falcon_test/apps/app1/docs/design/vision.md (lines 66-85)
- falcon_test/apps/app1/docs/design/technical.md (lines 853-870)

**Evidence:**
- vision.md: "2-3 concurrent write operations typically succeed without issues"
- technical.md: "SQLite with WAL mode supports concurrent reads but single writer"
- The busy timeout is 30 seconds - if 3 writes happen simultaneously, the 3rd waits up to 30 seconds

**Technical Problem:**
1. "Gracefully handled" means "queued and potentially timing out"
2. Users expect parallel scripts to run in parallel, not serialize
3. The 30-second timeout will cause random failures in batch jobs
4. WAL mode helps with READ concurrency, not WRITE concurrency

**Real-World Failure Scenario:**
```bash
# Nightly batch job - expected to take 5 minutes
for sku in $(cat 1000_skus.txt); do
    warehouse-cli update-stock --sku "$sku" --add 10 &
done
wait
# Actual result: Takes 8+ hours due to serialization + timeouts
```

**Suggested Fix:**
1. Document that concurrent WRITES are not supported - use sequential processing
2. Remove claims about "2-3 concurrent writes typically succeed"
3. Reduce timeout to 5 seconds and document retry logic for batch jobs

---

#### Finding 5: Security Model Fundamentally Broken on Shared Systems
**Description:** The architecture relies on filesystem permissions (0600) for security, but then requires users to manually detect and configure multi-user environments. The detection mechanism is easily bypassed.

**Affected Files:**
- falcon_test/apps/app1/docs/design/vision.md (lines 28-63)
- falcon_test/apps/app1/docs/systems/database/schema.md (lines 20-87)

**Evidence:**
vision.md requires "Multi-User Environment Detection":
```
1. Automatic Environment Detection: Check if parent directory has group/world permissions
2. If multi-user detected AND no override: FAIL with SecurityError
3. Explicit Override Flag: --allow-shared-system
```

**Technical Problem:**
1. **Detection is trivial to bypass**: `chmod 700 /data && warehouse-cli init` - now "single-user"
2. **File ownership doesn't prevent sudo**: `sudo cat inventory.db` bypasses 0600 permissions
3. **Backup systems**: Backup agents run as root and can read ALL files
4. **Encryption is "optional"**: schema.md says "For sensitive data, consider SQLCipher" but provides no enforcement

**Attack Scenario:**
- Attacker creates `/tmp/fake_warehouse` with 0700 permissions
- Runs `warehouse-cli init --db /tmp/fake_warehouse/inventory.db`
- Detection sees "single-user directory" ✓
- File created with 0600 ✓
- **But /tmp is world-readable** - attacker's other processes can access inode before permissions set
- TOCTOU race condition between file creation and permission setting

**Suggested Fix:**
1. State clearly: "This tool is NOT secure for shared systems without full-disk encryption"
2. Remove the "Multi-User Environment Detection" - it provides false security
3. Make SQLCipher MANDATORY, not optional, if security is claimed
4. Document that file permissions alone are insufficient

---

#### Finding 6: Circuit Breaker Pattern Won't Work in CLI Context
**Description:** errors.md specifies a circuit breaker for database operations (DatabaseCircuitBreaker class), but circuit breakers require PERSISTENT state across requests. CLI tools spawn fresh processes.

**Affected Files:**
- falcon_test/apps/app1/docs/systems/errors.md (lines 598-670)

**Evidence:**
```python
class DatabaseCircuitBreaker:
    def __init__(self, failure_threshold: int = 10, reset_timeout_seconds: float = 30.0):
        self._state = CircuitState.CLOSED
        self._failure_count = 0
```

**Technical Problem:**
1. Each CLI invocation creates a NEW circuit breaker with `_failure_count = 0`
2. The circuit can NEVER open because it resets every time
3. The "10 consecutive failures" threshold is meaningless when count resets per-process
4. This is the SAME problem as the rate limiter (Finding 3)

**Why This Was Specified:**
- Copy-pasted from web service patterns without considering CLI architecture
- The "singleton instance" comment is misleading - it's a singleton per-process, not system-wide

**Suggested Fix:**
1. Remove circuit breaker entirely - it doesn't apply to CLI tools
2. Or use persistent state (SQLite table, file lock) but acknowledge overhead
3. Document that circuit breaking must happen at a higher layer (monitoring, alerting)

---

#### Finding 7: Windows Permission Verification Requires External Dependency
**Description:** The technical.md claims "Standard library only. No pip dependencies" but schema.md requires pywin32 for Windows permission verification, contradicting the core constraint.

**Affected Files:**
- falcon_test/apps/app1/docs/systems/database/schema.md (lines 406-474)
- falcon_test/apps/app1/docs/design/technical.md (lines 5-32)

**Evidence:**
technical.md states: "**Constraint**: Standard library only. No pip dependencies."

But schema.md requires:
```python
try:
    import win32security  # Requires pywin32 package
    import ntsecuritycon as con
except ImportError:
    raise SecurityError(
        "Install with: pip install pywin32>=305"
    )
```

**Technical Problem:**
1. Direct contradiction between design constraints
2. pywin32 is a NATIVE extension (requires C compiler on install)
3. Falls back to `icacls` parsing which is documented as "inherently unreliable"
4. Windows users must either:
   - Install pywin32 (violates no-dependency constraint)
   - Or use unreliable icacls (security vulnerability)

**Why This Matters:**
- Windows is a primary target platform (users on Windows frequently manage warehouses)
- Security verification on Windows is mandatory for shared systems
- The fallback (icacls parsing) has locale issues, version fragility, and parsing ambiguity

**Suggested Fix:**
1. Add pywin32 as an OPTIONAL dependency (document as Windows-only, security-focused)
2. Or remove security claims on Windows and document: "Windows permission verification requires manual ACL configuration"
3. Update technical.md to say "Standard library only on Unix; pywin32 required on Windows for security"

---

#### Finding 8: Pagination + Streaming Incompatibility
**Description:** The architecture requires BOTH pagination (via LIMIT/OFFSET) AND streaming (cursor iteration) for export-csv, but these are contradictory approaches for large datasets.

**Affected Files:**
- falcon_test/apps/app1/docs/design/technical.md (lines 496-507, 649)
- falcon_test/apps/app1/docs/systems/database/schema.md (lines 1689-1780)

**Evidence:**
technical.md specifies:
```
| export-csv | <5s | 50,000 items | No | **MUST use streaming** (see note below) |
```
But also:
```
**Pagination Requirements (MANDATORY for search/low-stock-report):**
- Default `limit`: 100 results per query
- Maximum `limit`: 1000 results (enforced at application layer)
```

schema.md shows streaming implementation:
```python
cursor = conn.execute("SELECT * FROM products")  # No LIMIT
for row in cursor:
    writer.writerow(row)
```

**Technical Problem:**
1. Pagination (LIMIT/OFFSET) is for interactive queries where users page through results
2. Streaming is for bulk exports where you process the entire dataset
3. The docs say "export-csv" does NOT use pagination ("No" in Pagination Required column)
4. But search commands DO use pagination
5. **Contradiction**: If export streams all 50k items, why do searches limit to 1000?

**Memory Impact:**
- Streaming export: 10KB buffer, constant memory ✓
- Paginated search: Holds up to 1000 rows in memory (10MB max) ✓
- **If export is paginated**: 1000 rows × 50 exports = 50MB memory budget violated

**Suggested Fix:**
1. Clarify that export-csv does NOT support pagination (streams entire dataset)
2. Add a `--limit` flag to export-csv for testing (not production use)
3. Document that exports >100k rows should use direct database access, not CLI

---

## Feasibility Summary
- Architecture sound: NO
- Issues found: 8 (5 critical, 3 major)

**Critical Issues (Architectural Flaws):**
1. Finding 1: No viable programmatic integration path
2. Finding 2: Performance targets physically impossible
3. Finding 5: Security model has fundamental TOCTOU vulnerabilities
4. Finding 7: Core constraint (no dependencies) cannot be met on Windows

**Major Issues (Design Inconsistencies):**
5. Finding 3: Rate limiting won't work in CLI architecture
6. Finding 4: Concurrent write claims misleading
7. Finding 6: Circuit breaker pattern doesn't apply
8. Finding 8: Pagination/streaming usage unclear

**Recommendation:** This architecture requires significant revision. The CLI-based approach is fundamentally incompatible with the stated requirements for real-time performance, programmatic integration, and multi-user security. Consider either:
1. Revising requirements to match CLI capabilities (single-user, best-effort performance, no real-time)
2. Or changing architecture to daemon/service model with HTTP API for integration
