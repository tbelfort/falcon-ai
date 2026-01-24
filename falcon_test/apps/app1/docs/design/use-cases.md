# Use Cases: Warehouse Inventory CLI

## UC1: Initial Setup

**Actor**: Warehouse manager setting up tracking for the first time

**Flow**:
1. Install tool: `pip install warehouse-cli`
2. Initialize database: `warehouse-cli init --db ./inventory.db`
3. Add initial inventory items from spreadsheet (batch scripting)

**Batch scripting pattern:**
Since this CLI does not have a native batch import command, batch operations are performed via shell scripting.

**Design rationale for no native batch import:** The decision to omit a native batch import command was deliberate:
1. **Standard library only constraint** - The CLI is designed to have zero external dependencies, and robust CSV parsing with proper escaping requires additional libraries
2. **Complexity vs. usage frequency trade-off** - Batch imports are infrequent (typically one-time setup), while adding native support would significantly increase codebase complexity and maintenance burden
3. **Flexibility** - Shell scripting allows users to customize validation, error handling, and source formats (CSV, TSV, JSON) without CLI changes
4. **Security surface** - Native batch import would require extensive input validation; delegating to shell scripts makes the security boundary explicit

> **WARNING: DO NOT USE SIMPLE SHELL LOOPS FOR BATCH IMPORTS**
>
> Simple shell loop patterns (like `while read ... done < file.csv`) are **VULNERABLE to command injection** when processing untrusted CSV files. An attacker could craft a malicious CSV that executes arbitrary shell commands. **Always use the SECURE batch import script below for production.**

**For IT staff or developers implementing batch imports:** A secure batch import script is provided immediately below in the "SECURE batch import" section. The script includes input validation to prevent command injection and handles errors gracefully.

**How to obtain the script:** The secure batch import script shown below is the reference implementation. Users can copy it from this documentation or find it in the project repository at `examples/batch-import.sh` (if bundled with the package). For teams, save this script to version control and customize validation rules as needed.

**SECURITY WARNING - Command Injection Risk:**

The simple shell loop pattern is VULNERABLE to command injection when processing untrusted CSV files. An attacker could craft a malicious CSV with fields like `"; rm -rf / #` which would execute arbitrary shell commands.

**DO NOT use this vulnerable pattern:**
```bash
# VULNERABLE - DO NOT USE WITH UNTRUSTED DATA
# while IFS=, read -r sku name quantity location; do
#     warehouse-cli add-item --sku "$sku" ...  # DANGEROUS!
# done < untrusted.csv
```

**SECURE batch import (REQUIRED for production use):**
```bash
#!/bin/bash
set -euo pipefail

# Validate field contains no shell metacharacters
validate_field() {
    local field="$1" name="$2"
    if [[ "$field" =~ [\;\|\&\$\`\(\)\{\}\<\>\!\#\'] ]]; then
        echo "ERROR: Invalid characters in $name" >&2
        return 1
    fi
    [[ "$field" != -* ]] || { echo "ERROR: $name starts with hyphen" >&2; return 1; }
}

while IFS=, read -r sku name quantity location; do
    [[ "$sku" == "sku" ]] && continue  # Skip header
    validate_field "$sku" "SKU" && validate_field "$name" "Name" && \
    validate_field "$quantity" "Qty" && validate_field "$location" "Loc" || continue
    warehouse-cli add-item --sku "$sku" --name "$name" \
        --quantity "$quantity" --location "$location" --db ./inventory.db
done < items.csv
```

**Note:** Production batch imports MUST validate all input fields before passing to shell commands. The script shown above is a reference implementation that provides the core security features needed for production use (input validation, error handling, and safe field processing). Organizations should customize this script to add environment-specific features such as detailed error logging, email alerts, or database transaction rollback as needed.

**Batch operation success criteria:**
- Each `add-item` command exits with code 0
- Total items added matches expected count from source file (verification method below)
- No entries in error log file (log file exists but is empty, or does not exist)

**Test data requirements for batch operations:**
| Scenario | Input Size | Expected Outcome | Acceptance Criteria |
|----------|-----------|------------------|---------------------|
| Empty CSV | 0 items (header only) | Success, 0 items added | Exit code 0, `SELECT COUNT(*)` returns 0 |
| Single item | 1 item | Success, 1 item added | Exit code 0, `SELECT COUNT(*)` returns 1 |
| Standard batch | 100 items | Success, 100 items added | Exit code 0, `SELECT COUNT(*)` returns 100 |
| Large batch | 10,000 items | Success, 10,000 items added | Exit code 0, completion < 5 minutes |
| Partial failure | 100 items (5 duplicates) | 95 success, 5 failures logged | Exit code 0 for 95 items, 5 entries in error log |

**Expected count definition:** The number of data rows in the source CSV file (excluding header row). Calculate as: `wc -l < items.csv` minus 1.

**Verification Method for "Total items added":**

**Recommended method:** Query the database directly using the sqlite3 command-line tool (usually pre-installed on Linux/Mac, or install via `apt install sqlite3` on Ubuntu):
```bash
sqlite3 inventory.db "SELECT COUNT(*) FROM products;"
# Compare result to expected count (lines in CSV minus header)
```

**Alternative methods:** Count successful exit codes during import, or use `warehouse-cli search --name "" --format json | jq 'length'`.

**Error Log File Verification:**
- If `import_errors.log` does not exist: PASS (no errors occurred)
- If `import_errors.log` exists and is empty (0 bytes): PASS
- If `import_errors.log` exists and has content: FAIL (review errors)

**Example verification script:**
```bash
#!/bin/bash
EXPECTED_COUNT=$(wc -l < items_to_import.csv)
EXPECTED_COUNT=$((EXPECTED_COUNT - 1))  # Subtract header row
ACTUAL_COUNT=$(sqlite3 inventory.db "SELECT COUNT(*) FROM products;")

if [ "$ACTUAL_COUNT" -eq "$EXPECTED_COUNT" ]; then
    echo "SUCCESS: Imported $ACTUAL_COUNT items"
else
    echo "FAILURE: Expected $EXPECTED_COUNT, got $ACTUAL_COUNT"
    exit 1
fi
```

**Batch operation error handling:**
- Individual item failures do NOT stop the batch (continue processing)
- Failures are logged to `import_errors.log` for manual review
- Exit code 4 (duplicate SKU) may be expected if re-importing partial data

**Error log format (`import_errors.log`):**

When batch import errors occur, each error is logged as a single line with the following format:
```
[TIMESTAMP] ERROR: SKU=<sku> | FIELD=<field_name> | ERROR=<error_message> | LINE=<csv_line_number>
```

**Example error log entries:**
```
[2026-01-23 14:32:15] ERROR: SKU=WH-001 | FIELD=sku | ERROR=Duplicate SKU | LINE=15
[2026-01-23 14:32:16] ERROR: SKU=WH-002 | FIELD=quantity | ERROR=Invalid quantity value '-5' | LINE=16
[2026-01-23 14:32:17] ERROR: SKU=WH-003; rm -rf / | FIELD=sku | ERROR=Invalid characters in SKU | LINE=17
```

**Error recovery workflow:**
1. Check for errors: `cat import_errors.log` (if file exists)
2. Review each error entry to identify the problem (duplicate SKU, validation failure, etc.)
3. Fix the source CSV file by correcting the identified issues on the specified line numbers
4. Re-run the batch import script with the corrected CSV
5. Verify success: check that `import_errors.log` is now empty or does not exist

**Success**: Database created, ready to accept items

**Testable success criteria:**
- Database file exists at specified path
- File has secure permissions (0600 on Unix)
- Schema validation passes: `sqlite3 inventory.db ".tables"` returns "products"
- Can execute INSERT: `warehouse-cli add-item --sku TEST-001 --name "Test" --quantity 1` returns exit code 0

**Failure modes**:
- Database path not writable → error message "Cannot create database '{filename}': Permission denied.", exit code 2
- Database already exists → error message "Database already exists at '{filename}'. Use --force to recreate.", exit code 1

---

## UC2: Receiving Shipment

**Actor**: Warehouse worker processing incoming goods

**Flow**:
1. For each item in shipment:
   - If new SKU: `warehouse-cli add-item --sku "WH-123" --name "Widget A" --quantity 100`
   - If existing SKU: `warehouse-cli update-stock --sku "WH-123" --add 50`
2. Verify counts match packing slip

**Success**: Inventory quantities updated, previous/new quantities shown

**Success criteria observable behavior:**
- stdout displays: `Updated quantity for SKU '{sku}': {previous_qty} -> {new_qty}`
- Exit code: 0
- Database state verification: `SELECT quantity FROM products WHERE sku = '{sku}'` returns new_qty

**Boundary test cases for quantity updates:**
| Scenario | Operation | Value | Expected Result | Exit Code |
|----------|-----------|-------|-----------------|-----------|
| Set to zero | --set | 0 | qty becomes 0 | 0 |
| Set to max | --set | 999999999 | qty becomes 999999999 | 0 |
| Set beyond max | --set | 1000000000 | Reject | 1 |
| Add with negative | --add | -1 | Reject | 1 |

**Failure modes**:
- Duplicate SKU on add → exit code 4, error message: "Error: SKU 'WH-123' already exists."
- SKU not found on update → exit code 3, error message: "Error: SKU 'WH-123' not found. Did you mean to use add-item instead?"
- Negative quantity → exit code 1, error message: "Error: Quantity must be a non-negative integer. Got: {value}"

---

## UC3: Order Fulfillment

**Actor**: Picker preparing customer orders

**Flow**:
1. Look up item location: `warehouse-cli search --sku "WH-123"`
2. Pick item from shelf
3. Reduce stock: `warehouse-cli update-stock --sku "WH-123" --remove 1`

**Success**: Stock decremented, picker sees updated quantity

**Success criteria observable behavior:**
- stdout displays: `Updated quantity for SKU '{sku}': {previous_qty} -> {new_qty}`
- Exit code: 0
- Database state: `SELECT quantity FROM products WHERE sku = '{sku}'` returns new_qty

**Test data requirements for stock removal (boundary cases):**
| Scenario | Current Qty | Remove Amount | Expected Result | Exit Code | Error Message |
|----------|-------------|---------------|-----------------|-----------|---------------|
| Normal removal | 100 | 1 | qty becomes 99 | 0 | N/A |
| Remove exactly available | 50 | 50 | qty becomes 0 | 0 | N/A |
| Remove zero items | 100 | 0 | Reject | 1 | "Value for --remove must be greater than 0" |
| Remove from zero stock | 0 | 1 | Reject | 1 | "Cannot reduce quantity below 0. Current: 0, Requested removal: 1" |
| Remove more than available | 10 | 15 | Reject | 1 | "Cannot reduce quantity below 0. Current: 10, Requested removal: 15" |

**Failure modes**:
- Removing more than available → exit code 1, show current quantity in error message
- SKU not found → exit code 3
- Database busy (another warehouse-cli command is currently running) → exit code 2, wait and retry

**Note on "Database is busy" errors:** If you see this error, another operation is in progress and the system has already retried for 30 seconds. **Wait 10-15 seconds before retrying manually.** If the error persists after 2-3 manual retries, check for hung processes with `ps aux | grep warehouse-cli` or investigate if another application is holding a database lock.

**Timeout boundary behavior (technical detail):**
- The 30-second timeout uses SQLite's `busy_timeout` (25s) plus application-level retry (~5s)
- Timeout check interval: ~100ms during lock acquisition
- Actual timeout may vary between 29.9 and 30.1 seconds due to timer precision
- Jitter on retry prevents thundering herd when multiple processes timeout simultaneously

---

## UC4: Daily Low-Stock Report

**Actor**: Automated cron job

**Threshold behavior:** For authoritative threshold behavior specification, see `systems/cli/interface.md` low-stock-report section.

Summary: By default, each item is compared against its own `min_stock_level` field. Use `--threshold N` to override with a single threshold for all items.

**Flow**:
1. Run: `warehouse-cli low-stock-report --format json --db /data/inventory.db`
2. Parse JSON output
3. Send email/Slack notification if items below threshold

**Pagination (MANDATORY):**
Low-stock reports include pagination to prevent unbounded result sets:
- `--limit N`: Maximum number of items to return (default: 100, max: 1000)
- `--offset N`: Number of items to skip (default: 0)
- Example: `warehouse-cli low-stock-report --format json --limit 50 --offset 0`
- For automation scripts processing all low-stock items, iterate through pages:
  ```bash
  # Process all low-stock items in batches of 100
  OFFSET=0
  while true; do
    RESULT=$(warehouse-cli low-stock-report --format json --limit 100 --offset $OFFSET)
    COUNT=$(echo "$RESULT" | jq '.pagination.count')
    [ "$COUNT" -eq 0 ] && break
    # Process this batch...
    OFFSET=$((OFFSET + 100))
  done
  ```

**JSON output schema for automation:**
```json
[
  {
    "sku": "string (1-50 chars)",
    "name": "string (1-255 chars)",
    "quantity": "number (integer, 0 to 999999999)",
    "min_stock_level": "number (integer, 0 to 999999999)",
    "deficit": "number (integer, positive, quantity needed to reach threshold)"
  }
]
```

**Field type specifications:**
- `sku`: string type, 1-50 characters
- `name`: string type, 1-255 characters
- `quantity`: number type (JSON integer representation), range 0 to 999999999
- `min_stock_level`: number type (JSON integer representation), range 0 to 999999999
- `deficit`: number type (JSON integer representation), always positive (> 0)

**Automation integration example:**
```bash
#!/bin/bash
# Daily low-stock notification script
# Prerequisites: jq, mail command configured with SMTP server

OUTPUT=$(warehouse-cli low-stock-report --format json --db /data/inventory.db 2>&1)
EXIT_CODE=$?

# Handle errors
if [ $EXIT_CODE -eq 2 ]; then
    echo "Database error: $OUTPUT" | mail -s "Inventory Alert: Database Error" admin@example.com
    exit 1
fi

# Parse JSON and check for items (requires jq)
ITEM_COUNT=$(echo "$OUTPUT" | jq 'length')

if [ "$ITEM_COUNT" -gt 0 ]; then
    # Items need reorder - send notification
    echo "$OUTPUT" | jq -r '.[] | "\(.sku): \(.quantity) in stock (need \(.deficit) more)"' | \
        mail -s "Low Stock Alert: $ITEM_COUNT items" purchasing@example.com
fi
```

**Note on email integration:** This example script uses the `mail` command for notifications. The CLI itself outputs JSON, which can be consumed by any notification system (Slack, PagerDuty, custom webhook, etc.). Email integration requires: (1) `mail` command installed on system, (2) SMTP server configured (e.g., via `/etc/mail.rc` or `sendmail`). For systems without email, replace the `mail` command with your preferred notification method (e.g., `curl` to a webhook endpoint).

**Automation error handling requirements:**
- Exit code 0 with empty `[]` is normal (no low-stock items)
- Exit code 2 indicates database error - script should alert admin
- JSON output may be empty array `[]` but is always valid JSON when exit code is 0
- Malformed JSON should never occur with exit code 0 - treat as bug and report

**Note on threshold:** By default, each item is compared against its own `min_stock_level` field. Optionally, use `--threshold N` to compare all items against a single threshold value.

**Threshold edge cases:**
| Scenario | Default behavior (no --threshold) | With --threshold N |
|----------|----------------------------------|-------------------|
| Item with `min_stock_level = 10`, `quantity = 5` | Included (deficit = 5) | Included if N > 5 |
| Item with `min_stock_level = 0`, `quantity = 5` | NOT included (already at/above min) | Included if N > 5 |
| Item with `min_stock_level` NULL | Treated as `min_stock_level = 10` (schema default) | Uses --threshold N |
| Item with `quantity = 0`, any threshold | Included | Included if N > 0 |

**Interaction between default and --threshold flag:**
- When `--threshold N` is specified, it OVERRIDES the per-item `min_stock_level` field for ALL items
- The `deficit` field in output always shows `threshold - quantity` (where threshold is either `min_stock_level` or the `--threshold` value)

See `systems/cli/interface.md` low-stock-report section for the complete specification.

**Success**: Machine-parseable list of items needing reorder

**JSON output validation criteria:**
- Output MUST be valid JSON (parseable by `jq .`)
- Output MUST be an array (even if empty)
- Each object MUST contain required fields: `sku` (string), `name` (string), `quantity` (integer), `min_stock_level` (integer), `deficit` (positive integer)
- Field types MUST match schema: `jq -e 'all(.sku | type == "string")' && jq -e 'all(.quantity | type == "number")'`
- Exit code 0 with valid JSON when successful

**Failure modes**:
- Database not found → exit code 2
- No items below threshold → empty array `[]`, exit code 0

---

## UC5: Finding Items

**Actor**: Worker looking for specific products

**Flow**:
1. Search by partial name: `warehouse-cli search --name "widget"`
2. Search by location: `warehouse-cli search --location "Aisle-B"`
3. Review results in table format

**Pagination (MANDATORY):**
All search operations include pagination to prevent unbounded result sets. The following flags control pagination behavior:
- `--limit N`: Maximum number of results to return (default: 100, max: 1000)
- `--offset N`: Number of results to skip before returning (default: 0)

**Example with pagination:**
```bash
# First page (default behavior)
warehouse-cli search --name "widget"
# Equivalent to: warehouse-cli search --name "widget" --limit 100 --offset 0

# Next page
warehouse-cli search --name "widget" --limit 100 --offset 100

# Custom page size
warehouse-cli search --name "widget" --limit 50 --offset 0
```

**Pagination in table format:**
When using the default table format, pagination information is printed to stderr:
```
Showing items 1-100 of 250 total. Use --offset 100 to see more results.
```

**Pagination in JSON format:**
When using `--format json`, pagination metadata is included in the response envelope:
```json
{
  "data": [...],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "count": 100,
    "total": 250,
    "has_more": true
  }
}
```

**Success**: Matching items displayed with SKU, name, quantity, location

**Search matching behavior specification:**
- Match type: Case-insensitive substring match (LIKE '%value%' in SQL)
- `--name "widget"` matches "Widget", "WIDGET", "Blue Widget", "widgets"
- Special characters are treated as literals (no regex)

**Test data for search edge cases:**
| Search Input | Test Data in DB | Expected Match | Notes |
|--------------|-----------------|----------------|-------|
| "widget" | "Widget A" | Yes | Case-insensitive |
| "Widget" | "widget a" | Yes | Case-insensitive |
| "blue widget" | "Blue Widget" | Yes | Exact substring |
| "widg" | "Widget" | Yes | Partial match |
| "特殊" | "特殊商品" | Yes | Unicode support |
| "O'Reilly" | "O'Reilly Tool" | Yes | Apostrophe literal |
| "A" * 1000 | N/A | Error | Input exceeds 1000 char limit |

**Failure modes (grouped by user action needed)**:

**User Input Errors (Exit Code 1 - Fix your command):**
- No search criteria → "Error: At least one search criterion required (--sku, --name, or --location). Example: warehouse-cli search --sku 'WH-001'"
- Search input exceeds length limit (>1000 chars) → "Error: Search input '--name' exceeds maximum length of 1000 characters."

**Successful but Empty (Exit Code 0 - No action needed):**
- No matches → table output with criteria summary: "No items found matching criteria: [--name 'widget']". Use `--format json` to get raw `[]` for scripting.

**System/Database Issues (Exit Code 2 - Investigate or retry):**
- Database locked (concurrent access) → "Database is busy. Please wait a moment and try again." *Action: Wait 10-15 seconds and retry.*
- Database error (file not found, corruption) → "Error: Cannot open database 'inventory.db'" *Action: Check file path and permissions.*

This grouping helps users understand: exit 1 = "you made a mistake", exit 0 = "success (even if empty)", exit 2 = "system issue, retry or investigate".

---

## UC6: Monthly Inventory Export

**Actor**: Manager generating reports for accounting

**Flow**:
1. Export all: `warehouse-cli export-csv --output inventory-2026-01.csv`
2. Export by location: `warehouse-cli export-csv --output aisle-a.csv --filter-location "Aisle-A"`
3. Open CSV in Excel/Google Sheets

**Success**: CSV file with all columns, proper escaping

**CSV output specification:**
- Encoding: UTF-8 with BOM (for Excel compatibility)
- Column order: id, sku, name, description, quantity, min_stock_level, location, created_at, updated_at
- Header row: Required, first row contains column names
- Escaping rules per RFC 4180:
  - Fields containing commas: wrapped in double quotes (`"value, with comma"`)
  - Fields containing quotes: quotes doubled (`"value with ""quotes"""`)
  - Fields containing newlines: wrapped in double quotes

**Test cases for CSV escaping:**
| Field Value | Expected CSV Output |
|-------------|---------------------|
| `Simple` | `Simple` |
| `Has, comma` | `"Has, comma"` |
| `Has "quotes"` | `"Has ""quotes"""` |
| `Line\nbreak` | `"Line\nbreak"` |

**Failure modes**:
- Output path not writable → exit code 1
- File exists → warn, require `--force` to overwrite

---

## UC7: Checking Specific Item

**Actor**: Customer service rep checking availability

**Flow**:
1. Exact SKU lookup: `warehouse-cli search --sku "WH-123" --format json`
2. Parse JSON to check quantity

**Success**: Single item returned as JSON array, or empty array if not found

**Observable distinction between found vs not-found:**
| State | Exit Code | stdout (JSON format) | stdout (table format) |
|-------|-----------|----------------------|----------------------|
| Item exists | 0 | `[{"sku": "WH-123", ...}]` (array with 1 element) | Table with 1 row |
| Item not found | 0 | `{"results": [], "meta": {"criteria": "--sku 'WH-123'", "count": 0}}` | "No items found matching criteria: [--sku 'WH-123']" |

**JSON output field types (search results):**
- `results`: array type, contains 0 or more item objects
- `meta.criteria`: string type, describes the search parameters used
- `meta.count`: number type (integer), number of items found
- Each item object has fields: `sku` (string), `name` (string), `quantity` (number), `location` (string), `min_stock_level` (number), `created_at` (string, ISO 8601), `updated_at` (string, ISO 8601)

**JSON empty result format:** When no items match, JSON output includes a `meta` field with the search criteria and count, providing the same context as table format. For backward compatibility with scripts expecting bare `[]`, use `--format json-compact` to get the legacy format.

**Test assertions:**
- `jq '.results | length'` returns 1 for found item, 0 for not found
- `jq '.meta.count'` returns the result count
- Legacy: `jq 'length'` with `--format json-compact` for bare array

**Failure modes**:
- Invalid characters in SKU → still search (no validation on search input)

---

## UC8: Updating Item Metadata

**Actor**: Warehouse manager updating product information

**Flow**:
1. Review current item details: `warehouse-cli search --sku "WH-123"`
2. Update item properties: `warehouse-cli update-item --sku "WH-123" --name "Updated Widget Name" --location "Aisle-C" --min-stock 20`
3. Verify changes: `warehouse-cli search --sku "WH-123" --format json`

**Success**: Item metadata updated, confirmation message displayed

**Success criteria observable behavior:**
- stdout displays: `Updated item: SKU '{sku}' ({name})`
- Exit code: 0
- Database state verification: `SELECT name, location, min_stock_level FROM products WHERE sku = '{sku}'` returns updated values

**Update options:**
- `--name NAME`: Update product name (1-255 chars, non-empty)
- `--description DESC`: Update description (max 4096 chars, use `--description ""` to clear)
- `--location LOC`: Update warehouse location (max 100 chars, use `--location ""` to clear)
- `--min-stock LEVEL`: Update minimum stock level (0 to 999999999)

**Validation:** At least one update option must be provided. The SKU field is immutable and cannot be changed.

**Reference:** For complete command specification including input constraints and error handling, see `systems/cli/interface.md` update-item section.

**Failure modes**:
- SKU not found → exit code 3, error message: "Error: SKU 'WH-123' not found."
- No update options provided → exit code 1, error message: "Error: At least one update option required (--name, --description, --location, or --min-stock)."
- Invalid input (e.g., name too long) → exit code 1 with specific validation error
- Database error → exit code 2

---

## UC9: Deleting or Discontinuing Items

**Actor**: Warehouse manager removing discontinued products from inventory

**Flow**:
1. Verify item exists and check current stock: `warehouse-cli search --sku "WH-123"`
2. Confirm item should be removed (check for pending orders, etc.)
3. Delete item: `warehouse-cli delete-item --sku "WH-123"`
4. For bulk discontinuation, use shell scripting pattern (similar to batch import)

**Success**: Item removed from database, confirmation message displayed

**Success criteria observable behavior:**
- stdout displays: `Deleted item: SKU '{sku}' ({name})`
- Exit code: 0
- Database state verification: `SELECT * FROM products WHERE sku = '{sku}'` returns no rows

**Soft delete option:**
For audit compliance, use `--soft-delete` flag to mark items as inactive rather than removing:
- `warehouse-cli delete-item --sku "WH-123" --soft-delete`
- stdout displays: `Marked as discontinued: SKU '{sku}' ({name})`
- Item remains in database with `status = 'discontinued'` and `discontinued_at` timestamp
- **Note**: The database schema columns `status` and `discontinued_at` are defined in `systems/database/schema.md` and MUST be present in the `products` table schema in `technical.md`. See the complete schema definition below:
  - `status` (TEXT): NOT NULL, DEFAULT 'active', CHECK(status IN ('active', 'discontinued'))
  - `discontinued_at` (TEXT): Nullable, ISO 8601 timestamp, CHECK(discontinued_at IS NULL OR (status = 'discontinued' AND datetime(discontinued_at) IS NOT NULL))
  - Index: `idx_products_status` on `status` column for efficient filtering
- Queries should filter out discontinued items by default unless `--include-discontinued` flag is specified.

**Confirmation requirement:**
By default, delete requires confirmation. Use `--force` to skip confirmation (for scripted operations):
- Interactive: `warehouse-cli delete-item --sku "WH-123"` prompts "Delete WH-123 (Widget A)? [y/N]"
- Non-interactive: `warehouse-cli delete-item --sku "WH-123" --force` deletes without prompt

**Failure modes**:
- SKU not found → exit code 3, error message: "Error: SKU 'WH-123' not found."
- Item has non-zero quantity without --force → exit code 1, error message: "Error: Cannot delete item with quantity > 0. Current quantity: 50. Use --force to override."
- Database error → exit code 2

---

## UC10: Database Backup and Restore

**Actor**: IT administrator performing routine maintenance or disaster recovery

**Note**: For comprehensive backup and restore procedures, including automated backup scheduling, off-site storage recommendations, and disaster recovery runbooks, see the **Disaster Recovery** section in `ARCHITECTURE-simple.md`.

This use case provides a quick reference for common backup operations.

**Flow - Manual Backup**:
1. Stop any running CLI operations (or ensure no writes in progress)
2. Copy database file: `cp /data/inventory.db /backups/inventory-$(date +%Y%m%d).db`
3. Verify backup integrity: `sqlite3 /backups/inventory-*.db "PRAGMA integrity_check;"`

**Flow - Restore from Backup**:
1. Stop all CLI operations
2. Verify backup integrity: `sqlite3 /backups/inventory-YYYYMMDD.db "PRAGMA integrity_check;"`
3. Replace current database: `cp /backups/inventory-YYYYMMDD.db /data/inventory.db`
4. Verify restore: `warehouse-cli search --name "" --db /data/inventory.db`

**Success**: Database backed up or restored with verified integrity

**See also**: `ARCHITECTURE-simple.md` - Disaster Recovery section for:
- Automated backup cron schedules
- Backup retention policies
- Point-in-time recovery procedures
- Off-site backup recommendations
