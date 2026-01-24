# Architecture Feasibility Scout Report

## Assessment: ISSUES_FOUND

The proposed warehouse inventory CLI architecture contains multiple significant feasibility issues spanning Python version incompatibilities, database performance constraints, security implementation gaps, and dependency contradictions. While the core concept is sound, several design choices will not work as specified and require revision.

## Issues

### Issue 1: Python 3.13+ Compatibility Claims Contradicted by Implementation Requirements

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md"]

**Relevant Text From Docs:**
```
**Version Compatibility**:
- **Minimum version**: Python 3.10.0
- **Maximum tested version**: Python 3.12.x
- **Known incompatibilities**: None for Python 3.10-3.12. Python 3.13+ has not been tested and may have changes to standard library modules (sqlite3, argparse) that could affect compatibility.
- **Recommendation**: Use Python 3.10.x or 3.11.x for production deployments. Python 3.12+ should be tested in your environment before deployment.
```

And later in the same document:
```
**Python 3.10+ Specific Features Used:**

| Feature | Syntax | Backport Alternative |
|---------|--------|---------------------|
| Union type syntax | `int \| None` | `Union[int, None]` from typing |
| Type parameter syntax | `list[Product]` | `List[Product]` from typing |
| Match statements | `match/case` | NOT USED (if/elif chains instead) |
```

**What's Missing/Wrong:**

The documentation explicitly states Python 3.13+ has "not been tested and may have changes to standard library modules" but provides no concrete information about what those changes might be. This creates uncertainty for implementers about whether the architecture will work on Python 3.13+.

More critically, the use of `int | None` union syntax (PEP 604) requires Python 3.10+, but the spec provides backport guidance suggesting compatibility with 3.8-3.9 is possible. However, the spec then says "**Backport Considerations:** If backporting to Python 3.8-3.9 is required..." but the minimum version is already stated as 3.10.0. This is contradictory.

The actual feasibility issue is that Python 3.13 introduced changes to the `sqlite3` module's exception handling and transaction behavior that could break the application's error handling. Without testing on 3.13+, claiming compatibility is premature.

**Assessment:**

This is a **documentation consistency issue** rather than a fundamental architectural flaw. The solution is to:
1. Remove the backport guidance (since minimum version is 3.10)
2. Either test on Python 3.13 and document results, OR explicitly state "not supported on 3.13+ until tested"
3. Add a runtime Python version check that warns/fails on untested versions

### Issue 2: SQLite WAL Mode on Network Filesystems Will Cause Silent Data Corruption

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md", "falcon_test/apps/app1/docs/systems/architecture/ARCHITECTURE-simple.md"]

**Relevant Text From Docs:**
```
**Deployment Requirements:**

The deployment environment MUST meet all of the following requirements:
- Python version MUST be 3.8 or higher with sqlite3 module (included in standard library)
- The application MUST run as standalone CLI with no external service dependencies
- The database file location MUST be writable by the executing user
- On Unix systems: The system MUST create database files with 0600 permissions (owner-only)
- On Windows systems: Database files MUST inherit NTFS ACLs from parent directory
- For container deployments: A writable volume MUST be mounted for database storage

**File System Requirements and Limitations:**

| Deployment Environment | Supported | Notes |
|------------------------|-----------|-------|
| Local filesystem (ext4, APFS, NTFS) | Yes | Full support |
| Network-mounted filesystems (NFS, SMB) | **No** | WAL mode causes corruption; block with validation |
| Read-only filesystems | **No** | Database requires write access |
| Ephemeral storage (tmpfs, container overlay) | Conditional | Data lost on restart; warn at startup |
| Encrypted volumes (LUKS, FileVault) | Yes | Performance may vary |
```

And from ARCHITECTURE-simple.md:
```
**Windows UNC path handling (MANDATORY SECURITY REQUIREMENT - NOT OPTIONAL):**

Blocking UNC and network paths is a MANDATORY security requirement, not an edge case. Network storage is incompatible with SQLite's WAL mode and can cause data corruption, resulting in silent data loss.

| Path Type | Supported | Requirement | Notes |
|-----------|-----------|-------------|-------|
| Local paths (`C:\data\db.sqlite`) | Yes | Allowed | Normalized via `os.path.abspath()` |
| UNC paths (`\\server\share\db.sqlite`) | No | MUST block | Network paths cause WAL corruption |
| Device paths (`\\.\pipe\name`) | No | MUST block | Device namespace not valid for databases |
| Mapped drives (`Z:\db.sqlite`) | Yes | Allowed with warning | User responsible for mount stability |
```

**What's Missing/Wrong:**

The architecture claims to block network filesystems but has a **critical feasibility hole**: **mapped network drives on Windows (`Z:\`) are explicitly allowed** while UNC paths are blocked. This is inconsistent and dangerous because:

1. A mapped drive `Z:\` **IS** a network filesystem - it's just UNC path `\\server\share` with a drive letter alias
2. The spec says "User responsible for mount stability" but SQLite WAL mode doesn't just have stability issues on network storage - it causes **data corruption**
3. The `os.path.abspath()` function cannot distinguish between a local `C:\` drive and a mapped network `Z:\` drive
4. Users following this guidance will experience silent data corruption when using mapped drives

On Linux/macOS, the spec requires detection of NFS/CIFS mounts but provides no concrete implementation:

```
**Note:** Network filesystem detection requires platform-specific checks
and is not universally reliable. The pre-deployment validation script
includes manual verification steps.
```

This is handwaving - "requires platform-specific checks" without specifying WHAT checks or HOW to implement them means this feature won't work reliably.

**Assessment:**

This is a **fundamental architectural flaw** that will cause data loss in production. The only safe approaches are:

1. **Option A (Conservative):** Block ALL removable/mapped drives on Windows, not just UNC paths. Require database on local `C:\` drive only.
2. **Option B (Pragmatic):** Disable WAL mode entirely and use rollback journal mode. Accept performance degradation but gain network filesystem safety.
3. **Option C (Complex):** Implement robust filesystem type detection:
   - Windows: Use `GetVolumeInformation` WinAPI to detect network drives (requires pywin32, breaking "no dependencies" constraint)
   - Linux: Parse `/proc/mounts` for NFS/CIFS mount types
   - macOS: Use `diskutil info` to detect network volumes

The current spec's approach of "allow Z:\ with warning" is not feasible - it will cause data corruption.

### Issue 3: Performance Targets Contradict CLI Invocation Model

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md"]

**Relevant Text From Docs:**
```
### Single-User Operations

| Operation | Target | Max dataset | Pagination Required | Notes |
|-----------|--------|-------------|---------------------|-------|
| init | <500ms | n/a | No | One-time setup |
| add-item | <50ms | n/a | No | Single insert |
| update-stock | <50ms | n/a | No | Single update |
| search (by SKU) | <100ms | 50,000 items | **Yes (limit=100 default, max=1000)** | **QUERY EXECUTION TIME ONLY** (excludes CLI startup overhead). Target assumes paginated results with LIMIT clause; uses B-tree index on sku column. Pagination implemented via `--limit` and `--offset` flags (see interface.md CLI specification). End-to-end CLI latency includes Python interpreter startup (80-170ms) plus query execution time. |

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
```

And later:
```
**For production applications requiring <100ms end-to-end latency:**
- Consider a long-running server process or daemon mode (eliminates per-request startup overhead)
- Use Python's `-S` flag to reduce startup time (skips site initialization)
- Pre-warm the Python interpreter with a persistent process

This distinction is critical for evaluating whether the architecture meets performance requirements. If your use case requires <100ms end-to-end response time including CLI invocation, the CLI-based architecture is not suitable. Consider a client-server architecture with a persistent Python process instead.
```

**What's Missing/Wrong:**

The architecture acknowledges that CLI startup overhead makes sub-100ms end-to-end latency impossible, but then **the documented use cases assume users will be satisfied with 220ms+ response times**. This contradicts user expectations for a tool positioned as lightweight and fast.

More critically, the spec suggests workarounds like "daemon mode" and "persistent process" but:

1. **Daemon mode is not specified anywhere** - no command, no implementation guidance, just mentioned as a hypothetical solution
2. **"Pre-warm the Python interpreter with persistent process"** contradicts the entire CLI-based architecture - this is describing a client-server model, which the spec explicitly rejected
3. The use cases (UC3: Order Fulfillment) describe warehouse workers doing rapid stock updates during order picking, where 220ms latency per operation would be unacceptable

The architectural choice of a CLI tool is fundamentally incompatible with the performance targets for interactive use cases.

**Assessment:**

This is a **feasibility issue with the architecture choice**. The spec needs to either:

1. **Revise performance targets** to reflect realistic CLI latency (250-300ms end-to-end for simple operations)
2. **Add daemon mode as a first-class feature** with complete specification of how it works, how users invoke it, lifecycle management, etc.
3. **Change architecture** to a long-running process with CLI client (thin wrapper that communicates with daemon over Unix socket/named pipe)

The current approach of documenting the limitation but not addressing it architecturally is not feasible for the stated use cases.

### Issue 4: Rate Limiting Cannot Work as Specified for CLI Tool

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md"]

**Relevant Text From Docs:**
```
**Rate Limiting for Search Operations (MANDATORY):**

> **Why rate limiting is needed:** Without rate limits, malicious users could perform many broad searches simultaneously, causing memory exhaustion and denying service to legitimate users. Each unbounded search could attempt to return thousands of rows, consuming significant server resources.

To prevent denial-of-service attacks through concurrent broad searches, implementations MUST enforce the following rate limits:

1. **Concurrent search limit:** Maximum 10 concurrent search operations per database (applies to multi-threaded or server mode; see "CLI Invocation Model Limitation" below for single-process CLI usage). When limit exceeded, return error: `"Error: Too many concurrent searches. Please wait and retry."` with exit code 1.

[...]

5. **Rate Limit Enforcement Implementation:**

   **IMPORTANT - CLI Invocation Model Limitation:**

   The in-memory `SearchRateLimiter` class shown below is effective ONLY for long-running server processes or multi-threaded applications. For CLI tools where each command invocation is a separate process, in-memory rate limiting state resets on each invocation, making it ineffective.

   **For CLI applications, choose one of these approaches:**

   a. **SQLite-based rate limiting (RECOMMENDED for CLI):** Store rate limit state in a dedicated SQLite table:
```

The documentation then provides a SQLite-based rate limiting implementation.

**What's Missing/Wrong:**

The rate limiting requirement has **multiple feasibility problems**:

1. **SQLite-based rate limiting creates a chicken-and-egg problem**: Rate limiting is meant to prevent concurrent database access from causing issues, but the rate limiting mechanism itself requires database access (to read/write the `rate_limits` table). If multiple processes try to check rate limits simultaneously, they'll experience the exact lock contention the rate limiting is trying to prevent.

2. **Stale rate limit entries will accumulate**: The SQLite approach includes cleanup via `DELETE FROM rate_limits WHERE timestamp < datetime('now', '-60 seconds')`, but if processes crash or are killed (SIGKILL), they never clean up their entries. Over time, the `rate_limits` table will fill with stale entries that permanently count against the rate limit.

3. **Rate limiting in CLI tools is architecturally wrong**: The spec states "Why rate limiting is needed: Without rate limits, malicious users could perform many broad searches simultaneously" but this assumes a multi-user server scenario. For a CLI tool where "Sarah, the warehouse manager" is the only user (as stated in vision.md), rate limiting protects against... what exactly? Sarah running too many searches?

4. **The recommendation contradicts the threat model**: The spec says rate limiting prevents "memory exhaustion" but CLI processes have separate memory spaces. If one `warehouse-cli search` process exhausts memory, it doesn't affect other processes. The OS provides natural process isolation.

**Assessment:**

This is an **architectural mismatch** between requirements and implementation model. Rate limiting makes sense for a server but not for a single-user CLI tool. The spec should either:

1. **Remove rate limiting entirely** for the CLI version (simpler, matches single-user use case)
2. **Add it only for hypothetical "daemon mode"** that's mentioned but not specified
3. **Change the threat model** to acknowledge this is a single-user tool without DoS concerns

The current SQLite-based rate limiting approach is not feasible due to lock contention creating the very problem it's trying to solve.

### Issue 5: CSV Injection Prevention Cannot Be Reliably Automated

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md"]

**Relevant Text From Docs:**
```
3. **CSV Injection Prevention**: CSV export MUST sanitize field values to prevent formula injection attacks:
   - Any field starting with the following characters MUST be prefixed with a single quote (`'`):
     - `=` (formula prefix in Excel, LibreOffice)
     - `+` (formula prefix)
     - `-` (formula prefix)
     - `@` (formula prefix in Excel, also used for SUM, etc.)
     - `\t` (tab - can be used for cell injection)
     - `\r` (carriage return - can break CSV parsing)
     - `|` (pipe - can execute commands in some parsers via DDE)
     - `!` (can trigger DDE in older Excel versions)
   - Additionally, implementations MUST handle:
     - Unicode lookalike characters (e.g., U+FF1D fullwidth equals '=', U+FF0B fullwidth plus '+')
     - Fields containing only whitespace followed by dangerous characters

[...]

   **Enforcement Requirements (MANDATORY - AUTOMATED):**

   Relying on manual code review for CSV sanitization is insufficient. Implementations MUST include automated enforcement:

   1. **Static Analysis (CI - REQUIRED):** Linter rule MUST detect CSV write operations that bypass `sanitize_csv_field()`:
      ```python
      # CI linter must detect and reject patterns like:
      writer.writerow([item.sku, item.name])  # FAIL: direct field access
      # Must be:
      writer.writerow([sanitize_csv_field(item.sku), sanitize_csv_field(item.name)])  # PASS
      ```
```

**What's Missing/Wrong:**

The requirement for **automated static analysis to enforce CSV sanitization** is not feasible without significant tooling investment:

1. **No standard Python linter can detect this pattern**: The example shows detecting whether `sanitize_csv_field()` is called around field accesses, but this requires **semantic analysis** (understanding what `item.sku` represents and tracing it through function calls). Tools like `pylint`, `flake8`, and `mypy` cannot do this out-of-the-box.

2. **Custom AST-based linter would be extremely complex**: To implement this check, you'd need to:
   - Parse the AST to find all `writerow()` calls
   - Trace back each argument to determine if it's a field from `Product` model
   - Verify each field passes through `sanitize_csv_field()`
   - Handle indirect flows (e.g., `fields = [item.sku]; writer.writerow(fields)`)

3. **The wrapper function approach makes static analysis even harder**:
```python
def write_product_row(writer, product: Product) -> None:
    """Write product to CSV with MANDATORY sanitization."""
    writer.writerow([
        sanitize_csv_field(product.sku),
        sanitize_csv_field(product.name),
        # ...
    ])
```

Now the linter must verify that ALL `writerow()` calls use `write_product_row()` and that `write_product_row()` correctly sanitizes. This is a moving target - if the function signature changes, the linter breaks.

4. **Runtime enforcement would be more reliable**: Instead of static analysis, wrap the CSV writer:
```python
class SafeCSVWriter:
    def writerow(self, row):
        sanitized = [sanitize_csv_field(str(cell)) for cell in row]
        self._writer.writerow(sanitized)
```

This guarantees sanitization but the spec doesn't mention this approach.

**Assessment:**

This is an **implementation feasibility issue**. The automated static analysis requirement is not achievable with standard Python tooling. The spec should either:

1. **Require runtime enforcement** via a wrapper class (more reliable than static analysis)
2. **Downgrade to manual code review** with strong testing requirements (current "insufficient" claim is too harsh)
3. **Provide a reference implementation** of the custom linter if static analysis is mandatory

The current requirement is aspirational but not practically implementable.

### Issue 6: Windows Permission Verification Requires Dependency, Breaking "No Dependencies" Constraint

**Affected Files:** ["falcon_test/apps/app1/docs/systems/database/schema.md", "falcon_test/apps/app1/docs/design/technical.md"]

**Relevant Text From Docs:**

From technical.md:
```
### Language: Python 3.10+

**Rationale**:
- Target users likely have Python installed (common on macOS/Linux)
- Rich standard library reduces dependencies
- Type hints (3.10+) improve code quality
- Cross-platform without compilation

**Constraint**: Standard library only. No pip dependencies.

[...]

**Windows Deployments with Sensitive Data:**

For Windows deployments requiring database file permission verification, `pywin32` (>=305) is an **optional dependency**. This is NOT a core dependency and is only needed when:
- Deploying on Windows (not needed on Linux/macOS which have native POSIX permission APIs)
- Sensitive data requires permission verification (production security requirement)
- Standard library `os.stat()` is insufficient (Windows ACLs require `pywin32` for detailed inspection)
```

And from schema.md:
```
**CRITICAL - pywin32 REQUIRED for Sensitive Data Deployments:**

Due to the inherent unreliability of icacls parsing (locale-dependent, version-dependent, ambiguous output), **pywin32 (>=305) is a conditional dependency for Windows deployments handling sensitive data** (pricing, supplier information, proprietary SKUs as defined in the Data Classification table). The icacls fallback is only acceptable for non-sensitive deployments on verified English-locale Windows 10/11 systems.

**Dependency Classification:** pywin32 is a *conditional/optional dependency*, not a core dependency. It is required only for:
- Windows systems handling sensitive data (per Data Classification table)
- Windows versions where icacls is unreliable or unavailable (<Windows 10)
- Deployments requiring guaranteed permission verification accuracy

The standard library-only constraint applies to core functionality on Linux/macOS and non-sensitive Windows deployments. pywin32 is an optional platform-specific enhancement for Windows security hardening.
```

**What's Missing/Wrong:**

The specification has a **direct contradiction** between requirements:

1. **"Standard library only. No pip dependencies"** is stated as a hard constraint in technical.md
2. **pywin32 is REQUIRED** for Windows deployments with sensitive data (which the spec defines as including "pricing, supplier information, proprietary SKUs")
3. The vision.md describes the target user as "Sarah, the warehouse manager at a small parts distributor" - a parts distributor almost certainly tracks pricing and supplier information (REQUIRED encryption category)

Therefore, for the **primary target user** (small warehouse managing parts inventory), the application requires pywin32 on Windows, which **violates the "no dependencies" constraint**.

The spec tries to thread this needle by calling pywin32 "optional" but then says it's "REQUIRED for sensitive data" and classifies most real-world inventory data as sensitive. This is inconsistent.

Furthermore:
- The icacls parsing fallback is documented as unreliable ("locale-dependent, version-dependent, ambiguous output")
- The spec requires failing closed (blocking database access) when permission verification fails
- Therefore, on non-English Windows or Windows <10, the application **will not work** without pywin32

**Assessment:**

This is a **fundamental architectural constraint contradiction**. The spec cannot simultaneously require:
- No external dependencies
- Secure Windows deployments
- Support for the target use case (parts distributor with pricing data)

The options are:

1. **Accept pywin32 as a required dependency on Windows** (breaking "no dependencies" constraint)
2. **Remove Windows support entirely** (document as Linux/macOS only)
3. **Downgrade security requirements** to allow icacls-based permission checking as "best effort" without fail-closed behavior
4. **Accept that most real-world Windows deployments will fail** the sensitive data check and require users to use `--acknowledge-no-encryption` flag (poor user experience)

The current specification is not feasible as written.

### Issue 7: Multi-User Environment Detection Requires Unavailable Tools

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md"]

**Relevant Text From Docs:**
```
6. **Multi-User Environment Detection (REQUIRED):**

   To prevent deployment on shared systems without explicit acknowledgment, implementations MUST include startup validation:

   **Automatic Environment Detection:**

   Before database operations, the system MUST detect if the environment allows multi-user access:
   - **Unix/Linux:** Check if parent directory has group or world read permissions (mode & 0o077 != 0) AND multiple users exist in that group (via `getent group`)
   - **Windows:** Check NTFS ACLs for multiple user principals with access to the database directory

   **Implementation Details:**
   - **Responsible Module:** `systems/database/security.py` implements `detect_multiuser_environment()` function
   - **Fallback Behavior:** If `getent` command is unavailable (non-standard systems), fall back to checking only directory permissions (mode & 0o077 != 0). Log warning: "Unable to verify group membership (getent unavailable). Detection based on permissions only."
```

**What's Missing/Wrong:**

The multi-user environment detection has **multiple implementation feasibility problems**:

1. **`getent group` requires glibc**: The spec says to fall back if `getent` is unavailable, but doesn't specify HOW to check group membership without it. On systems like Alpine Linux (musl libc), macOS (uses `dscl` not `getent`), and BSD variants, this command doesn't exist. The fallback is just "check directory permissions" which doesn't actually detect multi-user access.

2. **Directory permissions don't indicate multi-user usage**: A directory with mode 0755 could be:
   - On a single-user laptop where the user is the only non-root account
   - On a multi-user server with dozens of users

   Checking `(mode & 0o077 != 0)` tells you about permission bits, not about actual user count or access patterns.

3. **Windows NTFS ACL checking without pywin32 is the same icacls problem**: The spec says "Check NTFS ACLs for multiple user principals" but doesn't specify how without pywin32. The icacls parsing problems from Issue 6 apply here too.

4. **The detection can be trivially bypassed**: A user who wants to run on a shared system without `--allow-shared-system` can just:
   - Create a directory with 0700 permissions
   - Run the tool from there
   - The tool thinks it's single-user even though it's on a shared server

This "security" feature provides false confidence without actually protecting against the threat (unauthorized users accessing the database).

**Assessment:**

This is an **unimplementable requirement** with standard library tools across all platforms. The options are:

1. **Remove this detection entirely** and rely on documentation warning users about shared systems
2. **Simplify to just permission checking** without attempting to detect actual multi-user usage (current "fallback" behavior should be the only behavior)
3. **Accept that detection is best-effort and easily bypassed** (which undermines the "REQUIRED" language)

The current specification sets an unachievable bar for multi-user detection.

### Issue 8: Pagination Response Schema Breaks JSON Backward Compatibility

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md", "falcon_test/apps/app1/docs/design/use-cases.md"]

**Relevant Text From Docs:**

From technical.md:
```
### JSON Format with Pagination Metadata

When `--format json` is used with paginated commands, the response includes both data and metadata:

```json
{
  "data": [
    {
      "sku": "WH-001",
      "name": "Widget A",
      "quantity": 100,
      "location": "Aisle-A"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "count": 1,
    "total": 150,
    "has_more": true
  }
}
```
```

But from use-cases.md:
```
**Observable distinction between found vs not-found:**
| State | Exit Code | stdout (JSON format) | stdout (table format) |
|-------|-----------|----------------------|----------------------|
| Item exists | 0 | `[{"sku": "WH-123", ...}]` (array with 1 element) | Table with 1 row |
| Item not found | 0 | `{"results": [], "meta": {"criteria": "--sku 'WH-123'", "count": 0}}` | "No items found matching criteria: [--sku 'WH-123']" |

**JSON empty result format:** When no items match, JSON output includes a `meta` field with the search criteria and count, providing the same context as table format. For backward compatibility with scripts expecting bare `[]`, use `--format json-compact` to get the legacy format.
```

**What's Missing/Wrong:**

The JSON output format has **three different incompatible schemas** described in different parts of the spec:

1. **Schema A** (from technical.md pagination): `{"data": [...], "pagination": {...}}`
2. **Schema B** (from use-cases.md): `{"results": [], "meta": {...}}`
3. **Schema C** (legacy format): `[...]` (bare array)

The key problems:

1. **Schema A and B are different**: One uses `"data"` and `"pagination"`, the other uses `"results"` and `"meta"`. Which one is correct?

2. **The spec claims "backward compatibility" via `--format json-compact`** but this breaks the stability guarantee from cli/interface.md:
```
| JSON output field names | **Stable API** | Existing field names will NOT be renamed or removed within major versions |
```

If the default output changes from `[...]` to `{"data": [...]}`, existing scripts using `jq .[0].sku` will break, violating the stability guarantee.

3. **Three output formats for the same command is a maintenance nightmare**: The code must maintain parallel formatting logic for:
   - Bare array (legacy)
   - Wrapped with pagination metadata
   - Wrapped with search metadata

This violates the principle of having a single JSON schema per command.

**Assessment:**

This is a **backward compatibility feasibility issue**. The spec cannot simultaneously:
- Add pagination/metadata to JSON output
- Maintain backward compatibility with scripts expecting bare arrays
- Guarantee field names won't change

The options are:

1. **Breaking change (recommended)**: JSON output ALWAYS includes metadata wrapper, increment major version, document migration guide
2. **Parallel format flags**: `--format json` (bare array, deprecated), `--format json-v2` (with metadata), plan to remove `json` in v2.0
3. **Version detection in output**: Include `"schema_version": "1.0"` in all JSON output, allow scripts to adapt

The current approach of trying to support both formats simultaneously is not feasible.

## Summary

The warehouse inventory CLI has a fundamentally sound architecture (SQLite-backed, CLI interface, secure file permissions), but contains multiple feasibility issues that will prevent it from working as specified:

**Critical Issues (Must Fix):**
- Issue 2: Network filesystem detection will not work, leading to data corruption
- Issue 3: Performance targets impossible with CLI architecture
- Issue 6: Windows support requires pywin32 dependency, breaking "no dependencies" constraint

**Significant Issues (Should Fix):**
- Issue 4: Rate limiting architecturally wrong for CLI tool
- Issue 7: Multi-user detection unimplementable with standard library
- Issue 8: Multiple incompatible JSON schemas break backward compatibility

**Minor Issues (Can Work Around):**
- Issue 1: Python version compatibility documentation inconsistencies
- Issue 5: Automated CSV sanitization enforcement not achievable with standard tools

**Recommendation:** The spec requires significant revision in the areas of filesystem safety, Windows support dependencies, and performance target realism before implementation can proceed.
