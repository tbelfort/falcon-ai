# Task 3: Core Commands + Formatters

Implement contact and group CRUD, search, and output formatting.

## Context

Read before starting:
- `docs/design/components.md` - commands.py and formatters.py specifications
- `docs/systems/cli/interface.md` - Command specs for add, edit, show, list, search, delete, group, assign, unassign
- `docs/systems/database/schema.md` - Query patterns
- `docs/systems/architecture/ARCHITECTURE-simple.md` - Layer rules

## Scope

- [ ] `contact_book_cli/commands.py` - Business logic for:
  - add, edit, show, list, search, delete (contacts)
  - group create, group list, group delete
  - assign, unassign
- [ ] `contact_book_cli/formatters.py` - Table, JSON, and card formatters
- [ ] Integration of commands into cli.py argument parser
- [ ] Input validation for all command arguments

## Constraints

- **AD1**: Commands return data, CLI layer handles formatting and printing
- **AD4**: All queries use parameterized placeholders
- **AD5**: Validate inputs at CLI boundary
- **AD7**: Never log PII values
- **S1**: Parameterized queries only - no string interpolation in SQL
- **S3**: Error message sanitization - user-facing errors must not expose SQL or internal paths
- Commands MUST NOT print to stdout/stderr (return data only)
- Commands MUST NOT catch exceptions (let them propagate to CLI)

## Tests Required

### Contact Commands
- add: success, duplicate email (exit 4), invalid email (exit 1), empty name (exit 1)
- add: duplicate phone detection - adding contact with phone that normalizes to same value as existing contact triggers warning (requires --force). See `interface.md` Phone Normalization section for algorithm details.
- add: unicode names (e.g., "Jose Garcia", "Muller", "Tanaka Taro"), international phone formats (e.g., "+81-3-1234-5678", "+44 20 7946 0958")
- edit: success, not found (exit 3), duplicate email (exit 4), no fields (exit 1)
- show: by ID success, by email success, not found (exit 3), no identifier (exit 1)
- list: all contacts, by group, empty result, group not found (exit 3)
- search: by name, by email, by company, by group, combined, no results, no criteria (exit 1)
- search by nonexistent group: `search --group "NoSuchGroup"` -> exit 3, "Error: Group 'NoSuchGroup' not found"
- delete: success, not found (exit 3), with confirmation, with --force, non-interactive without --force (exit 1), cancellation (exit 0)

### Group Commands
- group create: success, duplicate name (exit 4), empty name (exit 1)
- group list: success, empty list
- group delete: success, not found (exit 3), with confirmation, with --force, non-interactive without --force (exit 1), cancellation (exit 0)

### Assignment Commands
- assign: success, contact not found (exit 3), group not found (exit 3), already member
- unassign: success, contact not found (exit 3), group not found (exit 3)

### Formatters
- Table format: proper column widths, truncation, empty table message
- JSON format: proper structure, null handling, empty array
- Card format: full contact display with groups

## Not In Scope

- export-csv, export-vcard, import-csv commands (Task 4)
- merge command (Task 4)
- CSV/vCard formatting (Task 4)

## Acceptance Criteria

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
