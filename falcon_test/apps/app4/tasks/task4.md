# Task 4: CSV Export

Implement the export-csv command with file handling.

## Context

Read before starting:
- `docs/design/components.md` - formatters.py CSV specification
- `docs/systems/cli/interface.md` - export-csv command specification
- `docs/systems/database/schema.md` - Get All Tasks query
- `docs/systems/architecture/ARCHITECTURE-simple.md` - S3 path validation

## Scope

- [ ] `export-csv` command in commands.py
- [ ] CSV writing in formatters.py (RFC 4180 compliant)
- [ ] File existence checking with `--force` handling
- [ ] Filter support (`--status`, `--project`, `--since`)
- [ ] Path validation (no `..` traversal)

## Constraints

- **S3**: Validate paths - must not contain `..`
- CSV must be RFC 4180 compliant (comma delimiter, double-quote escaping, UTF-8)
- Must handle existing file gracefully (require --force to overwrite)
- Error messages must use basename only, not full path

## Tests Required

- Export creates valid CSV with header row
- CSV has correct columns in correct order (id,title,description,status,priority,due_date,project,labels,created_at,updated_at,completed_at)
- CSV properly escapes fields with commas and quotes
- Status filter works correctly
- Project filter works correctly
- --since filter works correctly
- File exists without --force -> exit 1
- File exists with --force -> overwrites, exit 0
- Path with `..` -> exit 1
- Output path not writable -> exit 2

## Not In Scope

- All other commands (completed in Tasks 1-3)

## Acceptance Criteria

```bash
# Export all tasks
python -m task_cli export-csv --output tasks.csv --db ./test.db
# Output: Exported 10 tasks to tasks.csv
# Exit: 0
# File created with header: id,title,description,status,priority,due_date,project,labels,created_at,updated_at,completed_at

# File exists error
python -m task_cli export-csv --output tasks.csv --db ./test.db
# Output: Error: File 'tasks.csv' already exists. Use --force to overwrite.
# Exit: 1

# Force overwrite
python -m task_cli export-csv --output tasks.csv --force --db ./test.db
# Output: Exported 10 tasks to tasks.csv
# Exit: 0

# Filter by status
python -m task_cli export-csv --output completed.csv --status completed --db ./test.db
# Output: Exported 5 tasks to completed.csv
# Exit: 0

# Filter by project
python -m task_cli export-csv --output backend.csv --project backend --db ./test.db
# Output: Exported 3 tasks to backend.csv
# Exit: 0

# Filter by date
python -m task_cli export-csv --output recent.csv --since 2026-01-14 --db ./test.db
# Output: Exported 8 tasks to recent.csv
# Exit: 0

# Path traversal blocked
python -m task_cli export-csv --output ../../../etc/passwd --db ./test.db
# Output: Error: Path cannot contain '..'.
# Exit: 1
```
