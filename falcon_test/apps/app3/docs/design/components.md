# Components: Note-taking/Wiki CLI

## Module Overview

```
notes_cli/
+-- __init__.py          # Package marker, version
+-- __main__.py          # Entry point: python -m notes_cli
+-- cli.py               # Argument parsing, command routing
+-- commands.py          # Business logic for each command
+-- database.py          # Database connection, queries
+-- models.py            # Data classes, validation
+-- formatters.py        # Output formatting (table, JSON)
+-- exceptions.py        # Custom exception hierarchy
+-- link_parser.py       # Parse [[wiki-links]] from markdown
+-- editor.py            # External editor invocation
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

**Purpose**: Entry point for `python -m notes_cli`

**Contents**:
```python
from notes_cli.cli import main
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

**Public interface**:
- `main()` -> entry point, parses args, calls commands

**Dependencies**: `commands`, `formatters`, `exceptions`

**Does NOT**: Execute business logic, access database directly

---

### `commands.py`

**Purpose**: Business logic for each CLI command

**Responsibilities**:
1. Implement each command as a function
2. Coordinate between database, filesystem, and formatters
3. Enforce business rules (e.g., title uniqueness, tag validity)

**Public interface**:
- `cmd_init(vault_path: str, force: bool) -> None`
- `cmd_new(vault_path: str, title: str, tags: list[str] | None) -> str` (returns filename)
- `cmd_edit(vault_path: str, title: str) -> None`
- `cmd_show(vault_path: str, title: str) -> Note`
- `cmd_list(vault_path: str, tag: str | None, limit: int) -> list[Note]`
- `cmd_search(vault_path: str, query: str) -> list[SearchResult]`
- `cmd_tag_add(vault_path: str, title: str, tags: list[str]) -> None`
- `cmd_tag_remove(vault_path: str, title: str, tags: list[str]) -> None`
- `cmd_tag_list(vault_path: str) -> list[TagInfo]`
- `cmd_links(vault_path: str, title: str) -> LinkInfo`
- `cmd_export(vault_path: str, title: str, output: str, format: str, force: bool) -> None`
- `cmd_backup(vault_path: str, output: str, force: bool) -> int` (returns note count)
- `cmd_sync(vault_path: str) -> SyncResult` (syncs database with filesystem, rebuilds FTS)
- `cmd_orphans(vault_path: str) -> list[Note]` (finds notes with no incoming links)

**Dependencies**: `database`, `models`, `exceptions`, `link_parser`, `editor`

**Does NOT**: Parse CLI arguments, format output, handle exit codes

---

### `database.py`

**Purpose**: Database connection and SQL operations

**Responsibilities**:
1. Create/connect to SQLite database
2. Run schema creation (FTS5 virtual table for search)
3. Execute parameterized queries
4. Handle transactions

**Public interface**:
- `init_database(vault_path: str) -> None` - Creates database file with 0600 permissions (see schema.md)
- `get_connection(vault_path: str) -> ContextManager[sqlite3.Connection]`
- `insert_note(conn, note: Note) -> int`
- `update_note(conn, note: Note) -> None`
- `find_note_by_title(conn, title: str) -> Note | None`
- `find_note_by_filename(conn, filename: str) -> Note | None`
- `search_notes(conn, query: str) -> list[SearchResult]`
- `list_notes(conn, tag: str | None, limit: int) -> list[Note]`
- `add_tag(conn, note_id: int, tag_name: str) -> None`
- `remove_tag(conn, note_id: int, tag_name: str) -> None`
- `get_note_tags(conn, note_id: int) -> list[str]`
- `get_all_tags(conn) -> list[TagInfo]`
- `save_links(conn, note_id: int, links: list[str]) -> None`
- `get_outgoing_links(conn, note_id: int) -> list[Link]`
- `get_incoming_links(conn, note_id: int) -> list[Link]`
- `update_fts_index(conn, title: str, content: str) -> None`
- `check_fts_integrity(conn) -> bool` - Returns True if FTS index appears valid, False if rebuild needed (see schema.md)

**Dependencies**: `models`, `exceptions`

**Does NOT**: Validate business rules, format output

**Critical constraint**: ALL queries use parameterized placeholders (`?`). No string interpolation.

---

### `models.py`

**Purpose**: Data classes and validation logic

**Responsibilities**:
1. Define dataclasses for domain entities
2. Validate field constraints
3. Provide sanitization functions

**Public interface**:
```python
@dataclass
class Note:
    id: int | None
    title: str
    filename: str
    created_at: str
    updated_at: str
    tags: list[str] = field(default_factory=list)
    content: str | None = None  # Populated from filesystem on demand (e.g., for show command)

@dataclass
class Link:
    source_title: str
    target_title: str
    exists: bool  # whether target note exists

@dataclass
class SearchResult:
    note: Note
    snippet: str  # context around match
    score: float  # FTS5 relevance score (from rank)

@dataclass
class LinkInfo:
    title: str  # Title of the note whose links are being displayed
    outgoing: list[Link]
    incoming: list[Link]
    circular_paths: list[list[str]] = field(default_factory=list)  # Detected circular link paths (e.g., [["A", "B", "C", "A"]])

@dataclass
class SyncResult:
    added: int  # Notes added from filesystem
    updated: int  # Notes updated (content changed)
    deleted: int  # Notes removed (files deleted externally)
    skipped: int  # Notes skipped (binary content, exceeds max length, or read error)
    total: int  # Total notes after sync (excludes skipped)

@dataclass
class TagInfo:
    name: str
    count: int  # number of notes with this tag

def validate_title(title: str) -> str  # raises ValidationError
def validate_tag(tag: str) -> str  # raises ValidationError
def validate_vault_path(path: str, base_dir: str) -> str:
    """Validate and normalize vault/file path.

    Args:
        path: User-provided path
        base_dir: Required base directory for containment check.
                  For --vault: user's home directory or explicit --vault value.
                  For --output: current working directory.

    Returns: Resolved absolute path (using os.path.realpath to follow symlinks)
    Raises: ValidationError if resolved path is outside base_dir
    """
def validate_output_path(path: str, base_dir: str) -> str:
    """Validate output file path.

    Args:
        path: User-provided output path
        base_dir: Required base directory (typically current working directory)

    Returns: Resolved absolute path
    Raises: ValidationError if path escapes base_dir
    """
def validate_content_length(content: str, filename: str) -> None:
    """Validate note content does not exceed maximum length.

    Args:
        content: Note content to validate
        filename: Filename for error message context

    Raises: ValidationError if content exceeds MAX_CONTENT_LENGTH (1,000,000 chars)
    """
def sanitize_title_to_filename(title: str) -> str  # returns safe filename
def is_binary_content(content: bytes) -> bool  # returns True if content appears to be binary
def validate_text_file(filepath: str) -> str  # reads file, validates text/UTF-8, returns content
def expand_template(template: str, title: str, filename: str) -> str  # safely expands template variables
def strip_markdown_formatting(content: str) -> str  # strips markdown for text export

# Constants
MAX_CONTENT_LENGTH: int = 1_000_000  # Max note content in characters
DEFAULT_TEMPLATE: str  # Default note template with {title} and {date} placeholders
```

**Dependencies**: `exceptions`

**Does NOT**: Access database, format output

---

### `formatters.py`

**Purpose**: Format data for output (table, JSON)

**Responsibilities**:
1. Format note lists as ASCII tables
2. Format note lists as JSON
3. Format link information
4. Format search results with snippets

**Public interface**:
- `format_note_table(notes: list[Note]) -> str`
- `format_note_json(notes: list[Note]) -> str`
- `format_note_detail(note: Note, content: str, links: LinkInfo) -> str`
- `format_search_results_table(results: list[SearchResult]) -> str`
- `format_search_results_json(results: list[SearchResult]) -> str`
- `format_links(links: LinkInfo) -> str`
- `format_links_json(links: LinkInfo) -> str`
- `format_tags_table(tags: list[TagInfo]) -> str`
- `format_tags_json(tags: list[TagInfo]) -> str`
- `format_orphans_table(notes: list[Note]) -> str`
- `format_orphans_json(notes: list[Note]) -> str` - Returns `{"orphan_notes": [...], "count": N}` format

**Dependencies**: `models`

**Does NOT**: Access database, validate input

---

### `exceptions.py`

**Purpose**: Custom exception hierarchy

**Contents**:
```python
class NotesError(Exception):
    """Base exception for notes CLI."""
    exit_code = 1

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

**Dependencies**: None

---

### `link_parser.py`

**Purpose**: Parse `[[wiki-links]]` from markdown content

**Responsibilities**:
1. Extract link targets from markdown text
2. Provide regex pattern for link matching
3. Validate link targets against allowed characters

**Public interface**:
- `extract_links(content: str) -> list[str]` - returns list of validated link targets
- `validate_link_target(target: str) -> str` - validates and returns sanitized link target
- `LINK_PATTERN = r'\[\[([^\]]+)\]\]'` - regex pattern for matching

**Link Target Validation (SECURITY CRITICAL):**

Wiki link targets MUST be validated against allowed characters to prevent injection attacks:

```python
import re

# Allowed characters: alphanumeric, spaces, hyphens, underscores
VALID_LINK_TARGET_PATTERN = re.compile(r'^[A-Za-z0-9 _-]+$')
MAX_LINK_TARGET_LENGTH = 200  # Match note title max length

def validate_link_target(target: str) -> str:
    """Validate wiki link target.

    Args:
        target: Raw link target extracted from [[target]]

    Returns:
        Validated and trimmed link target

    Raises:
        ValidationError if target contains invalid characters
    """
    target = target.strip()

    if not target:
        raise ValidationError("Link target cannot be empty")

    if len(target) > MAX_LINK_TARGET_LENGTH:
        raise ValidationError(f"Link target exceeds {MAX_LINK_TARGET_LENGTH} characters")

    if not VALID_LINK_TARGET_PATTERN.match(target):
        raise ValidationError(
            f"Link target contains invalid characters. "
            f"Only alphanumeric, spaces, hyphens, and underscores allowed."
        )

    return target
```

**Invalid link targets MUST be:**
- Logged as warnings (not errors) during parsing
- Excluded from the returned link list
- NOT stored in the database

**Edge Cases:**
- Multi-line links: NOT allowed. Pattern matches within single lines only.
- Empty links `[[]]`: Rejected (not extracted, no match due to `[^\]]+` requiring at least one character)
- Nested brackets `[[ [[inner]] ]]`: Treated as literal text. The pattern extracts ` [[inner` as the link target.
- Unbalanced brackets `[[missing end`: No match, treated as literal text.
- Links with path separators `[[../secret]]`: Rejected by validation (not alphanumeric/space/hyphen/underscore)
- Links with special characters `[[<script>]]`: Rejected by validation

**Known Limitation: Character Set Mismatch - RESOLVED**

**Previous Issue:** Note titles allowed more characters than wiki link targets, creating a mismatch where notes titled "My Note (2024)" could not be linked to.

**Resolution:** Title validation is now aligned with link target validation to prevent unlinkable notes:

```python
# Title validation pattern (in models.py)
VALID_TITLE_PATTERN = re.compile(r'^[A-Za-z0-9 _-]+$')
MAX_TITLE_LENGTH = 200

def validate_title(title: str) -> str:
    """Validate note title.

    Args:
        title: User-provided note title

    Returns:
        Validated and trimmed title

    Raises:
        ValidationError if title contains invalid characters or exceeds length
    """
    title = title.strip()

    if not title:
        raise ValidationError("Title cannot be empty")

    if len(title) > MAX_TITLE_LENGTH:
        raise ValidationError(f"Title exceeds {MAX_TITLE_LENGTH} characters")

    if not VALID_TITLE_PATTERN.match(title):
        raise ValidationError(
            f"Title contains invalid characters. "
            f"Only alphanumeric, spaces, hyphens, and underscores allowed."
        )

    return title
```

**Rationale:** This ensures all notes can be linked to and prevents path traversal/injection attacks via both titles and link targets.

**Dependencies**: `exceptions`

---

### `editor.py`

**Purpose**: Handle external editor invocation for note creation and editing

**Responsibilities**:
1. Detect available editors from fallback chain
2. Open editor with temporary or existing file
3. Detect user cancellation via content changes
4. Handle editor process errors

**Public interface**:

```python
@dataclass
class EditorResult:
    """Result of editor invocation."""
    cancelled: bool  # True if user cancelled (no changes made)
    content: str | None  # Edited content (None if cancelled)
    error: str | None  # Error message if editor failed (None on success)

def open_editor(filepath: str, initial_content: str = "") -> EditorResult:
    """Open external editor for file editing.

    Args:
        filepath: Absolute path to file to edit (may not exist yet)
        initial_content: Content to write to file before opening editor (for new notes)

    Returns:
        EditorResult with outcome of editing session

    Raises:
        ValidationError if filepath is invalid
        VaultError if editor cannot be found or invoked
    """
```

**Editor Detection:**

Editors are checked in order from the `EDITOR_FALLBACK` list. The first editor found in `PATH` is used:

```python
EDITOR_FALLBACK = ["vim", "nano", "vi"]

def find_editor() -> str | None:
    """Find first available editor from fallback list.

    Returns:
        Editor command name if found, None if no editors available
    """
    for editor in EDITOR_FALLBACK:
        if shutil.which(editor) is not None:
            return editor
    return None
```

**If all editors are missing:**
- `open_editor()` raises `VaultError("No text editor found. Install vim, nano, or vi.")`
- Commands (`new`, `edit`) catch this and exit with code 5 (VaultError)

**Editor Process Invocation:**

```python
def open_editor(filepath: str, initial_content: str = "") -> EditorResult:
    editor = find_editor()
    if editor is None:
        raise VaultError("No text editor found. Install vim, nano, or vi.")

    # Write initial content if provided
    if initial_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(initial_content)

    # Record mtime before opening editor
    mtime_before = os.path.getmtime(filepath) if os.path.exists(filepath) else None

    # Open editor subprocess
    # - Inherits stdin/stdout/stderr from parent process (for interactive editing)
    # - Filename passed as positional argument
    try:
        result = subprocess.run([editor, filepath], check=False)
    except FileNotFoundError:
        raise VaultError(f"Editor '{editor}' not found in PATH")
    except Exception as e:
        return EditorResult(cancelled=False, content=None, error=str(e))

    # Check if editor exited with error
    if result.returncode != 0:
        return EditorResult(
            cancelled=False,
            content=None,
            error=f"Editor exited with code {result.returncode}"
        )

    # Read edited content
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return EditorResult(cancelled=False, content=None, error=f"Failed to read file: {e}")

    # Detect cancellation via mtime comparison
    mtime_after = os.path.getmtime(filepath)

    # User cancelled if:
    # 1. File was not modified (mtime unchanged)
    # 2. AND content matches initial_content (or is empty for existing files)
    if mtime_before is not None and mtime_before == mtime_after:
        cancelled = (content == initial_content) if initial_content else (content.strip() == "")
    else:
        cancelled = False

    return EditorResult(cancelled=cancelled, content=content, error=None)
```

**Cancellation Detection Logic:**

User is considered to have cancelled if:
1. `mtime_before == mtime_after` (file modification time unchanged)
2. AND content is unchanged from `initial_content` (for new notes) or empty (for existing notes)

**Rationale:** Some editors (vim, emacs) may create temporary swap files but not modify the original file if user exits without saving. The mtime check detects this.

**Editors that create temp files:** No special handling needed. We monitor the target file's mtime, not temp files. If the editor updates the target file, mtime will change.

**Dependencies**: `models`, `exceptions`

---

## Dependency Graph

```
cli.py
  +-- commands.py
  |     +-- database.py
  |     |     +-- models.py
  |     |     +-- exceptions.py
  |     +-- models.py
  |     +-- link_parser.py
  |     +-- editor.py
  |     |     +-- models.py
  |     |     +-- exceptions.py
  |     +-- exceptions.py
  +-- formatters.py
  |     +-- models.py
  +-- exceptions.py
```

**Rule**: No circular dependencies. Lower layers don't import from higher layers.
