# Components: Contact Book CLI

## Module Overview

```
contact_book_cli/
|- __init__.py          # Package marker, version
|- __main__.py          # Entry point: python -m contact_book_cli
|- cli.py               # Argument parsing, command routing
|- commands.py          # Business logic for each command
|- database.py          # Database connection, queries
|- models.py            # Data classes, validation
|- formatters.py        # Output formatting (table, JSON, CSV, vCard)
|- exceptions.py        # Custom exception hierarchy
```

---

## Component Details

### `__init__.py`

**Purpose**: Package marker and version constant

**Contents**:
```python
__version__ = "0.1.0"
```

**Dependencies**: None

---

### `__main__.py`

**Purpose**: Entry point for `python -m contact_book_cli`

**Contents**:
```python
from contact_book_cli.cli import main
main()
```

**Dependencies**: `cli`

---

### `cli.py`

**Purpose**: Parse command-line arguments, route to command handlers

**Responsibilities**:
1. Define argument parser with subcommands
2. Validate input at boundary (before passing to commands)
3. Map exceptions to exit codes
4. Handle `--verbose` flag for debug output
5. Format and print output to stdout/stderr

**Public interface**:
- `main()` -> entry point, parses args, calls commands

**Dependencies**: `commands`, `formatters`, `exceptions`

**MUST**:
- Parse all arguments with argparse
- Validate all user input before passing to commands
- Catch ContactBookError subclasses and convert to exit codes
- Print user-facing messages to stdout/stderr
- Handle confirmation prompts using `sys.stdin.isatty()` to detect TTY mode:
  - TTY mode (interactive): Show prompt, wait for user input
  - Non-TTY mode without --force: Exit 1 with "Error: Cannot prompt for confirmation in non-interactive mode. Use --force to skip confirmation."
  - Non-TTY mode with --force: Proceed without prompt

**MUST NOT**:
- Access database directly
- Import sqlite3
- Contain business logic

---

### `commands.py`

**Purpose**: Business logic for each CLI command

**Responsibilities**:
1. Implement each command as a function
2. Coordinate between database and models
3. Enforce business rules (e.g., email uniqueness)

**Public interface**:
```python
def cmd_init(db_path: str, force: bool) -> None
def cmd_add(db_path: str, name: str, email: str | None, phone: str | None,
            company: str | None, notes: str | None, force: bool = False,
            no_duplicate_check: bool = False) -> int
def cmd_edit(db_path: str, contact_id: int, **fields) -> None
    # Empty string ("") for a field means SET TO NULL (clear field)
    # Omitting a field (not in **fields) means KEEP CURRENT VALUE (no change)
    # Example: cmd_edit(db, 1, email="") clears email; cmd_edit(db, 1, name="New") keeps email unchanged
def cmd_show(db_path: str, contact_id: int | None, email: str | None) -> Contact
def cmd_list(db_path: str, group: str | None) -> list[Contact]
def cmd_search(db_path: str, name: str | None, email: str | None,
               company: str | None, group: str | None) -> list[Contact]
def cmd_delete(db_path: str, contact_id: int, force: bool) -> None
def cmd_group_create(db_path: str, name: str, description: str | None) -> int
def cmd_group_list(db_path: str) -> list[Group]
def cmd_group_delete(db_path: str, group_id: int, force: bool) -> None
def cmd_assign(db_path: str, contact_id: int, group_name: str) -> None
    # MUST NOT auto-create group if not found - must raise GroupNotFoundError
def cmd_unassign(db_path: str, contact_id: int, group_name: str) -> None
    # MUST validate group exists before attempting unassign - raise GroupNotFoundError if not found
def cmd_export_csv(db_path: str, output: str, group: str | None, force: bool) -> int
def cmd_export_vcard(db_path: str, output: str, contact_id: int | None,
                     group: str | None, force: bool) -> int
def cmd_import_csv(db_path: str, input_path: str, skip_errors: bool = False,
                   skip: bool = False, overwrite: bool = False, merge: bool = False,
                   match_by: str = "email,phone") -> tuple[int, int]
def cmd_merge(db_path: str, target_id: int, source_id: int, force: bool = False) -> None
```

**Dependencies**: `database`, `models`, `exceptions`

**MUST**:
- Implement one function per CLI command
- Accept validated, typed parameters
- Return data (not formatted strings)
- Raise specific exception types for errors

**MUST NOT**:
- Parse CLI arguments
- Print to stdout/stderr
- Handle exit codes
- Catch exceptions (let them propagate to CLI)

---

### `database.py`

**Purpose**: Database connection and SQL operations

**Responsibilities**:
1. Create/connect to SQLite database
2. Run schema migrations (create tables)
3. Execute parameterized queries
4. Handle transactions

**Public interface**:
```python
def init_database(path: str) -> None
def get_connection(path: str) -> ContextManager[sqlite3.Connection]
def insert_contact(conn, contact: Contact) -> int
def update_contact(conn, contact: Contact) -> None
def delete_contact(conn, contact_id: int) -> None
def find_contact_by_id(conn, contact_id: int) -> Contact | None
def find_contact_by_email(conn, email: str) -> Contact | None
def search_contacts(conn, name: str | None, email: str | None,
                    company: str | None) -> list[Contact]
def get_all_contacts(conn, group_id: int | None) -> list[Contact]
def insert_group(conn, group: Group) -> int
def delete_group(conn, group_id: int) -> None
def find_group_by_name(conn, name: str) -> Group | None
def find_group_by_id(conn, group_id: int) -> Group | None
def get_all_groups(conn) -> list[Group]
def add_contact_to_group(conn, contact_id: int, group_id: int) -> None
def remove_contact_from_group(conn, contact_id: int, group_id: int) -> None
def get_groups_for_contact(conn, contact_id: int) -> list[Group]
def get_contacts_in_group(conn, group_id: int) -> list[Contact]
```

**Dependencies**: `models`, `exceptions`

**MUST**:
- Use parameterized queries exclusively (`?` placeholders)
- Use context managers for connections
- Use transactions for multi-statement operations
- Return model objects (not raw tuples)
- Execute `PRAGMA foreign_keys = ON` on every connection (SQLite has foreign keys OFF by default)
- Execute `PRAGMA busy_timeout = 5000` on every connection (prevents immediate SQLITE_BUSY errors when database is locked by another process)

**MUST NOT**:
- Validate business rules
- Format output
- Use string interpolation in queries (SECURITY CRITICAL)

---

### `models.py`

**Purpose**: Data classes and validation logic

**Responsibilities**:
1. Define `Contact` dataclass
2. Define `Group` dataclass
3. Validate field constraints

**Public interface**:
```python
@dataclass
class Contact:
    id: int | None
    name: str
    email: str | None
    phone: str | None
    company: str | None
    notes: str | None
    created_at: str
    updated_at: str
    groups: list[str] = field(default_factory=list)  # populated on read

@dataclass
class Group:
    id: int | None
    name: str
    description: str | None
    created_at: str

def validate_name(name: str) -> str  # raises ValidationError
def validate_email(email: str | None) -> str | None  # raises ValidationError
def validate_phone(phone: str | None) -> str | None  # raises ValidationError
def validate_company(company: str | None) -> str | None  # raises ValidationError
def validate_notes(notes: str | None) -> str | None  # raises ValidationError
def validate_group_name(name: str) -> str  # raises ValidationError

def normalize_phone(phone: str) -> str:
    """Normalize phone number for duplicate detection.

    Removes all non-digit characters except leading '+'.
    Used for duplicate detection, NOT for storage (original format is stored).

    Examples:
        '+1-555-123-4567' -> '+15551234567'
        '(555) 123-4567' -> '5551234567'
    """

# In models.py - validation functions used by CLI layer

def validate_path(path: str, allowed_base: str | None = None) -> str:
    """Validate and normalize file path.

    This function lives in models.py for reusability, but is CALLED by the CLI layer
    (cli.py) before passing paths to command functions. This follows AD5: all user
    input is validated at the boundary (CLI layer) before processing.

    Args:
        path: User-provided path
        allowed_base: Base directory for containment check (default: cwd)

    Returns: Resolved absolute path
    Raises: ValidationError if path is invalid or outside allowed directory
    """
```

**Dependencies**: `exceptions`

**MUST NOT**: Access database, format output

---

### `formatters.py`

**Purpose**: Format data for output (table, JSON, CSV, vCard)

**Responsibilities**:
1. Format contact lists as ASCII tables
2. Format contact lists as JSON
3. Format single contact as detailed card
4. Write contact lists to CSV files
5. Write contacts to vCard files

**Public interface**:
```python
def format_contact_table(contacts: list[Contact]) -> str
def format_contact_json(contacts: list[Contact]) -> str
def format_contact_detail(contact: Contact) -> str  # Full card view
def format_group_table(groups: list[Group]) -> str
def format_group_json(groups: list[Group]) -> str
def write_csv(contacts: list[Contact], path: str) -> None
def write_vcard(contacts: list[Contact], path: str) -> None
```

**Dependencies**: `models`

**MUST**:
- Accept model objects as input
- Return strings (for table/JSON) or write files (for CSV/vCard)
- Handle edge cases (empty lists, None values)
- **CSV Security**: Apply CSV formula prevention - prefix field values with `'` if they start with `=`, `+`, `-`, `@`, TAB, or CR
- **vCard Security**: Apply RFC 6350 character escaping to all text fields: `\` → `\\`, newline → `\n`, `;` → `\;`, `,` → `\,`
- **vCard Format**: Use CRLF (`\r\n`) line endings for vCard output per RFC 2426

**MUST NOT**:
- Access database
- Make business decisions

---

### `exceptions.py`

**Purpose**: Custom exception hierarchy

**Contents**:
```python
class ContactBookError(Exception):
    """Base exception for contact book CLI."""
    exit_code = 1

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)

class ValidationError(ContactBookError):
    """Invalid input data."""
    exit_code = 1

class DatabaseError(ContactBookError):
    """Database operation failed."""
    exit_code = 2

class ContactNotFoundError(ContactBookError):
    """Requested contact does not exist."""
    exit_code = 3

class GroupNotFoundError(ContactBookError):
    """Requested group does not exist."""
    exit_code = 3

class DuplicateError(ContactBookError):
    """Contact or group with this identifier already exists."""
    exit_code = 4

class ConflictError(ContactBookError):
    """Concurrent modification detected (optimistic locking failure)."""
    exit_code = 5
```

**Dependencies**: None

---

## Dependency Graph

```
cli.py
  |- commands.py
  |     |- database.py
  |     |     |- models.py
  |     |     |- exceptions.py
  |     |- models.py
  |     |- exceptions.py
  |- formatters.py
  |     |- models.py
  |- exceptions.py
```

**Rule**: No circular dependencies. Lower layers don't import from higher layers.
