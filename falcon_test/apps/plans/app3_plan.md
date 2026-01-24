# App3 Plan: Note-taking/Wiki CLI (notes-cli)

This document specifies exactly what needs to be created for app3, a pip-installable note-taking CLI with wiki-style linking. The plan is detailed enough for an implementation agent to create all files without ambiguity.

---

## 1. App Overview

**Name:** `notes-cli`

**Purpose:** A terminal-based note-taking system with wiki-style linking for developers who prefer command-line workflows.

**Target User:** Alex, a backend developer who:
- Takes notes during debugging sessions and code reviews
- Wants to link related concepts together (wiki-style)
- Prefers terminal over GUI applications
- Needs offline access (works on planes, trains)
- Values fast, keyboard-driven workflows

**Key Features:**
- Markdown notes stored as files in a configurable vault directory
- SQLite metadata index for fast search and link tracking
- Wiki-style `[[note-title]]` links between notes
- Tag-based organization
- Full-text search across all notes
- Export to various formats

**Technical Constraints:**
- Python 3.10+ with standard library only (no pip dependencies)
- SQLite for metadata (not content - content lives in markdown files)
- argparse for CLI parsing
- Works offline after initial install

**Security Surfaces for Falcon Testing:**
- **B02 (Path Traversal)**: Note paths, vault directory, export paths - MAJOR SURFACE
- **B01 (SQL Injection)**: Search queries, tag names, note titles
- **B11 (File Permissions)**: Vault directory permissions, note file permissions
- **Content Sanitization**: Note titles used in filenames

---

## 2. Directory Structure

```
falcon_test/apps/app3/
├── docs/
│   ├── design/
│   │   ├── INDEX.md              # Navigation and document map
│   │   ├── vision.md             # Problem, target user, solution
│   │   ├── use-cases.md          # 7 detailed usage scenarios
│   │   ├── technical.md          # Tech choices, architecture decisions
│   │   └── components.md         # Module breakdown, interfaces
│   └── systems/
│       ├── architecture/
│       │   └── ARCHITECTURE-simple.md  # Layer diagram, rules, security
│       ├── database/
│       │   └── schema.md         # SQLite schema, query patterns
│       ├── cli/
│       │   └── interface.md      # All commands with full specs
│       └── errors.md             # Exit codes, exceptions
├── tasks/
│   ├── task1.md                  # Data Layer
│   ├── task2.md                  # CLI Framework + Init/New commands
│   ├── task3.md                  # Core Commands (show, list, search, tag)
│   └── task4.md                  # Export/Backup/Link management
└── notes_cli/                    # Source code (created during implementation)
    ├── __init__.py
    ├── __main__.py
    ├── cli.py
    ├── commands.py
    ├── database.py
    ├── models.py
    ├── formatters.py
    ├── exceptions.py
    └── link_parser.py
```

---

## 3. Design Docs Outline

### 3.1 docs/design/INDEX.md

**Key Sections:**

1. **Document Map** - Table with columns: Document, Purpose, Read When
   - vision.md: Why we're building this, Always
   - use-cases.md: How the tool is used, Any user-facing change
   - technical.md: Architecture decisions, Any structural change
   - components.md: Module breakdown, Implementation work

2. **Systems Documentation** - Table linking to systems docs
   - systems/architecture/ARCHITECTURE-simple.md
   - systems/database/schema.md
   - systems/cli/interface.md
   - systems/errors.md

3. **Component Mapping** - Table mapping source files to design/systems docs
   - cli.py -> components.md, cli/interface.md, errors.md
   - commands.py -> components.md, architecture/ARCHITECTURE-simple.md
   - database.py -> technical.md, components.md, database/schema.md
   - models.py -> components.md, database/schema.md
   - formatters.py -> components.md, cli/interface.md
   - exceptions.py -> technical.md, components.md, errors.md
   - link_parser.py -> components.md, technical.md

4. **Architecture Decisions** - Table with columns: ID, Decision, Impact
   - AD1: Layered architecture, Module structure
   - AD2: No global state, All modules
   - AD3: Explicit error types, exceptions.py, cli.py
   - AD4: Parameterized queries only, database.py
   - AD5: Input validation at boundary, cli.py
   - AD6: Atomic database operations, database.py
   - AD7: Content in files, metadata in SQLite, database.py, commands.py
   - AD8: Filename sanitization for note titles, commands.py

5. **Security Considerations** - List with doc references
   - SQL Injection Prevention -> technical.md (AD4), ARCHITECTURE-simple.md (S1)
   - Path Traversal Prevention -> ARCHITECTURE-simple.md (S2)
   - Filename Sanitization -> ARCHITECTURE-simple.md (S3)
   - Error Message Sanitization -> ARCHITECTURE-simple.md (S4), errors.md

---

### 3.2 docs/design/vision.md

**Key Sections:**

1. **Problem Statement**
   - Developers need quick note-taking during coding sessions
   - Existing solutions problems:
     - GUI-based apps require context switching from terminal
     - Cloud-synced apps don't work offline
     - No linking between related concepts
     - Can't be scripted or automated

2. **Target User**
   - Name: Alex, backend developer
   - Takes 5-10 notes daily during debugging and code reviews
   - Wants to link related concepts (e.g., "HTTP caching" links to "Redis" and "CDN notes")
   - Works primarily in terminal (tmux, vim/neovim)
   - Sometimes offline (commute, flights)
   - Comfortable with markdown

3. **Solution**
   - pip-installable CLI tool
   - Vault directory with markdown files (human-readable, versionable)
   - SQLite index for metadata, tags, and links
   - Wiki-style [[note-title]] linking
   - Opens $EDITOR for editing notes
   - Machine-readable output (JSON) for scripting

4. **Non-Goals**
   - Multi-user access: Single user only, no auth
   - Cloud sync: No sync, no mobile, no web
   - WYSIWYG editing: Uses $EDITOR, not built-in editor
   - Rich media: Text/markdown only, no images
   - Encryption: Files stored in plain text

5. **Success Criteria**
   - User can go from pip install to first note in under 2 minutes
   - Search returns results in <100ms for vaults up to 10,000 notes
   - Links can be followed instantly
   - Works fully offline after install
   - Shell scripts can parse JSON output

---

### 3.3 docs/design/use-cases.md

**7 Use Cases Required:**

**UC1: Initial Setup**
- Actor: Developer setting up note-taking for first time
- Flow: pip install, notes-cli init --vault ~/notes, create first note
- Success: Vault directory created, database initialized
- Failure modes:
  - Vault path not writable -> clear error message
  - Vault already exists -> refuse without --force
  - Path contains ".." -> reject for security

**UC2: Creating a New Note**
- Actor: Developer during debugging session
- Flow: notes-cli new "Redis caching issues", opens $EDITOR, save and exit
- Success: Note file created, indexed in database, timestamp recorded
- Failure modes:
  - Title already exists -> suggest unique title or --force
  - Invalid characters in title -> sanitize or reject
  - $EDITOR not set -> error with helpful message

**UC3: Linking Notes Together**
- Actor: Developer connecting related concepts
- Flow: Edit note, add [[related-note]] syntax, save
- Success: Link tracked in database, bidirectional
- Failure modes:
  - Linked note doesn't exist -> show warning (not error), create placeholder link
  - Circular links -> allowed, detected on query

**UC4: Searching Notes**
- Actor: Developer looking for specific information
- Flow: notes-cli search "kubernetes deploy", review results
- Success: Full-text matches shown with context snippets
- Failure modes:
  - No matches -> empty results, exit 0
  - Search query empty -> error, show usage

**UC5: Tagging and Organization**
- Actor: Developer organizing notes by topic
- Flow: notes-cli tag add "Redis caching" --tags "database,performance"
- Success: Tags added, queryable via tag search
- Failure modes:
  - Note not found -> exit 3
  - Tag name invalid (special chars) -> sanitize or reject

**UC6: Following Wiki Links**
- Actor: Developer exploring connected notes
- Flow: notes-cli show "Redis caching", see links, notes-cli show "linked-note"
- Success: Note content displayed with list of outgoing and incoming links
- Failure modes:
  - Dead link (note deleted) -> show as broken link

**UC7: Backup and Export**
- Actor: Developer backing up notes before system change
- Flow: notes-cli backup --output ~/backup.zip
- Success: All notes + database exported to archive
- Failure modes:
  - Output path exists -> require --force
  - Path contains ".." -> reject
  - Not enough disk space -> clear error

---

### 3.4 docs/design/technical.md

**Key Sections:**

1. **Technology Choices**

   **Language: Python 3.10+**
   - Rationale: Type hints, rich standard library, cross-platform
   - Constraint: Standard library only, no pip dependencies

   **Database: SQLite3**
   - Rationale: Zero config, single file, included in Python
   - Usage: Metadata only (not note content)
   - Constraint: Use sqlite3 module only, no ORM

   **CLI Framework: argparse**
   - Rationale: Standard library, sufficient for command structure
   - Rejected: Click, Typer (external deps), Fire (magic behavior)

   **Editor Integration: $EDITOR / $VISUAL**
   - Fallback chain: $VISUAL -> $EDITOR -> vim -> nano -> vi
   - subprocess.call() for synchronous editing

2. **Architecture Decisions**

   **AD1: Layered Architecture**
   ```
   CLI Layer (cli.py)
       ↓ parses args, routes commands
   Command Layer (commands.py)
       ↓ business logic, validation
   Database Layer (database.py)
       ↓ SQL queries, connection management
   Filesystem Layer (via commands.py)
       ↓ reads/writes markdown files
   ```

   **AD2: No Global State**
   - Each command receives explicit parameters
   - No module-level database connections
   - Rationale: Testability, predictability

   **AD3: Explicit Error Types**
   - Custom exception hierarchy maps to exit codes:
   ```python
   NotesError (base)
   ├── ValidationError      → exit 1
   ├── DatabaseError        → exit 2
   ├── NoteNotFoundError    → exit 3
   ├── DuplicateNoteError   → exit 4
   └── VaultError           → exit 5
   ```

   **AD4: Parameterized Queries Only**
   - ALL SQL queries MUST use parameterized placeholders (?)
   - Never use string interpolation in SQL
   - Rationale: Prevents SQL injection (B01)

   **AD5: Input Validation at Boundary**
   - Validate all user input in CLI layer:
     - Note title: non-empty, max 200 chars, no path separators
     - Tag name: alphanumeric + hyphen + underscore, max 50 chars
     - Search query: max 500 chars
     - Vault path: no "..", must be absolute or resolve to absolute

   **AD6: Atomic Database Operations**
   - Each command is a single transaction
   - Either fully succeeds or fully fails

   **AD7: Content in Files, Metadata in SQLite**
   - Note content stored as .md files in vault directory
   - SQLite stores: title, path, created_at, updated_at, tags, links
   - Rationale: Files are human-readable, versionable with git

   **AD8: Filename Sanitization for Note Titles**
   - Title "My Note/Ideas" becomes "my-note-ideas.md"
   - Rules: lowercase, replace spaces with hyphens, remove special chars
   - Max filename length: 100 chars (excluding .md)

3. **Data Model**

   **Notes Table:**
   | Column | Type | Constraints |
   |--------|------|-------------|
   | id | INTEGER | PRIMARY KEY AUTOINCREMENT |
   | title | TEXT | UNIQUE NOT NULL |
   | filename | TEXT | UNIQUE NOT NULL |
   | created_at | TEXT | ISO 8601 timestamp |
   | updated_at | TEXT | ISO 8601 timestamp |

   **Tags Table:**
   | Column | Type | Constraints |
   |--------|------|-------------|
   | id | INTEGER | PRIMARY KEY AUTOINCREMENT |
   | name | TEXT | UNIQUE NOT NULL |

   **Note_Tags Junction:**
   | Column | Type | Constraints |
   |--------|------|-------------|
   | note_id | INTEGER | FK to notes |
   | tag_id | INTEGER | FK to tags |
   | PRIMARY KEY (note_id, tag_id) |

   **Links Table:**
   | Column | Type | Constraints |
   |--------|------|-------------|
   | id | INTEGER | PRIMARY KEY AUTOINCREMENT |
   | source_note_id | INTEGER | FK to notes |
   | target_title | TEXT | NOT NULL (may not exist) |
   | target_note_id | INTEGER | FK to notes, nullable |

4. **Performance Targets**
   | Operation | Target | Max dataset |
   |-----------|--------|-------------|
   | init | <500ms | n/a |
   | new | <100ms | n/a |
   | show | <50ms | n/a |
   | search | <100ms | 10,000 notes |
   | list | <100ms | 10,000 notes |
   | backup | <30s | 10,000 notes |

5. **Security Considerations**
   - SQL Injection: Mitigated by AD4
   - Path Traversal: Validate vault and output paths, reject ".."
   - Filename Injection: Sanitize note titles before creating files
   - Error Message Leakage: Don't expose SQL or full paths

---

### 3.5 docs/design/components.md

**Key Sections:**

1. **Module Overview**
   ```
   notes_cli/
   ├── __init__.py          # Package marker, version
   ├── __main__.py          # Entry point: python -m notes_cli
   ├── cli.py               # Argument parsing, command routing
   ├── commands.py          # Business logic for each command
   ├── database.py          # Database connection, queries
   ├── models.py            # Data classes, validation
   ├── formatters.py        # Output formatting (table, JSON)
   ├── exceptions.py        # Custom exception hierarchy
   └── link_parser.py       # Parse [[wiki-links]] from markdown
   ```

2. **Component Details**

   **__init__.py**
   - Contents: `__version__ = "0.1.0"`
   - Dependencies: None

   **__main__.py**
   - Purpose: Entry point for `python -m notes_cli`
   - Contents: `from notes_cli.cli import main; main()`
   - Dependencies: cli

   **cli.py**
   - Purpose: Parse command-line arguments, route to handlers
   - Responsibilities:
     - Define argument parser with subcommands
     - Validate input at boundary (before passing to commands)
     - Map exceptions to exit codes
     - Handle --verbose flag
   - Public interface: `main()` -> entry point
   - Dependencies: commands, exceptions
   - Does NOT: Execute business logic, access database directly

   **commands.py**
   - Purpose: Business logic for each CLI command
   - Responsibilities:
     - Implement each command as a function
     - Coordinate between database, filesystem, formatters
     - Enforce business rules
   - Public interface:
     - `cmd_init(vault_path: str, force: bool) -> None`
     - `cmd_new(vault_path: str, title: str, tags: list[str] | None) -> str` (returns filename)
     - `cmd_edit(vault_path: str, title: str) -> None`
     - `cmd_show(vault_path: str, title: str) -> Note`
     - `cmd_list(vault_path: str, tag: str | None, limit: int) -> list[Note]`
     - `cmd_search(vault_path: str, query: str) -> list[SearchResult]`
     - `cmd_tag_add(vault_path: str, title: str, tags: list[str]) -> None`
     - `cmd_tag_remove(vault_path: str, title: str, tags: list[str]) -> None`
     - `cmd_links(vault_path: str, title: str) -> LinkInfo`
     - `cmd_export(vault_path: str, title: str, output: str, format: str) -> None`
     - `cmd_backup(vault_path: str, output: str, force: bool) -> int` (returns count)
   - Dependencies: database, models, exceptions, link_parser
   - Does NOT: Parse CLI arguments, format output, handle exit codes

   **database.py**
   - Purpose: Database connection and SQL operations
   - Responsibilities:
     - Create/connect to SQLite database
     - Run schema migrations
     - Execute parameterized queries
     - Handle transactions
   - Public interface:
     - `init_database(vault_path: str) -> None`
     - `get_connection(vault_path: str) -> ContextManager[sqlite3.Connection]`
     - `insert_note(conn, note: Note) -> int`
     - `update_note(conn, note: Note) -> None`
     - `delete_note(conn, note_id: int) -> None`
     - `find_note_by_title(conn, title: str) -> Note | None`
     - `find_note_by_filename(conn, filename: str) -> Note | None`
     - `search_notes(conn, query: str) -> list[Note]`
     - `list_notes(conn, tag: str | None, limit: int) -> list[Note]`
     - `add_tag(conn, note_id: int, tag_name: str) -> None`
     - `remove_tag(conn, note_id: int, tag_name: str) -> None`
     - `get_note_tags(conn, note_id: int) -> list[str]`
     - `save_links(conn, note_id: int, links: list[str]) -> None`
     - `get_outgoing_links(conn, note_id: int) -> list[Link]`
     - `get_incoming_links(conn, note_id: int) -> list[Link]`
   - Dependencies: models, exceptions
   - Critical constraint: ALL queries use parameterized placeholders

   **models.py**
   - Purpose: Data classes and validation logic
   - Public interface:
     ```python
     @dataclass
     class Note:
         id: int | None
         title: str
         filename: str
         created_at: str
         updated_at: str
         tags: list[str] = field(default_factory=list)

     @dataclass
     class Link:
         source_title: str
         target_title: str
         exists: bool  # whether target note exists

     @dataclass
     class SearchResult:
         note: Note
         snippet: str  # context around match

     @dataclass
     class LinkInfo:
         outgoing: list[Link]
         incoming: list[Link]

     def validate_title(title: str) -> str  # raises ValidationError
     def validate_tag(tag: str) -> str  # raises ValidationError
     def validate_vault_path(path: str) -> str  # raises ValidationError, returns absolute
     def validate_output_path(path: str) -> str  # raises ValidationError
     def sanitize_title_to_filename(title: str) -> str  # returns safe filename
     ```
   - Dependencies: exceptions

   **formatters.py**
   - Purpose: Format data for output
   - Public interface:
     - `format_note_table(notes: list[Note]) -> str`
     - `format_note_json(notes: list[Note]) -> str`
     - `format_note_detail(note: Note, content: str, links: LinkInfo) -> str`
     - `format_search_results_table(results: list[SearchResult]) -> str`
     - `format_search_results_json(results: list[SearchResult]) -> str`
     - `format_links(links: LinkInfo) -> str`
   - Dependencies: models

   **exceptions.py**
   - Contents:
     ```python
     class NotesError(Exception):
         exit_code = 1

     class ValidationError(NotesError):
         exit_code = 1

     class DatabaseError(NotesError):
         exit_code = 2

     class NoteNotFoundError(NotesError):
         exit_code = 3

     class DuplicateNoteError(NotesError):
         exit_code = 4

     class VaultError(NotesError):
         exit_code = 5
     ```
   - Dependencies: None

   **link_parser.py**
   - Purpose: Parse [[wiki-links]] from markdown content
   - Public interface:
     - `extract_links(content: str) -> list[str]` - returns list of link targets
     - `LINK_PATTERN = r'\[\[([^\]]+)\]\]'` - regex pattern
   - Dependencies: None

3. **Dependency Graph**
   ```
   cli.py
     ├── commands.py
     │     ├── database.py
     │     │     ├── models.py
     │     │     └── exceptions.py
     │     ├── models.py
     │     ├── link_parser.py
     │     └── exceptions.py
     ├── formatters.py
     │     └── models.py
     └── exceptions.py
   ```
   Rule: No circular dependencies. Lower layers don't import from higher.

---

## 4. Systems Docs Outline

### 4.1 docs/systems/architecture/ARCHITECTURE-simple.md

**Key Sections:**

1. **System Overview**
   ASCII diagram showing:
   ```
   USER (Terminal)
        │ CLI arguments
        ▼
   cli.py (parse args, validate, route)
        │ Validated parameters
        ▼
   commands.py (business logic)
        │              │
        ▼              ▼
   database.py    Filesystem
   (SQLite)       (Markdown files)
        │              │
        ▼              ▼
   .notes.db      vault/*.md
   ```

2. **Layer Rules**

   **CLI Layer (cli.py)**
   - MUST: Parse arguments with argparse, validate input at boundary, catch NotesError and convert to exit codes, print to stdout/stderr
   - MUST NOT: Access database directly, import sqlite3, contain business logic, format output

   **Command Layer (commands.py)**
   - MUST: Implement one function per command, accept validated parameters, return data not strings, raise specific exceptions
   - MUST NOT: Parse CLI args, print to stdout/stderr, handle exit codes, catch exceptions

   **Database Layer (database.py)**
   - MUST: Use parameterized queries exclusively, use context managers, use transactions, return model objects
   - MUST NOT: Validate business rules, format output, use string interpolation in queries

   **Formatter Layer (formatters.py)**
   - MUST: Accept model objects, return strings, handle edge cases
   - MUST NOT: Access database, make business decisions

3. **Data Flow Examples**

   **New Note:**
   ```
   User: notes-cli new "My Note"
   cli.py: validate_title("My Note") ✓
   cli.py: validate_vault_path(vault) ✓
   commands.py: cmd_new(vault, "My Note")
   commands.py: sanitize_title_to_filename("My Note") -> "my-note.md"
   commands.py: check title doesn't exist -> DuplicateNoteError if yes
   commands.py: create file vault/my-note.md
   commands.py: call database.insert_note()
   database.py: INSERT INTO notes ... VALUES (?, ?, ?, ?)
   cli.py: print "Created: my-note.md"
   cli.py: exit(0)
   ```

   **Search (with injection attempt):**
   ```
   User: notes-cli search "'; DROP TABLE--"
   cli.py: validates search query length ✓
   commands.py: cmd_search(vault, "'; DROP TABLE--")
   database.py: SELECT ... WHERE content LIKE ?
               param: ("%'; DROP TABLE--%",)
               -> SQLite treats as literal
   cli.py: print empty results
   cli.py: exit(0)
   ```

4. **Critical Security Rules**

   **S1: Parameterized Queries Only**
   ```python
   # CORRECT
   cursor.execute("SELECT * FROM notes WHERE title = ?", (title,))

   # WRONG - SQL INJECTION
   cursor.execute(f"SELECT * FROM notes WHERE title = '{title}'")
   ```

   **S2: Path Validation**
   - Vault path and output paths must not contain ".."
   - Must be absolute or resolve to absolute
   - Must be writable by current user
   ```python
   def validate_vault_path(path: str) -> str:
       if ".." in path:
           raise ValidationError("Path cannot contain '..'")
       return os.path.abspath(path)
   ```

   **S3: Filename Sanitization**
   - Note titles used to create filenames must be sanitized
   - Remove/replace: path separators, special chars, control chars
   - Max length enforcement
   ```python
   def sanitize_title_to_filename(title: str) -> str:
       # Lowercase, replace spaces with hyphens
       safe = title.lower().replace(" ", "-")
       # Remove anything not alphanumeric or hyphen
       safe = re.sub(r'[^a-z0-9-]', '', safe)
       # Limit length
       safe = safe[:100]
       return safe + ".md"
   ```

   **S4: Error Message Sanitization**
   - Must NOT include: full file paths, SQL query text, stack traces (unless --verbose), database internals
   ```python
   # CORRECT
   "Error: Note not found"

   # WRONG - exposes path
   "Error: FileNotFoundError: /home/user/secret/notes/file.md"
   ```

5. **File Locations Table**

---

### 4.2 docs/systems/database/schema.md

**Key Sections:**

1. **Database File**
   - Engine: SQLite 3
   - File: `.notes.db` in vault directory
   - Encoding: UTF-8
   - Permissions: 0600 (owner read/write only)

2. **Schema Definition**
   ```sql
   -- Notes table: core note metadata
   CREATE TABLE IF NOT EXISTS notes (
       id          INTEGER PRIMARY KEY AUTOINCREMENT,
       title       TEXT    NOT NULL UNIQUE,
       filename    TEXT    NOT NULL UNIQUE,
       created_at  TEXT    NOT NULL,
       updated_at  TEXT    NOT NULL
   );

   -- Tags table
   CREATE TABLE IF NOT EXISTS tags (
       id          INTEGER PRIMARY KEY AUTOINCREMENT,
       name        TEXT    NOT NULL UNIQUE
   );

   -- Note-Tag junction table
   CREATE TABLE IF NOT EXISTS note_tags (
       note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
       tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
       PRIMARY KEY (note_id, tag_id)
   );

   -- Links table: tracks [[wiki-links]]
   CREATE TABLE IF NOT EXISTS links (
       id              INTEGER PRIMARY KEY AUTOINCREMENT,
       source_note_id  INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
       target_title    TEXT    NOT NULL,
       target_note_id  INTEGER REFERENCES notes(id) ON DELETE SET NULL
   );

   -- Full-text search virtual table
   CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
       title,
       content,
       content='',
       tokenize='porter'
   );

   -- Indexes
   CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
   CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_note_id);
   CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_note_id);
   CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
   ```

3. **Column Specifications**

   **notes table:**
   | Column | Type | Nullable | Constraints | Notes |
   |--------|------|----------|-------------|-------|
   | id | INTEGER | No | PRIMARY KEY | Auto-increment |
   | title | TEXT | No | UNIQUE | Max 200 chars (app-enforced) |
   | filename | TEXT | No | UNIQUE | Sanitized from title |
   | created_at | TEXT | No | - | ISO 8601 format |
   | updated_at | TEXT | No | - | ISO 8601 format |

   **tags table:**
   | Column | Type | Nullable | Constraints | Notes |
   |--------|------|----------|-------------|-------|
   | id | INTEGER | No | PRIMARY KEY | Auto-increment |
   | name | TEXT | No | UNIQUE | Max 50 chars, alphanumeric+hyphen |

   **note_tags table:**
   | Column | Type | Nullable | Constraints | Notes |
   |--------|------|----------|-------------|-------|
   | note_id | INTEGER | No | FK notes | ON DELETE CASCADE |
   | tag_id | INTEGER | No | FK tags | ON DELETE CASCADE |

   **links table:**
   | Column | Type | Nullable | Constraints | Notes |
   |--------|------|----------|-------------|-------|
   | id | INTEGER | No | PRIMARY KEY | Auto-increment |
   | source_note_id | INTEGER | No | FK notes | Note containing the link |
   | target_title | TEXT | No | - | [[link-target]] text |
   | target_note_id | INTEGER | Yes | FK notes | NULL if target doesn't exist |

4. **Query Patterns (ALL PARAMETERIZED)**

   **Insert Note:**
   ```sql
   INSERT INTO notes (title, filename, created_at, updated_at)
   VALUES (?, ?, ?, ?);
   ```
   Parameters: `(title, filename, created_at, updated_at)`

   **Update Note Timestamp:**
   ```sql
   UPDATE notes SET updated_at = ? WHERE id = ?;
   ```
   Parameters: `(updated_at, note_id)`

   **Find Note by Title:**
   ```sql
   SELECT id, title, filename, created_at, updated_at
   FROM notes WHERE title = ?;
   ```
   Parameters: `(title,)`

   **Find Note by Filename:**
   ```sql
   SELECT id, title, filename, created_at, updated_at
   FROM notes WHERE filename = ?;
   ```
   Parameters: `(filename,)`

   **List Notes (with optional tag filter):**
   ```sql
   -- Without tag filter
   SELECT n.id, n.title, n.filename, n.created_at, n.updated_at
   FROM notes n
   ORDER BY n.updated_at DESC
   LIMIT ?;

   -- With tag filter
   SELECT n.id, n.title, n.filename, n.created_at, n.updated_at
   FROM notes n
   JOIN note_tags nt ON n.id = nt.note_id
   JOIN tags t ON nt.tag_id = t.id
   WHERE t.name = ?
   ORDER BY n.updated_at DESC
   LIMIT ?;
   ```

   **Search Notes (full-text):**
   ```sql
   SELECT n.id, n.title, n.filename, n.created_at, n.updated_at,
          snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) as snippet
   FROM notes_fts
   JOIN notes n ON notes_fts.title = n.title
   WHERE notes_fts MATCH ?
   ORDER BY rank;
   ```
   Parameters: `(query,)`

   **Add Tag to Note:**
   ```sql
   -- First, ensure tag exists
   INSERT OR IGNORE INTO tags (name) VALUES (?);

   -- Get tag id
   SELECT id FROM tags WHERE name = ?;

   -- Link note to tag
   INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?);
   ```

   **Remove Tag from Note:**
   ```sql
   DELETE FROM note_tags
   WHERE note_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?);
   ```

   **Get Note Tags:**
   ```sql
   SELECT t.name
   FROM tags t
   JOIN note_tags nt ON t.id = nt.tag_id
   WHERE nt.note_id = ?
   ORDER BY t.name;
   ```

   **Save Links (delete old, insert new):**
   ```sql
   -- Delete existing links from this note
   DELETE FROM links WHERE source_note_id = ?;

   -- Insert new links
   INSERT INTO links (source_note_id, target_title, target_note_id)
   VALUES (?, ?, (SELECT id FROM notes WHERE title = ?));
   ```

   **Get Outgoing Links:**
   ```sql
   SELECT l.target_title, n.title as resolved_title,
          CASE WHEN l.target_note_id IS NOT NULL THEN 1 ELSE 0 END as exists
   FROM links l
   LEFT JOIN notes n ON l.target_note_id = n.id
   WHERE l.source_note_id = ?;
   ```

   **Get Incoming Links (backlinks):**
   ```sql
   SELECT n.title as source_title
   FROM links l
   JOIN notes n ON l.source_note_id = n.id
   WHERE l.target_note_id = ?;
   ```

   **Update FTS Index:**
   ```sql
   -- On note create/update, update FTS
   INSERT INTO notes_fts (title, content) VALUES (?, ?);

   -- On note delete
   DELETE FROM notes_fts WHERE title = ?;
   ```

5. **Connection Management**
   ```python
   @contextmanager
   def get_connection(vault_path: str):
       db_path = os.path.join(vault_path, '.notes.db')
       conn = sqlite3.connect(db_path)
       conn.row_factory = sqlite3.Row
       conn.execute("PRAGMA foreign_keys = ON")
       try:
           yield conn
           conn.commit()
       except Exception:
           conn.rollback()
           raise
       finally:
           conn.close()
   ```

---

### 4.3 docs/systems/cli/interface.md

**Key Sections:**

1. **Global Options**
   | Option | Type | Default | Description |
   |--------|------|---------|-------------|
   | `--vault PATH` | string | `~/.notes` | Path to vault directory |
   | `--verbose` | flag | false | Enable debug output |
   | `--help` | flag | - | Show help for command |
   | `--version` | flag | - | Show version number |

2. **Commands**

   **`init`** - Initialize a new vault
   ```
   notes-cli init [--vault PATH] [--force]
   ```
   Options:
   - `--force`: Overwrite existing vault

   Behavior:
   1. Check if vault directory exists
   2. If exists and --force not set -> error, exit 1
   3. If exists and --force set -> delete .notes.db only (keep notes)
   4. Create vault directory if needed
   5. Initialize database with schema
   6. Print success message

   Output (success): `Vault initialized at /path/to/vault`
   Output (exists): `Error: Vault already exists at /path. Use --force to reinitialize.`

   Exit codes: 0=success, 1=exists without force, 5=cannot create

   **`new`** - Create a new note
   ```
   notes-cli new TITLE [--tags TAG1,TAG2] [--vault PATH]
   ```
   Options:
   - `TITLE`: Note title (positional, required)
   - `--tags TAG1,TAG2`: Comma-separated tags

   Behavior:
   1. Validate title (length, characters)
   2. Sanitize title to filename
   3. Check filename doesn't exist
   4. Create empty markdown file with title as H1
   5. Open in $EDITOR
   6. On save: parse links, update database

   Output (success): `Created: my-note.md`
   Output (duplicate): `Error: Note 'My Note' already exists.`

   Exit codes: 0=success, 1=validation error, 4=duplicate, 5=vault error

   **`edit`** - Edit an existing note
   ```
   notes-cli edit TITLE [--vault PATH]
   ```

   Behavior:
   1. Find note by title
   2. Open file in $EDITOR
   3. On save: reparse links, update database timestamp

   Exit codes: 0=success, 3=not found, 5=vault error

   **`show`** - Display a note
   ```
   notes-cli show TITLE [--format FORMAT] [--vault PATH]
   ```
   Options:
   - `--format`: `text` (default), `json`

   Output (text):
   ```
   # My Note

   Note content here...

   ---
   Tags: database, performance
   Links out: [[Redis]], [[Caching]]
   Links in: [[Architecture Notes]]
   Created: 2026-01-15
   Updated: 2026-01-21
   ```

   Exit codes: 0=success, 3=not found

   **`list`** - List notes
   ```
   notes-cli list [--tag TAG] [--limit N] [--format FORMAT] [--vault PATH]
   ```
   Options:
   - `--tag TAG`: Filter by tag
   - `--limit N`: Max results (default: 20)
   - `--format`: `table` (default), `json`

   Output (table):
   ```
   Title                | Tags           | Updated
   ---------------------|----------------|------------
   My Note              | db, perf       | 2026-01-21
   Another Note         | design         | 2026-01-20
   ```

   Exit codes: 0=success, 2=database error

   **`search`** - Full-text search
   ```
   notes-cli search QUERY [--limit N] [--format FORMAT] [--vault PATH]
   ```
   Options:
   - `QUERY`: Search query (positional, required)
   - `--limit N`: Max results (default: 20)
   - `--format`: `table` (default), `json`

   Output (table):
   ```
   Title                | Snippet                                  | Score
   ---------------------|------------------------------------------|------
   Redis Caching        | ...configure <mark>Redis</mark> for...   | 0.95
   ```

   Exit codes: 0=success, 1=empty query, 2=database error

   **`tag add`** - Add tags to a note
   ```
   notes-cli tag add TITLE --tags TAG1,TAG2 [--vault PATH]
   ```

   Output: `Added tags [database, performance] to 'My Note'`
   Exit codes: 0=success, 1=validation error, 3=not found

   **`tag remove`** - Remove tags from a note
   ```
   notes-cli tag remove TITLE --tags TAG1,TAG2 [--vault PATH]
   ```

   Output: `Removed tags [deprecated] from 'My Note'`
   Exit codes: 0=success, 3=not found

   **`tag list`** - List all tags
   ```
   notes-cli tag list [--format FORMAT] [--vault PATH]
   ```

   Output (table):
   ```
   Tag          | Count
   -------------|------
   database     | 15
   performance  | 8
   ```

   **`links`** - Show links for a note
   ```
   notes-cli links TITLE [--format FORMAT] [--vault PATH]
   ```

   Output:
   ```
   Outgoing links from 'My Note':
     -> [[Redis]] (exists)
     -> [[Missing Note]] (broken)

   Incoming links to 'My Note':
     <- [[Architecture Notes]]
     <- [[Index]]
   ```

   Exit codes: 0=success, 3=not found

   **`export`** - Export a single note
   ```
   notes-cli export TITLE --output PATH [--format FORMAT] [--force] [--vault PATH]
   ```
   Options:
   - `--output PATH`: Output file path (required)
   - `--format`: `md` (default), `html`, `txt`
   - `--force`: Overwrite existing file

   Exit codes: 0=success, 1=file exists/validation, 3=not found

   **`backup`** - Backup entire vault
   ```
   notes-cli backup --output PATH [--force] [--vault PATH]
   ```
   Options:
   - `--output PATH`: Output zip file path (required)
   - `--force`: Overwrite existing file

   Behavior:
   1. Validate output path (no "..")
   2. Check file doesn't exist (unless --force)
   3. Create zip with all .md files and .notes.db

   Output: `Backed up 150 notes to backup.zip`
   Exit codes: 0=success, 1=validation/exists, 5=vault error

3. **Input Validation Rules**

   **Title:**
   - Non-empty, max 200 characters
   - Cannot contain: `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`
   - Validation regex: `^[^/\\:*?"<>|]{1,200}$`

   **Tag:**
   - Non-empty, max 50 characters
   - Allowed: alphanumeric, hyphen, underscore
   - Validation regex: `^[A-Za-z0-9_-]{1,50}$`

   **Search Query:**
   - Non-empty, max 500 characters

   **Path (--vault, --output):**
   - Must not contain `..`
   - Converted to absolute path internally

4. **Output Standards**

   **Table Format:**
   - Column headers in first row
   - Separator line of dashes
   - Fixed-width columns, truncate with "..."

   **JSON Format:**
   - Pretty-printed with 2-space indent
   - Arrays for lists
   - UTF-8 encoding
   - null values included (not omitted)

   **Error Messages:**
   - Prefix: `Error: `
   - Written to stderr
   - No stack traces unless --verbose

---

### 4.4 docs/systems/errors.md

**Key Sections:**

1. **Exit Codes**
   | Code | Name | Meaning |
   |------|------|---------|
   | 0 | SUCCESS | Operation completed successfully |
   | 1 | GENERAL_ERROR | Invalid arguments, validation failure |
   | 2 | DATABASE_ERROR | Database connection/query failed |
   | 3 | NOT_FOUND | Requested note does not exist |
   | 4 | DUPLICATE | Note with this title already exists |
   | 5 | VAULT_ERROR | Vault directory issues |

2. **Exception Hierarchy**
   ```python
   class NotesError(Exception):
       exit_code: int = 1

       def __init__(self, message: str):
           self.message = message
           super().__init__(message)

   class ValidationError(NotesError):
       """Invalid input data."""
       exit_code = 1

   class DatabaseError(NotesError):
       """Database operation failed."""
       exit_code = 2

   class NoteNotFoundError(NotesError):
       """Requested note does not exist."""
       exit_code = 3

   class DuplicateNoteError(NotesError):
       """Note with this title already exists."""
       exit_code = 4

   class VaultError(NotesError):
       """Vault directory issues."""
       exit_code = 5
   ```

3. **Error Message Templates**

   **Validation Errors (Exit 1):**
   ```
   Error: Title cannot be empty.
   Error: Title must be 200 characters or fewer. Got: 250
   Error: Title contains invalid characters: /
   Error: Tag name must be alphanumeric (hyphens and underscores allowed).
   Error: Search query cannot be empty.
   Error: Path cannot contain '..'.
   Error: File 'output.md' already exists. Use --force to overwrite.
   Error: Must specify exactly one of: --add, --remove
   Error: No tags specified. Use --tags TAG1,TAG2
   ```

   **Database Errors (Exit 2):**
   ```
   Error: Cannot open database. Run with --verbose for details.
   Error: Database operation failed.
   ```

   **Not Found Errors (Exit 3):**
   ```
   Error: Note 'My Note' not found.
   Error: Tag 'deprecated' not found on note.
   ```

   **Duplicate Errors (Exit 4):**
   ```
   Error: Note 'My Note' already exists.
   ```

   **Vault Errors (Exit 5):**
   ```
   Error: Vault does not exist at /path. Run 'notes-cli init' first.
   Error: Cannot create vault directory: Permission denied.
   Error: Vault already exists at /path. Use --force to reinitialize.
   ```

4. **Error Handling Rules**
   - Rule 1: Catch at CLI Layer (convert to exit codes)
   - Rule 2: Never Expose Internals (no SQL, no full paths, no stack traces)
   - Rule 3: Be Specific (report first validation error found)
   - Rule 4: Distinguish Error Types (use specific exception)
   - Rule 5: Preserve Original Exceptions (use `from e`)

5. **Verbose Mode**
   - Print debug info during execution
   - On error, print full stack trace
   - Include full file paths
   - Still do NOT expose: SQL query text, credentials

---

## 5. Tasks Breakdown

### 5.1 tasks/task1.md - Data Layer

**Title:** Task 1: Data Layer

**Scope:**
- `notes_cli/__init__.py` - Package marker with `__version__ = "0.1.0"`
- `notes_cli/exceptions.py` - Full exception hierarchy
- `notes_cli/models.py` - Note, Link, SearchResult, LinkInfo dataclasses; validation functions; sanitize_title_to_filename
- `notes_cli/database.py` - Connection management, schema creation, all query functions
- `notes_cli/link_parser.py` - Parse [[wiki-links]] from content

**Constraints to Reference:**
- AD1: Layered architecture - database layer must not validate business rules
- AD4: All queries MUST use parameterized placeholders. No string interpolation.
- AD6: Use context managers for all database connections
- AD7: Content in files, metadata in SQLite
- AD8: Filename sanitization rules

**Tests Required:**
- Unit tests for validate_title(), validate_tag(), validate_vault_path()
- Unit tests for sanitize_title_to_filename() with edge cases
- Unit tests for each database function using in-memory SQLite
- Unit tests for link_parser.extract_links() with various patterns
- Test exception hierarchy (exit codes, inheritance)

**Not In Scope:**
- CLI argument parsing (Task 2)
- Command business logic (Task 2-4)
- Output formatting (Task 3)
- File operations (Task 2-4)

**Acceptance Criteria:**
```python
# Can create database and insert a note
from notes_cli.database import init_database, get_connection, insert_note
from notes_cli.models import Note

init_database("/tmp/test_vault")
with get_connection("/tmp/test_vault") as conn:
    note = Note(id=None, title="Test Note", filename="test-note.md",
                created_at="2026-01-21T10:00:00Z", updated_at="2026-01-21T10:00:00Z")
    note_id = insert_note(conn, note)
    assert note_id == 1

# Can parse wiki links
from notes_cli.link_parser import extract_links
links = extract_links("See [[Redis]] and [[Caching Strategy]] for details")
assert links == ["Redis", "Caching Strategy"]

# Sanitization works correctly
from notes_cli.models import sanitize_title_to_filename
assert sanitize_title_to_filename("My Note/Ideas") == "my-note-ideas.md"
assert sanitize_title_to_filename("Test: Special <chars>") == "test-special-chars.md"
```

---

### 5.2 tasks/task2.md - CLI Framework + Init/New Commands

**Title:** Task 2: CLI Framework + Init/New Commands

**Scope:**
- `notes_cli/__main__.py` - Entry point for `python -m notes_cli`
- `notes_cli/cli.py` - argparse setup with all global options and subcommands
- `notes_cli/commands.py` - cmd_init() and cmd_new() implementation
- `init` command fully working with --force flag
- `new` command fully working with $EDITOR integration and --tags
- Exception-to-exit-code mapping in CLI layer
- --verbose flag implementation

**Constraints to Reference:**
- AD5: Validate all user input at CLI boundary
- S2: Path validation (no ".." in vault path)
- S3: Filename sanitization for note titles
- CLI layer MUST NOT import sqlite3
- CLI layer MUST NOT contain business logic

**Tests Required:**
- CLI parses all global options correctly
- CLI routes to correct subcommand
- init creates vault directory and database
- init refuses without --force if vault exists
- init --force reinitializes database
- new creates note file with correct filename
- new opens $EDITOR (mock in tests)
- new refuses duplicate titles (exit 4)
- new with --tags adds tags correctly
- Path validation rejects ".."
- Exit codes are correct

**Not In Scope:**
- show, list, search commands (Task 3)
- tag commands (Task 3)
- export, backup, links commands (Task 4)
- Full output formatting (Task 3)

**Acceptance Criteria:**
```bash
# Creates new vault
python -m notes_cli init --vault /tmp/test_vault
# Output: Vault initialized at /tmp/test_vault
# Exit: 0

# Creates database file
ls /tmp/test_vault/.notes.db
# File exists

# Refuses to reinitialize
python -m notes_cli init --vault /tmp/test_vault
# Output: Error: Vault already exists...
# Exit: 1

# Force reinitializes
python -m notes_cli init --vault /tmp/test_vault --force
# Exit: 0

# Creates new note (mock EDITOR)
EDITOR=true python -m notes_cli new "Test Note" --vault /tmp/test_vault
# Output: Created: test-note.md
# File exists: /tmp/test_vault/test-note.md

# Shows version
python -m notes_cli --version
# Output: notes-cli 0.1.0

# Path traversal blocked
python -m notes_cli init --vault ../../../etc/vault
# Output: Error: Path cannot contain '..'
# Exit: 1
```

---

### 5.3 tasks/task3.md - Core Commands (show, list, search, tag, edit)

**Title:** Task 3: Core Commands + Formatters

**Scope:**
- `notes_cli/commands.py` - cmd_edit, cmd_show, cmd_list, cmd_search, cmd_tag_add, cmd_tag_remove, cmd_tag_list
- `notes_cli/formatters.py` - Table and JSON formatters for all outputs
- Integration of commands into cli.py argument parser
- Input validation for all command arguments

**Constraints to Reference:**
- AD1: Commands return data, CLI layer handles formatting
- AD4: All queries use parameterized placeholders
- AD5: Validate inputs at CLI boundary
- S1: Parameterized queries (especially for search)
- Commands MUST NOT print to stdout/stderr
- Commands MUST NOT catch exceptions

**Tests Required:**
- edit: opens correct file, updates timestamp, reparses links
- show: displays content, tags, links; not found (exit 3); JSON format
- list: default order, tag filter, limit, JSON format, empty results
- search: full-text matches, snippets, no results, SQL injection attempt handled
- tag add: success, note not found (exit 3), invalid tag (exit 1)
- tag remove: success, tag not on note
- tag list: shows all tags with counts
- Table format: proper columns, truncation, empty message
- JSON format: proper structure, null handling, empty array

**Not In Scope:**
- export command (Task 4)
- backup command (Task 4)
- links command (Task 4)

**Acceptance Criteria:**
```bash
# Show note
python -m notes_cli show "Test Note" --vault /tmp/test_vault
# Output: Note content with metadata

# Show note JSON
python -m notes_cli show "Test Note" --format json --vault /tmp/test_vault
# Output: {"title": "Test Note", ...}

# List notes
python -m notes_cli list --vault /tmp/test_vault
# Output: Table of notes

# Search
python -m notes_cli search "keyword" --vault /tmp/test_vault
# Output: Search results with snippets

# SQL injection attempt
python -m notes_cli search "'; DROP TABLE notes;--" --vault /tmp/test_vault
# Output: No results (not SQL error)
# Exit: 0

# Add tags
python -m notes_cli tag add "Test Note" --tags "database,performance" --vault /tmp/test_vault
# Output: Added tags [database, performance] to 'Test Note'

# Note not found
python -m notes_cli show "Nonexistent" --vault /tmp/test_vault
# Output: Error: Note 'Nonexistent' not found.
# Exit: 3
```

---

### 5.4 tasks/task4.md - Export/Backup/Links

**Title:** Task 4: Export, Backup, and Link Management

**Scope:**
- `notes_cli/commands.py` - cmd_links, cmd_export, cmd_backup
- File handling with --force for overwrite
- Zip creation for backup
- Format conversion for export (md, html, txt)
- Path validation (no ".." traversal)

**Constraints to Reference:**
- S2: Validate paths - must not contain ".."
- S4: Error messages use basename only, not full path
- Must handle existing file gracefully (require --force)
- Backup must include all .md files and .notes.db

**Tests Required:**
- links: shows outgoing and incoming links, broken links marked
- export: creates file in correct format
- export: file exists without --force -> exit 1
- export: file exists with --force -> overwrites
- export: path with ".." -> exit 1
- backup: creates valid zip with all notes
- backup: file exists without --force -> exit 1
- backup: path with ".." -> exit 1
- backup: correct file count in output message

**Not In Scope:**
- All other commands (completed in Tasks 1-3)

**Acceptance Criteria:**
```bash
# Show links
python -m notes_cli links "Test Note" --vault /tmp/test_vault
# Output: Outgoing and incoming links

# Export single note
python -m notes_cli export "Test Note" --output /tmp/note.md --vault /tmp/test_vault
# Output: Exported to note.md
# Exit: 0

# Export exists error
python -m notes_cli export "Test Note" --output /tmp/note.md --vault /tmp/test_vault
# Output: Error: File 'note.md' already exists. Use --force to overwrite.
# Exit: 1

# Export with force
python -m notes_cli export "Test Note" --output /tmp/note.md --force --vault /tmp/test_vault
# Exit: 0

# Export path traversal blocked
python -m notes_cli export "Test Note" --output ../../../etc/passwd --vault /tmp/test_vault
# Output: Error: Path cannot contain '..'
# Exit: 1

# Backup
python -m notes_cli backup --output /tmp/backup.zip --vault /tmp/test_vault
# Output: Backed up 5 notes to backup.zip
# Exit: 0

# Verify backup contents
unzip -l /tmp/backup.zip
# Contains: all .md files, .notes.db
```

---

## 6. Security Test Coverage Summary

This app is designed to have the following security surfaces for Falcon validation:

| Vulnerability | Location | Test Scenario |
|--------------|----------|---------------|
| **B01: SQL Injection** | search command | Search query `'; DROP TABLE--` |
| **B01: SQL Injection** | tag commands | Tag name with SQL chars |
| **B02: Path Traversal** | --vault option | Path with `../../../etc` |
| **B02: Path Traversal** | --output option | Export/backup to `../passwd` |
| **B02: Path Traversal** | note title | Title attempting directory escape |
| **B11: File Permissions** | init command | Database file permissions (0600) |
| **Content Sanitization** | new command | Title with special chars -> filename |
| **Error Leakage** | all errors | No SQL or full paths in messages |

Each security surface should be exercised in both passing (secure) and failing (vulnerable) implementations to validate Falcon's detection capabilities.
