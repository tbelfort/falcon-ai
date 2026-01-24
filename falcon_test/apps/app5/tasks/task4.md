# Task 4: Export/Import + Merge

Implement export-csv, export-vcard, import-csv, and merge commands.

## Context

Read before starting:
- `docs/design/components.md` - formatters.py CSV/vCard specification
- `docs/systems/cli/interface.md` - export-csv, export-vcard, import-csv, merge command specs
- `docs/systems/database/schema.md` - Get All Contacts query
- `docs/systems/architecture/ARCHITECTURE-simple.md` - S2 path validation, S4 PII protection

## Scope

- [ ] `export-csv` command in commands.py
- [ ] `export-vcard` command in commands.py
- [ ] `import-csv` command in commands.py
- [ ] `merge` command in commands.py
- [ ] CSV writing in formatters.py (RFC 4180 compliant)
- [ ] vCard writing in formatters.py (vCard 3.0)
- [ ] CSV parsing for import
- [ ] File existence checking with `--force` handling
- [ ] Path validation (no `..` traversal)

## Constraints

- **S2**: Validate paths - must not contain `..`
- **S4**: PII protection - notes may contain sensitive data
- CSV must be RFC 4180 compliant (comma delimiter, double-quote escaping, UTF-8)
- vCard must be version 3.0 compliant
- Error messages must use basename only, not full path
- Must handle existing file gracefully (require --force to overwrite)

### Import Security Considerations

**S5: Import File Security**

1. **File Size Limit:** Maximum import file size is 10MB
   - Larger files: Exit 1 with "Error: Import file exceeds 10MB limit"

2. **Encoding Validation:** File must be valid UTF-8
   - Invalid sequences: Exit 1 with "Error: Invalid UTF-8 encoding in import file"
   - BOM handling: UTF-8 BOM is accepted and stripped

3. **CSV Injection:** Data is stored as-is (no formula execution)
   - Values starting with =, +, -, @ are NOT treated specially
   - This is safe because the CLI never executes cell content
   - Note: If data is later opened in Excel, formulas could execute there (out of scope)

4. **Row Limit:** Maximum 10,000 rows per import
   - More rows: Exit 1 with "Error: Import file exceeds 10,000 row limit"

## Tests Required

### export-csv
- Creates valid CSV file with header row
- Correct columns: name,email,phone,company,notes
- Properly escapes fields with commas and quotes
- Group filter works correctly
- File exists without --force -> exit 1
- File exists with --force -> overwrites, exit 0

### export-vcard
- Creates valid vCard 3.0 format
- Single contact export with --id
- Multiple contacts export
- Group filter works correctly
- File exists handling with --force

### import-csv
- Valid file imports successfully
- Missing name column -> error
- Skip-errors flag continues on validation errors
- Handles different encodings
- Reports imported and skipped counts
- Extra columns beyond standard fields are silently ignored
- Header-only file (no data rows) -> exit 0 with "Imported 0 contacts"
- Non-interactive mode tests (matching delete/merge behavior)

### merge
- Success: fields from source fill empty in target
- Success: group memberships transferred
- Source contact deleted after merge
- Contact not found -> exit 3
- Same IDs (merge with self) -> exit 1
- Confirmation prompt without --force
- Email conflict: merge fails with exit 4 if source email would conflict with another contact (not the target)

### Path validation
- Path with `..` -> exit 1 with clear message
- Output path not writable -> exit 1

## Not In Scope

- All other commands (completed in Tasks 1-3)

## Acceptance Criteria

```bash
# Export CSV
python -m contact_book_cli export-csv --output contacts.csv --db ./test.db
# Output: Exported 10 contacts to contacts.csv
# Exit: 0
# File has header: name,email,phone,company,notes

# Export CSV with group filter
python -m contact_book_cli export-csv --output clients.csv --group "Clients" --db ./test.db
# Output: Exported 5 contacts to clients.csv
# Exit: 0

# Export vCard
python -m contact_book_cli export-vcard --output contacts.vcf --group "Clients" --db ./test.db
# Output: Exported 5 contacts to contacts.vcf
# Exit: 0

# Import CSV
python -m contact_book_cli import-csv --input new_contacts.csv --db ./test.db
# Output: Imported 20 contacts (0 skipped)
# Exit: 0

# Import CSV with errors
python -m contact_book_cli import-csv --input bad_contacts.csv --skip-errors --db ./test.db
# Output: Imported 18 contacts (2 skipped due to errors)
# Exit: 0

# Merge contacts
python -m contact_book_cli merge 1 2 --force --db ./test.db
# Output: Merged contact 2 into 1:
#         - Kept: Jane Smith
#         - Added phone: +1-555-999-8888
#         - Added groups: Conference
#         Contact 2 deleted.
# Exit: 0

# Path traversal blocked
python -m contact_book_cli export-csv --output ../../../etc/passwd --db ./test.db
# Output: Error: Path must be within {directory}.
# Exit: 1

# File exists without force
python -m contact_book_cli export-csv --output contacts.csv --db ./test.db
# Output: Error: File 'contacts.csv' already exists. Use --force to overwrite.
# Exit: 1

# File exists with force
python -m contact_book_cli export-csv --output contacts.csv --force --db ./test.db
# Output: Exported 10 contacts to contacts.csv
# Exit: 0
```
