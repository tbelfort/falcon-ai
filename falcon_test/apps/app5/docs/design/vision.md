# Vision: Contact Book CLI

## Problem Statement

Contact management is scattered across multiple applications and services:

- **Fragmented data**: Contacts spread across email apps, phone contacts, spreadsheets, and CRM tools
- **Cloud dependency**: Most solutions require accounts, internet connectivity, and ongoing subscriptions
- **No scriptability**: GUI-only applications cannot integrate into automated workflows
- **Slow access**: Opening full applications for a quick phone number lookup is inefficient

Professionals who manage hundreds of contacts need a fast, reliable, offline-capable solution.

## Target User

**Alex, the sales consultant** at a boutique consulting firm:

- Manages 500+ professional contacts across multiple clients and industries
- Needs quick phone/email lookup during calls without switching applications
- Wants to export contacts by client/group for mail merges and newsletters
- Works offline frequently (airports, client sites with poor connectivity)
- Has basic command-line familiarity but is not a developer
- Values data ownership and privacy (no cloud sync concerns)

## Solution

A pip-installable CLI tool that:

1. Stores contacts in a local SQLite database (no server required)
2. Provides simple commands for daily operations (add, search, show)
3. Supports contact grouping for organization (clients, conferences, family)
4. Outputs machine-readable formats (JSON, CSV, vCard) for scripting and export
5. Runs on any system with Python 3.10+ (no external dependencies)

## Non-Goals

- **Multi-user access**: This is single-user. No authentication, no concurrent writes.
- **Cloud sync**: No cloud sync, no mobile app, no web interface.
- **Photo storage**: No contact photos or avatars.
- **Calendar integration**: No scheduling or appointment tracking.
- **Social media linking**: No automatic profile linking or enrichment.
- **Contact enrichment**: No automatic data lookup or completion.
- **Group details view**: No `group show` command. Use `group list` to see all groups. Groups are simple name+description pairs.
- **Group editing**: No ability to edit group name/description after creation. Delete and recreate if needed.

## Success Criteria

1. User can add a new contact and find them in under 10 seconds
2. All commands complete in <100ms for databases up to 10,000 contacts
3. Works fully offline after initial install
4. Shell scripts can parse output reliably (stable JSON schema)
5. Export to CSV/vCard compatible with common tools (Outlook, Google Contacts)

## Test Plan Alignment Note

This application emphasizes PII (Personally Identifiable Information) handling as a major security concern:
- Contact names, emails, phones are PII
- Notes may contain sensitive information
- AD7 and S4 specifically address PII protection

**For Falcon Testing:** Ensure baseline principles include PII-related patterns:
- B-SEC-004: Sensitive data logging (maps to AD7)
- Any patterns related to data exposure in exports

The TEST_PLAN.md lists "export handling" as a risk area - this includes PII exposure in exports.
