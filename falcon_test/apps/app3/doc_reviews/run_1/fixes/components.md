# Fixes Applied to components.md

## Changes Made

### Issue ID 2: Missing Editor Invocation Specification
**What Changed**: Added complete `editor.py` module specification with `EditorResult` dataclass and `open_editor()` function
**Content Added/Modified**:
```python
# New module: editor.py
@dataclass
class EditorResult:
    """Result of editor invocation."""
    cancelled: bool  # True if user cancelled (no changes made)
    content: str | None  # Edited content (None if cancelled)
    error: str | None  # Error message if editor failed (None on success)

def open_editor(filepath: str, initial_content: str = "") -> EditorResult:
    """Open external editor for file editing."""
```

**Specifications added:**
- **Editor detection**: `find_editor()` checks fallback list `["vim", "nano", "vi"]` using `shutil.which()`
- **Missing editors**: Raises `VaultError("No text editor found. Install vim, nano, or vi.")`
- **Process invocation**: `subprocess.run([editor, filepath], check=False)` with inherited stdin/stdout/stderr
- **Filename passing**: Passed as positional argument to editor command
- **Cancellation detection**: Compares mtime before/after and checks if content unchanged
- **mtime logic**: `mtime_before == mtime_after AND content == initial_content` indicates cancellation
- **Temp files**: No special handling needed - monitors target file's mtime only
- **Error handling**: Returns `EditorResult` with `error` field set on process failures

### Issue ID 4: Wiki Link Character Mismatch Creates Broken Links By Design
**What Changed**: Changed title validation to match link target validation, resolving character set mismatch
**Content Added/Modified**:
```python
# Updated title validation in models.py
VALID_TITLE_PATTERN = re.compile(r'^[A-Za-z0-9 _-]+$')

def validate_title(title: str) -> str:
    """Validate note title.

    Only alphanumeric, spaces, hyphens, and underscores allowed.
    """
    # ... validation logic matching link target rules
```

**Change rationale**:
- Previous design allowed titles like "My Note (2024)" but disallowed `[[My Note (2024)]]` links
- New design restricts titles to alphanumeric, spaces, hyphens, underscores only
- Ensures all notes can be linked to by design
- Maintains security posture (prevents path traversal/injection)

### Issue ID 15: Open Editor Function Not Specified
**What Changed**: Added complete specification for `open_editor()` function as part of new `editor.py` module (same as Issue ID 2)
**Content Added/Modified**:
- Module location: `notes_cli/editor.py`
- Return type: `EditorResult` dataclass with `.cancelled`, `.content`, `.error` properties
- Function signature: `open_editor(filepath: str, initial_content: str = "") -> EditorResult`
- Dependencies: `models`, `exceptions`
- Updated `commands.py` dependencies to include `editor`
- Updated dependency graph to show `editor.py` position

---

## Summary
- **Issues fixed**: 3
- **Sections added**: 1 (new `editor.py` component specification)
- **Sections modified**: 3 (Module Overview, Known Limitation resolved, Dependency Graph)
- **Total edits**: 5

All blocking issues have been resolved with complete specifications that provide implementation-ready details.
