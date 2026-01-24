# App5: Contact Book CLI - Implementation Plan

This document specifies EXACTLY what needs to be created for app5, the Contact Book CLI. Follow this plan to create all files without ambiguity.

---

## 1. App Overview

**Contact Book CLI** is a pip-installable command-line tool for managing personal and professional contacts. It targets:

- **Primary user**: Professionals managing business contacts (sales reps, recruiters, consultants)
- **Use cases**: Quick contact lookup, scriptable exports, address book maintenance
- **Environment**: Works fully offline with SQLite, standard library only

**Key Security Surfaces for Falcon Testing**:
- **B01 - SQL Injection**: Contact names, company names, notes, search queries
- **B02 - Input Validation**: Email format validation, phone format validation
- **B03 - PII Handling**: Personal data (emails, phones) in logs, error messages
- **B04 - Data Sanitization**: Notes field with arbitrary text

**Core Entities**:
- **Contacts**: Individual people with contact information
- **Groups**: Collections of contacts (e.g., "Clients", "Family", "Conference Speakers")
- **Membership**: Many-to-many relationship between contacts and groups

---

## 2. Directory Structure

```
falcon_test/apps/app5/
├── docs/
│   ├── design/
│   │   ├── INDEX.md
│   │   ├── vision.md
│   │   ├── use-cases.md
│   │   ├── technical.md
│   │   └── components.md
│   └── systems/
│       ├── architecture/
│       │   └── ARCHITECTURE-simple.md
│       ├── database/
│       │   └── schema.md
│       ├── cli/
│       │   └── interface.md
│       └── errors.md
├── tasks/
│   ├── task1.md
│   ├── task2.md
│   ├── task3.md
│   └── task4.md
└── contact_book_cli/
    ├── __init__.py
    ├── __main__.py
    ├── cli.py
    ├── commands.py
    ├── database.py
    ├── models.py
    ├── formatters.py
    └── exceptions.py
```

---

## 3. Design Docs Outline

### 3.1 docs/design/INDEX.md

**Purpose**: Navigation hub for all documentation, component mappings, architecture decision summary.

**Required Sections**:

1. **Document Map** - Table with columns: Document, Purpose, Read When
   - vision.md: Why we're building this | Always
   - use-cases.md: How the tool is used | Any user-facing change
   - technical.md: Architecture decisions | Any structural change
   - components.md: Module breakdown | Implementation work

2. **Systems Documentation** - Table linking to systems docs
   - systems/architecture/ARCHITECTURE-simple.md: Layer rules, data flow | Always
   - systems/database/schema.md: SQLite schema, queries | Database work
   - systems/cli/interface.md: Command specifications | CLI work
   - systems/errors.md: Exception handling | Error handling work

3. **Component Mapping** - Table mapping components to docs
   - cli.py → components.md, cli/interface.md, errors.md
   - commands.py → components.md, architecture/ARCHITECTURE-simple.md
   - database.py → technical.md, components.md, database/schema.md
   - models.py → components.md, database/schema.md
   - formatters.py → components.md, cli/interface.md
   - exceptions.py → technical.md, components.md, errors.md

4. **Architecture Decisions** - Summary table of AD1-AD7
   - ID, Decision, Impact columns

5. **Security Considerations** - Links to security-relevant docs
   - SQL Injection Prevention → technical.md (AD4), architecture (S1)
   - Path Validation → architecture (S2)
   - Error Message Sanitization → architecture (S3)
   - PII Protection → architecture (S4)

---

### 3.2 docs/design/vision.md

**Purpose**: Problem statement, target user persona, solution summary, non-goals, success criteria.

**Required Content**:

1. **Problem Statement**:
   - Contact management scattered across apps, emails, spreadsheets
   - Cloud-based solutions require accounts, sync, internet
   - No good scriptable solution for power users
   - Need quick lookup without opening full applications

2. **Target User** (persona: "Alex, the sales consultant"):
   - Manages 500+ professional contacts across multiple clients
   - Needs quick phone/email lookup during calls
   - Wants to export contacts by client/group for mail merges
   - Works offline frequently (airports, client sites)
   - Has basic CLI familiarity, not a developer

3. **Solution**:
   - pip-installable CLI tool
   - Local SQLite database (no server)
   - Simple commands for CRUD and search
   - Machine-readable outputs (JSON, CSV, vCard)
   - Runs on any system with Python 3.10+ (standard library only)

4. **Non-Goals**:
   - Multi-user/collaboration features
   - Cloud sync or mobile app
   - Photo storage for contacts
   - Calendar/scheduling integration
   - Social media profile linking
   - Automated contact enrichment

5. **Success Criteria**:
   - User can add and find contacts in under 10 seconds
   - All commands complete in <100ms for up to 10,000 contacts
   - Works fully offline after initial install
   - Scripts can parse output reliably (stable JSON schema)
   - Export to CSV/vCard compatible with common tools

---

### 3.3 docs/design/use-cases.md

**Purpose**: 7 detailed usage scenarios with actor, flow, success, failure modes.

**Required Use Cases**:

**UC1: Initial Setup**
- Actor: User setting up contact book for first time
- Flow: pip install, init --db, import existing contacts
- Success: Database created, ready for contacts
- Failure modes: Path not writable, database exists without --force

**UC2: Adding a New Contact**
- Actor: User met someone at conference
- Flow: `contact-cli add --name "Jane Smith" --email "jane@example.com" --phone "+1-555-123-4567" --company "Acme Corp" --notes "Met at TechConf 2026"`
- Success: Contact created with ID displayed
- Failure modes: Invalid email format (exit 1), duplicate handling

**UC3: Quick Lookup During Call**
- Actor: User needs phone number quickly
- Flow: `contact-cli search --name "jane"`
- Success: Matching contacts with phone/email displayed
- Failure modes: No criteria provided (exit 1), no matches (empty result, exit 0)

**UC4: Organizing Contacts into Groups**
- Actor: User wants to categorize contacts
- Flow: Create group, assign contacts to group
- Success: Group created, contacts assigned
- Failure modes: Group name exists (exit 4), contact not found (exit 3)

**UC5: Exporting for Mail Merge**
- Actor: User preparing client newsletter
- Flow: `contact-cli export-csv --output clients.csv --group "Clients"`
- Success: CSV file with filtered contacts
- Failure modes: File exists without --force, path traversal blocked

**UC6: Viewing Full Contact Details**
- Actor: User needs all information about a contact
- Flow: `contact-cli show 42` or `contact-cli show --email "jane@example.com"`
- Success: Full contact card displayed with all fields, groups
- Failure modes: Contact not found (exit 3)

**UC7: Merging Duplicate Contacts**
- Actor: User has duplicate entries
- Flow: `contact-cli merge 42 43` (merge contact 43 into 42)
- Success: Contacts merged, duplicate removed
- Failure modes: Contact not found (exit 3), merging same contact (exit 1)

---

### 3.4 docs/design/technical.md

**Purpose**: Technology choices, architecture decisions (AD1-AD7), data model, output formats, performance targets, security considerations.

**Required Content**:

1. **Technology Choices**:
   - Language: Python 3.10+ (type hints, standard library)
   - Database: SQLite3 (zero config, single file, built-in)
   - CLI Framework: argparse (standard library)
   - Constraint: Standard library only, no pip dependencies

2. **Architecture Decisions**:

   **AD1: Layered Architecture**
   ```
   CLI Layer (cli.py)
       ↓ parses args, routes commands
   Command Layer (commands.py)
       ↓ business logic, validation
   Database Layer (database.py)
       ↓ SQL queries, connection management
   ```
   Rationale: Separation of concerns, testability

   **AD2: No Global State**
   - Each command receives explicit parameters
   - No module-level connections or config objects
   - Rationale: Testability, predictability

   **AD3: Explicit Error Types**
   - Custom exception hierarchy maps to exit codes:
     ```
     ContactBookError (base)
     ├── ValidationError      → exit 1
     ├── DatabaseError        → exit 2
     ├── ContactNotFoundError → exit 3
     ├── GroupNotFoundError   → exit 3
     └── DuplicateError       → exit 4
     ```
   - Rationale: Predictable exit codes for scripting

   **AD4: Parameterized Queries Only**
   - ALL SQL queries MUST use `?` placeholders
   - NEVER use f-strings or string interpolation in SQL
   - Rationale: Prevents SQL injection (non-negotiable)

   **AD5: Input Validation at Boundary**
   - Validate in CLI layer before passing to commands:
     - Name: non-empty, max 200 chars
     - Email: valid format (contains @, no spaces), max 254 chars
     - Phone: max 50 chars, optional format validation
     - Company: max 200 chars
     - Notes: max 5000 chars
     - Group name: non-empty, max 100 chars
   - Rationale: Fail fast with clear errors

   **AD6: Atomic Database Operations**
   - Each command is a single transaction
   - Fully succeeds or fully fails
   - Rationale: Data consistency

   **AD7: PII-Aware Logging**
   - Never log email addresses, phone numbers, or notes content
   - Error messages use contact IDs, not names/emails
   - Verbose mode shows operations, not data values
   - Rationale: Prevent accidental PII leakage

3. **Data Model**:

   **Contacts Table**:
   | Column | Type | Constraints |
   |--------|------|-------------|
   | id | INTEGER | PRIMARY KEY AUTOINCREMENT |
   | name | TEXT | NOT NULL |
   | email | TEXT | nullable, UNIQUE when not null |
   | phone | TEXT | nullable |
   | company | TEXT | nullable |
   | notes | TEXT | nullable |
   | created_at | TEXT | ISO 8601 timestamp |
   | updated_at | TEXT | ISO 8601 timestamp |

   **Groups Table**:
   | Column | Type | Constraints |
   |--------|------|-------------|
   | id | INTEGER | PRIMARY KEY AUTOINCREMENT |
   | name | TEXT | NOT NULL UNIQUE |
   | description | TEXT | nullable |
   | created_at | TEXT | ISO 8601 timestamp |

   **Contact_Groups Table** (junction):
   | Column | Type | Constraints |
   |--------|------|-------------|
   | contact_id | INTEGER | FK → contacts.id |
   | group_id | INTEGER | FK → groups.id |
   | PRIMARY KEY (contact_id, group_id) |

4. **Output Formats**:
   - Table: Human-readable, fixed-width columns
   - JSON: Machine-readable, stable schema, null included
   - CSV: RFC 4180 compliant (export only)
   - vCard: vCard 3.0 format (export only)

5. **Performance Targets**:
   | Operation | Target | Max dataset |
   |-----------|--------|-------------|
   | add | <50ms | n/a |
   | search | <100ms | 10,000 contacts |
   | show | <50ms | n/a |
   | list | <100ms | 10,000 contacts |
   | export-csv | <5s | 10,000 contacts |

6. **Security Considerations**:
   - SQL Injection: Mitigated by AD4
   - Path Traversal: Validate --db and --output paths
   - Error Message Leakage: Don't expose SQL or full paths
   - PII in Logs: Mitigated by AD7

---

### 3.5 docs/design/components.md

**Purpose**: Module breakdown, public interfaces, dependency graph.

**Required Content**:

1. **Module Overview**:
   ```
   contact_book_cli/
   ├── __init__.py          # Package marker, version
   ├── __main__.py          # Entry point: python -m contact_book_cli
   ├── cli.py               # Argument parsing, command routing
   ├── commands.py          # Business logic for each command
   ├── database.py          # Database connection, queries
   ├── models.py            # Data classes, validation
   ├── formatters.py        # Output formatting (table, JSON, CSV, vCard)
   └── exceptions.py        # Custom exception hierarchy
   ```

2. **Component Details** (for each module):

   **`__init__.py`**:
   - Purpose: Package marker and version
   - Contents: `__version__ = "0.1.0"`
   - Dependencies: None

   **`__main__.py`**:
   - Purpose: Entry point for `python -m contact_book_cli`
   - Contents: `from contact_book_cli.cli import main; main()`
   - Dependencies: cli

   **`cli.py`**:
   - Purpose: Parse CLI args, route to command handlers
   - Responsibilities: Define argparse, validate input at boundary, map exceptions to exit codes, handle --verbose
   - Public interface: `main()` entry point
   - Dependencies: commands, exceptions
   - MUST NOT: Access database directly, import sqlite3, contain business logic

   **`commands.py`**:
   - Purpose: Business logic for each CLI command
   - Responsibilities: Implement command functions, coordinate database and formatters, enforce business rules
   - Public interface:
     - `cmd_init(db_path: str, force: bool) → None`
     - `cmd_add(db_path: str, name: str, email: str | None, phone: str | None, company: str | None, notes: str | None) → int`
     - `cmd_edit(db_path: str, contact_id: int, **fields) → None`
     - `cmd_show(db_path: str, contact_id: int | None, email: str | None) → Contact`
     - `cmd_list(db_path: str, group: str | None) → list[Contact]`
     - `cmd_search(db_path: str, name: str | None, email: str | None, company: str | None, group: str | None) → list[Contact]`
     - `cmd_delete(db_path: str, contact_id: int, force: bool) → None`
     - `cmd_group_create(db_path: str, name: str, description: str | None) → int`
     - `cmd_group_list(db_path: str) → list[Group]`
     - `cmd_group_delete(db_path: str, group_id: int, force: bool) → None`
     - `cmd_assign(db_path: str, contact_id: int, group_name: str) → None`
     - `cmd_unassign(db_path: str, contact_id: int, group_name: str) → None`
     - `cmd_export_csv(db_path: str, output: str, group: str | None, force: bool) → int`
     - `cmd_export_vcard(db_path: str, output: str, contact_id: int | None, group: str | None, force: bool) → int`
     - `cmd_import_csv(db_path: str, input_path: str, skip_errors: bool) → tuple[int, int]`
     - `cmd_merge(db_path: str, target_id: int, source_id: int) → None`
   - Dependencies: database, models, exceptions
   - MUST NOT: Parse CLI args, print to stdout/stderr, handle exit codes

   **`database.py`**:
   - Purpose: Database connection and SQL operations
   - Responsibilities: Create/connect SQLite, schema migrations, parameterized queries, transactions
   - Public interface:
     - `init_database(path: str) → None`
     - `get_connection(path: str) → ContextManager[sqlite3.Connection]`
     - `insert_contact(conn, contact: Contact) → int`
     - `update_contact(conn, contact: Contact) → None`
     - `delete_contact(conn, contact_id: int) → None`
     - `find_contact_by_id(conn, contact_id: int) → Contact | None`
     - `find_contact_by_email(conn, email: str) → Contact | None`
     - `search_contacts(conn, name: str | None, email: str | None, company: str | None) → list[Contact]`
     - `get_all_contacts(conn, group_id: int | None) → list[Contact]`
     - `insert_group(conn, group: Group) → int`
     - `delete_group(conn, group_id: int) → None`
     - `find_group_by_name(conn, name: str) → Group | None`
     - `find_group_by_id(conn, group_id: int) → Group | None`
     - `get_all_groups(conn) → list[Group]`
     - `add_contact_to_group(conn, contact_id: int, group_id: int) → None`
     - `remove_contact_from_group(conn, contact_id: int, group_id: int) → None`
     - `get_groups_for_contact(conn, contact_id: int) → list[Group]`
     - `get_contacts_in_group(conn, group_id: int) → list[Contact]`
   - Dependencies: models, exceptions
   - MUST NOT: Validate business rules, format output
   - CRITICAL: ALL queries use parameterized placeholders (`?`)

   **`models.py`**:
   - Purpose: Data classes and validation logic
   - Public interface:
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

     def validate_name(name: str) → str  # raises ValidationError
     def validate_email(email: str | None) → str | None  # raises ValidationError
     def validate_phone(phone: str | None) → str | None  # raises ValidationError
     def validate_company(company: str | None) → str | None  # raises ValidationError
     def validate_notes(notes: str | None) → str | None  # raises ValidationError
     def validate_group_name(name: str) → str  # raises ValidationError
     def validate_path(path: str) → str  # raises ValidationError
     ```
   - Dependencies: exceptions

   **`formatters.py`**:
   - Purpose: Format data for output
   - Public interface:
     - `format_contact_table(contacts: list[Contact]) → str`
     - `format_contact_json(contacts: list[Contact]) → str`
     - `format_contact_detail(contact: Contact) → str`  # Full card view
     - `format_group_table(groups: list[Group]) → str`
     - `format_group_json(groups: list[Group]) → str`
     - `write_csv(contacts: list[Contact], path: str) → None`
     - `write_vcard(contacts: list[Contact], path: str) → None`
   - Dependencies: models

   **`exceptions.py`**:
   - Purpose: Custom exception hierarchy
   - Contents:
     ```python
     class ContactBookError(Exception):
         exit_code = 1

     class ValidationError(ContactBookError):
         exit_code = 1

     class DatabaseError(ContactBookError):
         exit_code = 2

     class ContactNotFoundError(ContactBookError):
         exit_code = 3

     class GroupNotFoundError(ContactBookError):
         exit_code = 3

     class DuplicateError(ContactBookError):
         exit_code = 4
     ```
   - Dependencies: None

3. **Dependency Graph**:
   ```
   cli.py
     ├── commands.py
     │     ├── database.py
     │     │     ├── models.py
     │     │     └── exceptions.py
     │     ├── models.py
     │     └── exceptions.py
     ├── formatters.py
     │     └── models.py
     └── exceptions.py
   ```
   Rule: No circular dependencies. Lower layers don't import from higher.

---

## 4. Systems Docs Outline

### 4.1 docs/systems/architecture/ARCHITECTURE-simple.md

**Purpose**: Layer diagram, layer rules, data flow examples, security rules.

**Required Content**:

1. **System Overview Diagram**:
   ```
   ┌─────────────────────────────────────────────────────────┐
   │                    USER (Terminal)                       │
   └─────────────────────────┬───────────────────────────────┘
                             │ CLI arguments
                             ▼
   ┌─────────────────────────────────────────────────────────┐
   │                      cli.py                              │
   │  - Parse arguments (argparse)                           │
   │  - Validate input at boundary                           │
   │  - Route to command handlers                            │
   │  - Map exceptions to exit codes                         │
   └─────────────────────────┬───────────────────────────────┘
                             │ Validated parameters
                             ▼
   ┌─────────────────────────────────────────────────────────┐
   │                    commands.py                           │
   │  - Business logic per command                           │
   │  - Coordinate database + formatters                     │
   │  - Enforce business rules                               │
   └──────────────┬──────────────────────────┬───────────────┘
                  │                          │
                  ▼                          ▼
   ┌──────────────────────────┐  ┌───────────────────────────┐
   │      database.py         │  │      formatters.py        │
   │  - SQL queries           │  │  - Table output           │
   │  - Transactions          │  │  - JSON output            │
   │  - Connection mgmt       │  │  - CSV/vCard export       │
   └──────────────┬───────────┘  └───────────────────────────┘
                  │
                  ▼
   ┌──────────────────────────┐
   │    SQLite (file)         │
   │    contacts.db           │
   └──────────────────────────┘
   ```

2. **Layer Rules** (MUST/MUST NOT for each layer):

   **CLI Layer (cli.py)**:
   - MUST: Parse all arguments with argparse
   - MUST: Validate all user input before passing to commands
   - MUST: Catch ContactBookError subclasses and convert to exit codes
   - MUST: Print user-facing messages to stdout/stderr
   - MUST NOT: Access database directly, import sqlite3, contain business logic

   **Command Layer (commands.py)**:
   - MUST: Implement one function per CLI command
   - MUST: Accept validated, typed parameters
   - MUST: Return data (not formatted strings)
   - MUST: Raise specific exception types
   - MUST NOT: Parse CLI arguments, print to stdout/stderr, handle exit codes

   **Database Layer (database.py)**:
   - MUST: Use parameterized queries exclusively (`?` placeholders)
   - MUST: Use context managers for connections
   - MUST: Use transactions for multi-statement operations
   - MUST: Return model objects (not raw tuples)
   - MUST NOT: Validate business rules, format output, use string interpolation in queries

   **Formatter Layer (formatters.py)**:
   - MUST: Accept model objects as input
   - MUST: Return strings or write files
   - MUST: Handle edge cases (empty lists, None values)
   - MUST NOT: Access database, make business decisions

3. **Data Flow Examples**:

   **Add Contact**:
   ```
   User: contact-cli add --name "Jane Smith" --email "jane@example.com"
                               │
   cli.py: parse args          │
   cli.py: validate_name("Jane Smith")     ✓
   cli.py: validate_email("jane@example.com") ✓
                               │
   commands.py: cmd_add(db_path, name, email, ...)
   commands.py: check email not duplicate
   commands.py: create Contact model
   commands.py: call database.insert_contact()
                               │
   database.py: INSERT INTO contacts (...) VALUES (?, ?, ...)
   database.py: return inserted id
                               │
   cli.py: print "Contact created: Jane Smith (ID: 1)"
   cli.py: exit(0)
   ```

   **Search with SQL Injection Attempt**:
   ```
   User: contact-cli search --name "'; DROP TABLE--"
                               │
   cli.py: parse args          │
   cli.py: passes through (search is lenient)
                               │
   commands.py: cmd_search(db_path, name="'; DROP TABLE--", ...)
                               │
   database.py: SELECT ... WHERE LOWER(name) LIKE LOWER(?)
                param: ("%'; DROP TABLE--%",)
                → SQLite treats as literal string
                → Returns empty result (no injection)
                               │
   cli.py: print empty table
   cli.py: exit(0)
   ```

4. **Critical Security Rules**:

   **S1: Parameterized Queries Only**
   ```python
   # CORRECT
   cursor.execute("SELECT * FROM contacts WHERE email = ?", (email,))

   # WRONG - SQL INJECTION VULNERABILITY
   cursor.execute(f"SELECT * FROM contacts WHERE email = '{email}'")
   ```
   Enforcement: Code review. Any string interpolation in SQL is a blocking issue.

   **S2: Path Validation**
   For --db and --output arguments:
   - Must not contain `..` (path traversal)
   - Must be absolute path or relative to cwd
   - Must be writable by current user
   ```python
   def validate_path(path: str) -> str:
       if ".." in path:
           raise ValidationError("Path cannot contain '..'")
       return os.path.abspath(path)
   ```

   **S3: Error Message Sanitization**
   Error messages must NOT include:
   - Full file paths (only basename)
   - SQL query text
   - Stack traces (unless --verbose)
   - Database internal errors
   ```python
   # CORRECT
   "Error: Database file not found"

   # WRONG - exposes internal path
   "Error: /home/user/secret/db.sqlite not found"
   ```

   **S4: PII Protection**
   - NEVER log email addresses, phone numbers, or notes content
   - Error messages use contact IDs, not personal data
   - Verbose mode shows operation types, not data values
   ```python
   # CORRECT
   "DEBUG: Searching contacts by name"

   # WRONG - exposes PII
   "DEBUG: Searching for email jane@example.com"
   ```

5. **File Locations Table**:
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

6. **Entry Points**:
   - As module: `python -m contact_book_cli [command] [args]`
   - As script: `contact-cli [command] [args]`
   Both invoke `cli.main()`.

---

### 4.2 docs/systems/database/schema.md

**Purpose**: Exact CREATE TABLE statements, column specifications, all query patterns with parameterized placeholders.

**Required Content**:

1. **Database File**:
   - Engine: SQLite 3
   - File: User-specified via `--db` (default: `./contacts.db`)
   - Encoding: UTF-8
   - Permissions: Should be 0600 (owner read/write only)

2. **Schema Definition**:
   ```sql
   -- Contacts table: core contact data
   CREATE TABLE IF NOT EXISTS contacts (
       id          INTEGER PRIMARY KEY AUTOINCREMENT,
       name        TEXT    NOT NULL,
       email       TEXT    UNIQUE,
       phone       TEXT,
       company     TEXT,
       notes       TEXT,
       created_at  TEXT    NOT NULL,
       updated_at  TEXT    NOT NULL
   );

   -- Groups table: contact groupings
   CREATE TABLE IF NOT EXISTS groups (
       id          INTEGER PRIMARY KEY AUTOINCREMENT,
       name        TEXT    NOT NULL UNIQUE,
       description TEXT,
       created_at  TEXT    NOT NULL
   );

   -- Junction table: many-to-many contact-group relationship
   CREATE TABLE IF NOT EXISTS contact_groups (
       contact_id  INTEGER NOT NULL,
       group_id    INTEGER NOT NULL,
       PRIMARY KEY (contact_id, group_id),
       FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
       FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
   );

   -- Indexes for common queries
   CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
   CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
   CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
   ```

3. **Column Specifications**:

   **Contacts**:
   | Column | Type | Nullable | Default | Constraints | Notes |
   |--------|------|----------|---------|-------------|-------|
   | id | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
   | name | TEXT | No | - | - | Max 200 chars (app-enforced) |
   | email | TEXT | Yes | NULL | UNIQUE | Max 254 chars (app-enforced) |
   | phone | TEXT | Yes | NULL | - | Max 50 chars (app-enforced) |
   | company | TEXT | Yes | NULL | - | Max 200 chars (app-enforced) |
   | notes | TEXT | Yes | NULL | - | Max 5000 chars (app-enforced) |
   | created_at | TEXT | No | - | - | ISO 8601 format |
   | updated_at | TEXT | No | - | - | ISO 8601 format |

   **Groups**:
   | Column | Type | Nullable | Default | Constraints | Notes |
   |--------|------|----------|---------|-------------|-------|
   | id | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
   | name | TEXT | No | - | UNIQUE | Max 100 chars (app-enforced) |
   | description | TEXT | Yes | NULL | - | Max 500 chars (app-enforced) |
   | created_at | TEXT | No | - | - | ISO 8601 format |

   **Contact_Groups**:
   | Column | Type | Nullable | Constraints |
   |--------|------|----------|-------------|
   | contact_id | INTEGER | No | FK → contacts.id, ON DELETE CASCADE |
   | group_id | INTEGER | No | FK → groups.id, ON DELETE CASCADE |
   | PRIMARY KEY (contact_id, group_id) |

4. **Timestamp Format**:
   ```
   YYYY-MM-DDTHH:MM:SS.ffffffZ
   ```
   Example: `2026-01-21T15:30:45.123456Z`
   Python: `datetime.now(timezone.utc).isoformat()`

5. **Query Patterns**:

   **Insert Contact**:
   ```sql
   INSERT INTO contacts (name, email, phone, company, notes, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?);
   ```
   Parameters: `(name, email, phone, company, notes, created_at, updated_at)`
   Returns: `cursor.lastrowid`

   **Update Contact**:
   ```sql
   UPDATE contacts
   SET name = ?, email = ?, phone = ?, company = ?, notes = ?, updated_at = ?
   WHERE id = ?;
   ```
   Parameters: `(name, email, phone, company, notes, updated_at, id)`

   **Delete Contact**:
   ```sql
   DELETE FROM contacts WHERE id = ?;
   ```
   Parameters: `(id,)`

   **Find Contact by ID**:
   ```sql
   SELECT id, name, email, phone, company, notes, created_at, updated_at
   FROM contacts
   WHERE id = ?;
   ```
   Parameters: `(id,)`

   **Find Contact by Email**:
   ```sql
   SELECT id, name, email, phone, company, notes, created_at, updated_at
   FROM contacts
   WHERE email = ?;
   ```
   Parameters: `(email,)`

   **Search Contacts** (dynamic query building):
   ```sql
   SELECT id, name, email, phone, company, notes, created_at, updated_at
   FROM contacts
   WHERE 1=1
     AND LOWER(name) LIKE LOWER(?)      -- if name provided
     AND LOWER(email) LIKE LOWER(?)     -- if email provided
     AND LOWER(company) LIKE LOWER(?);  -- if company provided
   ```
   Build dynamically:
   ```python
   query = "SELECT ... FROM contacts WHERE 1=1"
   params = []
   if name:
       query += " AND LOWER(name) LIKE LOWER(?)"
       params.append(f"%{name}%")
   if email:
       query += " AND LOWER(email) LIKE LOWER(?)"
       params.append(f"%{email}%")
   if company:
       query += " AND LOWER(company) LIKE LOWER(?)"
       params.append(f"%{company}%")
   ```

   **Get All Contacts**:
   ```sql
   SELECT id, name, email, phone, company, notes, created_at, updated_at
   FROM contacts
   ORDER BY name;
   ```

   **Get Contacts in Group**:
   ```sql
   SELECT c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at, c.updated_at
   FROM contacts c
   JOIN contact_groups cg ON c.id = cg.contact_id
   WHERE cg.group_id = ?
   ORDER BY c.name;
   ```
   Parameters: `(group_id,)`

   **Insert Group**:
   ```sql
   INSERT INTO groups (name, description, created_at)
   VALUES (?, ?, ?);
   ```
   Parameters: `(name, description, created_at)`

   **Delete Group**:
   ```sql
   DELETE FROM groups WHERE id = ?;
   ```
   Parameters: `(id,)`

   **Find Group by Name**:
   ```sql
   SELECT id, name, description, created_at
   FROM groups
   WHERE name = ?;
   ```
   Parameters: `(name,)`

   **Get All Groups**:
   ```sql
   SELECT id, name, description, created_at
   FROM groups
   ORDER BY name;
   ```

   **Add Contact to Group**:
   ```sql
   INSERT OR IGNORE INTO contact_groups (contact_id, group_id)
   VALUES (?, ?);
   ```
   Parameters: `(contact_id, group_id)`

   **Remove Contact from Group**:
   ```sql
   DELETE FROM contact_groups
   WHERE contact_id = ? AND group_id = ?;
   ```
   Parameters: `(contact_id, group_id)`

   **Get Groups for Contact**:
   ```sql
   SELECT g.id, g.name, g.description, g.created_at
   FROM groups g
   JOIN contact_groups cg ON g.id = cg.group_id
   WHERE cg.contact_id = ?
   ORDER BY g.name;
   ```
   Parameters: `(contact_id,)`

6. **Connection Management**:
   ```python
   @contextmanager
   def get_connection(db_path: str):
       conn = sqlite3.connect(db_path)
       conn.row_factory = sqlite3.Row
       conn.execute("PRAGMA foreign_keys = ON")  # Enable FK enforcement
       try:
           yield conn
           conn.commit()
       except Exception:
           conn.rollback()
           raise
       finally:
           conn.close()
   ```

7. **Example Data**:
   ```sql
   INSERT INTO contacts (name, email, phone, company, notes, created_at, updated_at)
   VALUES
       ('Jane Smith', 'jane@example.com', '+1-555-123-4567', 'Acme Corp', 'Met at TechConf', '2026-01-15T10:00:00Z', '2026-01-15T10:00:00Z'),
       ('John Doe', 'john.doe@bigco.com', '+1-555-987-6543', 'BigCo Inc', NULL, '2026-01-16T11:00:00Z', '2026-01-16T11:00:00Z');

   INSERT INTO groups (name, description, created_at)
   VALUES
       ('Clients', 'Business clients', '2026-01-14T09:00:00Z'),
       ('Conference', 'People met at conferences', '2026-01-14T09:00:00Z');

   INSERT INTO contact_groups (contact_id, group_id) VALUES (1, 1), (1, 2), (2, 1);
   ```

---

### 4.3 docs/systems/cli/interface.md

**Purpose**: Every command with syntax, options, behavior, outputs, exit codes.

**Required Content**:

1. **Global Options**:
   | Option | Type | Default | Description |
   |--------|------|---------|-------------|
   | `--db PATH` | string | `./contacts.db` | Path to SQLite database file |
   | `--verbose` | flag | false | Enable debug output |
   | `--help` | flag | - | Show help for command |
   | `--version` | flag | - | Show version number |

2. **Commands**:

   **`init`** - Initialize a new contacts database
   ```
   contact-cli init [--db PATH] [--force]
   ```
   Options:
   | Option | Type | Default | Description |
   |--------|------|---------|-------------|
   | `--force` | flag | false | Overwrite existing database |

   Behavior:
   1. Check if database file exists
   2. If exists and no --force → error, exit 1
   3. If exists and --force → delete existing
   4. Create new database with schema
   5. Print success message

   Output (success): `Database initialized at ./contacts.db`
   Output (exists): `Error: Database already exists at contacts.db. Use --force to recreate.`
   Exit codes: 0=success, 1=exists without force, 2=cannot create

   ---

   **`add`** - Add a new contact
   ```
   contact-cli add --name NAME [--email EMAIL] [--phone PHONE] [--company COMPANY] [--notes NOTES]
   ```
   Required:
   | Option | Type | Constraints |
   |--------|------|-------------|
   | `--name NAME` | string | 1-200 chars, non-empty |

   Optional:
   | Option | Type | Constraints |
   |--------|------|-------------|
   | `--email EMAIL` | string | Valid email format, max 254 chars |
   | `--phone PHONE` | string | Max 50 chars |
   | `--company COMPANY` | string | Max 200 chars |
   | `--notes NOTES` | string | Max 5000 chars |

   Behavior:
   1. Validate all inputs
   2. Check email uniqueness (if provided)
   3. Insert into database
   4. Return created contact ID

   Output (success): `Contact created: Jane Smith (ID: 1)`
   Output (duplicate email): `Error: Email 'jane@example.com' already exists.`
   Output (invalid email): `Error: Invalid email format.`
   Exit codes: 0=success, 1=validation error, 2=database error, 4=duplicate

   ---

   **`edit`** - Modify an existing contact
   ```
   contact-cli edit ID [--name NAME] [--email EMAIL] [--phone PHONE] [--company COMPANY] [--notes NOTES]
   ```
   Required:
   | Option | Type | Description |
   |--------|------|-------------|
   | `ID` | integer | Contact ID to edit |

   Optional (at least one required):
   | Option | Type | Description |
   |--------|------|-------------|
   | `--name NAME` | string | New name |
   | `--email EMAIL` | string | New email (use "" to clear) |
   | `--phone PHONE` | string | New phone (use "" to clear) |
   | `--company COMPANY` | string | New company (use "" to clear) |
   | `--notes NOTES` | string | New notes (use "" to clear) |

   Behavior:
   1. Find contact by ID
   2. If not found → error, exit 3
   3. Validate new values
   4. Update only provided fields
   5. Print confirmation

   Output (success): `Contact updated: Jane Smith (ID: 1)`
   Output (not found): `Error: Contact ID 42 not found.`
   Exit codes: 0=success, 1=validation error, 2=database error, 3=not found, 4=duplicate email

   ---

   **`show`** - Display full contact details
   ```
   contact-cli show (ID | --email EMAIL) [--format FORMAT]
   ```
   Required (one of):
   | Option | Type | Description |
   |--------|------|-------------|
   | `ID` | integer | Contact ID |
   | `--email EMAIL` | string | Contact email |

   Optional:
   | Option | Type | Default | Values |
   |--------|------|---------|--------|
   | `--format FORMAT` | string | `card` | `card`, `json` |

   Behavior:
   1. Find contact by ID or email
   2. If not found → error, exit 3
   3. Load contact groups
   4. Display full details

   Output (card format):
   ```
   ═══════════════════════════════════════
   Jane Smith
   ═══════════════════════════════════════
   Email:    jane@example.com
   Phone:    +1-555-123-4567
   Company:  Acme Corp
   ───────────────────────────────────────
   Notes:
   Met at TechConf 2026. Interested in partnership.
   ───────────────────────────────────────
   Groups:   Clients, Conference
   ───────────────────────────────────────
   Created:  2026-01-15 10:00:00
   Updated:  2026-01-20 14:30:00
   ```

   Exit codes: 0=success, 1=no identifier provided, 2=database error, 3=not found

   ---

   **`list`** - List all contacts
   ```
   contact-cli list [--group GROUP] [--format FORMAT]
   ```
   Optional:
   | Option | Type | Default | Description |
   |--------|------|---------|-------------|
   | `--group GROUP` | string | (all) | Filter by group name |
   | `--format FORMAT` | string | `table` | `table`, `json` |

   Output (table):
   ```
   ID   | Name          | Email                | Phone           | Company
   -----|---------------|----------------------|-----------------|----------
   1    | Jane Smith    | jane@example.com     | +1-555-123-4567 | Acme Corp
   2    | John Doe      | john.doe@bigco.com   | +1-555-987-6543 | BigCo Inc
   ```

   Exit codes: 0=success (including empty), 2=database error, 3=group not found

   ---

   **`search`** - Find contacts matching criteria
   ```
   contact-cli search (--name NAME | --email EMAIL | --company COMPANY | --group GROUP) [--format FORMAT]
   ```
   Search options (at least one required):
   | Option | Type | Description |
   |--------|------|-------------|
   | `--name NAME` | string | Partial name match (case-insensitive) |
   | `--email EMAIL` | string | Partial email match |
   | `--company COMPANY` | string | Partial company match |
   | `--group GROUP` | string | Exact group name |

   Output options:
   | Option | Type | Default | Values |
   |--------|------|---------|--------|
   | `--format FORMAT` | string | `table` | `table`, `json` |

   Behavior:
   1. At least one search criterion required
   2. Multiple criteria are AND'd
   3. Name/email/company are partial, case-insensitive
   4. Group is exact match

   Exit codes: 0=success (including empty), 1=no criteria, 2=database error

   ---

   **`delete`** - Remove a contact
   ```
   contact-cli delete ID [--force]
   ```
   Required:
   | Option | Type | Description |
   |--------|------|-------------|
   | `ID` | integer | Contact ID to delete |

   Optional:
   | Option | Type | Description |
   |--------|------|-------------|
   | `--force` | flag | Skip confirmation prompt |

   Behavior:
   1. Find contact by ID
   2. If not found → error, exit 3
   3. If no --force → prompt for confirmation
   4. Delete contact (cascade removes from groups)
   5. Print confirmation

   Output (success): `Contact deleted: Jane Smith (ID: 1)`
   Output (not found): `Error: Contact ID 42 not found.`
   Exit codes: 0=success, 2=database error, 3=not found

   ---

   **`group`** - Manage contact groups
   ```
   contact-cli group create --name NAME [--description DESC]
   contact-cli group list [--format FORMAT]
   contact-cli group delete ID [--force]
   ```

   **group create**:
   Output (success): `Group created: Clients (ID: 1)`
   Output (duplicate): `Error: Group 'Clients' already exists.`
   Exit codes: 0=success, 1=validation, 2=database, 4=duplicate

   **group list**:
   Output (table):
   ```
   ID   | Name          | Description           | Contacts
   -----|---------------|-----------------------|----------
   1    | Clients       | Business clients      | 15
   2    | Conference    | People from confs     | 8
   ```
   Exit codes: 0=success

   **group delete**:
   Output (success): `Group deleted: Clients (ID: 1)`
   Note: Does not delete contacts, only removes group membership
   Exit codes: 0=success, 2=database, 3=not found

   ---

   **`assign`** - Add contact to group
   ```
   contact-cli assign CONTACT_ID --group GROUP_NAME
   ```
   Required:
   | Option | Type | Description |
   |--------|------|-------------|
   | `CONTACT_ID` | integer | Contact ID |
   | `--group GROUP_NAME` | string | Group name |

   Output (success): `Added Jane Smith to group 'Clients'`
   Output (already member): `Jane Smith is already in group 'Clients'`
   Exit codes: 0=success, 2=database, 3=contact/group not found

   ---

   **`unassign`** - Remove contact from group
   ```
   contact-cli unassign CONTACT_ID --group GROUP_NAME
   ```
   Output (success): `Removed Jane Smith from group 'Clients'`
   Exit codes: 0=success, 2=database, 3=contact/group not found

   ---

   **`export-csv`** - Export contacts to CSV
   ```
   contact-cli export-csv --output PATH [--group GROUP] [--force]
   ```
   Required:
   | Option | Type | Description |
   |--------|------|-------------|
   | `--output PATH` | string | Output file path |

   Optional:
   | Option | Type | Description |
   |--------|------|-------------|
   | `--group GROUP` | string | Export only contacts in group |
   | `--force` | flag | Overwrite existing file |

   CSV format:
   - Header: `name,email,phone,company,notes`
   - Encoding: UTF-8
   - Delimiter: comma
   - Quote character: double-quote
   - Line ending: LF

   Output (success): `Exported 150 contacts to contacts.csv`
   Output (file exists): `Error: File 'contacts.csv' already exists. Use --force to overwrite.`
   Exit codes: 0=success, 1=file exists/path error, 2=database

   ---

   **`export-vcard`** - Export contacts to vCard format
   ```
   contact-cli export-vcard --output PATH [--id ID] [--group GROUP] [--force]
   ```
   Required:
   | Option | Type | Description |
   |--------|------|-------------|
   | `--output PATH` | string | Output file path (.vcf) |

   Optional:
   | Option | Type | Description |
   |--------|------|-------------|
   | `--id ID` | integer | Export single contact |
   | `--group GROUP` | string | Export contacts in group |
   | `--force` | flag | Overwrite existing file |

   vCard format (3.0):
   ```
   BEGIN:VCARD
   VERSION:3.0
   FN:Jane Smith
   EMAIL:jane@example.com
   TEL:+1-555-123-4567
   ORG:Acme Corp
   NOTE:Met at TechConf
   END:VCARD
   ```

   Exit codes: 0=success, 1=file exists/path error, 2=database, 3=not found

   ---

   **`import-csv`** - Import contacts from CSV
   ```
   contact-cli import-csv --input PATH [--skip-errors]
   ```
   Required:
   | Option | Type | Description |
   |--------|------|-------------|
   | `--input PATH` | string | Input CSV file path |

   Optional:
   | Option | Type | Description |
   |--------|------|-------------|
   | `--skip-errors` | flag | Continue on validation errors |

   Expected CSV format:
   - Header row required: `name,email,phone,company,notes`
   - At minimum `name` column required

   Output (success): `Imported 45 contacts (3 skipped due to errors)`
   Exit codes: 0=success, 1=validation errors (without --skip-errors), 2=file/database error

   ---

   **`merge`** - Merge duplicate contacts
   ```
   contact-cli merge TARGET_ID SOURCE_ID [--force]
   ```
   Required:
   | Option | Type | Description |
   |--------|------|-------------|
   | `TARGET_ID` | integer | Contact to keep |
   | `SOURCE_ID` | integer | Contact to merge and delete |

   Optional:
   | Option | Type | Description |
   |--------|------|-------------|
   | `--force` | flag | Skip confirmation prompt |

   Behavior:
   1. Find both contacts
   2. Merge: fill empty fields in target from source
   3. Transfer all group memberships from source to target
   4. Delete source contact
   5. Print summary

   Output (success):
   ```
   Merged contact 43 into 42:
   - Kept: Jane Smith
   - Added phone: +1-555-999-8888
   - Added groups: Conference
   Contact 43 deleted.
   ```

   Exit codes: 0=success, 1=same IDs, 2=database, 3=not found

3. **Input Validation Rules**:

   **Name**: Non-empty, max 200 chars

   **Email**:
   - Contains exactly one @
   - At least one char before @
   - At least one char after @
   - No spaces
   - Max 254 chars
   - Regex: `^[^\s@]+@[^\s@]+$` (basic validation)

   **Phone**: Max 50 chars, any printable chars

   **Company**: Max 200 chars

   **Notes**: Max 5000 chars

   **Group name**: Non-empty, max 100 chars

   **Path**: Must not contain `..`, converted to absolute path

4. **Output Standards**:

   **Table Format**:
   - Column headers in first row
   - Separator line of dashes and pipes
   - Fixed-width columns, truncate with `...`
   - Column widths: ID=4, Name=20, Email=25, Phone=15, Company=15

   **JSON Format**:
   - Pretty-printed with 2-space indent
   - Arrays for lists
   - NULL values included with `null`
   - UTF-8 encoding

   **Error Messages**:
   - Prefix: `Error: `
   - Written to stderr
   - No stack traces unless --verbose
   - No internal paths or SQL

---

### 4.4 docs/systems/errors.md

**Purpose**: Exit codes, exception hierarchy, error message templates, handling rules.

**Required Content**:

1. **Exit Codes**:
   | Code | Name | Meaning |
   |------|------|---------|
   | 0 | SUCCESS | Operation completed successfully |
   | 1 | GENERAL_ERROR | Invalid arguments, validation failure, general errors |
   | 2 | DATABASE_ERROR | Database connection failed, query failed, file issues |
   | 3 | NOT_FOUND | Requested contact or group does not exist |
   | 4 | DUPLICATE | Contact with this email or group with this name already exists |

2. **Exception Hierarchy**:
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
   ```

3. **Error Message Templates**:

   **Validation Errors (Exit 1)**:
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
   Error: Path cannot contain '..'.
   Error: At least one search criterion required (--name, --email, --company, or --group).
   Error: At least one field to update required.
   Error: Must specify contact ID or --email.
   Error: Cannot merge contact with itself.
   Error: File '{filename}' already exists. Use --force to overwrite.
   Error: Database already exists at {filename}. Use --force to recreate.
   ```

   **Database Errors (Exit 2)**:
   ```
   Error: Cannot create database '{filename}': Permission denied.
   Error: Cannot open database '{filename}': File not found.
   Error: Database operation failed. Run with --verbose for details.
   Error: Cannot write to '{filename}': Permission denied.
   Error: Cannot read file '{filename}'.
   ```

   **Not Found Errors (Exit 3)**:
   ```
   Error: Contact ID {id} not found.
   Error: Contact with email '{email}' not found.
   Error: Group '{name}' not found.
   ```

   **Duplicate Errors (Exit 4)**:
   ```
   Error: Email '{email}' already exists.
   Error: Group '{name}' already exists.
   ```

4. **Error Handling Rules**:

   **Rule 1: Catch at CLI Layer**
   ```python
   def main():
       try:
           result = dispatch_command(args)
           sys.exit(0)
       except ContactBookError as e:
           print(f"Error: {e.message}", file=sys.stderr)
           sys.exit(e.exit_code)
       except Exception as e:
           if args.verbose:
               traceback.print_exc()
           print("Error: An unexpected error occurred.", file=sys.stderr)
           sys.exit(1)
   ```

   **Rule 2: Never Expose Internals**
   - No full file paths (use basename)
   - No SQL query text
   - No stack traces without --verbose
   - No internal exception types

   **Rule 3: Never Expose PII**
   - Don't include email/phone in error messages where avoidable
   - Use contact IDs instead of names in logs
   - Never log notes content

   **Rule 4: Be Specific**
   - Report first validation error found
   - Use specific exception types

   **Rule 5: Preserve Original Exceptions**
   ```python
   try:
       cursor.execute(query, params)
   except sqlite3.IntegrityError as e:
       if "UNIQUE constraint" in str(e) and "email" in str(e):
           raise DuplicateError(f"Email already exists.") from e
       raise DatabaseError("Database constraint violation.") from e
   ```

5. **Verbose Mode**:
   - Print debug info during execution
   - Print stack traces on error
   - Include full file paths
   - NEVER expose SQL query text or PII

---

## 5. Tasks Breakdown

### 5.1 tasks/task1.md - Data Layer

**Title**: Task 1: Data Layer

**Purpose**: Implement the foundation modules for the Contact Book CLI.

**Context - Read Before Starting**:
- `docs/design/technical.md` - Architecture decisions (AD1-AD7)
- `docs/design/components.md` - Module specifications
- `docs/systems/database/schema.md` - SQLite schema and query patterns
- `docs/systems/errors.md` - Exception hierarchy

**Scope**:
- [ ] `contact_book_cli/__init__.py` - Package marker with `__version__ = "0.1.0"`
- [ ] `contact_book_cli/exceptions.py` - Full exception hierarchy (ContactBookError, ValidationError, DatabaseError, ContactNotFoundError, GroupNotFoundError, DuplicateError)
- [ ] `contact_book_cli/models.py` - Contact and Group dataclasses, all validation functions
- [ ] `contact_book_cli/database.py` - Connection management, schema creation, all query functions

**Constraints**:
- **AD1**: Layered architecture - database layer must not validate business rules
- **AD4**: All queries MUST use parameterized placeholders (`?`). No string interpolation.
- **AD6**: Use context managers for all database connections
- **AD7**: Do not log PII values

**Tests Required**:
- Unit tests for all `validate_*()` functions
- Unit tests for each database function using in-memory SQLite
- Test exception hierarchy (exit codes, inheritance)
- Test foreign key cascade behavior

**Not In Scope**:
- CLI argument parsing (Task 2)
- Command business logic (Task 3)
- Output formatting (Task 3)
- Export commands (Task 4)

**Acceptance Criteria**:
```python
# Can create database and insert a contact
from contact_book_cli.database import init_database, get_connection, insert_contact
from contact_book_cli.models import Contact

init_database(":memory:")
with get_connection(":memory:") as conn:
    contact = Contact(id=None, name="Jane Smith", email="jane@example.com", ...)
    contact_id = insert_contact(conn, contact)
    assert contact_id == 1

# Can create group and add contact to it
from contact_book_cli.database import insert_group, add_contact_to_group
group = Group(id=None, name="Clients", description="Business clients", ...)
group_id = insert_group(conn, group)
add_contact_to_group(conn, contact_id, group_id)
groups = get_groups_for_contact(conn, contact_id)
assert len(groups) == 1
```

---

### 5.2 tasks/task2.md - CLI Framework + Init Command

**Title**: Task 2: CLI Framework + Init Command

**Purpose**: Implement argument parsing, command routing, and the init command.

**Context - Read Before Starting**:
- `docs/design/components.md` - cli.py and __main__.py specifications
- `docs/systems/cli/interface.md` - Global options, init command spec
- `docs/systems/errors.md` - Error handling rules
- `docs/systems/architecture/ARCHITECTURE-simple.md` - CLI layer rules

**Scope**:
- [ ] `contact_book_cli/__main__.py` - Entry point for `python -m contact_book_cli`
- [ ] `contact_book_cli/cli.py` - argparse setup with all global options and subcommands
- [ ] `init` command fully working with `--force` flag
- [ ] Exception-to-exit-code mapping in CLI layer
- [ ] `--verbose` flag implementation

**Constraints**:
- **AD5**: Validate all user input at CLI boundary before passing to commands
- **AD7**: Debug output must not include PII
- CLI layer MUST NOT import sqlite3 or access database directly
- CLI layer MUST NOT contain business logic
- Use argparse only (no Click, Typer, etc.)

**Tests Required**:
- CLI parses all global options correctly
- CLI routes to correct subcommand
- `init` creates database file
- `init` refuses to overwrite without `--force`
- `init --force` recreates database
- Exit codes correct for each error type
- `--version` shows version

**Not In Scope**:
- add, edit, show, list, search, delete commands (Task 3)
- group commands (Task 3)
- export/import commands (Task 4)
- Output formatting (Task 3)

**Acceptance Criteria**:
```bash
# Creates new database
python -m contact_book_cli init --db ./test.db
# Output: Database initialized at ./test.db
# Exit: 0

# Refuses to overwrite
python -m contact_book_cli init --db ./test.db
# Output: Error: Database already exists at test.db. Use --force to recreate.
# Exit: 1

# Force recreates
python -m contact_book_cli init --db ./test.db --force
# Output: Database initialized at ./test.db
# Exit: 0

# Shows version
python -m contact_book_cli --version
# Output: contact-cli 0.1.0
```

---

### 5.3 tasks/task3.md - Core Commands + Formatters

**Title**: Task 3: Core Commands + Formatters

**Purpose**: Implement contact and group CRUD, search, and output formatting.

**Context - Read Before Starting**:
- `docs/design/components.md` - commands.py and formatters.py specifications
- `docs/systems/cli/interface.md` - Command specs for add, edit, show, list, search, delete, group, assign, unassign
- `docs/systems/database/schema.md` - Query patterns
- `docs/systems/architecture/ARCHITECTURE-simple.md` - Layer rules

**Scope**:
- [ ] `contact_book_cli/commands.py` - Business logic for:
  - add, edit, show, list, search, delete (contacts)
  - group create, group list, group delete
  - assign, unassign
- [ ] `contact_book_cli/formatters.py` - Table, JSON, and card formatters
- [ ] Integration of commands into cli.py argument parser
- [ ] Input validation for all command arguments

**Constraints**:
- **AD1**: Commands return data, CLI layer handles formatting
- **AD4**: All queries use parameterized placeholders
- **AD5**: Validate inputs at CLI boundary
- **AD7**: Never log PII values
- Commands MUST NOT print to stdout/stderr
- Commands MUST NOT catch exceptions

**Tests Required**:
- add: success, duplicate email (exit 4), invalid email (exit 1)
- edit: success, not found (exit 3), duplicate email (exit 4)
- show: by ID, by email, not found (exit 3)
- list: all, by group, group not found (exit 3)
- search: by name, by email, by company, by group, combined, no results
- delete: success, not found (exit 3)
- group create: success, duplicate (exit 4)
- group list: success, empty
- group delete: success, not found (exit 3)
- assign/unassign: success, contact/group not found (exit 3)
- Table format: proper column widths, truncation, empty table
- JSON format: proper structure, null handling, empty array
- Card format: full contact display

**Not In Scope**:
- export-csv, export-vcard, import-csv commands (Task 4)
- merge command (Task 4)
- CSV/vCard formatting (Task 4)

**Acceptance Criteria**:
```bash
# Add contact
python -m contact_book_cli add --name "Jane Smith" --email "jane@example.com" --db ./test.db
# Output: Contact created: Jane Smith (ID: 1)
# Exit: 0

# Show contact
python -m contact_book_cli show 1 --db ./test.db
# Output: Full contact card
# Exit: 0

# Create group
python -m contact_book_cli group create --name "Clients" --db ./test.db
# Output: Group created: Clients (ID: 1)
# Exit: 0

# Assign to group
python -m contact_book_cli assign 1 --group "Clients" --db ./test.db
# Output: Added Jane Smith to group 'Clients'
# Exit: 0

# Search
python -m contact_book_cli search --name "jane" --db ./test.db
# Output: Table with Jane Smith
# Exit: 0

# List by group
python -m contact_book_cli list --group "Clients" --format json --db ./test.db
# Output: JSON array with Jane Smith
# Exit: 0
```

---

### 5.4 tasks/task4.md - Export/Import + Merge

**Title**: Task 4: Export/Import + Merge

**Purpose**: Implement export-csv, export-vcard, import-csv, and merge commands.

**Context - Read Before Starting**:
- `docs/design/components.md` - formatters.py CSV/vCard specification
- `docs/systems/cli/interface.md` - export-csv, export-vcard, import-csv, merge command specs
- `docs/systems/database/schema.md` - Get All Contacts query
- `docs/systems/architecture/ARCHITECTURE-simple.md` - S2 path validation, S4 PII protection

**Scope**:
- [ ] `export-csv` command in commands.py
- [ ] `export-vcard` command in commands.py
- [ ] `import-csv` command in commands.py
- [ ] `merge` command in commands.py
- [ ] CSV writing in formatters.py (RFC 4180 compliant)
- [ ] vCard writing in formatters.py (vCard 3.0)
- [ ] CSV parsing for import
- [ ] File existence checking with `--force` handling
- [ ] Path validation (no `..` traversal)

**Constraints**:
- **S2**: Validate paths - must not contain `..`
- **S4**: PII protection - notes may contain sensitive data
- CSV must be RFC 4180 compliant
- vCard must be version 3.0 compliant
- Error messages must use basename only
- Must handle existing file gracefully

**Tests Required**:
- export-csv: creates valid CSV, proper columns, escapes commas/quotes, group filter
- export-vcard: creates valid vCard 3.0, single contact, multiple contacts, group filter
- import-csv: valid file, missing name column, skip-errors flag, encoding
- merge: success, fields merged, groups merged, not found, same IDs
- File exists without --force → exit 1
- File exists with --force → overwrites
- Path with `..` → exit 1
- Output path not writable → exit 1

**Not In Scope**:
- All other commands (completed in Tasks 1-3)

**Acceptance Criteria**:
```bash
# Export CSV
python -m contact_book_cli export-csv --output contacts.csv --db ./test.db
# Output: Exported 10 contacts to contacts.csv
# Exit: 0
# File has header: name,email,phone,company,notes

# Export vCard
python -m contact_book_cli export-vcard --output contacts.vcf --group "Clients" --db ./test.db
# Output: Exported 5 contacts to contacts.vcf
# Exit: 0

# Import CSV
python -m contact_book_cli import-csv --input new_contacts.csv --db ./test.db
# Output: Imported 20 contacts (0 skipped)
# Exit: 0

# Merge contacts
python -m contact_book_cli merge 1 2 --db ./test.db
# Output: Merged contact 2 into 1...
# Exit: 0

# Path traversal blocked
python -m contact_book_cli export-csv --output ../../../etc/passwd --db ./test.db
# Output: Error: Path cannot contain '..'.
# Exit: 1
```

---

## 6. Security Test Surfaces Summary

For Falcon testing, app5 provides these security test surfaces:

| ID | Surface | Location | Attack Vector |
|----|---------|----------|---------------|
| B01 | SQL Injection | database.py | Contact names, company, notes, search queries |
| B02 | Input Validation | models.py, cli.py | Email format, phone format, name length |
| B03 | PII in Logs | cli.py verbose mode | Email/phone in debug output |
| B04 | Data Sanitization | formatters.py | Notes field in CSV/vCard export |
| S1 | Parameterized Queries | database.py | All SQL statements |
| S2 | Path Traversal | models.py validate_path | --db and --output paths |
| S3 | Error Leakage | exceptions.py, cli.py | Full paths, SQL in errors |
| S4 | PII Protection | all modules | Email/phone in any output |

These surfaces allow Falcon to test pattern detection for:
- SQL injection via string interpolation
- Missing input validation
- PII exposure in logs/errors
- Path traversal vulnerabilities
- Improper error handling

---

## Implementation Notes

1. Follow the exact directory structure specified
2. Each document must include all sections listed
3. All SQL must use parameterized queries (never string interpolation)
4. Error messages must use basename only for paths
5. PII (email, phone, notes) must never appear in logs or debug output
6. The many-to-many relationship requires careful handling of cascade deletes
7. vCard 3.0 format requires specific field formatting
8. CSV import must handle various encodings and malformed data
