# Fixes Applied to schema.md

## Changes Made

### Issue ID 42: Ambiguous File Permission Enforcement for Database Files
**What Changed**: Updated the "File Permissions Enforcement" section to explicitly state that permissions are enforced ONLY during database file creation (init command), not on every write operation. Removed contradictory language suggesting permissions are maintained on all write operations.

**Content Added/Modified**:
```markdown
### File Permissions Enforcement

**When enforced:** Automatically on database creation (init command) ONLY. Permissions are NOT enforced on subsequent write operations.

**How enforced:** The application creates database files with secure permissions using the following atomic sequence:
1. Use `os.open()` with flags `O_CREAT|O_EXCL` and mode `0o600` to create the file atomically with correct permissions
2. Close the file descriptor
3. Call `sqlite3.connect()` on the existing file

This ensures:
- New database files created by `init` command have 0600 permissions from creation
- File creation is atomic (fails if file already exists)
- Only the file owner can read or write the database

**User responsibility:** If users manually create database files or modify permissions outside the application, they are responsible for ensuring proper permissions. The application will not check or correct existing file permissions on subsequent opens—it only enforces permissions during initial file creation.
```

### Issue ID 46: Foreign Key Enforcement Documentation Inconsistency
**What Changed**: Added detailed atomic file creation sequence to clarify the exact steps required given SQLite API constraints. The specification now includes the three-step process: (1) create file with os.open() using O_CREAT|O_EXCL and mode 0o600, (2) close file descriptor, (3) connect with sqlite3.connect().

**Content Added/Modified**:
```markdown
**How enforced:** The application creates database files with secure permissions using the following atomic sequence:
1. Use `os.open()` with flags `O_CREAT|O_EXCL` and mode `0o600` to create the file atomically with correct permissions
2. Close the file descriptor
3. Call `sqlite3.connect()` on the existing file
```

## Summary
- Issues fixed: 2
- Sections added: 0
- Sections modified: 1 (File Permissions Enforcement section)

The documentation now clearly states that permission enforcement happens only during initial file creation, resolving the contradiction between schema.md and technical.md. The atomic creation sequence is explicitly documented to guide implementers on the correct approach given SQLite API constraints.
