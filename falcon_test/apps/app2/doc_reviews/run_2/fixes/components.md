# Fixes Applied to components.md

## Changes Made

### Issue ID 39: Missing CSV Import Auto-Creation Specification
**What Changed**: Removed auto-creation behavior from cmd_import_csv() specification. Changed validation phase to fail immediately with ValidationError when account or category is not found, making it consistent with interface.md's error-on-missing-entity behavior.

**Content Added/Modified**:
```
- `cmd_import_csv(db_path: str, input_path: str) -> int`
  # Two-phase import process:
  # Phase 1 - Validation: Load and parse all CSV rows into memory, validate all fields,
  #   resolve all account/category references. If any account or category name is not found
  #   in the database, validation MUST fail immediately with a ValidationError including
  #   the row number. For MVP, in-memory validation is acceptable for typical personal
  #   finance CSV files (<10k rows). If validation fails for any row, abort before
  #   database insert phase.
  # Phase 2 - Insert: Wrap all inserts in a single database transaction. Insert all
  #   transactions. If any insert fails, the entire transaction is rolled back
  #   (per AD6 in technical.md).
  # Memory handling: For MVP, load entire CSV into memory. Typical personal finance CSVs
  #   are small (<10k rows). Large file handling (streaming) is out of scope for MVP.
```

**Removed**: All text about "creating in-memory Account and Category objects for missing entities", inserting missing accounts/categories first, and duplicate resolution logic.

### Issue ID 44: Critical Security Conflict - Path Validation Implementation Location
**What Changed**: Added safe_open_file() function specification to models.py's public interface, immediately following validate_path() function.

**Content Added/Modified**:
```python
def safe_open_file(path: str, mode: str, flags: int = None) -> int:
    """Atomically open a file with security checks.

    Args:
        path: Validated file path (must be already validated via validate_path)
        mode: File open mode ('r', 'w', etc.)
        flags: Optional os.open() flags (e.g., os.O_CREAT | os.O_EXCL)

    Returns:
        File descriptor (int)

    Raises:
        ValidationError: If file access fails security checks
        OSError: If file operation fails

    Security guarantees:
    - Uses os.open() with appropriate flags for atomic operations
    - For reads: Uses O_NOFOLLOW to prevent symlink attacks
    - For writes: Supports O_CREAT | O_EXCL for atomic creation
    - Combines with validate_path() to prevent TOCTOU race conditions

    Usage example:
        validated_path = validate_path(user_input)
        fd = safe_open_file(validated_path, 'r', os.O_RDONLY | os.O_NOFOLLOW)
        file_obj = os.fdopen(fd, 'r')
    """
```

### Issue ID 46: Foreign Key Enforcement Documentation Inconsistency
**What Changed**: Clarified init_database() specification with explicit implementation sequence for atomic file creation with correct permissions, addressing SQLite API constraints.

**Content Added/Modified**:
```
- `init_database(path: str) -> None` -- Creates database file and runs schema creation. Idempotent. MUST use atomic file creation to prevent TOCTOU attacks. MUST set file permissions to 0600 (owner read/write only) immediately after creation. **Implementation sequence**: (1) Create parent directory if needed, (2) Use os.open() with O_CREAT|O_EXCL and mode 0o600 to atomically create an empty file with correct permissions, (3) Close that file descriptor, (4) Call sqlite3.connect() which will open the existing file. This sequence satisfies SQLite API constraints while enforcing secure permissions from creation. **CRITICAL**: MUST use get_connection() internally to obtain a database connection (which automatically enables PRAGMA foreign_keys = ON as required by schema.md). All schema DDL operations must be executed through this connection to ensure foreign key constraints are enforced during table creation.
```

**Added**: Detailed 4-step implementation sequence that explains exactly how to create the file with 0600 permissions atomically before SQLite opens it.

## Summary
- Issues fixed: 3
- Sections added: 1 (safe_open_file function specification)
- Sections modified: 2 (cmd_import_csv specification, init_database specification)
