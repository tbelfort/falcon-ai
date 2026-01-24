# Task 2: CLI Framework + Init Command

Implement argument parsing, command routing, and the init command.

## Context

Read before starting:
- `docs/design/components.md` - cli.py and __main__.py specifications
- `docs/systems/cli/interface.md` - Global options, init command spec
- `docs/systems/errors.md` - Error handling rules
- `docs/systems/architecture/ARCHITECTURE-simple.md` - CLI layer rules

## Scope

- [ ] `task_cli/__main__.py` - Entry point for `python -m task_cli`
- [ ] `task_cli/cli.py` - argparse setup with all global options and subcommands (stubs for commands not yet implemented)
- [ ] `init` command fully working with `--force` flag
- [ ] Exception-to-exit-code mapping in CLI layer
- [ ] `--verbose` flag implementation
- [ ] `--version` flag

## Constraints

- **AD5**: Validate all user input at CLI boundary before passing to commands
- CLI layer MUST NOT import sqlite3 or access database directly
- CLI layer MUST NOT contain business logic
- Use argparse only (no Click, Typer, etc.)
- **S4**: Error message sanitization (from ARCHITECTURE-simple.md)

## Tests Required

- CLI parses all global options correctly (`--db`, `--verbose`, `--version`)
- CLI routes to correct subcommand
- `init` creates database file with all tables
- `init` refuses to overwrite without `--force`
- `init --force` recreates database
- Exit codes are correct for each error type
- `--version` outputs correct version

## Not In Scope

- add, edit, list, show, done, archive commands (Task 3)
- project, label, due, report commands (Task 3)
- export-csv command (Task 4)
- Output formatting (Task 3)

## Acceptance Criteria

```bash
# Creates new database
python -m task_cli init --db ./test.db
# Output: Database initialized at ./test.db
# Exit: 0

# Refuses to overwrite
python -m task_cli init --db ./test.db
# Output: Error: Database already exists at test.db. Use --force to recreate.
# Exit: 1

# Force recreates
python -m task_cli init --db ./test.db --force
# Output: Database initialized at ./test.db
# Exit: 0

# Shows version
python -m task_cli --version
# Output: task-cli 0.1.0
```
