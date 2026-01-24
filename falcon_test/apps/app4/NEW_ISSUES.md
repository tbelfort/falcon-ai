# App4: Task Manager CLI - NEW Issues Found (Post-Fix Review)

**Review Date:** 2026-01-22
**Reviewer:** Deep Documentation Audit
**Scope:** Finding NEW issues beyond those already fixed in ISSUES.md and REVIEW.md

---

## CRITICAL Issues

### C1: Batch Error Handling Inconsistency - `done` Command Exit Codes INCOMPLETE

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 302-335
**Severity:** HIGH - Implementation blocker, ambiguous specification

**Description:**
The `done` command specifies batch operation error handling (lines 302-320) with detailed logic for handling validation errors, not-found errors, and database errors during batch processing. However, the Exit codes section (lines 332-334) is **INCOMPLETE**:

```
**Exit codes:**
- 0: At least one task completed
- 3: All specified tasks not found
```

**Missing exit codes:**
- Exit 1: Not specified, but batch error handling (line 311) explicitly documents "Exit 1: All IDs had validation errors (none were valid format)"
- Exit 2: Not specified, but batch error handling (line 313) explicitly documents "Exit 2: Database error during processing"

The Batch Operation Error Handling section clearly lists exit codes 0, 1, 2, and 3, but the Exit codes section only lists 0 and 3. This is a critical gap that will cause implementation confusion.

**Error Message Examples Provided:**
- `Error: Invalid task ID '{value}' - must be positive integer` (validation error)
- `Error: Task {id} not found` (not found error)
- Example scenario explicitly shows "Exit 0 (one success)" with validation and not-found errors

**Impact:**
- Implementer must reconcile conflicting specifications
- Exit codes 1 and 2 are documented in behavior but not in the official Exit codes table
- Tests cannot be written until this is clarified

**Recommendation:** Update the Exit codes section to include:
```
**Exit codes:**
- 0: At least one task completed
- 1: All IDs had validation errors (none were valid format)
- 2: Database error during processing
- 3: All specified tasks not found (none existed)
```

---

### C2: Archive Command Missing Batch Error Handling Specification

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 338-372
**Severity:** HIGH - Missing specification for batch scenarios

**Description:**
The `archive` command syntax shows it accepts multiple task IDs: `task-cli archive [TASK_ID ...] [--all-completed]`

However, the Behavior section (lines 353-356) does NOT specify how the command handles:
1. **Multiple task IDs with mixed error conditions** (similar to `done` command)
2. **Partial failures** (some tasks not found, some not completed, some succeed)
3. **Exit code logic** when multiple IDs are provided with errors

**Current specification (incomplete):**
```
**Behavior:**
1. If `--all-completed`: archive all tasks with status=completed
2. If TASK_IDs specified: archive those specific tasks
3. Task must be completed to be archived
```

**Missing:**
- What happens if user provides `archive 1 2 3` and task 2 is not completed?
- Should it archive 1 and 3, then report error for 2? (like `done` does)
- Or should it fail immediately? (current spec is ambiguous)
- What error messages are shown for partial failures?
- What's the exit code for "1 of 3 succeeded"?

**Exit codes section (lines 368-372) lists:**
- 0: Success
- 1: Task not completed (cannot archive)
- 2: Database error
- 3: Task not found

This suggests fail-fast behavior, but this contradicts the `done` command's batch handling philosophy of "continue on error, report all issues."

**Impact:**
- Implementation can't determine if archive should be batch or fail-fast
- No guidance on mixed-error scenarios
- Output format for partial archive unclear

**Recommendation:** Either:
A) Add explicit batch error handling section (like `done` command) with detailed behavior for multiple TASK_IDs
B) Or clarify that archive with multiple IDs should fail-fast on first error

---

### C3: Project Column in CSV Export - Project ID vs Project Name Mismatch

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 654 (CSV columns specification)
**Related:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/design/components.md` line 170, technical.md lines 209-210
**Severity:** HIGH - Data model/output specification conflict

**Description:**
The CSV export specification states:
```
**CSV columns:** `id,title,description,status,priority,due_date,project,labels,created_at,updated_at,completed_at`
```

The `project` column is specified as a STRING field in the CSV (line 654).

However:
1. The Task dataclass model (components.md line 170) stores: `project_id: int | None`
2. The database schema (schema.md line 37) stores: `project_id INTEGER REFERENCES projects(id)`
3. JSON output in both technical.md (line 209) and interface.md (line 222) shows: `"project": "backend"` (the project NAME, not ID)

**Current Contradiction:**
The interface specification requires the CSV "project" column to contain the PROJECT NAME (per technical design, JSON examples, and use-case expectations), but the Task model only contains `project_id`.

**Missing Requirement:**
The command layer or formatter layer must JOIN with the projects table to retrieve project names for output, but this is NOT documented:
- Not in commands.py interface (components.md)
- Not in formatters.py interface (components.md line 242)
- Not in database.py interface (no "get_project_name()" function specified, only "find_project_by_id")
- Not mentioned in task4.md constraints

**Implementation Impact:**
The formatter layer `write_csv()` receives a `list[Task]` with only `project_id`, but needs to output the project NAME. The mechanism to join project names is unspecified.

**Recommendation:**
Either:
A) Add a `project_name: str | None` field to the Task dataclass
B) Or document that the formatter layer must perform the project name lookup separately
C) Or change CSV format to use project_id instead of project name (but this breaks scripting usability)

---

## MAJOR Issues

### M1: Show Command Missing JSON Output Specification

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 234-275 (`show` command documentation)
**Severity:** MEDIUM - Incomplete specification, asymmetric with other commands

**Description:**
The `show` command supports `--format FORMAT` with values `(detail/json)` (line 253), but only provides an example for the detail format (lines 255-270). There is NO example JSON output for `show --format json`.

**Comparison with other commands:**
- `list` command: has BOTH table and JSON output examples (lines 201-225)
- `due` command: can use `--format FORMAT` (both table and json implied)
- `show` command: specifies JSON format support but NO example shown

**Missing specification:**
What does `task-cli show 1 --format json` output?
- Is it a single object or array with one object?
- Does it include all fields like status, description, created_at, updated_at?
- Does it include labels array like JSON list output does?

**Impact:**
- Implementer must guess JSON schema for show output
- Tests cannot be written without this specification
- API consistency unknown

**Recommendation:** Add JSON output example for `show` command, e.g.:
```json
{
  "id": 1,
  "title": "Fix login bug",
  "description": "Users report intermittent login failures...",
  "status": "pending",
  "priority": "high",
  "due_date": "2026-01-25",
  "project": "backend",
  "labels": ["urgent", "bug"],
  "created_at": "2026-01-20T10:30:00Z",
  "updated_at": "2026-01-21T14:15:00Z",
  "completed_at": null
}
```

---

### M2: Label Column Format in CSV - Semicolon Escaping Unspecified

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 656-660
**Severity:** MEDIUM - Incomplete CSV specification

**Description:**
The Labels column format documentation states:
```
- Labels containing semicolons: not supported (semicolon is reserved separator)
```

However, this creates a limitation without a specification for handling it:
1. **What happens if a label contains a semicolon?**
   - Is the label rejected during creation?
   - Is it silently stripped?
   - Is it stored but exported as corrupted?

2. **No validation rule documented** in interface.md Input Validation Rules (starts line 684) for label names that might contain semicolons

3. **Conflict with label creation:**
   - `label add` command (line 469) says "Create label if doesn't exist"
   - No validation rule prevents creating a label named "urgent;critical"
   - Exporting that task later would produce invalid CSV

**Current specification:**
- Line 659: "Labels containing semicolons: not supported (semicolon is reserved separator)"
- But no corresponding validation rule in interface.md or errors.md

**Impact:**
- Label names can be created that break CSV export
- No clear error handling path
- CSV consistency not guaranteed

**Recommendation:** Either:
A) Add validation rule: "Label names cannot contain semicolons" with exit code 1
B) Or specify escape mechanism (e.g., backslash escaping)
C) Or use a different separator that's less likely in label names

---

### M3: Archive Command Partial Failure Behavior Ambiguous

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 353-372
**Severity:** MEDIUM - Ambiguous behavioral specification

**Description:**
When `archive` is called with multiple task IDs like `archive 1 2 3 4`, the specification doesn't clarify:

1. **Behavior on first error:**
   - Does it stop processing (fail-fast)?
   - Or does it continue processing all IDs and report all errors (like `done` command)?

2. **Output format for partial success:**
   - The Output section (lines 358-360) only shows: `Archived 5 tasks.`
   - What if only 3 of 5 succeeded? Format unknown.
   - Compare with `done` command output (line 329): `Completed: 1, 3. Not found: 99. Already completed: 5.`

3. **Exit code when some succeed and some fail:**
   - Exit code 0 is listed for "Success"
   - But what if user runs `archive 1 2 3` and task 2 isn't completed?
   - Is that exit 0 (some succeeded) or exit 1 (some failed)?

**Inconsistency with `done` command:**
- `done` explicitly handles batch with error messages for each failure
- `archive` specification is silent on this

**Impact:**
- Implementer must decide fail-fast vs batch behavior
- Users may get unexpected behavior
- Scripts can't reliably parse partial results

**Recommendation:** Clarify archive batch behavior explicitly:
```
**Batch Operation Error Handling**
When multiple TASK_IDs are provided:
1. Invalid ID format: Report error, continue
2. Task not found: Report error, continue
3. Task not completed: Report error, continue
4. Successfully archived: Record success
5. Print summary of all results
```

---

## MODERATE Issues

### Mo1: Archive Command - What Does "Success" Mean?

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 368-372 (Exit codes)
**Severity:** MODERATE - Behavioral ambiguity

**Description:**
Exit code 0 is documented as "Success" but this is vague for batch operations:
- If user runs `archive 1 2 3` and all succeed: exit 0 ✓
- If user runs `archive 1 2 3` and 1 succeeds, 2 fails: what exit code?

The `done` command clarifies: "Exit 0: At least one task completed" (line 333)

The `archive` command doesn't clarify whether exit 0 requires ALL success or ANY success.

**Recommendation:** Clarify the exit code 0 definition:
```
- 0: At least one task successfully archived
```

---

### Mo2: Project Archive Missing Database Error Exit Code

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 463-465
**Severity:** MODERATE - Incomplete error handling

**Description:**
The `project archive` command (line 444) can perform a database UPDATE operation but only lists two exit codes:
```
**Exit codes:**
- 0: Success
- 3: Project not found
```

Missing: Exit code 2 for database errors. This is inconsistent with:
- `project add` command: has exit 2 (not shown but implied by constraint violation)
- Other commands: consistently include exit 2 for database operations

**Impact:**
- Implementer might not handle database errors explicitly
- Users won't know if database operation failed vs project not found

**Recommendation:** Add:
```
- 2: Database error
```

---

### Mo3: Project Name and Description Constraints Asymmetric

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md` and errors.md
**Lines:** 389, 714-716
**Severity:** MODERATE - Asymmetric validation rules

**Description:**
Validation rules for project names/descriptions are asymmetric:

**For `project add` command:**
- Name: "1-100 chars, unique" (line 389) ✓
- Description: "max 500 chars" (line 395) ✓

**In Input Validation Rules section (lines 714-716):**
- Project/Label Name: "Non-empty, Maximum 100/50 characters respectively" (line 716)
- BUT no description length limit is mentioned in the validation rules section

**Inconsistency:**
- Interface.md specifies description constraints per command
- Validation Rules section doesn't consolidate these
- Missing: description validation rule in the general section

**Impact:**
- Minor: implementation completeness

**Recommendation:** Add to validation rules section (after line 716):
```
### Project Description
- Maximum 500 characters
- Can be empty/null
```

---

### Mo4: Already Completed Task in `done` Command - Output Message Missing

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 295-330
**Severity:** MODERATE - Incomplete output specification

**Description:**
The `done` command behavior (line 298) states:
```
- If already completed -> warn, continue
```

And the partial output example (line 329) shows:
```
Completed: 1, 3. Not found: 99. Already completed: 5.
```

However, the Batch Operation Error Handling section (lines 302-320) does NOT include "already completed" as an error type:
1. Invalid ID format
2. Task not found
3. (Missing: already completed status)

**Question:**
- Is "already completed" treated as an error that stops processing?
- Or is it a warning that continues processing?
- The behavior section (line 298) says "warn, continue" suggesting it's not an error

**Missing specification:**
- Should there be an error message printed for already-completed tasks?
- What's the format of that error message?

**Inconsistency:**
- Output example includes "Already completed: 5"
- But this status isn't documented in the Batch Operation Error Handling section

**Impact:**
- Minor: output format might differ from expectation

**Recommendation:** Add to Batch Operation Error Handling (after line 308):
```
3. **Task already completed**: Report warning, continue to next ID
   - Message: `Warning: Task {id} already completed`
```

---

### Mo5: Done Command - Single ID vs Multiple ID Behavior Not Clearly Separated

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 279-335
**Severity:** MODERATE - Specification organization

**Description:**
The `done` command documentation mixes:
- Single ID behavior (lines 294-300)
- Batch operation details (lines 302-320)
- Output examples (lines 322-330)
- Exit codes (lines 332-334)

It's unclear whether the batch behavior applies ONLY when multiple IDs are given, or ALSO when a single ID is given.

**Example scenarios:**
- `done 1` where task 1 is not found: exit 3 or exit 0?
- `done abc` where "abc" is invalid: exit 1 or exit 0?

The Batch Operation Error Handling section says "When multiple task IDs are provided:" (line 304) but it's not explicitly stated that single-ID behavior differs.

**Recommendation:** Clarify with explicit note:
```
**Note:** The Batch Operation Error Handling rules (below) apply to both single and multiple task IDs.
For a single task ID, these rules still apply (e.g., invalid format exits 1, not found exits 3).
```

---

## MINOR Issues

### Mo6: Report Command Statistics Calculation Rules Undefined

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 586-627
**Severity:** MINOR - Incomplete specification

**Description:**
The `report` command shows example output (lines 602-622) but doesn't specify:

1. **How is "Overdue" calculated?**
   - Is it: `due_date < today AND status NOT IN ('completed', 'archived')`?
   - Or just: `due_date < today`?
   - The `due` command (line 565) clarifies overdue as "Past due date, not completed"

2. **What statuses are included in each count?**
   - "Completed": only status='completed'?
   - "Created": all created in period regardless of status?
   - "Pending": status='pending' regardless of due date?

3. **What about archived tasks?**
   - Are they included or excluded from counts?
   - For "Completed" count, are completed-then-archived tasks included?

**Related:** database.md (lines 330-348) has statistics queries but report command doesn't reference them

**Impact:**
- Minor: implementer must infer calculation rules from example data

---

### Mo7: Label Add - Duplicate Label Behavior Not Documented

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 469-501
**Severity:** MINOR - Missing error case documentation

**Description:**
The `label add` command output section (lines 483-491) shows:
```
**Output (already has):**
```
Task 1 already has label 'urgent'.
```
```

But this output isn't mentioned in the Exit codes section (lines 493-495):
```
**Exit codes:**
- 0: Success
- 3: Task not found
```

Where's the exit code for "task already has this label"? Should it be:
- Exit 0 (idempotent, no error)?
- Exit 1 (validation error)?

**Inconsistency:**
The output example suggests this is a normal case (user-visible message), but no corresponding exit code.

**Impact:**
- Minor: implementation detail, but affects scripting

---

### Mo8: Edit Command - Clear vs Unset Semantics Unclear

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 140-146
**Severity:** MINOR - Ambiguous special syntax

**Description:**
The edit command options show:
```
| `--due DATE` | string | New due date (use "" to clear) |
| `--project NAME` | string | New project (use "" to unassign) |
```

But these are different terms:
- "clear" for `--due`
- "unassign" for `--project`

Also, using "" (empty string) as a special value is unusual for CLI tools. This should be clarified:
- How is the empty string passed on command line? `--due ""`?
- Or `--due` with no value?
- Is this documented anywhere in the specification?

**Impact:**
- Minor: UX clarity

---

### Mo9: Export CSV - File Overwrite Behavior with --force

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 630-681
**Severity:** MINOR - Incomplete specification

**Description:**
The export-csv command shows:
- Without force: `Error: File 'tasks.csv' already exists. Use --force to overwrite.` (line 669)
- With force: overwrites (implied, but not shown in example)

The exit code 1 includes "File exists (without --force)" but what about when force is used and the file write fails (e.g., permission denied)?

**Current spec:**
```
**Exit codes:**
- 0: Success
- 1: File exists (without --force), path validation error
- 2: Database error
```

But what if `--force` is used but file write fails due to permissions? Should that be exit 2? Or exit 1?

**Impact:**
- Minor: error handling completeness

---

### Mo10: Project List - Task Count Definition Unclear

**File:** `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md`
**Lines:** 414-441
**Severity:** MINOR - Incomplete specification

**Description:**
The `project list` command output (line 432-435) shows a "Tasks" column:
```
ID | Name     | Status | Tasks
---|----------|--------|-------
1  | backend  | active | 5
```

But it doesn't specify: **Does "Tasks" count:**
- All tasks in project (any status)?
- Only pending/active tasks?
- Exclude archived tasks?

**Related:** The database query (schema.md lines 344-348) shows:
```sql
SELECT p.name, COUNT(*) FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
WHERE t.status = 'pending'
GROUP BY t.project_id;
```

This suggests only pending tasks are counted. But the interface.md doesn't clarify this.

**Impact:**
- Minor: output interpretation clarity

---

## Summary Table

| ID | Issue | Severity | Category |
|-----|--------|----------|----------|
| C1 | `done` exit codes incomplete in table | CRITICAL | Specification |
| C2 | `archive` batch error handling missing | CRITICAL | Specification |
| C3 | Project column CSV/database mismatch | CRITICAL | Data model |
| M1 | `show` JSON output not specified | MAJOR | Specification |
| M2 | CSV label semicolon escaping undefined | MAJOR | Specification |
| M3 | `archive` partial failure behavior ambiguous | MAJOR | Specification |
| Mo1 | `archive` "success" definition unclear | MODERATE | Specification |
| Mo2 | `project archive` missing exit code 2 | MODERATE | Specification |
| Mo3 | Project description validation asymmetric | MODERATE | Specification |
| Mo4 | Already completed output not specified | MODERATE | Specification |
| Mo5 | `done` single vs batch behavior separation | MODERATE | Specification |
| Mo6 | `report` statistics calculation undefined | MINOR | Specification |
| Mo7 | `label add` duplicate behavior exit code | MINOR | Specification |
| Mo8 | Edit command clear/unset semantics | MINOR | Specification |
| Mo9 | CSV force overwrite permission error | MINOR | Specification |
| Mo10 | Project list task count definition | MINOR | Specification |

---

## Files Affected

- `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/systems/cli/interface.md` (10 issues)
- `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/design/components.md` (1 issue - C3 related)
- `/Users/tbelfort/Projects/falcon-ai/falcon_test/apps/app4/docs/design/technical.md` (1 issue - C3 related)

---

## Status

**All issues are NEW** - none were found in previous REVIEW.md or ISSUES.md

Total New Issues: 16 (3 CRITICAL, 3 MAJOR, 5 MODERATE, 5 MINOR)
