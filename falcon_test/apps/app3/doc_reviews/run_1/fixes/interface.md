# Fixes Applied to interface.md

## Changes Made

### Issue ID 2: Missing Editor Invocation Specification
**What Changed**: Added comprehensive editor invocation specification to both `new` and `edit` commands
**Content Added/Modified**:
```
5. Open in editor (fallback chain: `$VISUAL` -> `$EDITOR` -> `vim` -> `nano` -> `vi`)
   - Editor detection: Check each editor in the fallback chain using `which <editor_name>` or `shutil.which()` in Python
   - If all editors in the chain are missing, exit with error (see "Output (no editor)" below)
   - Editor invocation: Use `subprocess.call([editor_path, file_path])` to inherit stdin/stdout/stderr from parent process
   - Pass the absolute file path as the only argument to the editor command
   - Record file mtime BEFORE launching editor (using `os.path.getmtime()`)
6. On editor exit: check exit code and file modification
   - Capture editor process exit code
   - Record file mtime AFTER editor exit
   - Compare before/after mtime values: if identical (down to microsecond precision), no save occurred
   - **Note on editors that use temp files**: Some editors (like `vi` on some systems) may create temporary files during editing. The mtime comparison is on the TARGET file specified in the command, not temp files. This works because editors write to the target file on save, updating its mtime.
```

---

### Issue ID 5: Sync Command Behavior Underspecified
**What Changed**: Added detailed specifications for title reconstruction, update detection, transaction boundaries, partial failure handling, link re-parsing, and concurrent modification handling
**Content Added/Modified**:
```
1. Scan all .md files in vault directory (recursively, including subdirectories)
2. For each file: validate (text/UTF-8, content length), update/insert database record, rebuild FTS entry
   - **Title reconstruction from filename**: Remove `.md` extension, replace hyphens with spaces, title-case each word
     - Example: `my-note.md` -> "My Note"
     - Example: `http-caching.md` -> "Http Caching" (accepts slight case variations)
     - **Known limitation**: This is a LOSSY transformation. Original title "HTTP Caching" becomes filename "http-caching.md", which reconstructs to "Http Caching". The sync command accepts this title variation as equivalent to the original.
     - If reconstructed title differs from existing database title (for same filename), **prefer the reconstructed title** (filesystem is source of truth during sync)
   - **Update detection**: Compare file mtime with database `updated_at` timestamp
     - If file mtime > database `updated_at`: file was modified externally, reparse content and update database
     - If file mtime <= database `updated_at`: file unchanged, skip reparse (unless `--rebuild-fts` flag set)
     - On update: read file content, parse `[[wiki-links]]`, update database record with new content and mtime
   - **Transaction boundaries**: Each file operation is independent (no multi-file transactions)
     - If file processing fails (validation error, parse error), log warning and continue to next file
     - Database changes for successfully processed files are committed even if later files fail
3. Skip files that fail validation (binary content, exceeds 1MB, UTF-8 decode error)
4. Remove database records for deleted files (files in database but not on filesystem)
5. Clean up orphaned tags (tags with no associated notes)
   - **Link re-parsing during update**: When a file is updated, ALL existing outgoing links from that note are deleted from the `links` table, then new links are inserted based on the current file content. This ensures link accuracy even if wiki-links were added, removed, or modified.
6. **Concurrent modification handling**: NOT SUPPORTED in v1
   - Sync assumes single-user access or manual coordination
   - If external tools modify files while sync is running, behavior is undefined (may miss updates or process stale content)
   - Users should ensure vault is not being modified during sync operation
7. **Partial failure handling**: Sync continues processing remaining files even if individual files fail
   - Each file failure is logged as a warning (if `--verbose` set)
   - Final report shows count of skipped files
   - Exit code 0 if at least some files processed successfully; exit code 2 only if catastrophic failure (e.g., cannot open database)
```

---

### Issue ID 13: Backup Command Will Silently Lose Data on Filename Collisions
**What Changed**: Added mandatory pre-backup collision detection with detailed error handling to prevent silent data loss
**Content Added/Modified**:
```
**CRITICAL WARNING - Filename Collision Risk:**

If notes in different subdirectories have the same filename (e.g., `subdir1/readme.md` and `subdir2/readme.md`), the backup command will **silently lose data** by overwriting one file with the other in the flat zip archive.

**Required behavior to prevent silent data loss:**

1. **Pre-backup collision detection**: Before creating the zip file, scan all `.md` files in the vault (recursively) and build a list of basenames (filename without parent directory path)
2. **Collision check**: If any basename appears more than once, the backup MUST fail with an error
3. **Error output**:
   ```
   Error: Filename collision detected. The following files would overwrite each other in the backup:
     - subdir1/readme.md
     - subdir2/readme.md

   Please rename one of these files to ensure unique filenames across all subdirectories, then retry the backup.
   ```
4. **Exit code**: 1 (validation error)
5. **No zip file created**: If collision detected, do not create partial or empty zip file

**Alternative mitigation (if collision detection not implemented in v1):**
- Users should ensure unique filenames across all subdirectories before running backup
- After restore, use the `sync` command to reindex and manually recover any lost files from source control
```

---

## Summary
- Issues fixed: 3
- Sections added: 0 (all changes were additions to existing sections)
- Sections modified: 4 (`new` command behavior, `edit` command behavior, `sync` command behavior, `backup` command warning section)

## Key Improvements
1. **Editor invocation**: Now fully specified with detection logic, process invocation, stdin/stdout/stderr inheritance, filename passing, mtime comparison, and temp file handling
2. **Sync command**: Resolved circular dependency with explicit lossy transformation acknowledgment, specified mtime-based update detection, clarified transaction boundaries, defined partial failure handling, specified link re-parsing behavior, and documented concurrent modification limitations
3. **Backup collision protection**: Added mandatory pre-backup collision detection to prevent silent data loss, with detailed error output and exit code specification
