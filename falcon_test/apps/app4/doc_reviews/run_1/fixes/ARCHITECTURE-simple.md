# Fixes Applied to app4/docs/systems/architecture/ARCHITECTURE-simple.md

## Changes Made

### Issue ID 16: Symlink TOCTOU Prevention Implementation Incomplete
**What Changed**: Added comprehensive implementation details for TOCTOU prevention, addressing all identified gaps: fd-to-file conversion, permission configuration, temp file cleanup, atomic overwrite pattern, and Windows compatibility.

**Content Added/Modified**:

1. **Enhanced `safe_create_file()` function**:
```python
def safe_create_file(validated_path: str, mode: int = 0o600) -> int:
    """Create file atomically without following symlinks.

    Args:
        validated_path: Already-validated absolute path
        mode: File permissions (default 0o600 for databases, use 0o644 for CSV exports)

    Returns: File descriptor
    Raises: ValidationError if symlink exists at path
    """
```
- Added `mode` parameter to address permission mismatch (0o600 for databases, 0o644 for CSV)
- Documents the need for different permissions for different file types

2. **Added `fd_to_file()` helper function**:
```python
def fd_to_file(fd: int, mode: str = 'w') -> object:
    """Convert file descriptor to file object for use with csv.writer.

    Args:
        fd: File descriptor from safe_create_file()
        mode: File mode ('w' for text, 'wb' for binary)

    Returns: File object (caller must close)

    Note: The returned file object takes ownership of the fd.
    Closing the file object will close the fd.
    """
    return os.fdopen(fd, mode, encoding='utf-8' if 'b' not in mode else None)
```
- Solves the fd-to-file conversion problem for csv.writer
- Documents ownership semantics

3. **Added `safe_atomic_overwrite()` function**:
```python
def safe_atomic_overwrite(target_path: str, write_func, mode: int = 0o644):
    """Atomically overwrite file using temp file + rename.

    Args:
        target_path: Already-validated absolute path to overwrite
        write_func: Callable that accepts file object and writes content
        mode: File permissions for new file (0o644 for CSV, 0o600 for database)

    Raises: ValidationError, OSError on failure

    Implementation:
    1. Create temp file in same directory as target (required for atomic rename)
    2. Write content to temp file
    3. Atomically rename temp over target
    4. Clean up temp on error
    """
```
- Complete implementation with error handling and cleanup
- Uses tempfile.mkstemp() for unique temp file naming
- Includes try/except block with proper cleanup on error
- Documents the rename behavior with symlinks (replaces symlink itself, not target)

4. **Added Windows Compatibility Section**:
```python
# Check platform capability
HAS_O_NOFOLLOW = hasattr(os, 'O_NOFOLLOW') and sys.platform != 'win32'

def safe_create_file(validated_path: str, mode: int = 0o600) -> int:
    """Create file atomically without following symlinks.

    On Windows: Falls back to standard O_CREAT | O_EXCL (no symlink protection)
    On POSIX: Uses O_NOFOLLOW for full TOCTOU prevention

    Windows Limitation: Symlink attacks are still possible on Windows.
    Document this as a known limitation.
    """
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if HAS_O_NOFOLLOW:
        flags |= os.O_NOFOLLOW
    # ...
```
- Conditional O_NOFOLLOW usage based on platform detection
- Graceful degradation on Windows
- Documents known limitation

---

## Summary
- Issues fixed: 1
- Sections added: 2 (Atomic Overwrite Pattern, Windows Compatibility)
- Sections modified: 1 (safe_create_file function)
- New helper functions added: 2 (fd_to_file, safe_atomic_overwrite)

All implementation gaps identified by the judge have been addressed:
- ✓ File descriptor to file object conversion (fd_to_file helper)
- ✓ Permission mismatch resolved (mode parameter with defaults documented)
- ✓ Temp file cleanup on error (try/except in safe_atomic_overwrite)
- ✓ Temp file naming approach (tempfile.mkstemp with .tmp_ prefix)
- ✓ O_NOFOLLOW on rename target (documented behavior: replaces symlink itself)
- ✓ Windows compatibility (platform detection and graceful fallback)
