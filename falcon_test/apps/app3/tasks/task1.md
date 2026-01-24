# Task 1: Data Layer

Implement the foundation modules for the Note-taking/Wiki CLI.

## Context

Read before starting:
- `docs/design/technical.md` - Architecture decisions (especially AD1-AD8)
- `docs/design/components.md` - Module specifications
- `docs/systems/database/schema.md` - SQLite schema and query patterns
- `docs/systems/errors.md` - Exception hierarchy

## Scope

- [ ] `notes_cli/__init__.py` - Package marker with `__version__ = "0.1.0"`
- [ ] `notes_cli/exceptions.py` - Full exception hierarchy (NotesError, ValidationError, DatabaseError, NoteNotFoundError, DuplicateNoteError, VaultError)
- [ ] `notes_cli/models.py` - Note, Link, SearchResult, LinkInfo, TagInfo dataclasses; validation functions; sanitize_title_to_filename
- [ ] `notes_cli/database.py` - Connection management, schema creation, all query functions, `check_fts_integrity()` function
- [ ] `notes_cli/link_parser.py` - Parse [[wiki-links]] from markdown content

## Constraints

- **AD1**: Layered architecture - database layer must not validate business rules
- **AD4**: All queries MUST use parameterized placeholders (`?`). No string interpolation.
- **AD6**: Use context managers for all database connections
- **AD7**: Content in files, metadata in SQLite
- **AD8**: Filename sanitization rules

## Tests Required

- Unit tests for `validate_title()`, `validate_tag()`, `validate_vault_path()`, `validate_output_path()`
- Unit tests for `sanitize_title_to_filename()` with edge cases:
  - Title with spaces
  - Title with special characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)
  - Title exceeding 100 characters
  - Empty title
- Unit tests for each database function using in-memory SQLite
- Unit tests for `link_parser.extract_links()` with various patterns:
  - Single link: `[[Note]]`
  - Multiple links: `[[Note1]] and [[Note2]]`
  - Link with spaces: `[[My Note Title]]`
  - No links
- Test exception hierarchy (exit codes, inheritance)

### Security Tests
- Database file permissions: After `init`, verify `.notes.db` has 0600 permissions (Unix only)
  - Test: `stat -c %a .notes/.notes.db` should return `600`
  - On Windows: Skip this test (permissions work differently)
  - Implementation MUST use umask approach as specified in schema.md (os.umask(0o077) before sqlite3.connect())

### Binary File Validation Tests
- `is_binary_content()`: Returns True for content with null bytes
- `is_binary_content()`: Returns False for plain text content
- `validate_text_file()`: Returns content for valid UTF-8 text file
- `validate_text_file()`: Raises ValidationError for binary file (contains null bytes)
- `validate_text_file()`: Raises ValidationError for non-UTF-8 encoded file

### Template Expansion Security Tests
- `expand_template()`: Expands {title}, {date}, {datetime}, {filename} correctly
- `expand_template()`: Leaves unknown variables as-is (not evaluated)
- `expand_template()`: Does NOT execute Python expressions like {__import__('os')}
- `expand_template()`: Handles double braces {{ }} as literal braces

## Not In Scope

- CLI argument parsing (Task 2)
- Command business logic (Task 2-4)
- Output formatting (Task 3)
- File operations for notes (Task 2-4)

## Acceptance Criteria

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

# Validation raises on bad input
from notes_cli.models import validate_vault_path
from notes_cli.exceptions import ValidationError
try:
    validate_vault_path("../../../etc/passwd", base_dir="/home/user")
    assert False, "Should have raised"
except ValidationError as e:
    assert "path traversal" in e.message.lower() or "outside" in e.message.lower()

# FTS integrity check function exists and works
from notes_cli.database import check_fts_integrity
with get_connection("/tmp/test_vault") as conn:
    # Fresh database should pass integrity check
    assert check_fts_integrity(conn) == True
```
