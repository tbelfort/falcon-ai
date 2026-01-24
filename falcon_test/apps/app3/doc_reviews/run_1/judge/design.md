# Design Completeness Judge Evaluation

## Summary

| Issue # | Title | Classification |
|---------|-------|----------------|
| 1 | Missing Editor Invocation Specification | BLOCKING |
| 2 | FTS5 Query Sanitization Implementation Ambiguity | NON_BLOCKING |
| 3 | Sync Command Behavior Underspecified | BLOCKING |
| 4 | Link Character Set Mismatch Unresolved | NON_BLOCKING |
| 5 | Filename Collision Detection Incomplete | NON_BLOCKING |
| 6 | Database Permissions Enforcement Platform Variance | NON_BLOCKING |
| 7 | Transaction Rollback and File Operations Inconsistency | BLOCKING |
| 8 | Open Editor Function Not Specified | BLOCKING |
| 9 | Snippet Sanitization Not Integrated Into Query Specification | NON_BLOCKING |
| 10 | Orphan Tag Cleanup During Sync Not Specified | NON_BLOCKING |

## Issue Details

### Issue 1: Missing Editor Invocation Specification

**Scout's Assessment:**
> Likely to block implementation. Without knowing the exact editor invocation pattern, developers will make different choices that could lead to bugs (e.g., editors not found when they should be, incorrect cancellation detection, race conditions with mtime).

**Classification:** BLOCKING

**Reasoning:**
This is a core functionality that multiple commands depend on (new, edit). The missing details around editor detection (which system call?), process handling (stdin/stdout inheritance), and cancellation detection (mtime comparison logic, temp file handling) are fundamental implementation choices. Different developers would make incompatible decisions, leading to bugs in cancellation detection and editor invocation. The editor integration is not a peripheral feature - it is central to the user experience of creating and editing notes.

---

### Issue 2: FTS5 Query Sanitization Implementation Ambiguity

**Scout's Assessment:**
> Moderate implementation blocker. The search command will work, but behavior will vary depending on developer choice. Could lead to user confusion ("why doesn't my search for 'C++' work?") and inconsistent security posture.

**Classification:** NON_BLOCKING

**Reasoning:**
Option A is explicitly marked as RECOMMENDED, which provides sufficient guidance for implementers. While the spec does not mandate a single approach, the clear recommendation is adequate direction. The prefix matching flag absence is a minor gap that does not affect core search functionality. Implementers can reasonably proceed with Option A as the recommended approach, and the search will function correctly. The UX difference for edge cases like "C++" can be documented and addressed in user documentation or future iterations.

---

### Issue 3: Sync Command Behavior Underspecified

**Scout's Assessment:**
> Major implementation blocker. The sync command is critical for database recovery and cannot be implemented without knowing how to map filenames back to titles. This is a circular dependency: titles become filenames (one-way lossy transformation), but sync needs to reverse it.

**Classification:** BLOCKING

**Reasoning:**
The scout correctly identifies a fundamental architectural flaw: titles are sanitized to filenames via a lossy one-way transformation ("My Note!" and "My Note?" both become "my-note.md"), but sync needs to reverse this to reconstruct titles from the filesystem. This is mathematically impossible without storing additional metadata (e.g., the original title in the file itself, or a separate manifest file). The sync command is critical for database recovery and data integrity. Implementation cannot proceed without resolving this architectural gap - this requires a design decision, not just implementation details.

---

### Issue 4: Link Character Set Mismatch Unresolved

**Scout's Assessment:**
> Moderate blocker. The system will work, but users will encounter unexpected behavior with no clear explanation. The UX is underspecified.

**Classification:** NON_BLOCKING

**Reasoning:**
This is explicitly documented as a known limitation with a workaround provided ("Users should use only alphanumeric characters, spaces, hyphens, and underscores in note titles if they intend to link to those notes"). The core functionality works correctly - notes can be created with any title, and links can be created within the restricted character set. The security rationale is explained (preventing path traversal and injection attacks). The UX improvements (warnings when creating unlinkable titles, better error messages) are valuable enhancements but are not required for a functional v1 implementation.

---

### Issue 5: Filename Collision Detection Incomplete

**Scout's Assessment:**
> Minor-to-moderate blocker. The validation logic works but UX is poor. Users will be confused by filename collision errors and won't understand how to resolve them.

**Classification:** NON_BLOCKING

**Reasoning:**
The core validation logic is fully specified: check both title uniqueness AND filename uniqueness, raise DuplicateNoteError for violations. The database schema enforces UNIQUE constraints on both columns, ensuring data integrity. The missing details (showing which note causes the collision, suggesting alternatives) are UX improvements that enhance the user experience but do not block basic functionality. The system will correctly prevent collisions and maintain data integrity; the error messages can be improved iteratively based on user feedback.

---

### Issue 6: Database Permissions Enforcement Platform Variance

**Scout's Assessment:**
> Minor blocker. Core functionality works on Unix, but Windows and edge case behavior is ambiguous. Could lead to security issues if permissions are not enforced consistently.

**Classification:** NON_BLOCKING

**Reasoning:**
Unix behavior is fully specified with clear, copy-paste implementation code (umask approach with chmod verification). Windows is explicitly documented as a platform limitation where "Unix permissions do not apply." While the Windows guidance could be more specific, this provides sufficient direction for v1: implement Unix permissions as specified, and on Windows, either skip permission enforcement with a logged warning or investigate NTFS ACLs as a follow-up. Network share edge cases (NFS/SMB) are not common use cases for a personal notes CLI tool. The core security posture is maintained on the primary target platform (Unix/macOS/Linux).

---

### Issue 7: Transaction Rollback and File Operations Inconsistency

**Scout's Assessment:**
> Major implementation blocker. Without a clear strategy for maintaining consistency between filesystem and database operations, different developers will implement different approaches (some may leave orphaned files, others may leave orphaned DB records). The system could end up in an inconsistent state.

**Classification:** BLOCKING

**Reasoning:**
This is a fundamental architectural decision that affects every command that modifies both files and database (new, edit, delete). The scout correctly identifies this as a classic distributed transaction (2-phase commit) problem. Without a clear strategy (e.g., "always write file first, then database, with compensating rollback on DB failure" or "database first, file second, with file cleanup on failure"), different implementations will be inconsistent. While cmd_sync() is mentioned as a recovery mechanism, the prevention strategy is essential for predictable behavior. This requires an explicit design decision about the order of operations and failure handling.

---

### Issue 8: Open Editor Function Not Specified

**Scout's Assessment:**
> Major implementation blocker. Multiple commands depend on this function (cmd_new(), cmd_edit()), and without a clear specification, each developer will implement it differently, leading to inconsistent behavior.

**Classification:** BLOCKING

**Reasoning:**
This issue is closely related to Issue 1 but focuses on the API contract rather than implementation mechanics. The open_editor() function is referenced in pseudocode examples for multiple commands but is not defined anywhere: no module location (should it be in a new editor.py?), no return type specification (what is the EditorResult dataclass?), no interface contract (beyond .cancelled, what other properties exist?). This is critical shared infrastructure that multiple commands depend on. Without a defined interface, cmd_new() and cmd_edit() cannot be implemented in a testable, consistent manner.

---

### Issue 9: Snippet Sanitization Not Integrated Into Query Specification

**Scout's Assessment:**
> Moderate blocker. The sanitization function is defined but not integrated into the data flow. Developers might skip this step, leading to XSS vulnerabilities if output is ever rendered in a web context (even though v1 is CLI-only, the spec mentions "defense in depth").

**Classification:** NON_BLOCKING

**Reasoning:**
The security function itself is well-defined with clear, complete implementation code. The integration question (which layer calls it?) is a design choice that can be reasonably made during implementation. formatters.py is the natural location since it handles output formatting - this is implied by the context. The v1 is CLI-only, so XSS is not an immediate attack vector; the sanitization is defense-in-depth for potential future web rendering. While clarifying the integration point would be helpful, it does not block implementation. A reasonable implementer would place this in the output formatting layer.

---

### Issue 10: Orphan Tag Cleanup During Sync Not Specified

**Scout's Assessment:**
> Minor blocker. The feature is clear but implementation details are missing. Different developers will implement different approaches (some may report deleted tags, others won't; some may do it in separate transaction).

**Classification:** NON_BLOCKING

**Reasoning:**
The requirement is clear and well-understood: delete tags that have no associated notes. The SQL query is straightforward and any experienced developer would write something like: `DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)`. This is a standard database cleanup pattern. The missing details (whether to report deleted tags to users, transaction boundaries) are minor variations that do not affect correctness of the operation. These details can be implemented reasonably and refined based on user feedback or during code review.

---

## Statistics

- Total issues: 10
- Blocking: 4
- Non-blocking: 6
