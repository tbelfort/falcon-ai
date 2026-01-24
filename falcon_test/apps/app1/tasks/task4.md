# Task 4: CSV Export

Implement the export-csv command with file handling.

## Context

Read before starting:
- `docs/design/components.md` - formatters.py CSV specification
- `docs/systems/cli/interface.md` - export-csv command specification
- `docs/systems/database/schema.md` - Get All Products query
- `docs/systems/architecture/ARCHITECTURE-simple.md` - S2 path validation

## Scope

- [ ] `export-csv` command in commands.py
- [ ] CSV writing in formatters.py (RFC 4180 compliant)
- [ ] File existence checking with `--force` handling
- [ ] Location filter support (`--filter-location`)
- [ ] Path validation (no `..` traversal)

## Constraints

- **S2**: Validate paths - must not contain `..`
- CSV must be RFC 4180 compliant (comma delimiter, double-quote escaping, UTF-8)
- **CSV Injection Prevention (CRITICAL)**: All string fields (sku, name, description, location) MUST be sanitized to prevent formula injection. Fields starting with `=`, `+`, `-`, `@`, `\t`, or `\r` MUST be prefixed with `'` (single quote). See interface.md for full specification.
- Must handle existing file gracefully (require --force to overwrite)
- Error messages must use basename only, not full path

## Tests Required

- Export creates valid CSV with header row
- CSV has correct columns in correct order (MUST match interface.md CSV format section: sku,name,description,quantity,min_stock_level,location,created_at,updated_at)
- CSV properly escapes fields with commas and quotes
- Location filter works correctly
- File exists without --force → exit 1
- File exists with --force → overwrites, exit 0
- Path with `..` → exit 1
- Output path not writable → exit 1 (ValidationError, NOT exit 2 DatabaseError - see errors.md for distinction)

### Additional CSV Export Test Cases

**RFC 4180 escaping tests:**
- Field containing comma: `Widget, Large` → `"Widget, Large"`
- Field containing double-quote: `Widget "Pro"` → `"Widget ""Pro"""`
- Field containing newline: `Line1\nLine2` → `"Line1\nLine2"`
- Field containing all special chars: `Widget, "Pro"\nEdition`
- Field with leading/trailing spaces (should be preserved)

**CSV Injection Prevention tests (CRITICAL):**
- Name starting with `=`: `=1+1` → `'=1+1` (prefixed with single quote)
- Name starting with `+`: `+44-123-4567` → `'+44-123-4567`
- Name starting with `-`: `-10 degrees` → `'-10 degrees`
- Name starting with `@`: `@mention` → `'@mention`
- Description starting with tab or CR (verify sanitization)
- SKU and location fields also sanitized if starting with dangerous chars
- Normal fields NOT prefixed: `Widget A` → `Widget A` (unchanged)

**Unicode and special character tests:**
- Export items with Unicode names
- Export items with emoji in description
- Export items with NULL description (empty field, not "NULL" string)
- Export items with NULL location

**Boundary tests:**
- Export with 0 items (header only)
- Export with 1 item
- Export single item with all fields at max length
- Export filtered by location with no matches (header only)

**Path validation tests:**
- Output to relative path (valid)
- Output to absolute path (valid)
- Output path with `..` anywhere in path (invalid)
- Output path with URL-encoded `..` like `%2e%2e` (invalid - MUST be rejected per technical.md:266)
- Output path with double-encoded `..` like `%252e` (invalid - MUST be rejected per technical.md:266)
- Output to directory that doesn't exist (should fail gracefully)
- Output filename with special characters: `export (1).csv`

**Symlink TOCTOU prevention tests (Unix only):**
- Create symlink to sensitive file (e.g., `/etc/passwd`), export to symlink path → should fail with ValidationError (exit 1)
- Normal file (not symlink) → should succeed
- Test skipped on Windows (O_NOFOLLOW not supported)
- Error message MUST be: "Error: Path '{filename}' is a symbolic link."

## Not In Scope

- All other commands (completed in Tasks 1-3)

## Acceptance Criteria

```bash
# Export all items
python -m warehouse_cli export-csv --output inventory.csv --db ./test.db
# Output: Exported 150 items to inventory.csv
# Exit: 0
# File created with header: sku,name,description,quantity,min_stock_level,location,created_at,updated_at

# File exists error
python -m warehouse_cli export-csv --output inventory.csv --db ./test.db
# Output: Error: File 'inventory.csv' already exists. Use --force to overwrite.
# Exit: 1

# Force overwrite
python -m warehouse_cli export-csv --output inventory.csv --force --db ./test.db
# Output: Exported 150 items to inventory.csv
# Exit: 0

# Filter by location
python -m warehouse_cli export-csv --output aisle-a.csv --filter-location "Aisle-A" --db ./test.db
# Output: Exported 25 items to aisle-a.csv
# Exit: 0

# Path traversal blocked
python -m warehouse_cli export-csv --output ../../../etc/passwd --db ./test.db
# Output: Error: Path cannot contain '..'.
# Exit: 1
```
