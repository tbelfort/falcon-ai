# Fixes Applied to technical.md

## Changes Made

### Issue ID 42: Ambiguous File Permission Enforcement for Database Files
**What Changed**: Clarified that permission enforcement occurs ONLY at file creation time, with no runtime checks or modifications of existing files. Removed any ambiguous language and made it explicit that the application does not check or warn about permissions on existing files.

**Content Added/Modified**:
```markdown
5. **Financial Data Protection**: Database files MUST have restrictive permissions (0600) to prevent unauthorized access
   - **Creation-time enforcement**: The `safe_open_file()` function (defined in ARCHITECTURE-simple.md S2) automatically sets mode `0o600` when creating new files with write mode, ensuring proper permissions are applied atomically during file creation
   - **Application responsibility**: The `init` command and any database operations MUST use `safe_open_file()` for file creation to guarantee correct permissions
   - **No runtime checks**: The application does NOT check, verify, or modify permissions of existing database files during open or write operations. Permission setting occurs ONLY during initial file creation.
   - **User responsibility**: If users modify permissions of existing database files after creation, that is their responsibility. The application does not validate or warn about permissive permissions on existing files.
   - **Security note**: Never log transaction details or other financial data to logs or error messages
```

**Key clarifications**:
- Changed "Enforcement" to "Creation-time enforcement" to emphasize timing
- Changed "Runtime checks" to "No runtime checks" and expanded to explicitly state no checking, verification, or modification during open or write operations
- Changed "User responsibility" bullet to explicitly state that user-modified permissions are not validated or warned about

## Summary
- Issues fixed: 1
- Sections added: 0
- Sections modified: 1 (Security Considerations section, item #5)
