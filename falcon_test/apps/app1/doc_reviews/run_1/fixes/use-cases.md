# Fixes Applied to use-cases.md

## Changes Made

### Gap ID 56: Missing use case documentation for update-item command
**What Changed**: Added new UC8: Updating Item Metadata with complete specification for the update-item command
**Lines Affected**: Inserted between former UC7 and UC8 (now UC9), approximately line 407
**Content Added/Modified**:
```markdown
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
```

### Gap ID 83: Batch import security script distribution undefined
**What Changed**: Added documentation on how users obtain the secure batch import script
**Lines Affected**: Approximately line 26
**Content Added/Modified**:
```markdown
**How to obtain the script:** The secure batch import script shown below is the reference implementation. Users can copy it from this documentation or find it in the project repository at `examples/batch-import.sh` (if bundled with the package). For teams, save this script to version control and customize validation rules as needed.
```

### Gap ID 84: Missing CSV import error recovery workflow
**What Changed**: Added complete error log format specification and recovery workflow
**Lines Affected**: Approximately line 111-130
**Content Added/Modified**:
```markdown
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
```

### Gap ID 85: Low-stock report email integration not designed
**What Changed**: Added prerequisites comment to script and added comprehensive note about email integration requirements
**Lines Affected**: Approximately line 238-258
**Content Added/Modified**:
```markdown
# Prerequisites: jq, mail command configured with SMTP server

[...existing script...]

**Note on email integration:** This example script uses the `mail` command for notifications. The CLI itself outputs JSON, which can be consumed by any notification system (Slack, PagerDuty, custom webhook, etc.). Email integration requires: (1) `mail` command installed on system, (2) SMTP server configured (e.g., via `/etc/mail.rc` or `sendmail`). For systems without email, replace the `mail` command with your preferred notification method (e.g., `curl` to a webhook endpoint).
```

## Summary
- Gaps addressed: 4
- Sections added: 1 (UC8: Updating Item Metadata)
- Sections modified: 3 (UC1 batch import script distribution and error recovery, UC4 email prerequisites)
- Use cases renumbered: Former UC8 → UC9, Former UC9 → UC10
