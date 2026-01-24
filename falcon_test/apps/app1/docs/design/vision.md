# Vision: Warehouse Inventory CLI

## Problem Statement

Small warehouse operations (1-3 employees, <10,000 SKUs) need inventory tracking but existing solutions are:
- **Overkill**: Enterprise systems like SAP require IT staff and training
- **Cloud-dependent**: SaaS tools require internet connectivity and subscriptions
- **Not scriptable**: GUI-only tools can't integrate into automated workflows

## Target User

**Sarah, the warehouse manager** at a small parts distributor:
- Manages inventory across multiple warehouse locations (system tested up to 10,000 SKUs)
- Needs to track stock levels, reorder points, and generate reports
- Wants to automate low-stock alerts via cron jobs
- Has basic command-line familiarity but isn't a developer
- Works offline frequently (warehouse has spotty WiFi)

## Solution

A pip-installable CLI tool that:
1. Stores inventory in a local SQLite database (no server required)
2. Provides simple commands for daily operations (add, update, search)
3. Outputs machine-readable formats (JSON, CSV) for scripting
4. Runs on any system with Python 3.10+ (no external dependencies)

## Security Requirements

> **SECURITY WARNING**
>
> On shared systems (multiple users accessing the same file system), mandatory security controls are REQUIRED to prevent unauthorized access to inventory data. Single-user systems may skip to "Non-Goals" below.

**Shared System Deployment Requirements:**

This application MUST NOT be deployed on shared systems (multiple users with access to the same file system) without the following mandatory controls:

1. **File permissions (REQUIRED):** 0600 on Unix, restricted ACLs on Windows
2. **User isolation (REQUIRED):** Separate database files per user
3. **Directory-level access controls (REQUIRED):** Database directory permissions set to 0700

**Failure to implement these controls on shared systems is a security vulnerability that may expose inventory data to unauthorized users.**

**Multi-User Environment Protection:**

The application detects shared system environments at startup and requires explicit acknowledgment via `--allow-shared-system` flag before proceeding. This prevents accidental deployment on shared systems without proper security configuration.

> **Security Limitation:** Without encryption, anyone with file system read access (backup systems, administrators) can read database contents directly. File permissions are the ONLY protection in the default configuration. For sensitive data, consider full-disk encryption (BitLocker, FileVault, LUKS).

See `technical.md` for architecture decisions related to security, and `systems/database/schema.md` for implementation details.

---

## Non-Goals

- **Multi-user access**: Single-user operation only. No authentication system, no user management.
- **Real-time sync**: No cloud sync, no mobile app, no web interface.
- **Barcode scanning**: Out of scope. Users type SKUs manually.
- **Purchase orders**: This tracks inventory only, not procurement.
- **Accounting integration**: No cost tracking, no valuation reports.

## Concurrent Access Behavior

While designed for single-user operation, running multiple CLI commands simultaneously (e.g., via parallel shell scripts) is handled gracefully:

- **Read operations**: Can run concurrently without issue
- **Write operations**: Queued with a 30-second timeout; fails with clear error rather than corrupting data

**Practical limits:** 2-3 concurrent writes are safe; 10+ will cause frequent timeouts. For heavy concurrent workloads, consider a client-server database. See `technical.md` for details.

## Success Criteria

1. User can go from `pip install` to tracking inventory in under 5 minutes
   - **Measurement:** Manual timing test following the Quick Start guide in README
2. All commands complete in <100ms for databases up to 50,000 items
3. Works fully offline after initial install
4. Shell scripts can parse output reliably (stable JSON schema)
   - **Measurement:** JSON schema is versioned and documented in cli/interface.md; breaking changes require major version bump
