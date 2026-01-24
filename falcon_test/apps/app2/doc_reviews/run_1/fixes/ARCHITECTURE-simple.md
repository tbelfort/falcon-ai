# Fixes Applied to ARCHITECTURE-simple.md

## Changes Made

### Gap ID 1: TOCTOU Race Condition Mitigation Incomplete in Path Validation (HIGH/BLOCKING)
**What Changed**: Added explicit coordination pattern documentation showing the required calling sequence: validate_path() -> safe_open_file() -> use fd. Added security rationale explaining why callers MUST immediately pass validated paths to safe_open_file() and use only the file descriptor afterward.
**Lines Affected**: 247-254
**Content Added/Modified**:
```
**Coordination Pattern:** Callers MUST follow this sequence:
1. Call `validate_path()` to get a validated path (string)
2. IMMEDIATELY pass the validated path to `safe_open_file()` to get a file descriptor
3. Use the file descriptor for all operations (do NOT use the path string after opening)

**Security Rationale:** The validate_path() function returns a string path, not a file descriptor. Between validation and opening, an attacker could potentially swap a symlink. The safe_open_file() function closes this window by using os.open() with appropriate flags and immediately returning a file descriptor. Callers MUST use the fd for all subsequent operations.
```

### Gap ID 4: URL Decoding Loop Could Cause Denial of Service (HIGH/BLOCKING)
**What Changed**: Replaced unbounded while loop with bounded for loop (max 10 iterations). Added explicit error when iteration limit is exceeded to prevent DoS from maliciously crafted inputs with excessive encoding layers.
**Lines Affected**: 208-217
**Content Added/Modified**:
```python
# Maximum 10 iterations to prevent DoS from deeply nested encoding
decoded_path = path
max_iterations = 10
for iteration in range(max_iterations):
    new_decoded = urllib.parse.unquote(decoded_path)
    if new_decoded == decoded_path:
        break
    decoded_path = new_decoded
else:
    # Exceeded iteration limit
    raise ValidationError("Path contains excessive URL encoding layers (possible DoS attempt)")
```

### Gap ID 2: Symlink Check in safe_open_file Creates TOCTOU Window (MEDIUM/NON_BLOCKING)
**What Changed**: Added explicit note acknowledging that the os.path.islink() check in safe_open_file() is defense-in-depth, not the primary security mechanism. Clarified that the primary defense against symlink attacks is the realpath() resolution in validate_path().
**Lines Affected**: 282-288
**Content Added/Modified**:
```
NOTE ON DEFENSE-IN-DEPTH: The validate_path() function already resolves symlinks
via os.path.realpath(), so by the time we reach safe_open_file(), the path
should be the resolved absolute path. The islink() check here is defense-in-depth,
NOT the primary security mechanism. It provides additional protection against
symlinks created between validation and opening. The primary defense against
path traversal and symlink attacks is the realpath() resolution in validate_path().
```

## Summary
- Gaps addressed: 3 (all identified gaps)
- Sections added: 2 (Coordination Pattern, Security Rationale)
- Sections modified: 2 (URL decoding loop, defense-in-depth note)
- Total edits: 3

All HIGH/BLOCKING and MEDIUM/NON_BLOCKING gaps have been resolved with minimal changes to preserve existing content and style.
