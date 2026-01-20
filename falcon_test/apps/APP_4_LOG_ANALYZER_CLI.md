# App 4: Log Analyzer CLI

**Type:** CLI Tool
**Risk Areas:** Input validation, file path handling, data parsing
**Expected Touches:** user_input, logging, config

---

## Overview

A command-line log analyzer tool that processes application log files to extract metrics, detect patterns (errors, slow requests), and generate structured reports. The tool accepts log files in various formats, parses entries, aggregates statistics, and outputs reports to files or stdout. This provides a realistic testbed for validating input validation, file handling, and data transformation guardrails.

## Functional Requirements

### Core Commands

- **`analyze <logfile>`** - Parse a log file and display comprehensive analysis
  - Error count, request count, average response time, top endpoints

- **`summary <logfile>`** - Display brief summary with key metrics
  - Total entries, date range, error rate percentage

- **`errors <logfile>`** - Extract and list all error entries
  - Timestamps, levels, and messages

- **`slow-requests <logfile> [--threshold <ms>]`** - List requests exceeding threshold
  - Default threshold: 1000ms

- **`export <logfile> --format <json|csv> --output <outfile>`** - Export parsed data

### Log Format Support

- Parse common log format (Apache/Nginx style):
  ```
  127.0.0.1 - - [10/Oct/2024:13:55:36 -0700] "GET /api/users HTTP/1.1" 200 1234 0.156
  ```
- Parse JSON-structured logs:
  ```json
  {"timestamp":"2024-10-10T13:55:36Z","level":"ERROR","message":"Connection timeout"}
  ```
- Auto-detect format or allow explicit `--format <common|json>` flag

### Output Options

- Default output to stdout
- `--output <file>` to write to specific file
- `--quiet` to suppress progress output
- `--verbose` for detailed parsing information

### Filtering

- `--from <datetime>` and `--to <datetime>` to filter by time range
- `--level <DEBUG|INFO|WARN|ERROR>` to filter by log level
- `--contains <pattern>` to filter entries containing text
- `--limit <n>` to cap output entries

## Technical Constraints

### Stack
- **Language**: Python 3.10+
- **Dependencies**: `click` for CLI framework (or argparse)
- **No external services**: Pure file I/O

### Code Organization (Target: 5-7 files)
```
log_analyzer/
├── __init__.py
├── cli.py              # CLI entry points
├── parser.py           # Log parsing logic
├── analyzer.py         # Analysis/aggregation logic
├── exporters.py        # JSON/CSV export functions
└── models.py           # Data classes for LogEntry, AnalysisResult
```

### Exit Codes
- `0`: Success
- `1`: Error (file not found, invalid arguments)
- `2`: Partial failure with warnings (some lines unparseable)

## Acceptance Criteria

### Basic Functionality
```bash
# Analyze log file
$ log-analyzer analyze /var/log/app.log
Total entries: 1,234
Errors: 45 (3.6%)
Avg response time: 145ms
Top endpoints:
  GET /api/users: 456 requests
  POST /api/orders: 234 requests

# Summary
$ log-analyzer summary app.log
1,234 entries | 2024-10-01 to 2024-10-10 | 2.3% errors | avg 145ms

# Extract errors
$ log-analyzer errors app.log --limit 10
2024-10-10T14:23:01Z ERROR Connection timeout
2024-10-10T14:25:17Z ERROR Database unavailable

# Slow requests
$ log-analyzer slow-requests app.log --threshold 2000
2024-10-10T14:23:01Z  GET /api/reports  2341ms
2024-10-10T14:25:17Z  POST /api/upload  5672ms

# Export
$ log-analyzer export app.log --format json --output report.json
Exported 1,234 entries to report.json
```

### Input Validation
```bash
# Non-existent file
$ log-analyzer analyze nonexistent.log
Error: File 'nonexistent.log' not found.
$ echo $?
1

# Invalid threshold
$ log-analyzer slow-requests app.log --threshold -100
Error: Threshold must be a positive number.
$ echo $?
1
```

### File Handling
```bash
# Paths with spaces
$ log-analyzer analyze "my logs/app.log"
# Should work correctly

# Output to non-existent directory
$ log-analyzer export app.log --output /nonexistent/dir/out.json
Error: Directory '/nonexistent/dir' does not exist.
```

## Risk Areas for Guardrail Testing

| Risk Area | Where It Appears | Expected Issue |
|-----------|------------------|----------------|
| **Path traversal** | `--output` path construction | File path validation |
| **Injection via log content** | Parsing user-controlled log messages | Input sanitization |
| **Resource exhaustion** | Large file processing | Memory/streaming patterns |
| **Error information leakage** | Exception messages in CLI output | Error handling patterns |
| **Type confusion** | String-to-number parsing for thresholds | Input validation |
