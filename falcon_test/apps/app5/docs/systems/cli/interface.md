# CLI Interface: Contact Book CLI

**Status:** Final

---

## Global Options

These options apply to all commands:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--db PATH` | string | `./contacts.db` | Path to SQLite database file |
| `--verbose` | flag | false | Enable debug output |
| `--help` | flag | - | Show help for command |
| `--version` | flag | - | Show version number |

---

## Commands

### `init`

Initialize a new contacts database.

**Syntax:**
```
contact-cli init [--db PATH] [--force]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--force` | flag | false | Overwrite existing database |

**Behavior:**
1. Check if database file exists
2. If exists and `--force` not set -> error, exit 1
3. If exists and `--force` set -> delete existing file
4. Create new database file
5. Execute schema creation SQL
6. Print success message

**Output (success):**
```
Database initialized at ./contacts.db
```

**Output (exists, no force):**
```
Error: Database already exists at contacts.db. Use --force to recreate.
```

**Exit codes:**
- 0: Success
- 1: Database exists (without --force)
- 2: Cannot create file (permissions, invalid path)

---

### `add`

Add a new contact.

**Syntax:**
```
contact-cli add --name NAME [--email EMAIL] [--phone PHONE] [--company COMPANY] [--notes NOTES]
```

**Required options:**

| Option | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `--name NAME` | string | 1-200 chars, non-empty | Contact name |

**Optional options:**

| Option | Type | Default | Constraints | Description |
|--------|------|---------|-------------|-------------|
| `--email EMAIL` | string | NULL | valid format, max 254 chars | Email address |
| `--phone PHONE` | string | NULL | max 50 chars | Phone number |
| `--company COMPANY` | string | NULL | max 200 chars | Company name |
| `--notes NOTES` | string | NULL | max 5000 chars | Free-form notes |

**Optional flags:**

| Option | Type | Description |
|--------|------|-------------|
| `--force` | flag | Skip duplicate warning and create contact anyway |
| `--no-duplicate-check` | flag | Completely skip duplicate detection |

**Behavior:**
1. Validate all inputs
2. Check email uniqueness (if provided)
3. **Duplicate Detection:** Before creating a contact, check for potential duplicates by:
   - Exact email match (if email provided), OR
   - Exact normalized phone match (if phone provided)
4. If potential duplicate found: warn user and require `--force` to proceed
5. Use `--no-duplicate-check` to skip duplicate detection entirely
6. Insert into database
7. Return created contact ID

**Duplicate Detection Output:**
```
Warning: Potential duplicate contact found:
  ID 42: Jane Smith (jane@example.com, +1-555-123-4567)
Use --force to create anyway, or --no-duplicate-check to skip this check.
```

**Output (success):**
```
Contact created: Jane Smith (ID: 1)
```

**Output (duplicate email - exact match on UNIQUE constraint):**
```
Error: Email 'jane@example.com' already exists.
```

**Output (invalid email):**
```
Error: Invalid email format.
```

**Exit codes:**
- 0: Success
- 1: Validation error (bad input)
- 2: Database error
- 4: Duplicate email

---

### `edit`

Modify an existing contact.

**Syntax:**
```
contact-cli edit ID [--name NAME] [--email EMAIL] [--phone PHONE] [--company COMPANY] [--notes NOTES]
```

**Required:**

| Option | Type | Description |
|--------|------|-------------|
| `ID` | integer | Contact ID to edit |

**Optional (at least one required):**

| Option | Type | Description |
|--------|------|-------------|
| `--name NAME` | string | New name |
| `--email EMAIL` | string | New email (use "" to clear) |
| `--phone PHONE` | string | New phone (use "" to clear) |
| `--company COMPANY` | string | New company (use "" to clear) |
| `--notes NOTES` | string | New notes (use "" to clear) |

**Clearing Fields vs Omitting:**
- `--email ""` or `--email=''`: Sets email to NULL (clears the field)
- Omitting `--email`: Keeps the current value unchanged
- **Shell quoting:** Use `--email ""` (with space) or `--email=''` to pass empty string. Some shells require `--email=''` to avoid the empty argument being dropped.

At least one field to update is REQUIRED. This is validated in the CLI layer (argparse or cli.py). If no fields provided, exit 1 with 'Error: At least one field to update required.'

**Behavior:**
1. Find contact by ID
2. If not found -> error, exit 3
3. Validate new values
4. Update only provided fields
5. Print confirmation

**Output (success):**
```
Contact updated: Jane Smith (ID: 1)
```

**Output (not found):**
```
Error: Contact ID 42 not found.
```

**Exit codes:**
- 0: Success
- 1: Validation error
- 2: Database error
- 3: Not found
- 4: Duplicate email
- 5: Conflict (concurrent modification detected)

---

### `show`

Display full contact details.

**Syntax:**
```
contact-cli show (ID | --email EMAIL) [--format FORMAT]
```

**Required (one of):**

| Option | Type | Description |
|--------|------|-------------|
| `ID` | integer | Contact ID |
| `--email EMAIL` | string | Contact email |

**Optional:**

| Option | Type | Default | Values |
|--------|------|---------|--------|
| `--format FORMAT` | string | `card` | `card`, `json` |

**Behavior:**
1. Find contact by ID or email
2. If not found -> error, exit 3
3. Load contact groups
4. Display full details

**Output (card format):**
```
=======================================
Jane Smith
=======================================
Email:    jane@example.com
Phone:    +1-555-123-4567
Company:  Acme Corp
---------------------------------------
Notes:
Met at TechConf 2026. Interested in partnership.
---------------------------------------
Groups:   Clients, Conference
---------------------------------------
Created:  2026-01-15 10:00:00
Updated:  2026-01-20 14:30:00
```

**Exit codes:**
- 0: Success
- 1: No identifier provided
- 2: Database error
- 3: Not found

---

### `list`

List all contacts.

**Syntax:**
```
contact-cli list [--group GROUP] [--format FORMAT]
```

**Optional:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--group GROUP` | string | (all) | Filter by group name |
| `--format FORMAT` | string | `table` | `table`, `json` |

**Output (table):**
```
ID   | Name          | Email                | Phone           | Company
-----|---------------|----------------------|-----------------|----------
1    | Jane Smith    | jane@example.com     | +1-555-123-4567 | Acme Corp
2    | John Doe      | john.doe@bigco.com   | +1-555-987-6543 | BigCo Inc
```

**Output (empty):**
```
No contacts found.
```

**Exit codes:**
- 0: Success (including empty)
- 2: Database error
- 3: Group not found (when --group specified)

**Note:** When --group is specified but group doesn't exist: exit 3 with 'Error: Group '{name}' not found.' This is distinct from empty results (exit 0).

---

### `search`

Find contacts matching criteria.

**Syntax:**
```
contact-cli search (--name NAME | --email EMAIL | --company COMPANY | --group GROUP) [--format FORMAT]
```

**Search options (at least one required):**

| Option | Type | Description |
|--------|------|-------------|
| `--name NAME` | string | Partial name match (case-insensitive) |
| `--email EMAIL` | string | Partial email match |
| `--company COMPANY` | string | Partial company match |
| `--group GROUP` | string | Exact group name |

**Output options:**

| Option | Type | Default | Values |
|--------|------|---------|--------|
| `--format FORMAT` | string | `table` | `table`, `json` |

**Behavior:**
1. At least one search criterion required
2. Multiple criteria are AND'd together
3. Name/email/company are partial, case-insensitive
4. Group is exact match

**Note:** Multiple criteria including --group are AND'd together. Example: `search --name 'jane' --group 'Clients'` finds contacts named 'jane' who are also in the 'Clients' group.

**Output (table):**
```
ID   | Name          | Email                | Phone           | Company
-----|---------------|----------------------|-----------------|----------
1    | Jane Smith    | jane@example.com     | +1-555-123-4567 | Acme Corp
```

**Output (JSON):**
```json
[
  {
    "id": 1,
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+1-555-123-4567",
    "company": "Acme Corp",
    "notes": null,
    "groups": ["Clients", "Conference"]
  }
]
```

**Exit codes:**
- 0: Success (including empty results)
- 1: No search criteria provided
- 2: Database error
- 3: Group not found (when --group specified)

---

### `delete`

Remove a contact.

**Syntax:**
```
contact-cli delete ID [--force]
```

**Required:**

| Option | Type | Description |
|--------|------|-------------|
| `ID` | integer | Contact ID to delete |

**Optional:**

| Option | Type | Description |
|--------|------|-------------|
| `--force` | flag | Skip confirmation prompt |

**Behavior:**
1. Find contact by ID
2. If not found -> error, exit 3
3. If no --force -> prompt for confirmation
4. Delete contact (cascade removes from groups)
5. Print confirmation

### Confirmation Prompt Behavior

**Prompt Text:** `Delete contact '{name}'? This cannot be undone. [y/N]: `
**Expected Input:**
- 'y' or 'Y': Proceed with deletion
- Any other input (including empty): Cancel deletion

**Non-Interactive Mode (stdin is not a TTY):**
- If --force is not provided: Exit 1 with error "Error: Cannot prompt for confirmation in non-interactive mode. Use --force to skip confirmation."
- If --force is provided: Proceed without prompting

**TTY Detection:**
Non-interactive mode is detected using: `sys.stdin.isatty()`
- Returns False when stdin is piped or redirected
- Returns True when running in terminal

Behavior:
- TTY mode: Show prompt, wait for user input
- Non-TTY mode without --force: Exit 1 with error
- Non-TTY mode with --force: Proceed without prompt

Note: Piped input (e.g., `echo "y" | contact-cli delete 1`) is considered non-interactive.
Use --force flag for scripted operations.

**Cancellation:** Exit 0 with message "Deletion cancelled."

**Output (success):**
```
Contact deleted: Jane Smith (ID: 1)
```

**Output (not found):**
```
Error: Contact ID 42 not found.
```

**Exit codes:**
- 0: Success (including user cancellation - see note)
- 1: Non-interactive mode without --force
- 2: Database error
- 3: Not found

**Note on cancellation:** User choosing to cancel at the prompt is exit 0 because the user's intent (not to delete) was successfully fulfilled. Non-interactive mode without --force is exit 1 because the command cannot proceed as requested.

---

### `group`

Manage contact groups.

**Syntax:**
```
contact-cli group create --name NAME [--description DESC]
contact-cli group list [--format FORMAT]
contact-cli group delete ID [--force]
```

#### `group create`

**Output (success):**
```
Group created: Clients (ID: 1)
```

**Output (duplicate):**
```
Error: Group 'Clients' already exists.
```

**Exit codes:**
- 0: Success
- 1: Validation error
- 2: Database error
- 4: Duplicate

#### `group list`

**Output (table):**
```
ID   | Name          | Description           | Contacts
-----|---------------|-----------------------|----------
1    | Clients       | Business clients      | 15
2    | Conference    | People from confs     | 8
```

**Exit codes:**
- 0: Success

#### `group delete`

**Required:**

| Option | Type | Description |
|--------|------|-------------|
| `ID` | integer | Group ID to delete |

**Optional:**

| Option | Type | Description |
|--------|------|-------------|
| `--force` | flag | Skip confirmation prompt |

**Behavior:**
1. Find group by ID
2. If not found -> error, exit 3
3. If no --force -> prompt for confirmation
4. Delete group (cascade removes contact memberships)
5. Print confirmation

**Confirmation Prompt Behavior:**

**Prompt Text:** `Delete group '{name}'? This cannot be undone. [y/N]: `
**Expected Input:**
- 'y' or 'Y': Proceed with deletion
- Any other input (including empty): Cancel deletion

**Non-Interactive Mode (stdin is not a TTY):**
- If --force is not provided: Exit 1 with error "Error: Cannot prompt for confirmation in non-interactive mode. Use --force to skip confirmation."
- If --force is provided: Proceed without prompting

**Note:** Same TTY detection behavior as the `delete` contact command. See that section for full details.

**Cancellation:** Exit 0 with message "Deletion cancelled."

**Output (success):**
```
Group deleted: Clients (ID: 1)
```

**Note:** Does not delete contacts, only removes group membership.

**Exit codes:**
- 0: Success (including user cancellation - see note)
- 1: Non-interactive mode without --force
- 2: Database error
- 3: Not found

**Note on cancellation:** User choosing to cancel at the prompt is exit 0 because the user's intent (not to delete) was successfully fulfilled. Non-interactive mode without --force is exit 1 because the command cannot proceed as requested.

---

### `assign`

Add contact to group.

**Syntax:**
```
contact-cli assign CONTACT_ID --group GROUP_NAME
```

**Required:**

| Option | Type | Description |
|--------|------|-------------|
| `CONTACT_ID` | integer | Contact ID |
| `--group GROUP_NAME` | string | Group name |

**Group Existence Validation:**
Adding a contact to a group MUST verify the group exists BEFORE attempting the assignment. If the group does not exist, the operation MUST fail with exit code 3 and error message. The system MUST NOT silently create a new group.

**Validation Order:**
1. Verify contact exists (by ID) -> if not, exit 3 with "Contact ID {id} not found."
2. Verify group exists (by name) -> if not, exit 3 with "Group '{name}' not found."
3. Attempt assignment

**Output (success - first assignment):**
```
Added Jane Smith to group 'Clients'
```

**Output (already member):**
```
Jane Smith is already in group 'Clients'
```

**Output (group not found):**
```
Error: Group 'NonExistent' not found.
```

**Already a member:** Exit 0 (idempotent operation)

**Output distinction:**
- First assignment: "Added {name} to group '{group}'"
- Already member: "{name} is already in group '{group}'" (still exit 0)

**Implementation note:** Use `INSERT OR IGNORE` and check `cursor.rowcount == 0` to detect if the contact was already a member (the insert was ignored due to the primary key constraint).

**Exit codes:**
- 0: Success
- 2: Database error
- 3: Contact or group not found (MUST NOT silently create group)

---

### `unassign`

Remove contact from group.

**Syntax:**
```
contact-cli unassign CONTACT_ID --group GROUP_NAME
```

**Output (success):**
```
Removed Jane Smith from group 'Clients'
```

**Not a member:** Exit 0 (idempotent operation)
Output: "{name} is not in group '{group}'"

Rationale: Idempotent operations simplify scripting - the end state is achieved regardless of starting state.

**Exit codes:**
- 0: Success
- 2: Database error
- 3: Contact or group not found

---

### `export-csv`

Export contacts to CSV file.

**Syntax:**
```
contact-cli export-csv --output PATH [--group GROUP] [--force]
```

**Required:**

| Option | Type | Description |
|--------|------|-------------|
| `--output PATH` | string | Output file path |

**Optional:**

| Option | Type | Description |
|--------|------|-------------|
| `--group GROUP` | string | Export only contacts in group |
| `--force` | flag | Overwrite existing file |

**CSV format:**
- Header: `name,email,phone,company,notes`
- Encoding: UTF-8
- Delimiter: comma
- Quote character: double-quote
- Line ending: LF

**Formula Prevention (CSV Injection Mitigation):**
CSV export MUST sanitize fields to prevent formula injection. Any field value starting with `=`, `+`, `-`, `@`, TAB (0x09), or CR (0x0D) MUST be prefixed with a single quote character (`'`).

This prevents formula execution when the exported CSV is opened in spreadsheet applications like Microsoft Excel or Google Sheets.

Example: Contact with name "=SUM(A1)" is exported as "'=SUM(A1)"
Example: Contact with notes starting with tab character is exported with leading single quote

Note: This is a CRITICAL security measure. Without this sanitization, malicious contact data could execute arbitrary formulas when users open exported files in spreadsheet applications.

**Output (success):**
```
Exported 150 contacts to contacts.csv
```

**Output (file exists):**
```
Error: File 'contacts.csv' already exists. Use --force to overwrite.
```

**Exit codes:**
- 0: Success
- 1: File exists/path error
- 2: Database error
- 3: Group not found (when --group specified)

---

### `export-vcard`

Export contacts to vCard format.

**Syntax:**
```
contact-cli export-vcard --output PATH [--id ID] [--group GROUP] [--force]
```

**Required:**

| Option | Type | Description |
|--------|------|-------------|
| `--output PATH` | string | Output file path (.vcf) |

**Optional:**

| Option | Type | Description |
|--------|------|-------------|
| `--id ID` | integer | Export single contact |
| `--group GROUP` | string | Export contacts in group |
| `--force` | flag | Overwrite existing file |

**vCard format (3.0):**
```
BEGIN:VCARD
VERSION:3.0
N:Smith;Jane;;;
FN:Jane Smith
EMAIL:jane@example.com
TEL:+1-555-123-4567
ORG:Acme Corp
NOTE:Met at TechConf
END:VCARD
```

**Note:** The N property is required by vCard 3.0. Format is `N:Last;First;Middle;Prefix;Suffix`.

**vCard Name Splitting:** See `technical.md` for the `split_name_for_vcard()` algorithm. Key behaviors:
- Leading/trailing whitespace is stripped before splitting
- Split on LAST space (everything before = first name, everything after = last name)
- Single names go entirely into last name component
- Empty names produce empty first and last components

**Encoding:** UTF-8 (without BOM)
**Line Endings:** CRLF as per vCard 3.0 specification (RFC 2426)

**Character Escaping (RFC 6350 Compliance):**
vCard fields MUST be escaped per RFC 6350 to prevent vCard injection attacks:
- Backslash (`\`) -> `\\`
- Newline -> `\n`
- Semicolon (`;`) -> `\;`
- Comma (`,`) -> `\,`

This escaping MUST be applied to all text fields (FN, N, ORG, NOTE, etc.) before writing to the vCard file. Failure to properly escape these characters could result in malformed vCard files or injection of additional vCard properties.

**vCard Line Endings Implementation:**
vCard 3.0 requires CRLF (\r\n) line endings per RFC 2426.

Python implementation:
```python
with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write('BEGIN:VCARD\r\n')
    f.write('VERSION:3.0\r\n')
    # ... etc
```

**Exit codes:**
- 0: Success
- 1: File exists/path error
- 2: Database error
- 3: Not found (contact ID when --id specified, or group when --group specified)

---

### `import-csv`

Import contacts from CSV.

**Syntax:**
```
contact-cli import-csv --input PATH [--skip-errors]
```

**Required:**

| Option | Type | Description |
|--------|------|-------------|
| `--input PATH` | string | Input CSV file path |

**Optional:**

| Option | Type | Description |
|--------|------|-------------|
| `--skip-errors` | flag | Continue on validation errors |
| `--skip` | flag | Skip conflicting records (match by email or phone) |
| `--overwrite` | flag | Replace existing contacts with imported data |
| `--merge` | flag | Combine fields (imported values take precedence for non-empty fields) |
| `--match-by` | string | Comma-separated list of match criteria: `email`, `phone` (default: `email,phone`) |

### Conflict Resolution for Imports

When importing a contact that matches an existing contact (by email or phone):

1. **Default behavior (no flags):** Fail with conflict error listing all matching contacts. Exit 1.
2. **--skip:** Skip conflicting records and continue importing non-conflicting ones.
3. **--overwrite:** Replace existing contact with imported data entirely.
4. **--merge:** Combine fields - imported values take precedence for non-empty fields. Existing non-empty fields are preserved if imported field is empty.

**Match criteria** are configurable via `--match-by`:
- `--match-by email` - Match only by exact email
- `--match-by phone` - Match only by exact normalized phone
- `--match-by email,phone` (default) - Match by exact email OR exact normalized phone

**Conflict detection algorithm:**
1. For each row in import file, check if email matches any existing contact (if email provided)
2. Check if normalized phone matches any existing contact (if phone provided)
3. If any match found, apply conflict resolution strategy per flags above

**Example conflict error output:**
```
Error: Import conflict at row 3 (jane@example.com):
  Matches existing contact ID 42 (Jane Smith) by email
Use --skip to skip conflicts, --overwrite to replace, or --merge to combine.
```

**Skip-errors behavior:**
When --skip-errors is set, the following conditions cause a row to be SKIPPED:
- Missing required 'name' column value (empty or whitespace-only)
- Invalid email format (if email column has value)
- Name exceeds 200 characters
- Email exceeds 254 characters
- Phone exceeds 50 characters
- Company exceeds 200 characters
- Notes exceeds 5000 characters
- Duplicate email (email already exists in database)

Skipped rows are counted and reported: "Imported X contacts (Y skipped due to errors)."
Without --skip-errors, ANY of the above conditions causes entire import to fail with exit 1.

**Expected CSV format:**
- Header row required with column names: `name,email,phone,company,notes`
- Column order does not matter - columns are identified by header names, not position
- At minimum `name` column required
- **Missing optional columns:** If optional columns (email, phone, company, notes) are missing from header, those fields are treated as NULL/empty for all rows. No error is raised.
- Extra columns beyond name,email,phone,company,notes are silently ignored during import. No warning is issued.

### Import Security Considerations

**S5: Import File Security**

1. **File Path Validation:** Import file paths MUST be validated to prevent path traversal attacks:
   - Resolve path to absolute path using `os.path.realpath()`
   - Verify the resolved path does not contain `..` after resolution
   - Verify the file stays within allowed directories (current working directory or explicitly configured import directory)
   - Exit 1 with "Error: Path must be within {directory}." if validation fails (using same message as general path validation)

2. **File Size Limit:** Maximum import file size is 10MB
   - Larger files: Exit 1 with "Error: Import file exceeds 10MB limit"
   - **TOCTOU Mitigation:** Instead of checking size then reading, read the file incrementally and abort if accumulated size exceeds limit:
     ```python
     MAX_SIZE = 10 * 1024 * 1024  # 10MB
     content = []
     total_size = 0
     with open(path, 'r', encoding='utf-8') as f:
         for line in f:
             total_size += len(line.encode('utf-8'))
             if total_size > MAX_SIZE:
                 raise ValidationError("Import file exceeds 10MB limit")
             content.append(line)
     ```

3. **Encoding Validation:** File must be valid UTF-8
   - Invalid sequences: Exit 1 with "Error: Invalid UTF-8 encoding in import file"
   - BOM handling: UTF-8 BOM is accepted and stripped

4. **CSV Injection:** Data is stored as-is (no formula execution)
   - Values starting with =, +, -, @ are NOT treated specially
   - This is safe because the CLI never executes cell content
   - Note: If data is later opened in Excel, formulas could execute there (out of scope)

5. **Row Limit:** Maximum 10,000 rows per import
   - More rows: Exit 1 with "Error: Import file exceeds 10,000 row limit"
   - **TOCTOU Mitigation:** Count rows incrementally during processing (same loop as size check), abort if limit exceeded

**Output (success):**
```
Imported 45 contacts (3 skipped due to errors)
```

**Exit codes:**
- 0: Success (including header-only file with no data rows - "Imported 0 contacts")
- 1: Validation errors (without --skip-errors), or empty file (no header)
- 2: File/database error

**Empty file handling:**
- Empty file (0 bytes): Exit 1 with "Error: Import file is empty"
- Header row only (no data rows): Exit 0 with "Imported 0 contacts"

---

### `merge`

Merge duplicate contacts.

**Syntax:**
```
contact-cli merge TARGET_ID SOURCE_ID [--force]
```

**Required:**

| Option | Type | Description |
|--------|------|-------------|
| `TARGET_ID` | integer | Contact to keep |
| `SOURCE_ID` | integer | Contact to merge and delete |

**Optional:**

| Option | Type | Description |
|--------|------|-------------|
| `--force` | flag | Skip confirmation prompt |

**Behavior:**
1. Find both contacts
2. If no --force -> prompt for confirmation
3. Merge: fill empty fields in target from source
4. Transfer all group memberships from source to target
5. Delete source contact
6. Print summary

**Concurrent Edit Protection:**
The merge operation MUST use optimistic locking when updating the target contact. Use the updated_at value read when loading the target contact to detect concurrent modifications. If the update affects 0 rows (because updated_at changed), exit with code 5 (Conflict).

### Field Conflict Resolution

When merging source into target:
- **Empty fields:** Source value fills target's empty field
- **Both have values:** Target's value is KEPT (source value discarded)
- **Notes field:** Target's notes are kept; notes are NOT concatenated
- **Groups:** Source's group memberships are added to target (union)

Example:
- Target: name="Jane", email=NULL, notes="VIP client"
- Source: name="Jane Smith", email="jane@example.com", notes="Met at conference"
- Result: name="Jane", email="jane@example.com", notes="VIP client"

**Email Uniqueness Conflict:**
If the source contact's email would cause a duplicate when merged into the target (because another contact already has that email), the merge fails with exit code 4 (DuplicateError). The user must resolve the email conflict before merging.

### Confirmation Prompt Behavior

**Confirmation Prompt Shows Preview:**
```
Merge contact 43 (Jane Smith) into contact 42 (Jane Doe)?
- Fields to KEEP from target (42): name='Jane Doe', email='jane@old.com'
- Fields to ADD from source (43): phone='+1-555-1234'
- Notes: Target notes will be KEPT (source notes discarded if both have notes)
- Groups to TRANSFER: Conference, VIP
Type 'y' to confirm:
```

**Note:** The notes field is NOT concatenated during merge. Target's notes are kept; source's notes are only used if target has no notes.

**Prompt Text:** `Merge '{source_name}' into '{target_name}'? Source contact will be deleted. [y/N]: `
**Expected Input:**
- 'y' or 'Y': Proceed with merge
- Any other input: Cancel merge

**Non-Interactive Mode:** Same as delete command - require --force or exit with error.

**TTY Detection:**
Non-interactive mode is detected using: `sys.stdin.isatty()`
- Returns False when stdin is piped or redirected
- Returns True when running in terminal

Behavior:
- TTY mode: Show prompt, wait for user input
- Non-TTY mode without --force: Exit 1 with error
- Non-TTY mode with --force: Proceed without prompt

Note: Piped input (e.g., `echo "y" | contact-cli merge 42 43`) is considered non-interactive.
Use --force flag for scripted operations.

**Cancellation:** Exit 0 with message "Merge cancelled."

**Output (success):**
```
Merged contact 43 into 42:
- Kept: Jane Smith
- Added phone: +1-555-999-8888
- Added groups: Conference
Contact 43 deleted.
```

**Output when no fields added from source:**
When the target contact already has all fields populated and no new values are added from the source, the output omits the "Added" lines:
```
Merged contact 43 into 42:
- Kept: Jane Smith
Contact 43 deleted.
```

Note: If no groups are transferred (source had no groups or all were already on target), the "Added groups:" line is also omitted.

**Group Transfer Idempotency:**
When transferring group memberships from source to target during merge, the operation is idempotent. If both contacts share the same group, the transfer uses `INSERT OR IGNORE` to avoid duplicate key errors. The group is simply retained on the target contact without error.

**Exit codes:**
- 0: Success (including user cancellation - see note)
- 1: Same IDs, or non-interactive mode without --force
- 2: Database error
- 3: Not found
- 4: Email conflict (source email matches another contact)

**Note on cancellation:** User choosing to cancel at the prompt is exit 0 because the user's intent (not to merge) was successfully fulfilled. Non-interactive mode without --force is exit 1 because the command cannot proceed as requested.

---

## Input Validation Rules

### Name

- Non-empty
- Maximum 200 characters

### Email

Email validation MUST at minimum verify:
- Contains exactly one `@` character
- Local part (before @) is non-empty
- Domain part (after @) is non-empty
- Domain contains at least one dot (`.`) for standard email addresses
- No spaces anywhere in the address
- Maximum 254 characters

**Validation Requirements:**
- Regex: `^[^\s@]+@[^\s@]+\.[^\s@]+$` (basic validation)
- Alternative (for internal/dev environments): `^[^\s@]+@[^\s@]+$` allows local-style emails like `user@localhost`

**Known Limitations of Basic Regex:**
The basic regex above does not catch:
- Consecutive dots (e.g., `user@domain..com`)
- Domain starting/ending with dot (e.g., `user@.domain.com`)
- Empty labels between dots

**Implementation Note:** Since this project uses standard library only (no pip dependencies per technical.md), use the basic regex with additional validation for consecutive dots and domain label formatting. A more complete stdlib-only implementation:
```python
def validate_email(email: str) -> bool:
    """Validate email format using stdlib only.

    Additional checks beyond basic regex:
    - No consecutive dots
    - Domain doesn't start/end with dot
    - Local part doesn't start/end with dot
    """
    if '..' in email:
        return False
    if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        return False
    local, domain = email.rsplit('@', 1)
    if local.startswith('.') or local.endswith('.'):
        return False
    if domain.startswith('.') or domain.endswith('.'):
        return False
    return True
```

**Note:** If the application allows local-style emails (`user@localhost`), this MUST be explicitly documented as a configuration option, not the default behavior.

### Phone

- Maximum 50 characters
- Any printable characters allowed for display format

**Phone Number Normalization:**
Phone numbers are normalized for duplicate detection. Normalization rules:
1. Remove all non-digit characters EXCEPT leading `+` (for international format)
2. Compare normalized versions to find duplicates

**Storage vs Display:**
- **Stored in database:** Original user input (e.g., `+1-555-123-4567` or `(555) 123-4567`)
- **Used for duplicate detection:** Normalized version (digits only + optional leading +)
- **Displayed in output:** Original stored format (table, JSON, CSV, vCard all show original)

**Examples:**
- Input: `+1-555-123-4567` -> Stored: `+1-555-123-4567`, Normalized for matching: `+15551234567`
- Input: `(555) 123-4567` -> Stored: `(555) 123-4567`, Normalized for matching: `5551234567`
- Input: `555.123.4567` -> Stored: `555.123.4567`, Normalized for matching: `5551234567`

**Extension Handling:**
Phone extensions are handled consistently during normalization using the simple rule above:
- Input: `555-123-4567 ext 123` -> Normalized: `5551234567123` (all non-digit characters removed, digits kept)
- Input: `555-123-4567x123` -> Normalized: `5551234567123` (all non-digit characters removed, digits kept)

**Recommendation:** For contacts with extensions, store the extension in the notes field for clarity.

**Edge Cases:**
- Empty string after normalization (input was all non-digits like "ext only") -> treated as no phone, stored as NULL
- Phone with only international prefix (e.g., just "+") -> treated as no phone, stored as NULL

**Duplicate detection** uses normalized phone numbers for comparison, not the stored display format.

### Company

- Maximum 200 characters

### Notes

- Maximum 5000 characters

### Group name

- Non-empty
- Maximum 100 characters

### Path Validation Rules

Applies to: `--db`, `--output`, `--input`

All paths are validated:
- Must not resolve to location outside current working directory (after symlink resolution)
- Relative paths are converted to absolute
- Parent directory references (..) are resolved by realpath() and caught by containment check

**Symlink Resolution and Containment Check:**
```python
def validate_path(path: str, allowed_base: str | None = None) -> str:
    """Validate path is safe and within allowed directory.

    Args:
        path: Path to validate
        allowed_base: Base directory path must resolve within (default: cwd)

    Validation:
        1. Resolve symlinks with os.path.realpath()
        2. Verify resolved path starts with allowed_base

    Note: The '..' check was removed as it's redundant - realpath() resolves
    parent references, and the containment check catches any escape attempts.
    The broad ".." in path check also incorrectly rejected legitimate filenames
    like "my..file.txt".
    """
    base = os.path.realpath(allowed_base or os.getcwd())
    resolved = os.path.realpath(path)

    if not (resolved.startswith(base + os.sep) or resolved == base):
        raise ValidationError(f"Path must be within {os.path.basename(base)}")

    return resolved
```

For --input specifically:
- File must exist and be readable
- File must be a regular file (not directory, device, etc.)

---

## Output Standards

### Table Format

- Column headers in first row
- Separator line of dashes and pipes
- Fixed-width columns (pad with spaces)
- Truncate values exceeding column width: show first `(width-3)` chars + `...`
- Column widths: ID=4, Name=20, Email=25, Phone=15, Company=15

### JSON Format

- Pretty-printed with 2-space indent
- Arrays for lists (even single item)
- UTF-8 encoding
- No trailing newline
- NULL values: include key with `null` value (not omitted)
- **Field types:**
  - `id`: integer (e.g., `"id": 1`, NOT `"id": "1"`)
  - `name`, `email`, `phone`, `company`, `notes`: string or null
  - `groups`: array of strings (always present, empty array if no groups)
  - `created_at`, `updated_at`: string (ISO 8601 format)

### Error Messages

- Prefix: `Error: `
- Written to stderr
- No stack traces (unless --verbose)
- No internal paths or SQL
