# Database Schema: Contact Book CLI

**Status:** Final

---

## Database File

- **Engine:** SQLite 3
- **File:** User-specified via `--db` (default: `./contacts.db`)
- **Encoding:** UTF-8
- **Permissions:** MUST be 0600 (owner read/write only)

**Database Permissions (Unix/macOS):**
Database file MUST have 0600 permissions (owner read/write only).

Implementation:
```python
import os

def create_database_with_permissions(db_path: str) -> None:
    """Create database file with secure permissions from the start.

    Uses os.open() with O_CREAT to set permissions atomically,
    avoiding a TOCTOU race where the file briefly has insecure permissions.
    """
    # Create file with restrictive permissions atomically
    fd = os.open(db_path, os.O_CREAT | os.O_WRONLY, 0o600)
    os.close(fd)
    # Now connect to the database file (SQLite will use it)
```

If file creation fails due to permissions, raise DatabaseError.

**Windows Note:** Unix permissions (0o600) don't apply on Windows. The `os.open()` call with mode parameter still works but the mode is ignored. On Windows, the database file inherits ACLs from the parent directory. For secure deployments on Windows, users should ensure the parent directory has appropriate ACL restrictions (owner-only access). See `technical.md` for full details.

---

## Schema Definition

```sql
-- Contacts table: core contact data
CREATE TABLE IF NOT EXISTS contacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    UNIQUE,  -- See Email Uniqueness note below
    phone       TEXT,
    company     TEXT,
    notes       TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

-- **Email Uniqueness:**
-- The email column has UNIQUE constraint but allows NULL values.
-- SQLite permits multiple NULL values in UNIQUE columns (NULL != NULL).
-- This means multiple contacts may have no email address - this is intentional
-- for contacts where only phone/name is known.

-- Groups table: contact groupings
CREATE TABLE IF NOT EXISTS groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    description TEXT,
    created_at  TEXT    NOT NULL
);

-- Junction table: many-to-many contact-group relationship
-- WARNING: Foreign key constraints are OFF by default in SQLite!
-- You MUST execute "PRAGMA foreign_keys = ON" on each connection for
-- ON DELETE CASCADE and other FK constraints to be enforced.
CREATE TABLE IF NOT EXISTS contact_groups (
    contact_id  INTEGER NOT NULL,
    group_id    INTEGER NOT NULL,
    PRIMARY KEY (contact_id, group_id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
```

---

## Column Specifications

### Contacts

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `name` | TEXT | No | - | - | Max 200 chars (app-enforced) |
| `email` | TEXT | Yes | NULL | UNIQUE | Max 254 chars (app-enforced) |
| `phone` | TEXT | Yes | NULL | - | Max 50 chars (app-enforced) |
| `company` | TEXT | Yes | NULL | - | Max 200 chars (app-enforced) |
| `notes` | TEXT | Yes | NULL | - | Max 5000 chars (app-enforced) |
| `created_at` | TEXT | No | - | - | ISO 8601 format |
| `updated_at` | TEXT | No | - | - | ISO 8601 format |

### Groups

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| `id` | INTEGER | No | AUTO | PRIMARY KEY | Auto-increment |
| `name` | TEXT | No | - | UNIQUE | Max 100 chars (app-enforced) |
| `description` | TEXT | Yes | NULL | - | Max 500 chars (app-enforced) |
| `created_at` | TEXT | No | - | - | ISO 8601 format |

### Contact_Groups

| Column | Type | Nullable | Constraints |
|--------|------|----------|-------------|
| `contact_id` | INTEGER | No | FK -> contacts.id, ON DELETE CASCADE |
| `group_id` | INTEGER | No | FK -> groups.id, ON DELETE CASCADE |

**Composite Primary Key:** `(contact_id, group_id)`

---

## Timestamp Format

All timestamps use ISO 8601 format with UTC timezone:

```
YYYY-MM-DDTHH:MM:SS.ffffff+00:00
```

Example: `2026-01-21T15:30:45.123456+00:00`

**Note:** Both `+00:00` and `Z` suffix are valid ISO 8601 UTC representations. Python's `isoformat()` produces `+00:00`.

**Python generation:**
```python
from datetime import datetime, timezone
timestamp = datetime.now(timezone.utc).isoformat()
# Produces: 2026-01-21T15:30:45.123456+00:00
```

---

## Query Patterns

### Insert Contact

```sql
INSERT INTO contacts (name, email, phone, company, notes, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?);
```

Parameters: `(name, email, phone, company, notes, created_at, updated_at)`

Returns: `cursor.lastrowid` for the new contact ID

### Update Contact

```sql
UPDATE contacts
SET name = ?, email = ?, phone = ?, company = ?, notes = ?, updated_at = ?
WHERE id = ?;
```

Parameters: `(name, email, phone, company, notes, updated_at, id)`

### Delete Contact

```sql
DELETE FROM contacts WHERE id = ?;
```

Parameters: `(id,)`

### Find Contact by ID

```sql
SELECT id, name, email, phone, company, notes, created_at, updated_at
FROM contacts
WHERE id = ?;
```

Parameters: `(id,)`

### Find Contact by Email

```sql
SELECT id, name, email, phone, company, notes, created_at, updated_at
FROM contacts
WHERE email = ?;
```

Parameters: `(email,)`

### Search Contacts (dynamic query building)

```sql
SELECT id, name, email, phone, company, notes, created_at, updated_at
FROM contacts
WHERE 1=1
  AND LOWER(name) LIKE LOWER(?)      -- if name provided
  AND LOWER(email) LIKE LOWER(?)     -- if email provided
  AND LOWER(company) LIKE LOWER(?);  -- if company provided
```

Build dynamically:
```python
def escape_like_pattern(s: str) -> str:
    """Escape special LIKE characters to search for literal strings.

    SQLite LIKE special characters:
    - % matches any sequence of characters
    - _ matches any single character

    We escape them with backslash and use ESCAPE '\' clause.
    """
    return s.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')

query = "SELECT ... FROM contacts WHERE 1=1"
params = []
if name:
    query += " AND LOWER(name) LIKE LOWER(?) ESCAPE '\\'"
    params.append(f"%{escape_like_pattern(name)}%")
if email:
    query += " AND LOWER(email) LIKE LOWER(?) ESCAPE '\\'"
    params.append(f"%{escape_like_pattern(email)}%")
if company:
    query += " AND LOWER(company) LIKE LOWER(?) ESCAPE '\\'"
    params.append(f"%{escape_like_pattern(company)}%")
query += " ORDER BY name"
```

**Note:** This query pattern is for search WITHOUT group filter. When `--group` is specified, use the "Search Contacts with Group Filter" pattern below which JOINs with groups table.

### Get All Contacts

```sql
SELECT id, name, email, phone, company, notes, created_at, updated_at
FROM contacts
ORDER BY name;
```

### Get Contacts in Group

```sql
SELECT c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at, c.updated_at
FROM contacts c
JOIN contact_groups cg ON c.id = cg.contact_id
WHERE cg.group_id = ?
ORDER BY c.name;
```

Parameters: `(group_id,)`

### Insert Group

```sql
INSERT INTO groups (name, description, created_at)
VALUES (?, ?, ?);
```

Parameters: `(name, description, created_at)`

Returns: `cursor.lastrowid` for the new group ID

### Delete Group

```sql
DELETE FROM groups WHERE id = ?;
```

Parameters: `(id,)`

### Find Group by Name

```sql
SELECT id, name, description, created_at
FROM groups
WHERE name = ?;
```

Parameters: `(name,)`

### Find Group by ID

```sql
SELECT id, name, description, created_at
FROM groups
WHERE id = ?;
```

Parameters: `(id,)`

### Get All Groups

```sql
SELECT id, name, description, created_at
FROM groups
ORDER BY name;
```

### Add Contact to Group

```sql
INSERT OR IGNORE INTO contact_groups (contact_id, group_id)
VALUES (?, ?);
```

Parameters: `(contact_id, group_id)`

### Remove Contact from Group

```sql
DELETE FROM contact_groups
WHERE contact_id = ? AND group_id = ?;
```

Parameters: `(contact_id, group_id)`

### Get Groups for Contact

```sql
SELECT g.id, g.name, g.description, g.created_at
FROM groups g
JOIN contact_groups cg ON g.id = cg.group_id
WHERE cg.contact_id = ?
ORDER BY g.name;
```

Parameters: `(contact_id,)`

### Count Contacts in Group

```sql
SELECT COUNT(*) as count
FROM contact_groups
WHERE group_id = ?;
```

Parameters: `(group_id,)`

### Count Total Contacts

```sql
SELECT COUNT(*) as count FROM contacts;
```

**Note:** Used for summary statistics. No parameters needed.

### Count Total Groups

```sql
SELECT COUNT(*) as count FROM groups;
```

**Note:** Used for summary statistics. No parameters needed.

### Search Contacts with Group Filter

Use when `--group` is provided with search command (joins contacts with groups):

```sql
SELECT DISTINCT c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at, c.updated_at
FROM contacts c
JOIN contact_groups cg ON c.id = cg.contact_id
JOIN groups g ON cg.group_id = g.id
WHERE g.name = ?
  AND LOWER(c.name) LIKE LOWER(?)      -- if name provided
  AND LOWER(c.email) LIKE LOWER(?)     -- if email provided
  AND LOWER(c.company) LIKE LOWER(?);  -- if company provided
```

Build dynamically:
```python
# Note: escape_like_pattern() defined in previous query pattern section

query = """SELECT DISTINCT c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at, c.updated_at
FROM contacts c
JOIN contact_groups cg ON c.id = cg.contact_id
JOIN groups g ON cg.group_id = g.id
WHERE g.name = ?"""
params = [group_name]
if name:
    query += " AND LOWER(c.name) LIKE LOWER(?) ESCAPE '\\'"
    params.append(f"%{escape_like_pattern(name)}%")
if email:
    query += " AND LOWER(c.email) LIKE LOWER(?) ESCAPE '\\'"
    params.append(f"%{escape_like_pattern(email)}%")
if company:
    query += " AND LOWER(c.company) LIKE LOWER(?) ESCAPE '\\'"
    params.append(f"%{escape_like_pattern(company)}%")
query += " ORDER BY c.name"
```

Parameters: `(group_name, [name], [email], [company])` - brackets indicate optional

---

## Connection Management

```python
import sqlite3
from contextlib import contextmanager

@contextmanager
def get_connection(db_path: str):
    """Context manager for database connections."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # Enable column access by name
    conn.execute("PRAGMA foreign_keys = ON")  # Enable FK enforcement
    conn.execute("PRAGMA busy_timeout = 5000")  # Wait up to 5s for locks
    try:
        yield conn
        conn.commit()
    except Exception:
        # Protect rollback to avoid masking original exception
        try:
            conn.rollback()
        except Exception:
            pass  # Ignore rollback errors, preserve original exception
        raise
    finally:
        conn.close()
```

**Rules:**
- Always use context manager (ensures close)
- Always commit or rollback (no implicit transactions)
- Set `row_factory = sqlite3.Row` for named column access
- Enable foreign keys with `PRAGMA foreign_keys = ON`
- Set busy timeout with `PRAGMA busy_timeout = 5000` to wait for locks instead of failing immediately

---

## Concurrent Edit Protection (Optimistic Locking)

Contact modifications MUST use optimistic locking to prevent lost updates when multiple CLI instances access the same database.

**Strategy:**
1. Store `updated_at` timestamp (already in schema)
2. When editing a contact, read current `updated_at` value
3. Before saving, verify `updated_at` is unchanged
4. If changed, fail with conflict error

**Implementation Pattern:**
```python
def update_contact_safe(conn, contact_id: int, updates: dict, expected_updated_at: str) -> None:
    """Update contact with optimistic locking.

    Args:
        conn: Database connection
        contact_id: Contact to update
        updates: Dictionary of field -> new_value (allowed fields: name, email, phone, company, notes)
        expected_updated_at: The updated_at value when contact was read

    Raises:
        ConflictError: If contact was modified since it was read
        ContactNotFoundError: If contact does not exist
    """
    from datetime import datetime, timezone

    # Validate allowed fields to prevent SQL injection via field names
    allowed_fields = {'name', 'email', 'phone', 'company', 'notes'}
    if not updates:
        raise ValidationError("No fields to update")
    if not all(field in allowed_fields for field in updates):
        raise ValidationError(f"Invalid field names. Allowed: {allowed_fields}")

    # Build parameterized UPDATE query safely
    new_updated_at = datetime.now(timezone.utc).isoformat()
    set_clauses = [f"{field} = ?" for field in updates.keys()]
    set_clauses.append("updated_at = ?")
    set_clause = ", ".join(set_clauses)

    query = f"UPDATE contacts SET {set_clause} WHERE id = ? AND updated_at = ?"
    params = list(updates.values()) + [new_updated_at, contact_id, expected_updated_at]

    cursor = conn.execute(query, params)
    if cursor.rowcount == 0:
        # Either contact doesn't exist or was modified
        existing = find_contact_by_id(conn, contact_id)
        if existing is None:
            raise ContactNotFoundError(f"Contact ID {contact_id} not found.")
        else:
            raise ConflictError(
                f"Contact ID {contact_id} was modified by another process. "
                f"Expected version: {expected_updated_at}, Current: {existing.updated_at}"
            )
```

**Error Output:**
```
Error: Contact ID 42 was modified by another process. Please re-read and try again.
```

**Exit Code:** 5 (new code for conflict errors)

**Note:** This protects against concurrent CLI usage but not against external database modifications.

**Atomic Operations (Merge Command):**
The merge command performs multiple database operations that MUST be atomic:
1. Update target contact fields
2. Transfer group memberships from source to target
3. Delete source contact

All three operations MUST execute within a single database transaction.
If any step fails, the entire merge MUST rollback.

**Concurrent Safety:** The merge command MUST use optimistic locking when updating the target contact (step 1). Before updating, verify the target contact's `updated_at` value has not changed since it was read. If changed, fail with conflict error (exit code 5) to prevent silent data loss in concurrent scenarios.

Implementation pattern:
```python
with get_connection(db_path) as conn:
    try:
        # Step 1: Update target contact with optimistic locking
        update_contact_safe(conn, target_id, updates, expected_updated_at)
        # Step 2: Transfer group memberships
        # Step 3: Delete source contact
        conn.commit()
    except Exception:
        conn.rollback()
        raise
```

---

## Example Data

```sql
-- Note: Using +00:00 suffix to match Python's datetime.isoformat() output
-- Both Z and +00:00 are valid ISO 8601 UTC representations
INSERT INTO contacts (name, email, phone, company, notes, created_at, updated_at)
VALUES
    ('Jane Smith', 'jane@example.com', '+1-555-123-4567', 'Acme Corp', 'Met at TechConf', '2026-01-15T10:00:00.000000+00:00', '2026-01-15T10:00:00.000000+00:00'),
    ('John Doe', 'john.doe@bigco.com', '+1-555-987-6543', 'BigCo Inc', NULL, '2026-01-16T11:00:00.000000+00:00', '2026-01-16T11:00:00.000000+00:00');

INSERT INTO groups (name, description, created_at)
VALUES
    ('Clients', 'Business clients', '2026-01-14T09:00:00.000000+00:00'),
    ('Conference', 'People met at conferences', '2026-01-14T09:00:00.000000+00:00');

INSERT INTO contact_groups (contact_id, group_id) VALUES (1, 1), (1, 2), (2, 1);
```

---

## Migration Strategy

This is version 1 with three tables. Future versions may add:
- Tags table (many-to-many with contacts)
- Interaction log table
- Custom fields table

**Migration approach:**
1. Check for table existence before CREATE
2. Use `IF NOT EXISTS` on all CREATE statements
3. No ALTER TABLE in v1 (schema is fixed)
