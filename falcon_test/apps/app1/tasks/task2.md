# Task 2: CLI Framework + Init Command

Implement argument parsing, command routing, and the init command.

## Context

Read before starting:
- `docs/design/components.md` - cli.py and __main__.py specifications
- `docs/systems/cli/interface.md` - Global options, init command spec
- `docs/systems/errors.md` - Error handling rules
- `docs/systems/architecture/ARCHITECTURE-simple.md` - CLI layer rules

## Scope

- [ ] `warehouse_cli/__main__.py` - Entry point for `python -m warehouse_cli`
- [ ] `warehouse_cli/cli.py` - argparse setup with all global options and subcommands
- [ ] `init` command fully working with `--force` flag
- [ ] Exception-to-exit-code mapping in CLI layer
- [ ] `--verbose` flag implementation:
  - When enabled, prints DEBUG messages to stderr for key operations (e.g., "DEBUG: Connecting to {db_path}")
  - On exceptions, prints full stack trace to stderr
  - Includes full file paths in error messages (not just basename)
  - Applies to ALL commands
  - MUST NOT log SQL query text (parameter values could contain sensitive data) - see errors.md verbose mode section

## Constraints

- **AD5**: Validate all user input at CLI boundary before passing to commands
- CLI layer MUST NOT import sqlite3 or access database directly
- CLI layer MUST NOT contain business logic
- Use argparse only (no Click, Typer, etc.)

## Tests Required

- CLI parses all global options correctly
- CLI routes to correct subcommand
- `--help` flag displays usage information
- `init` creates database file
- `init` refuses to overwrite without `--force`
- `init --force` recreates database
- Exit codes are correct for each error type

### Additional CLI Test Cases

**Path validation edge cases:**
- Path with `..` in middle: `foo/../bar` (invalid)
- Path with `..` at start: `../foo.db` (invalid)
- Path with encoded `..`: `%2e%2e` (invalid - MUST check for URL-encoded patterns per technical.md:266)
- Path with double-encoded `..`: `%252e` (invalid - MUST check per technical.md:266)
- Relative path without `..` (valid)
- Absolute path (valid)

**Implementation note for path validation:** The `validate_path()` function MUST check for both literal `..` AND encoded patterns `%2e%2e` and `%252e` (double-encoded) in the original path BEFORE normalization, as specified in technical.md security considerations section. This prevents URL encoding bypass attacks.

**Argument parsing edge cases:**
- Long option values: `--name` with 200 character string
- Empty string arguments: `--sku ""`
- Whitespace-only arguments: `--sku "   "`
- Arguments with special shell characters: `--name "Widget 'A'"`

## Not In Scope

- add-item, update-stock, search, low-stock-report commands (Task 3)
- export-csv command (Task 4)
- Output formatting (Task 3)

## Acceptance Criteria

```bash
# Creates new database (explicit path)
python -m warehouse_cli init --db ./test.db
# Output: Database initialized at ./test.db
# Exit: 0

# Creates new database (default path when --db omitted)
python -m warehouse_cli init
# Output: Database initialized at ./inventory.db
# Exit: 0

# Refuses to overwrite (error shows basename only per S3 error sanitization)
python -m warehouse_cli init --db ./test.db
# Output: Error: Database already exists at 'test.db'. Use --force to recreate.
# Exit: 1

# Force recreates
python -m warehouse_cli init --db ./test.db --force
# Output: Database initialized at ./test.db
# Exit: 0

# Shows version
python -m warehouse_cli --version
# Output: warehouse-cli 0.1.0
```
