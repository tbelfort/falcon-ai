# Design Completeness Scout Report

## Assessment: ISSUES_FOUND

The documentation is comprehensive and well-structured, but several critical implementation details are missing or underspecified, which will cause significant ambiguity during implementation. Most notably, the soft-delete feature, security module implementation, and disaster recovery procedures lack the necessary detail for developers to implement without making assumptions.

## Issues

### Issue 1: Soft Delete Feature Incomplete - Missing Database Schema

**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md"]

**Relevant Text From Docs:**
```
## UC9: Deleting or Discontinuing Items

**Soft delete option:**
For audit compliance, use `--soft-delete` flag to mark items as inactive rather than removing:
- `warehouse-cli delete-item --sku "WH-123" --soft-delete`
- stdout displays: `Marked as discontinued: SKU '{sku}' ({name})`
- Item remains in database with `status = 'discontinued'` and `discontinued_at` timestamp
- **Note**: The database schema columns `status` (TEXT) and `discontinued_at` (TIMESTAMP) are defined in `schema.md`. When implementing, ensure these columns are added to the `products` table. Queries should filter out discontinued items by default unless `--include-discontinued` flag is specified.
```

**What's Missing/Wrong:**

The use case mentions that `status` and `discontinued_at` columns are "defined in schema.md", but these columns are NOT present in the Products Table definition in technical.md:

From technical.md Data Model section:
```
| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| sku | TEXT | UNIQUE NOT NULL |
| name | TEXT | NOT NULL |
| description | TEXT | nullable |
| quantity | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 AND <= 999999999 |
| min_stock_level | INTEGER | NOT NULL, DEFAULT 10, CHECK >= 0 AND <= 999999999 |
| location | TEXT | nullable |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |
```

The `status` and `discontinued_at` columns are missing from this schema. An implementer would be confused about:
1. What are the allowed values for the `status` column? (Just 'discontinued'? Or are there other statuses like 'active'?)
2. Should there be a default value for `status`?
3. Should `discontinued_at` be nullable? What's its default?
4. Do these columns need indexes?
5. How should migration work for existing databases without these columns?

**Assessment:**
This is likely to **block implementation**. The developer would either have to:
- Make assumptions about the schema design (risk of inconsistency)
- Go back and request clarification (delays)
- Skip implementing the soft-delete feature entirely

### Issue 2: Security Module Location and Boundaries Unclear

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md", "falcon_test/apps/app1/docs/design/components.md"]

**Relevant Text From Docs:**

From technical.md:
```
**Permission Verification Implementation:**
- **Function:** `verify_secure_permissions(db_path: Path) -> None` in `systems/database/security.py`
- **Atomic Permission Setting:** Uses `os.open()` with O_CREAT | O_EXCL for new files, then sets permissions via `os.chmod()` in same operation (race condition prevention)
```

And also:
```
**Implementation Details:**
- **Responsible Module:** `systems/database/security.py` implements `detect_multiuser_environment()` function
```

**What's Missing/Wrong:**

The components.md file shows the complete module structure:
```
warehouse_cli/
├── __init__.py
├── __main__.py
├── cli.py
├── commands.py
├── database.py
├── models.py
├── formatters.py
└── exceptions.py
```

There is NO `security.py` module listed in the component structure. The technical documentation references `systems/database/security.py` as if it exists, but:
1. Is this a new module that needs to be created?
2. Where does it fit in the dependency graph?
3. What functions should it export?
4. Should other modules import from it, or does it provide internal utilities only used by database.py?

The components.md dependency graph doesn't show where security.py would fit:
```
__main__.py
  └── cli.py
        ├── commands.py
        │     ├── database.py
        │     │     ├── models.py
        │     │     └── exceptions.py
        │     ├── models.py
        │     └── exceptions.py
        ├── formatters.py
        │     └── models.py
        └── exceptions.py
```

**Assessment:**
This is a **moderate blocker**. An implementer would need to:
- Decide whether to create a new security.py module or embed these functions in database.py
- Understand how this affects the "no circular dependencies" constraint
- Determine if security.py is a leaf module (like exceptions.py) or imports from database.py

### Issue 3: Encryption Configuration Implementation Details Missing

**Affected Files:** ["falcon_test/apps/app1/docs/systems/database/schema.md"]

**Relevant Text From Docs:**
```
**REQUIRED: Encryption Enforcement Mechanism**

Implementations MUST validate encryption configuration at startup when sensitive data is declared:

1. **Environment Variable:** `WAREHOUSE_CONTAINS_SENSITIVE_DATA=true` signals deployment contains REQUIRED-category data
2. **Startup Check:** If sensitive data flag is set, verify `WAREHOUSE_ENCRYPTION_KEY` environment variable exists
3. **Failure Behavior:** If sensitive data declared but encryption not configured:
   ```
   SecurityError: Sensitive data deployment requires encryption.
   ...
   ```
4. **Override Flag:** `--acknowledge-no-encryption` allows explicit bypass with logged warning
```

And:
```
**To enable database encryption:**
```python
# Example with SQLCipher (requires pysqlcipher3>=1.2.0 or sqlcipher binary)
import sqlite3
conn = sqlite3.connect(db_path)
conn.execute(f"PRAGMA key = '{encryption_key}'")
```
```

**What's Missing/Wrong:**

1. **Where does this startup check run?** The documentation says "implementations MUST validate encryption configuration at startup" but doesn't specify:
   - Which module performs this check? (cli.py? database.py? a new security.py?)
   - When exactly in the startup sequence? (Before argument parsing? After? In main()?)

2. **The example code is insecure:** The encryption example uses f-string interpolation for the encryption key:
   ```python
   conn.execute(f"PRAGMA key = '{encryption_key}'")
   ```
   This violates the AD4 architecture decision about parameterized queries. While PRAGMA statements might be an exception, the documentation should clarify this or show a safer approach.

3. **Dependency conflict:** The documentation says "Standard library only. No pip dependencies" (technical.md), but the encryption example requires `pysqlcipher3>=1.2.0`. How is this resolved?
   - Is encryption an optional feature that requires manual dependency installation?
   - Should the startup check fail gracefully if pysqlcipher3 is not available?
   - What's the fallback behavior?

4. **Missing key management specification:**
   - How should `WAREHOUSE_ENCRYPTION_KEY` be formatted? (Raw string? Base64? Hex?)
   - What's the minimum key length?
   - Where is the key validation logic?

**Assessment:**
This is likely to **block implementation** of the encryption feature. Without clarity on:
- Where the startup check lives in the codebase
- How to handle the external dependency conflict
- Secure key handling patterns

An implementer would make inconsistent choices or skip the encryption feature.

### Issue 4: Disaster Recovery Procedures Referenced But Not Defined

**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md"]

**Relevant Text From Docs:**
```
## UC10: Database Backup and Restore

**Note**: For comprehensive backup and restore procedures, including automated backup scheduling, off-site storage recommendations, and disaster recovery runbooks, see the **Disaster Recovery** section in `ARCHITECTURE-simple.md`.

This use case provides a quick reference for common backup operations.
```

And later:
```
**See also**: `ARCHITECTURE-simple.md` - Disaster Recovery section for:
- Automated backup cron schedules
- Backup retention policies
- Point-in-time recovery procedures
- Off-site backup recommendations
```

**What's Missing/Wrong:**

The documentation repeatedly references a "Disaster Recovery" section in ARCHITECTURE-simple.md, but this section does NOT exist in the systems documentation. I only saw the first 200 lines of ARCHITECTURE-simple.md due to file size, but there's no indication of where this critical operational documentation lives.

An implementer trying to set up production deployments would need:
1. **Automated backup cron schedules** - What's the recommended frequency? What's the backup command?
2. **Backup retention policies** - How many backups to keep? When to rotate?
3. **Point-in-time recovery procedures** - How to restore from a specific backup?
4. **Off-site backup recommendations** - What tools/services are recommended?

Without this information:
- Production deployments would lack proper backup procedures
- Users wouldn't know how to recover from data loss
- SysAdmins couldn't implement appropriate DR policies

**Assessment:**
This is a **moderate blocker** for production deployments. While not blocking initial implementation, any production use would require this documentation. The fact that it's referenced multiple times but doesn't exist suggests it was intended to be written but was missed.

### Issue 5: Rate Limiter Implementation Incomplete for CLI Context

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md"]

**Relevant Text From Docs:**
```
**Rate Limit Enforcement Implementation:**

**IMPORTANT - CLI Invocation Model Limitation:**

The in-memory `SearchRateLimiter` class shown below is effective ONLY for long-running server processes or multi-threaded applications. For CLI tools where each command invocation is a separate process, in-memory rate limiting state resets on each invocation, making it ineffective.

**For CLI applications, choose one of these approaches:**

a. **SQLite-based rate limiting (RECOMMENDED for CLI):** Store rate limit state in a dedicated SQLite table:
   ```python
   def acquire_rate_limit_sqlite(db_path: str, operation: str, max_per_minute: int = 100) -> bool:
       """Check rate limit using persistent SQLite storage.

       Creates/uses a rate_limits table to track operation timestamps across CLI invocations.
       """
       with get_connection(db_path) as conn:
           # Clean old entries
           conn.execute(
               "DELETE FROM rate_limits WHERE timestamp < datetime('now', '-60 seconds')"
           )
           # Check current count
           count = conn.execute(
               "SELECT COUNT(*) FROM rate_limits WHERE operation = ?",
               (operation,)
           ).fetchone()[0]
           if count >= max_per_minute:
               return False
           # Record this operation
           conn.execute(
               "INSERT INTO rate_limits (operation, timestamp) VALUES (?, datetime('now'))",
               (operation,)
           )
           return True
   ```

b. **File-based locking:** Use a lock file with timestamps for simpler deployments.

c. **Remove rate limiting claims:** If neither persistent approach is implemented, remove the security claims about rate limiting from documentation to accurately reflect CLI model limitations.
```

**What's Missing/Wrong:**

The documentation acknowledges that rate limiting is problematic for CLI invocations and provides three options (SQLite-based, file-based, or remove the claim), but:

1. **No definitive choice is made:** The spec says "choose one of these approaches" but doesn't specify which one MUST be implemented. This leaves the implementer to make an architectural decision.

2. **Missing schema definition:** If SQLite-based rate limiting is chosen (marked as RECOMMENDED), the `rate_limits` table schema is not defined anywhere:
   - What are the column definitions?
   - What indexes are needed?
   - Is this table created during `init`?
   - What about migration for existing databases?

3. **Incomplete code snippet:** The provided function uses `get_connection()` context manager but doesn't handle:
   - What if the rate_limits table doesn't exist? (No CREATE TABLE IF NOT EXISTS)
   - Error handling for database locks during rate limit checks
   - Cleanup of old entries across multiple concurrent CLI invocations

4. **Concurrent access issue:** The rate limiting code has a race condition:
   ```python
   # Check current count
   count = conn.execute(...).fetchone()[0]
   if count >= max_per_minute:
       return False
   # Record this operation
   conn.execute("INSERT INTO rate_limits ...")
   ```

   Between checking the count and inserting, another CLI invocation could insert a record, causing the limit to be exceeded. This needs a transaction with BEGIN IMMEDIATE or a unique constraint + conflict resolution.

**Assessment:**
This is a **moderate blocker**. An implementer would face:
- Unclear decision: Should rate limiting be implemented at all for v1?
- If yes, incomplete schema and race condition handling
- If no, which security claims in the documentation need to be removed?

The documentation's honesty about the limitation is good, but leaving the implementation decision open creates ambiguity.

### Issue 6: Search Pagination Implementation Details Missing

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md", "falcon_test/apps/app1/docs/design/use-cases.md"]

**Relevant Text From Docs:**

From technical.md:
```
**Pagination Requirements (MANDATORY for search/low-stock-report):**
- Default `limit`: 100 results per query
- Maximum `limit`: 1000 results (enforced at application layer)
- Default `offset`: 0
- Implementations MUST enforce the maximum limit to prevent unbounded result sets
```

And:
```
**Pagination Response Schema**

For commands that support pagination (`search`, `low-stock-report`), the response structure depends on output format:

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

**What's Missing/Wrong:**

The documentation specifies that pagination is MANDATORY and provides the output schema, but critical implementation details are missing:

1. **CLI flags not specified:** The technical docs say pagination is mandatory with limit/offset, but the CLI interface specification doesn't show:
   - What are the command-line flags? (`--limit`? `--page-size`? `--max-results`?)
   - What's the flag for offset? (`--offset`? `--skip`? `--page`?)
   - Are these flags optional or required?

2. **Current behavior is undefined:** The use-cases.md shows search examples like:
   ```
   warehouse-cli search --name "widget"
   ```
   But if the default limit is 100 and pagination is mandatory:
   - Does this command automatically limit to 100 results?
   - Does it show "Showing 1-100 of 1500" in the output?
   - Is there a warning if results are truncated?

3. **Table format pagination unclear:** The technical docs show JSON format with pagination metadata, and mention table format prints to stderr:
   ```
   [Showing results 101-200 of 250 total] (stderr)
   ```
   But:
   - Where does the "total" count come from? (Requires COUNT(*) query)
   - Does this require two queries (one for count, one for data)?
   - What's the performance impact?

4. **Backward compatibility not addressed:** If pagination wasn't in the initial design and is now mandatory:
   - Will existing scripts that call `warehouse-cli search` break?
   - Is there a `--no-pagination` flag for backward compatibility?
   - What's the migration path for users?

**Assessment:**
This is likely to **block implementation**. Without knowing:
- The exact CLI flag names and their defaults
- How to display pagination info in table format
- Whether a second COUNT query is required

An implementer would have to invent these details, leading to inconsistency.

### Issue 7: Multi-User Environment Detection Implementation Incomplete

**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md"]

**Relevant Text From Docs:**
```
**Automatic Environment Detection:**

Before database operations, the system MUST detect if the environment allows multi-user access:
- **Unix/Linux:** Check if parent directory has group or world read permissions (mode & 0o077 != 0) AND multiple users exist in that group (via `getent group`)
- **Windows:** Check NTFS ACLs for multiple user principals with access to the database directory

**Implementation Details:**
- **Responsible Module:** `systems/database/security.py` implements `detect_multiuser_environment()` function
- **Fallback Behavior:** If `getent` command is unavailable (non-standard systems), fall back to checking only directory permissions (mode & 0o077 != 0). Log warning: "Unable to verify group membership (getent unavailable). Detection based on permissions only."
- **Caching Strategy:** Detection runs once per CLI invocation at database initialization. Results are cached in-memory for the process lifetime to avoid repeated filesystem checks.
- **Timeout Handling:** Windows ACL lookups timeout after 5 seconds. If timeout occurs, assume single-user environment and log warning: "ACL lookup timeout. Proceeding with reduced security checks."
```

**What's Missing/Wrong:**

This specification has several implementation gaps:

1. **False positives unclear:** The detection logic checks if `mode & 0o077 != 0`, meaning any group or world permissions trigger multi-user mode. But:
   - What if the directory is `/tmp` (world-writable) but the database file itself has 0600 permissions?
   - What if the parent directory is group-readable but there's only ONE user in that group?
   - These would be false positives requiring `--allow-shared-system` unnecessarily

2. **getent group logic underspecified:** The docs say "multiple users exist in that group (via `getent group`)", but:
   - Which group? The directory's group owner?
   - How many users counts as "multiple"? (2? 3? Just >1?)
   - What if getent returns the group but shows only the current user as a member?
   - Example implementation needed:
     ```python
     # How to parse this?
     # getent group staff
     # staff:*:20:root,alice,bob
     ```

3. **Windows ACL check completely unspecified:** The requirement says "Check NTFS ACLs for multiple user principals" but provides zero implementation detail:
   - What library? (`pywin32`? `ntsecuritycon`?)
   - What specific ACL entries to check? (DACL? SACL?)
   - What counts as "multiple principals"? (Just user SIDs? Include groups?)
   - How to handle inherited ACLs?
   - The 5-second timeout handling suggests Windows ACL checks can be slow, but no guidance on how to implement the async timeout

4. **Caching strategy location unclear:** The spec says "Results are cached in-memory for the process lifetime" but:
   - Where is this cache stored? (Module-level variable? Singleton class?)
   - What if multiple database paths are used in one process?
   - Should cache be per-database-path or global?

5. **Missing error handling:** What if:
   - The parent directory doesn't exist yet (first-time init)?
   - Permissions checking raises PermissionError?
   - Windows ACL libraries aren't installed?

**Assessment:**
This is a **significant blocker** for production deployments on shared systems. An implementer would face:
- Complex platform-specific code with insufficient specification
- High risk of false positives (annoying users) or false negatives (security risk)
- No clear acceptance criteria for testing

The feature should either be:
- Fully specified with detailed algorithm and edge cases, OR
- Marked as optional/future enhancement for v1

---

## Summary

The documentation is thorough in many areas (use cases, command structure, security principles), but has critical gaps in implementation details that would force developers to make architectural decisions or guess at the intended behavior. The most significant issues are:

1. **Missing schema elements** (soft delete columns)
2. **Unclear module boundaries** (security.py location)
3. **Conflicting requirements** (encryption vs. no external dependencies)
4. **Referenced but missing documentation** (disaster recovery section)
5. **Underspecified algorithms** (multi-user detection, rate limiting, pagination)

**Recommendation:** Before implementation begins, the following sections need clarification:
- Complete the Products table schema with soft delete columns
- Clarify where security functions live in the module structure
- Resolve the encryption external dependency conflict
- Write the disaster recovery section or remove references to it
- Specify CLI pagination flag names and behavior
- Either fully specify multi-user detection or defer to post-v1

These gaps would likely cause 2-3 rounds of back-and-forth between implementer and architect, or result in inconsistent implementation choices across the codebase.
