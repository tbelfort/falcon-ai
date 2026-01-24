# Architecture: Contact Book CLI

**Status:** Final

---

## System Overview

```
+----------------------------------------------------------+
|                    USER (Terminal)                        |
+-----------------------------+----------------------------+
                              | CLI arguments
                              v
+----------------------------------------------------------+
|                      cli.py                               |
|  - Parse arguments (argparse)                            |
|  - Validate input at boundary                            |
|  - Route to command handlers                             |
|  - Map exceptions to exit codes                          |
+-----------------------------+----------------------------+
                              | Validated parameters
                              v
+----------------------------------------------------------+
|                    commands.py                            |
|  - Business logic per command                            |
|  - Coordinate database + formatters                      |
|  - Enforce business rules                                |
+--------------+---------------------------+---------------+
               |                           |
               v                           v
+--------------------------+  +----------------------------+
|      database.py         |  |      formatters.py         |
|  - SQL queries           |  |  - Table output            |
|  - Transactions          |  |  - JSON output             |
|  - Connection mgmt       |  |  - CSV/vCard export        |
+--------------+-----------+  +----------------------------+
               |
               v
+--------------------------+
|    SQLite (file)         |
|    contacts.db           |
+--------------------------+
```

---

## Layer Rules

### CLI Layer (`cli.py`)

**MUST:**
- Parse all arguments using `argparse`
- Validate all user input before passing to commands
- Catch `ContactBookError` subclasses and convert to exit codes
- Print user-facing messages to stdout/stderr

**MUST NOT:**
- Access database directly
- Import `sqlite3`
- Contain business logic
- Format output (delegate to formatters)

### Command Layer (`commands.py`)

**MUST:**
- Implement one function per CLI command
- Accept validated, typed parameters
- Return data (not formatted strings)
- Raise specific exception types for errors

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
- Return strings (for table/JSON) or write files (for CSV/vCard)
- Handle edge cases (empty lists, None values)

**MUST NOT:**
- Access database
- Make business decisions

---

## Data Flow Examples

### Add Contact

```
User: contact-cli add --name "Jane Smith" --email "jane@example.com"
                            |
cli.py: parse args          |
cli.py: validate_name("Jane Smith")     [check]
cli.py: validate_email("jane@example.com") [check]
                            |
commands.py: cmd_add(db_path, name, email, ...)
commands.py: check email not duplicate
commands.py: create Contact model
commands.py: call database.insert_contact()
                            |
database.py: INSERT INTO contacts (...) VALUES (?, ?, ...)
database.py: return inserted id
                            |
cli.py: print "Contact created: Jane Smith (ID: 1)"
cli.py: exit(0)
```

### Search with SQL Injection Attempt

```
User: contact-cli search --name "'; DROP TABLE--"
                            |
cli.py: parse args          |
cli.py: passes through (search is lenient)
                            |
commands.py: cmd_search(db_path, name="'; DROP TABLE--", ...)
                            |
database.py: SELECT ... WHERE LOWER(name) LIKE LOWER(?)
             param: ("%'; DROP TABLE--%",)
             -> SQLite treats as literal string
             -> Returns empty result (no injection)
                            |
cli.py: print empty table
cli.py: exit(0)
```

---

## Critical Security Rules

### S1: Parameterized Queries Only

```python
# CORRECT
cursor.execute("SELECT * FROM contacts WHERE email = ?", (email,))

# WRONG - SQL INJECTION VULNERABILITY
cursor.execute(f"SELECT * FROM contacts WHERE email = '{email}'")
```

**Enforcement:** Code review. Any string interpolation in SQL is a blocking issue.

### S2: Path Validation

For `--db` and `--output` arguments:
- Must be absolute path or relative to cwd
- Must be writable by current user
- Symlinks must be resolved before containment check
- Path must stay within allowed base directory after resolution

```python
def validate_path(path: str, allowed_base: str | None = None) -> str:
    """Validate path is safe and within allowed directory.

    Args:
        path: Path to validate
        allowed_base: Base directory path must resolve within (default: cwd)

    Validation:
        1. Resolve symlinks with os.path.realpath()
        2. Verify resolved path starts with allowed_base

    Note: The '..' check was removed as it's redundant - realpath() resolves
    parent references, and the containment check catches any escape attempts.
    The broad ".." in path check also incorrectly rejected legitimate filenames
    like "my..file.txt".
    """
    base = os.path.realpath(allowed_base or os.getcwd())
    resolved = os.path.realpath(path)

    if not (resolved.startswith(base + os.sep) or resolved == base):
        raise ValidationError(f"Path must be within {os.path.basename(base)}")

    return resolved
```

### S3: Error Message Sanitization

Error messages to users must NOT include:
- Full file system paths (only basename)
- SQL query text
- Stack traces (unless --verbose)
- Database internal errors

```python
# CORRECT
"Error: Database file not found"

# WRONG - exposes internal path
"Error: sqlite3.OperationalError: unable to open database file: /home/user/secret/path/db.sqlite"
```

**Verbose mode exception:** When `--verbose` is set, S3 restrictions are relaxed for debugging:
- Full file paths may be shown
- Stack traces are printed
- Internal error details are included

However, even in verbose mode:
- SQL query text is NOT shown (parameter values could contain sensitive data)
- Credentials/secrets are NEVER shown

### S4: PII Protection

Personal Identifiable Information must be protected:

- NEVER log email addresses, phone numbers, or notes content
- Error messages use contact IDs, not personal data
- Verbose mode shows operation types, not data values

```python
# CORRECT
"DEBUG: Searching contacts by name"

# WRONG - exposes PII
"DEBUG: Searching for email jane@example.com"
```

### S5: Import File Security

Import operations have additional security requirements:

1. **File Path Validation:** Import file paths MUST be validated using S2 rules (realpath + containment check)

2. **File Size Limit:** Maximum import file size is 10MB
   - Larger files: Exit 1 with "Error: Import file exceeds 10MB limit"

3. **Encoding Validation:** File must be valid UTF-8
   - Invalid sequences: Exit 1 with "Error: Invalid UTF-8 encoding in import file"
   - BOM handling: UTF-8 BOM is accepted and stripped

4. **Row Limit:** Maximum 10,000 rows per import
   - More rows: Exit 1 with "Error: Import file exceeds 10,000 row limit"

5. **CSV Injection:** Data is stored as-is (no formula execution in CLI)
   - Note: Export applies formula prevention (see formatters.py)

---

## File Locations

| File | Purpose |
|------|---------|
| `contact_book_cli/__init__.py` | Package marker, `__version__` |
| `contact_book_cli/__main__.py` | Entry: `python -m contact_book_cli` |
| `contact_book_cli/cli.py` | Argument parsing, routing |
| `contact_book_cli/commands.py` | Command business logic |
| `contact_book_cli/database.py` | SQL operations |
| `contact_book_cli/models.py` | Data classes |
| `contact_book_cli/formatters.py` | Output formatting |
| `contact_book_cli/exceptions.py` | Exception hierarchy |

---

## Entry Points

### As Module
```bash
python -m contact_book_cli [command] [args]
```

### As Script (if installed)
```bash
contact-cli [command] [args]
```

Both invoke `cli.main()`.
