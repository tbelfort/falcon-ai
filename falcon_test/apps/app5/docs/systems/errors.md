# Error Handling: Contact Book CLI

**Status:** Final

---

## Exit Codes

| Code | Name | Meaning |
|------|------|---------|
| 0 | SUCCESS | Operation completed successfully |
| 1 | GENERAL_ERROR | Invalid arguments, validation failure, general errors |
| 2 | DATABASE_ERROR | Database connection failed, query failed, file issues |
| 3 | NOT_FOUND | Requested contact or group does not exist |
| 4 | DUPLICATE | Contact with this email or group with this name already exists |
| 5 | CONFLICT | Concurrent modification detected (optimistic locking failure) |

---

## Exception Hierarchy

```python
class ContactBookError(Exception):
    """Base exception for all contact book CLI errors."""
    exit_code: int = 1

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class ValidationError(ContactBookError):
    """Invalid input data.

    Examples:
    - Empty name
    - Invalid email format
    - Name too long
    - Invalid path
    """
    exit_code = 1


class DatabaseError(ContactBookError):
    """Database operation failed.

    Examples:
    - Cannot connect to database
    - Query execution failed
    - Cannot create database file
    - Constraint violation (generic)
    """
    exit_code = 2


class ContactNotFoundError(ContactBookError):
    """Requested contact does not exist.

    Examples:
    - Contact ID not found
    - Email not found
    """
    exit_code = 3


class GroupNotFoundError(ContactBookError):
    """Requested group does not exist."""
    exit_code = 3


class DuplicateError(ContactBookError):
    """Contact or group with this identifier already exists.

    Examples:
    - Email already exists
    - Group name already exists
    """
    exit_code = 4


class ConflictError(ContactBookError):
    """Concurrent modification detected.

    Examples:
    - Contact was modified by another process since it was read
    - Optimistic locking failure
    """
    exit_code = 5
```

---

## Error Message Templates

**Capitalization Convention:** All error messages MUST start with "Error: " prefix followed by a capital letter. The message body uses sentence case (capitalize first word only, except proper nouns).

### Validation Errors (Exit 1)

```
Error: Name cannot be empty.
Error: Name must be 200 characters or fewer. Got: 250
Error: Invalid email format.
Error: Email must be 254 characters or fewer.
Error: Phone must be 50 characters or fewer.
Error: Company must be 200 characters or fewer.
Error: Notes must be 5000 characters or fewer.
Error: Group name cannot be empty.
Error: Group name must be 100 characters or fewer.
Error: Path must be within {directory}.
Error: At least one search criterion required (--name, --email, --company, or --group).
Error: At least one field to update required.
Error: Must specify contact ID or --email.
Error: Cannot merge contact with itself.
Error: File '{filename}' already exists. Use --force to overwrite.
Error: Database already exists at {filename}. Use --force to recreate.
```

### Database Errors (Exit 2)

```
Error: Cannot create database '{filename}': Permission denied.
Error: Cannot open database '{filename}': File not found.
Error: Database operation failed. Run with --verbose for details.
Error: Cannot write to '{filename}': Permission denied.
Error: Cannot read file '{filename}'.
```

**Note:** Use basename only (`{filename}`), not full path. See S3 in ARCHITECTURE-simple.md.

### Not Found Errors (Exit 3)

```
Error: Contact ID {id} not found.
Error: Contact with email '{email}' not found.
Error: Group '{name}' not found.
```

### Duplicate Errors (Exit 4)

```
Error: Email '{email}' already exists.
Error: Group '{name}' already exists.
```

---

## Error Handling Rules

### Rule 1: Catch at CLI Layer

Exceptions bubble up from command/database layers. The CLI layer catches them and:
1. Prints user-friendly message to stderr
2. Exits with appropriate code

```python
# cli.py
def main():
    args = None  # Initialize to handle case where parse_args fails
    try:
        args = parse_args()  # Parse arguments first
        result = dispatch_command(args)
        # print result
        sys.exit(0)
    except ContactBookError as e:
        print(f"Error: {e.message}", file=sys.stderr)
        sys.exit(e.exit_code)
    except Exception as e:
        # Check if args exists and has verbose attribute
        if args is not None and getattr(args, 'verbose', False):
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
Error: sqlite3.IntegrityError: UNIQUE constraint failed: contacts.email
```

**Good:**
```
Error: Email 'jane@example.com' already exists.
```

### Rule 3: Never Expose PII

Error messages should minimize exposure of personal information:
- Don't include email/phone in error messages where avoidable
- Use contact IDs instead of names in internal logs
- Never log notes content

**Acceptable (shows email user already knows):**
```
Error: Email 'jane@example.com' already exists.
```

**Not acceptable (logs in verbose mode):**
```
DEBUG: Checking for duplicate email jane@example.com
```

### Rule 4: Be Specific

When multiple validation errors could apply, report the first one found:

```python
def validate_add_contact(name, email):
    if not name:
        raise ValidationError("Name cannot be empty.")
    if len(name) > 200:
        raise ValidationError(f"Name must be 200 characters or fewer. Got: {len(name)}")
    if email and not is_valid_email(email):
        raise ValidationError("Invalid email format.")
    # ... continue validation
```

### Rule 5: Distinguish Error Types

Use the specific exception type that matches the error:

| Situation | Exception |
|-----------|-----------|
| Bad user input | `ValidationError` |
| SQLite can't connect | `DatabaseError` |
| Contact not in database | `ContactNotFoundError` |
| Group not in database | `GroupNotFoundError` |
| Email already exists | `DuplicateError` |
| Group name already exists | `DuplicateError` |
| File permission issue | `ValidationError` (if path) or `DatabaseError` (if db file) |

### Rule 6: Preserve Original Exceptions

When catching and re-raising, preserve the original exception for debugging:

```python
try:
    cursor.execute(query, params)
except sqlite3.IntegrityError as e:
    if "UNIQUE constraint" in str(e) and "email" in str(e):
        # Note: email variable should be available from the calling context
        raise DuplicateError(f"Email '{email}' already exists.") from e
    raise DatabaseError("Database constraint violation.") from e
```

---

## Verbose Mode

When `--verbose` is set:
1. Print debug information during execution
2. On error, print stack trace (see note below)
3. Include full file paths in error messages

**Stack Trace PII Consideration:**
Standard Python stack traces (`traceback.print_exc()`) may include local variable values that contain PII (e.g., email addresses in exception handlers). For this application, the trade-off is accepted because:
- Verbose mode is opt-in and intended for debugging
- Users enabling --verbose are typically developers investigating issues
- The alternative (custom traceback formatting) adds complexity

**Verbose mode does NOT expose in DEBUG messages:**
- SQL query text (parameter values could contain sensitive data)
- Credentials or secrets
- Email addresses, phone numbers, or notes content

**Verbose mode outputs to stderr:**
- DEBUG: Connecting to database at {path}
- DEBUG: Executing {operation} operation
- DEBUG: Found {count} results
- DEBUG: Writing output to {path}

NEVER output: email addresses, phone numbers, notes content, contact names

```python
if args.verbose:
    print(f"DEBUG: Connecting to database at {db_path}", file=sys.stderr)
    print(f"DEBUG: Executing search operation", file=sys.stderr)  # Don't log query text or PII
    print(f"DEBUG: Found {count} results", file=sys.stderr)
    print(f"DEBUG: Writing output to {output_path}", file=sys.stderr)
```

---

## Testing Error Conditions

Each error path should have a test:

```python
def test_add_contact_empty_name():
    result = run_cli("add", "--name", "")
    assert result.exit_code == 1
    assert "Name cannot be empty" in result.stderr

def test_add_contact_invalid_email():
    result = run_cli("add", "--name", "Test", "--email", "not-an-email")
    assert result.exit_code == 1
    assert "Invalid email format" in result.stderr

def test_add_contact_duplicate_email():
    run_cli("add", "--name", "Test1", "--email", "test@example.com")
    result = run_cli("add", "--name", "Test2", "--email", "test@example.com")
    assert result.exit_code == 4
    assert "already exists" in result.stderr

def test_show_contact_not_found():
    result = run_cli("show", "999")
    assert result.exit_code == 3
    assert "not found" in result.stderr

def test_search_no_criteria():
    result = run_cli("search")
    assert result.exit_code == 1
    assert "At least one search criterion required" in result.stderr

def test_export_path_traversal():
    result = run_cli("export-csv", "--output", "../../../etc/passwd")
    assert result.exit_code == 1
    assert "Path must be within" in result.stderr
```
