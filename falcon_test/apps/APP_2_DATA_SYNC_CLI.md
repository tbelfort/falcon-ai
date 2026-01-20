# App 2: Data Sync CLI

**Type:** CLI Tool
**Risk Areas:** PII logging, retry logic, error handling, data validation
**Expected Touches:** network, logging, database, user_input

---

## Overview

A command-line data synchronization tool that reads records from a JSON source file (simulating an external API), validates and transforms the data, and persists it to a local SQLite database. The tool provides commands for syncing data, checking sync status, retrying failed records, and exporting data. This CLI is designed to exercise common failure modes including network retry logic, PII-safe logging, error recovery, and data validation.

## Functional Requirements

### Core Commands

- **`sync`** - Fetch records from source JSON, validate, transform, and insert/update into SQLite
  - Accept `--source` flag to specify input JSON file path
  - Accept `--db` flag to specify SQLite database path (default: `./falcon_sync.db`)
  - Accept `--batch-size` flag to control records processed per batch (default: 100)
  - Accept `--dry-run` flag to validate without writing to database

- **`status`** - Display current sync state and statistics
  - Show total records, successful syncs, failed syncs, pending retries
  - Accept `--format` flag (`table`, `json`) for output format

- **`retry-failed`** - Attempt to re-process previously failed records
  - Accept `--max-retries` flag to limit retry attempts per record (default: 3)

- **`export`** - Export synced data to a file
  - Accept `--output` flag to specify output file path (required)
  - Accept `--format` flag (`json`, `csv`) for export format
  - Accept `--filter` flag to export only records matching status (`success`, `failed`, `all`)

### Data Model

Source JSON records must contain:
```json
{
  "id": "string (required, unique)",
  "email": "string (required, valid email format)",
  "name": "string (required)",
  "phone": "string (optional)",
  "metadata": "object (optional)",
  "created_at": "ISO8601 timestamp (required)"
}
```

### Validation Rules

- `id` must be non-empty string
- `email` must match valid email regex pattern
- `name` must be 1-200 characters
- `phone` if present, must match E.164 format or be null
- `created_at` must be valid ISO8601 timestamp not in the future

### Logging Requirements (CRITICAL)

- **PII Protection**:
  - NEVER log raw email, phone, or name values
  - Log masked versions: `j***@example.com`, `***-***-1234`
  - Log record IDs for traceability
  - Error messages must not contain PII

## Technical Constraints

### Stack
- **Language**: Python 3.10+
- **Database**: SQLite3 (standard library)
- **CLI Framework**: `argparse` (standard library)
- **No external runtime dependencies**

### Code Organization (Target: 5-7 files)
```
falcon_sync/
├── __init__.py
├── cli.py           # Entry point and argument parsing
├── sync.py          # Core sync logic with retry handling
├── database.py      # SQLite operations and schema
├── validators.py    # Data validation functions
├── transformers.py  # Data transformation and PII masking
└── logger.py        # Logging configuration with PII filtering
```

## Acceptance Criteria

### Basic Sync
```bash
$ falcon-sync sync --source ./test_data/valid_records.json --db ./test.db
Synced 100 records (98 success, 2 failed)
$ echo $?
0
```

### PII Never in Logs
```bash
$ falcon-sync sync --source ./data.json --db ./test.db 2>&1 | grep -E "@|phone"
# Should return NO matches - emails and phones must be masked
```

### Status Command
```bash
$ falcon-sync status --db ./test.db --format json
{"total": 100, "success": 98, "failed": 2, "pending": 0}
```

### Dry Run
```bash
$ falcon-sync sync --source ./data.json --db ./test.db --dry-run
DRY RUN: Would sync 100 records
# Database unchanged
```

### Export
```bash
$ falcon-sync export --db ./test.db --output ./export.json --filter success
Exported 98 records to ./export.json
```

## Risk Areas for Guardrail Testing

| Risk Area | Implementation Point | Potential Issue |
|-----------|---------------------|-----------------|
| **PII Logging** | `logger.py`, all modules | Raw PII in log messages |
| **Error Messages** | `validators.py`, `sync.py` | PII in exception messages |
| **Retry Logic** | `sync.py` | Infinite loops, missing backoff |
| **Transaction Safety** | `database.py` | Partial writes on failure |
| **Input Validation** | `validators.py` | SQL injection, path traversal |
| **Resource Cleanup** | `database.py`, `cli.py` | Unclosed connections/files |
