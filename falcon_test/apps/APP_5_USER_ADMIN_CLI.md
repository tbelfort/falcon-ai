# App 5: User Admin CLI

**Type:** CLI Tool
**Risk Areas:** Authorization, audit logging, data exposure
**Expected Touches:** authz, logging, database, user_input

---

## Overview

A command-line tool for administering a local user database with role-based access control and comprehensive audit logging. The CLI supports multiple admin privilege levels, enforces permission boundaries based on the executing user's role, and maintains an immutable audit trail of all administrative actions.

## Functional Requirements

### User Management Commands

- **`add-user`**: Create a new user with specified username, email, and initial role
  - Requires `admin` or `superadmin` role
  - Cannot create users with role higher than the executing user's role

- **`list-users`**: Display all users in the system
  - `viewer` role sees: username, role, status (active/disabled)
  - `admin` role additionally sees: email, created_at
  - `superadmin` role additionally sees: last_login, created_by
  - Password hashes must NEVER be exposed regardless of role

- **`update-role`**: Change a user's role
  - Cannot elevate user to role higher than executing user's role
  - Cannot modify own role (prevents privilege escalation)

- **`disable-user`**: Disable a user account (soft delete)
  - Cannot disable own account
  - Cannot disable a `superadmin` unless executor is also `superadmin`

- **`audit-log`**: View audit trail
  - `viewer` role: denied entirely
  - `admin` role: sees own actions only
  - `superadmin` role: sees all actions

### Role Hierarchy

```
superadmin > admin > viewer
```

- `viewer`: Read-only access to non-sensitive user data
- `admin`: Can manage users with role <= admin
- `superadmin`: Full system access

### Audit Logging Requirements (CRITICAL)

- Every command execution MUST be logged with:
  - Timestamp (ISO 8601 format)
  - Executing user
  - Command and arguments
  - Target user (if applicable)
  - Outcome (success/failure)
- Audit log must be append-only
- Failed authorization attempts MUST be logged

### Current User Context

- Executing user identity read from `~/.falcon-usermgmt/config.json`
- Config file contains: `{ "current_user": "username" }`

## Technical Constraints

### Stack
- **Language**: Python 3.10+
- **CLI Framework**: `click` or `argparse`
- **Data Storage**: SQLite database at `~/.falcon-usermgmt/users.db`

### Code Organization (Target: 6-8 files)
```
falcon_usermgmt/
├── __init__.py
├── cli.py              # CLI entry points
├── service.py          # Business logic and authorization
├── repository.py       # Database operations
├── audit.py            # Audit logging
├── auth.py             # Permission checks
├── models.py           # Data classes
└── config.py           # Configuration loading
```

### Security Requirements
- All SQL queries MUST use parameterized statements
- Passwords MUST be hashed with bcrypt
- Audit log file permissions MUST be 0600

## Acceptance Criteria

### Authorization Tests
```bash
# viewer cannot add users
$ falcon-usermgmt add-user --username test --email test@example.com --role viewer
Error: Permission denied: requires admin or superadmin role
$ echo $?
1

# admin cannot create superadmin
$ falcon-usermgmt add-user --username test --email test@example.com --role superadmin
Error: Cannot create user with role higher than your own
$ echo $?
1

# admin cannot modify own role
$ falcon-usermgmt update-role --username <self> --role superadmin
Error: Cannot modify own role
$ echo $?
1
```

### Data Exposure Tests
```bash
# viewer sees limited fields
$ falcon-usermgmt list-users  # as viewer
USERNAME    ROLE      STATUS
admin       superadmin active
alice       admin     active

# admin sees more fields
$ falcon-usermgmt list-users  # as admin
USERNAME    ROLE        STATUS    EMAIL                CREATED_AT
admin       superadmin  active    admin@example.com    2026-01-19
alice       admin       active    alice@example.com    2026-01-19

# password_hash NEVER shown
$ falcon-usermgmt list-users | grep -i password
# Should return nothing
```

### Audit Logging Tests
```bash
# All actions logged
$ falcon-usermgmt audit-log --limit 5  # as superadmin
TIMESTAMP                EXECUTOR  COMMAND     TARGET  OUTCOME
2026-01-19T10:00:00Z     admin     add-user    alice   success
2026-01-19T10:05:00Z     alice     update-role bob     denied

# Failed auth attempts logged
# (verify in audit log after denied command)
```

### Input Validation
```bash
# SQL injection attempt
$ falcon-usermgmt add-user --username "'; DROP TABLE" --email test@test.com --role viewer
# Should either reject with validation error OR succeed without SQL error
# Must NOT cause database corruption
```

## Risk Areas for Guardrail Testing

1. **Authorization Boundaries**: Multiple commands check role hierarchy; incorrect implementations allow privilege escalation
2. **Data Exposure**: `list-users` output varies by role; incorrect implementations leak sensitive fields
3. **Audit Completeness**: All actions must be logged; missing entries indicate gaps
4. **Input Sanitization**: SQL injection attempts via username/email fields
5. **Self-Modification Prevention**: Users cannot elevate own privileges or disable self
