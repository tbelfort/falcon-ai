# Fixes Applied to app4/docs/design/components.md

## Changes Made

### Issue ID 9: CLI Argument Parser Structure Unspecified
**What Changed**: Added comprehensive "Parser Structure" section to the `cli.py` component specification with 7-step implementation guide and code example.

**Content Added/Modified**:
```
**Parser Structure:**
The argument parser MUST be structured as follows:
1. **Root parser**: Create with `argparse.ArgumentParser(description="...", prog="task")`
2. **Global options**: Add directly to root parser BEFORE creating subparsers:
   - `--db PATH` (default: `~/.task/tasks.db`)
   - `--verbose` (action: store_true)
   - `--version` (action: version)
3. **Subparsers**: Create with `add_subparsers(dest="command", required=True)`
4. **Command subparsers**: Each subcommand (init, add, edit, list, etc.) is added with `subparsers.add_parser(name, help="...")`
5. **Command-specific arguments**: Added to individual subparsers
6. **Routing**: After `args = parser.parse_args()`, use `args.command` to dispatch to corresponding `cmd_*` function in commands.py
7. **Nested subcommands**: For project/label groups, create intermediate subparsers with their own `dest` attributes (e.g., `dest="project_action"`)

**Example structure**:
```python
parser = ArgumentParser(description="Task Manager CLI")
parser.add_argument("--db", default="~/.task/tasks.db")
parser.add_argument("--verbose", action="store_true")
subparsers = parser.add_subparsers(dest="command", required=True)

# Simple command
add_parser = subparsers.add_parser("add", help="Add task")
add_parser.add_argument("title", help="Task title")

# Nested subcommands (project group)
project_parser = subparsers.add_parser("project", help="Manage projects")
project_subs = project_parser.add_subparsers(dest="project_action", required=True)
proj_add = project_subs.add_parser("add", help="Add project")
```
```

---

### Issue ID 12: CSV Injection Escaping Implementation Unclear
**What Changed**: Expanded CSV injection prevention section from 3 sentences to 6 detailed subsections covering escaping function signature, csv module interaction, processing order, and all edge cases.

**Content Added/Modified**:
```
**CSV Injection Prevention (CRITICAL):**
The `write_csv()` function MUST escape all field values to prevent formula injection attacks. Implementation requirements:

1. **Escaping function**: Create `escape_csv_field(value: str | None) -> str | None` that:
   - Returns None unchanged (for optional fields)
   - Returns empty string unchanged
   - If value starts with `=`, `+`, `-`, `@`, `\t`, `\r`, or `\n`: prefix with single quote `'`
   - Otherwise returns value unchanged

2. **CSV module interaction**: Use Python's csv.writer with the following configuration:
   - Quoting mode: `csv.QUOTE_MINIMAL` (default)
   - Call `escape_csv_field()` on ALL field values BEFORE passing rows to csv.writer
   - The csv module will then handle additional quoting if fields contain delimiters/quotes

3. **Processing order**:
   ```python
   # Step 1: Apply injection escaping
   escaped_value = escape_csv_field(task.title)
   # Step 2: Pass to csv.writer (it handles delimiter quoting)
   writer.writerow([escaped_value, ...])
   ```

4. **Edge cases**:
   - Empty strings: No escaping needed (not vulnerable)
   - None values: Return None (caller handles as empty field)
   - Unicode characters: No special handling (pass through)
   - Multi-line values: Only escape if FIRST character is dangerous; newlines elsewhere are safe and handled by csv module's quoting
   - Already-quoted values: Still apply escaping (no detection needed; defensive approach)

This two-layer approach ensures: (1) injection prevention via quote prefix, (2) proper CSV formatting via csv.QUOTE_MINIMAL.
```

---

### Issue ID 13: Archived Project Enforcement Mechanism Unspecified
**What Changed**: Added "Archived Project Enforcement" section after the public interface list in `commands.py` component, specifying enforcement layer, implementation sequence, exception handling, error messages, race condition handling, and performance impact.

**Content Added/Modified**:
```
**Archived Project Enforcement:**
The business rules for archived projects (defined in interface.md) MUST be enforced as follows:

1. **Check location**: In `cmd_add()` and `cmd_edit()`, AFTER resolving project name to project_id, but BEFORE database operations
2. **Implementation sequence**:
   ```python
   # In cmd_add() and cmd_edit()
   if project_name:
       project = database.find_project_by_name(conn, project_name)
       if not project:
           raise NotFoundError(f"Project '{project_name}' not found")
       if project.status == "archived":
           raise ValidationError(f"Cannot add tasks to archived project '{project_name}'")
       project_id = project.id
   ```
3. **Exception for done/archive**: The `cmd_done()` and `cmd_archive()` functions MUST NOT check project archived status (they operate on existing tasks only)
4. **Error messages**: Use exact messages from interface.md:
   - Add: `"Cannot add tasks to archived project '{project_name}'"`
   - Edit: `"Cannot move task to archived project '{project_name}'"`
5. **Race conditions**: Handled by transaction isolation (connection context manager in database.py commits atomically)
6. **Performance**: Single additional SELECT query per add/edit operation when project is specified (acceptable overhead)
```

---

## Summary
- Issues fixed: 3
- Sections added: 3 (Parser Structure, CSV Injection Prevention expanded, Archived Project Enforcement)
- Sections modified: 2 (cli.py component, formatters.py component, commands.py component)

All blocking design issues have been resolved with implementation-ready specifications. The fixes provide:
1. Complete argparse architecture for CLI parser structure
2. Clear two-layer approach for CSV injection prevention with csv module integration
3. Explicit enforcement layer and sequence for archived project business rules
