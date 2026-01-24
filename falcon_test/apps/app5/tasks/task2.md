# Task 2: CLI Framework + Init Command

Implement argument parsing, command routing, and the init command.

## Context

Read before starting:
- `docs/design/components.md` - cli.py and __main__.py specifications
- `docs/systems/cli/interface.md` - Global options, init command spec
- `docs/systems/errors.md` - Error handling rules
- `docs/systems/architecture/ARCHITECTURE-simple.md` - CLI layer rules

## Scope

- [ ] `contact_book_cli/__main__.py` - Entry point for `python -m contact_book_cli`
- [ ] `contact_book_cli/cli.py` - argparse setup with all global options and subcommands
- [ ] `init` command fully working with `--force` flag
- [ ] Exception-to-exit-code mapping in CLI layer
- [ ] `--verbose` flag implementation
- [ ] `--version` flag showing version

## Constraints

- **AD2**: No global state - pass database path explicitly to commands, no module-level state
- **AD3**: Explicit error types - map exceptions to exit codes in CLI layer
- **AD5**: Validate all user input at CLI boundary before passing to commands
- **AD7**: Debug output must not include PII
- **S3**: Error message sanitization - never expose SQL errors, full file paths, or internal details
- CLI layer MUST NOT import sqlite3 or access database directly
- CLI layer MUST NOT contain business logic
- Use argparse only (no Click, Typer, etc.)

## Tests Required

- CLI parses all global options correctly (`--db`, `--verbose`, `--version`)
- CLI routes to correct subcommand
- `init` creates database file
- `init` refuses to overwrite without `--force`
- `init --force` recreates database
- Exit codes are correct for each error type
- `--version` shows version

## Not In Scope

- add, edit, show, list, search, delete commands (Task 3)
- group commands (Task 3)
- export/import commands (Task 4)
- Output formatting (Task 3)

## Acceptance Criteria

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
# Output: contact_book_cli 0.1.0
# Note: Module name is 'contact_book_cli', script alias is 'contact-cli'
# When invoked via `python -m`, version shows module name
# When invoked via `contact-cli --version`, output is also 'contact_book_cli 0.1.0' for consistency
```
