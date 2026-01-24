# Fixes Applied to falcon_test/apps/app2/docs/design/technical.md

## Changes Made

### Gap ID 17: Database file permissions enforcement undefined
**What Changed**: Added comprehensive specification of how database file permissions (0600) are enforced, clarifying the division of responsibilities between the application and the user.

**Lines Affected**: Lines 251-265 (Security Considerations section, item 5)

**Content Added/Modified**:
```markdown
5. **Financial Data Protection**: Database files MUST have restrictive permissions (0600) to prevent unauthorized access
   - **Enforcement**: The `safe_open_file()` function (defined in ARCHITECTURE-simple.md S2) automatically sets mode `0o600` when creating new files with write mode, ensuring proper permissions are applied atomically during file creation
   - **Application responsibility**: The `init` command and any database operations MUST use `safe_open_file()` for file creation to guarantee correct permissions
   - **Runtime checks**: The application does NOT check permissions of existing database files on open - permission setting occurs only during file creation
   - **User responsibility**: Users opening pre-existing database files are responsible for verifying proper permissions are already set (e.g., via `chmod 600 finance.db` before first use)
   - **Security note**: Never log transaction details or other financial data to logs or error messages
```

**Rationale**: The gap noted that while technical.md mentioned 0600 permissions as a "should", it didn't specify HOW this was enforced. The judge correctly identified that ARCHITECTURE-simple.md shows `safe_open_file()` using mode 0o600, implying automatic enforcement. This edit makes the enforcement mechanism explicit, clarifies which component is responsible (safe_open_file function), and distinguishes between application-enforced permissions for new files versus user responsibility for pre-existing files.

---

### Gap ID 21: JSON schema stability guarantees undefined
**What Changed**: Added explicit JSON schema stability guarantees with reference to vision.md, clarifying what constitutes a "stable" schema and how it can evolve over time.

**Lines Affected**: Lines 187-203 (Output Formats section, JSON Format subsection)

**Content Added/Modified**:
```markdown
**Schema Stability Guarantees**: The JSON output format follows stability guarantees defined in vision.md success criterion #4:
- **Existing fields**: Field names, types, and semantics remain stable within a major version
- **Backward compatibility**: New optional fields may be added in minor versions (scripts that ignore unknown fields continue to work)
- **Breaking changes**: Field removal, renaming, or type changes require a major version bump
- **Field ordering**: Not guaranteed to be stable (scripts must parse JSON by key name, not by position)
- **Version detection**: Future versions may include a `"schema_version"` field to allow scripts to detect and handle schema changes

For complete JSON output specifications including null handling, precision rules, and type naming conventions, see interface.md lines 768-779.
```

**Rationale**: The judge determined this was LOW severity because interface.md already provides a complete, detailed JSON schema for MVP implementation. However, the gap correctly identified that "stable JSON schema" lacked a clear definition of what stability means for future evolution. This edit clarifies the schema evolution policy by referencing the already-defined guarantees in vision.md, making them visible in the technical design where implementers will look for JSON format specifications. The cross-reference to interface.md ensures spec creators know where to find the detailed format rules.

---

## Summary
- **Gaps addressed**: 2
- **Sections added**: 0 (no new major sections)
- **Sections modified**: 2
  1. Security Considerations (item 5) - expanded from 1 line to 6 detailed bullet points
  2. JSON Format subsection - added schema stability guarantees paragraph with 5 bullet points

Both edits preserve the existing content and style, making minimal changes while directly addressing the identified documentation gaps. The changes transform vague guidance ("should have restrictive permissions", "stable JSON schema") into concrete, actionable specifications that a spec creator can implement.
