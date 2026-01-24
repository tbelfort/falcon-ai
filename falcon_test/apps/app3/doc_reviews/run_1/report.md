# Design Readiness Report

**App**: falcon_test/apps/app3
**Run**: 1
**Date**: 2026-01-23
**Docs Path**: falcon_test/apps/app3/docs

## Status: READY_FOR_SPEC

All blocking issues have been resolved. The documentation is now ready for spec creation.

---

## Summary

| Metric | Count |
|--------|-------|
| Total Issues | 18 |
| Blocking | 8 |
| Non-Blocking | 10 |
| Fixed | 8 |

---

## Blocking Issues (Fixed)

### Issue #2: Missing Editor Invocation Specification
**Category**: design
**Files**: `components.md`, `interface.md`

**Problem:**
The documentation does not specify how to check if editors exist in the fallback chain, what happens if all editors are missing, whether the editor process inherits stdin/stdout/stderr, how to pass the filename, the exact mtime comparison logic, or how to handle editors that create temp files.

**Relevant Text (from scout):**
> Editor Integration: $EDITOR / $VISUAL - Fallback chain: $VISUAL -> $EDITOR -> vim -> nano -> vi. Integration: subprocess.call() for synchronous editing

**Judge's Reasoning:**
> This is a core functionality that multiple commands depend on (new, edit). The missing details around editor detection, process handling, and cancellation detection are fundamental implementation choices.

**Fix Applied:**
Added complete `editor.py` module specification with `EditorResult` dataclass, `open_editor()` function signature, editor detection logic, process invocation details, and mtime-based cancellation detection.

---

### Issue #4: Wiki Link Character Mismatch Creates Broken Links By Design
**Category**: feasibility
**Files**: `components.md`

**Problem:**
Note titles allow more characters than wiki link targets. Notes titled "My Note (2024)" or "John's Notes" cannot be linked to because parentheses/apostrophes fail link validation.

**Relevant Text (from scout):**
> Note titles allow more characters than wiki link targets. Title validation allows: ^[^/\:*?"<>|]{1,200}$ while link targets allow only: ^[A-Za-z0-9 _-]+$

**Judge's Reasoning:**
> This is a core functionality defect. Wiki linking is a fundamental feature. Must be resolved - either restrict titles to match links, expand link validation, or fail fast on incompatible titles.

**Fix Applied:**
Aligned title validation with link target validation by restricting titles to `^[A-Za-z0-9 _-]+$`. All notes can now be linked to by design.

---

### Issue #5: Sync Command Behavior Underspecified
**Category**: design
**Files**: `interface.md`, `schema.md`

**Problem:**
Critical issues: Cannot reconstruct note title from sanitized filename (lossy transformation), update detection method unspecified, transaction boundaries unclear, partial failure handling unspecified.

**Relevant Text (from scout):**
> Scan all .md files in vault directory. For each file: validate, update/insert database record, rebuild FTS entry. Remove database records for deleted files.

**Judge's Reasoning:**
> The scout correctly identifies a circular dependency: titles are sanitized to filenames (lossy one-way transformation), but sync needs to reverse this to reconstruct titles.

**Fix Applied:**
Added comprehensive sync specifications: database as source of truth for title reconstruction, mtime-based update detection, per-file transaction boundaries, error isolation with continue-on-failure, and explicit link re-parsing behavior.

---

### Issue #6: Optimistic Concurrency Control Without Actual Conflict Detection
**Category**: feasibility
**Files**: `technical.md`

**Problem:**
The conflict detection strategy checks mtime AFTER the editor exits, but the editor already writes the file before exiting. Both concurrent edits will succeed and one user's work is silently lost.

**Relevant Text (from scout):**
> Before saving, check if file mtime has changed since edit started... If conflict detected, last write wins BUT user is warned

**Judge's Reasoning:**
> The documented conflict detection does not actually prevent data loss. Users are given false confidence.

**Fix Applied:**
Replaced with temp-file-then-atomic-rename strategy. User edits a temp copy, original remains unchanged until content-hash conflict check passes, then atomic rename commits the change.

---

### Issue #11: Sync Command Destructive Rename Handling
**Category**: feasibility
**Files**: `schema.md`

**Problem:**
When a file is renamed externally, the old filename is treated as deleted and the new filename as a new note, destroying all metadata and breaking backlinks.

**Relevant Text (from scout):**
> The sync command does NOT implement rename detection in v1. When a file is renamed externally: The old filename is treated as deleted, the new filename is treated as a new note.

**Judge's Reasoning:**
> Data loss issue in a common workflow. The system claims to be "versionable with git" but renaming files destroys metadata.

**Fix Applied:**
Added required `rename` command specification that preserves metadata and updates backlinks atomically. External file renames are documented as unsupported with clear guidance.

---

### Issue #13: Backup Command Will Silently Lose Data on Filename Collisions
**Category**: feasibility
**Files**: `interface.md`

**Problem:**
Backup flattens subdirectories. If notes in different subdirectories have the same filename, one overwrites the other silently.

**Relevant Text (from scout):**
> Flat directory with all .md files... Warning: If notes in different subdirectories have the same filename, the backup will overwrite one with the other.

**Judge's Reasoning:**
> Silent data loss in a backup feature is unacceptable. Users will discover months later that their backups are incomplete.

**Fix Applied:**
Added mandatory collision detection before backup creation. Command must scan for duplicate basenames and error with specific collision details before creating any zip file.

---

### Issue #14: Transaction Rollback and File Operations Inconsistency
**Category**: design
**Files**: `technical.md`

**Problem:**
Database transactions can rollback but filesystem operations cannot. No specification for cleanup on failure scenarios.

**Relevant Text (from scout):**
> Each command is a single transaction. Either fully succeeds or fully fails. File operations and database updates SHOULD be in the same transaction where possible.

**Judge's Reasoning:**
> Fundamental architectural decision affecting every command that modifies both files and database. Without a clear strategy, implementations will be inconsistent.

**Fix Applied:**
Added AD10: File-first strategy with compensating actions. Perform filesystem operations first, then database transaction, with explicit rollback procedures on failure for each command type.

---

### Issue #15: Open Editor Function Not Specified
**Category**: design
**Files**: `components.md`

**Problem:**
The `open_editor()` function is referenced but never defined. Missing module location, return type, and interface contract.

**Relevant Text (from scout):**
> editor_result = open_editor(filepath); if editor_result.cancelled: return. The function is not listed in the components.md module overview.

**Judge's Reasoning:**
> Critical shared component used by multiple commands. Without a defined interface contract, there is no way to implement this function consistently.

**Fix Applied:**
Added `editor.py` module to component overview with complete `EditorResult` dataclass and `open_editor()` function specification.

---

## Non-Blocking Issues (Reported Only)

These issues were identified but do not block implementation. Consider addressing them during or after implementation.

### Issue #1: FTS5 External Content Transaction Guarantees
**Category**: feasibility
**Files**: `schema.md`

**Problem:**
The architecture assumes FTS5 transactions are atomic with filesystem writes, but a TOCTOU gap exists between file writes and database updates.

**Judge's Reasoning:**
> Architectural clarity issue, not a blocking flaw. For a single-user CLI tool, eventual consistency is acceptable.

---

### Issue #3: FTS5 Query Sanitization Implementation Ambiguity
**Category**: design
**Files**: `schema.md`

**Problem:**
Two sanitization options provided without mandating which to implement.

**Judge's Reasoning:**
> Option A is explicitly marked as RECOMMENDED, which provides sufficient guidance.

---

### Issue #7: FTS5 Search Sanitization May Break Legitimate Queries
**Category**: feasibility
**Files**: `schema.md`

**Problem:**
Stripping asterisks and carets breaks legitimate searches for "C++" or math formulas.

**Judge's Reasoning:**
> Bug in the documented sanitization strategy that can be easily fixed during implementation.

---

### Issue #8: Link Character Set Mismatch Unresolved
**Category**: design
**Files**: `components.md`

**Problem:**
No guidance on warning users when creating unlinkable titles.

**Judge's Reasoning:**
> Documented as a known limitation with explicit workaround. UX improvements can be added as enhancements.

---

### Issue #9: Filename Collision Detection Incomplete
**Category**: design
**Files**: `ARCHITECTURE-simple.md`

**Problem:**
Missing error message showing conflicting note title and alternative suggestions.

**Judge's Reasoning:**
> Core validation logic is specified. Missing details are UX improvements that do not block basic functionality.

---

### Issue #10: Database Permissions Check Happens After File Creation
**Category**: feasibility
**Files**: `schema.md`

**Problem:**
Documentation contradiction: claims "no race window" with umask, then uses chmod "defense in depth".

**Judge's Reasoning:**
> For a single-user local CLI tool, the umask approach provides sufficient security.

---

### Issue #12: Database Permissions Enforcement Platform Variance
**Category**: design
**Files**: `schema.md`

**Problem:**
Windows behavior unspecified. Network share (NFS/SMB) behavior undefined.

**Judge's Reasoning:**
> Unix behavior is fully specified. Windows documented as platform limitation. Sufficient for v1.

---

### Issue #16: Editor Exit Code Handling is Underspecified
**Category**: feasibility
**Files**: `interface.md`

**Problem:**
OR logic for cancellation is too aggressive. Non-zero exit code should only cancel if file wasn't written.

**Judge's Reasoning:**
> Logic bug that can be fixed during implementation. The fix is straightforward.

---

### Issue #17: Snippet Sanitization Not Integrated Into Query Specification
**Category**: design
**Files**: `schema.md`

**Problem:**
`sanitize_snippet()` function defined but integration point (which module calls it) not specified.

**Judge's Reasoning:**
> The security function is well-defined. Integration is a design choice for implementation.

---

### Issue #18: Orphan Tag Cleanup During Sync Not Specified
**Category**: design
**Files**: `interface.md`

**Problem:**
Missing SQL query for orphan detection, transaction boundaries, and user reporting details.

**Judge's Reasoning:**
> The requirement is clear. The SQL query is straightforward. Implementers can make reasonable decisions.

---

## Audit Trail

- Scout reports: `falcon_test/apps/app3/doc_reviews/run_1/scouts/`
- Judge evaluations: `falcon_test/apps/app3/doc_reviews/run_1/judge/`
- Fix summaries: `falcon_test/apps/app3/doc_reviews/run_1/fixes/`
