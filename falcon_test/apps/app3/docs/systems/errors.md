# Error Handling: Note-taking/Wiki CLI

**Status:** [FINAL]

---

## Exit Codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | SUCCESS | Operation completed successfully |
| 1 | GENERAL_ERROR | Invalid arguments, validation failure, general errors |
| 2 | DATABASE_ERROR | Database connection failed, query failed, file issues |
| 3 | NOT_FOUND | Requested note does not exist |
| 4 | DUPLICATE | Note with this title already exists |
| 5 | VAULT_ERROR | Vault directory issues |

---

## Exception Hierarchy

```python
class NotesError(Exception):
    """Base exception for all notes CLI errors."""
    exit_code: int = 1

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class ValidationError(NotesError):
    """Invalid input data.

    Examples:
    - Empty title
    - Title too long
    - Title contains invalid characters
    - Invalid tag name
    - Path contains '..'
    """
    exit_code = 1


class DatabaseError(NotesError):
    """Database operation failed.

    Examples:
    - Cannot connect to database
    - Query execution failed
    - Cannot create database file
    - Constraint violation (generic)
    """
    exit_code = 2


class NoteNotFoundError(NotesError):
    """Requested note does not exist.

    Examples:
    - Title not found in show/edit
    - Note not found for tag operations
    """
    exit_code = 3


class DuplicateNoteError(NotesError):
    """Note with this title already exists.

    Examples:
    - Title collision in 'new' command
    """
    exit_code = 4


class VaultError(NotesError):
    """Vault directory issues.

    Examples:
    - Vault does not exist
    - Cannot create vault directory
    - Vault already exists (without --force)
    - Database file missing in vault
    """
    exit_code = 5
```

---

## Error Message Templates

### Validation Errors (Exit 1)

```
Error: Title cannot be empty.
Error: Title must be 200 characters or fewer. Got: 250
Error: Title contains invalid characters: /
Error: Tag name must contain only alphanumeric characters, hyphens, and underscores, and must start and end with an alphanumeric character.
Error: Tag name must be 50 characters or fewer. Got: 75
Error: Search query cannot be empty.
Error: Search query must be 500 characters or fewer.
Error: Path cannot contain '..'.
Error: File 'output.md' already exists. Use --force to overwrite.
Error: No tags specified. Use --tags TAG1,TAG2
Error: No editor found. Set $EDITOR environment variable.
```

### Database Errors (Exit 2)

```
Error: Cannot open database. Run with --verbose for details.
Error: Database operation failed.
Error: Cannot create database file.
```

### Not Found Errors (Exit 3)

```
Error: Note 'My Note' not found.
Error: Tag 'deprecated' not found on note.
```

### Duplicate Errors (Exit 4)

```
Error: Note 'My Note' already exists.
```

### Vault Errors (Exit 5)

```
Error: Vault does not exist at /path. Run 'notes-cli init' first.
Error: Cannot create vault directory: Permission denied.
Error: Vault already exists at /path. Use --force to reinitialize.
Error: Database not found in vault. Run 'notes-cli init --force' to recreate.
```

**Note:** Use basename only (`output.md`), not full path. See S4 in ARCHITECTURE-simple.md.

---

## Error Handling Rules

### Rule 1: Catch at CLI Layer

Exceptions bubble up from command/database layers. The CLI layer catches them and:
1. Prints user-friendly message to stderr
2. Exits with appropriate code

```python
# cli.py
def main():
    try:
        # parse args and dispatch to command
        result = dispatch_command(args)
        # print result
        sys.exit(0)
    except NotesError as e:
        print(f"Error: {e.message}", file=sys.stderr)
        sys.exit(e.exit_code)
    except Exception as e:
        if args.verbose:
            traceback.print_exc()
        print("Error: An unexpected error occurred.", file=sys.stderr)
        sys.exit(1)
```

### Rule 2: Never Expose Internals

User-facing error messages must NOT include:
- Full file system paths (use basename only)
- SQL query text
- Stack traces (unless --verbose)
- Internal exception types
- Database schema details

**Bad:**
```
Error: sqlite3.IntegrityError: UNIQUE constraint failed: notes.title
```

**Good:**
```
Error: Note 'My Note' already exists.
```

### Rule 3: Be Specific

When multiple validation errors could apply, report the first one found:

```python
def validate_title(title: str) -> str:
    if not title:
        raise ValidationError("Title cannot be empty.")
    if len(title) > 200:
        raise ValidationError(f"Title must be 200 characters or fewer. Got: {len(title)}")
    invalid_chars = set(title) & set('/\\:*?"<>|')
    if invalid_chars:
        raise ValidationError(f"Title contains invalid characters: {', '.join(invalid_chars)}")
    return title
```

### Rule 4: Distinguish Error Types

Use the specific exception type that matches the error:

| Situation | Exception |
|-----------|-----------|
| Bad user input | `ValidationError` |
| SQLite can't connect | `DatabaseError` |
| Note not in database | `NoteNotFoundError` |
| Title already in database | `DuplicateNoteError` |
| Vault doesn't exist | `VaultError` |
| File permission issue | `ValidationError` (if path) or `VaultError` (if vault) |

### Rule 5: Preserve Original Exceptions

When catching and re-raising, preserve the original exception for debugging:

```python
try:
    cursor.execute(query, params)
except sqlite3.IntegrityError as e:
    if "UNIQUE constraint" in str(e):
        raise DuplicateNoteError(f"Note '{title}' already exists.") from e
    raise DatabaseError("Database constraint violation.") from e
```

---

## Verbose Mode

When `--verbose` is set:
1. Print debug information during execution
2. On error, print full stack trace
3. Include full file paths in error messages

**Verbose mode SHOWS:**
- Database file path: `DEBUG: Database path: /home/user/notes/.notes.db`
- Operation names: `DEBUG: Executing cmd_search()`
- File I/O operations: `DEBUG: Reading file: /home/user/notes/my-note.md`
- FTS index updates: `DEBUG: Updating FTS index for 'My Note'`
- Sync progress: `DEBUG: Found 15 .md files in vault`

**Verbose mode does NOT expose:**
- SQL query text (parameter values could contain sensitive data)
- Credentials or secrets

```python
if args.verbose:
    print(f"DEBUG: Database path: {db_path}", file=sys.stderr)
    print(f"DEBUG: Executing cmd_search()", file=sys.stderr)
    print(f"DEBUG: Reading file: {file_path}", file=sys.stderr)
    # Don't log: query text, parameter values
```

---

## Testing Error Conditions

Each error path should have a test:

```python
def test_new_note_empty_title():
    result = run_cli("new", "")
    assert result.exit_code == 1
    assert "Title cannot be empty" in result.stderr

def test_new_note_duplicate():
    run_cli("new", "My Note")
    result = run_cli("new", "My Note")
    assert result.exit_code == 4
    assert "already exists" in result.stderr

def test_show_note_not_found():
    result = run_cli("show", "Nonexistent")
    assert result.exit_code == 3
    assert "not found" in result.stderr

def test_init_vault_exists():
    run_cli("init", "--vault", "/tmp/test_vault")
    result = run_cli("init", "--vault", "/tmp/test_vault")
    assert result.exit_code == 5  # VaultError
    assert "already exists" in result.stderr

def test_export_path_traversal():
    result = run_cli("export", "My Note", "--output", "../../../etc/passwd")
    assert result.exit_code == 1
    assert "cannot contain '..'" in result.stderr.lower()
```
