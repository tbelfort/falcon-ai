# Vision: Note-taking/Wiki CLI

## Problem Statement

Developers need quick note-taking during coding sessions, but existing solutions are:
- **GUI-based**: Apps like Notion, Obsidian, or Evernote require context switching away from the terminal
- **Cloud-dependent**: Sync-based tools require internet connectivity and often subscriptions
- **No linking**: Most note apps treat notes as isolated documents, missing wiki-style connections
- **Not scriptable**: GUI-only tools can't integrate into automated workflows or shell scripts

## Target User

**Alex, a backend developer** at a mid-sized tech company:
- Takes 5-10 notes daily during debugging sessions and code reviews
- Wants to link related concepts (e.g., "HTTP caching" links to "Redis" and "CDN notes")
- Works primarily in terminal (tmux, vim/neovim)
- Sometimes offline (commute, flights, cafes with spotty WiFi)
- Comfortable with markdown and command-line interfaces
- Values fast, keyboard-driven workflows
- Has basic shell scripting skills and wants to automate note queries

## Solution

A pip-installable CLI tool that:
1. Stores notes as markdown files in a configurable vault directory (human-readable, versionable with git)
2. Uses SQLite for metadata index (fast search, link tracking, tag management)
3. Supports wiki-style `[[note-title]]` linking between notes
4. Opens `$EDITOR` for editing notes (vim, neovim, emacs, etc.)
5. Outputs machine-readable formats (JSON) for scripting integration
6. Runs on any system with Python 3.10+ (no external dependencies)

## Non-Goals

- **Multi-user access**: Single user only, no authentication, no concurrent access
- **Cloud sync**: No sync, no mobile app, no web interface
- **WYSIWYG editing**: Uses `$EDITOR` environment variable, not a built-in editor
- **Rich media**: Text/markdown only, no images, no attachments
- **Encryption**: Files stored in plain text (user can encrypt vault directory externally)
- **Backup/restore over network**: Local filesystem only
- **Note deletion via CLI**: Users can delete notes manually via filesystem; the CLI focuses on creation, editing, and search (v1 scope limitation)
- **Version conflict resolution**: No optimistic locking, file locking, or merge conflict detection in v1; last-write-wins semantics apply for concurrent edits
- **Subdirectory preservation in backups**: Backup command flattens directory structure; subdirectories are not preserved when restoring
- **HTML export**: Export command supports markdown and text formats only; HTML export is not supported in v1

## Success Criteria

1. User can go from `pip install` to first note in under 2 minutes
2. Search returns results in <100ms for vaults up to 10,000 notes
3. Links can be followed instantly with immediate display
4. Works fully offline after install
5. Shell scripts can parse JSON output reliably (stable schema)
6. Note files are standard markdown, readable by any markdown viewer
