# Vision: Task Manager CLI

## Problem Statement

Individual developers need task management that:
- Works offline (no cloud dependency)
- Integrates with shell workflows (scriptable)
- Doesn't require a GUI or browser
- Handles project organization without enterprise overhead

Existing solutions are:
- **Overkill**: Jira, Linear, Asana require teams and subscriptions
- **Cloud-dependent**: Todoist, Things require internet connectivity
- **Not scriptable**: GUI-only tools can't integrate into automated workflows
- **Context-switching**: Web apps pull developers out of their terminal

## Target User

**Alex, the solo developer:**
- Manages tasks across 3-5 active projects
- Uses terminal for most work
- Wants to script task creation from git hooks, CI failures, etc.
- Needs quick "what's due today" checks
- Works offline frequently (commute, travel, spotty WiFi)
- Has basic command-line familiarity

## Solution

A pip-installable CLI tool that:
1. Stores tasks in a local SQLite database (no server required)
2. Provides commands for task lifecycle (add, edit, complete, archive)
3. Supports project grouping and label tagging
4. Outputs machine-readable formats (JSON, CSV) for scripting
5. Runs on any system with Python 3.10+ (no external dependencies)

## Non-Goals

- **Multi-user access**: This is single-user only. No auth, no concurrent writes.
- **Cloud sync**: No sync, no mobile app, no web interface.
- **Time tracking**: Track completion, not time spent.
- **Recurring tasks**: Manual task creation only.
- **Calendar integration**: No iCal, Google Calendar, etc.
- **Notifications**: User must check manually.
- **Delete commands**: Tasks, projects, and labels use archive-only lifecycle. No permanent delete to prevent accidental data loss.
- **Project editing**: Projects are created with name/description and archived when no longer needed. Use archive + create new for corrections.

## Success Criteria

1. User can go from `pip install` to tracking tasks in under 3 minutes
2. All commands complete in <100ms for databases up to 10,000 tasks
3. Works fully offline after initial install
4. Shell scripts can parse output reliably (stable JSON schema)
