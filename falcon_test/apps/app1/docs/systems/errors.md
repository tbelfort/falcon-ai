# Error Handling: Warehouse Inventory CLI

**Status:** [FINAL]

> **Note on FINAL Status:** This document has been reviewed and approved. The exit codes, error message templates, and exception hierarchy are stable for implementation.

**Completion Criteria:**
1. [x] Exit code assignments validated against Unix conventions (0=success, 1-125=user-defined errors)
2. [x] Error message templates reviewed for consistency and security (no path leakage)
3. [x] All exception types mapped to exit codes with test coverage
4. [x] Sign-off from QA team on error handling test plan

**Reviewer:** QA Lead and Development Lead
**Completion Date:** 2026-01-20

**Note:** All review items have been completed. The error handling specifications in this document are finalized and approved for implementation.

---

## Exit Codes

> **Stability Guarantee:** Exit codes constitute a **stable programmatic API**. The meaning and assignment of exit codes (0-4, 130) will NOT change within major versions. Systems integrating via subprocess invocation can rely on these exit codes for error handling logic.

> **Exit Code API Contract:** Exit codes are part of the stable programmatic API contract. Changing exit code semantics or assignments requires a MAJOR version bump (semver). Exit code assignment consistency is REQUIRED, not optional.

> **Retry Policy Summary:** Transient database errors (exit code 2) are automatically retried with exponential backoff before being surfaced to users. See "Automated Retry Policy for Database Errors" in the Database Errors section below for the complete specification.

Implementations MUST use the following exit codes (REQUIRED - not SHOULD):

| Code | Name | Meaning | Common Causes |
|------|------|---------|---------------|
| 0 | SUCCESS | Operation completed successfully | Normal completion, including empty search results |
| 1 | GENERAL_ERROR | Invalid arguments, validation failure, general errors | Bad input, CSV export file errors, path validation failures |
| 2 | DATABASE_ERROR | Database connection failed, query failed, file issues | Permission denied on database file, corrupt database, database locked |
| 3 | NOT_FOUND | Requested item does not exist | SKU not found in update-stock command |
| 4 | DUPLICATE | Item with this identifier already exists | SKU collision in add-item command |
| 130 | USER_INTERRUPT | User cancelled operation via Ctrl+C | KeyboardInterrupt (SIGINT) |

> **Note:** Exit code 2 (DATABASE_ERROR) is for database file operations (create, open, query). Output file errors (e.g., CSV export permission denied) use exit code 1 (GENERAL_ERROR).

**Exit Code 130 Rationale:** Exit code 130 is the standard Unix convention for Ctrl+C interruption. This allows shell scripts to distinguish user cancellation from actual errors (e.g., `set -e` scripts can differentiate user cancellation from failures).

> *Technical Detail:* Unix convention uses 128 + signal_number for signal exits. SIGINT (Ctrl+C) is signal 2, thus 128 + 2 = 130.

**REQUIRED: Exit Code Testing**

Implementations MUST verify that all error paths produce documented exit codes:

```python
def test_all_error_paths_produce_documented_exit_codes():
    """Verify every error scenario produces the correct exit code.

    REQUIRED: This test ensures exit code API contract is maintained.
    """
    test_cases = [
        # (command, expected_exit_code, test_description)
        (['add-item', 'SKU123', '--name', 'Test'], 0, "Success case"),
        (['add-item', 'SKU123', '--name', 'Test'], 4, "Duplicate SKU"),
        (['update-stock', 'NONEXISTENT', '--add', '5'], 3, "SKU not found"),
        (['search', '--invalid-flag'], 1, "Invalid arguments"),
        # ... test cases for all error scenarios
    ]

    for cmd, expected_code, description in test_cases:
        result = subprocess.run(['warehouse-cli'] + cmd, capture_output=True)
        assert result.returncode == expected_code, \
            f"{description}: expected exit code {expected_code}, got {result.returncode}"
```

This test MUST pass before any release. Changing exit code semantics is a blocking code review issue that requires major version increment.

---

## Exception Hierarchy

```python
class WarehouseError(Exception):
    """Base exception for all warehouse CLI errors."""
    exit_code: int = 1

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class ValidationError(WarehouseError):
    """Invalid input data.

    Examples:
    - Empty SKU
    - Negative quantity
    - SKU too long
    - Invalid path
    """
    exit_code = 1


class DatabaseError(WarehouseError):
    """Database operation failed.

    Examples:
    - Cannot connect to database
    - Query execution failed
    - Cannot create database file
    - Constraint violation (generic)
    """
    exit_code = 2


class ItemNotFoundError(WarehouseError):
    """Requested item does not exist.

    Examples:
    - SKU not found in update-stock
    - SKU not found in search (exact match)
    """
    exit_code = 3


class DuplicateItemError(WarehouseError):
    """Item with this identifier already exists.

    Examples:
    - SKU already exists in add-item
    """
    exit_code = 4


class SecurityError(WarehouseError):
    """Security violation detected.

    Examples:
    - Database file not owned by current user
    - Cannot verify file permissions (icacls failure on Windows)
    - Symlink detected where regular file expected
    - Permission verification timeout

    Note: SecurityError uses exit_code = 2 (same as DatabaseError) because
    security violations typically occur during database operations and should
    block database access. The separate exception type allows catching
    security issues specifically while maintaining consistent exit behavior.
    """
    exit_code = 2
```

---

## Error Message Templates

> **Note on Machine-Parseable Errors:** Error messages are currently human-readable text. For programmatic error handling, integrations SHOULD rely on **exit codes** (which are stable) rather than parsing error message strings (which may change). Future versions may add a `--format json` mode for errors that includes structured error codes. Currently, error categorization is achieved through exit codes (1=validation, 2=database, 3=not found, 4=duplicate).

### Validation Errors (Exit 1)

```
Error: SKU cannot be empty.
Error: SKU must be 50 characters or fewer. Got: 75
Error: SKU contains invalid characters. Allowed: letters, numbers, hyphens, underscores.
Error: Name cannot be empty.
Error: Name must be 255 characters or fewer. Got: 260
Error: Quantity must be a non-negative integer. Got: {value}
Error: Quantity must be an integer. Got: {value} (type: {type_name})
Error: Quantity cannot exceed 999,999,999. Got: 1000000000

**Quantity Error Message Formats:**

There are two distinct quantity error message formats. Implementations MUST use the appropriate format depending on the error type:

1. **Type error** (non-integer input): `"Quantity must be an integer. Got: {value} (type: {type_name})"`
   - Used for: floats, strings, None, booleans, and other non-integer types
   - Includes type information to help users understand the input problem

2. **Range error** (integer but out of bounds): `"Quantity must be a non-negative integer. Got: {value}"` or `"Quantity cannot exceed 999,999,999. Got: {value}"`
   - Used for: negative integers or integers exceeding maximum

The type check MUST be performed BEFORE the range check (see validate_quantity implementation below).

**Quantity boundary test cases (REQUIRED):**

The following table shows all required test cases for quantity validation. Each test case verifies that the validation logic correctly accepts valid inputs and rejects invalid inputs with appropriate error messages:

| Input | Expected Result | Error Message |
|-------|-----------------|---------------|
| -1 | Reject | "Quantity must be a non-negative integer. Got: -1" |
| 0 | Accept | (valid quantity) |
| 1 | Accept | (valid quantity) |
| 999999999 | Accept | (valid quantity, maximum) |
| 1000000000 | Reject | "Quantity cannot exceed 999,999,999. Got: 1000000000" |
| 1000000001 | Reject | "Quantity cannot exceed 999,999,999. Got: 1000000001" |
| 100.5 (float) | Reject | "Quantity must be an integer. Got: 100.5 (type: float)" |
| "100" (string) | Reject | "Quantity must be an integer. Got: '100' (type: str)" |
| None | Reject | "Quantity must be an integer. Got: None (type: NoneType)" |
| 1e10 (scientific) | Reject | "Quantity cannot exceed 999,999,999. Got: 10000000000" |
| -100.5 (negative float) | Reject | "Quantity must be an integer. Got: -100.5 (type: float)" |
| "" (empty string) | Reject | "Quantity must be an integer. Got: '' (type: str)" |
| True (boolean) | Reject | "Quantity must be an integer. Got: True (type: bool)" |
| False (boolean) | Reject | "Quantity must be an integer. Got: False (type: bool)" |
| float('inf') | Reject | "Quantity must be an integer. Got: inf (type: float)" |
| float('nan') | Reject | "Quantity must be an integer. Got: nan (type: float)" |
| 1e308 (very large float) | Reject | "Quantity must be an integer. Got: 1e+308 (type: float)" |

**Non-integer type handling:**

Implementations MUST explicitly check the input type BEFORE checking the value range. This prevents silent type coercion:

```python
def validate_quantity(value: Any) -> int:
    """Validate quantity is a non-negative integer within bounds.

    CRITICAL: Type check MUST happen before value check to prevent:
    - Silent float-to-int coercion (100.5 -> 100)
    - String-to-int coercion ("100" -> 100)
    - None coercion (None -> 0)
    """
    # Step 1: Type check (MUST be exact int, not subclass or coercible type)
    if not isinstance(value, int) or isinstance(value, bool):
        type_name = type(value).__name__
        raise ValidationError(
            f"Quantity must be an integer. Got: {value!r} (type: {type_name})"
        )

    # Step 2: Range check
    if value < 0:
        raise ValidationError(f"Quantity must be a non-negative integer. Got: {value}")
    if value > 999999999:
        raise ValidationError(f"Quantity cannot exceed 999,999,999. Got: {value}")

    return value
```

**Note:** `isinstance(value, bool)` check is required because `bool` is a subclass of `int` in Python.

Error: min-stock must be a non-negative integer.
Error: min-stock cannot exceed 999,999,999. Got: 1000000000
Error: Description must be 4096 characters or fewer. Got: 4100
Error: Location must be 100 characters or fewer. Got: 105
Error: Quantity cannot exceed 999,999,999. Current: {current}, Requested addition: {amount}

**Overflow boundary test cases for --add operation (REQUIRED):**
| Current | Addition | Expected Result | Exit Code | Error Message |
|---------|----------|-----------------|-----------|---------------|
| 999999998 | 1 | Accept | 0 | N/A |
| 999999999 | 0 | N/A | 1 | "Value for --add must be greater than 0" |
| 999999999 | 1 | Reject | 1 | "Quantity cannot exceed 999,999,999. Current: 999999999, Requested addition: 1" |
| 999999990 | 9 | Accept | 0 | N/A |
| 999999990 | 10 | Reject | 1 | "Quantity cannot exceed 999,999,999. Current: 999999990, Requested addition: 10" |
| 500000000 | 500000000 | Reject | 1 | "Quantity cannot exceed 999,999,999. Current: 500000000, Requested addition: 500000000" |

**Observable behavior on rejection:**
- Exit code: 1 (GENERAL_ERROR)
- Error message written to stderr
- Database state unchanged (transaction rolled back)

**Test acceptance criteria for rejection cases:**
1. `$?` equals 1
2. stderr contains exact error message pattern
3. `SELECT quantity FROM products WHERE sku = ?` returns original value (unchanged)

**Implementation note:** Implementations MUST perform the overflow check before the addition to prevent integer overflow in the calculation itself. Use: `if current > 999999999 - amount: raise error`

**Overflow check validation (REQUIRED):**
Before performing the subtraction `999999999 - amount`, implementations MUST validate that `amount` is a positive integer:
1. Verify `amount > 0` (negative amounts would cause the check to pass incorrectly)
2. Verify `amount <= 999999999` (amount cannot exceed the maximum quantity itself)
3. Verify `amount` is an integer type (not float, None, or string)

```python
def validate_overflow_check(current: int, amount: int) -> None:
    """Validate addition won't overflow, with pre-validation of amount."""
    # Pre-validate amount before using in overflow check
    if not isinstance(amount, int) or isinstance(amount, bool):
        raise ValidationError(f"Amount must be an integer. Got: {amount!r} (type: {type(amount).__name__})")
    if amount <= 0:
        raise ValidationError(f"Amount for --add must be greater than 0. Got: {amount}")
    if amount > 999999999:
        raise ValidationError(f"Amount cannot exceed 999,999,999. Got: {amount}")

    # Now safe to perform overflow check
    if current > 999999999 - amount:
        max_safe = 999999999 - current
        raise ValidationError(
            f"Quantity cannot exceed 999,999,999. Current: {current}, "
            f"Requested addition: {amount}. Maximum safe addition: {max_safe}"
        )
```
Error: Path cannot contain '..'.
Error: Cannot reduce quantity below 0. Current: {current}, Requested removal: {amount}
Error: At least one search criterion required (--sku, --name, or --location). Example: warehouse-cli search --sku "WH-001"
Error: Missing required option. Choose ONE way to update stock:
  --set <value>    Set exact quantity (e.g., after physical inventory count)
  --add <amount>   Increase quantity (e.g., received new shipment)
  --remove <amount> Decrease quantity (e.g., items sold or removed)
  Example: warehouse-cli update-stock --sku WH-001 --set 100

**Error Message Context (REQUIRED):**
When the user provides an unrecognized option, the error message MUST acknowledge what they tried:
```
Error: Unknown option '{option}' for stock update.
Choose ONE of: --set, --add, or --remove
  You provided: {option}
  Example: warehouse-cli update-stock --sku WH-001 --set 100
```
This helps users understand whether they made a typo vs. provided no option at all.

**Note:** The canonical error message format for update-stock mutual exclusion errors is defined in cli/interface.md (lines 482-484). The message shown above is the standard form; see interface.md for detailed help text requirements.

**Concise Error Message Format (for repeat users):**
After a user has seen the detailed error message once (tracked per-process via environment variable `WAREHOUSE_CLI_SEEN_HELP`), subsequent occurrences within the same shell session SHOULD display a shorter version:
```
Error: Specify ONE of: --set, --add, or --remove. (Use --help for details)
```
**Session tracking mechanism:** Set `WAREHOUSE_CLI_SEEN_HELP=1` after displaying verbose help. Check this variable to determine message verbosity. This provides consistent behavior across multiple CLI invocations in the same terminal session without requiring persistent storage.

Error: Conflicting options. Choose only ONE stock operation:
  --set    Sets the exact quantity (ignores current value)
  --add    Adds to current quantity
  --remove Subtracts from current quantity
  You provided: {options_list}. Use only ONE option.

  Tip: Operations cannot be chained. To add 50 then remove 20, run two separate commands:
    warehouse-cli update-stock --sku WH-001 --add 50
    warehouse-cli update-stock --sku WH-001 --remove 20
  Example: warehouse-cli update-stock --sku WH-001 --add 50
Error: Value for --add/--remove must be greater than 0.
Error: File '{filename}' already exists. Use --force to overwrite.
Error: Database already exists at '{basename}'. Use --force to recreate.
Error: Path '{filename}' is a symbolic link.

**Note on --force with non-existent database:** When `--force` is specified but no database exists, the system proceeds normally with database creation and displays an informational message (not an error). See cli/interface.md init command behavior for details.
```

**Basename safety for error messages:**
Implementations MUST use `os.path.basename()` for the `{filename}` in error messages to avoid exposing full paths. This requirement is enforced by the `sanitize_error_message()` function (see ARCHITECTURE-simple.md S3).

**Edge cases:**
- Long filenames (>50 chars): Truncate with hash suffix for uniqueness
- Special characters: Strip ANSI escape codes before display
- Unicode: Use terminal encoding, fallback to ASCII with escaping
- Filenames at OS limits (255+ chars): Truncate to 50 chars + 8-char hash suffix
- Null bytes in filename: Strip null bytes before basename extraction
- Basename extraction failure: Use "[filename unavailable]" as fallback

**Safe basename extraction implementation (REQUIRED):**
```python
import os
import hashlib

def safe_basename(path: str, max_length: int = 50) -> str:
    """Extract safe basename for error messages.

    Handles edge cases: long filenames, null bytes, extraction failures.
    """
    try:
        # Remove null bytes which could cause issues
        sanitized_path = path.replace('\x00', '')

        # Extract basename
        basename = os.path.basename(sanitized_path)

        # Handle empty result (could happen with paths ending in separator)
        if not basename:
            basename = "[filename unavailable]"

        # Truncate long filenames with hash suffix for uniqueness
        if len(basename) > max_length:
            # Use first 42 chars + hash of full name for uniqueness
            name_hash = hashlib.sha256(basename.encode('utf-8', errors='replace')).hexdigest()[:8]
            basename = basename[:42] + '...' + name_hash

        return basename
    except Exception:
        return "[filename unavailable]"
```

### Database Errors (Exit 2)

```
Error: Cannot create database '{filename}': Permission denied.
Error: Cannot open database '{filename}': File not found.
Error: Database operation failed. Run with --verbose for details.
Error: Cannot write to '{filename}': Permission denied.
```

**Note:** Use basename only (`{filename}`), not full path. The "Basename safety for error messages" section above defines edge case handling requirements. The canonical `format_error_path()` implementation is shown in Rule 2: Never Expose Internals section of this document. ARCHITECTURE-simple.md S3 provides the security rationale for this requirement.

**Clarification:** Exit code 2 (DATABASE_ERROR) is specifically for database file operations (create, open, query). For output file errors (e.g., CSV export permission denied), use exit code 1 (GENERAL_ERROR/ValidationError) since output file issues are validation failures, not database failures.

**Examples:**
- `init --db /readonly/inventory.db` fails to create database file → exit 2 (DatabaseError)
- `export-csv --output /readonly/export.csv` fails to write CSV file → exit 1 (ValidationError)
- `--db /missing/inventory.db` cannot open database file → exit 2 (DatabaseError)

**Recovery Procedures:**

> **Note:** For deployment procedures, pre-deployment validation, and rollback strategies, see the **Deployment** section in `systems/architecture/ARCHITECTURE-simple.md`. This document focuses on error recovery during normal operations.

---

**OPERATIONAL RUNBOOK: Exit Code 2 (Database Errors)**

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Expected Resolution Time** | 5-15 minutes |
| **Escalation Path** | Operator -> Database Admin -> Infrastructure Team |
| **Escalation Trigger** | Issue not resolved within 15 minutes |

**Step 1: Reproduce and Diagnose**
```bash
# Run failing command with --verbose for detailed error
warehouse-cli <command> --db <path> --verbose 2>&1 | tee /tmp/db-error.log
```

**Step 2: Verify Directory and Permissions (Unix)**

  **Permission Verification Steps:**
  1. Run `ls -la <parent_directory>` and verify:
     - Directory has `drwx` (read/write/execute) for your user or group
     - Your user appears in the owner or group column, OR directory has world-writable permissions
  2. Run `id` to get your user/group IDs
  3. **Success criteria:** `ls -la` output shows `rwx` permissions for owner AND your user matches the owner column, OR you are in the group with `rwx` permissions
  4. **Disk space check:** Run `df -h <parent_directory>` - verify "Use%" is below 95%

  **Example successful output:**
  ```
  $ ls -la /data/
  drwxr-xr-x  2 warehouse warehouse 4096 Jan 21 10:00 .
  $ id
  uid=1000(warehouse) gid=1000(warehouse) groups=1000(warehouse)
  # Success: user "warehouse" owns directory with rwx permissions
  ```

**Step 3: Validate Resolution**
```bash
# After fixing permissions, verify with a test command
warehouse-cli search --sku __test__ --db <path>
# Expected: Exit code 0 (success) or 3 (not found) - both indicate database accessible
echo "Exit code: $?"
```

**Step 4: Check Transaction State and Rollback**

When database errors occur during write operations, transaction state must be verified:

```bash
# Check for uncommitted transactions (look for WAL file size)
ls -la <db_path>*
# If inventory.db-wal is large (>1MB), there may be uncommitted changes

# Verify database integrity
sqlite3 <db_path> "PRAGMA integrity_check;"
# Expected: "ok"

# Check for pending writes
sqlite3 <db_path> "PRAGMA wal_checkpoint(PASSIVE);"
# Returns 3 values: (0=success, pages_checkpointed, pages_remaining)
```

**Transaction rollback behavior:** The warehouse-cli application uses atomic transactions. When a database error occurs:
- **In-progress transactions:** SQLite automatically rolls back on connection close or error
- **Partial data risk:** None - transactions are all-or-nothing
- **User action:** Re-run the command after resolving the error; no manual rollback needed

**When manual intervention is needed:**
- If the database is corrupted (integrity check fails): Restore from backup
- If WAL file is very large and won't shrink: Force checkpoint with `PRAGMA wal_checkpoint(TRUNCATE)`
- If database is locked by defunct process: Kill the process and remove stale lock files

**Step 5: Document and Close**
- Log incident with: timestamp, error message, root cause, resolution steps
- If recurring, create ticket for infrastructure review

---

  **Automated Retry Policy for Database Errors:**

  For transient database errors (connection failures, lock timeouts), implementations SHOULD implement automated retry logic:

  | Error Type | Retry Strategy | Max Attempts | Initial Delay | Max Delay | Formula |
  |------------|----------------|--------------|---------------|-----------|---------|
  | Database locked/busy | Exponential backoff | 5 | 100ms | 1600ms | `delay = min(100ms * 2^(attempt-1), 1600ms)` |
  | Connection failure | Exponential backoff | 3 | 500ms | 2000ms | `delay = min(500ms * 2^(attempt-1), 2000ms)` |
  | Disk I/O error | No automatic retry | 1 | N/A | N/A | N/A |
  | Permission denied | No automatic retry | 1 | N/A | N/A | N/A |

  **Retry delay calculation:** For database locked/busy with 5 attempts:
  - Attempt 1: 100ms * 2^0 = 100ms
  - Attempt 2: 100ms * 2^1 = 200ms
  - Attempt 3: 100ms * 2^2 = 400ms
  - Attempt 4: 100ms * 2^3 = 800ms
  - Attempt 5: 100ms * 2^4 = 1600ms (max delay reached)

  **SECURITY WARNING - Resource Exhaustion Risk:**

  The retry mechanism can be exploited for denial-of-service attacks. An attacker who can trigger database lock contention (e.g., holding write locks via multiple connections) can cause legitimate operations to:
  - Consume 5x resources per operation (5 retry attempts)
  - Block for up to 15+ seconds per operation (exponential backoff)
  - Exhaust thread pools and connection limits

  **REQUIRED Mitigations:**
  1. **Per-process retry budget enforcement**: Implementations MUST implement `ProcessRetryBudget` class that tracks retry counts across ALL operations with sliding window:
     - Budget limit: 20 retries per 60-second window (reduced from 50 for tighter protection)
     - Tracking: Use sliding window with timestamps for each retry attempt
     - Fail-fast: When budget exceeded, no further retries until window slides
     - Per-source tracking: For service deployments, track per-IP/per-source to prevent coordinated attacks
  2. **Attack detection alert**: If retry budget exceeded more than 3 times in 5 minutes, emit alert indicating potential DoS attack
  3. **Per-operation timeout**: Each operation (including all retries) MUST complete within 30 seconds total, not per-attempt.
  4. **Connection pooling limits**: Maximum 3 concurrent database connections per process to limit attack surface.

  **CLI Process Model Limitation:**

  The `ProcessRetryBudget` implementation below uses in-memory state that resets with each CLI invocation. This provides protection within a single long-running operation (e.g., a batch import with multiple database writes) but does NOT provide cross-invocation DoS protection for typical CLI usage patterns where each command is a separate process.

  **Effective Protection Scope:**
  - **Within-process protection:** Limits retry exhaustion during multi-step operations within a single CLI invocation
  - **NOT protected:** Repeated rapid CLI invocations from shell scripts or attackers spawning new processes

  **For deployments requiring cross-invocation protection**, consider one of these alternatives:
  1. **External rate limiting:** Use OS-level rate limiting (e.g., `pam_faildelay`, `fail2ban`, or firewall rules) to limit CLI invocation frequency
  2. **Wrapper daemon:** Deploy a long-running wrapper service that maintains persistent retry state and proxies CLI operations
  3. **File-based state (with caveats):** Persist retry timestamps to a lock file, though this adds I/O overhead and race condition complexity
  4. **Database-based tracking:** Store retry attempts in the database itself (requires careful handling to avoid recursive retry issues)

  For most single-user CLI deployments, the within-process protection combined with SQLite's built-in busy timeout provides adequate protection. The cross-invocation limitation is primarily a concern for multi-user or service deployments.

  **ProcessRetryBudget Implementation (REQUIRED):**

  ```python
  import threading
  import time
  from collections import deque
  from typing import Optional

  class ProcessRetryBudget:
      """Tracks retry budget across all operations to prevent resource exhaustion.

      SECURITY: This prevents coordinated attacks from exhausting resources through
      parallel retry triggering. Must be shared across all database operations.
      """

      def __init__(self, budget: int = 20, window_seconds: float = 60.0):
          self._budget = budget
          self._window = window_seconds
          self._retry_timestamps = deque()  # Sliding window of retry timestamps
          self._budget_exceeded_count = 0   # Counter for attack detection
          self._lock = threading.Lock()
          self._last_alert_time: float = 0

      def can_retry(self) -> bool:
          """Check if retry budget allows another retry attempt.

          Returns False if budget exhausted, triggering immediate failure.
          """
          with self._lock:
              now = time.time()
              # Remove timestamps outside sliding window
              while self._retry_timestamps and (now - self._retry_timestamps[0]) > self._window:
                  self._retry_timestamps.popleft()

              # Check if budget allows retry
              if len(self._retry_timestamps) >= self._budget:
                  self._budget_exceeded_count += 1
                  # Alert on potential attack (3+ budget exhaustions in 5 minutes)
                  if self._budget_exceeded_count >= 3 and (now - self._last_alert_time) > 300:
                      self._emit_attack_alert()
                      self._last_alert_time = now
                      self._budget_exceeded_count = 0  # Reset counter
                  return False

              return True

      def record_retry(self) -> None:
          """Record a retry attempt in the sliding window."""
          with self._lock:
              self._retry_timestamps.append(time.time())

      def _emit_attack_alert(self) -> None:
          """Emit alert for potential DoS attack."""
          import logging
          logging.critical(
              "SECURITY ALERT: Retry budget exceeded 3+ times in 5 minutes. "
              "Possible denial-of-service attack via retry exhaustion. "
              "Current budget: %d retries per %d seconds",
              self._budget, self._window
          )

  # Global instance shared across all operations
  _process_retry_budget = ProcessRetryBudget(budget=20, window_seconds=60.0)

  def check_retry_budget() -> bool:
      """Check if process-wide retry budget allows retry."""
      return _process_retry_budget.can_retry()

  def record_retry_attempt() -> None:
      """Record a retry attempt against process-wide budget."""
      _process_retry_budget.record_retry()
  ```

  **Integration Points for ProcessRetryBudget and DatabaseCircuitBreaker:**

  Both `ProcessRetryBudget` and `DatabaseCircuitBreaker` are singleton instances that integrate with the layered architecture as follows:

  **Module Ownership and Instantiation:**
  - **Location:** Both classes are defined in `database.py` (database layer module)
  - **Instantiation:** Module-level singleton instances are created when `database.py` is imported
  - **Access:** The `retry_with_backoff()` and `execute_with_circuit_breaker()` functions in `database.py` reference these singletons

  ```python
  # database.py - Database layer module
  import sqlite3

  # Module-level singletons (instantiated once per process)
  _process_retry_budget = ProcessRetryBudget(budget=20, window_seconds=60.0)
  _circuit_breaker = DatabaseCircuitBreaker()

  # Public API functions use the singletons
  def execute_query(conn: sqlite3.Connection, query: str, params: tuple):
      """Execute database query with retry budget and circuit breaker protection."""
      def operation():
          return conn.execute(query, params)

      # Circuit breaker check happens first
      return execute_with_circuit_breaker(operation)
  ```

  **Call Chain Integration:**

  The protection mechanisms are invoked in this order for every database operation:

  1. **CLI layer** (`cli.py`) receives user command
  2. **Command layer** (`commands.py`) validates input and calls repository
  3. **Repository layer** (`repository.py`) prepares database operation
  4. **Database layer** (`database.py`) applies protections:
     - Check circuit breaker state (fail fast if OPEN)
     - Execute operation with retry logic (if circuit allows)
     - For each retry attempt: check retry budget before sleeping
     - Update circuit breaker state based on success/failure
  5. Result or exception propagates back up the chain

  **Detailed Integration Example:**

  ```python
  # database.py
  def execute_with_protections(conn, operation):
      """Execute operation with circuit breaker and retry budget protection."""
      # Step 1: Circuit breaker check (fail fast if OPEN)
      if not _circuit_breaker.can_execute():
          raise DatabaseError("Circuit breaker is OPEN. Database temporarily unavailable.")

      # Step 2: Execute with retry logic
      last_exception = None
      for attempt in range(MAX_RETRY_ATTEMPTS):
          try:
              result = operation()
              _circuit_breaker.record_success()  # Reset circuit on success
              return result
          except sqlite3.OperationalError as e:
              if "locked" in str(e).lower() or "busy" in str(e).lower():
                  last_exception = e
                  _circuit_breaker.record_failure()  # Increment failure count

                  if attempt < MAX_RETRY_ATTEMPTS - 1:
                      # Step 3: Check retry budget before sleeping
                      if not _process_retry_budget.can_retry():
                          raise DatabaseError("Retry budget exhausted. Too many retries in progress.") from e

                      # Record retry attempt
                      _process_retry_budget.record_retry()

                      # Sleep with exponential backoff
                      time.sleep(calculate_backoff(attempt))
                      continue
              raise  # Non-transient error or final attempt

      # All retries exhausted
      raise DatabaseError(f"Database busy after {MAX_RETRY_ATTEMPTS} attempts") from last_exception
  ```

  **Testing and Reset:**

  For unit tests that need to reset singleton state:

  ```python
  # test_database.py
  import database

  def test_circuit_breaker_behavior():
      """Test circuit breaker opens after threshold failures."""
      # Reset singleton state before test
      database._circuit_breaker._state = database.CircuitState.CLOSED
      database._circuit_breaker._failure_count = 0
      database._process_retry_budget._retry_timestamps.clear()

      # ... test logic ...

  # Alternatively, provide reset functions in database.py
  def reset_protection_state():
      """Reset retry budget and circuit breaker state. FOR TESTING ONLY."""
      _process_retry_budget._retry_timestamps.clear()
      _process_retry_budget._budget_exceeded_count = 0
      _circuit_breaker._state = CircuitState.CLOSED
      _circuit_breaker._failure_count = 0
  ```

  **Relationship to Architecture Principle AD2 (No Global State):**

  The AD2 principle states "No global state except configuration loaded at startup." The retry budget and circuit breaker singleton instances are exceptions justified by:

  1. **Security requirement:** Cross-operation protection requires shared state to detect coordinated attacks
  2. **Process-scoped lifetime:** State exists only for the CLI process lifetime (resets on each invocation)
  3. **Read-only configuration:** The budget limits (20 retries, 60-second window, 10 failure threshold) are constants, not mutable global state
  4. **Thread-safe implementation:** All state mutations use locks to prevent race conditions

  These singletons are analogous to connection pools or logging handlers - infrastructure components that coordinate behavior across operations rather than application state that affects business logic outcomes.

  **Circuit Breaker Pattern (MANDATORY for cascading delay prevention):**

  To prevent thundering herd scenarios where multiple concurrent operations all retry simultaneously and amplify contention, implementations MUST implement a circuit breaker:

  ```python
  import threading
  import time
  from enum import Enum

  class CircuitState(Enum):
      CLOSED = "closed"      # Normal operation, requests proceed with retry
      OPEN = "open"          # Failure threshold reached, immediate failure
      HALF_OPEN = "half_open"  # Testing recovery, limited requests allowed

  class DatabaseCircuitBreaker:
      """Circuit breaker to prevent cascading retry delays.

      REQUIRED: Wrap all database operations that use retry logic.
      """

      def __init__(self, failure_threshold: int = 10, reset_timeout_seconds: float = 30.0):
          self._state = CircuitState.CLOSED
          self._failure_count = 0
          self._failure_threshold = failure_threshold
          self._reset_timeout = reset_timeout_seconds
          self._last_failure_time: float = 0
          self._lock = threading.Lock()

      def can_execute(self) -> bool:
          """Check if circuit allows execution."""
          with self._lock:
              if self._state == CircuitState.CLOSED:
                  return True
              elif self._state == CircuitState.OPEN:
                  if time.time() - self._last_failure_time >= self._reset_timeout:
                      self._state = CircuitState.HALF_OPEN
                      return True
                  return False
              else:  # HALF_OPEN - allow one test request
                  return True

      def record_success(self) -> None:
          """Record successful operation, reset circuit."""
          with self._lock:
              self._failure_count = 0
              self._state = CircuitState.CLOSED

      def record_failure(self) -> None:
          """Record failed operation, potentially open circuit."""
          with self._lock:
              self._failure_count += 1
              self._last_failure_time = time.time()
              if self._failure_count >= self._failure_threshold:
                  self._state = CircuitState.OPEN

  # Singleton instance
  _circuit_breaker = DatabaseCircuitBreaker()

  def execute_with_circuit_breaker(operation):
      """Execute operation with circuit breaker protection."""
      if not _circuit_breaker.can_execute():
          raise DatabaseError(
              "Database operations temporarily suspended due to high contention. "
              "Circuit breaker is OPEN. Please wait 30 seconds and retry."
          )
      try:
          result = retry_with_backoff(operation)
          _circuit_breaker.record_success()
          return result
      except DatabaseError:
          _circuit_breaker.record_failure()
          raise
  ```

  **Circuit breaker behavior:**
  - After 10 consecutive failures within retry logic, circuit opens
  - While open, all new requests fail immediately (no retry, no waiting)
  - After 30 seconds, one request is allowed to test recovery
  - On success, circuit closes and normal operation resumes
  - Total worst-case wait: 10 operations x ~10s each = 100s, then immediate failures

  **CLI Process Model Limitation for Circuit Breaker:**

  Like the `ProcessRetryBudget` implementation, the `DatabaseCircuitBreaker` uses in-memory state that resets with each CLI process invocation. This limitation affects the circuit breaker's effectiveness in typical CLI usage patterns:

  **Effective Protection Scope:**
  - **Within-process protection:** Prevents cascading failures during multi-step operations within a single CLI invocation (e.g., batch imports)
  - **NOT protected:** Rapid repeated CLI invocations from separate processes (each process starts with circuit CLOSED)

  **Cross-Invocation Protection Alternatives:**

  For deployments requiring circuit breaker state to persist across CLI invocations, consider:
  1. **File-based state:** Store circuit state (OPEN/CLOSED/HALF_OPEN, failure count, timestamp) in a lock file at `/tmp/warehouse-cli-circuit.lock` with file locking to prevent race conditions
  2. **Shared memory:** Use IPC mechanisms like `mmap` or `multiprocessing.Manager` for state sharing (adds complexity)
  3. **Wrapper daemon:** Long-running service that maintains circuit state and proxies CLI operations
  4. **External circuit breaker:** Use infrastructure-level circuit breakers (e.g., Envoy, Istio) if CLI operations route through a service mesh

  The file-based state approach is the most practical for CLI contexts:
  ```python
  import os
  import fcntl
  import json
  import time

  CIRCUIT_STATE_FILE = "/tmp/warehouse-cli-circuit.lock"

  def load_circuit_state():
      """Load circuit state from shared file with locking."""
      if not os.path.exists(CIRCUIT_STATE_FILE):
          return {"state": "CLOSED", "failure_count": 0, "last_failure": 0}

      with open(CIRCUIT_STATE_FILE, "r+") as f:
          fcntl.flock(f.fileno(), fcntl.LOCK_SH)  # Shared lock for reading
          try:
              state = json.load(f)
              return state
          finally:
              fcntl.flock(f.fileno(), fcntl.LOCK_UN)

  def save_circuit_state(state):
      """Save circuit state to shared file with locking."""
      with open(CIRCUIT_STATE_FILE, "w") as f:
          fcntl.flock(f.fileno(), fcntl.LOCK_EX)  # Exclusive lock for writing
          try:
              json.dump(state, f)
          finally:
              fcntl.flock(f.fileno(), fcntl.LOCK_UN)
  ```

  **Note:** File-based state adds I/O overhead and requires handling file permissions, stale locks, and cleanup. For single-user CLI deployments, the in-memory circuit breaker with rate limiting provides adequate protection.

  **Exponential backoff implementation (database.py - NOT cli.py):**

  **Note:** This retry logic belongs in `database.py`, not `cli.py`. The CLI layer MUST NOT import sqlite3 - see ARCHITECTURE-simple.md for layer constraints.

  ```python
  # database.py - database layer handles sqlite3 operations
  import time
  import random
  import sqlite3  # Only imported in database.py, never cli.py

  def retry_with_backoff(operation, max_attempts=5, initial_delay_ms=100, max_delay_ms=5000):
      """Execute operation with exponential backoff retry.

      Args:
          operation: Callable that may raise transient errors
          max_attempts: Maximum number of attempts (default 5)
          initial_delay_ms: Initial delay in milliseconds (default 100)
          max_delay_ms: Maximum delay cap in milliseconds (default 5000)

      Returns:
          Result of successful operation

      Raises:
          Last exception if all attempts fail
      """
      # CRITICAL: Validate initial parameters to prevent pathological values
      if initial_delay_ms <= 0:
          raise ValueError("initial_delay_ms must be positive")
      if max_delay_ms <= 0:
          raise ValueError("max_delay_ms must be positive")
      if max_attempts <= 0:
          raise ValueError("max_attempts must be positive")

      delay_ms = initial_delay_ms
      last_exception = None

      for attempt in range(max_attempts):
          try:
              return operation()
          except sqlite3.OperationalError as e:
              error_msg = str(e).lower()
              # Only retry transient errors
              if "locked" in error_msg or "busy" in error_msg:
                  last_exception = e
                  if attempt < max_attempts - 1:
                      # Add jitter to prevent thundering herd
                      jitter = random.uniform(0.5, 1.5)

                      # CRITICAL: Cap delay_ms BEFORE jitter to prevent overflow
                      import math
                      if delay_ms <= 0 or math.isinf(delay_ms) or math.isnan(delay_ms):
                          delay_ms = max_delay_ms

                      # Cap at max_delay_ms before applying jitter
                      capped_delay = min(delay_ms, max_delay_ms)
                      sleep_time = capped_delay * jitter / 1000

                      # Validate sleep_time is a valid non-negative finite number
                      if sleep_time < 0 or math.isinf(sleep_time) or math.isnan(sleep_time):
                          sleep_time = max_delay_ms / 1000

                      time.sleep(sleep_time)

                      # Exponential increase with overflow protection
                      delay_ms *= 2
                      if delay_ms > max_delay_ms:
                          delay_ms = max_delay_ms
                      continue
              raise  # Non-transient error, don't retry

      # Wrap the exception to indicate retry exhaustion
      raise DatabaseError(
          f"Database is busy after {max_attempts} retry attempts. "
          f"Total wait time: approximately {sum_delays}ms. "
          "Another process may be holding a long-running lock."
      ) from last_exception
  ```

  **Retry exhaustion error message (REQUIRED):** When all retry attempts are exhausted, the error message MUST:
  1. Indicate the number of retry attempts made (not just "30 seconds")
  2. Distinguish from immediate failure (user should know retries were attempted)
  3. Preserve the original exception in the chain for debugging (via `from last_exception`)

  This helps users differentiate between:
  - Immediate lock failure (no retries, probably a configuration issue)
  - Retry exhaustion (transient issue that didn't resolve, needs longer wait)

  **Overflow protection rationale:**
  The implementation validates parameters and caps `delay_ms` at `max_delay_ms` to prevent:
  - Integer overflow causing negative delay values
  - Floating point overflow causing infinity or NaN
  - `time.sleep()` receiving invalid values (negative, infinity, NaN)

  **CRITICAL - Atomic Transaction Boundaries for Retried Operations:**

  Operations passed to `retry_with_backoff` MUST use explicit transaction boundaries to prevent partial state from persisting across retry attempts. Without atomic transactions, partial writes may persist when a retry occurs, causing data corruption or duplicate entries.

  **REQUIRED:** All retried database operations MUST be wrapped in transactions that rollback on failure:

  ```python
  def with_atomic_transaction(conn: sqlite3.Connection, operation: Callable[[], T]) -> T:
      """Wrap an operation in an atomic transaction with proper rollback."""
      conn.execute("BEGIN IMMEDIATE")
      try:
          result = operation()
          conn.commit()
          return result
      except Exception:
          conn.rollback()  # CRITICAL: Rollback on ANY exception before retry
          raise
  ```

  **Idempotency Requirement:** Operations that are retried MUST be either:
  1. Wrapped in transactions that rollback on failure (as shown above), OR
  2. Inherently idempotent (e.g., SET operations that overwrite previous values)

- **Exit 1 (Output file errors):** Check that the output directory exists and is writable. On Unix, use `touch <path>` to test write access. Verify you have permission to create files in the target directory.

### Error Rate Monitoring and Alerting

> **Definition:** A "production deployment" is any deployment where `WAREHOUSE_PRODUCTION=true` is set, or any deployment handling real business data.

Production deployments MUST implement error rate monitoring to detect systemic issues before they impact operations.

**Monitoring System Requirements:**

Implementations MUST use a monitoring system that supports the following minimum capabilities:
- Counter metrics (tracking total operations, errors by type)
- Rate calculations (operations per second, error rate percentages)
- Sliding time windows (minimum 5-minute windows)
- Alert threshold configuration
- Alerting mechanisms (email, webhook, or logging)

**Acceptable Monitoring Systems (examples):**
- **Prometheus** with Alertmanager (reference implementation shown in examples below)
- **DataDog** with custom metrics API
- **CloudWatch** with CloudWatch Alarms (AWS environments)
- **Grafana** with any compatible data source
- **Custom solution** meeting minimum capabilities above

The monitoring examples in this document use Prometheus format. Implementations MAY adapt these patterns to their chosen monitoring system while maintaining equivalent functionality.

**Error Rate Metrics:**

| Metric | Description | Alert Threshold | Severity |
|--------|-------------|-----------------|----------|
| Total error rate | Errors / total operations | > 5% over 5 minutes | HIGH |
| Database error rate (exit 2) | Database errors / total operations | > 2% over 5 minutes | CRITICAL |

**Metric Measurement Specification:**

- **Total operations:** Count of all CLI command invocations (exit code 0 + all error exit codes) within the measurement window
- **5-minute window definition:** A sliding window of the last 300 seconds from the current timestamp. Measurements are taken at 1-second intervals, and the oldest measurement is dropped as new measurements arrive.
- **Minimum sample size:** Alert thresholds MUST NOT trigger unless at least 100 total operations have occurred within the window (prevents false alerts during low-activity periods)
- **Expected output when threshold exceeded:**
  - Log entry: `{"alert": "error_rate_exceeded", "metric": "<metric_name>", "rate": <percentage>, "threshold": <threshold>, "window_seconds": 300, "total_ops": <count>}`
  - Exit code from monitoring script: 1 (warning) or 2 (critical based on severity)

**Test data requirements for error rate monitoring:**

| Test Scenario | Operations | Errors | Error Rate | Sample Size | Expected Alert | Pass Criteria |
|---------------|------------|--------|------------|-------------|----------------|---------------|
| Normal operation | 100 | 3 | 3% | >= 100 | No | Alert does NOT fire |
| Threshold exceeded | 100 | 6 | 6% | >= 100 | Yes | Alert fires, JSON log emitted |
| Below sample threshold | 50 | 5 | 10% | < 100 | No | Alert does NOT fire despite high rate |
| Exactly at threshold | 100 | 5 | 5% | >= 100 | No | Alert does NOT fire (> not >=) |
| Just above threshold | 100 | 6 | 6% | >= 100 | Yes | Alert fires |

**Test procedure to generate test load:**
```bash
#!/bin/bash
# generate-test-load.sh - Generate CLI invocations to test error rate monitoring
# Usage: ./generate-test-load.sh <success_count> <error_count>
SUCCESS_COUNT=${1:-95}
ERROR_COUNT=${2:-5}

for i in $(seq 1 $SUCCESS_COUNT); do
    warehouse-cli search --sku "TEST-$i" --db /tmp/test.db 2>/dev/null &
done
for i in $(seq 1 $ERROR_COUNT); do
    warehouse-cli search --db /nonexistent/path.db 2>/dev/null &  # Force error
done
wait
```

**Observable behavior when sample size < 100:**
- Monitoring system MUST log: `{"status": "insufficient_sample", "total_ops": <count>, "required": 100}`
- No alert is triggered regardless of error rate

| Not found rate (exit 3) | ItemNotFound errors / total operations | > 20% over 5 minutes | MEDIUM |
| Validation error rate (exit 1) | ValidationErrors / total operations | > 10% over 5 minutes | LOW |

### Security Anomaly Detection

Production deployments (as defined above) MUST implement anomaly detection for security threats:

| Pattern | Alert Threshold | Severity | Notes |
|---------|-----------------|----------|-------|
| Permission denied spike | > 2 in 1 minute | HIGH | Tightened from 3 to prevent slow probing |
| Sequential SKU enumeration | > 5 in 30 seconds | HIGH | Raised severity; tightened window |
| Special character probing | > 2 in 1 minute | HIGH | Tightened from 5/5min |
| Unusual search patterns (>100 chars) | Any occurrence | MEDIUM | Potential injection attempt |
| Lock contention abuse | > 5 in 30 seconds | CRITICAL | Tightened from 10/min |
| Rapid-fire searches | > 20 in 30 seconds | HIGH | New: detects reconnaissance |

**SECURITY NOTE:** Thresholds were tightened because original values allowed attackers to enumerate systems just below detection (e.g., 9 searches/min for 2+ hours undetected).

When anomalies are detected: log event, alert operations, and rate-limit source immediately.

**Monitoring Integration Examples:**

**Prometheus Metrics Collection:**
```bash
#!/bin/bash
# warehouse-metrics.sh - Run after each CLI invocation
# Append to /var/log/warehouse-metrics.prom for Prometheus node_exporter

EXIT_CODE=$1
COMMAND=$2
DURATION_MS=$3

# Increment counters based on exit code
case $EXIT_CODE in
  0) echo "warehouse_cli_success_total{command=\"$COMMAND\"} 1" >> /var/log/warehouse-metrics.prom ;;
  1) echo "warehouse_cli_validation_errors_total{command=\"$COMMAND\"} 1" >> /var/log/warehouse-metrics.prom ;;
  2) echo "warehouse_cli_database_errors_total{command=\"$COMMAND\"} 1" >> /var/log/warehouse-metrics.prom ;;
  3) echo "warehouse_cli_not_found_errors_total{command=\"$COMMAND\"} 1" >> /var/log/warehouse-metrics.prom ;;
  4) echo "warehouse_cli_duplicate_errors_total{command=\"$COMMAND\"} 1" >> /var/log/warehouse-metrics.prom ;;
  *) echo "warehouse_cli_unknown_errors_total{command=\"$COMMAND\"} 1" >> /var/log/warehouse-metrics.prom ;;
esac

# Record duration histogram
echo "warehouse_cli_duration_ms{command=\"$COMMAND\"} $DURATION_MS" >> /var/log/warehouse-metrics.prom
```

**Wrapper Script with Error Tracking:**
```bash
#!/bin/bash
# warehouse-cli-monitored - Wrapper that tracks metrics
START_TIME=$(date +%s%3N)
COMMAND="$1"

# Execute actual CLI
warehouse-cli "$@"
EXIT_CODE=$?

END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

# Log structured error event
if [ $EXIT_CODE -ne 0 ]; then
  jq -n --arg cmd "$COMMAND" --arg exit "$EXIT_CODE" --arg duration "$DURATION" \
    '{timestamp: now | strftime("%Y-%m-%dT%H:%M:%SZ"), event: "cli_error", command: $cmd, exit_code: ($exit|tonumber), duration_ms: ($duration|tonumber)}' \
    >> /var/log/warehouse-errors.json
fi

# Update metrics (for Prometheus, DataDog, etc.)
/path/to/warehouse-metrics.sh "$EXIT_CODE" "$COMMAND" "$DURATION"

exit $EXIT_CODE
```

**Wrapper Deployment Instructions:**

To deploy the monitoring wrapper in a production environment:

**Prerequisites:**
- Bash 4.0+ (for associative arrays if extended)
- `jq` binary installed (`apt-get install jq` or `brew install jq`)
- Write permissions to log directories (`/var/log/` or custom location)

**Installation Steps:**

1. **Install wrapper script:**
   ```bash
   sudo cp warehouse-cli-monitored /usr/local/bin/
   sudo chmod +x /usr/local/bin/warehouse-cli-monitored
   ```

2. **Install metrics collection script:**
   ```bash
   sudo cp warehouse-metrics.sh /usr/local/bin/
   sudo chmod +x /usr/local/bin/warehouse-metrics.sh
   ```

3. **Create log directories with correct permissions:**
   ```bash
   sudo mkdir -p /var/log/warehouse-cli
   sudo chown warehouse:warehouse /var/log/warehouse-cli
   sudo chmod 755 /var/log/warehouse-cli
   ```

4. **Configure log rotation to prevent disk exhaustion:**
   ```bash
   # /etc/logrotate.d/warehouse-cli
   /var/log/warehouse-cli/*.json {
       daily
       rotate 30
       compress
       delaycompress
       missingok
       notifempty
       create 0644 warehouse warehouse
   }

   /var/log/warehouse-metrics.prom {
       hourly
       rotate 24
       compress
       delaycompress
       missingok
       notifempty
       create 0644 warehouse warehouse
       postrotate
           # Signal node_exporter to reopen file if needed
           systemctl reload prometheus-node-exporter 2>/dev/null || true
       endscript
   }
   ```

5. **Set up Prometheus node_exporter (if using Prometheus):**
   ```bash
   # Configure node_exporter to scrape textfile directory
   # /etc/default/prometheus-node-exporter
   ARGS="--collector.textfile.directory=/var/log"

   sudo systemctl restart prometheus-node-exporter
   ```

6. **Optional: Create alias for convenience:**
   ```bash
   # Add to /etc/profile.d/warehouse-cli.sh
   alias warehouse-cli='warehouse-cli-monitored'
   ```

**Log Rotation Configuration Details:**

| Aspect | Setting | Rationale |
|--------|---------|-----------|
| JSON logs rotation | Daily, 30 days | Balances disk usage with troubleshooting window |
| Metrics file rotation | Hourly, 24 hours | High write frequency requires frequent rotation |
| Compression | Enabled with delaycompress | Saves disk space, delaycompress allows in-progress writes |
| Permissions | 0644 warehouse:warehouse | Readable by monitoring systems, writable by CLI |

**Monitoring System Alternatives:**

**DataDog Integration:**
```bash
# warehouse-metrics-datadog.sh
EXIT_CODE=$1
COMMAND=$2
DURATION_MS=$3

# Send metrics via DataDog StatsD
echo "warehouse.cli.invocation:1|c|#command:$COMMAND,exit_code:$EXIT_CODE" | nc -u -w1 localhost 8125
echo "warehouse.cli.duration:$DURATION_MS|ms|#command:$COMMAND" | nc -u -w1 localhost 8125
```

**CloudWatch Integration (AWS):**
```bash
# warehouse-metrics-cloudwatch.sh
EXIT_CODE=$1
COMMAND=$2
DURATION_MS=$3

aws cloudwatch put-metric-data \
  --namespace "WarehouseCLI" \
  --metric-name "Invocations" \
  --value 1 \
  --dimensions Command=$COMMAND,ExitCode=$EXIT_CODE \
  --timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

aws cloudwatch put-metric-data \
  --namespace "WarehouseCLI" \
  --metric-name "Duration" \
  --value $DURATION_MS \
  --unit Milliseconds \
  --dimensions Command=$COMMAND
```

**Note:** CloudWatch integration requires AWS CLI installed and IAM permissions configured (`cloudwatch:PutMetricData`).

**Alert Configuration Examples:**

```yaml
# alertmanager.yml (Prometheus Alertmanager)
groups:
  - name: warehouse-cli-alerts
    rules:
      - alert: WarehouseDatabaseErrorSpike
        expr: rate(warehouse_cli_database_errors_total[5m]) > 0.02
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High database error rate detected"
          description: "Database error rate exceeds 2% over 5 minutes."

      - alert: WarehouseHighErrorRate
        expr: sum(rate(warehouse_cli_errors_total[5m])) > 0.05
        for: 5m
        labels:
          severity: high
        annotations:
          summary: "High overall error rate"
          description: "Total error rate exceeds 5%."
```

**Error Pattern Detection:**

| Pattern | Detection Method | Automated Response |
|---------|------------------|-------------------|
| Database connectivity loss | 3+ exit code 2 in 1 minute | Alert + check database process |
| Disk full | Exit 2 + "no space left" in logs | Alert + disk cleanup script |
| Permission denied spike | Exit 1 + "permission denied" pattern | Alert + verify file ownership |
| Concurrent access contention | Exit 2 + "database is locked" | Alert + review concurrency load |

### Database Busy/Timeout Errors (Exit 2)

When the database is locked by another process and the 30-second timeout expires, the error is classified as a DATABASE_ERROR (exit code 2), NOT a validation error.

| Scenario | Error Message | Exit Code | Rationale |
|----------|---------------|-----------|-----------|
| Database locked during `update-stock` | "Database is busy after 30 seconds..." | 2 | Database operation failure |
| Database locked during `search` | "Database is busy after 30 seconds..." | 2 | Database operation failure |
| Database locked during `export-csv` | "Database is busy after 30 seconds..." | 2 | Database operation failure |
| Database locked during `add-item` | "Database is busy after 30 seconds..." | 2 | Database operation failure |
| Database locked during `low-stock-report` | "Database is busy after 30 seconds..." | 2 | Database operation failure |

**Scope:** Exit code 2 is used for ALL database-accessing commands when database busy timeout occurs.

**Commands affected:**
- `add-item` - writes to database
- `update-stock` - reads and writes to database
- `search` - reads from database
- `low-stock-report` - reads from database
- `export-csv` - reads from database
- `init` - creates/writes database file

**Commands NOT affected (do not access database):**
- `--version` - returns version string without database access
- `--help` - displays help text without database access
- `config show` - displays configuration without database access

This is a universal database-level error that affects any command accessing the database. The table above explicitly lists all database-accessing commands and confirms they all return exit code 2 for busy timeout.

**Error message template:**
```
Error: Database is busy after ~3 seconds (5 retry attempts exhausted). Another process may be writing. Please wait and try again.
```

**Timing calculation:** With the exponential backoff strategy specified in this document (initial 100ms, 2x multiplier, max 1600ms), the total retry time is approximately 3.1 seconds:
- Attempt 1: 100ms
- Attempt 2: 200ms
- Attempt 3: 400ms
- Attempt 4: 800ms
- Attempt 5: 1600ms
- **Total: 3100ms (~3 seconds)**

This does NOT include the SQLite busy_timeout, which is a separate internal timeout mechanism.

**Retry exhaustion indicator (REQUIRED):** The error message MUST indicate that automatic retries were attempted. This allows users to understand that:
1. The system already attempted to recover automatically
2. The issue is persistent, not a momentary lock
3. Immediate manual retry may not succeed - waiting longer is recommended

**Recovery guidance:** Wait a few seconds before retrying the command, as the system has already exhausted 5 automatic retry attempts (~3 seconds total). If the problem persists, check for other `warehouse-cli` processes or external SQLite tools accessing the same database file.

**Automatic Retry Specification for Database Busy Errors (REQUIRED):**

The application MUST implement automatic retry with exponential backoff for database busy/locked errors before surfacing the error to users:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Max retry attempts | 5 | Balance between user wait time and success rate |
| Initial delay | 100ms | Fast initial retry for short-lived locks |
| Backoff multiplier | 2x | Standard exponential backoff |
| Maximum delay | 5 seconds | Cap prevents excessive wait on persistent contention |
| Jitter | +/- 50% | Prevents thundering herd when multiple processes retry |

**Retry behavior:**
1. First attempt: immediate
2. Second attempt: ~100ms delay (with jitter)
3. Third attempt: ~200ms delay
4. Fourth attempt: ~400ms delay
5. Fifth attempt: ~800ms delay
6. If all attempts fail: Surface error to user with message "Database is busy after 30 seconds..."

**Implementation requirement:** Implementations SHOULD set `PRAGMA busy_timeout` to a reasonable value (e.g., 5000-10000ms) to allow SQLite's internal retry mechanism, separate from the application-level exponential backoff retries specified in this document. The error message reflects only the application-level retry timing (~3 seconds), not the SQLite busy_timeout.

**When automatic retry is NOT appropriate:**
- Permission denied errors (immediate failure, no retry)
- Database corruption errors (immediate failure, no retry)
- File not found errors (immediate failure, no retry)

### CSV Export File Errors (Exit 1)

All CSV export file validation errors use exit code 1 (ValidationError):

```
Error: File '{filename}' already exists. Use --force to overwrite.
Error: Cannot write to '{filename}': Permission denied.
Error: Path cannot contain '..'.
Error: Path '{filename}' is a symbolic link.
Error: Parent directory does not exist for '{filename}'.
```

**Rationale:** These are path/file validation failures, not database operation failures. The database itself is being read successfully; the failure occurs during output file validation or creation.

### Not Found Errors (Exit 3)

```
Error: SKU '{sku}' not found.

  Possible actions:
  - To create a new item:    warehouse-cli add-item --sku "{sku}" --name "Product Name" --quantity 100
  - To search for similar:   warehouse-cli search --sku "{sku_prefix}-" (partial match)
  - To list all items:       warehouse-cli search --name ""

  Tip: SKU matching is case-sensitive. Verify the exact SKU spelling.
```

**Interactive Quick Actions (REQUIRED for TTY, disable with --no-interactive):**
When running in an interactive terminal (detected via `isatty()`), the CLI MUST offer quick action prompts by default:
```
Error: SKU 'WH-999' not found.

Quick actions:
  [1] Create this item now
  [2] Search for similar SKUs
  [3] List all items
  [Enter] Cancel

Choice (1/2/3):
```
This feature is REQUIRED when a TTY is detected to provide consistent, helpful UX across all deployments. Non-interactive mode (piped output or `--no-interactive` flag) shows suggestions without prompts. Implementations MUST NOT make this optional - all interactive installations must behave consistently.

**Quick Action Execution Behavior:**

When the user selects an option, the CLI MUST execute the corresponding action immediately (not just display a command to copy). The execution behavior depends on the selected option:

| Option | Action | Input Collection | Execution |
|--------|--------|------------------|-----------|
| [1] Create this item now | Launch wizard | Prompt for: --name (required), --quantity (required), --description (optional), --location (optional), --min-stock (optional) | Execute `add-item` with collected inputs |
| [2] Search for similar SKUs | Execute search | No additional input (uses SKU prefix from error) | Execute `search --sku "{sku_prefix}*"` and display results |
| [3] List all items | Execute search | No additional input | Execute `search --name ""` and display all items |
| [Enter] Cancel | Exit | N/A | Return exit code 3 (preserving original error) |

**Wizard Mode for Option [1] (Create Item):**

When user selects "Create this item now", the CLI enters wizard mode with these prompts:

```
Creating item with SKU 'WH-999'...

Name (required): <user input>
Quantity (required, integer >= 0): <user input>
Description (optional, press Enter to skip): <user input or Enter>
Location (optional, press Enter to skip): <user input or Enter>
Minimum stock level (optional, press Enter to skip): <user input or Enter>

Confirm creation? [y/N]: <user input>
```

If user confirms (y/yes), execute the `add-item` command with collected parameters. On success, display the standard success message and exit with code 0. On error during creation, display the error and exit with the appropriate error code.

**Direct Execution for Options [2] and [3]:**

These options execute immediately without additional prompts:
- Option [2]: Executes search with wildcard suffix (e.g., `WH-*` if user searched for `WH-999`)
- Option [3]: Executes `search --name ""` to list all items

Results are displayed using the standard output format for the `search` command.

**Exit Code Behavior After Quick Actions:**
- Quick action succeeds: Exit code 0 (original error code 3 is replaced)
- Quick action fails: Exit code from the failed operation (1, 2, 3, or 4)
- User cancels: Exit code 3 (preserving original "not found" error)

**Interactive Prompt Specification:**

| Aspect | Requirement | Rationale |
|--------|-------------|-----------|
| **Stdin Reading** | Use `sys.stdin.readline()` with `.strip()` | Captures user input including Enter key |
| **Timeout Behavior** | No timeout (blocking read) | Interactive prompts wait indefinitely for user decision |
| **Input Validation** | Accept: "1", "2", "3", "" (empty/Enter); Reject: all other input | Clear expected values minimize user confusion |
| **Invalid Input Handling** | Display: "Invalid choice. Press Enter to cancel." then re-prompt | Allows user to correct typo without aborting command |
| **Default Behavior** | Empty input (Enter key) = Cancel operation, exit code 3 preserved | Non-destructive default prevents accidental actions |
| **Maximum Re-prompts** | 3 invalid attempts, then auto-cancel | Prevents infinite loop if input stream is corrupted |

**Implementation pattern:**
```python
import sys

def prompt_quick_action(sku: str, max_attempts: int = 3) -> Optional[str]:
    """Prompt user for quick action selection.

    Returns:
        "1", "2", "3" for chosen action, None for cancel
    """
    for attempt in range(max_attempts):
        try:
            choice = sys.stdin.readline().strip()

            # Empty input or whitespace = cancel
            if choice == "":
                return None

            # Validate choice
            if choice in ("1", "2", "3"):
                return choice

            # Invalid input - re-prompt
            print("Invalid choice. Press Enter to cancel.", file=sys.stderr)
            if attempt < max_attempts - 1:
                print("Choice (1/2/3): ", end="", file=sys.stderr, flush=True)
        except (EOFError, KeyboardInterrupt):
            # Stdin closed or user interrupted - treat as cancel
            return None

    # Max attempts exhausted - auto-cancel
    print("\nToo many invalid inputs. Cancelling.", file=sys.stderr)
    return None
```

**Edge cases:**
- **EOF on stdin**: Treat as cancel (return None), no error message
- **Ctrl+C during prompt**: Catch `KeyboardInterrupt`, treat as cancel, exit code 130
- **Non-ASCII input**: Accept as-is, will fail validation and re-prompt
- **Very long input (>1000 chars)**: Truncate to first 1000 chars before validation
- **Newline-only input**: Treat as empty string (cancel)

**Note:** The error message provides multiple recovery paths:
1. **Create new item** - for users who intended to add a new product but used the wrong command
2. **Search for similar** - for users who may have misremembered the exact SKU
3. **List all items** - for users who need to find the correct SKU

The case-sensitivity tip addresses a common source of confusion.

### Duplicate Errors (Exit 4)

```
Error: SKU '{sku}' already exists.
```

---

## Error Handling Rules

### Rule 1: Catch at CLI Layer

Exceptions bubble up from command/database layers. The CLI layer catches them and:
1. Prints user-friendly message to stderr
2. Exits with appropriate code

```python
# cli.py
def main():
    try:
        # parse args and dispatch to command
        result = dispatch_command(args)
        # print result
        sys.exit(0)
    except WarehouseError as e:
        print(f"Error: {e.message}", file=sys.stderr)
        sys.exit(e.exit_code)
    except KeyboardInterrupt:
        # User cancelled - MUST cleanup before exit
        # SECURITY: Ensure database is in consistent state
        _cleanup_on_interrupt()
        sys.exit(130)  # Standard exit code for SIGINT


def _cleanup_on_interrupt():
    """Explicit cleanup handler for KeyboardInterrupt.

    CRITICAL: This function MUST be called before sys.exit(130) to:
    - Rollback uncommitted transactions (prevents partial state)
    - Release database locks (prevents stuck locks)
    - Flush output buffers (prevents truncated output)

    Without explicit cleanup, interrupting during multi-step operations
    (e.g., batch import) could leave partial records or locked databases.
    """
    # Rollback any active transaction via context manager cleanup
    # The context manager's __exit__ handles rollback automatically,
    # but we need to ensure it's triggered even on interrupt
    import gc
    gc.collect()  # Trigger context manager cleanup

    # Flush buffers
    try:
        sys.stdout.flush()
        sys.stderr.flush()
    except Exception:
        pass
    except SystemExit:
        raise  # Let SystemExit propagate naturally
    except Exception as e:
        # Log exception type for user diagnosis (without exposing internals)
        error_type = type(e).__name__
        print(f"Error: An unexpected error occurred ({error_type}).", file=sys.stderr)
        print("Run with --verbose for more details.", file=sys.stderr)
        print("If the error persists:", file=sys.stderr)
        print("  1. Check the application log at ~/.warehouse-cli/error.log", file=sys.stderr)
        print("  2. Report the issue with the error type shown above", file=sys.stderr)
        if args.verbose:
            traceback.print_exc()
        sys.exit(1)
```

**Escalation guidance for unexpected errors (REQUIRED):** The generic exception handler MUST provide a clear escalation path:
1. Suggest running with --verbose for more details
2. If verbose mode also fails or error persists, direct users to check the log file
3. Provide guidance on reporting the issue with the error type

This ensures users always have a next step, rather than being stuck with an opaque "report this issue" message.

**Generic Exception Handler Behavior:**

The catch-all `Exception` handler is intentionally broad to ensure the CLI always exits gracefully with a user-friendly message. However, certain exception categories have distinct characteristics:

| Exception Category | Examples | Behavior | Recoverable | Recommended Action | Exit Code |
|-------------------|----------|----------|-------------|-------------------|-----------|
| Network/transient | `ConnectionError`, `TimeoutError` | Caught, user message shown | Yes | Retry after brief delay | 1 |
| Resource exhaustion | `MemoryError`, `RecursionError` | Caught, user message shown | No | Reduce workload, check system resources | 1 |
| System exit signals | `SystemExit` | NOT caught (re-raised) | N/A | N/A | (varies) |
| Keyboard interrupt | `KeyboardInterrupt` | Handled separately | N/A | User-initiated | 130 |
| File system errors | `IOError`, `PermissionError` | Caught, user message shown | Maybe | Check permissions, disk space | 1 |
| Data errors | `ValueError`, `TypeError` | Caught, user message shown | No | Fix input data, report bug | 1 |

**Exception Recovery Classification:**

| Exception Type | Recoverable? | Retry Strategy | User Action |
|----------------|--------------|----------------|-------------|
| `ConnectionError` | Yes | Retry up to 3 times with exponential backoff | Wait and retry |
| `TimeoutError` | Yes | Retry up to 3 times with exponential backoff | Wait and retry |
| `sqlite3.OperationalError` (locked/busy) | Yes | Retry up to 5 times with exponential backoff | Wait and retry |
| `MemoryError` | No | Immediate failure, no retry | Reduce workload or increase memory |
| `RecursionError` | No | Immediate failure, no retry | Report bug (likely infinite loop) |
| `PermissionError` | No | Immediate failure, no retry | Fix file/directory permissions |
| `FileNotFoundError` | No | Immediate failure, no retry | Verify paths exist |
| `ValueError` | No | Immediate failure, no retry | Correct invalid input |
| `TypeError` | No | Immediate failure, no retry | Report bug (type mismatch) |

**Design rationale:** All unexpected errors exit with code 1 because:
1. **Simplicity:** Distinguishing severity would require maintaining an exception-to-severity mapping that could become stale
2. **User action is the same:** For any unexpected error, the user should either retry, use `--verbose` for details, or report the issue
3. **Exit code purpose:** Exit codes signal the *category* of failure (validation, database, not-found), not severity

**Critical errors that bypass this handler:** `SystemExit` is explicitly re-raised to allow internal exits. `KeyboardInterrupt` is handled separately. `BaseException` subclasses like `GeneratorExit` are not caught.

**When to add specific handlers:** If a particular unexpected error becomes common and has a distinct recovery strategy, add a specific `except` clause for it above the generic handler.

### Rule 2: Never Expose Internals

> **SECURITY CRITICAL** - This rule prevents information leakage that could aid attackers.

User-facing error messages MUST NOT include:
- Full file system paths (use `os.path.basename()` only)
- Absolute paths to any file or directory
- SQL query text
- Stack traces (unless --verbose)
- Internal exception types
- Database schema details
- System usernames or home directory paths

**Examples of what NOT to expose:**

**Bad (full path):**
```
Error: Cannot open database '/home/jsmith/projects/inventory/data/inventory.db'
Error: File '/Users/admin/secret/export.csv' already exists.
```

**Good (basename only):**
```
Error: Cannot open database 'inventory.db'
Error: File 'export.csv' already exists.
```

**Bad (internal details):**
```
Error: sqlite3.IntegrityError: UNIQUE constraint failed: products.sku
Error: PermissionError: [Errno 13] Permission denied: '/var/data/inventory.db'
```

**Good (user-friendly):**
```
Error: SKU 'WH-001' already exists.
Error: Cannot write to 'inventory.db': Permission denied.
```

**Implementation pattern:**
```python
import os

def format_error_path(path: str) -> str:
    """Return basename for error messages to avoid leaking full paths."""
    return os.path.basename(path)

# Usage in error messages:
raise ValidationError(f"File '{format_error_path(output_path)}' already exists.")
raise DatabaseError(f"Cannot open database '{format_error_path(db_path)}'.")
```

### Rule 3: Be Specific

When multiple validation errors could apply, report the first one found in the canonical validation order.

**Canonical Validation Order (REQUIRED):**

For `add-item` and `update-stock` commands, validations MUST be performed in this exact order:
1. SKU emptiness check
2. SKU length check (max 50 characters)
3. SKU character validation (alphanumeric, hyphen, underscore only)
4. Name emptiness check
5. Name length check (max 255 characters)
6. Quantity type check (must be integer)
7. Quantity range check (0 to 999,999,999)
8. Optional field validations (description length, location length, min_stock_level range)

**Test assertion:** When input has multiple validation errors, the error message MUST match the first failing validation in this order.

**Multi-Error Test Cases (REQUIRED):**

| Test Input | Errors Present | Expected Error Message |
|------------|----------------|------------------------|
| `--sku "" --name "" --quantity -1` | SKU empty, Name empty, Quantity negative | "SKU cannot be empty." (first in order) |
| `--sku "A"*51 --name "" --quantity 100` | SKU too long, Name empty | "SKU must be 50 characters or fewer. Got: 51" |
| `--sku "WH@001" --name "" --quantity 100` | SKU invalid chars, Name empty | "SKU contains invalid characters..." |
| `--sku "WH-001" --name "" --quantity -1` | Name empty, Quantity negative | "Name cannot be empty." (Name checked before Quantity) |
| `--sku "WH-001" --name "A"*256 --quantity -1` | Name too long, Quantity negative | "Name must be 255 characters or fewer. Got: 256" |

**Test Implementation Pattern:**
```python
def test_validation_order_sku_before_name():
    """Verify SKU errors reported before Name errors."""
    result = run_cli("add-item", "--sku", "", "--name", "", "--quantity", "100")
    assert result.exit_code == 1
    assert "SKU cannot be empty" in result.stderr
    assert "Name cannot be empty" not in result.stderr  # Should not reach Name validation
```

```python
def validate_add_item(sku, name, quantity):
    # 1. SKU emptiness
    if not sku:
        raise ValidationError("SKU cannot be empty.")
    # 2. SKU length
    if len(sku) > 50:
        raise ValidationError(f"SKU must be 50 characters or fewer. Got: {len(sku)}")
    # 3. SKU characters
    if not re.match(r'^[A-Za-z0-9_-]+$', sku):
        raise ValidationError("SKU contains invalid characters. Allowed: letters, numbers, hyphens, underscores.")
    # 4. Name emptiness
    if not name:
        raise ValidationError("Name cannot be empty.")
    # 5. Name length
    if len(name) > 255:
        raise ValidationError(f"Name must be 255 characters or fewer. Got: {len(name)}")
    # 6-7. Quantity validation (see validate_quantity() in Quantity Error Message Formats section for canonical implementation)
    if not isinstance(quantity, int) or isinstance(quantity, bool):
        raise ValidationError(f"Quantity must be an integer. Got: {quantity!r} (type: {type(quantity).__name__})")
    if quantity < 0:
        raise ValidationError(f"Quantity must be a non-negative integer. Got: {quantity}")
    if quantity > 999999999:
        raise ValidationError(f"Quantity cannot exceed 999,999,999. Got: {quantity}")
    # ... continue with optional field validation
```

### Rule 4: Distinguish Error Types

Use the specific exception type that matches the error:

| Situation | Exception |
|-----------|-----------|
| Bad user input | `ValidationError` |
| SQLite can't connect | `DatabaseError` |
| SKU not in database | `ItemNotFoundError` |
| SKU already in database | `DuplicateItemError` |
| File permission issue | `ValidationError` (if path) or `DatabaseError` (if db file) |

### Rule 5: Preserve Original Exceptions

When catching and re-raising, preserve the original exception for debugging:

```python
try:
    cursor.execute(query, params)
except sqlite3.IntegrityError as e:
    error_msg = str(e).lower()
    if "unique constraint" in error_msg:
        raise DuplicateItemError(f"SKU '{sku}' already exists.") from e
    elif "not null constraint" in error_msg:
        raise DatabaseError("A required field is missing. Please check all required fields are provided.") from e
    elif "check constraint" in error_msg:
        raise DatabaseError("A value is outside the allowed range. Please verify quantity and stock levels.") from e
    elif "foreign key constraint" in error_msg:
        raise DatabaseError("Referenced item does not exist. Please verify related data exists.") from e
    else:
        # CRITICAL: This fallback handles ALL other constraint types, including:
        # - Future SQLite constraint types not yet known
        # - Constraint messages in unexpected formats
        # - Localized SQLite error messages (if any)
        raise DatabaseError("Database constraint violation. The operation conflicts with data integrity rules.") from e
```

**Constraint Type Detection Robustness (CRITICAL):**

The constraint detection relies on string matching against SQLite error messages. To ensure robustness against future SQLite versions or unexpected error formats:

1. **Fallback is mandatory:** The `else` clause MUST raise a generic `DatabaseError`. The `else` clause MUST NOT re-raise the original `IntegrityError`. This ensures users never see raw SQL error messages.

2. **Known constraint patterns (SQLite 3.x):**
   | Constraint Type | Error Message Pattern | Stable Since |
   |-----------------|----------------------|--------------|
   | UNIQUE | "unique constraint failed" | SQLite 3.0 |
   | NOT NULL | "not null constraint failed" | SQLite 3.0 |
   | CHECK | "check constraint failed" | SQLite 3.0 |
   | FOREIGN KEY | "foreign key constraint failed" | SQLite 3.6.19 |
   | PRIMARY KEY | "unique constraint failed" (treated as unique) | SQLite 3.0 |

3. **Future constraint types:** If SQLite introduces new constraint types (e.g., EXCLUDE constraints), the fallback message will be used until the code is updated. This is acceptable because:
   - The user still sees a friendly error message
   - The original exception is preserved in the chain for debugging
   - Verbose mode can show the full stack trace if needed

4. **Error message parsing failure:** If `str(e)` returns an unexpected format (e.g., empty string, non-ASCII), the `else` branch handles it safely. The `.lower()` call may raise an exception only if `str(e)` contains invalid Unicode, which is extremely unlikely for SQLite.

**Test requirement:** Unit tests MUST include a case that triggers the `else` branch to verify fallback behavior.

**Unknown Constraint Fallback Test Specification:**

| Test Aspect | Requirement |
|-------------|-------------|
| Input | Mock `sqlite3.IntegrityError` with unrecognized message (e.g., "novel constraint xyz") |
| Expected exit code | 2 (DATABASE_ERROR) |
| Expected error message | "Database constraint violation. The operation conflicts with data integrity rules." |
| NOT in output | Original exception message ("novel constraint xyz") |
| Logging (verbose) | Original exception MUST appear in stack trace when --verbose is used |

```python
def test_unknown_constraint_type():
    """Verify unknown constraint errors produce generic message."""
    # Mock sqlite3.IntegrityError with unrecognized message
    with patch.object(cursor, 'execute', side_effect=sqlite3.IntegrityError("novel constraint xyz")):
        result = run_cli("add-item", "--sku", "TEST", "--name", "Test", "--quantity", "1")
        assert result.exit_code == 2
        assert "Database constraint violation" in result.stderr
        assert "novel constraint" not in result.stderr  # Internal detail not exposed

def test_unknown_constraint_verbose_shows_original():
    """Verify --verbose exposes original exception for debugging."""
    with patch.object(cursor, 'execute', side_effect=sqlite3.IntegrityError("novel constraint xyz")):
        result = run_cli("add-item", "--sku", "TEST", "--name", "Test", "--quantity", "1", "--verbose")
        assert result.exit_code == 2
        assert "novel constraint xyz" in result.stderr  # Original visible in verbose mode
```

# Note: String matching on exception messages uses lowercase comparison for consistency.
# SQLite error messages are stable within major versions. If localization is a concern,
# consider using sqlite3 error codes (e.sqlite_errorcode) in Python 3.11+.

**Python Version-Dependent SQLite Error Handling:**

The `sqlite3.sqlite_errorcode` attribute is available in Python 3.11+ only. Since this project supports Python 3.10+, implementations MUST handle both scenarios:

| Python Version | Error Code Access | Fallback Strategy |
|---------------|-------------------|-------------------|
| 3.11+ | `e.sqlite_errorcode` available | Use error codes for precise classification |
| 3.10 | Attribute not available | Use string matching on `str(e)` |

**Version-compatible implementation (REQUIRED):**

```python
import sys
import sqlite3

def classify_sqlite_error(e: sqlite3.Error) -> str:
    """Classify SQLite error using best available method.

    Uses error codes on Python 3.11+, falls back to string matching on 3.10.
    """
    # Python 3.11+ has sqlite_errorcode attribute
    if sys.version_info >= (3, 11) and hasattr(e, 'sqlite_errorcode'):
        error_code = e.sqlite_errorcode
        if error_code == 19:  # SQLITE_CONSTRAINT
            return "constraint_violation"
        elif error_code == 5:  # SQLITE_BUSY
            return "database_busy"
        elif error_code == 1:  # SQLITE_ERROR
            return "general_error"
        # Add more codes as needed

    # Fallback: string matching (works on all Python versions)
    error_msg = str(e).lower()
    if "unique constraint" in error_msg:
        return "unique_violation"
    elif "not null constraint" in error_msg:
        return "not_null_violation"
    elif "database is locked" in error_msg or "busy" in error_msg:
        return "database_busy"

    return "unknown_error"
```

**Test requirement:** Unit tests MUST verify consistent behavior across Python 3.10 and 3.11+ by mocking `sys.version_info`.

---

## Error Propagation Rules

When errors occur deep in the application stack (database layer, validation layer), error context MUST be preserved and propagated correctly to the CLI layer.

### Multi-Layer Error Propagation

**Architecture layers (bottom to top):**
1. **Database layer** - sqlite3 exceptions
2. **Repository layer** - transforms to domain exceptions
3. **Command layer** - business logic
4. **CLI layer** - user-facing error messages

**Propagation rules:**

| Layer | Responsibility | What to preserve | What to transform |
|-------|---------------|------------------|-------------------|
| Database | Raw sqlite3 exceptions | N/A (originating layer) | N/A |
| Repository | Catch sqlite3 exceptions | Original exception via `from e` | User-friendly message |
| Command | Pass through or wrap | Exception chain | Add business context if needed |
| CLI | Format for user | Nothing (terminal layer) | Format message for stderr |

**Information to preserve at each layer:**

```python
# Repository layer example
def add_item(self, item: Product) -> int:
    try:
        cursor = self.conn.execute(
            "INSERT INTO products (...) VALUES (...)",
            (item.sku, item.name, ...)
        )
        return cursor.lastrowid
    except sqlite3.IntegrityError as e:
        # Preserve: original exception (e), layer context (Repository)
        # Transform: sqlite3 message -> user-friendly message
        raise DuplicateItemError(f"SKU '{item.sku}' already exists.") from e
    except sqlite3.OperationalError as e:
        # Preserve: original exception, error details for logging
        # Transform: technical message -> user message
        raise DatabaseError(f"Database operation failed.") from e
```

**Logging requirements for multi-layer errors:**

When `--verbose` is enabled, the full exception chain MUST be visible:
```
Error: Database operation failed.
Traceback (most recent call last):
  File "repository.py", line 45, in add_item
    cursor = self.conn.execute(...)
sqlite3.OperationalError: disk I/O error

The above exception was the direct cause of the following exception:

Traceback (most recent call last):
  File "cli.py", line 23, in main
    repository.add_item(item)
warehouse.errors.DatabaseError: Database operation failed.
```

**Test requirement:** Integration tests MUST verify that exception chains are preserved:
```python
def test_exception_chain_preserved():
    """Verify original exception is in the chain for debugging."""
    # Trigger a database error
    with patch('sqlite3.Connection.execute', side_effect=sqlite3.OperationalError("test error")):
        try:
            repository.add_item(test_item)
        except DatabaseError as e:
            assert e.__cause__ is not None
            assert isinstance(e.__cause__, sqlite3.OperationalError)
            assert "test error" in str(e.__cause__)
```

---

## Verbose Mode

When `--verbose` is set:
1. Print debug information during execution
2. On error, print full stack trace
3. Include full file paths in error messages

**Verbose mode does NOT expose:**
- SQL query text with parameter VALUES (values could contain sensitive data)
- Credentials or secrets

**SECURITY REQUIREMENT - Query Structure Output Control (ALL DEPLOYMENTS):**

Query structure with placeholders (e.g., `SELECT * FROM products WHERE sku = ?`) MUST NOT be shown in `--verbose` mode by default. Schema information (table names, column names, query patterns) aids SQL injection crafting and reveals application logic. This is a security risk in any deployment where unauthorized users could observe verbose output or logs.

**Security Controls:**
- Schema information MUST NOT be output to stderr in production
- Log query structures to a restricted debug file (0600 permissions) rather than stderr
- Be aware that schema exposure could aid attackers in understanding the database structure

**REQUIRED - Query Structure Output Control (SECURITY-SENSITIVE DEPLOYMENTS):**

For deployments where schema information is considered sensitive, implementations MUST:

1. **Default to NOT showing query structure** in `--verbose` mode
2. **Require explicit `--debug-sql` flag** to enable query structure output
3. **Log a security warning** when `--debug-sql` is used: `"WARNING: SQL query structures are being logged. This exposes schema information."`

```python
# REQUIRED: Separate flags for verbose vs SQL debug
if args.verbose:
    print(f"DEBUG: Connecting to database", file=sys.stderr)
    print(f"DEBUG: Executing search operation", file=sys.stderr)

# ONLY show query structure if explicitly requested
if args.debug_sql:
    print(f"WARNING: SQL query structures are being logged. This exposes schema information.", file=sys.stderr)
    print(f"DEBUG-SQL: SELECT ... FROM products WHERE sku = ?", file=sys.stderr)
```

**Rationale:** Schema exposure can reveal:
- Table and column names (aids SQL injection crafting)
- Query patterns (reveals application logic)
- Index usage (reveals optimization vulnerabilities)
- JOIN structures (reveals data relationships)

```python
if args.verbose:
    print(f"DEBUG: Connecting to {db_path}", file=sys.stderr)
    print(f"DEBUG: Executing search for SKU", file=sys.stderr)  # Don't log query text

# CRITICAL: Verbose debug output MUST NOT include:
# - Parameter values from user input (may contain sensitive data)
# - Full query strings with interpolated values
# - Any data retrieved from database records
#
# Debug messages should use generic descriptions:
#   GOOD: "DEBUG: Executing search for SKU"
#   BAD:  f"DEBUG: Searching for SKU={user_sku}"
#
# If detailed logging is needed for development, use a separate debug log file
# with restricted permissions, never stdout/stderr.
```

**User-Facing Verbose Mode Warning (REQUIRED):**
When `--verbose` mode is enabled, the CLI MUST display a security notice at the **very start of stderr output**, before any other debug messages:
```
================================================================================
[VERBOSE MODE ENABLED]
Note: Debug output may include database file paths and operation timing.
Review output before sharing in bug reports or support tickets.
================================================================================
```

**Display requirements:**
- **Position:** MUST appear as the FIRST output to stderr when verbose mode is active
- **Visibility:** Use box/separator lines (===) to make the warning visually prominent
- **Suppression:** Can be suppressed with `--quiet-warning` flag for automated testing scenarios
- **Persistence:** Displays once per command invocation (not repeated for multi-step operations)

This warning helps users understand what information is being exposed and reminds them to sanitize output before sharing publicly.

---

## Testing Error Conditions

Each error path should have a test with both positive assertions (what SHOULD appear) and negative assertions (what MUST NOT appear):

```python
def test_add_item_empty_sku():
    """Test that empty SKU produces correct error without duplicate messages."""
    result = run_cli("add-item", "--sku", "", "--name", "Test", "--quantity", "1")

    # Positive assertions - what MUST appear
    assert result.exit_code == 1
    assert "SKU cannot be empty" in result.stderr

    # Negative assertions - what MUST NOT appear
    assert "Name cannot be empty" not in result.stderr  # Should not reach name validation
    assert result.stdout == ""  # No output to stdout on error

def test_add_item_duplicate():
    """Test duplicate SKU error with database state verification."""
    # Setup: Create initial item
    setup_result = run_cli("add-item", "--sku", "WH-001", "--name", "Test", "--quantity", "1")
    assert setup_result.exit_code == 0  # Precondition check

    # Test: Attempt duplicate
    result = run_cli("add-item", "--sku", "WH-001", "--name", "Test2", "--quantity", "2")

    # Positive assertions
    assert result.exit_code == 4
    assert "already exists" in result.stderr

    # Negative assertions
    assert "created" not in result.stdout  # No success message

    # Database state verification - original item unchanged
    verify_result = run_cli("search", "--sku", "WH-001", "--format", "json")
    item = json.loads(verify_result.stdout)[0]
    assert item["name"] == "Test"  # Original name preserved
    assert item["quantity"] == 1   # Original quantity preserved

def test_update_stock_not_found():
    """Test SKU not found error with helpful suggestions."""
    result = run_cli("update-stock", "--sku", "NONEXISTENT", "--set", "10")

    # Positive assertions
    assert result.exit_code == 3
    assert "not found" in result.stderr

    # Negative assertions
    assert "updated" not in result.stdout  # No success message
    assert "Error:" in result.stderr  # Error prefix present
```

**Test data requirements for boundary cases:**
| Test | Boundary Value | Expected Behavior |
|------|----------------|-------------------|
| Empty SKU | `""` | Exit 1, "SKU cannot be empty" |
| Max length SKU | `"A" * 50` | Exit 0, item created |
| Over max SKU | `"A" * 51` | Exit 1, "SKU must be 50 characters or fewer" |
