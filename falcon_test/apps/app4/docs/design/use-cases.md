# Use Cases: Task Manager CLI

## UC1: Initial Setup

**Actor**: Developer setting up task tracking for the first time

**Flow**:
1. Install tool: `pip install task-cli`
2. Initialize database: `task-cli init --db ./tasks.db`
3. Optionally create initial project: `task-cli project add "My Project"`

**Success**: Database created, ready to accept tasks

**Failure modes**:
- Database path not writable -> exit 2, clear error message
- Database already exists -> exit 1, refuse without `--force`

---

## UC2: Creating a Task

**Actor**: Developer adding new work item

**Flow**:
1. Create task: `task-cli add "Fix login bug" --project backend --priority high --due 2026-01-25`
2. Optionally add labels: `task-cli label add 1 urgent`

**Success**: Task created with ID, shown to user

**Failure modes**:
- Invalid date format -> exit 1, show expected format (YYYY-MM-DD)
- Project doesn't exist -> exit 3, suggest creating project
- Invalid priority -> exit 1, show allowed values (high, medium, low)

---

## UC3: Daily Task Review

**Actor**: Developer starting workday

**Flow**:
1. Check today's tasks: `task-cli due today`
2. Check overdue: `task-cli list --status pending --overdue`
3. Pick task to work on

**Success**: Clear view of urgent work

**Failure modes**:
- Database not found -> exit 2

---

## UC4: Completing Tasks

**Actor**: Developer finishing work

**Flow**:
1. Mark complete: `task-cli done 1` (by ID)
2. Or mark multiple: `task-cli done 1 2 3`

**Success**: Tasks marked completed with timestamp

**Failure modes**:
- Task not found -> exit 3
- Task already completed -> warn user, continue

---

## UC5: Project Management

**Actor**: Developer organizing work

**Flow**:
1. Create project: `task-cli project add "API Redesign"`
2. List projects: `task-cli project list`
3. View project tasks: `task-cli list --project "API Redesign"`
4. Archive project: `task-cli project archive "API Redesign"`

**Success**: Projects created, listed, archived

**Failure modes**:
- Duplicate project name -> exit 4
- Project not found -> exit 3

---

## UC6: Weekly Report

**Actor**: Developer tracking productivity

**Flow**:
1. Get stats: `task-cli report --period week`
2. Export completed: `task-cli export-csv --output weekly.csv --status completed --since 2026-01-14`

**Success**: Stats displayed, CSV created

**Failure modes**:
- File exists without --force -> exit 1
- Path contains `..` -> exit 1

---

## UC7: Searching and Filtering

**Actor**: Developer finding specific tasks

**Flow**:
1. Search by title: `task-cli list --search "bug"`
2. Filter by label: `task-cli list --label urgent`
3. Filter by multiple criteria: `task-cli list --project backend --priority high --status pending`

**Success**: Matching tasks displayed

**Failure modes**:
- No search criteria -> show all pending tasks (default behavior)
