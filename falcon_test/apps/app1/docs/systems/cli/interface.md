# CLI Interface: Warehouse Inventory CLI

**Status:** [FINAL]

> **Note on FINAL Status:** This document has been reviewed and approved. The command interface specifications are stable for implementation.

> **Important: This is a CLI-only application with NO web API.** This tool provides a command-line interface exclusively. There are no HTTP/REST, GraphQL, or gRPC endpoints. For programmatic integration, see the "Programmatic Integration" section below.

**Review Tracking:**
- **Reviewer:** Product Owner and Development Lead
- **Sections Reviewed:**
  - [x] Command specifications (init, add-item, update-stock, search, low-stock-report, export-csv, delete-item, update-item)
  - [x] Input validation rules and length limits
  - [x] Environment variable handling
  - [x] Output format specifications
- **Completion Date:** 2026-01-20

**Note:** All review items have been completed. The command specifications in this document are finalized and approved for implementation.

---

## Scope and Non-Goals

### What This Tool Provides

The Warehouse Inventory CLI is a command-line tool for managing inventory through simple commands (`init`, `add-item`, `update-item`, `update-stock`, `delete-item`, `search`, `low-stock-report`, `export-csv`). It stores data in a local SQLite database and outputs machine-readable formats (JSON, CSV) for scripting integration.

### Non-Goals

The following are explicitly **out of scope** for this application:

1. **Web API Endpoints** - No HTTP/REST, GraphQL, or gRPC interfaces are provided or planned. This tool operates entirely through command-line invocation.

2. **API Versioning Strategy** - Since there is no web API, traditional API versioning (URL versioning, header versioning) does not apply. CLI version compatibility is managed through the `--version` flag and semantic versioning of the tool itself.

3. **API Authentication/Authorization** - No API keys, OAuth tokens, or JWT authentication are needed. Access control is managed through filesystem permissions on the database file and standard OS user permissions for executing the CLI binary.

4. **API Rate Limiting** - Since there is no network API, rate limiting is not applicable. Resource limits are handled through database transaction limits and filesystem constraints.

### Programmatic Integration

For programmatic integration with other systems (ERPs, e-commerce platforms, warehouse management systems), use one of the following approaches:

1. **Shell Scripting** - Invoke the CLI from shell scripts with appropriate arguments:
   ```bash
   # Example: Automated stock check
   result=$(warehouse-cli search --sku "$SKU" --format json)
   quantity=$(echo "$result" | jq -r '.[0].quantity // 0')
   ```

2. **Subprocess Invocation** - Call the CLI from application code:
   ```python
   import subprocess
   import json

   result = subprocess.run(
       ["warehouse-cli", "search", "--sku", "WH-001", "--format", "json"],
       capture_output=True, text=True
   )
   items = json.loads(result.stdout)
   ```

3. **Direct Database Access** - For high-performance requirements, applications may access the SQLite database directly using the schema documented in `schema.md`. Note that concurrent write access requires careful transaction management (see WAL mode documentation).

   > **Schema Versioning:** The database includes a `schema_version` table for tracking schema changes. Before accessing the database directly, verify the schema version matches your integration's expectations by querying `SELECT MAX(version) FROM schema_version`. See `schema.md` for migration policies and breaking change notifications.

### Version Compatibility

CLI version compatibility follows semantic versioning:
- **Major version** (X.0.0): Breaking changes to command syntax or output format
- **Minor version** (0.X.0): New commands or options, backward-compatible
- **Patch version** (0.0.X): Bug fixes, no interface changes

#### Programmatic Interface Stability Guarantees

For systems integrating via subprocess invocation or shell scripting, the following stability guarantees apply:

| Interface Element | Stability Guarantee | Breaking Change Policy |
|-------------------|---------------------|------------------------|
| Exit codes (0-4, 130) | **Stable API** | Exit code meanings will NOT change within major versions |
| JSON output field names | **Stable API** | Existing field names will NOT be renamed or removed within major versions |
| JSON output field types | **Stable API** | Data types (string, number, etc.) will NOT change within major versions |
| JSON new field additions | Backward-compatible | New fields MAY be added in minor versions (integrations SHOULD ignore unknown fields) |
| Command-line syntax | Stable | Existing commands/options will NOT change within major versions |
| Error message text | **Not stable** | Human-readable error text may change; use exit codes for programmatic error handling |

**JSON Output Contract:**
- Field names use snake_case (e.g., `min_stock_level`)
- Null values are represented as JSON `null`, not empty strings
- Arrays are always returned, even for single results (e.g., `[{...}]`)
- Integrations MUST handle additional fields gracefully (ignore unknown fields)

Check CLI version programmatically:
```bash
warehouse-cli --version
# Output: warehouse-cli 0.1.0
```

---

## Global Options

> **CRITICAL: Understand Database Location First**
>
> The default database location (`./inventory.db`) is **relative to where you run the command from**. This is the #1 source of user confusion. Running `warehouse-cli init` from different directories creates different databases. Always use `--db /absolute/path/inventory.db` or set the `WAREHOUSE_DB` environment variable to avoid accidentally creating multiple database files. See "WARNING: Current Working Directory Risk" in the init command section for details.

These options apply to all commands:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--db PATH` | string | `./inventory.db` | Path to SQLite database file (see Environment Variables below) |
| `--verbose` | flag | false | Enable debug output (see Environment Variables below) |
| `--no-interactive` | flag | false | Disable interactive prompts and quick actions (see below) |
| `--help` | flag | - | Show help for command |
| `--version` | flag | - | Show version number (format: `warehouse-cli VERSION`, e.g., `warehouse-cli 0.1.0`) |

**Non-Interactive Mode (--no-interactive):**

When `--no-interactive` is specified, the CLI operates in non-interactive mode suitable for scripting and automation:

| Behavior | Interactive (default) | Non-Interactive |
|----------|----------------------|-----------------|
| Confirmation prompts | Shown | Skipped (assumes "yes") |
| Quick action suggestions | Shown after errors | Suppressed |
| Progress spinners | Shown for long operations | Suppressed |
| Colored output | Enabled if terminal supports | Disabled |

**Use cases for --no-interactive:**
- CI/CD pipelines where stdin is not available
- Cron jobs and scheduled tasks
- Shell scripts that parse CLI output
- Containerized environments without TTY

**Environment variable:** Set `WAREHOUSE_NO_INTERACTIVE=true` to enable non-interactive mode by default. The `--no-interactive` flag takes precedence if both are set.

**Error handling in non-interactive mode:** When an error occurs that would normally prompt for user action, the CLI exits with the appropriate error code immediately. See errors.md for the complete error code reference.

### Interactive Quick Actions Specification

When running in interactive mode (default when TTY is detected), the CLI may prompt users with quick action suggestions after certain errors. This feature helps users recover from common mistakes without manually typing follow-up commands.

**Quick Action Behavior:**

| Aspect | Specification |
|--------|---------------|
| **Trigger conditions** | Displayed after specific recoverable errors (e.g., "item not found", "database not initialized") |
| **Display format** | Numbered list of suggested actions with single-key shortcuts (1-9) |
| **Input method** | Read from stdin using `input()` with prompt: `"Choose an option (or press Enter to skip): "` |
| **Timeout** | No timeout - prompt waits indefinitely for user input |
| **Valid inputs** | Numeric keys 1-9 corresponding to displayed options, or Enter to skip |
| **Invalid input handling** | Display error message: `"Invalid option. Press Enter to continue."` and exit with original error code |
| **Default behavior** | Pressing Enter (empty input) dismisses the prompt and exits with the original error code |
| **Non-interactive mode** | Quick action prompts are completely suppressed when `--no-interactive` flag is set or stdin is not a TTY |

**Example Quick Action Prompt:**

```
Error: Database not found at 'inventory.db'.

Quick actions:
  1. Initialize database here (warehouse-cli init)
  2. Specify different database path (warehouse-cli --db /path/to/db ...)

Choose an option (or press Enter to skip): _
```

**Input Validation:**

```python
def prompt_quick_action(options: list[str]) -> int | None:
    """Prompt user for quick action selection.

    Args:
        options: List of action descriptions (1-indexed)

    Returns:
        Selected option number (1-based), or None if user skipped
    """
    if not sys.stdin.isatty() or os.getenv('WAREHOUSE_NO_INTERACTIVE') == 'true':
        return None  # Suppress in non-interactive mode

    try:
        choice = input("Choose an option (or press Enter to skip): ").strip()

        if choice == "":
            return None  # User pressed Enter - skip

        choice_num = int(choice)
        if 1 <= choice_num <= len(options):
            return choice_num
        else:
            print(f"Invalid option. Press Enter to continue.", file=sys.stderr)
            input()  # Wait for Enter
            return None

    except ValueError:
        print(f"Invalid option. Press Enter to continue.", file=sys.stderr)
        input()  # Wait for Enter
        return None
    except (KeyboardInterrupt, EOFError):
        print("\nCancelled.", file=sys.stderr)
        return None
```

**Security Considerations:**

- Quick actions MUST NOT automatically execute commands - they only suggest commands or execute with explicit user confirmation
- Input validation MUST reject any input that is not a valid option number or empty string
- Commands suggested in quick actions MUST be safe and non-destructive (or clearly labeled if destructive, e.g., "Initialize database (will overwrite existing data)")

**Version constant fallback (Edge Case):**

If `__version__` is not defined in `__init__.py` or cannot be read, the --version handler MUST:
1. Attempt to read version from `__version__` attribute in the package
2. If `NameError` or `AttributeError` occurs, display: `warehouse-cli (version unknown)`
3. Exit with code 0 (the version query itself succeeded; version data is simply unavailable)

```python
def get_version() -> str:
    """Get application version with fallback for missing constant."""
    try:
        from warehouse_cli import __version__
        return __version__
    except (ImportError, AttributeError):
        return "(version unknown)"
```

**Rationale:** A missing version constant should not crash the application.

### Environment Variables

The CLI supports configuration via environment variables for deployment automation:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WAREHOUSE_DB` | string | `./inventory.db` | Default database path when `--db` not specified |
| `WAREHOUSE_VERBOSE` | boolean | `false` | Enable verbose output by default (`true`, `1`, or `yes`) |

**Precedence rules:**
1. Command-line flags (highest priority) - `--db`, `--verbose`
2. Environment variables - `WAREHOUSE_DB`, `WAREHOUSE_VERBOSE`
3. Built-in defaults (lowest priority) - `./inventory.db`, `false`

**Example usage:**
```bash
# Set database path for all commands in this shell session
export WAREHOUSE_DB=/data/warehouse/inventory.db

# Run commands without --db flag
warehouse-cli add-item --sku WH-001 --name "Widget" --quantity 100
warehouse-cli search --name "widget"

# Override with command-line flag when needed
warehouse-cli search --name "widget" --db /tmp/test.db
```

**Containerized deployments:**
```dockerfile
ENV WAREHOUSE_DB=/data/inventory.db
ENV WAREHOUSE_VERBOSE=false
```

**Boolean parsing for WAREHOUSE_VERBOSE:**
- Truthy values: `true`, `1`, `yes`, `on` (case-insensitive)
- Falsy values: `false`, `0`, `no`, `off`, empty string, or unset
- Invalid values are treated as falsy (fail-safe)

---

## Commands

### `init`

Initialize a new inventory database.

**Syntax:**
```
warehouse-cli init [--db PATH] [--force]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--force` | flag | false | Overwrite existing database |

**Behavior:**

The implementation MUST perform the following steps in order:
1. The system MUST check if database file exists
2. If exists and `--force` not set, the system MUST return error and exit 1
3. If exists and `--force` set, the system MUST delete existing file
4. If not exists and `--force` set, the system MUST proceed normally and display informational message: "Note: --force has no effect as no existing database was found. Creating new database."
5. The system MUST create new database file with secure permissions (0600 on Unix)
6. The system MUST execute schema creation SQL
   - **On schema creation failure:** See "Partial Initialization Cleanup" below
7. The system MUST attempt to enable WAL mode for concurrent access support
   - If WAL mode fails: Log warning to stderr, continue with rollback journal mode
   - **WAL mode failure logging (REQUIRED):**
     - Log format: `"Warning: Could not enable WAL mode (PRAGMA returned '{mode}'). Database will use rollback journal mode. Concurrent access may be limited."`
     - Log destination: stderr (NOT stdout, to avoid interfering with machine-parseable output)
     - Error code: None (this is a warning, not an error - operation continues)
   - **Elevate to error when:** If concurrent access was explicitly requested via configuration AND WAL mode fails, this SHOULD be elevated to a DatabaseError (exit code 2) with message: `"Error: WAL mode is required for configured concurrent access but could not be enabled."`
   - Clean up orphaned WAL files (`-wal`, `-shm`) if they exist
8. Verify database is functional
9. Print success message

**Partial Initialization Cleanup (REQUIRED):**

If an error occurs after the database file is created (step 5) but before successful completion, the implementation MUST clean up the partial database file to avoid leaving the system in an inconsistent state.

| Failure Point | Cleanup Action | User Message | Exit Code |
|---------------|----------------|--------------|-----------|
| Schema creation fails (step 6) | Delete database file | "Error: Failed to create database schema. {reason}" | 2 |
| WAL mode fails AND rollback verification fails | Delete database file | "Error: Database initialization failed. {reason}" | 2 |
| Verification fails (step 8) | Delete database file | "Error: Database verification failed. The database may be corrupted." | 2 |

**Test procedures for failure conditions:**

| Failure Type | How to Trigger | Observable Behavior |
|--------------|----------------|---------------------|
| Schema creation failure | Use invalid SQL in SCHEMA_SQL (e.g., syntax error) or mock `executescript` to raise `sqlite3.OperationalError` | Exit code 2, error message contains "schema", no database file exists |
| WAL mode failure | Use a network path or read-only filesystem | Warning logged, continues with rollback journal mode (WAL failure alone is non-fatal) |
| Verification failure | Mock `verify_database_functional()` to raise exception | Exit code 2, database file deleted, error message shown |

**Test data requirements for cleanup verification:**
```bash
# Test: Schema creation failure leaves no partial file
DB_PATH="/tmp/test_cleanup_$$.db"
# Force schema failure (implementation-specific mock required)
warehouse-cli init --db "$DB_PATH" 2>/dev/null
if [ -f "$DB_PATH" ]; then
    echo "FAIL: Partial database file exists after schema failure"
    rm -f "$DB_PATH"
    exit 1
fi
echo "PASS: Cleanup removed partial database file"
```

**Implementation pattern:**
```python
def init_database(db_path: str, force: bool = False) -> None:
    """Initialize database with cleanup on failure."""
    file_created = False
    conn = None

    try:
        # Steps 1-4: Handle existing file
        if os.path.exists(db_path):
            if not force:
                raise ValidationError(f"Database already exists at '{os.path.basename(db_path)}'. Use --force to recreate.")
            os.remove(db_path)

        # Step 5: Create database file
        conn = sqlite3.connect(db_path)
        file_created = True
        os.chmod(db_path, 0o600)

        # Step 6: Execute schema creation
        try:
            conn.executescript(SCHEMA_SQL)
        except sqlite3.Error as e:
            raise DatabaseError(f"Failed to create database schema: {e}") from e

        # Step 7: Enable WAL mode (optional, non-fatal)
        wal_enabled = enable_wal_mode(conn)

        # Step 8: Verify database is functional
        verify_database_functional(conn)

        conn.close()
        conn = None
        print(f"Database initialized at {db_path}")

    except Exception:
        # Cleanup: Remove partial database file on ANY failure after creation
        if conn:
            conn.close()
        if file_created and os.path.exists(db_path):
            basename = os.path.basename(db_path)
            try:
                os.remove(db_path)
            except OSError as cleanup_error:
                # Cleanup failed - warn user about manual cleanup needed
                print(
                    f"Warning: Could not remove partial database file. "
                    f"Please delete manually: {basename}",
                    file=sys.stderr
                )
                # Log the actual error for debugging (not exposed to user)
                if args.verbose:
                    print(f"DEBUG: Cleanup failed: {cleanup_error}", file=sys.stderr)
        raise
```

**Cleanup failure handling (REQUIRED):** If cleanup fails (e.g., due to permissions), the implementation MUST:
1. Warn the user that manual cleanup may be needed
2. Display only the basename (not full path) in the warning message
3. NOT suppress the original exception - it should still propagate
4. Log the actual cleanup error only in verbose mode

**Cleanup failure scenarios and handling (Edge Cases):**

| Scenario | `os.remove()` Behavior | User Impact | Mitigation |
|----------|------------------------|-------------|------------|
| Disk full during cleanup | `os.remove()` succeeds even on full disk | Cleanup works normally | No special handling needed |
| File locked by antivirus | `OSError(EACCES)` or `PermissionError` | Partial file remains | Warn user, suggest manual deletion |
| File locked by another process | `OSError(EBUSY)` on Unix | Partial file remains | Warn user, suggest manual deletion |
| Signal/crash during cleanup | Cleanup function interrupted | Partial file may remain | Cannot be mitigated programmatically |
| File already deleted by another process | `FileNotFoundError` | No partial file to clean | Treat as success (file is gone) |

**FileNotFoundError during cleanup (Edge Case):**

The cleanup code SHOULD also catch `FileNotFoundError` during removal, since another process could delete the file between the exists check and the remove. This should be handled gracefully:

```python
except FileNotFoundError:
    # File already deleted - goal achieved
    pass
```

**Why cleanup is critical:** A partial database file (created but schema incomplete) will cause confusing errors on subsequent commands. Users might see "table products does not exist" instead of a clear initialization error. Cleanup ensures `init` either succeeds completely or fails cleanly.

**Rollback Journal Mode Verification:**

After WAL mode attempt, the implementation verifies the database is functional (read, write, and transaction tests). On failure, cleanup occurs and an error is raised.

**Verification Acceptance Criteria:**

| Test Step | Command | Expected Result | Pass Criteria | Failure Error Message |
|-----------|---------|-----------------|---------------|----------------------|
| Journal mode check | `PRAGMA journal_mode;` | Returns current mode | Result is either `wal` or `delete` (rollback) | "Error: Database verification failed: Could not determine journal mode." |
| Read operation | `SELECT COUNT(*) FROM products;` | Returns count (0 for new DB) | Query executes without error | "Error: Database verification failed: Cannot read from products table. Schema may be incomplete." |
| Write operation | `INSERT INTO products (sku, name, quantity) VALUES ('TEST', 'Test', 0); DELETE FROM products WHERE sku='TEST';` | Insert and delete succeed | Both statements execute without error, rollback on failure | "Error: Database verification failed: Write test failed. Database may be read-only or corrupted." |
| Transaction test | `BEGIN; SELECT 1; ROLLBACK;` | Transaction completes | Transaction operations succeed | "Error: Database verification failed: Transaction test failed. Database may not support transactions." |
| Concurrent read test | Open second connection, execute `SELECT 1;` | Query succeeds | Second connection can read while first holds transaction | "Error: Database verification failed: Concurrent access test failed." |

**Verification failure specificity (REQUIRED):** Each verification step MUST produce a distinct error message indicating which specific check failed. This allows troubleshooting:
- Read failure: Schema issue or file corruption
- Write failure: Permission issue or disk full
- Transaction failure: Corrupted database internals
- Concurrent access failure: WAL mode not working as expected

**Test procedure for executing verification:**
```bash
#!/bin/bash
# verify-init.sh - Verify database initialization
DB_PATH="${1:?Usage: verify-init.sh <db_path>}"
MODE=$(sqlite3 "$DB_PATH" "PRAGMA journal_mode;")
[[ "$MODE" =~ ^(wal|delete)$ ]] && echo "PASS: Journal mode" || { echo "FAIL"; exit 1; }
COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM products;")
[[ "$COUNT" =~ ^[0-9]+$ ]] && echo "PASS: Read" || { echo "FAIL"; exit 1; }
sqlite3 "$DB_PATH" "INSERT INTO products (sku, name, quantity, created_at, updated_at) VALUES ('__V__', 'T', 0, datetime('now'), datetime('now')); DELETE FROM products WHERE sku='__V__';" && echo "PASS: Write" || { echo "FAIL"; exit 1; }
```

**Note:** The `--force` flag is designed to ensure a fresh database regardless of current state. When no database exists, `--force` simply proceeds with creation.

**Default database path:** If `--db` is not provided, defaults to `./inventory.db` in the current working directory.

**WARNING: Current Working Directory Risk:** The default database location is relative to where you run the command from. Running the CLI from different directories will create or access DIFFERENT databases.

**First-Run Warning (REQUIRED):** When the CLI detects that no `WAREHOUSE_DB` environment variable is set AND the database path is the default `./inventory.db`, the system MUST display a one-time warning on first command execution:
```
NOTICE: Using default database location './inventory.db' (relative to current directory).
        This means running from different directories will use different databases.
        To avoid this, set WAREHOUSE_DB environment variable:
          export WAREHOUSE_DB="$HOME/warehouse/inventory.db"
        See documentation for configuration options. This notice will not appear again.
```
The warning MUST be written to stderr and MUST NOT affect stdout output.

**Warning Suppression Security (IMPORTANT):**

The `.warned` file mechanism is for user convenience only and MUST NOT be relied upon for security. An attacker who gains filesystem access could create this file to suppress warnings, hiding that users are accessing different databases.

**Mitigations:**
1. **Always warn in scripts**: In non-interactive mode (when `!isatty()`), always show the warning regardless of `.warned` file
2. **Include path in warning file**: Store `{"warned": true, "path_hash": "<sha256>"}` - show warning if current path differs
3. **Verbose mode override**: Always show when `--verbose` is enabled

**SECURITY NOTE**: The warning is advisory. Critical security controls (file permissions, ownership verification) are enforced independently regardless of warning state.

**Recommended Setup (Choose One):**

1. **Environment Variable (Recommended for most users):**
   ```bash
   # Add to your ~/.bashrc or ~/.zshrc:
   export WAREHOUSE_DB="$HOME/warehouse/inventory.db"
   ```
   This ensures all commands use the same database regardless of your current directory.

2. **Shell Alias (Alternative):**
   ```bash
   # Add to your ~/.bashrc or ~/.zshrc:
   alias wh='warehouse-cli --db ~/warehouse/inventory.db'
   ```

3. **Explicit Path in Scripts:**
   ```bash
   # Always use absolute paths in automation scripts:
   warehouse-cli --db /data/warehouse/inventory.db search --name "widget"
   ```

**How to Verify Your Database Location:**
- **Quick check:** Run `warehouse-cli config show` to display the current database path without executing any database operation
  - Output format: `Database: /actual/path/inventory.db (exists)` or `Database: /path/inventory.db (not found)`
- **Verbose mode:** Run with `--verbose` to see the resolved database path during any operation
  - Example: `warehouse-cli --verbose search --sku TEST` will show `[DEBUG] Database path: /actual/path/inventory.db`

**`config show` Command (REQUIRED):**
```
warehouse-cli config show
```
Displays current configuration including:
- Database path (with existence check)
- Whether WAREHOUSE_DB environment variable is set
- Verbose mode status
This command does NOT require database access and always exits with code 0.

**Common Mistake:** If you see "No items found" unexpectedly, you may be accessing a different database than intended. Use `--verbose` to confirm the database path.

**Deployment Health Check Script:**

For production deployments, use this automated verification script at startup:

```bash
#!/bin/bash
# deployment-verify.sh - Pre-deployment database verification
# Run during container startup or deployment pipeline

DB_PATH="${1:-$WAREHOUSE_DB}"
DB_PATH="${DB_PATH:-./inventory.db}"

echo "=== Warehouse CLI Deployment Verification ==="

# Check 1: Database file exists
if [ ! -f "$DB_PATH" ]; then
  echo "FAIL: Database not found at $DB_PATH"
  exit 1
fi
echo "PASS: Database file exists"

# Check 2: Database readable and schema valid
if ! sqlite3 "$DB_PATH" "SELECT 1 FROM products LIMIT 1;" >/dev/null 2>&1; then
  echo "FAIL: Database not accessible or schema invalid"
  exit 1
fi
echo "PASS: Database accessible"

# Check 3: CLI can read database
# SECURITY: Use randomized SKU to prevent attackers from pre-seeding a fake health check record
RANDOM_SKU="__hc_$(head -c 8 /dev/urandom | xxd -p 2>/dev/null || date +%s)__"
if ! warehouse-cli search --sku "$RANDOM_SKU" --db "$DB_PATH" 2>&1; then
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 3 ]; then  # 3 = not found (OK)
    echo "FAIL: CLI cannot access database (exit code $EXIT_CODE)"
    exit 1
  fi
fi
echo "PASS: CLI operational"

echo "=== All checks passed ==="
exit 0
```

**Output (success):**
```
Database initialized at ./inventory.db
```

**Output (exists, no force):**
```
Error: Database already exists at 'inventory.db'. Use --force to recreate.
```

**Exit codes:**
- 0: Success
- 1: Database exists (without --force)
- 2: Cannot create file (permissions, invalid path)

---

### `add-item`

Add a new inventory item.

**Syntax:**
```
warehouse-cli add-item --sku SKU --name NAME --quantity QTY [options]
```

**Required options:**

| Option | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `--sku SKU` | string | 1-50 chars, non-empty | Unique stock keeping unit |
| `--name NAME` | string | 1-255 chars, non-empty | Product name |
| `--quantity QTY` | integer | >= 0 and <= 999999999 | Initial quantity (max 999,999,999) |

**Optional options:**

| Option | Type | Default | Constraints | Description |
|--------|------|---------|-------------|-------------|
| `--description DESC` | string | NULL | max 4096 chars | Product description |
| `--min-stock LEVEL` | integer | 10 | >= 0 and <= 999999999 | Minimum stock level (max 999,999,999) |
| `--location LOC` | string | NULL | max 100 chars | Warehouse location (optional, stored as NULL if not provided or if empty string after whitespace stripping) |

**Note on optional field handling:** Optional string fields (`--description`, `--location`) follow this normalization:
- Not provided on command line: stored as NULL
- Provided with only whitespace (e.g., `--location "   "`): whitespace is stripped, resulting in empty string, which becomes NULL
- Provided with empty string (e.g., `--location ""`): stored as NULL
- Provided with actual content: stored as the whitespace-stripped value

See components.md validator normalization table for the full specification.

**Behavior:**

The implementation MUST perform the following steps:
1. The system MUST validate all inputs
2. The system MUST check that SKU does not already exist
3. The system MUST insert the item into database
4. The system MUST return created item ID

**Output (success):**
```
Item created: WH-001 (ID: 1)
```

**Output (duplicate):**
```
Error: SKU 'WH-001' already exists.
```

**Output (invalid quantity):**
```
Error: Quantity must be a non-negative integer. Got: {value}
```

**Note:** Validation errors include the invalid value when possible to help users identify the issue.

**Exit codes:**
- 0: Success
- 1: Validation error (bad input)
- 2: Database error
- 4: Duplicate SKU

---

### `update-stock`

Modify stock quantity for an existing item.

**Syntax:**
```
warehouse-cli update-stock --sku SKU (--set N | --add N | --remove N)
```

**Required options:**

| Option | Type | Description |
|--------|------|-------------|
| `--sku SKU` | string | SKU to update |

**Mutually exclusive (exactly one required):**

**IMPORTANT:** Implementations MUST enforce that exactly one of the following options is provided. Implementations MUST reject requests that do not specify exactly one option. These options are mutually exclusive because they represent different ways to update inventory:

| Option | Purpose | When to Use | Example |
|--------|---------|-------------|---------|
| `--set N` | Set exact quantity | When you know the exact count (e.g., after physical inventory) | `--set 100` sets quantity to exactly 100 |
| `--add N` | Increase quantity | When receiving new stock | `--add 50` adds 50 to current quantity |
| `--remove N` | Decrease quantity | When items are sold or removed | `--remove 10` subtracts 10 from current |

**Help Text Display (REQUIRED):**
The `--help` output for `update-stock` MUST prominently display the mutual exclusion requirement:
```
warehouse-cli update-stock --help

Usage: warehouse-cli update-stock --sku SKU (--set N | --add N | --remove N)

EXACTLY ONE REQUIRED (mutually exclusive):
  --set N      Set quantity to exact value (e.g., after physical count)
  --add N      Increase quantity by N (e.g., received shipment)
  --remove N   Decrease quantity by N (e.g., items sold)

Required:
  --sku SKU    SKU to update

Examples:
  warehouse-cli update-stock --sku WH-001 --set 100
  warehouse-cli update-stock --sku WH-001 --add 50
  warehouse-cli update-stock --sku WH-001 --remove 10
```

**Error Messages:**
- Using none: `"Error: Missing required option. Choose ONE way to update stock: --set <exact_value>, --add <amount>, or --remove <amount>. Example: warehouse-cli update-stock --sku WH-001 --add 50"`
- Using more than one (e.g., `--set 10 --add 5`): `"Error: Conflicting options. Choose only ONE: --set (exact value), --add (increase), or --remove (decrease). You provided: --set, --add"`

**User experience after error:**
- Error messages are printed to stderr with exit code 1
- Users MUST manually run `--help` to see full usage information (help is NOT automatically displayed after errors)
- This design choice follows Unix convention where error output should be minimal and scriptable

**Rationale for not auto-displaying help:** Automatic help display after errors can clutter scripts that parse error output. Users who need detailed help can explicitly request it.

See errors.md for the canonical error message format.

| Option | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `--set N` | integer | >= 0 and <= 999999999 | Set quantity to exact value |
| `--add N` | integer | > 0 | Increase quantity by N (see boundary validation below) |
| `--remove N` | integer | > 0 | Decrease quantity by N |

**Zero value handling (Edge Case - REQUIRED):**

When a user passes `--add 0` or `--remove 0`, the validation MUST fail with a clear error message:

| Input | Expected Behavior | Notes |
|-------|-------------------|-------|
| `--set 0` | **Valid** - sets quantity to exactly 0 | Intentional action to mark item as out of stock |
| `--add 0` | **Error** - "Value for --add must be greater than 0. Got: 0" | Zero addition is a no-op, likely user error |
| `--remove 0` | **Error** - "Value for --remove must be greater than 0. Got: 0" | Zero removal is a no-op, likely user error |

**`--set 0` rationale:** Setting quantity to zero is a valid intentional action (e.g., marking an item as out of stock, clearance complete). Unlike `--add 0` and `--remove 0` which are always no-ops, `--set 0` produces a meaningful state change when the current quantity is non-zero.

**Validation order for --add/--remove value:**

1. **First:** Check mutual exclusion (only one of --set/--add/--remove)
2. **Second:** Check value > 0 for --add/--remove
3. **Third:** Check upper bound (would result exceed 999,999,999?)

This order ensures users see the most relevant error first. If both `--add 5 --remove 3` is provided, the mutual exclusion error appears before any value validation.

**Mutually exclusive option error handling (REQUIRED test cases):**

**Note on error message specificity:** The error messages below distinguish between "no option provided" and "multiple options provided" to help users understand what went wrong. While the validation logic is the same (exactly one option required), different error messages improve user experience.

| Scenario | Exit Code | Error Message |
|----------|-----------|---------------|
| No option provided (`--sku WH-001` only) | 1 | "Error: Missing required option. Must specify exactly one of: --set, --add, --remove" |
| Two options (`--set 10 --add 5`) | 1 | "Error: Conflicting options provided. Must specify exactly one of: --set, --add, --remove" |
| All three options (`--set 10 --add 5 --remove 3`) | 1 | "Error: Conflicting options provided. Must specify exactly one of: --set, --add, --remove" |
| `--add 0` (invalid value) | 1 | "Error: Value for --add/--remove must be greater than 0." |
| `--remove 0` (invalid value) | 1 | "Error: Value for --add/--remove must be greater than 0." |

**Implementation pattern for mutual exclusion (Edge Case):**

To detect "exactly one" when all three options are optional parameters, use a counting approach:

```python
def validate_stock_operation(set_val, add_val, remove_val) -> str:
    """Validate exactly one operation is specified.

    Returns the operation type ('set', 'add', or 'remove').
    Raises ValidationError if zero, two, or three options are provided.
    """
    options_provided = [
        ('set', set_val is not None),
        ('add', add_val is not None),
        ('remove', remove_val is not None)
    ]
    selected = [name for name, provided in options_provided if provided]

    if len(selected) == 0:
        raise ValidationError("Must specify exactly one of: --set, --add, --remove")
    if len(selected) > 1:
        raise ValidationError(
            f"Must specify exactly one of: --set, --add, --remove. "
            f"You provided: {', '.join('--' + s for s in selected)}"
        )
    return selected[0]
```

**Duplicate flag handling:** If the same flag is provided multiple times (e.g., `--add 5 --add 10`),
argparse by default uses the last value. This is acceptable behavior - no special handling required.

**Duplicate flag edge cases:**

| Input | argparse Result | Validation Outcome |
|-------|-----------------|-------------------|
| `--add 5 --add 10` | `add_val = 10` | Valid (10 > 0) |
| `--add 5 --add -10` | `add_val = -10` | Error: "Value for --add must be greater than 0. Got: -10" |
| `--add 5 --add 0` | `add_val = 0` | Error: "Value for --add must be greater than 0. Got: 0" |
| `--set 50 --set 100` | `set_val = 100` | Valid |

Since argparse uses the last value, the validation always runs on the final value. This ensures consistent behavior regardless of how many times a flag appears. Users who expect an error for duplicates will see the last value applied, which is documented and predictable.

**Behavior:**
1. Find product by SKU
2. If not found → error, exit 3
3. Calculate new quantity
4. If `--remove` would result in < 0 → error, exit 1
5. If `--set` or `--add` would result in > 999,999,999 → error, exit 1 (note: 999,999,999 itself is valid; only values strictly greater than this are rejected)
6. Update database
7. Print previous and new quantity

**Output (success):**
```
Updated WH-001: 100 -> 75
```

**Output (not found):**
```
Error: SKU 'WH-999' not found.
```

**Output (would go negative):**
```
Error: Cannot reduce quantity below 0. Current: 5, Requested removal: 10
```

**Output (would exceed maximum):**
```
Error: Quantity cannot exceed 999,999,999. Current: 999,999,990, Requested addition: 20. Maximum safe addition: 9
```

**Note:** The overflow error message includes the current value, requested addition, and calculates the maximum safe addition value to help users determine a valid amount without trial and error.

**Maximum safe addition calculation (REQUIRED):**

The `Maximum safe addition` value in the error message MUST be calculated as:
```
max_safe_addition = 999999999 - current_quantity
```

**Implementation pattern:**
```python
MAX_QUANTITY = 999_999_999

def validate_add_operation(current: int, addition: int) -> None:
    """Validate that adding to current quantity won't exceed maximum."""
    max_safe = MAX_QUANTITY - current
    if addition > max_safe:
        raise ValidationError(
            f"Quantity cannot exceed 999,999,999. "
            f"Current: {current:,}, Requested addition: {addition:,}. "
            f"Maximum safe addition: {max_safe:,}"
        )
```

**Example calculations:**
| Current | Formula | Max Safe Addition |
|---------|---------|-------------------|
| 999,999,990 | 999,999,999 - 999,999,990 | 9 |
| 999,999,999 | 999,999,999 - 999,999,999 | 0 |
| 500,000,000 | 999,999,999 - 500,000,000 | 499,999,999 |

**Boundary validation (--add overflow check):**
Validation occurs BEFORE the database write attempt:
1. Read current quantity (e.g., 999,999,998)
2. Calculate: current + addition (e.g., 999,999,998 + 2 = 1,000,000,000)
3. If result > 999,999,999 → reject BEFORE database update
4. Error message includes: current value, requested addition, max safe addition

**Example boundary cases:**
| Current | Add | Result | Outcome | Expected Error Message | Exit Code |
|---------|-----|--------|---------|------------------------|-----------|
| 999,999,998 | 1 | 999,999,999 | Success | N/A | 0 |
| 999,999,998 | 2 | 1,000,000,000 | Error | "Quantity cannot exceed 999,999,999. Current: 999,999,998, Requested addition: 2. Maximum safe addition: 1" | 1 |
| 999,999,999 | 1 | 1,000,000,001 | Error | "Quantity cannot exceed 999,999,999. Current: 999,999,999, Requested addition: 1. Maximum safe addition: 0" | 1 |

**Test setup requirements for overflow boundary tests:**

```python
def test_overflow_boundary_at_max():
    """Test boundary case where current is at max-1 and add would exceed max."""
    # Setup: Create product with quantity at boundary
    run_cli("init", "--db", "/tmp/test.db", "--force")
    run_cli("add-item", "--sku", "BOUNDARY-TEST", "--name", "Boundary Test Item",
            "--quantity", "999999998", "--db", "/tmp/test.db")

    # Test: Attempt to add 2 (would exceed max by 1)
    result = run_cli("update-stock", "--sku", "BOUNDARY-TEST", "--add", "2",
                     "--db", "/tmp/test.db")

    # Verify: Should fail with exit code 1 and specific error message
    assert result.exit_code == 1
    assert "Quantity cannot exceed 999,999,999" in result.stderr
    assert "Current: 999,999,998" in result.stderr
    assert "Requested addition: 2" in result.stderr
    assert "Maximum safe addition: 1" in result.stderr

    # Verify database unchanged
    verify_result = run_cli("search", "--sku", "BOUNDARY-TEST", "--format", "json",
                            "--db", "/tmp/test.db")
    item = json.loads(verify_result.stdout)[0]
    assert item["quantity"] == 999999998  # Unchanged
```

**Concurrent update handling:**
Stock updates use `BEGIN IMMEDIATE` to acquire a write lock at transaction start. This prevents race conditions where two processes could read the same quantity and both try to update it. See technical.md AD6 for details.

**Database Layer Dependency - Lock Timeout:**
The `BEGIN IMMEDIATE` statement uses the same 30-second busy timeout configured in the database connection layer (see schema.md "Concurrent Access Handling" section). If the database is locked by another process and the timeout expires, users will see:

```
Error: Database is busy after 30 seconds. Another process may be writing.
Please try again shortly.
```

Exit code: 2 (DATABASE_ERROR)

**User Experience for Timeout:**
| Scenario | Wait Time | User Sees |
|----------|-----------|-----------|
| Lock acquired immediately | <50ms | Normal success/error response |
| Brief contention | 1-5 seconds | Normal response (after delay) |
| Prolonged contention | 30 seconds | Timeout error message |

For batch processing scenarios requiring longer timeouts, see schema.md "Timeout Configuration Guidance" for deployment-specific recommendations.

**CRITICAL ORDERING REQUIREMENT:** The quantity read operation MUST occur AFTER `BEGIN IMMEDIATE` acquires the lock, not before. If the implementation reads the quantity before calling `BEGIN IMMEDIATE`, two processes can still read stale values and cause lost updates. The correct sequence within the locked transaction is:
1. `BEGIN IMMEDIATE` - Acquire exclusive write lock FIRST
2. `SELECT quantity` - Read current value (now protected by the lock)
3. Calculate new quantity
4. `UPDATE` - Write new value
5. `COMMIT` - Release lock

All five steps MUST occur within the same transaction scope.

**Error Message Clarity for Concurrent Updates:**

In concurrent scenarios, the "Current" value in error messages reflects the quantity AT THE TIME OF THE CHECK within the locked transaction, not when the user initiated the command. This may be confusing to users who expected a different value.

**Example scenario:**
1. User runs `update-stock --sku WH-001 --remove 5` when they see quantity=100
2. Before the lock is acquired, another process changes quantity to 90
3. User's command acquires the lock, reads quantity=90, and shows error:
   `"Cannot reduce quantity below 0. Current: 90, Requested removal: 5"`
4. User is confused because they expected "Current: 100"

**Recommended error message format (MUST implement):**
```
Cannot reduce quantity below 0.
  Current quantity: 90
  Requested removal: 5
  Note: Quantity was modified by another process while waiting for database lock.
        Retry the command to use the latest value.
```

This clarifies that the "current" value is authoritative and that concurrent modification occurred.

**IMPORTANT:** This enhanced error message format is REQUIRED, not optional. Users frequently encounter confusion when the "Current" value doesn't match what they expected, leading to support tickets and wasted debugging time.

**Concurrent Modification Detection Mechanism (REQUIRED):**

> **RFC-2119 Note:** The concurrent modification detection described here is a best-effort mechanism due to inherent TOCTOU limitations between the pre-lock read and the transaction. This mechanism SHOULD be implemented for user experience improvement, but applications MUST NOT rely on it for data integrity guarantees. Data integrity is ensured by SQLite's transaction isolation, not this detection mechanism.

To detect when the read value differs from expected and include the explanatory note, implementations MUST use the pre-lock read comparison approach:

**Detection Algorithm:**
```python
def update_stock_with_concurrency_detection(sku: str, operation: str, amount: int) -> None:
    """Update stock with concurrent modification detection.

    Performs a non-locking read before the transaction to detect if
    the quantity changes while waiting for the lock.
    """
    conn = get_connection()

    # Step 1: Read quantity BEFORE acquiring lock (non-blocking read)
    pre_lock_result = conn.execute(
        "SELECT quantity FROM products WHERE sku = ?", (sku,)
    ).fetchone()

    if pre_lock_result is None:
        raise ItemNotFoundError(f"SKU '{sku}' not found.")

    pre_lock_quantity = pre_lock_result[0]

    # Step 2: Acquire lock and read authoritative value
    conn.execute("BEGIN IMMEDIATE")
    try:
        post_lock_quantity = conn.execute(
            "SELECT quantity FROM products WHERE sku = ?", (sku,)
        ).fetchone()[0]

        # Step 3: Detect if concurrent modification occurred
        concurrent_modification = (pre_lock_quantity != post_lock_quantity)

        # Step 3.5 (REQUIRED): Validate authoritative value is within expected bounds
        # This guards against database corruption or bugs that could leave invalid data
        if not isinstance(post_lock_quantity, int) or post_lock_quantity < 0 or post_lock_quantity > 999999999:
            raise DatabaseError(
                f"Invalid quantity value in database for SKU '{sku}': {post_lock_quantity}. "
                "Database may be corrupted. Please verify data integrity."
            )

        # Step 4: Perform validation and update
        if operation == 'remove':
            if post_lock_quantity < amount:
                error_msg = (f"Cannot reduce quantity below 0.\n"
                           f"  Current quantity: {post_lock_quantity}\n"
                           f"  Requested removal: {amount}")
                if concurrent_modification:
                    error_msg += ("\n  Note: Quantity was modified by another process "
                                "while waiting for database lock.\n"
                                "        Retry the command to use the latest value.")
                raise ValidationError(error_msg)
            new_quantity = post_lock_quantity - amount
        # ... handle 'add' and 'set' operations similarly ...

        conn.execute("UPDATE products SET quantity = ? WHERE sku = ?",
                    (new_quantity, sku))
        conn.execute("COMMIT")

    except Exception:
        conn.execute("ROLLBACK")
        raise
```

**Detection accuracy note:** The pre-lock read is inherently racy - another process could modify the value between the pre-lock read and the lock acquisition. This is acceptable because:
1. False negatives (missing some concurrent modifications) are harmless - the user just doesn't see the note
2. False positives are impossible - if the values differ, a modification definitely occurred
3. The authoritative value (post-lock) is always used for the actual operation

**Exit codes:**
- 0: Success
- 1: Would result in negative quantity or exceed maximum
- 2: Database error (includes "database is busy" timeout)
- 3: SKU not found

---

### `search`

Find items matching criteria.

**Syntax:**
```
warehouse-cli search (--sku SKU | --name NAME | --location LOC) [--format FORMAT] [--limit N] [--offset N]
```

**Search options (at least one required):**

**Validation:** At least one search criterion (`--sku`, `--name`, or `--location`) MUST be provided. Calling `search` with no criteria results in exit code 1 with error:
```
Error: At least one search criterion required (--sku, --name, or --location).

Tip: To list all items in the inventory, use an empty name search:
  warehouse-cli search --name ""

This matches all items since every item has a name.
```
See schema.md Combined Search section for the query pattern using `WHERE 1=1` as base - this pattern safely handles zero criteria at the SQL level, but the CLI layer rejects zero-criteria searches before reaching the database.

**IMPORTANT - Multi-Layer Validation Required (Defense in Depth):**

The validation for "at least one criterion" MUST occur at BOTH CLI and database layers for defense-in-depth. CLI layer provides early rejection; database layer protects against bypasses (direct access, future API). This is a security requirement because:

1. **Defense in Depth:** Rejecting invalid input early prevents unnecessary database connections
2. **DoS Prevention:** A broad search with no criteria could return all records, causing memory exhaustion
3. **Clear User Feedback:** CLI-level validation provides clearer error messages than database-level failures

**Implementation Requirement (MANDATORY):**

```python
def validate_search_args(args) -> None:
    """Validate search arguments at CLI layer.

    MUST be called before any database operations.
    """
    if not any([args.sku, args.name, args.location]):
        raise ValidationError(
            "Error: At least one search criterion required "
            "(--sku, --name, or --location)."
        )
```

**Note:** While the database query pattern (`WHERE 1=1`) would technically work with zero criteria, the CLI layer MUST NOT allow such queries to reach the database. This validation is mandatory for security and usability.

**IMPORTANT - AND Logic for Multiple Criteria:**

When multiple search options are provided, they are combined with AND logic (all criteria must match). This is designed for **filtering down** results, not broadening them.

| Scenario | Command | Result |
|----------|---------|--------|
| Find specific item | `--sku "WH-001"` | Items with exact SKU "WH-001" |
| Find by name pattern | `--name "widget"` | All items containing "widget" in name |
| Filter widgets in location | `--name "widget" --location "Aisle-A"` | Widgets in Aisle-A only |

**Common Pitfall:** Combining `--sku` (exact match) with other criteria rarely makes sense. If you know the exact SKU, use only `--sku`:
```bash
# Correct: Use SKU alone for exact lookups
warehouse-cli search --sku "WH-001"

# Potentially confusing: This returns nothing if WH-001 isn't named "widget"
warehouse-cli search --sku "WH-001" --name "widget"
```

**Best Practice for Multiple Criteria:**

AND logic is ideal for **narrowing within a category** - for example, finding all widgets at a specific location:
```bash
# Good use of AND: Find widgets in Aisle-A
warehouse-cli search --name "widget" --location "Aisle-A"
```

AND logic is NOT suitable for **searching across different items** - for example, trying to find "either WH-001 OR WH-002". There is no OR logic; each additional criterion further restricts results. If you need to find multiple different items, run separate searches:
```bash
# To find two different SKUs, run separate commands:
warehouse-cli search --sku "WH-001"
warehouse-cli search --sku "WH-002"
```

| Option | Type | Description |
|--------|------|-------------|
| `--sku SKU` | string | Exact SKU match |
| `--name NAME` | string | Partial name match (case-insensitive) |
| `--location LOC` | string | Exact location match |

**Output options:**

| Option | Type | Default | Values |
|--------|------|---------|--------|
| `--format FORMAT` | string | `table` | `table`, `json` |

**Pagination options:**

| Option | Type | Default | Constraints | Description |
|--------|------|---------|-------------|-------------|
| `--limit N` | integer | 100 | >= 1 and <= 1000 | Maximum number of items to return |
| `--offset N` | integer | 0 | >= 0 | Number of items to skip before returning results |

**Pagination behavior:**
- Results are first filtered by search criteria, then sorted
- Pagination (--limit and --offset) is applied AFTER sorting
- Default limit of 100 prevents excessive output for large inventories
- Use `--limit 1000` for batch processing scenarios
- When pagination is applied and there are more results available, a summary footer shows the range:
  ```
  Showing items 1-100. Use --offset 100 to see more results.
  ```

**Behavior:**
1. Implementations MUST require at least one search criterion
2. Implementations MUST combine multiple criteria with AND
3. The implementation MUST perform name search as partial, case-insensitive (LIKE)
4. The implementation MUST perform SKU and location searches as exact matches
5. The implementation MUST return matching products
6. Results MUST be sorted by SKU ascending (alphabetical) by default

**Default sort order:**
- Results are sorted by SKU in ascending alphabetical order (A-Z, then 0-9)
- This provides consistent, predictable ordering for scripting and automation
- Example: `AA-001`, `AB-002`, `WH-001`, `WH-002`, `ZZ-999`

**Sorting options:**

| Option | Type | Default | Values | Description |
|--------|------|---------|--------|-------------|
| `--sort-by FIELD` | string | `sku` | `sku`, `name`, `quantity`, `location` | Field to sort by |
| `--sort-order DIR` | string | `asc` | `asc`, `desc` | Sort direction (ascending or descending) |

**Sorting examples:**
```bash
# Default: sort by SKU ascending
warehouse-cli search --name "widget"

# Sort by quantity descending (highest stock first)
warehouse-cli search --name "widget" --sort-by quantity --sort-order desc

# Sort by name alphabetically
warehouse-cli search --location "Aisle-A" --sort-by name
```

**NULL handling in sorting:** When sorting by `location`, items with NULL locations are sorted last (after all non-NULL values) regardless of sort direction.

**Output (table format):**
```
SKU       | Name      | Quantity | Location
----------|-----------|----------|----------
WH-001    | Widget A  | 100      | Aisle-A
WH-002    | Widget B  | 50       | Aisle-B
```

**Output (table, no matches):**
```
No items found matching criteria: [--sku "WH-999"]

Suggestions:
  - Check spelling of search term (SKU matching is case-sensitive)
  - Use --name for partial, case-insensitive matching
  - Run 'warehouse-cli search --name ""' to list all items
```

**Empty Result Output Format (table vs JSON):**

| Format | Has Results | No Results | Exit Code |
|--------|-------------|------------|-----------|
| `table` | Table with headers and data rows | Message: "No items found matching criteria: [criteria]" | 0 |
| `json` | Array with objects | Empty array: `[]` | 0 |

**When to use each format:**
- Use `--format table` (default) for human-readable output with helpful messages
- Use `--format json` for scripting, where empty array `[]` is easier to parse than a text message

**Note:** The empty result message includes a summary of the search criteria used. This helps users verify their search parameters and debug unexpected empty results. Use `--format json` to see raw results.

**Output (JSON format):**
```json
[
  {
    "sku": "WH-001",
    "name": "Widget A",
    "quantity": 100,
    "location": "Aisle-A"
  }
]
```

**JSON fields for search command:**
| Field | Type | Always present | Description |
|-------|------|----------------|-------------|
| `sku` | string | Yes | Stock keeping unit |
| `name` | string | Yes | Product name |
| `quantity` | integer | Yes | Current stock quantity |
| `location` | string or null | Yes | Warehouse location (null if not set) |

**NULL value handling in search JSON:** When `location` is NULL in the database, it MUST be included in the JSON output as `"location": null`. The field is never omitted. Example:
```json
{"sku": "WH-001", "name": "Widget A", "quantity": 100, "location": null}
```

**Note:** Search JSON output intentionally excludes `id`, `description`, `min_stock_level`, `created_at`, and `updated_at` for brevity. These are administrative/detailed fields not typically needed for search results. Use `export-csv` for full data export.

**Whitespace Handling in Search Inputs:**

Search criteria are NOT automatically trimmed. This means whitespace-only or whitespace-padded inputs are treated as literal strings.

| Input | What Happens | Result |
|-------|--------------|--------|
| `--sku "WH-001"` | Searches for exact "WH-001" | Matches if SKU exists |
| `--sku "  WH-001"` | Searches for literal "  WH-001" (with spaces) | No matches (SKUs cannot have leading spaces) |
| `--sku "   "` | Searches for literal whitespace | No matches (no valid SKU is whitespace-only) |

**Unicode whitespace characters (Edge Case):**

The whitespace detection uses Python's `str.strip()` which handles most Unicode whitespace characters. However, implementations should be aware of these edge cases:

| Character | Unicode | `strip()` Removes | Notes |
|-----------|---------|-------------------|-------|
| Space | U+0020 | Yes | Standard ASCII space |
| Non-breaking space | U+00A0 | Yes | Common in copy-paste |
| Zero-width space | U+200B | **No** | Invisible, not stripped |
| Zero-width joiner | U+200D | **No** | Used in emoji sequences |
| Vertical tab | U+000B | Yes | Rarely seen in user input |
| Form feed | U+000C | Yes | Rarely seen in user input |

**Zero-width characters (IMPORTANT):** A search term that appears empty visually may contain zero-width characters that `strip()` does not remove. These will pass through to the database and typically match nothing (since stored data rarely contains these characters). This is acceptable behavior per the lenient search philosophy - the search simply returns no results.

**Whitespace-only input optimization (RECOMMENDED):**

While the database query will always return zero results for whitespace-only searches, implementations SHOULD add an early-exit optimization to avoid unnecessary database queries:

```python
def validate_search_input(value: str, field_name: str) -> str:
    """Validate search input and warn about whitespace-only values.

    Returns the value unchanged (lenient search philosophy), but logs
    a warning for whitespace-only inputs to help users identify issues.
    """
    if value and value.strip() == '':
        # Log warning but don't reject - lenient search philosophy
        print(f"Warning: Search value for --{field_name} contains only whitespace. "
              "This will match no results.", file=sys.stderr)
        # OPTIMIZATION: Return early without database query
        return None  # Signal to caller to skip database query
    return value
```

This optimization prevents full table scans for queries that will always return zero results.

**Troubleshooting Empty Results:**

If you get unexpected "No items found" results:
1. Check for accidental leading/trailing spaces in your search term
2. Use `--format json` to see exactly what was searched

**Proactive Empty Result Hints (REQUIRED):**
When search returns zero results, the system MUST include the whitespace hint in the output:
```
No items found matching criteria: [--sku "WH-001"]
(tip: searches are whitespace-sensitive - check for leading/trailing spaces)
```
This hint MUST appear automatically on every empty result, not just when whitespace is detected, because users cannot easily tell if their input has hidden whitespace.

**Example of the problem:**
```bash
# This might fail if you accidentally copied text with spaces:
warehouse-cli search --sku "  WH-001 "  # Leading/trailing spaces - no match!

# Solution: Trim your input:
warehouse-cli search --sku "WH-001"     # Correct - matches
```

This behavior is intentional ("lenient search" philosophy) - the system accepts any input and lets the database handle matching, providing helpful hints when results are empty.

**Output (JSON, no matches):**
```json
[]
```

**Search input length limit (1000 characters):**
While search inputs are "lenient" (accepting any characters, not enforcing SKU format), a maximum length of 1000 characters is enforced to prevent memory exhaustion attacks. This limit applies to each search criterion individually (`--sku`, `--name`, `--location`).

**Defense-in-depth implementation (REQUIRED):**
The 1000-character limit MUST be enforced at multiple layers:
1. **Application layer (CLI validation):** Primary enforcement before database access
2. **Database layer (CHECK constraint):** Secondary enforcement as defense-in-depth

For future web interfaces or alternative access methods, the database constraint ensures protection even if the CLI validation layer is bypassed.

**Behavior when limit exceeded:**
1. Validation rejects input BEFORE database query
2. Error message: `"Error: Search input '--name' exceeds maximum length of 1000 characters."`
3. Exit code: 1 (validation error)

**Rationale:**
- 1000 chars is far longer than any realistic search term
- Prevents malicious inputs that could consume excessive memory
- SQL injection is separately prevented by parameterized queries
- Multiple enforcement layers prevent bypass through alternative access methods

**Character count vs byte count clarification (Edge Case):**

The 1000-character limit refers to **Unicode codepoints** (Python's `len(str)`), NOT bytes. This means:
- A name with 500 emoji (each typically 4 bytes in UTF-8) is 500 characters and passes validation
- UTF-8 encoding happens at the database layer; SQLite handles this transparently
- The underlying SQLite TEXT column stores UTF-8 encoded bytes

**Buffer safety:** SQLite TEXT columns have no practical size limit beyond available memory.
The 1000-codepoint limit is generous for realistic search terms while preventing abuse.

**Example:**
```python
search_term = "emoji" * 500  # 500 emoji = 500 codepoints = ~2000 UTF-8 bytes
len(search_term)  # Returns 500 - passes 1000 char limit
```

**Byte-level considerations (informational):**

While the validation limit is in codepoints, implementations should be aware of byte-level implications:

| Scenario | Codepoints | UTF-8 Bytes | Notes |
|----------|------------|-------------|-------|
| ASCII text | 1000 | 1000 | 1 byte per codepoint |
| CJK text | 1000 | 3000 | 3 bytes per codepoint (typical) |
| Emoji text | 1000 | 4000 | 4 bytes per codepoint (typical) |
| Mixed content | 1000 | 1000-4000 | Varies by composition |

**Memory allocation guidance:** When allocating buffers for search input, use `4 * max_codepoints` (4000 bytes for 1000 codepoints) as the upper bound to handle worst-case UTF-8 encoding.

**Exit codes:**
- 0: Success (including empty results)
- 1: Validation error (no search criteria provided, or input exceeds 1000 characters)
- 2: Database error

---

### `low-stock-report`

List items below minimum stock level.

**Syntax:**
```
warehouse-cli low-stock-report [--threshold N] [--format FORMAT] [--limit N] [--offset N]
```

**Options:**

| Option | Type | Default | Constraints | Description |
|--------|------|---------|-------------|-------------|
| `--threshold N` | integer | (use min_stock_level) | >= 0 | Override comparison threshold |
| `--format FORMAT` | string | `table` | `table` or `json` | Output format |
| `--limit N` | integer | 100 | >= 1 and <= 1000 | Maximum number of items to return |
| `--offset N` | integer | 0 | >= 0 | Number of items to skip before returning results |

**Pagination behavior:**
- Results are first filtered by low-stock criteria, then sorted by deficit descending
- Pagination (--limit and --offset) is applied AFTER sorting
- Default limit of 100 prevents excessive output for large inventories
- Use `--limit 1000` for batch processing scenarios
- When pagination is applied, a summary footer shows the range:
  ```
  Showing items 1-100 of 250 total low-stock items.
  Use --offset 100 to see the next page.
  ```

**Behavior:**
1. If `--threshold` provided: find items where quantity < threshold
2. Otherwise: find items where quantity < min_stock_level (per-item)
3. Calculate deficit based on context:
   - **Without `--threshold`:** deficit = `min_stock_level - quantity` (distance from each item's reorder point)
   - **With `--threshold`:** deficit = `threshold - quantity` (distance from the specified threshold)
4. Sort by deficit descending (most urgent first)

**Note:** When `--threshold` is provided, the deficit calculation uses the threshold value, not min_stock_level. This ensures the deficit reflects how far below the *applied* threshold each item is, which is the relevant metric when using a custom threshold. **Important:** With `--threshold`, items may appear in the report even if they are above their own `min_stock_level` (e.g., `--threshold=30` will show an item with quantity=25 and min_stock_level=20, showing deficit=5). This is intentional for uniform filtering scenarios. See schema.md Low Stock Report section for detailed query documentation.

**Output (table format):**
```
SKU       | Name      | Quantity | Min Level | Deficit
----------|-----------|----------|-----------|--------
WH-002    | Widget B  | 5        | 20        | 15
WH-004    | Gadget Y  | 8        | 10        | 2
```

**Note:** Table header uses "Quantity" to match the JSON field name `quantity` for consistency.

**Output (JSON format):**
```json
[
  {
    "sku": "WH-002",
    "name": "Widget B",
    "quantity": 5,
    "min_stock_level": 20,
    "deficit": 15
  }
]
```

**JSON fields for low-stock-report command:**
| Field | Type | Always present | Description |
|-------|------|----------------|-------------|
| `sku` | string | Yes | Stock keeping unit |
| `name` | string | Yes | Product name |
| `quantity` | integer | Yes | Current stock quantity |
| `min_stock_level` | integer | Yes | Item's configured reorder point |
| `deficit` | integer | Yes | How far below threshold (see Behavior for calculation) |

**Note:** Low-stock-report JSON output intentionally excludes `id`, `description`, `location`, `created_at`, and `updated_at`. The focus is on stock level urgency, not full product details.

**JSON Field Comparison (search vs low-stock-report):**

The two commands have different JSON schemas because they serve different purposes:

| Field | search | low-stock-report | Rationale |
|-------|--------|------------------|-----------|
| `location` | Included | Excluded | Search is about finding items; location helps users locate them. Low-stock is about stock urgency; location is secondary. |
| `min_stock_level` | Excluded | Included | Search doesn't need reorder points. Low-stock requires it to understand urgency context. |
| `deficit` | N/A | Included | Only meaningful for low-stock report (calculated field). |

This is intentional design, not an inconsistency. Each command outputs fields relevant to its use case. For complete data, use `export-csv`.

**Exit codes:**
- 0: Success (including empty results)
- 2: Database error

---

### `export-csv`

Export inventory to CSV file.

**Syntax:**
```
warehouse-cli export-csv --output PATH [--filter-location LOC] [--force]
```

**Required options:**

| Option | Type | Description |
|--------|------|-------------|
| `--output PATH` | string | Output file path |

**Optional options:**

| Option | Type | Description |
|--------|------|-------------|
| `--filter-location LOC` | string | Export only items at this location |
| `--force` | flag | Overwrite existing file |

**Behavior:**

The implementation MUST perform the following steps:
1. The system MUST validate output path using same rules as `--db` path (see "Path (--db, --output)" section):
   - The path MUST NOT contain `..` (checked before normalization)
   - The system MUST normalize to absolute path using `os.path.abspath()`
   - The system MUST verify parent directory exists and is writable
2. The system MUST check if output file exists
3. If exists and no `--force`, the system MUST return error and exit 1
4. The system MUST query products (optionally filtered by location)
5. The system MUST write CSV with header row
6. The system MUST print count of exported items

**Path validation for --output (same as --db):**
The `--output` path MUST be validated with the same security rules as the `--db` path:
- The path MUST NOT contain `..` (checked before normalization)
- Path is normalized to absolute
- Parent directory must exist

**CSV format (RFC 4180 compliant):**
- Header: `sku,name,description,quantity,min_stock_level,location,created_at,updated_at`
- Encoding: UTF-8
- Delimiter: comma
- Quote character: double-quote (for fields containing commas/quotes/newlines)
- Line ending: LF (`\n`)

**Escaping rules (RFC 4180 compliance):**

The implementation MUST comply with RFC 4180 by implementing the following escaping rules:
- The implementation MUST enclose fields containing commas, double-quotes, or newlines in double-quotes
- The implementation MUST escape double-quote characters within a field by doubling them (`""`)
- Fields not requiring escaping MAY be unquoted

**CSV Injection Prevention (CRITICAL SECURITY REQUIREMENT):**

To prevent formula injection attacks in spreadsheet applications (Excel, Google Sheets, LibreOffice), the implementation MUST prefix any field value starting with potentially dangerous characters with a single quote (`'`) character.

**Dangerous characters that MUST trigger prefixing (formula injection):**
- `=` (equals) - The implementation MUST prefix fields starting with `=`
- `+` (plus) - The implementation MUST prefix fields starting with `+`
- `-` (minus/hyphen) - The implementation MUST prefix fields starting with `-`
- `@` (at sign) - The implementation MUST prefix fields starting with `@`
- `\t` (tab) - The implementation MUST prefix fields starting with tab
- `\r` (carriage return) - The implementation MUST prefix fields starting with carriage return

**Implementation pattern:**
```python
def sanitize_csv_field(value: str) -> str:
    """Prevent CSV injection and remove dangerous control characters.

    CRITICAL ORDER: Control characters MUST be removed BEFORE checking for
    formula injection characters. This prevents attacks where control characters
    hide dangerous content (e.g., '=\x001+1' becomes '=1+1' after removal).
    """
    if not value:
        return value

    # STEP 1: Remove null bytes and other dangerous control characters FIRST
    # These can cause string truncation or unexpected behavior in CSV parsers
    # MUST happen before formula injection check to prevent bypass attacks
    dangerous_controls = '\x00\x0b\x0c'  # NUL, vertical tab, form feed
    for char in dangerous_controls:
        value = value.replace(char, '')

    # STEP 2: Check for formula injection AFTER control character removal
    # This ensures we catch patterns like '=\x001+1' which becomes '=1+1'
    if value and value[0] in ('=', '+', '-', '@', '\t', '\r'):
        value = "'" + value

    # STEP 3: Enforce maximum length to prevent CSV parser issues
    # Note: This truncation happens AFTER sanitization, so the prefix is counted
    max_length = 4097  # 4096 max description + 1 for potential prefix
    if len(value) > max_length:
        value = value[:max_length]

    return value

# Apply to all string fields before writing
sanitized_name = sanitize_csv_field(product.name)
```

**Maximum field length enforcement:**

After sanitization (which may add a single-quote prefix), fields could exceed their original maximum length. The `max_length` parameter ensures sanitized output stays within reasonable bounds:
- Default: 4097 characters (4096 max description + 1 for potential prefix)
- This prevents issues with CSV parsers that have field length limits
- Truncation is logged in verbose mode: `"Warning: Field truncated from {original} to {max_length} characters after sanitization"`

**CRITICAL - Operation Order:** The control character removal (step 1) MUST happen BEFORE the formula injection check (step 2). If reversed, an attacker could embed control characters to hide formula injection:
- Attack input: `=\x001+1` (equals, NUL byte, then `1+1`)
- Wrong order (check then remove): Check sees `=` at position 0, might work but order is fragile
- Correct order (remove then check): Remove NUL first -> `=1+1` -> Check sees `=` at position 0 -> Prefix added -> `'=1+1` (SECURE by design)

The correct order ensures that no matter what control characters an attacker embeds, the formula injection check always operates on the final string content.

**Control characters removed (not prefixed):**
- `\x00` (NUL byte) - Can truncate strings in C-based CSV parsers
- `\x0B` (vertical tab) - Unexpected whitespace behavior
- `\x0C` (form feed) - Unexpected page break behavior

**Note:** These characters are REMOVED entirely because they serve no legitimate purpose in inventory data and could cause parser issues or data corruption.

**Additional Sanitization - Embedded Newlines (REQUIRED):**

The current sanitization prevents formula injection but does NOT prevent CSV structure manipulation via embedded newlines. An attacker could inject newlines within field data to create additional CSV rows.

**Attack Example:**
```
Input: name = "Widget\nEVIL-SKU,malicious,data,injected"
Raw CSV: Widget
EVIL-SKU,malicious,data,injected
```

**REQUIRED Enhancement - Unicode-Aware Sanitization:**

The simple ASCII check for formula injection characters can be bypassed using Unicode lookalike characters:

| Unicode Char | Codepoint | Looks Like | Attack Risk |
|--------------|-----------|------------|-------------|
| `=` | U+FF1D | `=` (equals) | Formula injection |
| `+` | U+FF0B | `+` (plus) | Formula injection |
| `-` | U+2212 | `-` (minus) | Formula injection |
| `@` | U+FF20 | `@` (at) | External reference injection |

```python
import unicodedata

def sanitize_csv_field(value: str) -> str:
    """Prevent CSV injection, control chars, Unicode attacks, and structural attacks.

    CRITICAL: Handles Unicode lookalike attacks that bypass ASCII-only checks.
    """
    if not value:
        return value

    # STEP 1: Remove dangerous control characters
    dangerous_controls = '\x00\x0b\x0c'
    for char in dangerous_controls:
        value = value.replace(char, '')

    # STEP 2: Normalize Unicode to NFKC form
    # Converts lookalike characters to their canonical ASCII equivalents
    # CRITICAL: Prevents attacks using fullwidth or other confusable characters
    value = unicodedata.normalize('NFKC', value)

    # STEP 3: Check for known Unicode lookalikes that may survive normalization
    unicode_formula_chars = {
        '\uff1d', '\uff0b', '\uff0d', '\uff20',  # Fullwidth variants
        '\u2212', '\ufe63', '\u2795', '\u2796',  # Mathematical symbols
    }
    if value and value[0] in unicode_formula_chars:
        return "'" + value

    # STEP 4: Normalize newlines to prevent CSV structure manipulation
    value = value.replace('\r\n', ' ').replace('\r', ' ').replace('\n', ' ')

    # STEP 5: Check for standard formula injection characters
    if value and value[0] in ('=', '+', '-', '@', '\t'):
        return "'" + value
    return value
```

**Why NFKC Normalization is REQUIRED:**
1. NFKC converts fullwidth and compatibility characters to ASCII equivalents
2. Ensures formula injection check operates on normalized content
3. The explicit Unicode lookalike check provides defense-in-depth

**Attack Example Without Unicode Handling:**
```
Input: "\uFF1D1+1" (FULLWIDTH EQUALS followed by 1+1)
Without fix: Passes check (first char is U+FF1D, not ASCII =)
Excel behavior: May interpret as formula after its own normalization
Result: Formula injection succeeds
```

**Important:** The newline normalization (Step 2) converts newlines to spaces rather than removing them entirely, preserving the semantic content while preventing structural attacks. The `csv.writer` with proper quoting will still handle the output correctly, but normalizing first provides defense-in-depth.

**Examples:**
| Original value | Sanitized value | Reason |
|----------------|-----------------|--------|
| `Widget A` | `Widget A` | Safe - no prefix needed |
| `=1+1` | `'=1+1` | Dangerous - formula injection |
| `+44-123-4567` | `'+44-123-4567` | Dangerous - starts with + |
| `-10 degrees` | `'-10 degrees` | Dangerous - starts with - |
| `@mention` | `'@mention` | Dangerous - starts with @ |
| `Widget\x00A` | `WidgetA` | NUL byte removed |
| `""` (empty string) | `""` | Empty string - no change needed |
| `None` (NULL value) | `""` | NULL converted to empty string before sanitization |
| `==formula` | `'==formula` | Multiple dangerous chars - prefix first char only |
| ` =space first` | ` =space first` | Space before dangerous char - no prefix (not at position 0) |
| `\t\tdata` | `'\t\tdata` | Tab at start - prefix needed |
| `\rcarriage` | `'\rcarriage` | Carriage return at start - prefix needed |

**Note:** The single quote prefix causes spreadsheet applications to treat the field as literal text, not as a formula. This is the industry-standard mitigation for CSV injection attacks.

**Fields requiring sanitization:** `sku`, `name`, `description`, `location` (all user-input string fields)

**Fields NOT requiring sanitization:** `created_at`, `updated_at` (system-generated timestamps in fixed ISO 8601 format - cannot start with dangerous characters)

**CSV Injection Prevention Test Specification (REQUIRED):**

The following test cases MUST be implemented to verify CSV injection prevention:

| Test Input | Expected Output | Test Purpose |
|------------|-----------------|--------------|
| `=1+1` | `'=1+1` | Equals sign prefix |
| `+44-123-4567` | `'+44-123-4567` | Plus sign prefix |
| `-10 degrees` | `'-10 degrees` | Minus sign prefix |
| `@mention` | `'@mention` | At sign prefix |
| `\tdata` | `'\tdata` | Tab character prefix |
| `\rdata` | `'\rdata` | Carriage return prefix |
| `Widget\x00A` | `WidgetA` | NUL byte removal |
| `Safe text` | `Safe text` | No modification for safe input |
| `(empty string)` | `(empty string)` | Empty string unchanged |
| `\uFF1D1+1` | `'\uFF1D1+1` or normalized | Unicode fullwidth equals handling |

**Examples:**
| Field value | CSV representation |
|-------------|-------------------|
| `Widget A` | `Widget A` |
| `Widget, Large` | `"Widget, Large"` |
| `Widget "Pro"` | `"Widget ""Pro"""` |
| `Line1\nLine2` | `"Line1\nLine2"` |
| `Widget, "Pro" Edition` | `"Widget, ""Pro"" Edition"` |

**Python implementation:**
```python
import csv

# Apply sanitization to all string fields BEFORE passing to csv.writer
for product in products:
    sanitized_row = [
        sanitize_csv_field(product.sku),
        sanitize_csv_field(product.name),
        sanitize_csv_field(product.description or ""),
        product.quantity,
        product.min_stock_level,
        sanitize_csv_field(product.location or ""),
        product.created_at,
        product.updated_at
    ]
    # ... write sanitized_row ...

with open(path, 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(header)
    writer.writerows(sanitized_data)
```

**How sanitization and RFC 4180 escaping interact:**
1. First, `sanitize_csv_field()` prefixes dangerous characters with `'` (e.g., `=1+1` becomes `'=1+1`)
2. Then, `csv.writer` with `QUOTE_MINIMAL` applies RFC 4180 escaping if the sanitized field contains commas, quotes, or newlines (e.g., `'=1+1,test` becomes `"'=1+1,test"`)
3. Both protections work together: the single quote prevents formula injection, and the double quotes handle RFC 4180 special characters

**Example with both protections:** A field `=1+1, "test"` becomes `"'=1+1, ""test"""` in the final CSV (single quote prefix + RFC 4180 quoting and escaping)

Note: Python's `csv` module handles RFC 4180 escaping automatically with `QUOTE_MINIMAL`.

**Note:** The `id` column is intentionally excluded from CSV export. The `id` is an internal database identifier not useful for external consumption. The CSV export is designed for data portability, not database backup.

**Output (success):**
```
Exported 150 items to inventory.csv
```

**Output (empty database):**
```
Exported 0 items to inventory.csv
```
Note: Empty database exports a CSV file containing only the header row.

---

### `delete-item`

Remove an inventory item from the database.

**Syntax:**
```
warehouse-cli delete-item --sku SKU [--force]
```

**Required options:**

| Option | Type | Description |
|--------|------|-------------|
| `--sku SKU` | string | SKU of the item to delete |

**Optional options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--force` | flag | false | Delete even if quantity > 0 |

**Behavior:**

The implementation MUST perform the following steps:
1. The system MUST validate that SKU exists in the database
2. If SKU not found → error, exit 3
3. The system MUST check if quantity > 0:
   - If quantity > 0 and `--force` not set → error, exit 1 with warning message
   - If quantity > 0 and `--force` set → proceed with deletion
4. The system MUST delete the item from the database
5. The system MUST print confirmation message including SKU and deleted item name

**Safety check rationale:** Requiring `--force` when quantity > 0 prevents accidental deletion of items that still have stock. This is a safeguard against data loss when items should be restocked rather than removed from inventory.

**Output (success):**
```
Item deleted: WH-001 (Widget A)
```

**Output (not found):**
```
Error: SKU 'WH-999' not found.
```

**Output (quantity > 0, no force):**
```
Error: Cannot delete item 'WH-001' with quantity 50.
Use --force to delete items with remaining stock.
Tip: Use 'update-stock --sku WH-001 --set 0' to zero out stock before deletion.
```

**Exit codes:**
- 0: Success
- 1: Validation error (quantity > 0 without --force)
- 2: Database error
- 3: SKU not found

---

### `update-item`

Modify item properties (name, description, location, min_stock_level) for an existing item.

**Syntax:**
```
warehouse-cli update-item --sku SKU [--name NAME] [--description DESC] [--location LOC] [--min-stock LEVEL]
```

**Required options:**

| Option | Type | Description |
|--------|------|-------------|
| `--sku SKU` | string | SKU of the item to update (immutable - identifies the item, cannot be changed) |

**Optional options (at least one required):**

| Option | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `--name NAME` | string | 1-255 chars, non-empty | New product name |
| `--description DESC` | string | max 4096 chars | New product description (use `--description ""` to clear) |
| `--location LOC` | string | max 100 chars | New warehouse location (use `--location ""` to clear) |
| `--min-stock LEVEL` | integer | >= 0 and <= 999999999 | New minimum stock level |

**Validation:** At least one of the optional update options (`--name`, `--description`, `--location`, `--min-stock`) MUST be provided. Calling `update-item` with only `--sku` results in exit code 1 with error:
```
Error: At least one update option required (--name, --description, --location, or --min-stock).
```

**SKU immutability rationale:** The SKU serves as the primary business identifier for items and may be referenced by external systems (POS, ERP, shipping). Allowing SKU changes would break these external references. To "change" a SKU, delete the old item and create a new one.

**Behavior:**

The implementation MUST perform the following steps:
1. The system MUST validate all provided inputs according to Input Validation Rules
2. The system MUST validate that at least one update option is provided
3. The system MUST find the product by SKU
4. If SKU not found → error, exit 3
5. The system MUST update only the specified fields
6. The system MUST update the `updated_at` timestamp
7. The system MUST print confirmation message showing changed fields

**Output (success):**
```
Updated WH-001:
  name: "Widget A" -> "Widget A Premium"
  min_stock_level: 10 -> 25
```

**Output (not found):**
```
Error: SKU 'WH-999' not found.
```

**Output (clearing optional field):**
```
Updated WH-001:
  description: "Original description" -> (cleared)
```

**Exit codes:**
- 0: Success
- 1: Validation error (no update options provided, invalid input)
- 2: Database error
- 3: SKU not found

---

### Empty Result Behavior for All Commands

| Command | Empty Database Behavior | Output |
|---------|------------------------|--------|
| `search` | Returns empty results | Table: "No items found." / JSON: `[]` |
| `low-stock-report` | Returns empty results | Table: "No items found." / JSON: `[]` |
| `export-csv` | Creates CSV with header only | "Exported 0 items to {filename}" |
| `update-stock` | Error (item not found) | Exit code 3: "Error: SKU 'xxx' not found." |
| `add-item` | Succeeds normally | "Item created: {sku} (ID: 1)" |
| `delete-item` | Error (item not found) | Exit code 3: "Error: SKU 'xxx' not found." |
| `update-item` | Error (item not found) | Exit code 3: "Error: SKU 'xxx' not found." |

**Output (file exists):**
```
Error: File 'inventory.csv' already exists. Use --force to overwrite.
```

**Exit codes:**
- 0: Success
- 1: File validation error (includes: file exists without --force, path not writable, parent directory missing, permission denied, path contains `..`). **Note:** Exit code 1 (ValidationError) is used for output file errors because these are path/file validation failures, not database operation failures. See errors.md for the full distinction between exit codes 1 and 2.
- 2: Database error (reading from database failed)

---

## Data Type Schemas

This section provides formal type definitions for command inputs and outputs to enable programmatic integration and validation.

### Common Type Definitions

**ProductItem:**
```typescript
interface ProductItem {
  sku: string;           // Stock Keeping Unit, 1-50 chars, alphanumeric + dash/underscore
  name: string;          // Product name, 1-255 chars
  quantity: integer;     // Stock quantity, 0 to 999999999
  location: string | null;  // Warehouse location, max 100 chars, null if not set
  description?: string | null;  // Product description, max 4096 chars (optional in some outputs)
  min_stock_level?: integer;    // Minimum stock threshold, 0 to 999999999 (optional in some outputs)
  created_at?: string;   // ISO 8601 timestamp (optional in some outputs)
  updated_at?: string;   // ISO 8601 timestamp (optional in some outputs)
}
```

**PaginationMetadata:**
```typescript
interface PaginationMetadata {
  limit: integer;        // Maximum items per page, 1-1000
  offset: integer;       // Number of items skipped, >= 0
  total?: integer;       // Total matching items (if available)
  has_more: boolean;     // Whether more results exist beyond current page
}
```

**ErrorResponse:**
```typescript
interface ErrorResponse {
  error: string;         // Human-readable error message
  exit_code: integer;    // Exit code (0-4, 130)
  details?: string;      // Additional error context (optional, shown in verbose mode)
}
```

### Command Input Schemas

**init command:**
```typescript
interface InitInput {
  db?: string;           // Database path (default: ./inventory.db)
  force?: boolean;       // Overwrite existing database (default: false)
  verbose?: boolean;     // Enable debug output (default: false)
}
```

**add-item command:**
```typescript
interface AddItemInput {
  sku: string;                    // Required, 1-50 chars, pattern: ^[A-Za-z0-9_-]+$
  name: string;                   // Required, 1-255 chars
  quantity: integer;              // Required, 0 to 999999999
  description?: string;           // Optional, max 4096 chars
  location?: string;              // Optional, max 100 chars
  min_stock_level?: integer;      // Optional, 0 to 999999999, default: 0
  db?: string;                    // Database path
  verbose?: boolean;              // Debug output
}
```

**update-stock command:**
```typescript
interface UpdateStockInput {
  sku: string;                    // Required, identifies the item
  set?: integer;                  // Absolute quantity to set (0 to 999999999)
  adjust?: integer;               // Relative adjustment (-999999999 to 999999999)
  db?: string;
  verbose?: boolean;
}
// Note: Exactly one of 'set' or 'adjust' must be provided
```

**search command:**
```typescript
interface SearchInput {
  sku?: string;                   // Exact SKU match, max 1000 chars
  name?: string;                  // Partial name match (case-insensitive), max 1000 chars
  location?: string;              // Exact location match, max 1000 chars
  format?: 'table' | 'json';      // Output format (default: 'table')
  limit?: integer;                // Items per page, 1-1000 (default: 100)
  offset?: integer;               // Items to skip, >= 0 (default: 0)
  sort_by?: 'sku' | 'name' | 'quantity' | 'location';  // Sort field (default: 'sku')
  sort_order?: 'asc' | 'desc';    // Sort direction (default: 'asc')
  db?: string;
  verbose?: boolean;
}
// Note: At least one of sku, name, or location must be provided
```

**low-stock-report command:**
```typescript
interface LowStockReportInput {
  threshold?: integer;            // Override comparison threshold, >= 0
  format?: 'table' | 'json';      // Output format (default: 'table')
  limit?: integer;                // Items per page, 1-1000 (default: 100)
  offset?: integer;               // Items to skip, >= 0 (default: 0)
  db?: string;
  verbose?: boolean;
}
```

**export-csv command:**
```typescript
interface ExportCSVInput {
  output: string;                 // Required, output file path
  force?: boolean;                // Overwrite existing file (default: false)
  db?: string;
  verbose?: boolean;
}
```

**delete-item command:**
```typescript
interface DeleteItemInput {
  sku: string;                    // Required, identifies the item
  force?: boolean;                // Delete even if quantity > 0 (default: false)
  db?: string;
  verbose?: boolean;
}
```

**update-item command:**
```typescript
interface UpdateItemInput {
  sku: string;                    // Required, identifies the item
  name?: string;                  // New name, 1-255 chars
  description?: string;           // New description, max 4096 chars (use "" to clear)
  location?: string;              // New location, max 100 chars (use "" to clear)
  min_stock_level?: integer;      // New threshold, 0 to 999999999
  db?: string;
  verbose?: boolean;
}
// Note: At least one of name, description, location, or min_stock_level must be provided
```

### Command Output Schemas

**search command (JSON format):**
```typescript
interface SearchOutput {
  items: ProductItem[];           // Array of matching items (may be empty)
  pagination?: PaginationMetadata; // Pagination info (when limit/offset used)
}

// Actual JSON output format:
// When no pagination metadata needed (all results fit in one page):
[
  {
    "sku": "WH-001",
    "name": "Widget A",
    "quantity": 100,
    "location": "Aisle-A"
  }
]

// When pagination is active (results span multiple pages):
{
  "items": [
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
    "has_more": true
  }
}
```

**low-stock-report command (JSON format):**
```typescript
interface LowStockReportOutput {
  items: Array<ProductItem & {
    deficit: integer;             // Shortfall amount (min_stock_level - quantity)
  }>;
  pagination?: PaginationMetadata;
}

// Actual JSON output format:
[
  {
    "sku": "WH-001",
    "name": "Widget A",
    "quantity": 5,
    "min_stock_level": 10,
    "deficit": 5,
    "location": "Aisle-A"
  }
]
```

**add-item command (JSON format):**
```typescript
interface AddItemOutput {
  message: string;                // Success message
  sku: string;                    // Created item's SKU
  id: integer;                    // Database ID
}

// Actual JSON output (when using --format json):
{
  "message": "Item created successfully",
  "sku": "WH-001",
  "id": 1
}
```

**update-stock command (JSON format):**
```typescript
interface UpdateStockOutput {
  message: string;                // Success message
  sku: string;                    // Updated item's SKU
  previous_quantity: integer;     // Quantity before update
  new_quantity: integer;          // Quantity after update
}

// Actual JSON output (when using --format json):
{
  "message": "Stock updated successfully",
  "sku": "WH-001",
  "previous_quantity": 100,
  "new_quantity": 150
}
```

### Pagination Response Envelope

When pagination parameters (`--limit` and/or `--offset`) are provided, commands that support pagination (search, low-stock-report) include pagination metadata in the response.

**Pagination envelope structure:**

```typescript
interface PaginatedResponse<T> {
  items: T[];                     // Array of result items
  pagination: {
    limit: integer;               // Items per page (1-1000)
    offset: integer;              // Items skipped (>= 0)
    count: integer;               // Number of items in current page
    has_more: boolean;            // True if more results exist beyond current page
  };
}
```

**Example paginated search output:**
```json
{
  "items": [
    {
      "sku": "WH-001",
      "name": "Widget A",
      "quantity": 100,
      "location": "Aisle-A"
    },
    {
      "sku": "WH-002",
      "name": "Widget B",
      "quantity": 50,
      "location": "Aisle-B"
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "count": 2,
    "has_more": false
  }
}
```

**Pagination field specifications:**

| Field | Type | Description | Always Present |
|-------|------|-------------|----------------|
| `limit` | integer | Maximum items per page | Yes (when pagination used) |
| `offset` | integer | Number of items skipped before first result | Yes (when pagination used) |
| `count` | integer | Actual number of items in current response | Yes (when pagination used) |
| `has_more` | boolean | Whether additional results exist beyond current page | Yes (when pagination used) |

**Link relations (not implemented):**

Future versions may include HATEOAS-style links for pagination navigation:
```typescript
interface PaginationLinks {
  self: string;    // Current page URL/command
  next?: string;   // Next page (if has_more is true)
  prev?: string;   // Previous page (if offset > 0)
  first: string;   // First page
  last?: string;   // Last page (if total count known)
}
```

Currently, clients must construct pagination commands manually:
```bash
# First page
warehouse-cli search --name "widget" --limit 100 --offset 0

# Next page
warehouse-cli search --name "widget" --limit 100 --offset 100

# Third page
warehouse-cli search --name "widget" --limit 100 --offset 200
```

**Backward compatibility note:**

For commands executed without `--limit` or `--offset`, the output format remains a simple array for backward compatibility:
```json
[
  {"sku": "WH-001", "name": "Widget A", "quantity": 100, "location": "Aisle-A"}
]
```

Only when pagination parameters are explicitly provided does the response use the envelope format with `items` and `pagination` keys.

---

## Input Validation Rules

### Input Length Limits (Summary Table)

| Field | Min Length | Max Length | Character Set |
|-------|------------|------------|---------------|
| SKU | 1 | 50 | `A-Za-z0-9_-` only |
| Name | 1 | 255 | Any printable characters |
| Description | 0 (optional) | 4096 | Any printable characters |
| Location | 0 (optional) | 100 | Any printable characters |
| Quantity | N/A | 999,999,999 | Integer |
| min_stock_level | N/A | 999,999,999 | Integer |

**Security Requirement:** The validation layer (models.py) MUST enforce these limits to prevent:
- Buffer overflow attacks
- Database storage issues
- Memory exhaustion from excessively long inputs

### SKU
- Non-empty (minimum 1 character)
- Maximum 50 characters
- Allowed characters: alphanumeric, hyphen, underscore ONLY
- Validation regex: `^[A-Za-z0-9_-]{1,50}$`

**Note:** SKU validation rules (`^[A-Za-z0-9_-]{1,50}$`) apply to WRITE operations (add-item, update-stock) only. Search operations accept any input - SQL injection is prevented by parameterized queries, not input validation.

**Note:** Empty string criteria (e.g., `--sku ""`) are accepted but will return no matches since no item can have an empty SKU.

### Name
- Non-empty (minimum 1 character)
- Maximum 255 characters
- Any printable characters allowed (including Unicode)

### Description
- Optional (may be NULL)
- Maximum 4096 characters when provided
- Any printable characters allowed (including Unicode)

### Location
- Optional (may be NULL)
- Maximum 100 characters when provided
- Any printable characters allowed

### Quantity
- Non-negative integer
- Maximum value: 999,999,999
- Must be valid integer (no floats, no strings)

**Rationale for maximum:** See schema.md "Business Rationale for Quantity Upper Bounds" for the complete explanation. Key reasons: prevents integer overflow in aggregate operations, catches data entry typos, and fits standard display widths.

### min_stock_level
- Non-negative integer
- Maximum value: 999,999,999 (same as quantity)
- Default: 10

### Path (--db, --output)

Path Validation:
1. Relative paths ARE accepted
2. Check that the ORIGINAL path does not contain '..' BEFORE normalization (path traversal prevention)
3. All paths are normalized to absolute paths using os.path.abspath()
4. Writability check happens AFTER normalization
5. The normalized absolute path is used for all operations

**Security Note:** The check for `..` MUST happen on the ORIGINAL path BEFORE calling `os.path.abspath()`. This is because `os.path.abspath()` resolves `..` sequences, which would cause the check to always pass. Checking the original input ensures path traversal attempts are blocked.

**Symlink TOCTOU Prevention:**

Path validation is vulnerable to Time-Of-Check-Time-Of-Use (TOCTOU) attacks via symlinks. An attacker could:
1. Create a benign file path that passes validation
2. Replace it with a symlink to a sensitive location before file access
3. Cause the application to read/write to an unintended location

**Mitigation:** When opening files for write operations (CSV export), use `os.open()` with the `O_NOFOLLOW` flag (Unix-only) to fail if the path is a symlink:

```python
import os
import io
import errno

def safe_open_for_write(path: str, mode: str = 'w') -> io.TextIOWrapper:
    """Open file for writing with symlink protection (Unix-only).

    On Windows, this behaves like normal open() since O_NOFOLLOW is not supported.

    Args:
        path: File path to open
        mode: File mode - 'w' to overwrite existing files (default), 'x' to fail if file exists

    Mode behavior:
        - mode='w': Opens file for writing, creates if not exists, TRUNCATES if exists.
                    Use this when --force is specified or file existence was already checked.
        - mode='x': Exclusive creation - fails with FileExistsError if file already exists.
                    Use this when you need atomic "create only if not exists" behavior.

    Security note: The symlink protection (O_NOFOLLOW) applies regardless of mode.
    The overwrite protection (--force flag) is handled by the CALLER before invoking
    this function, not by this function itself.
    """
    if os.name == 'nt':  # Windows
        return open(path, mode, encoding='utf-8')

    # Unix: Use O_NOFOLLOW to reject symlinks
    # Start with base flags for write operations
    flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW

    if 'x' in mode:  # Exclusive creation (fail if file exists)
        # O_EXCL: fail if file exists (atomic create-only)
        # Note: O_EXCL without O_TRUNC is correct - if file doesn't exist, there's nothing to truncate
        flags |= os.O_EXCL
    else:
        # O_TRUNC: truncate existing file to zero length
        # Only add O_TRUNC for non-exclusive mode (mode='w')
        # Platform note: O_EXCL and O_TRUNC together have undefined behavior on some platforms
        # (POSIX leaves it implementation-defined). We avoid this by separating the cases.
        flags |= os.O_TRUNC

    try:
        fd = os.open(path, flags, 0o644)  # Raises OSError if path is a symlink
        return os.fdopen(fd, mode, encoding='utf-8')
    except OSError as e:
        if e.errno == errno.ELOOP:  # ELOOP = too many symbolic links
            raise ValidationError(
                f"Path '{os.path.basename(path)}' is a symbolic link. "
                "For security reasons, symbolic links are not allowed as output paths. "
                "Please specify a direct file path instead."
            ) from e
        raise
```

**Usage in CSV export:**
```python
validated_path = validate_path(output_path)
try:
    with safe_open_for_write(validated_path, 'w') as f:
        # Write CSV data
except ValidationError:
    # Handle symlink rejection
    raise
```

**Note:** This is defense-in-depth. The symlink check happens at file open time, not during path validation.

**IMPORTANT - Residual TOCTOU Risk Acknowledgment:**

The `O_NOFOLLOW` approach significantly reduces the TOCTOU window but does not eliminate it entirely on all platforms:

1. **On Unix with O_NOFOLLOW:** The symlink check and file open are atomic - the race window is effectively eliminated for symlink attacks.

2. **On Windows:** The `os.path.islink()` check followed by `open()` has a residual TOCTOU window. An attacker could replace a file with a symlink between the check and the open. This is mitigated by:
   - Developer Mode typically being disabled on production systems
   - The attack window being very small (microseconds)
   - Directory permissions preventing unauthorized modifications

3. **For maximum security in hostile environments:**
   - Run the application in a restricted environment (container, chroot)
   - Use directory permissions to prevent attacker modifications
   - Consider read-only mounts for sensitive parent directories

**Windows Symlink Protection (REQUIRED):**

On Windows platforms where O_NOFOLLOW is not available, implementations MUST use explicit symlink detection before file operations:

```python
def safe_open_for_write_windows(path: str, mode: str = 'w') -> io.TextIOWrapper:
    """Windows-specific file open with explicit symlink protection."""
    # REQUIRED: Check for symlink before opening
    if os.path.islink(path):
        raise ValidationError(
            f"Path '{os.path.basename(path)}' is a symbolic link. "
            "For security reasons, symbolic links are not allowed as output paths."
        )

    # Additional check: verify path doesn't point to a reparse point (junction)
    if os.name == 'nt':
        import ctypes
        FILE_ATTRIBUTE_REPARSE_POINT = 0x400
        attrs = ctypes.windll.kernel32.GetFileAttributesW(path)
        if attrs != -1 and (attrs & FILE_ATTRIBUTE_REPARSE_POINT):
            raise ValidationError(
                f"Path '{os.path.basename(path)}' is a reparse point. "
                "For security reasons, junctions are not allowed as output paths."
            )

    return open(path, mode, encoding='utf-8')
```

**Security Note:** On Windows 10+ with Developer Mode enabled, unprivileged users can create symlinks. The explicit symlink check is therefore REQUIRED on Windows, not optional.

**Symlink Protection Test Cases (REQUIRED):**

| Test Scenario | Setup | Expected Result | Exit Code |
|---------------|-------|-----------------|-----------|
| Symlink to file | `ln -s /etc/passwd /tmp/export.csv` | Error: "Path 'export.csv' is a symbolic link..." | 1 |
| Symlink to directory | `ln -s /tmp /data/output.csv` | Error: "Path 'output.csv' is a symbolic link..." | 1 |
| Broken symlink | `ln -s /nonexistent/target /tmp/export.csv` | Error: "Path 'export.csv' is a broken symbolic link..." | 1 |
| Regular file | `touch /tmp/export.csv` | Success (with --force) or "File exists" error | 0 or 1 |
| Non-existent path | `/tmp/new_export.csv` (doesn't exist) | Success - file created | 0 |
| TOCTOU race | See test below | File write fails or succeeds atomically | varies |

**Broken Symlink Detection (REQUIRED):**

Broken symlinks (symlinks pointing to non-existent targets) are a special case that MUST be detected and rejected. The `os.path.exists()` function returns `False` for broken symlinks, which could cause confusing behavior if not handled:

```python
def check_for_broken_symlink(path: str) -> None:
    """Detect and reject broken symlinks.

    os.path.islink() returns True even for broken symlinks.
    os.path.exists() returns False for broken symlinks.
    Combining these detects the broken symlink case.
    """
    if os.path.islink(path) and not os.path.exists(path):
        raise ValidationError(
            f"Path '{os.path.basename(path)}' is a broken symbolic link "
            f"(points to non-existent target). Remove the symlink or provide a valid path."
        )
```

This check MUST be performed before the `os.path.exists()` check in path validation to provide clear error messages.

**TOCTOU Race Condition Test (Unix only):**
```python
import os
import threading
import time

def test_symlink_toctou_protection():
    """Verify symlink protection prevents TOCTOU attacks.

    This test verifies that even if an attacker replaces a file with a
    symlink between validation and open, the O_NOFOLLOW flag prevents
    writing to the symlink target.
    """
    test_path = "/tmp/test_export.csv"
    target_path = "/tmp/should_not_exist.txt"

    # Clean up
    for p in [test_path, target_path]:
        if os.path.exists(p) or os.path.islink(p):
            os.remove(p)

    # Create initial file
    with open(test_path, 'w') as f:
        f.write("initial")

    race_triggered = threading.Event()

    def replace_with_symlink():
        """Attacker thread: replace file with symlink during race window."""
        race_triggered.wait()  # Wait for signal
        try:
            os.remove(test_path)
            os.symlink(target_path, test_path)
        except:
            pass

    attacker = threading.Thread(target=replace_with_symlink)
    attacker.start()

    # Simulate export with race window
    race_triggered.set()  # Signal attacker
    time.sleep(0.01)  # Small delay to allow symlink creation

    result = run_cli("export-csv", "--output", test_path, "--force")

    attacker.join()

    # Verify: Either the export failed with symlink error,
    # OR the target file was NOT created (atomic protection worked)
    if result.exit_code == 1:
        assert "symbolic link" in result.stderr.lower()
    else:
        assert not os.path.exists(target_path), "TOCTOU attack succeeded - symlink target was written!"
```

**Platform and version requirements for O_NOFOLLOW:**
- **Linux:** Supported on all modern kernels (2.1.126+, circa 1998)
- **macOS/BSD:** Supported on all versions
- **Windows:** NOT supported - `O_NOFOLLOW` is not available (see Windows Symlink Protection above for REQUIRED alternative)
- **Python version:** `os.O_NOFOLLOW` is available in Python 3.3+ on Unix platforms

**Security implications of platform differences:**
- On Unix: Symlink attacks are prevented by O_NOFOLLOW atomically at open time
- On Windows: Symlink attacks are prevented by explicit `os.path.islink()` check (has TOCTOU window but provides meaningful protection)

**Database file symlink protection:** Database files opened via `sqlite3.connect()` do NOT support O_NOFOLLOW. SQLite's internal file handling doesn't provide a symlink-safe open mechanism.

**Security consideration for --db paths:**
- The `--db` parameter accepts user input from the CLI
- Unlike CSV export paths which use `safe_open_for_write()` with O_NOFOLLOW, database paths are opened directly by SQLite
- **REQUIRED mitigations for all deployments:**
  1. Run the CLI with restricted filesystem permissions (least privilege)
  2. Use a dedicated service account that cannot follow symlinks to sensitive files
  3. **MUST** validate that the database path is not a symlink before opening: `if os.path.islink(db_path): raise ValidationError(...)`
  4. Restrict `--db` paths to a specific directory via configuration

**Defense-in-depth rationale:** The pre-open symlink check `os.path.islink()` has a TOCTOU window (the file could be replaced between the check and SQLite's open call). However, application-level checks are still valuable because they:
1. Block naive attacks and catch configuration mistakes
2. Provide clear error messages instead of confusing SQLite errors
3. Add one more layer an attacker must bypass

The `O_NOFOLLOW` approach used in `safe_open_for_write()` is more robust because the check is atomic at open time. For maximum security in hostile environments, use OS-level protections (chroot, containers, mandatory access controls).

**Implementation:**

See ARCHITECTURE-simple.md S2 for the canonical `validate_path()` implementation. The key requirements are:
1. Check for `..` in ORIGINAL path BEFORE normalization
2. Check for URL-encoded patterns (`%2e%2e`, `%252e`) BEFORE normalization
3. Normalize with `os.path.abspath()` ONLY after security checks pass

**Note:** URL-encoded pattern detection is required to prevent encoding bypass attacks. See technical.md security considerations for rationale.

---

## Output Standards

---

## Write Operation Limits

**Abuse Prevention Measures (REQUIRED):**

To prevent denial of service through resource exhaustion, the following limits MUST be implemented:

1. **Maximum items per transaction:** Individual operations (add-item, update-stock) process one item at a time. Future batch operations MUST limit to 1000 items per transaction to prevent disk exhaustion.

2. **Database size monitoring:** Implementations MUST warn when database exceeds 100MB and MUST refuse operations when database exceeds 500MB to prevent runaway growth from malicious or buggy scripts.

   **Size Monitoring Specification (MANDATORY):**

   | Threshold | Action | Operations Affected |
   |-----------|--------|---------------------|
   | 100MB | Warning to stderr | All operations continue |
   | 500MB | Block writes | Write operations blocked; reads allowed |
   | 500MB | Recovery mode | Only `export-csv` and `search` permitted |

   **Check frequency and performance:**
   - Size check MUST occur on **write operations only** (add-item, update-stock, init)
   - Read operations (search, low-stock-report, export-csv) do NOT check size (no performance impact)
   - Check uses `os.path.getsize()` which is O(1) and adds <1ms overhead

   **Implementation (MANDATORY):**

   ```python
   import os

   SIZE_WARNING_THRESHOLD = 100 * 1024 * 1024   # 100MB
   SIZE_BLOCK_THRESHOLD = 500 * 1024 * 1024     # 500MB

   def check_database_size(db_path: str, operation: str) -> None:
       """Check database size before write operations."""
       if operation not in ('add-item', 'update-stock', 'init'):
           return  # Skip check for read operations

       try:
           size = os.path.getsize(db_path)
       except OSError:
           return  # File doesn't exist yet (init case)

       if size >= SIZE_BLOCK_THRESHOLD:
           raise ValidationError(
               f"Database size ({size // (1024*1024)}MB) exceeds 500MB limit. "
               "Archive or delete old data before continuing."
           )
       elif size >= SIZE_WARNING_THRESHOLD:
           print(f"Warning: Database size ({size // (1024*1024)}MB) exceeds 100MB.",
                 file=sys.stderr)
   ```

   **Recovery from size limit:**
   - `export-csv` always allowed (enables data backup)
   - `search` always allowed (enables finding items to delete)
   - Manual SQL deletion required to reduce size below threshold

3. **Rate limiting for write operations:** Implementations MUST enforce a maximum of 100 write operations per minute per process to prevent rapid disk exhaustion attacks.

   **Rate Limiting Specification (MANDATORY):**

   | Parameter | Value | Rationale |
   |-----------|-------|-----------|
   | Window type | Sliding window | Prevents burst-at-boundary issues |
   | Window duration | 60 seconds | Standard rate limit interval |
   | Max operations | 100 per window | Prevents exhaustion while allowing legitimate work |
   | Scope | Per-process | Each CLI invocation has independent limit |

   **Implementation (MANDATORY):**

   ```python
   import time
   from collections import deque

   class RateLimiter:
       """Sliding window rate limiter for write operations."""
       def __init__(self, max_ops: int = 100, window_seconds: float = 60.0):
           self.max_ops = max_ops
           self.window_seconds = window_seconds
           self.operations = deque()

       def check_and_record(self) -> bool:
           """Check if allowed and record. Returns False if rate limited."""
           now = time.time()
           while self.operations and self.operations[0] < now - self.window_seconds:
               self.operations.popleft()
           if len(self.operations) >= self.max_ops:
               return False
           self.operations.append(now)
           return True
   ```

   **Error when limit exceeded:** `"Error: Rate limit exceeded. Maximum 100 write operations per minute. Wait {N} seconds."` (exit code 1)

   **Batch operations:** Use `--batch-mode` flag for elevated limit (500 ops/minute).

4. **Audit logging (REQUIRED for production):** For forensic analysis, implementations MUST log all database modifications to a separate audit log with timestamps and operation details. This enables investigation of suspicious activity patterns.

   **Audit Log Requirements:**

   | Field | Type | Description |
   |-------|------|-------------|
   | `timestamp` | ISO 8601 UTC | When the operation occurred |
   | `operation` | string | `add-item`, `update-stock`, `delete-item` (future) |
   | `sku` | string | The SKU affected by the operation |
   | `field_changed` | string | `quantity`, `name`, etc. |
   | `previous_value` | string | Value before change (NULL for add-item) |
   | `new_value` | string | Value after change |
   | `user` | string | OS username from `os.getlogin()` or `$USER` |
   | `source_ip` | string | "local" for CLI operations |

   **Security Events (MUST be logged separately):**

   In addition to data modification audit logging, security-relevant events MUST be logged:

   | Event | Severity | Log Message |
   |-------|----------|-------------|
   | Permission validation failure | HIGH | `SECURITY: Permission check failed for {path}` |
   | Symlink attack blocked | HIGH | `SECURITY: Symlink attack blocked at {path}` |
   | Path traversal blocked | HIGH | `SECURITY: Path traversal attempt blocked: {pattern}` |
   | Rate limit exceeded | MEDIUM | `SECURITY: Rate limit exceeded by user {user}` |
   | Database size limit warning | MEDIUM | `SECURITY: Database size warning: {size}MB` |
   | Authentication failure (future) | HIGH | `SECURITY: Auth failure for {user}` |

   **Audit Log File Location:**
   - Default: `~/.warehouse-cli/audit.log`
   - Override: `WAREHOUSE_AUDIT_LOG` environment variable
   - Permissions: 0600 (owner read/write only)
   - Rotation: Implementations SHOULD rotate when log exceeds 10MB

   **Implementation Note:** Security event logging is separate from `--verbose` debug output. Security logs MUST be written even when `--verbose` is not enabled.

**Security Note:** These measures are mandatory for all deployments to prevent denial-of-service attacks through resource exhaustion.


### Table Format
- Column headers in first row
- Separator line of dashes and pipes
- Fixed-width columns (pad with spaces)
- Truncate values exceeding column width: show first `(width-3)` chars + `...`
- **CRITICAL: Truncation MUST count Unicode characters, NOT bytes**
  - Use `len(str)` in Python (counts codepoints), NOT `len(str.encode('utf-8'))` (counts bytes)
  - Example: Name "Widget 日本語" (10 chars) → "Widget 日本語" (fits in 20-char column)
  - Example: Name with emoji "Widget 🎉🎊🎁 Special" (20 chars) → truncated correctly
  - Multi-byte characters (emoji, CJK) count as 1 character each for truncation purposes
  - **Note:** Display width may vary (some emoji/CJK are double-width in terminals), but truncation is character-based, not display-width-based. This means table columns may appear misaligned when CJK/emoji characters are present.

  **Performance Analysis for Unicode Truncation:**

  `len(str)` in CPython is O(1) for ASCII strings and O(1) for Unicode strings (stored as character count). The performance impact is negligible:

  | Result Set Size | Truncation Checks | Total Overhead | Impact on <100ms Target |
  |-----------------|-------------------|----------------|-------------------------|
  | 100 rows | ~400 (4 fields x 100) | <0.1ms | <0.1% |
  | 1000 rows (max) | ~4000 | <1ms | <1% |
  | 50,000 rows | Not applicable | N/A | Export uses streaming, not table format |

  **Benchmark validation:** For a 1000-row result set with 255-char names:
  - Length checks: ~4000 calls x ~250ns = ~1ms total
  - Well within the <100ms search target (represents <1% overhead)

  **Note:** Table format is only used for interactive output (limited to 1000 rows via pagination). Large result sets use JSON or CSV export, which do not require truncation.
  - **Multi-width Character Detection (REQUIRED):** When the output contains CJK characters or emoji that may cause misalignment, append a footer note to the table:
    ```
    SKU       | Name                | Quantity | Location
    ----------|---------------------|----------|----------
    WH-001    | Widget 日本語        | 100      | Aisle-A

    * Table alignment may be affected by multi-width characters. Use --format json for precise data.
    ```
    This footer MUST appear only when multi-width characters are detected in the displayed data.

  **Workaround for International Users:**
  If you work with CJK characters or emoji in product names and need properly aligned output:

  1. **Use JSON format** (recommended):
     ```bash
     warehouse-cli search --name "widget" --format json | jq -r '.[] | "\(.sku)\t\(.name)\t\(.quantity)"'
     ```

  2. **Use a display-width-aware tool** to process JSON output:
     ```python
     # Python example with wcwidth library
     import json, subprocess, wcwidth

     result = subprocess.run(['warehouse-cli', 'search', '--format', 'json'], capture_output=True, text=True)
     items = json.loads(result.stdout)
     # Process with wcwidth for proper alignment
     ```

  3. **Export to CSV** and open in a spreadsheet application:
     ```bash
     warehouse-cli export-csv --output inventory.csv
     # Open in Excel, Google Sheets, or LibreOffice for proper Unicode display
     ```
  - **Grapheme cluster handling:** Python's `len(str)` counts codepoints, not grapheme clusters. Some visual characters are composed of multiple codepoints (e.g., emoji with skin tone modifiers like "hello" is 5 codepoints but displays as one character). Truncating in the middle of a grapheme cluster can produce broken/partial emoji display.

  - **Zero-width Unicode Character Handling (REQUIRED):**

    Zero-width Unicode characters are invisible characters that occupy no display width but count as codepoints. These can cause column misalignment in table output because `len(str)` includes them in the character count while they contribute nothing to visual width.

    **Common zero-width characters:**
    | Character | Code Point | Name | Common Source |
    |-----------|------------|------|---------------|
    | ​ | U+200B | Zero Width Space | Copy-paste from web pages |
    | ‌ | U+200C | Zero Width Non-Joiner | Multilingual text processing |
    | ‍ | U+200D | Zero Width Joiner | Emoji sequences (e.g., family emoji) |
    |  | U+FEFF | Byte Order Mark (BOM) | File encoding markers, copy-paste |
    | ⁠ | U+2060 | Word Joiner | Word processing applications |

    **Behavior:** Zero-width characters are **stripped** from table output before display. This ensures:
    - Column alignment is not affected by invisible characters
    - Character count for truncation reflects actual visible width
    - Consistent display regardless of data source (copy-paste, imports, etc.)

    **Implementation requirement:**
    ```python
    # Strip zero-width characters before table formatting
    ZERO_WIDTH_CHARS = '\u200b\u200c\u200d\ufeff\u2060\u180e\u200e\u200f'

    def clean_for_table(value: str) -> str:
        return value.translate(str.maketrans('', '', ZERO_WIDTH_CHARS))
    ```

    **Note:** Zero-width characters are only stripped for **table display**. JSON and CSV output preserve all characters exactly as stored in the database. This ensures data integrity while providing readable table output.

    **Detection and warning:** When zero-width characters are detected and stripped, the table footer SHOULD include a note:
    ```
    SKU       | Name                | Quantity | Location
    ----------|---------------------|----------|----------
    WH-001    | Widget Special      | 100      | Aisle-A

    * Some invisible characters were removed for display. Use --format json for exact data.
    ```

    **Why strip rather than escape:** Escaping zero-width characters (e.g., showing `<U+200B>`) would disrupt table alignment worse than the original problem. Stripping provides clean, predictable output while JSON format preserves the exact data for users who need it.

  **Best Practices for Emoji in Product Names:**

  | Recommendation | Why |
  |----------------|-----|
  | Place emoji at the END of names | Truncation happens from the end, so emoji at end are removed cleanly |
  | Avoid skin-tone modified emoji | These are multi-codepoint and break when truncated |
  | Use `--format json` for emoji-heavy data | JSON preserves all characters without truncation |
  | Keep names under 17 characters if using emoji | This avoids truncation entirely (20-char column minus 3 for "...") |

  **Example:**
  ```
  # Good: Emoji at end, won't break display if truncated
  "Widget Special Edition" + emoji  →  "Widget Special Ed..." (clean truncation)

  # Problematic: Emoji in middle may be partially truncated
  "Widget " + emoji + " Pro"  →  "Widget [broken]..." (ugly output)
  ```

  **Known limitation:** Table output truncation may produce broken/partial emoji display for international characters. This is documented behavior, not a bug.

  This limitation exists because grapheme-aware truncation requires the `grapheme` library which is not in Python's standard library. Users needing perfect Unicode handling should use `--format json`.

  **Explicit workaround documentation:** For users working with emoji-heavy or international product names:
  1. **Recommended:** Use `--format json` to get complete, untruncated data
  2. **Alternative:** Export to CSV and view in a spreadsheet application
  3. **Future consideration:** A `--no-truncate` flag could be added in v2 to disable column width limits at the cost of table alignment
  - **Performance note:** Python's string slicing (`s[:width-3] + "..."`) is O(n) for Unicode strings in CPython due to codepoint counting, but this is negligible for typical column widths (10-20 chars). The overhead is minimal even for large result sets with pagination (default limit=100 rows). No optimization (e.g., caching truncated values) is required for the expected workload.
- Column widths: SKU=10, Name=20, Quantity=8, Location=15
- low-stock-report column widths: SKU=10, Name=20, Quantity=8, Min Level=10, Deficit=8
- Example: Name "Industrial Widget Assembly" (26 chars) → "Industrial Widget..." (20 chars)

**Truncation indicator:** The `...` suffix indicates data has been truncated. When ANY field is truncated in table output, a footer hint MUST be displayed:

```
SKU       | Name                | Quantity | Location
----------|---------------------|----------|----------
WH-001    | Industrial Widget...| 100      | Aisle-A
WH-002    | Premium Deluxe Sp...| 50       | Aisle-B

Tip: Some values were truncated. Use --format json to view full data.
```

**Inline truncation hint (REQUIRED):**
- The footer hint MUST appear when at least one field was truncated
- This makes the workaround discoverable without requiring users to read documentation
- The hint is suppressed when `--quiet` flag is used (for scripting)

**Example with full JSON output:**
```bash
# Table output shows truncated name with hint
warehouse-cli search --name "widget"
# SKU       | Name                | ...
# WH-001    | Industrial Widget...| ...
# Tip: Some values were truncated. Use --format json to view full data.

# JSON output shows full values
warehouse-cli search --name "widget" --format json
# [{"name": "Industrial Widget Assembly Kit", ...}]
```

### JSON Format
- Pretty-printed with 2-space indent
- Arrays for lists (even single item)
- UTF-8 encoding
- Output uses `print()`, which includes a trailing newline for shell compatibility
- NULL values: include key with `null` value (not omitted)
  ```json
  {"sku": "WH-001", "description": null, "location": null}
  ```

**Scripting Note - Trailing Newline:**
JSON output includes a trailing newline (`\n`) after the closing bracket for shell compatibility. When parsing in scripts, be aware that:
- Most JSON parsers (jq, Python json module) handle this automatically
- If using `read` or direct string comparison, strip the trailing newline first
- Example: `warehouse-cli search --sku WH-001 --format json | jq '.'` works correctly

### Error Messages
- Prefix: `Error: `
- Written to stderr
- No stack traces (unless --verbose)
- No internal paths or SQL

### Verbose Mode Output (--verbose)

When `--verbose` is enabled, the CLI outputs additional debugging information to stderr:

**Debug output includes:**
- Resolved database path (absolute)
- Query execution timing
- Number of rows affected/returned
- Connection establishment and closure events

**Example verbose output:**
```
[DEBUG] Database path: /home/user/data/inventory.db
[DEBUG] Executing: search with criteria sku=WH-001
[DEBUG] Query completed in 0.023s, 1 row(s) returned
--- END DEBUG OUTPUT ---
SKU       | Name      | Quantity | Location
----------|-----------|----------|----------
WH-001    | Widget A  | 100      | Aisle-A
```

**Debug Output Separation (REQUIRED):**
When `--verbose` is enabled, debug output MUST be clearly separated from actual command output:
1. All debug lines MUST be prefixed with `[DEBUG]`
2. A separator line `--- END DEBUG OUTPUT ---` MUST appear after the last debug line and before any command output
3. Debug output MUST go to stderr while command output goes to stdout
This ensures users can easily distinguish debug information from actual results, and scripts can parse stdout without encountering debug messages.

**Automated Parsing Note:** For scripts that need to programmatically separate debug from command output, use stderr/stdout separation rather than parsing the separator line:
```bash
# Capture command output only (ignoring debug)
RESULT=$(warehouse-cli search --sku WH-001 --verbose 2>/dev/null)

# Capture debug output only
DEBUG=$(warehouse-cli search --sku WH-001 --verbose 2>&1 >/dev/null)

# Process both separately
warehouse-cli search --sku WH-001 --verbose 2>debug.log >output.json
```
The separator line is primarily for human readability when viewing combined output in a terminal.

**Verbose output format:**
- Prefix: `[DEBUG] `
- Written to stderr (not stdout)
- Human-readable, not machine-parseable

**For machine-parseable logging (production deployments):**

The CLI does not provide native structured logging. For production environments requiring JSON logs or log aggregation, use a wrapper script:

```bash
#!/bin/bash
# warehouse-cli-logged.sh - Wrapper for structured JSON logging
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
COMMAND="$*"

# Capture output and timing
START=$(date +%s.%N)
OUTPUT=$(warehouse-cli "$@" 2>&1)
EXIT_CODE=$?
END=$(date +%s.%N)
DURATION=$(echo "$END - $START" | bc)

# Emit structured JSON log
jq -n \
  --arg ts "$TIMESTAMP" \
  --arg cmd "$COMMAND" \
  --arg out "$OUTPUT" \
  --argjson exit "$EXIT_CODE" \
  --arg dur "$DURATION" \
  '{
    timestamp: $ts,
    command: $cmd,
    exit_code: $exit,
    duration_seconds: ($dur | tonumber),
    output: $out
  }' >> /var/log/warehouse-cli.json

# Pass through output and exit code
echo "$OUTPUT"
exit $EXIT_CODE
```

**Log aggregation integration:**

For integration with log aggregation systems (ELK, Splunk, Datadog):

1. Use the JSON wrapper script above
2. Configure log shipper to watch `/var/log/warehouse-cli.json`
3. Parse as JSON for structured querying

**Note:** Future versions may add native `--log-format json` flag for structured output. Until then, use wrapper scripts for production logging requirements.
