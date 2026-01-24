# Use Cases: Contact Book CLI

## UC1: Initial Setup

**Actor**: User setting up contact book for the first time

**Flow**:
1. Install tool: `pip install contact-book-cli`
2. Initialize database: `contact-cli init --db ./contacts.db`
3. Optionally import existing contacts from CSV

**Success**: Database created, ready to accept contacts

**Failure modes**:
- Database path not writable -> clear error message, exit 2
- Database already exists -> refuse without `--force`, exit 1

---

## UC2: Adding a New Contact

**Actor**: User met someone at a conference

**Flow**:
1. Run: `contact-cli add --name "Jane Smith" --email "jane@example.com" --phone "+1-555-123-4567" --company "Acme Corp" --notes "Met at TechConf 2026"`
2. System validates email format
3. System checks email uniqueness
4. System creates contact and returns ID

**Success**: Contact created with ID displayed

**Failure modes**:
- Invalid email format -> exit 1, clear message
- Duplicate email -> exit 4, show existing contact ID
- Name too long (>200 chars) -> exit 1, show limit

---

## UC3: Quick Lookup During Call

**Actor**: User needs phone number quickly while on another call

**Flow**:
1. Run: `contact-cli search --name "jane"`
2. System performs case-insensitive partial match
3. Matching contacts displayed in table format

**Success**: Matching contacts with phone/email displayed immediately

**Failure modes**:
- No search criteria provided -> exit 1, show usage
- No matches found -> empty table, exit 0 (not an error)

---

## UC4: Organizing Contacts into Groups

**Actor**: User wants to categorize contacts by relationship

**Flow**:
1. Create group: `contact-cli group create --name "Clients" --description "Business clients"`
2. Assign contact: `contact-cli assign 1 --group "Clients"`
3. View group members: `contact-cli list --group "Clients"`

**Success**: Group created, contact assigned, members listed

**Failure modes**:
- Group name already exists -> exit 4, show duplicate
- Contact ID not found -> exit 3
- Group not found when assigning -> exit 3

---

## UC5: Exporting for Mail Merge

**Actor**: User preparing client newsletter

**Flow**:
1. Run: `contact-cli export-csv --output clients.csv --group "Clients"`
2. System filters contacts by group
3. System writes CSV with standard columns

**Success**: CSV file with filtered contacts created

**Failure modes**:
- File already exists -> exit 1, require `--force`
- Path resolves outside allowed directory -> exit 1, "Path must be within {directory}"
- Group not found -> exit 3
- Path not writable -> exit 1

---

## UC6: Viewing Full Contact Details

**Actor**: User needs all information about a specific contact

**Flow**:
1. Run: `contact-cli show 42` or `contact-cli show --email "jane@example.com"`
2. System retrieves contact by ID or email
3. System displays full contact card with all fields and group memberships

**Success**: Full contact card displayed

**Output example**:
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

**Failure modes**:
- Contact ID not found -> exit 3
- Email not found -> exit 3
- Neither ID nor email provided -> exit 1

---

## UC7: Merging Duplicate Contacts

**Actor**: User has duplicate entries for same person

**Flow**:
1. Identify duplicates: `contact-cli search --email "jane"`
2. Review both: `contact-cli show 42` and `contact-cli show 43`
3. Merge: `contact-cli merge 42 43` (merge 43 into 42)
4. System fills empty fields in 42 from 43
5. System transfers group memberships from 43 to 42
6. System deletes contact 43

**Success**: Contacts merged, duplicate removed

**Output example** (matches interface.md format):
```
Merged contact 43 into 42:
- Kept: Jane Smith
- Added phone: +1-555-999-8888
- Added groups: Conference
Contact 43 deleted.
```

**Note:** See `interface.md` merge command section for the complete output format specification.

**Failure modes**:
- Contact not found -> exit 3
- Merging same contact (42 into 42) -> exit 1
- Without `--force`, prompts for confirmation
- Email conflict (source email matches another contact) -> exit 4
