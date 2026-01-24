# Task 2: CLI Framework + Init/New Commands

Implement argument parsing, command routing, and the init/new commands.

## Context

Read before starting:
- `docs/design/components.md` - cli.py and __main__.py specifications
- `docs/systems/cli/interface.md` - Global options, init and new command specs
- `docs/systems/errors.md` - Error handling rules
- `docs/systems/architecture/ARCHITECTURE-simple.md` - CLI layer rules, security rules S2 and S3

## Scope

- [ ] `notes_cli/__main__.py` - Entry point for `python -m notes_cli`
- [ ] `notes_cli/cli.py` - argparse setup with all global options and subcommands
- [ ] `notes_cli/commands.py` - `cmd_init()` and `cmd_new()` implementation
- [ ] `init` command fully working with `--force` flag
- [ ] `new` command fully working with `$EDITOR` integration and `--tags`
- [ ] Exception-to-exit-code mapping in CLI layer
- [ ] `--verbose` flag implementation

## Constraints

- **AD5**: Validate all user input at CLI boundary before passing to commands
- **S2**: Path validation (no `..` in vault path)
- **S3**: Filename sanitization for note titles
- CLI layer MUST NOT import sqlite3 or access database directly
- CLI layer MUST NOT contain business logic
- Use argparse only (no Click, Typer, etc.)

## Tests Required

- CLI parses all global options correctly (`--vault`, `--verbose`, `--version`)
- CLI routes to correct subcommand
- `init` creates vault directory and database
- `init` refuses to overwrite without `--force` (exit 5)
- `init --force` reinitializes database (preserves notes)
- `new` creates note file with correct filename
- `new` opens `$EDITOR` (mock in tests)
- `new` refuses duplicate titles (exit 4)
- `new` with `--tags` adds tags correctly
- Path validation rejects `..`
- Exit codes are correct for each error type

### Editor Fallback Tests
- $VISUAL set -> uses $VISUAL (takes precedence over $EDITOR)
- $VISUAL unset, $EDITOR set -> uses $EDITOR
- Both unset, vim available -> uses vim
- Both unset, vim unavailable, nano available -> uses nano
- No editor available -> exit 1 with "Error: No editor found. Set $EDITOR environment variable."

### Editor Exit Handling Tests
- Editor exits with non-zero code: for 'new', delete created file; for 'edit', no database update
- Editor exits normally but file mtime unchanged: treat as cancelled (no save occurred)
- Editor cancellation does not update database
- Empty file after edit: warn user but allow (exit 0)

### Verbose Mode Tests
- `--verbose` prints database path to stderr: `DEBUG: Database path: /path/to/.notes.db`
- `--verbose` prints operation names: `DEBUG: Executing cmd_new()`
- `--verbose` prints file I/O operations: `DEBUG: Reading file: /path/to/note.md`
- `--verbose` shows full stack traces on error
- `--verbose` does NOT print SQL query text or parameter values

## Not In Scope

- show, list, search commands (Task 3)
- tag commands (Task 3)
- edit command (Task 3)
- export, backup, links commands (Task 4)
- Full output formatting (Task 3)

## Acceptance Criteria

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
# Output: Error: Vault already exists at /tmp/test_vault. Use --force to reinitialize.
# Exit: 5

# Force reinitializes
python -m notes_cli init --vault /tmp/test_vault --force
# Output: Vault initialized at /tmp/test_vault
# Exit: 0

# Creates new note (mock EDITOR)
EDITOR=true python -m notes_cli new "Test Note" --vault /tmp/test_vault
# Output: Created: test-note.md
# File exists: /tmp/test_vault/test-note.md

# Creates note with tags
EDITOR=true python -m notes_cli new "Tagged Note" --tags "database,performance" --vault /tmp/test_vault
# Output: Created: tagged-note.md
# Tags stored in database

# Shows version
python -m notes_cli --version
# Output: notes-cli 0.1.0

# Path traversal blocked
python -m notes_cli init --vault ../../../etc/vault
# Output: Error: Path cannot contain '..'
# Exit: 1

# Duplicate note blocked
EDITOR=true python -m notes_cli new "Test Note" --vault /tmp/test_vault
# Output: Error: Note 'Test Note' already exists.
# Exit: 4
```
