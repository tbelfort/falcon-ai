# App4: Task Manager CLI - Quality Check Issues

**Review Date:** 2026-01-21
**Reviewer:** Deep Quality Check

---

## Critical Issues

### No Critical Issues Found

All critical functionality checks passed.

---

## Minor Issues

### Issue M1: Missing `delete` Command Query Patterns in schema.md [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/database/schema.md`
**Description:** While the vision.md correctly documents that delete commands are non-goals (archive-only lifecycle), the schema.md does not include a query pattern for deleting labels. Although labels cannot be deleted via CLI, the database layer may need internal delete operations for potential future features or cleanup operations. This is a minor completeness gap.
**Severity:** Low
**Recommendation:** Either add a DELETE query pattern for labels (for internal use) or add a note explaining that deletes are intentionally omitted due to archive-only design.
**Resolution:** Added a note after "List All Labels with Task Counts" explaining that DELETE operations are intentionally omitted due to archive-only design, with an example query for future internal use.

---

### Issue M2: Inconsistent `--status` Default Between `list` and `add` Commands [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 85 (add) vs 184 (list)
**Description:**
- The `add` command's `--status` option shows default as `pending` (line 85)
- The `list` command's `--status` option shows default as `pending` (line 184)

However, the description for `list --status` says "Filter by status (or 'all')" but doesn't explain that `pending` is the default and `all` shows everything. The behavior section (line 194) does clarify this, but the options table could be clearer.
**Severity:** Low
**Recommendation:** Add "(default)" annotation to clarify the status filtering behavior in the options table description.
**Resolution:** Updated the description to: `Filter by status; use "all" to show all statuses (default: pending)`

---

### Issue M3: Missing `--format` Option for `due` Command in Options Table [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 517-545
**Description:** The `due` command syntax shows `[--format FORMAT]` (line 523), but there's no Options table documenting the `--format` option values (table/json). The exit codes are also missing (should be 0 for success).
**Severity:** Low
**Recommendation:** Add an Options table for the `--format` option similar to other commands.
**Resolution:** Added Options table with `--format FORMAT` option (default: table, values: table/json).

---

### Issue M4: `archive` Command Exit Code Inconsistency [NO CHANGE NEEDED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 315-348 (archive command)
**Description:** The `archive` command exit codes include:
- Exit 1: Task not completed (cannot archive)
- Exit 3: Task not found

However, errors.md (line 97) shows the error message for "Task must be completed before archiving" with no explicit mapping to exit code 1 (it's in the Validation Errors section which is exit 1, so this is correct but could be more explicit).
**Severity:** Informational
**Impact:** None - the mapping is correct via section headers.
**Resolution:** Verified OK - no change needed, mapping is correct.

---

### Issue M5: Missing Exit Code 2 for `archive --all-completed` Database Error [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 345-348
**Description:** The `archive` command exit codes list only 0, 1, and 3, but database errors (exit 2) can occur during any database operation. This should be added for consistency with other commands like `list` and `export-csv`.
**Severity:** Low
**Recommendation:** Add exit code 2 for database errors.
**Resolution:** Added exit code 2 for database errors to the archive command.

---

### Issue M6: `label list` Command Missing Exit Code 2 [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 494-515
**Description:** The `label list` command only shows exit code 0 (success), but should also include exit code 2 for database errors for completeness.
**Severity:** Low
**Recommendation:** Add exit code 2 for database errors.
**Resolution:** Added exit code 2 for database errors to the label list command.

---

### Issue M7: `due` Command Missing Exit Code 2 [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 543-545
**Description:** The `due` command only shows exit code 0, but should include exit code 2 for database errors.
**Severity:** Low
**Recommendation:** Add exit code 2 for database errors.
**Resolution:** Added exit code 2 for database errors to the due command.

---

### Issue M8: `report` Command Missing Exit Code 2 [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 586-588
**Description:** The `report` command only shows exit code 0, but should include exit code 2 for database errors.
**Severity:** Low
**Recommendation:** Add exit code 2 for database errors.
**Resolution:** Added exit code 2 for database errors to the report command.

---

### Issue M9: `project list` Command Missing Exit Code 2 [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 414-416
**Description:** The `project list` command only shows exit code 0, but should include exit code 2 for database errors.
**Severity:** Low
**Recommendation:** Add exit code 2 for database errors.
**Resolution:** Added exit code 2 for database errors to the project list command.

---

### Issue M10: Timestamp Example Inconsistency [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/database/schema.md`
**Lines:** 115-122
**Description:** The timestamp format section says timestamps use `YYYY-MM-DDTHH:MM:SS.ffffffZ` with timezone, but the Python example shows:
```python
timestamp = datetime.now(timezone.utc).isoformat()  # 2026-01-21T15:30:45.123456+00:00
```
The comment shows `+00:00` format while the spec says `Z` suffix. Both are valid ISO 8601 but inconsistent. Also, the example data (lines 343-353) uses `Z` suffix consistently.
**Severity:** Low
**Impact:** Implementation might produce either format.
**Recommendation:** Clarify that both `Z` and `+00:00` are acceptable UTC representations, or standardize on one.
**Resolution:** Updated documentation to explicitly state that both `Z` suffix and `+00:00` suffix are acceptable UTC representations, with examples of both formats.

---

### Issue M11: Missing Database Error Exit Code in `init` Command (Path Permissions) [NO CHANGE NEEDED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 55-58
**Description:** The `init` command has exit code 2 for "Cannot create file (permissions, invalid path)" which is good, but use-cases.md (line 15-16) maps "Database path not writable" to exit 2 correctly. This is consistent, no action needed.
**Severity:** None - Verified OK
**Resolution:** Already correct, no change needed.

---

### Issue M12: components.md Missing `cmd_archive_all_completed` Function Signature [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/design/components.md`
**Lines:** 86-96
**Description:** The `cmd_archive` function signature shows `task_ids: list[int]` but interface.md shows the `--all-completed` flag as an option. The signature doesn't account for this flag. The implementation will need to handle both `task_ids` list and `all_completed: bool` parameter.
**Severity:** Low
**Recommendation:** Update the `cmd_archive` signature to include `all_completed: bool = False` parameter.
**Resolution:** Updated `cmd_archive` function signature to: `cmd_archive(db_path: str, task_ids: list[int], all_completed: bool = False) -> list[Task]`

---

### Issue M13: Missing Index on `projects.name` in Schema Definition [FIXED]

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/database/schema.md`
**Lines:** 57-61 (Index definitions)
**Description:** The technical.md (lines 165-166) mentions:
- `idx_projects_name` on `projects(name)` (unique)
- `idx_labels_name` on `labels(name)` (unique)

However, schema.md's index definitions (lines 57-61) only include:
```sql
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
```

The `projects.name` and `labels.name` indexes are missing from the schema definition. Note: SQLite automatically creates indexes for UNIQUE constraints, so this is technically handled, but for documentation completeness they should be mentioned or explained.
**Severity:** Low
**Recommendation:** Either add explicit index creation for `projects.name` and `labels.name`, or add a note explaining that UNIQUE constraints implicitly create indexes in SQLite.
**Resolution:** Added a comment in the schema definition explaining that `idx_projects_name` and `idx_labels_name` are implicitly created by SQLite due to the UNIQUE constraint on those columns.

---

## Verified OK

### Cross-Document Consistency

| Check | Status | Notes |
|-------|--------|-------|
| Table names in schema.md match query patterns | PASS | tasks, projects, labels, task_labels consistent |
| Column names in schema.md match query SELECT lists | PASS | All columns accounted for |
| Commands in interface.md have function signatures in components.md | PASS | All 16 `cmd_*` functions documented |
| ADx identifiers (AD1-AD7) exist in technical.md | PASS | All referenced in tasks |
| Sx identifiers (S1-S4) exist in ARCHITECTURE-simple.md | PASS | All referenced in tasks |
| Exit codes in errors.md match interface.md | PASS | 0-4 mapping consistent |
| Exception hierarchy exit_code values match errors.md | PASS | ValidationError=1, DatabaseError=2, NotFoundError=3, DuplicateError=4 |
| Priority values consistent | PASS | high, medium, low in schema, interface, validation |
| Status values consistent | PASS | pending, in_progress, completed, archived everywhere |
| Project status values consistent | PASS | active, archived in schema and interface |

### Technical Accuracy

| Check | Status | Notes |
|-------|--------|-------|
| SQL CREATE TABLE syntax correct | PASS | All 4 tables valid SQLite |
| CHECK constraints valid | PASS | Status and priority IN clauses correct |
| Foreign key constraints correct | PASS | ON DELETE SET NULL for project_id, CASCADE for task_labels |
| Parameterized queries use `?` placeholders | PASS | All 15+ query patterns use `?` |
| No string interpolation in SQL examples | PASS | Only negative example in AD4 (marked as WRONG) |
| Date format ISO 8601 | PASS | YYYY-MM-DD for dates, ISO timestamp with timezone for timestamps |
| JSON examples valid | PASS | Proper formatting with null handling |

### Completeness

| Check | Status | Notes |
|-------|--------|-------|
| init command: syntax, options, behavior, output, exit codes | PASS | All sections present |
| add command: syntax, options, behavior, output, exit codes | PASS | All sections present |
| edit command: syntax, options, behavior, output, exit codes | PASS | All sections present |
| list command: syntax, options, behavior, output, exit codes | PASS | All sections present |
| show command: syntax, options, behavior, output, exit codes | PASS | All sections present |
| done command: syntax, options, behavior, output, exit codes | PASS | All sections present |
| archive command: syntax, options, behavior, output, exit codes | PASS | All sections present |
| project add: syntax, options, behavior, output, exit codes | PASS | All sections present |
| project list: syntax, options, behavior, output, exit codes | PASS | All sections present (minor: missing exit 2) |
| project archive: syntax, options, behavior, output, exit codes | PASS | All sections present |
| label add: syntax, options, behavior, output, exit codes | PASS | All sections present |
| label remove: syntax, options, behavior, output, exit codes | PASS | All sections present |
| label list: syntax, options, behavior, output, exit codes | PASS | All sections present (minor: missing exit 2) |
| due command: syntax, options, behavior, output, exit codes | PASS | All sections present (minor: missing exit 2, options table) |
| report command: syntax, options, behavior, output, exit codes | PASS | All sections present (minor: missing exit 2) |
| export-csv: syntax, options, behavior, output, exit codes | PASS | All sections present |
| Task 1 has: Context, Scope, Constraints, Tests, Not In Scope, Acceptance | PASS | All sections present |
| Task 2 has: Context, Scope, Constraints, Tests, Not In Scope, Acceptance | PASS | All sections present |
| Task 3 has: Context, Scope, Constraints, Tests, Not In Scope, Acceptance | PASS | All sections present |
| Task 4 has: Context, Scope, Constraints, Tests, Not In Scope, Acceptance | PASS | All sections present |

### Formatting & Structure

| Check | Status | Notes |
|-------|--------|-------|
| Markdown tables properly formatted | PASS | All tables have aligned columns and separators |
| Code blocks use correct language tags | PASS | sql, python, bash used appropriately |
| Schema definition uses ```sql | PASS | Correct |
| Python examples use ```python | PASS | Correct |
| CLI examples use ``` (plain) or ```bash | PASS | Correct |
| No broken internal links | PASS | All doc references valid |

### Security Documentation

| Check | Status | Notes |
|-------|--------|-------|
| S1 (Parameterized Queries) documented with examples | PASS | ARCHITECTURE-simple.md lines 150-158, schema.md all patterns |
| S2 (Input Validation) documented | PASS | ARCHITECTURE-simple.md lines 162-177, interface.md validation rules |
| S3 (Path Validation) documented | PASS | ARCHITECTURE-simple.md lines 179-191, interface.md line 667-669 |
| S4 (Error Message Sanitization) documented | PASS | ARCHITECTURE-simple.md lines 193-216, errors.md Rule 2 |
| SQL injection attack scenario documented | PASS | ARCHITECTURE-simple.md "Search (with SQL injection attempt)" |

---

## Summary

**Total Issues Found:** 13 (0 Critical, 13 Minor/Informational)
**Issues Fixed:** 11
**No Change Needed:** 2 (M4, M11 - verified correct as-is)

The documentation is well-structured and substantially complete. The minor issues were primarily:
1. Missing exit code 2 (database error) on several commands (M5-M9) - **FIXED**
2. Minor inconsistencies in timestamp format documentation (M10) - **FIXED**
3. Missing function parameter in components.md (M12) - **FIXED**
4. Missing explicit index documentation (M13) - **FIXED**

**Status:** All issues have been addressed. Documentation is APPROVED for implementation.
