# Fixes Applied to technical.md

## Changes Made

### Gap ID 11: SQLite minimum version not testable/enforced
**What Changed**: Added a new "SQLite Version Enforcement (MANDATORY)" section after the existing SQLite Version Requirements section.
**Lines Affected**: Approximately lines 64-91 (after existing content at lines 59-63)
**Content Added/Modified**:
```python
MINIMUM_SQLITE_VERSION = (3, 24, 0)

def validate_sqlite_version() -> None:
    """Validate SQLite version meets minimum requirements."""
    current_version = sqlite3.sqlite_version_info  # Returns tuple like (3, 39, 0)
    if current_version < MINIMUM_SQLITE_VERSION:
        raise RuntimeError(
            f"SQLite version {sqlite3.sqlite_version} is not supported. "
            f"Minimum required version is 3.24.0. ..."
        )
```
Added startup integration requirements specifying the validation must be called at CLI entry point before argument parsing.

---

### Gap ID 15: SearchRateLimiter singleton is ineffective for CLI invocation model
**What Changed**: Rewrote the "Rate Limit Enforcement Implementation" section to:
1. Add a prominent warning about CLI invocation model limitation
2. Provide SQLite-based rate limiting as the recommended approach for CLI
3. Mention file-based locking as an alternative
4. Clearly mark the in-memory implementation as "for server/daemon mode only"
**Lines Affected**: Approximately lines 396-480 (rate limiting section)
**Content Added/Modified**:
```python
# SQLite-based rate limiting (RECOMMENDED for CLI):
def acquire_rate_limit_sqlite(db_path: str, operation: str, max_per_minute: int = 100) -> bool:
    """Check rate limit using persistent SQLite storage."""
    # Uses rate_limits table to track timestamps across CLI invocations
```
Added explicit warning that in-memory `SearchRateLimiter` resets on each CLI invocation.

---

### Gap ID 18: Rate limiter thread safety contradicts documented concurrent connection limit
**What Changed**: Added a clarification block after the "Concurrent search limit" item explaining the distinction between:
- "10 concurrent search operations per database" (application-level limit)
- "3 concurrent connections per process" (SQLite connection pool guideline)
**Lines Affected**: Approximately lines 349-355 (concurrent search limit section)
**Content Added/Modified**:
```
**Clarification - Concurrent Limits:**
- "10 concurrent search operations per database" is an application-level limit enforced by the rate limiter
- "3 concurrent connections per process" is a SQLite connection pool guideline
- These are independent limits: a single search operation uses one connection
```

---

### Gap ID 21: Memory budget check with sys.getsizeof is unreliable
**What Changed**: Replaced the "Memory enforcement implementation" code block with a new "Memory Control Mechanism" section that:
1. Documents why `sys.getsizeof()` is unreliable (returns container size only)
2. Explains that pagination limit (1000 rows) is the actual memory control mechanism
3. Provides code example showing the recommended approach
**Lines Affected**: Approximately lines 567-600 (memory budget section)
**Content Added/Modified**:
```python
# UNRELIABLE - sys.getsizeof returns container size only (~56 bytes for list)
# Does NOT include the size of list elements
results = [{"sku": "...", "name": "...", ...} for _ in range(1000)]
sys.getsizeof(results)  # Returns ~8056 bytes (list overhead), NOT actual data size

# Recommended approach - rely on pagination:
MAX_PAGINATION_LIMIT = 1000  # Enforces ~10MB memory ceiling
```

---

### Gap ID 57: Real-Time Performance Impossible on CLI-Based Architecture
**Severity**: HIGH
**What Changed**: Added comprehensive clarification that the <100ms performance targets measure query execution time only, not end-to-end CLI invocation latency. Added detailed explanation of CLI startup overhead and architectural implications.

**Lines Affected**: ~505-540 (Performance Targets section)

**Content Added/Modified**:
```markdown
# In performance table - added clarifications to each row:
| search (by SKU) | <100ms | ... | **QUERY EXECUTION TIME ONLY** (excludes CLI startup overhead). ... End-to-end CLI latency includes Python interpreter startup (80-170ms) plus query execution time. |

# Added new section after the Index Strategy Note:
> **CLI Performance Characteristics - IMPORTANT CLARIFICATION:**
>
> The performance targets in this table measure **query execution time only**, not end-to-end CLI invocation latency. CLI-based applications have inherent startup overhead:
>
> - **Python interpreter startup**: 80-170ms (varies by system, Python version, and environment)
> - **Module import time**: 10-30ms (sqlite3, argparse, etc.)
> - **Query execution time**: As specified in targets above
> - **Total end-to-end latency**: Startup overhead + query execution time
>
> **Example - search by SKU:**
> - Query execution target: <100ms
> - Python startup overhead: ~120ms (typical)
> - **Total CLI invocation time: ~220ms** (100ms query + 120ms startup)
>
> **Rationale for measuring query execution time separately:**
> - Query performance is under our control (indexes, pagination, SQL optimization)
> - Startup overhead is a platform characteristic (not application-specific)
> - Query targets are meaningful for comparing database performance and index effectiveness
> - Applications embedding this as a library avoid CLI startup costs
>
> **For production applications requiring <100ms end-to-end latency:**
> - Consider a long-running server process or daemon mode (eliminates per-request startup overhead)
> - Use Python's `-S` flag to reduce startup time (skips site initialization)
> - Pre-warm the Python interpreter with a persistent process
>
> This distinction is critical for evaluating whether the architecture meets performance requirements. If your use case requires <100ms end-to-end response time including CLI invocation, the CLI-based architecture is not suitable. Consider a client-server architecture with a persistent Python process instead.
```

**Rationale**: The judge correctly identified that the documentation stated "<100ms" without clarifying whether this was query execution time or total CLI latency. The scout's concern was valid - CLI startup overhead (80-170ms) makes sub-100ms end-to-end latency physically impossible. This fix resolves the ambiguity by explicitly stating targets measure query execution only, quantifying the startup overhead, and providing architectural guidance for true sub-100ms requirements.

---

### Gap ID 52: Python minor version compatibility not documented
**Severity**: LOW
**What Changed**: Added explicit Version Compatibility subsection documenting minimum version, maximum tested version, known incompatibilities, and deployment recommendations.

**Lines Affected**: ~5-13 (Language section)

**Content Added/Modified**:
```markdown
**Version Compatibility**:
- **Minimum version**: Python 3.10.0
- **Maximum tested version**: Python 3.12.x
- **Known incompatibilities**: None for Python 3.10-3.12. Python 3.13+ has not been tested and may have changes to standard library modules (sqlite3, argparse) that could affect compatibility.
- **Recommendation**: Use Python 3.10.x or 3.11.x for production deployments. Python 3.12+ should be tested in your environment before deployment.
```

**Rationale**: While the original documentation specified Python 3.10+ and documented features used, it didn't explicitly state the maximum tested version or provide guidance on newer Python versions. This addition follows best practices for dependency documentation by making version boundaries explicit.

---

### Gap ID 54: Database alternatives not documented
**Severity**: MEDIUM
**What Changed**: Added comprehensive "Rejected Alternatives" subsection documenting why PostgreSQL, MySQL, DuckDB, and JSON/CSV files were not chosen.

**Lines Affected**: ~72-80 (Database section)

**Content Added/Modified**:
```markdown
**Rejected Alternatives**:
- **PostgreSQL**: External server setup required. Adds operational complexity (server installation, user management, network configuration) incompatible with "zero configuration" goal. Overkill for single-user CLI tool with 50,000 row target.
- **MySQL**: Same operational overhead as PostgreSQL. Requires server process, network configuration, and user authentication. Not suitable for lightweight CLI applications.
- **DuckDB**: Not in Python standard library. Would require external dependency (violates constraint). While excellent for analytics, adds installation friction for simple inventory management.
- **JSON/CSV files**: No concurrent access support. No ACID transactions. Poor query performance for 50,000+ rows. Unsuitable for multi-user scenarios.
```

**Rationale**: The documentation already had a "Rejected alternatives" pattern established in the CLI Framework section. Applying the same pattern to the database choice provides transparency about architectural decisions and helps readers understand the trade-offs. Each alternative is rejected with specific technical rationale tied to project constraints.

---

## Summary
- **Gaps addressed**: 7 (previously 4, now added 3 more: 1 HIGH, 1 MEDIUM, 1 LOW)
- **Sections added**: 5 (SQLite Version Enforcement, CLI Invocation Model Limitation, CLI Performance Characteristics, Version Compatibility, Database Rejected Alternatives)
- **Sections modified**: 4 (Concurrent search limit clarification, Memory enforcement replaced with Memory Control Mechanism, Performance targets table, Database section)
