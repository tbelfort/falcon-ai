# CLI Interface: Task Manager CLI

**Status:** [DRAFT]

---

## CLI Argument Parser Structure

The CLI uses argparse with the following structure:

**Global Options (apply to all commands):**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--db PATH` | string | `./tasks.db` | Path to SQLite database file |
| `--verbose` | flag | false | Enable debug output |
| `--help` | flag | - | Show help for command |
| `--version` | flag | - | Show version number |

**Parser Configuration:**
```python
import argparse

def create_parser() -> argparse.ArgumentParser:
    """Create the main CLI argument parser.

    Structure:
    - Main parser: handles global options (--db, --verbose, --version)
    - Subparsers: one per command (init, add, edit, list, etc.)
    - Nested subparsers: for command groups (project, label)

    Returns:
        Configured ArgumentParser instance
    """
    parser = argparse.ArgumentParser(
        prog='task-cli',
        description='Simple task manager CLI',
        epilog='Use <command> --help for command-specific options'
    )

    # Global options (available to all commands)
    parser.add_argument('--db', type=str, default='./tasks.db',
                        help='Path to SQLite database file')
    parser.add_argument('--verbose', action='store_true',
                        help='Enable debug output')
    parser.add_argument('--version', action='version',
                        version='%(prog)s 1.0.0')

    # Subcommands
    subparsers = parser.add_subparsers(dest='command', required=True,
                                       help='Command to execute')

    # Top-level commands: init, add, edit, list, show, done, archive, due, report, export-csv
    _add_init_parser(subparsers)
    _add_add_parser(subparsers)
    # ... etc

    # Nested subcommands: project, label
    _add_project_parser(subparsers)
    _add_label_parser(subparsers)

    return parser

def _add_project_parser(subparsers):
    """Add 'project' command group with nested subcommands."""
    project_parser = subparsers.add_parser('project', help='Manage projects')
    project_subs = project_parser.add_subparsers(dest='project_command', required=True)

    # project add
    add_proj = project_subs.add_parser('add', help='Create new project')
    add_proj.add_argument('name', type=str, help='Project name')
    # ... etc

    # project list, project archive, project unarchive
    # ...

def _add_label_parser(subparsers):
    """Add 'label' command group with nested subcommands."""
    label_parser = subparsers.add_parser('label', help='Manage labels')
    label_subs = label_parser.add_subparsers(dest='label_command', required=True)

    # label add, label remove, label list
    # ...
```

**Subcommand Routing Pattern:**
```python
def main():
    parser = create_parser()
    args = parser.parse_args()

    # Route to command handler based on parsed args
    if args.command == 'init':
        handle_init(args)
    elif args.command == 'add':
        handle_add(args)
    elif args.command == 'project':
        # Nested routing for project subcommands
        if args.project_command == 'add':
            handle_project_add(args)
        elif args.project_command == 'list':
            handle_project_list(args)
        # ...
    elif args.command == 'label':
        # Nested routing for label subcommands
        if args.label_command == 'add':
            handle_label_add(args)
        # ...
    # ... etc
```

---

## Commands

### `init`

Initialize a new task database.

**Syntax:**
```
task-cli init [--db PATH] [--force]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--force` | flag | false | Overwrite existing database |

**Behavior:**
1. Check if database file exists
2. If exists and `--force` not set -> error, exit 1
3. If exists and `--force` set -> perform atomic overwrite (see below)
4. If not exists -> create new database file with `O_CREAT | O_EXCL | O_NOFOLLOW` (see schema.md)
5. Execute schema creation SQL
6. Print success message

**Atomic Overwrite with --force (CRITICAL):**
When `--force` is set and file exists, the overwrite MUST be atomic to prevent TOCTOU race conditions:
1. Generate a unique temporary filename in the same directory (e.g., `.tasks.db.tmp.{random}`)
2. Create the new database at the temporary path using `O_CREAT | O_EXCL | O_NOFOLLOW | 0o600`
3. Execute schema creation on the temporary file
4. Use `os.rename()` to atomically replace the original file
5. `os.rename()` is atomic on POSIX systems when source and destination are on the same filesystem

**Rationale:** Simply deleting then creating leaves a race window where an attacker could create a symlink, redirecting the database write to an unauthorized location.

```python
import os
import tempfile
import sqlite3

def init_database_force(path: str) -> None:
    """Atomically recreate database with --force.

    CRITICAL: Keep file descriptor open during database initialization
    to prevent TOCTOU race condition between close and reopen.
    """
    dir_path = os.path.dirname(os.path.abspath(path))
    # Create temp file in same directory (required for atomic rename)
    fd, temp_path = tempfile.mkstemp(dir=dir_path, prefix='.tmp_', suffix='.db')
    try:
        # CRITICAL: Keep fd open during initialization to prevent symlink attack
        # Convert fd to file object for sqlite3 connection
        with os.fdopen(fd, 'w+b') as f:
            # Close the file object to release exclusive lock before sqlite opens
            pass

        # Now initialize the temp database (file is created with proper permissions)
        conn = sqlite3.connect(temp_path)
        try:
            _init_schema(conn)
            conn.close()
        except Exception:
            conn.close()
            raise

        # Atomic replace
        os.rename(temp_path, path)
    except Exception:
        # Clean up temp file on failure
        # Note: Use Exception, not bare except, to not catch KeyboardInterrupt/SystemExit
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise
```

**Output (success):**
```
Database initialized at ./tasks.db
```

**Output (exists, no force):**
```
Error: Database already exists at tasks.db. Use --force to recreate.
```

**Exit codes:**
- 0: Success
- 1: Database exists (without --force)
- 2: Cannot create file (permissions, invalid path)

---

### `add`

Create a new task.

**Syntax:**
```
task-cli add TITLE [options]
```

**Required:**

| Argument | Type | Constraints | Description |
|----------|------|-------------|-------------|
| `TITLE` | string | 1-500 chars | Task title (positional) |

**Optional:**

| Option | Type | Default | Constraints | Description |
|--------|------|---------|-------------|-------------|
| `--description DESC` | string | NULL | max 2000 chars | Task description |
| `--priority PRIORITY` | string | medium | high/medium/low | Task priority |
| `--due DATE` | string | NULL | YYYY-MM-DD | Due date |
| `--project NAME` | string | NULL | existing project | Project to assign |
| `--status STATUS` | string | pending | pending/in_progress | Initial status |

**Behavior:**
1. Validate all inputs
2. If `--project` specified, verify project exists
3. If project is archived, return error: "Error: Project '{name}' is archived. Choose an active project or create a new one." (exit 1)
4. Insert task into database
5. Return created task ID

**Output (success):**
```
Task created: 1 - Fix login bug
```

**Output (invalid priority):**
```
Error: Invalid priority 'urgent'. Must be one of: high, medium, low.
```

**Output (project not found):**
```
Error: Project 'backend' not found.
```

**Output (invalid date):**
```
Error: Invalid date format '01/25/2026'. Use YYYY-MM-DD.
```

**Exit codes:**
- 0: Success
- 1: Validation error
- 2: Database error
- 3: Project not found

---

### `edit`

Modify an existing task.

**Syntax:**
```
task-cli edit TASK_ID [options]
```

**Required:**

| Argument | Type | Description |
|----------|------|-------------|
| `TASK_ID` | integer | ID of task to edit |

**Optional (at least one required):**

| Option | Type | Description |
|--------|------|-------------|
| `--title TITLE` | string | New title |
| `--description DESC` | string | New description |
| `--priority PRIORITY` | string | New priority |
| `--due DATE` | string | New due date (use "" to clear) |
| `--project NAME` | string | New project (use "" to unassign) |
| `--status STATUS` | string | New status |

**Clearing Fields:**
To clear a due date or unassign a project, use an empty string:
```
task-cli edit 1 --due ""
```
Note: shell requires quotes around empty string.

**Behavior:**
1. Find task by ID
2. If not found -> error, exit 3
3. If `--project` specified, verify project exists
4. If project is archived, return error: "Error: Project '{name}' is archived. Choose an active project or create a new one." (exit 1)
5. If `--status` specified, validate status transition
6. Apply changes
7. Print updated task

**Status Transition Rules:**
Valid transitions via `edit --status`:
- `pending` -> `in_progress` -> `completed` (forward progression)
- `in_progress` -> `pending` (reverting work state)
- `completed` -> `pending` or `in_progress` (reopening)

Invalid transitions:
- Any status -> `archived` (must use `archive` command instead)
- `archived` -> any status (archived is terminal; archived tasks cannot be edited)

Error: "Error: Cannot change status to 'archived' via edit. Use the archive command."
Error: "Error: Cannot edit archived task. Task {id} is archived."

**Output (success):**
```
Task 1 updated.
```

**Output (not found):**
```
Error: Task 1 not found.
```

**Exit codes:**
- 0: Success
- 1: Validation error, or no changes specified
- 2: Database error
- 3: Task not found

---

### `list`

List tasks with filters.

**Syntax:**
```
task-cli list [options]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--status STATUS` | string | pending | Filter by status; use "all" to show all statuses (default: pending) |
| `--priority PRIORITY` | string | - | Filter by priority |
| `--project NAME` | string | - | Filter by project name (case-sensitive exact match) |
| `--label LABEL` | string | - | Filter by label |
| `--search TEXT` | string | - | Search in title (partial, case-insensitive) |
| `--overdue` | flag | false | Show only overdue tasks |
| `--format FORMAT` | string | table | Output format (table/json) |

**Behavior:**
1. Build query with filters
2. Default shows pending tasks only (use `--status all` for everything)
3. Multiple filters are AND'd
4. Return matching tasks

**Output (table):**
```
ID  | Title            | Priority | Due        | Project
----|------------------|----------|------------|----------
1   | Fix login bug    | high     | 2026-01-25 | backend
3   | Update docs      | low      | -          | -
```

**Output (no matches):**
```
No tasks found.
```

**Empty Database Behavior:**
When database is empty (no tasks exist), output "No tasks found." and exit 0. This applies to all list/query commands: list, due, search with filters.

**Output (JSON):**
```json
[
  {
    "id": 1,
    "title": "Fix login bug",
    "priority": "high",
    "due_date": "2026-01-25",
    "project": "backend",
    "labels": ["urgent"]
  }
]
```

**Exit codes:**
- 0: Success (including empty results)
- 2: Database error

---

### `show`

Show detailed task information.

**Syntax:**
```
task-cli show TASK_ID [--format FORMAT]
```

**Required:**

| Argument | Type | Description |
|----------|------|-------------|
| `TASK_ID` | integer | ID of task to show |

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format FORMAT` | string | detail | Output format (detail/json) |

**Output (detail format):**
```
Task #1: Fix login bug
----------------------------------------
Status:      pending
Priority:    high
Due:         2026-01-25
Project:     backend
Labels:      urgent, bug

Description:
Users report intermittent login failures...

Created:     2026-01-20 10:30:00
Updated:     2026-01-21 14:15:00
```

**Output (JSON format):**
```json
{
  "id": 1,
  "title": "Implement login page",
  "description": "Create the authentication UI",
  "status": "pending",
  "priority": "high",
  "due_date": "2026-01-25",
  "project": "backend",
  "labels": ["urgent", "frontend"],
  "created_at": "2026-01-20T10:00:00.000000+00:00",
  "updated_at": "2026-01-21T14:30:00.000000+00:00",
  "completed_at": null
}
```

**Exit codes:**
- 0: Success
- 2: Database error
- 3: Task not found

---

### `done`

Mark tasks as completed.

**Syntax:**
```
task-cli done TASK_ID [TASK_ID ...] [--force]
```

**Required:**

| Argument | Type | Description |
|----------|------|-------------|
| `TASK_ID` | integer | One or more task IDs |

**Optional:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--force` | flag | false | Auto-complete all incomplete subtasks |

**Behavior:**
1. For each task ID:
   - Find task
   - If not found -> error for that ID, continue
   - If already completed -> output warning and continue (exit 0 for idempotent behavior)
   - **If task has incomplete subtasks (CRITICAL):**
     - Without `--force`: Fail with error listing incomplete subtasks
     - With `--force`: Auto-complete all subtasks first, then parent
   - Mark as completed, set completed_at timestamp
2. Print summary

**Subtask Completion Rules (v1.1 - NOT IN v1.0 CORE):**
> Note: Subtask functionality is part of v1.1 extended schema. The `--force` flag and subtask completion rules below apply only when subtask support is implemented.

When marking a parent task as done, if any subtasks are incomplete:
- The operation MUST fail with an error listing the incomplete subtasks
- Use `--force` to auto-complete all subtasks along with the parent task
- The completion operation MUST be atomic (all or nothing)

Example error:
```
Error: Cannot complete task 1: 3 subtasks are incomplete.
  - Subtask 5: "Research phase" (pending)
  - Subtask 6: "Implementation" (in_progress)
  - Subtask 7: "Testing" (pending)
Use --force to auto-complete all subtasks.
```

### Batch Operation Error Handling

When multiple task IDs are provided:
1. **Invalid ID format** (non-numeric, negative, zero): Report validation error, continue to next ID
   - Message: `Error: Invalid task ID '{value}' - must be positive integer`
2. **Task not found**: Report not found error, continue to next ID
   - Message: `Error: Task {id} not found`
3. **Exit code logic:**
   - Exit 0: At least one task was successfully processed
   - Exit 1: All IDs had validation errors (none were valid format)
   - Exit 3: All valid IDs were not found (none existed)
   - Exit 2: Database error during processing

Example: `done 1 abc -5 999`
- ID 1: processed successfully
- ID abc: validation error (not numeric)
- ID -5: validation error (not positive)
- ID 999: not found error
- Result: Exit 0 (one success), with error messages for failures

### Batch Operation Output Format

**Error Message Timing:**
Individual error messages are written to stderr as they occur during processing:
```
Error: Invalid task ID 'abc' - must be positive integer
Error: Invalid task ID '-5' - must be positive integer
Error: Task 999 not found
Completed: 1
```

**Output Format for Mixed Success/Failure:**
- Individual errors: Written to stderr immediately when encountered
- Success summary: Written to stdout after all IDs processed
- Format: `Completed: {id1}, {id2}, ...` (only successful IDs listed)

**Handling Multiple Error Types:**
When a batch operation encounters multiple error types (validation errors, not found errors, database errors):
1. Process all IDs in order
2. Write each error to stderr as it occurs
3. Track error categories (validation_errors, not_found_errors, db_errors)
4. If database error occurs, abort remaining IDs and exit 2
5. Otherwise, complete processing and determine exit code based on results

**stderr vs stdout:**
- stderr: All error messages (validation errors, not found errors)
- stdout: Success summary line only
- Rationale: Allows scripts to capture success output separately from errors

**Exit Code Determination with Database Errors:**
- Database error during processing: Immediately abort, exit 2
- No database errors: Exit code based on success/failure counts (see logic above)

**Transaction Atomicity:**
- Batch operations use `BEGIN IMMEDIATE TRANSACTION`
- On database error: Rollback entire batch, no partial commits
- On validation/not found errors: Transaction continues, only skip failed IDs
- Rationale: Validation errors are pre-flight checks; database errors indicate system issues

### Batch Operation Locking (CRITICAL)

Batch operations (done, archive) MUST acquire an exclusive lock before processing to prevent race conditions.

**Implementation Requirement:**
- All batch operations MUST start with: `conn.execute("BEGIN IMMEDIATE TRANSACTION")`
- `BEGIN IMMEDIATE` acquires an exclusive write lock at the START of the transaction
- This prevents concurrent batch operations from interfering with each other
- Without IMMEDIATE, SQLite uses deferred locking (waits until first write), creating race condition window
- If lock cannot be acquired within busy_timeout (5 seconds), fail with database error (exit 2)

**Example:**
```python
def batch_done(conn, task_ids: list[int]) -> None:
    conn.execute("BEGIN IMMEDIATE TRANSACTION")  # CRITICAL: Lock acquired here
    try:
        for task_id in task_ids:
            # process each task
            mark_task_done(conn, task_id)
        conn.commit()
    except:
        conn.rollback()
        raise
```

**Output (success):**
```
Completed: 1, 3, 5
```

**Output (partial):**
```
Completed: 1, 3. Not found: 99. Already completed: 5.
```

**Exit codes:**
- 0: At least one task completed successfully
- 1: All IDs had validation errors (invalid format)
- 2: Database error during processing
- 3: All valid IDs were not found in database

---

### `archive`

Archive completed tasks.

**Syntax:**
```
task-cli archive [TASK_ID ...] [--all-completed]
```

**Options:**

| Option | Type | Description |
|--------|------|-------------|
| `--all-completed` | flag | Archive all completed tasks |

**Behavior:**
1. If `--all-completed`: archive all tasks with status=completed
2. If TASK_IDs specified: archive those specific tasks
3. Task must be completed to be archived

**Batch Operation Error Handling**

For batch archival with multiple task IDs:
1. Validate all IDs (format check)
2. For each valid ID: attempt to archive
3. Continue processing remaining IDs even if some fail
4. Report results: "Archived X tasks. Y tasks failed."

Error priority (determines exit code):
1. If ALL valid IDs failed (not found or not completed): exit 3
2. If database error occurred: exit 2
3. If at least one succeeded: exit 0
4. If all IDs had validation errors: exit 1

**Output:**
```
Archived 5 tasks.
```

**Output (task not completed):**
```
Error: Task must be completed before archiving. Current status: pending.
```

**Exit codes:**
- 0: Success
- 1: Task not completed (cannot archive)
- 2: Database error
- 3: Task not found

---

### `project add`

Create a new project.

**Syntax:**
```
task-cli project add NAME [--description DESC]
```

**Required:**

| Argument | Type | Constraints | Description |
|----------|------|-------------|-------------|
| `NAME` | string | 1-100 chars, unique | Project name |

**Optional:**

| Option | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `--description DESC` | string | max 500 chars | Project description |

**Output (success):**
```
Project created: backend (ID: 1)
```

**Output (duplicate):**
```
Error: Project 'backend' already exists.
```

**Exit codes:**
- 0: Success
- 1: Validation error
- 4: Duplicate name

---

### `project list`

List all projects.

**Syntax:**
```
task-cli project list [--all] [--format FORMAT]
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--all` | flag | false | Include archived projects |
| `--format FORMAT` | string | table | Output format (table/json) |

**Output (table):**
```
ID | Name     | Status | Tasks
---|----------|--------|-------
1  | backend  | active | 5
2  | frontend | active | 3
```

Tasks column shows count of PENDING tasks only (excludes completed and archived).

**Empty Database Behavior:**
When no projects exist, output "No projects found." and exit 0.

**Exit codes:**
- 0: Success (including empty results)
- 2: Database error

---

### `project archive`

Archive a project.

**Syntax:**
```
task-cli project archive NAME
```

**Behavior:**
1. Find project by name
2. Set status to 'archived'
3. Does NOT affect tasks in project

**Output:**
```
Project 'backend' archived.
```

**Exit codes:**
- 0: Success
- 2: Database error
- 3: Project not found

---

### `project unarchive`

Restore an archived project to active status.

**Syntax:**
```
task-cli project unarchive NAME
```

**Behavior:**
1. Find project by name
2. If not found -> error, exit 3
3. If already active -> output message, exit 0 (idempotent)
4. Set status to 'active'
5. Update updated_at timestamp

**Output:**
```
Project 'backend' restored to active.
```

**Output (already active):**
```
Project 'backend' is already active.
```

**Exit codes:**
- 0: Success (including already active)
- 2: Database error
- 3: Project not found

---

### Archived Project Rules (CRITICAL)

Archived projects are read-only. The following rules MUST be enforced:

1. **New tasks MUST NOT be created in archived projects.**
   - `task-cli add "Task" --project archivedProject` MUST fail
   - Error: "Error: Project '{name}' is archived. Choose an active project or create a new one."
   - Exit code: 1 (ValidationError)

2. **Existing tasks in archived projects MUST NOT be modifiable.**
   - `task-cli edit <id> --title "New title"` MUST fail if task is in an archived project
   - Error: "Error: Cannot modify task in archived project '{name}'. Unarchive the project first."
   - Exit code: 1 (ValidationError)
   - Exception: The `done` and `archive` commands still work on tasks in archived projects
   - Rationale: Status changes (completing/archiving work) are terminal operations that don't modify task content, so they're safe to perform even after project is archived for historical record-keeping

3. **Tasks MUST NOT be reassigned to archived projects.**
   - `task-cli edit <id> --project archivedProject` MUST fail
   - Error: "Error: Project '{name}' is archived. Choose an active project or create a new one."
   - Exit code: 1 (ValidationError)

4. **To modify tasks in an archived project:**
   - First unarchive the project: `task-cli project unarchive <name>`
   - Then modify tasks as needed
   - Optionally re-archive the project

**Rationale:** Archived projects represent completed or abandoned work. Preventing modifications ensures historical integrity and prevents accidental changes to closed projects.

### Archived Project Enforcement Implementation

**Enforcement Location:**
- Checks MUST be performed in the command handler layer (commands.py), NOT the CLI layer (cli.py)
- Rationale: Commands may be invoked programmatically; enforcement must occur at business logic layer

**Implementation Pattern:**
```python
def handle_add(args):
    """Handle 'add' command - create new task."""
    # ... parse args ...

    if args.project:
        # Check if project is archived BEFORE creating task
        project = get_project_by_name(conn, args.project)
        if project and project.status == 'archived':
            raise ValidationError(
                f"Project '{args.project}' is archived. "
                "Choose an active project or create a new one."
            )

    # Proceed with task creation
    task_id = create_task(conn, title=args.title, project=args.project, ...)

def handle_edit(args):
    """Handle 'edit' command - modify existing task."""
    task = get_task_by_id(conn, args.task_id)
    if not task:
        raise NotFoundError(f"Task {args.task_id} not found")

    # Check if task is in archived project (applies to ALL edits except done/archive)
    if task.project:
        project = get_project_by_name(conn, task.project)
        if project and project.status == 'archived':
            raise ValidationError(
                f"Cannot modify task in archived project '{task.project}'. "
                "Unarchive the project first."
            )

    # If reassigning to new project, check target project is not archived
    if args.project and args.project != task.project:
        target_project = get_project_by_name(conn, args.project)
        if target_project and target_project.status == 'archived':
            raise ValidationError(
                f"Project '{args.project}' is archived. "
                "Choose an active project or create a new one."
            )

    # Proceed with update
    update_task(conn, args.task_id, ...)
```

**Error Message Timing:**
- Archived project check happens BEFORE database modification
- Error is raised immediately, transaction is never started
- No partial state changes

**Race Condition Handling:**
- Project archive status is checked within the same transaction as task modification
- Use `BEGIN IMMEDIATE TRANSACTION` for write operations to prevent concurrent modifications
- Example:
  ```python
  conn.execute("BEGIN IMMEDIATE TRANSACTION")
  try:
      project = get_project_by_name(conn, args.project)  # Within transaction
      if project.status == 'archived':
          raise ValidationError(...)
      create_task(conn, ...)
      conn.commit()
  except:
      conn.rollback()
      raise
  ```

**Performance Implications:**
- Add command: One additional SELECT query to check project status (negligible)
- Edit command: One or two additional SELECT queries (current project + new project if reassigning)
- Database has index on projects.name for efficient lookups
- Trade-off: Slight performance overhead for data integrity guarantee

---

### `label add`

Add label to a task.

**Syntax:**
```
task-cli label add TASK_ID LABEL_NAME
```

**Behavior:**
1. Find task by ID (MUST succeed before proceeding)
2. If task not found -> error, exit 3 (no label created)
3. Create label if doesn't exist
4. Add association

**Output:**
```
Label 'urgent' added to task 1.
```

**Output (already has):**
```
Task 1 already has label 'urgent'.
```

If label already assigned to task: output 'Task X already has label Y', exit 0 (idempotent).

**Exit codes:**
- 0: Success (including when label already assigned)
- 3: Task not found

**Label Name Case Sensitivity:** Label names are case-sensitive.
- "urgent" and "Urgent" are different labels
- No automatic case normalization is performed
- Users are responsible for consistent naming

---

### `label remove`

Remove label from a task.

**Syntax:**
```
task-cli label remove TASK_ID LABEL_NAME
```

**Output:**
```
Label 'urgent' removed from task 1.
```

**Note:** Removing a label from a task only removes the association. Labels with zero task associations remain in the database (no automatic cleanup). Use `label list` to see labels and their task counts.

**Exit codes:**
- 0: Success
- 3: Task or label not found

---

### `label list`

List all labels.

**Syntax:**
```
task-cli label list [--format FORMAT]
```

**Output (table):**
```
Name     | Tasks
---------|-------
urgent   | 3
bug      | 5
feature  | 2
```

**Empty Database Behavior:**
When no labels exist, output "No labels found." and exit 0.

**Exit codes:**
- 0: Success (including empty results)
- 2: Database error

---

### `due`

Show tasks due in period.

**Syntax:**
```
task-cli due PERIOD [--format FORMAT]
```

**Required:**

| Argument | Type | Values | Description |
|----------|------|--------|-------------|
| `PERIOD` | string | today, week, overdue | Time period |

- `today`: Due today (due_date = today)
- `week`: Due within next 7 days inclusive (today <= due_date <= today + 6 days)
- `overdue`: Past due date, not completed or archived (due_date < today AND status NOT IN ('completed', 'archived'))

**Overdue Task Filter Logic:**

**Status Filtering:**
- Exclude tasks with status 'completed' (work is done)
- Exclude tasks with status 'archived' (historical record)
- Include tasks with status 'pending' (not started, but overdue)
- Include tasks with status 'in_progress' (started but not finished, overdue)
- SQL: `status NOT IN ('completed', 'archived')`

**NULL due_date Handling:**
- Tasks with NULL due_date have no deadline
- Cannot be overdue (no date to compare against)
- Overdue filter MUST exclude NULL due dates
- SQL: `due_date IS NOT NULL AND due_date < today`

**Timezone Considerations:**
- All dates stored as naive dates (YYYY-MM-DD) without time component
- "today" is determined by system's local date at execution time
- Use date comparison, not datetime
- Python: `datetime.date.today()` (not datetime.now())

**Due Today vs Overdue Boundary:**
- Due today: `due_date = today` (deadline is today, not yet overdue)
- Overdue: `due_date < today` (deadline was in the past)
- Tasks due today do NOT appear in overdue list
- Example: If today is 2026-01-23, task due 2026-01-23 is "due today", not overdue

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--format FORMAT` | string | table | Output format (table/json) |

**Output (table):**
```
ID | Title            | Priority | Due        | Project
---|------------------|----------|------------|----------
1  | Fix login bug    | high     | 2026-01-21 | backend
```

**Empty Database Behavior:**
When no tasks match the due date criteria, output "No tasks due {period}." and exit 0.

**Exit codes:**
- 0: Success (including empty results)
- 2: Database error

---

### `report`

Show productivity statistics.

**Syntax:**
```
task-cli report [--period PERIOD] [--format FORMAT]
```

**Options:**

| Option | Type | Default | Values |
|--------|------|---------|--------|
| `--period PERIOD` | string | week | today, week, month |
| `--format FORMAT` | string | text | text, json |

**Period Definitions:**
- `today`: Rolling 1 day (today only)
- `week`: Rolling 7 days ending today (today - 6 days to today, inclusive)
- `month`: Rolling 30 days ending today (today - 29 days to today, inclusive)

**Output (text):**
```
Task Report: 2026-01-14 to 2026-01-21
=====================================

Summary:
  Completed:  12
  Created:    15
  Pending:    8
  Overdue:    2

By Priority (pending):
  High:    3
  Medium:  4
  Low:     1

By Project (pending):
  backend:   4
  frontend:  2
  (none):    2
```

**Calculation Rules:**
- Completed this period: tasks where completed_at falls within date range
- Created this period: tasks where created_at falls within date range
- Pending: status = 'pending' (excludes completed and archived)
- Overdue: due_date IS NOT NULL AND due_date < today AND status NOT IN ('completed', 'archived') - includes both 'pending' and 'in_progress' tasks with non-null due dates
- Archived tasks are EXCLUDED from all counts

**Empty Database Behavior:**
When database is empty (no tasks), all counts are 0. Still output full report structure with zero values and exit 0.

**Exit codes:**
- 0: Success (including empty database)
- 2: Database error

---

### `export-csv`

Export tasks to CSV.

**Syntax:**
```
task-cli export-csv --output PATH [options]
```

**Required:**

| Option | Type | Description |
|--------|------|-------------|
| `--output PATH` | string | Output file path |

**Optional:**

| Option | Type | Description |
|--------|------|-------------|
| `--status STATUS` | string | Filter by status |
| `--project NAME` | string | Filter by project |
| `--since DATE` | string | Export tasks created or completed since DATE; must be ISO format YYYY-MM-DD (see filter semantics below) |
| `--force` | flag | Overwrite existing file; has no effect if file doesn't exist |

**Force Flag Behavior:**
- If output file exists: `--force` performs atomic overwrite (see below)
- If output file does not exist: `--force` has no effect; file is created normally using `O_CREAT | O_EXCL | O_NOFOLLOW`
- Without `--force` and file exists: operation fails with error (exit 1)

**Atomic Overwrite with --force (CRITICAL):**
When `--force` is set and file exists, the overwrite MUST be atomic to prevent TOCTOU race conditions:
1. Generate a unique temporary filename in the same directory (e.g., `.output.csv.tmp.{random}`)
2. Create the new CSV at the temporary path using `O_CREAT | O_EXCL | O_NOFOLLOW | 0o644`
3. Write CSV content to the temporary file (see implementation details below)
4. Use `os.rename()` to atomically replace the original file
5. `os.rename()` is atomic on POSIX systems when source and destination are on the same filesystem

**Rationale:** Simply checking then overwriting leaves a race window where an attacker could create a symlink between check and write, redirecting the CSV export to an unauthorized location (e.g., overwriting ~/.bashrc).

**Implementation Details:**

**File Descriptor to File Object Conversion:**
```python
import os
import tempfile
import csv

def export_csv_force(output_path: str, tasks: list) -> None:
    """Export tasks to CSV with atomic overwrite.

    CRITICAL: Proper fd handling to prevent TOCTOU race conditions.
    """
    dir_path = os.path.dirname(os.path.abspath(output_path))

    # Create temp file with O_CREAT | O_EXCL | O_NOFOLLOW | 0o644
    fd = os.open(
        os.path.join(dir_path, f'.tmp_{os.getpid()}_{os.urandom(8).hex()}.csv'),
        os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
        0o644  # Readable by all, writable by owner
    )
    temp_path = f'/proc/self/fd/{fd}'  # On Linux; see platform notes below

    try:
        # Convert fd to file object for csv.writer
        with os.fdopen(fd, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            # Write CSV content
            writer.writerow(['id', 'title', 'description', ...])
            for task in tasks:
                writer.writerow([task.id, task.title, ...])

        # At this point, file is closed but temp file exists on disk
        # Get actual temp path (not fd path)
        temp_path = f'{dir_path}/.tmp_{os.getpid()}_{os.urandom(8).hex()}.csv'

        # Atomic replace
        os.rename(temp_path, output_path)

    except Exception:
        # Clean up temp file on failure
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise
```

**Corrected Implementation (Platform-Independent):**
```python
import os
import tempfile
import csv

def export_csv_force(output_path: str, tasks: list) -> None:
    """Export tasks to CSV with atomic overwrite."""
    dir_path = os.path.dirname(os.path.abspath(output_path))

    # Create temp file in same directory
    fd, temp_path = tempfile.mkstemp(
        dir=dir_path,
        prefix='.tmp_',
        suffix='.csv'
    )

    try:
        # Convert fd to file object for csv.writer
        # os.fdopen takes ownership of fd (will close it when file object closes)
        with os.fdopen(fd, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['id', 'title', 'description', ...])
            for task in tasks:
                writer.writerow([task.id, task.title, ...])
        # File is now closed, temp file has correct content

        # Fix permissions (mkstemp creates with 0o600, we need 0o644)
        os.chmod(temp_path, 0o644)

        # Atomic replace
        os.rename(temp_path, output_path)

    except Exception:
        # Clean up temp file on failure
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise
```

**Permission Handling:**
- tempfile.mkstemp() creates file with mode 0o600 (owner read/write only)
- CSV exports should be readable by others (mode 0o644)
- Use os.chmod(temp_path, 0o644) after writing, before rename
- Security note: 0o600 during write prevents read access during creation; 0o644 after write allows normal file access

**Temp File Cleanup on Error:**
- try/except block wraps entire operation
- On any exception: Check if temp file exists, unlink if present
- Then re-raise exception to propagate error to caller
- Edge case: If os.rename() fails, temp file remains and must be cleaned up

**Temp File Naming:**
- Use tempfile.mkstemp() for secure temp file creation
- Provides cryptographically random filename
- Prefix: '.tmp_' (hidden on Unix systems)
- Suffix: '.csv' (helpful for debugging, optional)

**O_NOFOLLOW on Rename Target:**
- os.rename() does not have O_NOFOLLOW equivalent
- However, TOCTOU risk is mitigated: We control temp file creation (O_EXCL ensures we created it)
- Attacker cannot replace temp file with symlink between creation and rename
- The original output file could be a symlink, but that's user's choice (not a vulnerability)

**Windows Compatibility:**
- os.rename() on Windows: Not atomic if destination exists (raises FileExistsError)
- Must use os.replace() instead (atomic on both POSIX and Windows)
- Corrected implementation:
  ```python
  # Use os.replace() for cross-platform atomicity
  os.replace(temp_path, output_path)
  ```
- os.replace() is atomic on both POSIX (same as rename) and Windows (even if dest exists)

**CSV columns:** `id,title,description,status,priority,due_date,project,labels,created_at,updated_at,completed_at`

**Labels Column Format:** Labels are semicolon-separated within the column.
- Example: `urgent;bug;high-priority`
- Empty labels: empty string in column
- Labels containing semicolons: not supported (semicolon is reserved separator)
- Proper CSV escaping applies (quotes around field if contains comma)

**CSV Injection Prevention (CRITICAL):**
All field values MUST be checked for formula injection. If a field value starts with any of these characters: `=`, `+`, `-`, `@`, tab, carriage return, or newline, the field MUST be prefixed with a single quote (`'`) before CSV encoding. This prevents spreadsheet applications from interpreting field content as formulas or commands.

**--since Filter Semantics:**
The --since filter uses OR logic: includes tasks where created_at >= DATE OR completed_at >= DATE. This captures both new tasks and recently completed tasks.

**Note:** Tasks that were only edited (but not created or completed) after DATE are NOT included. To export tasks modified in any way, query the database directly or use additional filtering criteria. This behavior is intentional to focus the export on meaningful activity (new work and closed work) rather than minor edits.

**Output (success):**
```
Exported 150 tasks to tasks.csv
```

**Output (file exists):**
```
Error: File 'tasks.csv' already exists. Use --force to overwrite.
```

**Output (path traversal):**
```
Error: Path '{basename}' resolves outside allowed directory.
```

**Empty Result Behavior:**
When no tasks match the specified filters, create a CSV file containing only the header row. Output message: "Exported 0 tasks to {filename}" and exit 0.

**Exit codes:**
- 0: Success
- 1: File exists (without --force), path validation error
- 2: Database error

---

## Input Validation Rules

### Title
- Non-empty
- Maximum 500 characters

### Description
- Maximum 2000 characters
- Can be empty/null

### Priority
- Must be: `high`, `medium`, or `low`
- Case-sensitive

### Status
- Must be: `pending`, `in_progress`, `completed`, or `archived`
- Case-sensitive

### Due Date
- Must be ISO format: `YYYY-MM-DD`
- Validation regex: `^\d{4}-\d{2}-\d{2}$`
- Must be valid calendar date

### Task ID
- Must be a positive integer
- Must be >= 1 and <= 9,223,372,036,854,775,807 (SQLite INTEGER max)
- Regex: `^[1-9]\d*$`
- **CRITICAL:** Task ID validation MUST be applied to ALL commands accepting task IDs (edit, show, done, archive, label add, label remove)
- **Validation logic:**
  ```python
  from task_cli.exceptions import ValidationError

  def validate_task_id(task_id_str: str) -> int:
      """Validate task ID is a positive integer within bounds.

      CRITICAL: This function MUST be called for ALL task ID inputs
      before passing to database layer.

      Raises:
          ValidationError: If not numeric, not positive, or exceeds max
      """
      # Reject non-digits, empty strings, and leading zeros (including "0")
      if not task_id_str.isdigit() or task_id_str[0] == '0':
          raise ValidationError(f"Invalid task ID '{task_id_str}' - must be positive integer")

      task_id = int(task_id_str)
      # Note: task_id >= 1 is guaranteed by the check above (no leading zeros, all digits)
      if task_id > 9223372036854775807:
          raise ValidationError(f"Invalid task ID '{task_id}' - exceeds maximum value")

      return task_id
  ```
- Non-numeric input produces ValidationError (exit 1)
- Out of bounds produces ValidationError (exit 1)
- ID not found produces NotFoundError (exit 3)

### Project Name
- Non-empty
- Maximum 100 characters
- Any printable characters allowed

### Label Name
- 1-50 characters
- Only alphanumeric characters, underscores, and hyphens allowed
- Pattern: `^[A-Za-z0-9_-]+$`
- No spaces, semicolons, or special characters (semicolons reserved as CSV separator)
- Error message: "Error: Invalid label name. Use only letters, numbers, underscores, and hyphens."

### Path (--db, --output)
- Must be validated using secure path traversal prevention (see S3 in ARCHITECTURE-simple.md)
- Resolved to absolute path following symlinks
- Must be within allowed directory (cwd or specified base)
- Do NOT rely solely on checking for '..' in the string

---

## Output Standards

### Table Format
- Column headers in first row
- Separator line of dashes and pipes
- Fixed-width columns with padding
- Truncate long values with `...`
- Column widths: ID=4, Title=20, Priority=8, Due=10, Project=15

### JSON Format
- Pretty-printed with 2-space indent
- Arrays for lists (even single item)
- UTF-8 encoding
- NULL values: include key with `null` value

### Timestamp Formats in JSON Output
- `due_date`: Date only, format `YYYY-MM-DD` (e.g., `"2026-01-25"`)
- `created_at`, `updated_at`, `completed_at`: ISO 8601 timestamp with timezone, format `YYYY-MM-DDTHH:MM:SS.ffffff+00:00` (e.g., `"2026-01-20T10:00:00.000000+00:00"`)

### Error Messages
- Prefix: `Error: `
- Written to stderr
- No stack traces (unless --verbose)
- No internal paths or SQL
