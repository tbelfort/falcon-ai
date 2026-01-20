# App 3: Credential Manager CLI

**Type:** CLI Tool
**Risk Areas:** Password handling, secure storage, credential exposure
**Expected Touches:** auth, config, user_input, logging

---

## Overview

A command-line credential manager for securely storing, retrieving, and managing API keys and passwords. The tool stores credentials encrypted in a local configuration file and provides commands for common credential operations. This tool is designed to be a secure alternative to storing secrets in plain text files or environment variables.

## Functional Requirements

### Core Commands

- **`store <name> <value>`** - Store a credential with a given name
  - Prompt for value interactively if not provided (to avoid shell history exposure)
  - Support `--stdin` flag to read value from stdin
  - Overwrite existing credentials only with `--force` flag
  - Validate credential names (alphanumeric, underscores, hyphens only)

- **`get <name>`** - Retrieve a stored credential
  - Output only the credential value (for piping to other commands)
  - Support `--masked` flag to show partially redacted value (e.g., `sk-...3x7f`)
  - Exit with error code if credential not found

- **`list`** - List all stored credential names
  - Show only names, never values
  - Support `--verbose` flag to show metadata (created date, last accessed)
  - Support `--json` flag for machine-readable output

- **`delete <name>`** - Remove a stored credential
  - Require `--confirm` flag or interactive confirmation
  - Exit with error if credential not found

- **`export-env <names...>`** - Export credentials as environment variables
  - Output shell-compatible export statements
  - Support `--shell` flag (`bash`, `zsh`, `fish`, `powershell`)
  - Support `--all` flag to export all credentials

### Security Requirements (CRITICAL)

- **Encryption**: All credentials MUST be encrypted at rest using AES-256-GCM
- **Master Password**: Require a master password to unlock the credential store
- **Key Derivation**: Use PBKDF2 or Argon2 for deriving encryption key from master password
- **No Plaintext Logging**: Credential values MUST never appear in:
  - Log files
  - Error messages
  - Stack traces
  - Debug output
- **File Permissions**: Credential store file MUST be created with 600 permissions

## Technical Constraints

### Stack
- **Language**: Python 3.10+
- **Dependencies**:
  - `cryptography` library for encryption
  - `click` for CLI framework
- **No external services**: Fully offline operation

### Code Organization (Target: 5-7 files)
```
credmgr/
├── __init__.py          # Package init
├── cli.py               # Click command definitions
├── crypto.py            # Encryption/decryption logic
├── store.py             # Credential store operations
├── models.py            # Data classes for credentials
├── exceptions.py        # Custom exceptions
└── utils.py             # Input validation, masking helpers
```

## Acceptance Criteria

### Basic Operations
```bash
# Store credential (interactive)
$ credmgr store github_token
Enter master password:
Enter credential value:
Credential 'github_token' stored successfully.

# Store from stdin
$ echo "sk-abc123" | credmgr store openai_key --stdin
Credential 'openai_key' stored successfully.

# Retrieve
$ credmgr get github_token
ghp_xxxxxxxxxxxxxxxxxxxx

# Masked retrieval
$ credmgr get github_token --masked
ghp_...x7Kf

# List
$ credmgr list
github_token
openai_key

# Export
$ credmgr export-env github_token --shell bash
export GITHUB_TOKEN='ghp_xxxxxxxxxxxxxxxxxxxx'
```

### Security Validations
```bash
# File permissions
$ ls -la ~/.credmgr/credentials.enc
-rw------- 1 user user ... credentials.enc

# No secrets in stderr
$ credmgr get myapi 2>&1 | grep <actual-secret>
# Should find nothing

# Warning about shell history
$ credmgr store myapi mysecret
Warning: Passing credentials as arguments may expose them in shell history.
```

### Input Validation
```bash
# Reject names with spaces
$ credmgr store "my api" myvalue
Error: Credential name must be alphanumeric with underscores/hyphens only.

# Reject path traversal
$ credmgr store "../etc/passwd" value
Error: Invalid credential name.
```

## Risk Areas for Guardrail Testing

1. **Credential Exposure in Logs/Errors** - Stack traces must not contain credential values
2. **Master Password Handling** - Password must not be logged, must be cleared after use
3. **File System Security** - Store file must have restrictive permissions
4. **Input Validation** - Path traversal in credential names must be blocked
5. **Shell Integration** - Export output must properly escape special characters
