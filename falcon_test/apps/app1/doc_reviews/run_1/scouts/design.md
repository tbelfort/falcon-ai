# Design Completeness Scout Report

## Status: GAPS_FOUND

## Findings Summary

| # | Title | Affected Files |
|---|-------|----------------|
| 1 | Missing design for update-item command workflow | ["falcon_test/apps/app1/docs/design/components.md", "falcon_test/apps/app1/docs/design/use-cases.md"] |
| 2 | Soft delete feature mentioned but not fully designed | ["falcon_test/apps/app1/docs/design/use-cases.md", "falcon_test/apps/app1/docs/systems/database/schema.md"] |
| 3 | Disaster recovery procedures referenced but not documented | ["falcon_test/apps/app1/docs/design/use-cases.md"] |
| 4 | Multi-user environment detection mechanism undefined | ["falcon_test/apps/app1/docs/design/vision.md"] |
| 5 | Missing security permission verification implementation details | ["falcon_test/apps/app1/docs/design/vision.md", "falcon_test/apps/app1/docs/systems/database/schema.md"] |
| 6 | FTS5 full-text search referenced but not designed | ["falcon_test/apps/app1/docs/design/technical.md"] |
| 7 | Pagination implementation details incomplete | ["falcon_test/apps/app1/docs/design/technical.md"] |
| 8 | Circuit breaker and rate limiter integration undefined | ["falcon_test/apps/app1/docs/systems/errors.md"] |
| 9 | Monitoring integration examples lack specifics | ["falcon_test/apps/app1/docs/systems/errors.md"] |
| 10 | Interactive quick action prompts design incomplete | ["falcon_test/apps/app1/docs/systems/errors.md"] |
| 11 | Search result ordering not specified | ["falcon_test/apps/app1/docs/systems/cli/interface.md", "falcon_test/apps/app1/docs/design/use-cases.md"] |
| 12 | Batch import security script distribution undefined | ["falcon_test/apps/app1/docs/design/use-cases.md"] |
| 13 | Missing CSV import error recovery workflow | ["falcon_test/apps/app1/docs/design/use-cases.md"] |
| 14 | Low-stock report email integration not designed | ["falcon_test/apps/app1/docs/design/use-cases.md"] |

## Finding Details

#### Finding 1: Missing design for update-item command workflow
**Description:** The components.md file defines `cmd_update_item()` function signature and detailed specification (lines 117-138) for updating non-quantity fields, but there is NO corresponding use case or workflow documentation for the update-item command. Users need to understand when to use update-item vs update-stock, what fields can be changed, and what the command syntax looks like.
**Affected Files:** ["falcon_test/apps/app1/docs/design/components.md", "falcon_test/apps/app1/docs/design/use-cases.md"]
**Evidence:**
- components.md line 86: `cmd_update_item(db_path: str, sku: str, name: str | None, description: str | None, location: str | None, min_stock_level: int | None) → Product` function defined
- components.md lines 117-138: Detailed specification for cmd_update_item exists with parameter descriptions, behavior, validation, return values
- use-cases.md: NO use case for updating item metadata (name, description, location, min_stock_level)
- Only UC2 (Receiving Shipment) and UC3 (Order Fulfillment) cover stock quantity updates
- UC2 and UC3 only use update-stock command, not update-item
**Suggested Fix:** Add UC10: Updating Item Metadata to use-cases.md with:
- When to use (correcting typos in name, relocating items to new warehouse location, adjusting reorder points based on seasonality)
- Example flows (update name after branding change, update location after warehouse reorganization, update min_stock_level after demand analysis)
- Distinction from update-stock (quantity changes only)
- Success criteria (stdout displays updated fields, database state verification)
- Error scenarios (SKU not found → exit 3, no fields provided → exit 1 ValidationError)
- Boundary cases (update all fields at once, update single field, attempt to update immutable SKU)

#### Finding 2: Soft delete feature mentioned but not fully designed
**Description:** UC8 (delete-item) mentions a `--soft-delete` flag that marks items as discontinued rather than removing them (lines 426-430), but the database schema columns (status, discontinued_at) are only mentioned in a NOTE without formal specification. The schema.md file referenced in the note would need these column definitions, but the behavior for queries, filters, and the --include-discontinued flag are not documented anywhere.
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md", "falcon_test/apps/app1/docs/systems/database/schema.md"]
**Evidence:**
- use-cases.md line 426-430: Describes soft delete option with `status = 'discontinued'` and `discontinued_at` timestamp
- use-cases.md line 430: "Note: The database schema columns `status` (TEXT) and `discontinued_at` (TIMESTAMP) are defined in `schema.md`. When implementing, ensure these columns are added to the `products` table. Queries should filter out discontinued items by default unless `--include-discontinued` flag is specified."
- No documentation on:
  - Default status values for active items (assumed 'active' but not specified)
  - Whether discontinued items appear in searches by default (note says "filter out" but no queries shown)
  - Whether discontinued items count in low-stock reports (probably not but unspecified)
  - How to "un-discontinue" an item (reactivation workflow)
  - Migration path for existing databases without status column
  - Index requirements for status column
**Suggested Fix:** Add to schema.md (or create dedicated soft-delete design doc):
- ALTER TABLE statement to add status/discontinued_at columns:
  ```sql
  ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'discontinued'));
  ALTER TABLE products ADD COLUMN discontinued_at TEXT;
  CREATE INDEX idx_products_status ON products(status);
  ```
- Default value specification: status defaults to 'active' on INSERT
- Query modification patterns: All SELECT queries MUST add `WHERE status = 'active'` unless --include-discontinued specified
- --include-discontinued flag specification in cli/interface.md (applies to search, low-stock-report, export-csv commands)
- Transition rules: Can only soft-delete items with status='active'; attempting to delete already-discontinued item returns error
- Reactivation workflow: No reactivation in v1 (requires manual UPDATE or restore from backup)

#### Finding 3: Disaster recovery procedures referenced but not documented
**Description:** UC9 (Database Backup and Restore) states "For comprehensive backup and restore procedures, including automated backup scheduling, off-site storage recommendations, and disaster recovery runbooks, see the **Disaster Recovery** section in `ARCHITECTURE-simple.md`" (line 448-449) but this is a forward reference to content that may not exist. The use case only provides manual backup commands without the automated scheduling, retention policies, point-in-time recovery, or off-site recommendations promised in the reference.
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md"]
**Evidence:**
- use-cases.md line 448: "Note: For comprehensive backup and restore procedures... see the **Disaster Recovery** section in `ARCHITECTURE-simple.md`."
- use-cases.md lines 465-469: Lists disaster recovery topics that should be in ARCHITECTURE-simple.md:
  - Automated backup cron schedules
  - Backup retention policies
  - Point-in-time recovery procedures
  - Off-site backup recommendations
- Cannot verify if ARCHITECTURE-simple.md contains this section (file exceeds 25000 token read limit)
- No definition of Recovery Time Objective (RTO) or Recovery Point Objective (RPO) for the system
- Manual backup flow (UC9 lines 452-456) is incomplete: no verification steps, no atomic backup creation, no backup integrity checks beyond PRAGMA integrity_check
**Suggested Fix:** Either:
1. Add a comprehensive Disaster Recovery section to ARCHITECTURE-simple.md covering:
   - Automated backup cron schedule examples: `0 2 * * * /usr/local/bin/backup-warehouse-db.sh`
   - Backup retention policy (e.g., daily for 7 days, weekly for 4 weeks, monthly for 12 months)
   - Point-in-time recovery using SQLite WAL files (requires PRAGMA journal_mode=WAL configuration)
   - Off-site backup recommendations (rsync to remote server, cloud storage with aws s3 sync, or managed backup service)
   - RTO/RPO definitions: Single-user scenario = RTO 1 hour, RPO 24 hours; Multi-user = RTO 15 minutes, RPO 1 hour
   - Database corruption detection script: `sqlite3 $DB "PRAGMA integrity_check;"` in monitoring cron
   - Recovery testing procedures (quarterly restore drill)
2. OR remove the forward reference and mark UC9 as covering only basic manual backup, with disaster recovery marked as out-of-scope for v1

#### Finding 4: Multi-user environment detection mechanism undefined
**Description:** vision.md (lines 47-59) requires automatic detection of multi-user environments to enforce security controls, with specific checks for Unix group permissions and Windows NTFS ACLs. However, the actual implementation of these checks is not documented. How does `getent group` get invoked? What NTFS ACL checks are performed? When does detection run (startup only, or before each database operation)? What happens if detection tools are unavailable?
**Affected Files:** ["falcon_test/apps/app1/docs/design/vision.md"]
**Evidence:**
- vision.md line 47-48: "Before database operations, the system MUST detect if the environment allows multi-user access"
- vision.md line 49: "Unix/Linux: Check if parent directory has group or world read permissions (mode & 0o077 != 0) AND multiple users exist in that group (via `getent group`)"
- vision.md line 50: "Windows: Check NTFS ACLs for multiple user principals with access to the database directory"
- vision.md lines 51-59: Describes enforcement mechanism (fail with SecurityError if multi-user detected without override)
- NO specification for:
  - Which module performs this detection (database.py? cli.py? separate security.py module?)
  - What happens if `getent group` command is not available on the system
  - How Windows ACL parsing is performed (using pywin32 library? icacls subprocess call?)
  - Caching strategy (check once at startup vs every database operation for performance)
  - Error handling if permission checks timeout (network filesystems, slow ACL lookups)
  - Fallback behavior when detection is inconclusive (assume safe or assume unsafe?)
**Suggested Fix:** Add to technical.md or create security-checks.md:
- Module responsibility assignment: database.py calls security validation module during init_database()
- Platform-specific detection algorithms:
  - Unix: `os.stat(parent_dir).st_mode & 0o077` check + optional `subprocess.run(['getent', 'group', group_name])` to enumerate members
  - Windows: Import pywin32 `win32security` module (if available) or fallback to icacls subprocess
- Caching/memoization strategy: Run detection once per process, store result in module-level variable
- Fallback behavior when detection tools unavailable:
  - If `getent` not found: Skip group membership check, rely only on permission bits
  - If pywin32 not available: Log warning and skip Windows multi-user check
- Unit test requirements: Mock `os.stat()`, `subprocess.run()`, and pywin32 functions to test detection logic
- Timeout handling: Set subprocess timeout to 5 seconds, treat timeout as inconclusive and fail-safe to require override

#### Finding 5: Missing security permission verification implementation details
**Description:** Multiple locations mention file permission requirements (0600 for database files, permission verification for security enforcement) but the actual verification implementation is undefined. How are permissions set atomically during file creation? What happens on Windows where 0600 POSIX permissions are not directly applicable? When is verification performed (once at init, or before every operation)? What error is raised if verification fails?
**Affected Files:** ["falcon_test/apps/app1/docs/design/vision.md", "falcon_test/apps/app1/docs/systems/database/schema.md"]
**Evidence:**
- vision.md line 58-59: "Continues execution only if file permissions are correctly configured (0600/restrictive ACLs)"
- vision.md line 91-92: "Before database operations, the system verifies the database file is owned by the current user. If verification fails, the application blocks access with a security error."
- technical.md line 987: "Database file creation MUST use atomic permission setting (see schema.md for details)"
- technical.md lines 987-1031: Detailed requirements for CSV export file permissions (0600 default, 0644 with --shared flag)
- NO documentation for:
  - How to set permissions atomically on file creation (use `os.open()` with mode parameter before sqlite3 opens?)
  - Windows equivalent of 0600 (use `SetFileSecurity()` API? Restrict ACLs to current user?)
  - Whether permissions are verified before every database operation or only at init (performance vs security tradeoff)
  - What SecurityError exception message says when permission verification fails
  - How to handle NFS mounts or other filesystems where permission checks may be unreliable (CIFS, SMB, cloud storage mounts)
**Suggested Fix:** Add to schema.md (Database Security section):
- Atomic permission setting pattern for file creation:
  ```python
  # Create file with restrictive permissions BEFORE sqlite3 opens it
  fd = os.open(db_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
  os.close(fd)
  # Now safe to open with sqlite3, permissions already set
  conn = sqlite3.connect(db_path)
  ```
- Windows ACL configuration using pywin32 (or explicitly state that Windows ACLs are out of scope for v1 and users must configure manually)
- Permission verification function specification:
  - When called: Once during init_database(), cached result used for lifetime of process
  - What it checks: `os.stat(db_path).st_mode & 0o077 == 0` (no group/other permissions)
  - Exceptions raised: SecurityError("Database file has insecure permissions. Expected 0600, got 0644.") with exit code 2
- Owner verification implementation:
  ```python
  stat_info = os.stat(db_path)
  if stat_info.st_uid != os.getuid():
      raise SecurityError(f"Database file is not owned by current user (uid={os.getuid()}).")
  ```
- Filesystem compatibility notes: Permission checks may not work reliably on NFS/CIFS; document limitation and suggest using local filesystems for sensitive data

#### Finding 6: FTS5 full-text search referenced but not designed
**Description:** technical.md line 506 mentions "For improved substring search performance in production, see schema.md FTS5 section" but FTS5 (SQLite's full-text search extension) is not designed anywhere in the available documentation. If substring searches on product names are slow (target <500ms for 50k items), how should FTS5 be enabled? What columns should be indexed? When should users migrate to FTS5?
**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md"]
**Evidence:**
- technical.md line 506: "For improved substring search performance in production, see schema.md FTS5 section"
- This is a forward reference to a non-existent section (cannot verify due to schema.md file size)
- No specification for:
  - When to use FTS5 (dataset size threshold? query performance threshold? e.g., "Use FTS5 if searches consistently exceed 500ms")
  - FTS5 table schema (which columns to index: name only? description? both? SKU?)
  - Migration path from regular LIKE queries to FTS5 (ALTER TABLE not supported, requires new virtual table)
  - Query syntax changes required for FTS5 (MATCH operator instead of LIKE)
  - Index maintenance (how to keep FTS5 table synchronized with products table - triggers? application code?)
  - Tokenizer selection (unicode61, porter, simple - which is appropriate for product names?)
**Suggested Fix:** Either:
1. Add FTS5 design to schema.md with complete specification:
   ```sql
   CREATE VIRTUAL TABLE products_fts USING fts5(sku, name, description, tokenize='unicode61');
   -- Trigger to sync FTS5 on INSERT
   CREATE TRIGGER products_fts_insert AFTER INSERT ON products BEGIN
     INSERT INTO products_fts(rowid, sku, name, description) VALUES (new.id, new.sku, new.name, new.description);
   END;
   -- Similar triggers for UPDATE and DELETE
   ```
   - Query pattern changes: `WHERE products_fts MATCH 'widget*'` instead of `WHERE name LIKE '%widget%'`
   - Migration guide: Run migration script to create FTS5 table and populate from existing products
   - Performance expectations: FTS5 reduces search time from ~500ms to <50ms for substring searches
2. OR remove the FTS5 reference and state that substring search optimization is out of scope for v1, with LIKE queries being acceptable for the 50k item target

#### Finding 7: Pagination implementation details incomplete
**Description:** technical.md specifies pagination requirements (default limit 100, max 1000, offset parameter for search and low-stock-report commands) and defines a JSON response schema with pagination metadata (lines 420-479), but the actual CLI interface for pagination flags (--limit, --offset) is not documented in interface.md. How do users specify pagination? What does the table format output show for pagination info?
**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md"]
**Evidence:**
- technical.md line 505-506: "Pagination implemented via `--limit` and `--offset` flags (see interface.md CLI specification)" - forward reference
- technical.md lines 420-479: Detailed pagination response schema defined for JSON format
- technical.md lines 481-493: Table format pagination behavior specified (stderr output showing "Showing results 101-200 of 250 total")
- technical.md lines 651-732: Extensive pagination validation requirements (offset edge cases, limit bounds, error messages)
- NO specification found in use-cases.md or components.md for:
  - Exact CLI syntax: `warehouse-cli search --name "widget" --limit 50 --offset 100`?
  - Default values explicitly stated in CLI help text ("Default: 100" for --limit)
  - Validation error messages for invalid limit/offset values (user sees what?)
  - Whether pagination applies to export-csv (technical.md performance table says "No" but not explicit in CLI interface)
  - How pagination interacts with --format flag (JSON shows metadata, table shows stderr message)
**Suggested Fix:** Cross-reference cli/interface.md to verify it documents:
- --limit flag: type (integer), default (100), validation (1-1000), example usage
- --offset flag: type (integer), default (0), validation (>= 0), example usage
- Help text examples showing pagination: `warehouse-cli search --name "widget" --limit 50` and `warehouse-cli search --name "widget" --limit 50 --offset 50`
- Error messages for out-of-range values:
  - `--limit 2000` → "Error: Limit cannot exceed 1000."
  - `--offset -5` → "Error: Offset must be a non-negative integer. Got: -5"
- Clarify that export-csv does NOT support pagination (exports all matching records)

#### Finding 8: Circuit breaker and rate limiter integration undefined
**Description:** errors.md defines comprehensive circuit breaker and rate limiter implementations (ProcessRetryBudget class lines 526-596, DatabaseCircuitBreaker class lines 600-670, SearchRateLimiter class in technical.md lines 583-636) but does not specify how these integrate with the main codebase. Where are these singletons instantiated? Which module owns them? How do they interact with the layered architecture (cli.py, commands.py, database.py)?
**Affected Files:** ["falcon_test/apps/app1/docs/systems/errors.md"]
**Evidence:**
- errors.md lines 526-596: ProcessRetryBudget implementation with global instance `_process_retry_budget`
- errors.md lines 600-670: DatabaseCircuitBreaker implementation with global instance `_circuit_breaker`
- technical.md lines 583-636: SearchRateLimiter implementation with global instance `_rate_limiter`
- errors.md lines 687-755: retry_with_backoff function that should integrate with circuit breaker
- NO specification for:
  - Which module instantiates these global singletons (cli.py? database.py? separate middleware module?)
  - Call site integration: Does cmd_search() in commands.py call `_rate_limiter.acquire()` directly? Or is this wrapped in database layer?
  - Dependency injection strategy vs global state (conflicts with AD2: No Global State in technical.md line 158-161)
  - Testing strategy: How to reset singletons between unit tests? (Global state causes test coupling)
  - Thread safety guarantees: Code uses threading.Lock but not documented in architecture
**Suggested Fix:** Add to ARCHITECTURE-simple.md or technical.md (Concurrency and Resilience section):
- Module ownership: "database.py owns circuit breaker and retry budget instances as module-level variables; commands.py owns rate limiter for search operations"
- Integration points with code examples:
  - Circuit breaker wraps all retry_with_backoff calls in database.py
  - Rate limiter called at entry of cmd_search() and cmd_low_stock_report() in commands.py
- Testing strategy: Provide reset functions `_reset_circuit_breaker_for_testing()` and `_reset_rate_limiter_for_testing()` (only called from test code)
- Relationship to AD2 (No Global State): "These are acceptable exceptions to AD2 because they implement cross-cutting concerns (resilience, rate limiting) that must be shared across all operations. The alternative (passing them as parameters) would violate encapsulation."
- Thread safety: Document that these classes use threading.Lock for thread-safe state updates, supporting concurrent CLI invocations in multi-user scenarios

#### Finding 9: Monitoring integration examples lack specifics
**Description:** errors.md provides example scripts for Prometheus metrics collection (warehouse-metrics.sh lines 872-894) and error tracking (warehouse-cli-monitored wrapper lines 896-921), plus Alertmanager configuration (lines 923-947), but these are incomplete snippets without deployment instructions. How is the wrapper script invoked for every CLI call? Where do metrics files get written? Who consumes them? What about non-Prometheus monitoring systems?
**Affected Files:** ["falcon_test/apps/app1/docs/systems/errors.md"]
**Evidence:**
- errors.md lines 870-921: Example monitoring scripts provided as bash snippets
- errors.md lines 923-947: Alertmanager YAML configuration snippet
- Gaps in deployment guidance:
  - No instructions on how to wrap all warehouse-cli invocations (shell alias? PATH manipulation? system-wide script wrapper?)
  - Metrics file location (/var/log/warehouse-metrics.prom) assumes specific system setup and permissions
  - No log rotation strategy for metrics files (they will grow unbounded)
  - No alternative examples for DataDog, CloudWatch, Splunk, or other monitoring systems (only Prometheus)
  - No specification for how to test monitoring integration (how to verify metrics are emitted correctly)
  - No error handling in wrapper script (what if jq is not installed? what if log directory is not writable?)
**Suggested Fix:** Add monitoring deployment guide (as separate doc or in ARCHITECTURE-simple.md Operations section):
- Shell wrapper deployment options:
  - Option 1: Shell alias in ~/.bashrc: `alias warehouse-cli='warehouse-cli-monitored'`
  - Option 2: System-wide wrapper in /usr/local/bin/warehouse-cli that calls /opt/warehouse-cli/warehouse-cli-real
  - Option 3: Environment variable WAREHOUSE_CLI_ENABLE_METRICS=1 checked by CLI itself
- Metrics file location and rotation:
  - Create /var/log/warehouse/ directory with appropriate permissions
  - Add logrotate configuration: `/etc/logrotate.d/warehouse-cli`
- Prometheus node_exporter textfile collector setup:
  - Configure node_exporter with `--collector.textfile.directory=/var/log/warehouse/`
  - Metrics automatically scraped by Prometheus
- Alternative: Structured JSON logging to stdout for universal monitoring compatibility:
  ```bash
  warehouse-cli "$@" 2>&1 | jq -c '{timestamp: now, command: "$1", exit_code: $?, output: .}'
  ```
- Testing: Mock wrapper script to verify metrics are emitted with correct format and values

#### Finding 10: Interactive quick action prompts design incomplete
**Description:** errors.md specifies interactive prompts for ItemNotFoundError (lines 1063-1076) with options to "[1] Create this item now", "[2] Search for similar SKUs", "[3] List all items", but the actual actions taken when user selects an option are undefined. If user chooses option 1, does the CLI prompt for additional fields (name, quantity)? Or does it just show the add-item command to run? The interaction model is ambiguous between "helpful suggestions" and "automatic execution".
**Affected Files:** ["falcon_test/apps/app1/docs/systems/errors.md"]
**Evidence:**
- errors.md lines 1063-1076: Interactive prompt specification with 3 quick action options
- errors.md lines 1078-1129: Detailed input validation and prompt implementation (readline, max attempts, EOF handling)
- NO specification for what happens after user selects an option:
  - Action [1] "Create this item now": What prompts appear? "Enter name:" prompt then "Enter quantity:"? Or just display `warehouse-cli add-item --sku "WH-999" --name "NAME" --quantity QUANTITY` for user to copy?
  - Action [2] "Search for similar SKUs": Automatically execute `warehouse-cli search --sku "WH-9"`? Or suggest the command?
  - Action [3] "List all items": Execute `warehouse-cli search --name ""` immediately? Or print the command?
- Interaction model ambiguous: Is this a wizard that collects input and executes commands, or just a command suggestion/shortcut generator?
- No exit code specification for quick actions: If user creates item via action [1], does the original command return exit 0 (item created) or exit 3 (original SKU not found but user took action)?
**Suggested Fix:** Define quick action behavior in errors.md or cli/interface.md with explicit model choice:
- **Option A: "Show command to run" model (simpler, safer):**
  ```
  Quick actions:
  [1] Create this item now
  Choice: 1

  To create this item, run:
    warehouse-cli add-item --sku "WH-999" --name "NAME" --quantity QUANTITY

  [Command exits with code 3 - original operation failed but user has guidance]
  ```
- **Option B: "Interactive wizard" model (more helpful, more complex):**
  ```
  Quick actions:
  [1] Create this item now
  Choice: 1

  Creating item WH-999...
  Enter name: Widget A
  Enter quantity: 100
  Enter location (optional): Aisle-A
  [Executes add-item internally]
  Item created successfully.

  [Command exits with code 0 - operation succeeded via recovery action]
  ```
- **Recommendation:** Implement Option A for v1 (simpler, consistent with CLI philosophy), document Option B as future enhancement
- Specify exit code behavior: Quick actions that suggest commands still return original error exit code; user must run suggested command separately

#### Finding 11: Search result ordering not specified
**Description:** The search command returns matching items but no sorting options or default sort order is specified. Users may need results sorted by SKU (alphabetical), name, quantity (stock level), or location. Without defined ordering, results may appear in arbitrary insertion order, making them hard to navigate.
**Affected Files:** ["falcon_test/apps/app1/docs/systems/cli/interface.md", "falcon_test/apps/app1/docs/design/use-cases.md"]
**Evidence:**
- interface.md search command section (cannot fully verify due to file size) likely specifies matching behavior but no --sort or --order options mentioned in use-cases.md
- use-cases.md UC5 (Finding Items) line 295-336: Shows search examples by name, location, but no mention of result ordering
- components.md line 80-81: `cmd_search()` returns `list[Product]` but no ORDER BY clause specified
- Database query patterns typically need ORDER BY clause for deterministic results
**Suggested Fix:**
- Document the default sort order in interface.md and schema.md: "Results are sorted by SKU ascending (alphabetical)"
- Optionally add --sort-by flag: `--sort-by {sku|name|quantity|location|created_at}` with default 'sku'
- Optionally add --order flag: `--order {asc|desc}` with default 'asc'
- Add ORDER BY clause to search queries in database.py: `SELECT ... FROM products WHERE ... ORDER BY sku ASC`

#### Finding 12: Batch import security script distribution undefined
**Description:** UC1 (Initial Setup) provides a comprehensive secure batch import script (lines 39-61) with input validation to prevent command injection, but does not specify how users obtain this script. Is it bundled with the CLI tool? Distributed separately? Does `warehouse-cli --help` mention it? Without clear distribution, users may resort to insecure shell loops mentioned in the WARNING.
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md"]
**Evidence:**
- use-cases.md lines 21-61: Extensive security warning about vulnerable shell loops and provides SECURE batch import script as reference implementation
- use-cases.md line 62-63: "Production batch imports MUST validate all input fields before passing to shell commands. The script shown above is a reference implementation..."
- NO specification for:
  - Where this script is included in the distribution (scripts/ directory? examples/?)
  - How users discover this script (README? --help output? documentation website?)
  - Whether CLI should provide a helper command: `warehouse-cli generate-import-script --output batch-import.sh`
  - Installation location (e.g., /usr/local/share/warehouse-cli/examples/secure-import.sh)
**Suggested Fix:**
- Bundle the secure import script in the package under `share/examples/secure-import.sh`
- Add to README.md Quick Start section: "For batch imports, see the secure import script at `examples/secure-import.sh`"
- Optionally add CLI helper: `warehouse-cli import-example` that prints the script to stdout
- Add note in use-cases.md pointing to bundled script location

#### Finding 13: Missing CSV import error recovery workflow
**Description:** UC1 (Initial Setup) specifies batch operation error handling (lines 111-114): "Individual item failures do NOT stop the batch (continue processing), Failures are logged to a separate file for manual review". However, there is no workflow or tooling described for reviewing and recovering from these failures. How does the user know which items failed? How do they retry just the failed items?
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md"]
**Evidence:**
- use-cases.md lines 111-114: Describes error handling during batch imports (log failures, continue processing)
- use-cases.md line 112-114: "Exit code 4 (duplicate SKU) may be expected if re-importing partial data"
- use-cases.md lines 92-94: "Error Log File Verification: If `import_errors.log` exists and has content: FAIL (review errors)"
- NO specification for:
  - Format of error log entries (CSV? JSON? Plain text with SKU and error message?)
  - Tool or command to parse error log and generate retry CSV (failed items only)
  - Example error log format: `WH-001,Duplicate SKU,exit_code=4` or structured JSON?
  - Workflow for retrying failed imports: Manual editing of CSV? Re-run entire import with --skip-duplicates?
**Suggested Fix:** Add to use-cases.md UC1:
- Error log format specification:
  ```csv
  sku,error_message,exit_code
  WH-001,"SKU already exists",4
  WH-002,"Quantity must be non-negative",1
  ```
- Recovery workflow:
  1. Review error log: `cat import_errors.log`
  2. Fix source data issues (e.g., remove duplicates, correct negative quantities)
  3. Extract failed SKUs: `awk -F, '{print $1}' import_errors.log > failed_skus.txt`
  4. Filter original CSV: `grep -F -f failed_skus.txt items.csv > retry.csv`
  5. Re-run import: `./secure-import.sh < retry.csv`
- Optionally: CLI helper command `warehouse-cli import-retry --error-log import_errors.log --source items.csv --output retry.csv`

#### Finding 14: Low-stock report email integration not designed
**Description:** UC4 (Daily Low-Stock Report) shows an automation integration example (lines 236-257) that includes sending email notifications via `mail` command, but the email format, recipient configuration, and error handling are not designed. The example is incomplete and may not work in typical production environments where `mail` command is not configured.
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md"]
**Evidence:**
- use-cases.md lines 236-257: Example automation script with `mail -s "Low Stock Alert"` command
- use-cases.md line 240-242: Shows database error email: `echo "$OUTPUT" | mail -s "Inventory Alert: Database Error" admin@example.com`
- use-cases.md line 251-253: Shows low-stock items email with formatted output
- NO specification for:
  - Email prerequisites (MTA installed? mail command configured?)
  - Fallback notification mechanism if email fails (SMS? Slack webhook? PagerDuty?)
  - Email format (plain text? HTML? attachment?)
  - Recipient configuration (environment variable? config file?)
  - What happens if mail command fails (silent failure? logged error?)
**Suggested Fix:** Either:
1. Expand UC4 automation example with:
   - Prerequisites section: "Requires sendmail or postfix configured on system"
   - Fallback notification: Check if mail command exists, fallback to logging or webhook
   - Email format: Plain text with item list, subject line with item count
   - Configuration: `WAREHOUSE_ALERT_EMAIL` environment variable
2. OR simplify example to only log to file/stdout, and note that email integration is left to user's monitoring system (e.g., Prometheus Alertmanager, Nagios)

## Coverage Summary
- Features defined: 8/11 (core CRUD commands exist; update-item has function signature but no use case; soft-delete partial; FTS5 referenced but not designed)
- User flows complete: 7/11 (UC1-UC9 covered with gaps: UC1 batch import incomplete, UC4 email integration incomplete, UC8 soft-delete partial, UC9 disaster recovery incomplete; update-item use case missing)
- Use cases addressed: 9/11 (UC1-UC9 documented but several with incomplete specifications; update-item metadata use case missing; soft-delete reactivation workflow missing)

## Critical Gaps for Implementation

The following gaps MUST be resolved before implementation can begin:

1. **Blocking:** Update-item command workflow (Finding 1) - Function signature defined in components.md but no use case, CLI syntax, or user-facing documentation
2. **Blocking:** Soft-delete database schema (Finding 2) - Feature mentioned but status/discontinued_at columns not formally specified in schema
3. **Blocking:** Security permission verification (Finding 5) - Security requirements stated but atomic permission setting and verification implementation undefined
4. **Blocking:** Interactive prompt action behavior (Finding 10) - Ambiguous specification between "show command" vs "execute command" models will lead to implementation inconsistency

The remaining findings (3, 4, 6, 7, 8, 9, 11, 12, 13, 14) are gaps in documentation completeness but may not block initial implementation if assumptions are documented and deferred to future versions.
