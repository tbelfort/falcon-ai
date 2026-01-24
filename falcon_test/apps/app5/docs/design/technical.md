# Technical Design: Contact Book CLI

## Technology Choices

### Language: Python 3.10+

**Rationale**:
- Target users likely have Python installed (common on macOS/Linux)
- Rich standard library reduces dependencies
- Type hints (3.10+) improve code quality
- Cross-platform without compilation

**Constraint**: Standard library only. No pip dependencies.

### Database: SQLite3

**Rationale**:
- Zero configuration, single file
- Included in Python standard library
- Handles 10,000+ contacts easily
- Supports concurrent reads (single writer)

**Constraint**: Use `sqlite3` module only. No ORM, no SQLAlchemy.

### CLI Framework: argparse

**Rationale**:
- Standard library (no dependencies)
- Sufficient for our command structure
- Well-documented, familiar to Python developers

**Rejected alternatives**:
- Click: External dependency
- Typer: External dependency
- Fire: Magic behavior, harder to control

---

## Architecture Decisions

### AD1: Layered Architecture

```
CLI Layer (cli.py)
    | parses args, routes commands
Command Layer (commands.py)
    | business logic, validation
Database Layer (database.py)
    | SQL queries, connection management
```

**Rationale**: Separation of concerns. CLI parsing separate from business logic separate from data access.

### AD2: No Global State

Each command receives explicit parameters. No module-level database connections or configuration objects.

**Rationale**: Testability, predictability, no hidden coupling.

### AD3: Explicit Error Types

Custom exception hierarchy maps to exit codes:

```python
ContactBookError (base)
|- ValidationError      -> exit 1
|- DatabaseError        -> exit 2
|- ContactNotFoundError -> exit 3
|- GroupNotFoundError   -> exit 3
|- DuplicateError       -> exit 4
|- ConflictError        -> exit 5
```

**Rationale**: Callers can catch specific errors. Exit codes are predictable for scripting.

### AD4: Parameterized Queries Only

**All SQL queries MUST use parameterized placeholders (`?`).**

Never:
```python
cursor.execute(f"SELECT * FROM contacts WHERE email = '{email}'")  # WRONG
```

Always:
```python
cursor.execute("SELECT * FROM contacts WHERE email = ?", (email,))  # RIGHT
```

**Rationale**: Prevents SQL injection. Non-negotiable.

### AD5: Input Validation at Boundary

Validate all user input in the CLI layer before passing to commands:

| Field | Constraints |
|-------|-------------|
| Name | Non-empty, max 200 chars |
| Email | Valid format (contains @, no spaces), max 254 chars |
| Phone | Max 50 chars |
| Company | Max 200 chars |
| Notes | Max 5000 chars |
| Group name | Non-empty, max 100 chars |
| Group description | Max 500 chars |
| Path | Converted to absolute, symlinks resolved, must stay within allowed base |

**Path Validation Implementation:**
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

**Note:** These constraints are the authoritative source. They are also documented in:
- schema.md (database enforcement)
- interface.md (CLI validation rules)

If discrepancies exist, this document (technical.md AD5) takes precedence.

**Rationale**: Fail fast with clear error messages. Don't let bad data reach database layer.

### AD6: Atomic Database Operations

Each command is a single transaction. Either fully succeeds or fully fails.

**Rationale**: No partial updates. Database always in consistent state.

**Merge Command Transaction Scope:**
The merge command performs multiple database operations that MUST be atomic:
1. Update target contact fields
2. Transfer group memberships from source to target
3. Delete source contact

All three operations MUST execute within a single database transaction.
If any step fails, the entire merge MUST rollback.

Implementation pattern:
```python
with get_connection(db_path) as conn:
    try:
        # All merge operations here
        conn.commit()
    except Exception:
        conn.rollback()
        raise
```

### AD7: PII-Aware Logging

- NEVER log email addresses, phone numbers, or notes content
- Error messages use contact IDs, not names/emails
- Verbose mode shows operation types, not data values

**Rationale**: Prevent accidental PII leakage in logs or error messages.

---

## Data Model

### Contacts Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| email | TEXT | nullable, UNIQUE when not null (see note) |
| phone | TEXT | nullable |
| company | TEXT | nullable |
| notes | TEXT | nullable |
| created_at | TEXT | ISO 8601 timestamp |
| updated_at | TEXT | ISO 8601 timestamp |

### Groups Table

| Column | Type | Constraints |
|--------|------|-------------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL UNIQUE |
| description | TEXT | nullable |
| created_at | TEXT | ISO 8601 timestamp |

### Contact_Groups Table (Junction)

| Column | Type | Constraints |
|--------|------|-------------|
| contact_id | INTEGER | FK -> contacts.id, ON DELETE CASCADE |
| group_id | INTEGER | FK -> groups.id, ON DELETE CASCADE |
| PRIMARY KEY (contact_id, group_id) |

**Email Uniqueness:**
The email column has UNIQUE constraint but allows NULL values.
SQLite permits multiple NULL values in UNIQUE columns (NULL != NULL).
This means multiple contacts may have no email address - this is intentional
for contacts where only phone/name is known.

---

## Output Formats

### Table Format (default)

Human-readable, fixed-width columns:
```
ID   | Name          | Email                | Phone           | Company
-----|---------------|----------------------|-----------------|----------
1    | Jane Smith    | jane@example.com     | +1-555-123-4567 | Acme Corp
```

### JSON Format (`--format json`)

Machine-readable, stable schema:
```json
[
  {
    "id": 1,
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+1-555-123-4567",
    "company": "Acme Corp",
    "notes": null,
    "groups": ["Clients", "Conference"]
  }
]
```

**Note:** The `groups` field is always an array (empty if contact has no groups).

### CSV Format (export only)

RFC 4180 compliant:
- Comma separator
- Double-quote escaping
- UTF-8 encoding
- Header row: `name,email,phone,company,notes`

**Formula Prevention (CSV Injection Mitigation):**
CSV export MUST sanitize fields to prevent formula injection. Any field value starting with `=`, `+`, `-`, `@`, TAB (0x09), or CR (0x0D) MUST be prefixed with a single quote character (`'`). This prevents formula execution when the exported CSV is opened in spreadsheet applications.

**Additional Considerations:**
- Fields already starting with `'` should still be prefixed (resulting in `''value`)
- Some applications also treat `;` as special - consider including in prefix list
- The OWASP recommendation includes escaping the entire field, not just prefixing

### vCard Format (export only)

vCard 3.0 format:
```
BEGIN:VCARD
VERSION:3.0
N:Smith;Jane;;;
FN:Jane Smith
EMAIL:jane@example.com
TEL:+1-555-123-4567
ORG:Acme Corp
NOTE:Met at TechConf
END:VCARD
```

**Note:** The N (name) property is required by vCard 3.0. Format is `N:Last;First;Middle;Prefix;Suffix`. Since we only store full name, we attempt to split on the last space (everything before = first name, everything after = last name). If the name has no spaces, the entire name is placed in the last name component.

**vCard Name Splitting Algorithm:**
```python
def split_name_for_vcard(full_name: str) -> tuple[str, str]:
    """Split full name into first and last name for vCard N property.

    Algorithm:
    1. Strip leading/trailing whitespace from full_name
    2. If name is empty after stripping, return ("", "")
    3. Find the LAST space character in the stripped name
    4. If no space: first_name = "", last_name = full_name
    5. If space found: first_name = everything before last space, last_name = everything after

    Edge cases:
    - "Jane Smith" -> first="Jane", last="Smith"
    - "Jane Marie Smith" -> first="Jane Marie", last="Smith" (compound first name)
    - "Jose Garcia" -> first="Jose", last="Garcia" (accented chars preserved)
    - "van der Berg" -> first="van der", last="Berg" (last word is surname)
    - "Jane" -> first="", last="Jane" (single name)
    - "  Jane Smith  " -> first="Jane", last="Smith" (whitespace stripped)
    - "" -> first="", last="" (empty name)

    Note: This heuristic works for most Western names but may not be ideal for
    names from cultures with different conventions (e.g., "Family Given" order).
    For full internationalization, consider allowing users to specify name parts.

    **Empty Name Handling in vCard Export:**
    vCard 3.0 requires FN (Formatted Name) to be non-empty. If a contact has
    an empty/whitespace-only name (which should be prevented by validation),
    the vCard export MUST use the placeholder "[No Name]" for both FN and N
    properties. Do not skip contacts - always export with placeholder to ensure
    data completeness. Log a warning: "Contact ID {id} has empty name, using placeholder."
    """
```

**Character Escaping (RFC 6350 Compliance):**
vCard fields MUST be escaped per RFC 6350 to prevent vCard injection attacks:
- Backslash (`\`) -> `\\`
- Newline -> `\n`
- Semicolon (`;`) -> `\;`
- Comma (`,`) -> `\,`

This escaping MUST be applied to all text fields before writing to the vCard file.

---

## Performance Targets

| Operation | Target | Max dataset |
|-----------|--------|-------------|
| add | <50ms | n/a |
| search | <100ms | 10,000 contacts |
| show | <50ms | n/a |
| list | <100ms | 10,000 contacts |
| export-csv | <5s | 10,000 contacts |

---

## Security Considerations

1. **SQL Injection**: Mitigated by AD4 (parameterized queries only)
2. **Path Traversal**: Validate `--db` and `--output` paths (no `..`)
3. **Error Message Leakage**: Don't expose SQL errors or full file paths in user-facing messages
4. **PII in Logs**: Mitigated by AD7 (never log email/phone/notes)
5. **File Permissions**: Database files MUST have restrictive permissions (0600)

### S6: Future Feature Security Requirements

> **⚠️ FUTURE VERSION ONLY - NOT IMPLEMENTED IN v1**
>
> The features in this section are NOT part of the current implementation.
> They are documented here for future reference only. Do not implement
> these features unless explicitly tasked to do so.

**Photo/Avatar Storage (if implemented in future versions):**
Avatar/photo paths MUST be validated to:
- Stay within a designated storage directory (e.g., `~/.contact-book/avatars/`)
- Have allowed extensions only: `.jpg`, `.jpeg`, `.png`, `.gif`
- Not exceed size limit of 5MB per image
- External URLs are NOT allowed - only local file paths
- File content MUST be validated (magic bytes check) to match declared extension

**Implementation note:** Photo storage is currently a non-goal (see vision.md). These requirements are documented for future reference if this feature is added.

**Birthday Field (if implemented in future versions):**
Birthday MUST be a valid date with the following constraints:
- Date MUST be in the past (not future dates)
- Year MUST be between 1900 and current_year (if specified)
- Partial dates are allowed using vCard `--00--` format per RFC 6350:
  - `--MM-DD` for month/day only (year unknown)
  - `YYYY-MM` for year/month only (day unknown)
  - `YYYY` for year only
- Full date format: `YYYY-MM-DD`

**Validation:**
```python
def validate_birthday(birthday: str) -> str:
    """Validate birthday format and value.

    Accepts:
    - YYYY-MM-DD (full date, must be in past, year >= 1900)
    - --MM-DD (partial, year unknown)
    - YYYY-MM (partial, day unknown)
    - YYYY (year only)

    Raises: ValidationError if invalid
    """
```

**Implementation note:** Birthday is not currently in the schema. These requirements are documented for future reference if this feature is added.

**Custom Fields (if implemented in future versions):**
Custom field names and values MUST be validated to prevent injection attacks:

**Field Name Validation:**
- MUST contain only alphanumeric characters (`a-z`, `A-Z`, `0-9`), hyphens (`-`), and underscores (`_`)
- MUST NOT start with a hyphen or digit
- Maximum 50 characters
- Case-insensitive (stored lowercase)
- Regex: `^[a-zA-Z][a-zA-Z0-9_-]{0,49}$`

**Field Value Validation:**
- Values are free-form text (no content restrictions for storage)
- Maximum 5000 characters (same as notes field)
- Values MUST be escaped appropriately for each export format:
  - CSV: Apply formula prevention (prefix with `'` if starts with `=`, `+`, `-`, `@`, TAB, CR)
  - vCard: Apply RFC 6350 escaping (`\` -> `\\`, newline -> `\n`, `;` -> `\;`, `,` -> `\,`)
  - JSON: Standard JSON string escaping

**Implementation note:** Custom fields are mentioned in migration strategy but not currently implemented. These requirements are documented for future reference.

**Database Permissions (Unix/macOS):**
Database file MUST have 0600 permissions (owner read/write only).

Implementation:
```python
import os

def create_database_with_permissions(db_path: str) -> None:
    """Create database file with secure permissions from the start.

    Uses os.open() with O_CREAT to set permissions atomically,
    avoiding a TOCTOU race where the file briefly has insecure permissions.
    """
    # Create file with restrictive permissions atomically
    fd = os.open(db_path, os.O_CREAT | os.O_WRONLY, 0o600)
    os.close(fd)
    # Now connect to the database file (SQLite will use it)
```

If file creation fails due to permissions, raise DatabaseError.

**Windows Note:** Unix permissions (0o600) don't apply on Windows. The `os.open()` call with mode parameter still works but the mode is ignored. On Windows, the database file inherits ACLs from the parent directory. For secure deployments on Windows, users should ensure the parent directory has appropriate ACL restrictions (owner-only access). The application does not programmatically modify Windows ACLs - this is documented as a deployment consideration.
