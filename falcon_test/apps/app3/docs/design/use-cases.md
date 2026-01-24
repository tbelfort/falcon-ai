# Use Cases: Note-taking/Wiki CLI

## UC1: Initial Setup

**Actor**: Developer setting up note-taking for the first time

**Flow**:
1. Install tool: `pip install notes-cli`
2. Initialize vault: `notes-cli init --vault ~/.notes`
3. Verify: vault directory created with `.notes.db` inside

**Success**: Vault directory created, database initialized, ready to accept notes

**Failure modes**:
- Vault path not writable -> clear error message, exit 5
- Vault already exists -> refuse without `--force`, exit 5 (VaultError)
- Path contains `..` -> reject for security, exit 1

---

## UC2: Creating a New Note

**Actor**: Developer during debugging session

**Flow**:
1. Create note: `notes-cli new "Redis caching issues"`
2. `$EDITOR` opens with template containing `# Redis caching issues`
3. Write content, including `[[related-note]]` links
4. Save and exit editor
5. Note indexed in database, links parsed and stored

**Success**: Note file created as `redis-caching-issues.md`, indexed in database, timestamp recorded

**Failure modes**:
- Title already exists -> suggest unique title, exit 4
- Invalid characters in title -> sanitize or reject with clear message, exit 1
- `$EDITOR` not set -> error with helpful message listing fallbacks attempted, exit 1
- Vault not initialized -> error suggesting `notes-cli init`, exit 5

---

## UC3: Linking Notes Together

**Actor**: Developer connecting related concepts

**Flow**:
1. Edit existing note: `notes-cli edit "Redis caching issues"`
2. Add wiki-style links: `See also [[HTTP caching]] and [[CDN setup]]`
3. Save and exit editor
4. Links parsed and stored in database (bidirectional tracking)

**Success**: Links tracked in database, visible in both directions

**Failure modes**:
- Linked note doesn't exist -> show warning (not error), create placeholder link in database
- Note being edited doesn't exist -> exit 3

**Circular Link Detection:**
- Circular links (A -> B -> C -> A) ARE allowed in the database (valid use case for related concepts)
- The `links` command MUST detect and warn about circular references when displaying links
- Detection algorithm: depth-first traversal from target note, checking for cycles
- Maximum traversal depth: 100 (to prevent infinite loops on very deep chains)
- Output format when circular link detected:
  ```
  Warning: Circular link detected: My Note -> Redis -> HTTP Caching -> My Note
  ```

---

## UC4: Searching Notes

**Actor**: Developer looking for specific information

**Flow**:
1. Search by content: `notes-cli search "kubernetes deploy"`
2. Review results with context snippets showing matches
3. Choose note to view: `notes-cli show "K8s deployment guide"`

**Success**: Full-text matches shown with context snippets, sorted by relevance

**Failure modes**:
- No matches -> empty results, exit 0 (success, not error)
- Search query empty -> error, show usage, exit 1
- Database not found -> error suggesting init, exit 5

---

## UC5: Tagging and Organization

**Actor**: Developer organizing notes by topic

**Flow**:
1. Add tags: `notes-cli tag add "Redis caching" --tags "database,performance"`
2. List notes by tag: `notes-cli list --tag database`
3. View all tags: `notes-cli tag list`
4. Remove tag: `notes-cli tag remove "Redis caching" --tags "performance"`

**Success**: Tags added/removed, queryable via tag search, tag counts visible

**Failure modes**:
- Note not found -> exit 3
- Tag name invalid (special characters) -> sanitize or reject with clear message, exit 1
- Tag not found on note during removal -> no error (idempotent)

---

## UC6: Following Wiki Links

**Actor**: Developer exploring connected notes

**Flow**:
1. Show note: `notes-cli show "Redis caching"`
2. See outgoing links (`[[HTTP caching]]`) and incoming links (backlinks)
3. View link details: `notes-cli links "Redis caching"`
4. Navigate to linked note: `notes-cli show "HTTP caching"`

**Success**: Note content displayed with lists of outgoing and incoming links, broken links marked

**Failure modes**:
- Dead link (target note deleted) -> show as broken link, not error
- Note not found -> exit 3

---

## UC7: Backup and Export

**Actor**: Developer backing up notes before system change

**Flow**:
1. Backup entire vault: `notes-cli backup --output ~/backup.zip`
2. Verify backup: `unzip -l ~/backup.zip` shows all `.md` files and `.notes.db`
3. Export single note: `notes-cli export "Redis caching" --output ~/redis-notes.md`

**Success**: All notes and database exported to archive, preserving structure

**Failure modes**:
- Output path exists -> require `--force` to overwrite, exit 1
- Path contains `..` -> reject for security, exit 1
- Not enough disk space -> clear error message, exit 1
- Note not found for export -> exit 3
