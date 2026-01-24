# Architecture Feasibility Judge Evaluation

## Summary

| Issue # | Title | Classification |
|---------|-------|----------------|
| 1 | FTS5 External Content Transaction Guarantees | NON_BLOCKING |
| 2 | Wiki Link Character Mismatch Creates Broken Links By Design | BLOCKING |
| 3 | Optimistic Concurrency Control Without Actual Conflict Detection | BLOCKING |
| 4 | FTS5 Search Sanitization May Break Legitimate Queries | NON_BLOCKING |
| 5 | Database Permissions Check Happens After File Creation | NON_BLOCKING |
| 6 | Sync Command Destructive Rename Handling | BLOCKING |
| 7 | Backup Command Will Silently Lose Data on Filename Collisions | BLOCKING |
| 8 | Editor Exit Code Handling is Underspecified | NON_BLOCKING |

## Issue Details

### Issue 1: FTS5 External Content Transaction Guarantees

**Scout's Assessment:**
> This is a fundamental architectural tension, not a fatal flaw. The architecture should explicitly acknowledge this limitation and document a consistent strategy: Accept eventual consistency or implement file locking. The current design tries to have it both ways - claiming transactional atomicity while using external file storage. Pick one approach and document it clearly.

**Classification:** NON_BLOCKING

**Reasoning:**
This is an architectural clarity issue, not a blocking flaw. For a single-user CLI tool, eventual consistency is acceptable. The scout correctly identifies this as a documentation gap rather than a showstopper. Implementers can proceed with either consistency strategy and document the chosen approach during implementation.

---

### Issue 2: Wiki Link Character Mismatch Creates Broken Links By Design

**Scout's Assessment:**
> This is not a limitation - it's a design flaw that will cause constant user frustration. The system allows users to create notes with titles containing parentheses, apostrophes, periods, etc. (common in real note titles like "John's Notes", "API v2.0", "Meeting (Q1 2024)"), but then silently breaks linking to those notes. The security rationale is flawed: you can validate link targets to prevent path traversal WITHOUT restricting the character set to alphanumeric-only.

**Classification:** BLOCKING

**Reasoning:**
This is a core functionality defect. Wiki linking is a fundamental feature, and having notes that cannot be linked to by design is unacceptable. Users will naturally create notes with common characters like parentheses and apostrophes, then discover their wiki isn't actually linked. This must be resolved before implementation - either restrict titles to match links, expand link validation, or fail fast on incompatible titles.

---

### Issue 3: Optimistic Concurrency Control Without Actual Conflict Detection

**Scout's Assessment:**
> This is broken as designed. The architecture should either remove the conflict detection entirely and document "last-write-wins, no detection" (honest but risky), implement actual file locking (mentioned but rejected, would actually work), use a different editor integration strategy (create temp file, check original hasn't changed, atomic rename), or document this as a known limitation: "Concurrent edits will result in data loss with no prevention mechanism". The current approach gives false confidence - users think they have conflict detection, but it's security theater that doesn't prevent data loss.

**Classification:** BLOCKING

**Reasoning:**
The documented conflict detection does not actually prevent data loss. Users are given false confidence that conflicts will be handled, but both concurrent edits will succeed and one user's work will be silently lost. This is a data integrity issue that must be resolved - either implement real locking, use temp-file-then-atomic-rename approach, or honestly document that concurrent edits cause data loss.

---

### Issue 4: FTS5 Search Sanitization May Break Legitimate Queries

**Scout's Assessment:**
> This is a fixable bug in the sanitization strategy. The correct approach: escape internal quotes by doubling, wrap in quotes - this makes ALL special chars literal, DO NOT strip * or ^ - they're literal inside quotes. The documentation says "no escape sequence exists for *" but that's misleading: double-quote wrapping IS the escape mechanism.

**Classification:** NON_BLOCKING

**Reasoning:**
This is a bug in the documented sanitization strategy that can be easily fixed during implementation. The correct fix is straightforward (don't strip characters when wrapping in quotes), and implementers can identify and apply this fix. It affects search quality but doesn't block core functionality or architecture.

---

### Issue 5: Database Permissions Check Happens After File Creation

**Scout's Assessment:**
> This is a minor issue for a single-user local tool, but the documentation should be honest about limitations: Umask approach is correct for initial file creation, remove the chmod call OR acknowledge it's a race condition mitigation not "defense in depth", document that SQLite creates auxiliary files which may need separate permission handling, and document that on some filesystems Unix permissions don't apply - vault encryption at filesystem level is the real solution. The current design claims atomic security that doesn't exist on all platforms.

**Classification:** NON_BLOCKING

**Reasoning:**
For a single-user local CLI tool, the umask approach provides sufficient security. The documentation contradiction is a clarity issue, not a functional blocker. The real security concern (filesystem-level encryption for sensitive data) is acknowledged. Implementers can proceed with the documented approach and note the limitations.

---

### Issue 6: Sync Command Destructive Rename Handling

**Scout's Assessment:**
> This needs one of: content-based rename detection (hash note content, detect when same content appears under new filename like git does), metadata-based ID (store UUID in markdown file frontmatter, sync uses this as stable ID), explicit rename command (provide `notes-cli rename` that updates backlinks atomically), or better documentation (prominently warn that renaming files breaks links). The current design makes a system that claims to be "standard markdown files, usable with any tool" but then breaks if you actually use standard tools to manipulate those files.

**Classification:** BLOCKING

**Reasoning:**
This is a data loss issue in a common workflow. The system explicitly claims to be "human-readable, versionable with git" but renaming files (a normal git workflow) destroys metadata and breaks backlinks. At minimum, the architecture must provide a rename command that preserves metadata, or implement content-hash-based rename detection. Users cannot reasonably avoid this issue.

---

### Issue 7: Backup Command Will Silently Lose Data on Filename Collisions

**Scout's Assessment:**
> This is a data loss bug disguised as a "known limitation". The backup command should: detect collisions BEFORE creating the backup (scan all files, build a map of basenames, error if duplicates found), preserve directory structure (include subdirectories in the zip), use a different naming scheme (flatten but use hash-based unique names), or at minimum count files scanned vs files added to zip and error if they differ. The current design will cause silent data loss, which is unacceptable for a backup feature. Users will discover months later that their backups are incomplete.

**Classification:** BLOCKING

**Reasoning:**
Silent data loss in a backup feature is unacceptable. Users will discover months later that their backups are incomplete. The backup command must either: preserve directory structure in the zip, detect and error on collisions before writing, or use content-hash-based unique names. This is a core reliability issue for a backup feature.

---

### Issue 8: Editor Exit Code Handling is Underspecified

**Scout's Assessment:**
> This is a logic error that will cause user frustration. The boolean OR should be AND with proper case handling. A non-zero exit code should only cancel if the file wasn't written. Additionally, mtime-based detection is fragile (filesystem latency, identical content, etc.). A better approach: read file content before and after, compare content hashes, only cancel if content unchanged AND exit_code suggests cancellation.

**Classification:** NON_BLOCKING

**Reasoning:**
This is a logic bug that can be fixed during implementation. The correct behavior is documented in the scout report (use AND logic, check content hash). While it will cause user frustration if not fixed, the fix is straightforward and implementers can identify the correct logic. It does not block the overall architecture.

---

## Statistics

- Total issues: 8
- Blocking: 4
- Non-blocking: 4
