# Architecture Feasibility Scout Report

## Assessment: ISSUES_FOUND

The architecture is mostly sound but has several contradictions and ambiguities that need resolution before implementation. The core design is feasible, but specific technical details conflict across documents.

## Issues

### Issue 1: Path Validation Implementation Inconsistency

**Affected Files:** ["app5/docs/systems/architecture/ARCHITECTURE-simple.md", "app5/docs/design/technical.md", "app5/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From ARCHITECTURE-simple.md (lines 171-194):
```
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

From interface.md (lines 804-808):
```
1. **File Path Validation:** Import file paths MUST be validated to prevent path traversal attacks:
   - Resolve path to absolute path using `os.path.realpath()`
   - Verify the resolved path does not contain `..` after resolution
   - Verify the file stays within allowed directories (current working directory or explicitly configured import directory)
   - Exit 1 with "Error: Path must be within {directory}." if validation fails (using same message as general path validation)
```

**What's Missing/Wrong:**

The interface.md document contradicts the architecture specification. Interface.md says to "Verify the resolved path does not contain `..` after resolution", but ARCHITECTURE-simple.md explicitly states this check was removed as redundant because "realpath() resolves parent references, and the containment check catches any escape attempts."

This is a documentation conflict that will confuse implementers. The architecture document is correct - checking for ".." after realpath() is indeed redundant and buggy (as noted, it rejects legitimate filenames like "my..file.txt"). However, interface.md still references the old validation approach.

**Assessment:**

This is a documentation inconsistency rather than a fundamental flaw. The architecture is sound - the realpath() + containment check is the correct approach. Interface.md needs to be updated to remove the outdated ".." check requirement.

---

### Issue 2: Foreign Key Enforcement Warning vs Implementation Reality

**Affected Files:** ["app5/docs/systems/database/schema.md"]

**Relevant Text From Docs:**

From schema.md (lines 68-78):
```
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
```

From schema.md (lines 408-410):
```
conn.row_factory = sqlite3.Row  # Enable column access by name
conn.execute("PRAGMA foreign_keys = ON")  # Enable FK enforcement
conn.execute("PRAGMA busy_timeout = 5000")  # Wait up to 5s for locks
```

From components.md (lines 177-178):
```
- Execute `PRAGMA foreign_keys = ON` on every connection (SQLite has foreign keys OFF by default)
- Execute `PRAGMA busy_timeout = 5000` on every connection (prevents immediate SQLITE_BUSY errors when database is locked by another process)
```

**What's Missing/Wrong:**

The documentation correctly notes that foreign keys must be enabled per connection. However, there's a potential failure mode: if ANY code path opens a connection without executing `PRAGMA foreign_keys = ON`, the cascading deletes will fail silently.

While the get_connection() context manager enforces this, the architecture doesn't mandate that ALL database access must go through get_connection(). If someone opens a direct connection (e.g., `sqlite3.connect(db_path)` without the context manager), they'll bypass the PRAGMA setting.

**Assessment:**

This is a minor architectural weakness but not a blocking flaw. The documentation should add an explicit rule: "ALL database connections MUST use the get_connection() context manager. Direct use of sqlite3.connect() is forbidden." This turns a runtime risk into a code review checkpoint.

---

### Issue 3: Email Validation Regex Inconsistency

**Affected Files:** ["app5/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From interface.md (lines 978-1018):
```
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

...

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
```

**What's Missing/Wrong:**

The documentation presents TWO different regex patterns but doesn't specify which one to use:
1. `^[^\s@]+@[^\s@]+\.[^\s@]+$` - requires domain to have a dot (standard emails)
2. `^[^\s@]+@[^\s@]+$` - allows local-style emails like user@localhost

The implementation code uses pattern #1 (requires dot), but then the note says "If the application allows local-style emails, this MUST be explicitly documented as a configuration option." However, there's NO configuration system defined in the architecture - technical.md says "no global state" and there's no mention of config files or environment variables.

This creates ambiguity: should the implementation support local emails or not? The architecture doesn't provide a way to make it configurable, so it must be a hard-coded choice.

**Assessment:**

This is a specification ambiguity rather than a technical impossibility. The implementation can work either way, but the spec needs to pick one. Given the vision.md describes this as a "professional contact manager" for "boutique consulting firm" users, local-style emails are unlikely to be needed. The spec should commit to requiring dots in domain names (pattern #1) and remove the configuration option mention since there's no config system.

---

### Issue 4: CSV Import Conflict Resolution TOCTOU Race

**Affected Files:** ["app5/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From interface.md (lines 753-777):
```
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
```

**What's Missing/Wrong:**

The import process as described has a Time-of-Check-Time-of-Use (TOCTOU) vulnerability:

1. Check if email/phone exists in database
2. If no conflict, insert the contact

Between step 1 and step 2, another process could insert a contact with the same email, causing a UNIQUE constraint violation at insert time. The documentation doesn't address how to handle database-level duplicate errors that occur after the application-level check passes.

This is especially problematic for batch imports where the operation takes longer. The docs mention optimistic locking for edits (schema.md lines 435-498) but don't apply similar thinking to imports.

**Assessment:**

This is a real race condition but can be worked around. The implementation should:
1. Wrap each contact insert in a try/except
2. Catch sqlite3.IntegrityError for UNIQUE violations
3. Re-check the conflict and apply the appropriate strategy (skip/overwrite/merge)
4. Wrap the entire import in a transaction for atomicity

The documentation should add this to the import-csv behavior section: "UNIQUE constraint violations during insert are caught and treated as conflicts, applying the selected conflict resolution strategy."

---

### Issue 5: Merge Operation Email Conflict Undefined Timing

**Affected Files:** ["app5/docs/systems/cli/interface.md", "app5/docs/design/technical.md"]

**Relevant Text From Docs:**

From interface.md (lines 897-898):
```
**Email Uniqueness Conflict:**
If the source contact's email would cause a duplicate when merged into the target (because another contact already has that email), the merge fails with exit code 4 (DuplicateError). The user must resolve the email conflict before merging.
```

From technical.md (lines 148-166):
```
**Merge Command Transaction Scope:**
The merge command performs multiple database operations that MUST be atomic:
1. Update target contact fields
2. Transfer group memberships from source to target
3. Delete source contact

All three operations MUST execute within a single database transaction.
If any step fails, the entire merge MUST rollback.

Implementation pattern:
```python
with get_connection(db_path) as conn:
    try:
        # All merge operations here
        conn.commit()
    except Exception:
        conn.rollback()
        raise
```
```

**What's Missing/Wrong:**

The merge documentation doesn't specify WHEN to check for email conflicts. Consider this scenario:

- Target contact (ID 42): email = NULL
- Source contact (ID 43): email = "jane@example.com"
- Another contact (ID 44): email = "jane@example.com" (already exists)

When should the duplicate check happen?
1. Before starting the merge transaction (application-level check)?
2. During the transaction (catch UNIQUE constraint violation)?

If we check before the transaction, there's a TOCTOU race (another process could create the duplicate between check and merge). If we check during the transaction, we'll get a database error that needs to be caught and converted to exit code 4.

The documentation says the operation is atomic (single transaction) but doesn't specify how to handle the UNIQUE constraint violation within that transaction. The generic "If any step fails, the entire merge MUST rollback" covers this functionally, but doesn't specify the error handling flow.

**Assessment:**

This is a specification gap rather than a technical impossibility. The merge will work, but the error handling path is ambiguous. The spec should clarify: "Email uniqueness is enforced by the database UNIQUE constraint. If the merge UPDATE would violate the constraint, catch sqlite3.IntegrityError, identify it as an email duplicate, rollback the transaction, and exit with code 4."

---

### Issue 6: Concurrent Edit Protection Missing from Critical Operations

**Affected Files:** ["app5/docs/systems/database/schema.md", "app5/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From schema.md (lines 435-498):
```
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
    ...
```

From interface.md (lines 875-883):
```
**Behavior:**
1. Find both contacts
2. If no --force -> prompt for confirmation
3. Merge: fill empty fields in target from source
4. Transfer all group memberships from source to target
5. Delete source contact
6. Print summary
```

**What's Missing/Wrong:**

The documentation requires optimistic locking for the `edit` command but doesn't specify whether the `merge` command needs it. The merge operation modifies the target contact (step 3: "fill empty fields in target from source"), which is a contact modification that could suffer from the same lost update problem.

Consider this race:
1. Process A starts merge of contacts 43 → 42, reads contact 42 (updated_at = T1)
2. Process B edits contact 42, changes name, updates updated_at = T2
3. Process A completes merge, overwrites contact 42 with merged data (losing Process B's name change)

The merge operation should read updated_at when loading the target contact, then use optimistic locking when updating it. But the documentation doesn't mention this.

**Assessment:**

This is a consistency issue in the specification. If the system supports concurrent access (which the optimistic locking design implies), then ALL contact modifications need the same protection, including merge. The merge behavior section should add: "4a. When updating target contact, use optimistic locking with the updated_at value read in step 1."

---

### Issue 7: Import File Size Limit TOCTOU Mitigation Incomplete

**Affected Files:** ["app5/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From interface.md (lines 812-823):
```
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
```

**What's Missing/Wrong:**

The TOCTOU mitigation code has a performance issue: it encodes every line to UTF-8 bytes just to count the size. For a file approaching the 10MB limit, this means encoding potentially millions of characters.

But more critically, the code accumulates content in a list. If the file is 10MB, the `content` list will hold 10MB of strings in memory. This is inefficient - CSV parsing libraries (like csv.DictReader) work with file iterators, not lists of lines.

The correct approach is to use a wrapper iterator that counts bytes as they're consumed, without pre-loading everything into memory:

```python
class SizeLimitedReader:
    def __init__(self, file, max_size):
        self.file = file
        self.max_size = max_size
        self.total_size = 0

    def __iter__(self):
        return self

    def __next__(self):
        line = next(self.file)
        self.total_size += len(line.encode('utf-8'))
        if self.total_size > self.max_size:
            raise ValidationError("Import file exceeds 10MB limit")
        return line
```

**Assessment:**

This is a performance and memory efficiency issue, not a fundamental flaw. The import will work but will be slow and memory-hungry for large files. The spec should revise the implementation pattern to use an iterator wrapper instead of accumulating lines in a list.

---

### Issue 8: Phone Normalization Extension Handling Ambiguity

**Affected Files:** ["app5/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**

From interface.md (lines 1040-1045):
```
**Extension Handling:**
Phone extensions are handled as follows during normalization:
- Input: `555-123-4567 ext 123` -> Normalized: `5551234567` (extension stripped for matching)
- Input: `555-123-4567x123` -> Normalized: `5551234567123` (x is treated as separator, digits kept)

**Recommendation:** For contacts with extensions, store the extension in the notes field for clarity, since extension handling during normalization is simplified.
```

**What's Missing/Wrong:**

The two examples contradict each other. The normalization rule is stated as "Remove all non-digit characters EXCEPT leading `+`" (line 1027). Under this rule:

- `555-123-4567 ext 123` → All non-digits except + removed → `5551234567123`
- `555-123-4567x123` → All non-digits except + removed → `5551234567123`

Both should produce the same result, but the documentation claims the first one strips the extension digits ("5551234567") while the second keeps them ("5551234567123").

The only way the first example makes sense is if "ext" is treated as a special keyword that terminates parsing. But that's not stated in the normalization algorithm.

**Assessment:**

This is a specification error that will confuse implementers. The normalization algorithm needs to be clarified:

Option A: Simple rule - strip all non-digits except leading +. Extensions are included in normalized form (both examples produce `5551234567123`).

Option B: Complex rule - recognize extension keywords (ext, extension, x) and strip everything after them.

Option A is simpler and aligns with the stated rule. The documentation should commit to this and update the examples to match, or explicitly define extension keyword handling if that's desired.

---

## Summary

The architecture is fundamentally sound and technically feasible. The layered design, SQLite choice, and security measures are all appropriate for the use case. However, there are several specification inconsistencies and ambiguities that need resolution:

1. **Documentation conflicts** (path validation, email regex)
2. **Race condition handling** (import conflicts, merge operations)
3. **Incomplete specifications** (optimistic locking scope, phone normalization)

None of these are blocking flaws - the system will work if implemented. But they create ambiguity that will lead to inconsistent implementation decisions or bugs. These should be resolved during the spec phase before implementation begins.
