# Fixes Applied to app4/docs/systems/errors.md

## Changes Made

### Issue ID 10: Database Connection Error Handling Unspecified
**What Changed**: Added comprehensive "Database Connection Error Handling" section specifying how to handle SQLite connection failures, PRAGMA failures, SQLITE_BUSY handling, and database corruption detection.

**Content Added/Modified**:
```markdown
## Database Connection Error Handling

### Connection Failure Modes

The `get_connection()` context manager (schema.md line 578-596) must handle specific SQLite connection failures and map them to appropriate user-facing errors:

- Complete code example showing exception handling in get_connection()
- Catches sqlite3.OperationalError with specific error message pattern matching
- Catches PermissionError for file system access issues
- Catches sqlite3.DatabaseError for corruption
- Proper exception chaining with 'from e'
- Basename-only paths in error messages (consistent with S4 in ARCHITECTURE-simple.md)

### Exception Type Mapping

Added table mapping 8 specific SQLite exception types to user-facing error messages:
- sqlite3.OperationalError variants (file not found, disk I/O, locked, malformed)
- sqlite3.DatabaseError (corruption)
- PermissionError (file access)
- PRAGMA execution failures
- Generic fallback for other operational errors

### SQLITE_BUSY Handling

Specified behavior with busy_timeout PRAGMA:
- SQLite automatically retries for up to 5 seconds
- After timeout: "Database is locked by another process. Retry in a moment."
- Exit code: 2
- No manual retry logic needed due to PRAGMA busy_timeout

### Database Corruption Detection

Specified two corruption scenarios:
1. During connection: "database disk image is malformed"
2. During operation: sqlite3.DatabaseError
- Both map to: "Database '{filename}' is corrupted. Restore from backup."
- Explicit note: No automatic repair attempts (catastrophic failure requiring manual intervention)
```

---

## Summary
- Issues fixed: 1
- Sections added: 1 (Database Connection Error Handling with 4 subsections)
- Sections modified: 0

The documentation now provides complete specifications for:
- Specific exception types from sqlite3.connect() and PRAGMA statements
- Error message mapping for each failure mode
- SQLITE_BUSY handling after timeout expires
- Database corruption detection for both connection and runtime scenarios
- Exception type hierarchy showing which Python exceptions to catch
