# Task 3: Core Commands + Formatters

Implement all core commands and output formatting.

## Context

Read before starting:
- `docs/design/components.md` - commands.py and formatters.py specifications
- `docs/systems/cli/interface.md` - Command specifications for all commands
- `docs/systems/database/schema.md` - Query patterns including combined search
- `docs/systems/architecture/ARCHITECTURE-simple.md` - Layer rules

## Scope

- [ ] `task_cli/commands.py` - Business logic for: add, edit, list, show, done, archive, project (add/list/archive/unarchive), label (add/remove/list), due, report
- [ ] `task_cli/formatters.py` - Table, JSON, and detail formatters for tasks, projects, labels, reports
- [ ] Integration of all commands into cli.py argument parser
- [ ] Input validation for all command arguments

## Constraints

- **AD1**: Commands return data, CLI layer handles formatting and printing
- **AD2**: No global state - each command function receives db_path as explicit parameter
- **AD4**: All queries use parameterized placeholders
- **AD5**: Validate inputs at CLI boundary
- **AD7**: Strict date parsing for --due option
- **S2**: Input validation for priority, status, date (from ARCHITECTURE-simple.md)
- Commands MUST NOT print to stdout/stderr (return data only)
- Commands MUST NOT catch exceptions (let them propagate to CLI)

## Tests Required

- add: success, invalid priority (exit 1), invalid date (exit 1), project not found (exit 3)
- edit: success, not found (exit 3), no changes specified (exit 1)
- list: by status, by priority, by project, by label, search, overdue, combined filters, no results
- show: success, not found (exit 3)
- done: success, not found (exit 3), already completed (warn)
- archive: success, not completed (exit 1)
- project add: success, duplicate (exit 4)
- project list: with and without archived
- project archive: success, not found (exit 3)
- label add/remove: success, task not found
- label list: shows counts correctly
- due: today, week, overdue periods
- report: all periods, correct counts
- Table format: proper column widths, truncation, empty message
- JSON format: proper structure, null handling, empty array

## Not In Scope

- export-csv command (Task 4)
- CSV formatting (Task 4)

## Acceptance Criteria

```bash
# Add task
python -m task_cli add "Fix login bug" --priority high --due 2026-01-25 --db ./test.db
# Output: Task created: 1 - Fix login bug
# Exit: 0

# Add with project
python -m task_cli project add "backend" --db ./test.db
python -m task_cli add "Fix API" --project backend --db ./test.db
# Output: Task created: 2 - Fix API
# Exit: 0

# List pending tasks
python -m task_cli list --db ./test.db
# Output: Table with task 1 and 2
# Exit: 0

# Complete task
python -m task_cli done 1 --db ./test.db
# Output: Completed: 1
# Exit: 0

# Show task
python -m task_cli show 1 --db ./test.db
# Output: Detailed task view with status=completed
# Exit: 0

# Add label
python -m task_cli label add 2 urgent --db ./test.db
# Output: Label 'urgent' added to task 2.
# Exit: 0

# Filter by label
python -m task_cli list --label urgent --db ./test.db
# Output: Table with task 2 only
# Exit: 0

# Due today
python -m task_cli due today --db ./test.db
# Output: Tasks due today (or empty)
# Exit: 0

# Report
python -m task_cli report --period week --db ./test.db
# Output: Statistics for the week
# Exit: 0
```
