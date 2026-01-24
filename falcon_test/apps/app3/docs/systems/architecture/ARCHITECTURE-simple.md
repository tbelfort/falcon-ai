# Architecture: Note-taking/Wiki CLI

**Status:** [FINAL]

---

## System Overview

```
+---------------------------------------------------------+
|                    USER (Terminal)                       |
+--------------------------+------------------------------+
                           | CLI arguments
                           v
+---------------------------------------------------------+
|                      cli.py                              |
|  - Parse arguments (argparse)                           |
|  - Validate input at boundary                           |
|  - Route to command handlers                            |
|  - Map exceptions to exit codes                         |
+--------------------------+------------------------------+
                           | Validated parameters
                           v
+---------------------------------------------------------+
|                    commands.py                           |
|  - Business logic per command                           |
|  - Coordinate database + filesystem                     |
|  - Enforce business rules                               |
+---------------+---------------------+-------------------+
                |                     |
                v                     v
+--------------------------+  +---------------------------+
|      database.py         |  |      Filesystem           |
|  - SQL queries           |  |  - Read/write .md files   |
|  - Transactions          |  |  - Vault directory        |
|  - Connection mgmt       |  |  - Backup archives        |
+---------------+----------+  +---------------------------+
                |                     |
                v                     v
+--------------------------+  +---------------------------+
|    SQLite (file)         |  |     Vault Directory       |
|    .notes.db             |  |     *.md files            |
+--------------------------+  +---------------------------+
```

---

## Layer Rules

### CLI Layer (`cli.py`)

**MUST:**
- Parse all arguments using `argparse`
- Validate all user input before passing to commands
- Catch `NotesError` subclasses and convert to exit codes
- Print user-facing messages to stdout/stderr

**MUST NOT:**
- Access database directly
- Import `sqlite3`
- Contain business logic
- Format complex output (delegate to formatters)

### Command Layer (`commands.py`)

**MUST:**
- Implement one function per CLI command
- Accept validated, typed parameters
- Return data (not formatted strings)
- Raise specific exception types for errors
- Coordinate filesystem and database operations

**MUST NOT:**
- Parse CLI arguments
- Print to stdout/stderr
- Handle exit codes
- Catch exceptions (let them propagate)

### Database Layer (`database.py`)

**MUST:**
- Use parameterized queries exclusively (`?` placeholders)
- Use context managers for connections
- Use transactions for multi-statement operations
- Return model objects (not raw tuples)

**MUST NOT:**
- Validate business rules
- Format output
- Use string interpolation in queries (SECURITY CRITICAL)

### Formatter Layer (`formatters.py`)

**MUST:**
- Accept model objects as input
- Return strings for display
- Handle edge cases (empty lists, None values)

**MUST NOT:**
- Access database
- Make business decisions

---

## Data Flow Examples

### New Note

```
User: notes-cli new "My Note"
                            |
cli.py: parse args          |
cli.py: validate_title("My Note")    -> OK
cli.py: validate_vault_path(vault)   -> OK
                            |
commands.py: cmd_new(vault, "My Note")
commands.py: sanitize_title_to_filename("My Note") -> "my-note.md"
commands.py: check title doesn't exist -> DuplicateNoteError if yes
commands.py: create file vault/my-note.md with template
commands.py: open $EDITOR for editing
commands.py: on save, parse links from content
commands.py: call database.insert_note()
commands.py: call database.save_links()
                            |
database.py: INSERT INTO notes (...) VALUES (?, ?, ?, ?)
database.py: INSERT INTO links (...) VALUES (?, ?, ?)
                            |
cli.py: print "Created: my-note.md"
cli.py: exit(0)
```

### Search (with injection attempt)

```
User: notes-cli search "'; DROP TABLE notes;--"
                            |
cli.py: parse args          |
cli.py: validates search query length   -> OK (length check only)
                            |
commands.py: cmd_search(vault, "'; DROP TABLE notes;--")
                            |
database.py: SELECT ... FROM notes_fts WHERE notes_fts MATCH ?
             param: ("'; DROP TABLE notes;--",)
             -> SQLite treats as literal search string
             -> Returns empty result (no injection)
                            |
cli.py: print empty results table
cli.py: exit(0)
```

---

## Critical Security Rules

### S1: Parameterized Queries Only

```python
# CORRECT
cursor.execute("SELECT * FROM notes WHERE title = ?", (title,))

# WRONG - SQL INJECTION VULNERABILITY
cursor.execute(f"SELECT * FROM notes WHERE title = '{title}'")
```

**Enforcement:** Code review. Any string interpolation in SQL is a blocking issue.

### S2: Path Validation

For `--vault` and `--output` arguments:
- Must not contain `..` (path traversal)
- Must be absolute path or relative to cwd
- Must be writable by current user

```python
def validate_vault_path(path: str, base_dir: str) -> str:
    """Validate path is within allowed directory.

    Args:
        path: User-provided path to validate
        base_dir: Required base directory for containment check.
                  For --vault: user's home directory or explicit --vault value.
                  For --output: current working directory.

    Returns: Resolved absolute path
    Raises: ValidationError if path escapes base directory
    """
    # Resolve to absolute path, following symlinks
    resolved = os.path.realpath(os.path.abspath(path))
    base_resolved = os.path.realpath(os.path.abspath(base_dir))

    # Ensure resolved path is within base directory (containment check)
    if not resolved.startswith(base_resolved + os.sep) and resolved != base_resolved:
        raise ValidationError("Path must be within allowed directory")

    return resolved
```

**Path Validation Rules:**
- `validate_vault_path()` MUST take `base_dir` as a required parameter (not optional)
- Use `os.path.realpath()` to resolve symlinks before validation
- Containment check: resolved path must start with resolved base_dir
- For `--vault`: base is user's home directory or explicit `--vault` value
- For `--output`: base is current working directory

**Security Note (TOCTOU Limitation):**
The path validation above has a time-of-check-time-of-use (TOCTOU) race condition: a symlink could be modified between validation and file access. For this CLI tool with single-user local operation, this is an acceptable risk. For security-critical file operations (e.g., writing to sensitive locations), consider using `O_NOFOLLOW` flag with `os.open()` to prevent symlink following at open time, or use `os.fstat()` after opening to verify the file descriptor matches expectations.

### S3: Filename Sanitization

Note titles are used to create filenames. Sanitization rules:
- Convert to lowercase
- Replace spaces with hyphens
- Remove path separators (`/`, `\`)
- Remove special characters (`:`, `*`, `?`, `"`, `<`, `>`, `|`)
- Remove control characters
- Limit length to 100 characters

```python
def sanitize_title_to_filename(title: str) -> str:
    # Lowercase, replace spaces with hyphens
    safe = title.lower().replace(" ", "-")
    # Remove anything not alphanumeric or hyphen
    safe = re.sub(r'[^a-z0-9-]', '', safe)
    # Collapse multiple hyphens
    safe = re.sub(r'-+', '-', safe)
    # Remove leading/trailing hyphens
    safe = safe.strip('-')
    # Limit length
    safe = safe[:100]
    return safe + ".md"
```

**Filename Collision Note:**
Because sanitization is lossy (e.g., "My Note!" and "My Note?" both become "my-note.md"), both the note title AND the sanitized filename must be unique. When creating a note:
1. Check if title already exists in database -> `DuplicateNoteError` ("Note 'X' already exists")
2. Check if sanitized filename already exists -> `DuplicateNoteError` ("A note with filename 'x.md' already exists")

The database schema enforces UNIQUE constraints on both `title` and `filename` columns.

### S4: Error Message Sanitization

Error messages to users must NOT include:
- Full file system paths (use basename only)
- SQL query text
- Stack traces (unless --verbose)
- Database internal errors

```python
# CORRECT
"Error: Note not found"

# WRONG - exposes internal path
"Error: FileNotFoundError: /home/user/secret/notes/file.md"
```

**Verbose mode exception:** When `--verbose` is set, S4 restrictions are relaxed for debugging:
- Full file paths may be shown
- Stack traces are printed
- Internal error details are included

However, even in verbose mode:
- SQL query text is NOT shown (parameter values could contain sensitive data)
- Credentials/secrets are NEVER shown

---

## File Locations

| File | Purpose |
|------|---------|
| `notes_cli/__init__.py` | Package marker, `__version__` |
| `notes_cli/__main__.py` | Entry: `python -m notes_cli` |
| `notes_cli/cli.py` | Argument parsing, routing |
| `notes_cli/commands.py` | Command business logic |
| `notes_cli/database.py` | SQL operations |
| `notes_cli/models.py` | Data classes, validation |
| `notes_cli/formatters.py` | Output formatting |
| `notes_cli/exceptions.py` | Exception hierarchy |
| `notes_cli/link_parser.py` | Wiki link parsing |

---

## Entry Points

### As Module
```bash
python -m notes_cli [command] [args]
```

### As Script (if installed)
```bash
notes-cli [command] [args]
```

Both invoke `cli.main()`.

---

## Vault Structure

After `notes-cli init --vault ~/notes`:

```
~/notes/
+-- .notes.db          # SQLite database (metadata, links, FTS index)
+-- my-first-note.md   # Note files (human-readable markdown)
+-- another-note.md
+-- project-ideas.md
+-- ...
```

Notes are stored as standard markdown files, readable by any editor or markdown viewer.
