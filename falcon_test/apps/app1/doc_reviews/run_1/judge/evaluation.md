# Judge Evaluation

## Finding Evaluations

---

### Finding: design/1 - Missing delete-item command design

**Scout Assessment:**
- Severity: HIGH
- Blocking: BLOCKING
- Confidence: HIGH

**My Verification:**
I checked interface.md for all command specifications. The documented commands are: `init`, `add-item`, `update-stock`, `search`, `low-stock-report`, `export-csv`, and `config show`. I also searched for "delete", "remove-item", or "discontinue" across all documentation. No delete functionality exists.

**Determination:** CONFIRMED

**Final Severity:** HIGH
**Final Blocking:** BLOCKING
**Confidence:** 0.95

**Reasoning:**
The scout is correct. While `update-stock --set 0` can zero out inventory, there is no mechanism to actually remove a SKU record from the database. For a warehouse system, obsolete SKUs accumulate over time, creating database bloat and cluttering search results. This is a genuine gap for real-world usage.

**Required Action:**
Add a `delete-item` command specification in interface.md with:
- Syntax: `warehouse-cli delete-item --sku SKU [--confirm]`
- Behavior when quantity > 0 (require --force or error)
- Exit codes and error messages
- Corresponding use case in use-cases.md

---

### Finding: design/2 - min_stock_level update mechanism undefined

**Scout Assessment:**
- Severity: HIGH
- Blocking: BLOCKING
- Confidence: HIGH

**My Verification:**
I verified in interface.md that `add-item` has `--min-stock` option (default 10), but `update-stock` only supports `--set`, `--add`, `--remove` for quantity changes. Schema.md confirms min_stock_level is a modifiable field. There is no command to update this value post-creation.

**Determination:** CONFIRMED

**Final Severity:** HIGH
**Final Blocking:** BLOCKING
**Confidence:** 0.95

**Reasoning:**
Scout is correct. Reorder points (min_stock_level) need adjustment over time as demand patterns change. Currently users would need direct database access to modify this value. This is a functional gap that impacts the low-stock-report utility.

**Required Action:**
Either extend `update-stock` with `--min-stock` option, or create a new `update-item` command for non-quantity field modifications.

---

### Finding: design/3 - Batch import feature mentioned but no native command designed

**Scout Assessment:**
- Severity: HIGH
- Blocking: BLOCKING
- Confidence: HIGH

**My Verification:**
UC1 in use-cases.md explicitly states "this CLI does not have a native batch import command" and provides extensive security warnings about command injection when using shell loops. It provides a secure bash script pattern as a workaround.

**Determination:** MODIFIED

**Final Severity:** MEDIUM
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.85

**Reasoning:**
The documentation explicitly acknowledges this is not provided and provides a secure workaround with detailed security guidance. This is a deliberate design decision, not an oversight. The documentation includes:
- A complete secure batch import script
- Security warnings about command injection
- Test data requirements for batch operations
- Error handling guidance

While a native command would be safer, the documentation provides adequate mitigation. This is a design choice, not a gap. However, documenting WHY this is a non-goal would improve clarity.

**Required Action:**
Add explicit rationale for why native batch import is not provided (e.g., "standard library only constraint", "complexity vs. usage frequency trade-off").

---

### Finding: design/4 - config show command referenced but not specified

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: HIGH

**My Verification:**
In interface.md lines 410-423, I found:
- Line 410: "Quick check: Run `warehouse-cli config show` to display the current database path"
- Line 415-423: A complete specification exists with syntax, output format, and behavior description.

**Determination:** DISMISSED

**Final Severity:** N/A
**Final Blocking:** N/A
**Confidence:** 0.95

**Reasoning:**
The scout missed the specification. Interface.md lines 415-423 explicitly specify `config show`:
```
**`config show` Command (REQUIRED):**
warehouse-cli config show
Displays current configuration including:
- Database path (with existence check)
- Whether WAREHOUSE_DB environment variable is set
- Verbose mode status
This command does NOT require database access and always exits with code 0.
```

The specification is present, though not in the same detailed format as other commands. It has sufficient detail for implementation.

**Required Action:**
n/a

---

### Finding: design/5 - Item editing beyond stock quantity not designed

**Scout Assessment:**
- Severity: HIGH
- Blocking: BLOCKING
- Confidence: HIGH

**My Verification:**
I checked interface.md for all commands. `update-stock` only modifies quantity. No `update-item` or `edit-item` command exists for modifying name, description, or location after creation.

**Determination:** CONFIRMED

**Final Severity:** HIGH
**Final Blocking:** BLOCKING
**Confidence:** 0.95

**Reasoning:**
Scout is correct. Real warehouses frequently need to:
- Correct data entry typos in names/descriptions
- Update location when items are moved
- Modify descriptions with additional information

Currently, the only option is direct database manipulation or delete-and-recreate (which loses audit trail via created_at).

**Required Action:**
Design an `update-item` command that allows modification of: name, description, location, and min_stock_level. SKU should remain immutable as the primary identifier.

---

### Finding: design/6 - Low-stock report pagination behavior undefined

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: MEDIUM

**My Verification:**
Technical.md line 432 states: "low-stock-report | <100ms | 50,000 items | **Yes (limit=100 default, max=1000)**"

Interface.md low-stock-report section (which I confirmed exists) does not show --limit or --offset options in its syntax specification, though technical.md indicates pagination is required.

**Determination:** CONFIRMED

**Final Severity:** MEDIUM
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.85

**Reasoning:**
There is an inconsistency: technical.md requires pagination for low-stock-report, but interface.md does not specify the pagination options for this command. This needs reconciliation.

**Required Action:**
Either add --limit and --offset options to low-stock-report in interface.md, or clarify in technical.md that low-stock results are typically small enough to not require pagination.

---

### Finding: design/7 - Search result sorting not specified

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: MEDIUM

**My Verification:**
I checked interface.md search command specification. No --sort or --order options are documented. No default sort order is specified.

**Determination:** CONFIRMED

**Final Severity:** LOW
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.80

**Reasoning:**
Scout is correct that sorting is not specified. However, for a basic CLI tool, this is a nice-to-have rather than blocking. The implicit SQLite ordering (likely rowid/insertion order) is predictable. Reducing severity to LOW as this doesn't prevent core functionality.

**Required Action:**
Document the default sort order (e.g., "Results are returned in insertion order"). Optionally add --sort-by option for future enhancement.

---

### Finding: design/8 - Database backup/restore not designed

**Scout Assessment:**
- Severity: HIGH
- Blocking: BLOCKING
- Confidence: HIGH

**My Verification:**
I searched for "backup" and "restore" across all docs. Found extensive references in ARCHITECTURE-simple.md:
- Line 899: "Configure automated backup schedule (see Disaster Recovery) - REQUIRED"
- Lines 1846-1900+: Detailed disaster recovery runbook with backup/restore procedures
- Lines 1020: "Create a database backup before any upgrade"

The documentation extensively covers backup/restore in the operational context but not as CLI commands.

**Determination:** MODIFIED

**Final Severity:** MEDIUM
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.85

**Reasoning:**
The scout overstates the gap. ARCHITECTURE-simple.md contains extensive disaster recovery documentation including:
- Backup procedures using standard file copying
- Restore procedures with integrity verification
- Scripts for backup/restore operations

The design relies on SQLite's file-based nature for backup (simple file copy). While native CLI commands would be convenient, the documentation provides adequate operational guidance. This is a design choice rather than an oversight.

**Required Action:**
Consider adding `backup` and `restore` commands for user convenience, but the current documentation provides adequate workaround. Add a note in interface.md pointing to the disaster recovery section in ARCHITECTURE-simple.md.

---

### Finding: design/9 - SQLCipher encryption integration referenced but not designed

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: HIGH

**My Verification:**
Schema.md lines 34-83 contain extensive encryption documentation including:
- Data classification guidance (when encryption is REQUIRED)
- Environment variables: WAREHOUSE_CONTAINS_SENSITIVE_DATA, WAREHOUSE_ENCRYPTION_KEY
- Startup validation requirements
- --acknowledge-no-encryption bypass flag
- Code example for SQLCipher integration

**Determination:** MODIFIED

**Final Severity:** LOW
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.85

**Reasoning:**
The scout is partially correct that interface.md doesn't document encryption options. However, schema.md provides comprehensive encryption specification including environment variable configuration. The design deliberately uses environment variables rather than CLI flags for encryption keys (which is a security best practice - keys shouldn't be passed as command line arguments).

The gap is documentation linkage, not missing design.

**Required Action:**
Add a reference in interface.md pointing to the encryption configuration in schema.md. Consider documenting the WAREHOUSE_ENCRYPTION_KEY environment variable in the interface.md Environment Variables section.

---

### Finding: design/10 - Interactive quick actions implementation undefined

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: MEDIUM

**My Verification:**
Errors.md lines 1037-1050 specify the interactive quick actions feature in detail:
- Required for TTY (disable with --no-interactive)
- Shows prompt UI with numbered options
- Explicitly states "This feature is REQUIRED when a TTY is detected"

**Determination:** MODIFIED

**Final Severity:** LOW
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.80

**Reasoning:**
The errors.md document specifies the interactive feature in detail. The scout's concern about --no-interactive not being in interface.md is valid but minor. The feature is adequately designed in errors.md. The global options in interface.md should include --no-interactive for completeness.

**Required Action:**
Add --no-interactive to the Global Options section in interface.md with reference to the interactive quick actions behavior in errors.md.

---

### Finding: architecture/1 - SQLite minimum version not testable/enforced

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: HIGH

**My Verification:**
Technical.md lines 59-63 specify SQLite 3.24.0 minimum with only a manual verification command. No runtime check is documented.

**Determination:** CONFIRMED

**Final Severity:** MEDIUM
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.90

**Reasoning:**
Scout is correct. The documentation specifies the requirement but provides no enforcement mechanism. A runtime check should be added to database.py initialization.

**Required Action:**
Add startup validation check specification that compares `sqlite3.sqlite_version_info` against `(3, 24, 0)` and raises a clear error if below minimum.

---

### Finding: architecture/2 - SQLCipher dependency version unspecified

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: HIGH

**My Verification:**
Schema.md line 77 mentions "requires pysqlcipher3 or sqlcipher binary" but no version is specified.

**Determination:** CONFIRMED

**Final Severity:** LOW
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.85

**Reasoning:**
Scout is correct, but this is an optional dependency for an optional feature. The core application has zero external dependencies by design. Reducing to LOW severity.

**Required Action:**
If SQLCipher documentation is retained, specify recommended version (e.g., pysqlcipher3>=1.2.0).

---

### Finding: architecture/3 - pywin32 dependency version unspecified

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: HIGH

**My Verification:**
Schema.md discusses pywin32 as a fallback for Windows permission verification but no version is specified.

**Determination:** CONFIRMED

**Final Severity:** LOW
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.85

**Reasoning:**
Scout is correct. This is an optional dependency used as fallback. Low severity as it doesn't affect core functionality.

**Required Action:**
Specify minimum pywin32 version if the fallback is documented (e.g., pywin32>=305).

---

### Finding: architecture/4 - import-linter tool version not pinned

**Scout Assessment:**
- Severity: LOW
- Blocking: NON_BLOCKING
- Confidence: MEDIUM

**My Verification:**
ARCHITECTURE-simple.md references import-linter for CI enforcement without version specification.

**Determination:** CONFIRMED

**Final Severity:** LOW
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.80

**Reasoning:**
Scout is correct. Dev tooling should have pinned versions for reproducibility.

**Required Action:**
Pin import-linter version in development dependencies documentation.

---

### Finding: feasibility/1 - SearchRateLimiter singleton is ineffective for CLI invocation model

**Scout Assessment:**
- Severity: HIGH
- Blocking: BLOCKING
- Confidence: HIGH

**My Verification:**
Technical.md lines 375-419 shows SearchRateLimiter using in-memory state (threading.Semaphore, deque). Each CLI invocation is a new process, so this state resets per command.

**Determination:** CONFIRMED

**Final Severity:** HIGH
**Final Blocking:** BLOCKING
**Confidence:** 0.95

**Reasoning:**
Scout is absolutely correct. This is a fundamental architectural flaw. The rate limiter documentation implies protection that cannot exist in the CLI execution model. Each `warehouse-cli search` invocation is a fresh process with a fresh rate limiter. The documented "100 searches per minute" limit is unenforceable.

**Required Action:**
Either:
1. Implement SQLite-based rate limiting (add rate_limits table)
2. Implement file-based locking with timestamps
3. Remove the rate limiting requirement and document that per-process rate limiting is not feasible for CLI
4. Reframe the requirement as "per-invocation" limits only

---

### Finding: feasibility/2 - Cross-platform timeout thread cannot actually be killed

**Scout Assessment:**
- Severity: HIGH
- Blocking: BLOCKING
- Confidence: HIGH

**My Verification:**
Schema.md lines 782-807 shows the timeout implementation using conn.interrupt() which is "best effort". The thread continues if interrupt doesn't work.

**Determination:** MODIFIED

**Final Severity:** MEDIUM
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.80

**Reasoning:**
Scout identifies a real limitation. However:
1. conn.interrupt() is the standard SQLite approach and works for most query types
2. SQLite queries are typically I/O bound and respond to interrupts
3. For a CLI tool (short-lived process), leaked threads die when process exits
4. The documentation does acknowledge this is a timeout mechanism, not guaranteed termination

This is a known limitation of Python threading, not a design flaw. Reducing severity as the impact is limited for CLI usage.

**Required Action:**
Document that timeout is "best effort" and may not terminate all query types. For CLI usage, process termination handles cleanup.

---

### Finding: feasibility/3 - Windows permission verification via icacls parsing is unreliable

**Scout Assessment:**
- Severity: HIGH
- Blocking: BLOCKING
- Confidence: HIGH

**My Verification:**
Schema.md lines 397-408 acknowledge icacls parsing limitations including locale dependency. The documentation recommends pywin32 as fallback.

**Determination:** MODIFIED

**Final Severity:** MEDIUM
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.80

**Reasoning:**
The documentation explicitly acknowledges this limitation (lines 397-408) and provides:
1. Version-specific handling guidance
2. pywin32 fallback recommendation
3. Fail-closed behavior on parsing errors

The design addresses this through defense in depth. The "fail closed" approach means if icacls fails, access is denied. This is acceptable security posture.

**Required Action:**
Strengthen the recommendation to make pywin32 a hard dependency for Windows deployments with sensitive data. Currently it's SHOULD, could be elevated to MUST.

---

### Finding: feasibility/4 - Rate limiter thread safety contradicts documented concurrent connection limit

**Scout Assessment:**
- Severity: HIGH
- Blocking: BLOCKING
- Confidence: MEDIUM

**My Verification:**
Technical.md line 348: "Maximum 10 concurrent search operations"
Technical.md line 507: "Maximum 3 concurrent database connections per process"

The scout notes these appear contradictory.

**Determination:** MODIFIED

**Final Severity:** LOW
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.75

**Reasoning:**
This contradiction exists in the documentation, but in practice:
1. Each CLI invocation is a separate process
2. Within a single process, there's typically only one operation
3. The "10 concurrent searches" limit is per-database (across processes), while "3 connections" is per-process

The confusion arises from mixing process-level and database-level constraints. However, given Finding feasibility/1 (rate limiter is ineffective anyway), this inconsistency is moot.

**Required Action:**
Clarify the distinction between per-process and per-database limits. Or remove the ineffective rate limiting documentation entirely.

---

### Finding: feasibility/5 - Retry budget mechanism incompatible with short-lived CLI process model

**Scout Assessment:**
- Severity: HIGH
- Blocking: BLOCKING
- Confidence: HIGH

**My Verification:**
Errors.md lines 509-580 shows ProcessRetryBudget using in-memory deque for retry tracking. Same fundamental issue as Finding feasibility/1.

**Determination:** CONFIRMED

**Final Severity:** HIGH
**Final Blocking:** BLOCKING
**Confidence:** 0.95

**Reasoning:**
Scout is correct. This is the same architectural mismatch as the rate limiter. The "20 retries per 60-second window" budget resets with each CLI invocation. The documented DoS protection is ineffective.

**Required Action:**
Same as feasibility/1: Either implement persistent state tracking or remove/reframe the DoS protection claims.

---

### Finding: feasibility/6 - FTS5 trigger synchronization creates unbounded write amplification

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: HIGH

**My Verification:**
Schema.md lines 690-707 shows FTS5 triggers. Use-cases.md line 70 specifies "10,000 items | completion < 5 minutes" for large batch imports.

**Determination:** CONFIRMED

**Final Severity:** MEDIUM
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.85

**Reasoning:**
Scout correctly identifies that FTS5 triggers double write operations. However:
1. FTS5 is documented as optional ("RECOMMENDED for production at scale")
2. The 5-minute target for 10K items is achievable even with 2x writes
3. Performance impact should be documented

**Required Action:**
Add performance impact note to FTS5 section. Consider documenting bulk import procedure that disables triggers and rebuilds index afterward.

---

### Finding: feasibility/7 - Memory budget check with sys.getsizeof is unreliable

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: HIGH

**My Verification:**
Technical.md lines 541-554 shows check_memory_budget using sys.getsizeof(results) which only measures container size, not contents.

**Determination:** CONFIRMED

**Final Severity:** MEDIUM
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.90

**Reasoning:**
Scout is correct. sys.getsizeof on a list returns only the list overhead (~8KB for 1000 items), not the actual data. The 10MB check is ineffective.

**Required Action:**
Either:
1. Use row-count-based limits (already enforced via pagination at 1000 rows)
2. Use deep size calculation
3. Document that pagination limit (1000 rows) is the actual memory control mechanism

---

### Finding: feasibility/8 - Conflicting exit codes for SecurityError and ItemNotFoundError

**Scout Assessment:**
- Severity: MEDIUM
- Blocking: NON_BLOCKING
- Confidence: HIGH

**My Verification:**
I checked multiple documents:
- Vision.md line 52-53: "Exit code: 3 (security/permission error)"
- Errors.md lines 117, 138-143: ItemNotFoundError exit_code=3, SecurityError exit_code=2
- Components.md lines 285, 299-304: Same as errors.md

**Determination:** CONFIRMED

**Final Severity:** MEDIUM
**Final Blocking:** NON_BLOCKING
**Confidence:** 0.95

**Reasoning:**
Scout is correct. There is a documentation inconsistency:
- Vision.md says SecurityError should be exit code 3
- Errors.md and components.md say SecurityError is exit code 2, ItemNotFoundError is exit code 3

The errors.md specification appears to be the authoritative source (more detailed, marked FINAL). Vision.md needs updating.

**Required Action:**
Update vision.md line 53 to reflect that SecurityError uses exit code 2 (matching errors.md and components.md which are marked FINAL).

---

### Finding: api_schema/1-7 - All PASS findings

**Scout Assessment:**
All findings were PASS (no gaps found)

**My Verification:**
The API/Schema scout correctly identified this as a CLI-only application and found complete specifications for:
- Product schema
- LowStockItem schema
- All CLI commands
- JSON output formats
- Error codes
- Pagination
- Validation rules

**Determination:** CONFIRMED (no action needed)

**Final Severity:** N/A
**Final Blocking:** N/A
**Confidence:** 0.95

**Reasoning:**
The API/Schema scout correctly assessed the documentation as comprehensive for CLI specifications. No gaps identified means no action required.

**Required Action:**
n/a

---

## Summary Table

| Category | Finding # | Title | Scout Severity | Determination | Final Severity |
|----------|-----------|-------|----------------|---------------|----------------|
| design | 1 | Missing delete-item command design | HIGH | CONFIRMED | HIGH |
| design | 2 | min_stock_level update mechanism undefined | HIGH | CONFIRMED | HIGH |
| design | 3 | Batch import feature mentioned but no native command | HIGH | MODIFIED | MEDIUM |
| design | 4 | config show command referenced but not specified | MEDIUM | DISMISSED | N/A |
| design | 5 | Item editing beyond stock quantity not designed | HIGH | CONFIRMED | HIGH |
| design | 6 | Low-stock report pagination behavior undefined | MEDIUM | CONFIRMED | MEDIUM |
| design | 7 | Search result sorting not specified | MEDIUM | CONFIRMED | LOW |
| design | 8 | Database backup/restore not designed | HIGH | MODIFIED | MEDIUM |
| design | 9 | SQLCipher encryption integration referenced but not designed | MEDIUM | MODIFIED | LOW |
| design | 10 | Interactive quick actions implementation undefined | MEDIUM | MODIFIED | LOW |
| architecture | 1 | SQLite minimum version not testable/enforced | MEDIUM | CONFIRMED | MEDIUM |
| architecture | 2 | SQLCipher dependency version unspecified | MEDIUM | CONFIRMED | LOW |
| architecture | 3 | pywin32 dependency version unspecified | MEDIUM | CONFIRMED | LOW |
| architecture | 4 | import-linter tool version not pinned | LOW | CONFIRMED | LOW |
| feasibility | 1 | SearchRateLimiter singleton ineffective for CLI model | HIGH | CONFIRMED | HIGH |
| feasibility | 2 | Cross-platform timeout thread cannot be killed | HIGH | MODIFIED | MEDIUM |
| feasibility | 3 | Windows permission verification via icacls unreliable | HIGH | MODIFIED | MEDIUM |
| feasibility | 4 | Rate limiter contradicts concurrent connection limit | HIGH | MODIFIED | LOW |
| feasibility | 5 | Retry budget mechanism incompatible with CLI model | HIGH | CONFIRMED | HIGH |
| feasibility | 6 | FTS5 trigger creates write amplification | MEDIUM | CONFIRMED | MEDIUM |
| feasibility | 7 | Memory budget check with sys.getsizeof unreliable | MEDIUM | CONFIRMED | MEDIUM |
| feasibility | 8 | Conflicting exit codes for SecurityError | MEDIUM | CONFIRMED | MEDIUM |
| api_schema | 1-7 | All specifications complete | N/A | CONFIRMED | N/A |

## Statistics

- Total findings evaluated: 22 (excluding 7 PASS findings from api_schema)
- **Confirmed:** 14 (proceed to fix as described)
- **Dismissed:** 1 (config show - specification exists, scout missed it)
- **Modified:** 7 (proceed to fix with adjusted severity/approach)

## Blocking Issues Summary

The following findings are BLOCKING and should be addressed before implementation:

1. **design/1** - Missing delete-item command (HIGH)
2. **design/2** - No min_stock_level update mechanism (HIGH)
3. **design/5** - No item editing capability (HIGH)
4. **feasibility/1** - Rate limiter architecture fundamentally broken for CLI (HIGH)
5. **feasibility/5** - Retry budget architecture fundamentally broken for CLI (HIGH)

## Key Architectural Issue

Findings feasibility/1 and feasibility/5 represent the same fundamental architectural mismatch: **the documentation describes security mechanisms (rate limiting, retry budgets) that use in-memory state, but the CLI execution model creates a new process for each command, resetting this state**. This renders the documented DoS protections ineffective.

**Recommendation:** Either implement persistent state (file-based or SQLite table) for these security mechanisms, or remove/reframe the security claims to accurately reflect what the CLI model can actually enforce.
