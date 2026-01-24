# Vision: Personal Finance Tracker CLI

## Problem Statement

Freelancers and individuals need personal budget tracking but existing solutions are:
- **Overkill**: Enterprise systems like QuickBooks require accounting knowledge and subscriptions
- **Cloud-dependent**: SaaS tools require internet connectivity and ongoing fees
- **Not scriptable**: GUI-only tools can't integrate into automated workflows
- **Privacy concerns**: Financial data stored on third-party servers

## Target User

**Alex, a freelance consultant**:
- Manages income from 3-5 clients
- Tracks expenses across ~10 categories (groceries, utilities, entertainment, etc.)
- Needs monthly budget reports for financial planning
- Wants to export data for tax preparation
- Works offline frequently (coffee shops, travel)
- Has basic command-line familiarity but isn't a developer

## Solution

A pip-installable CLI tool that:
1. Stores financial data in a local SQLite database (no server required)
2. Provides simple commands for daily operations (add transaction, check balance)
3. Tracks spending against monthly budgets per category
4. Outputs machine-readable formats (JSON, CSV) for scripting
5. Runs on any system with Python 3.10+ (no external dependencies)

## Non-Goals

- **Multi-user access**: This is single-user. No auth, no concurrent writes.
- **Cloud sync**: No sync, no mobile app, no web interface.
- **Investment tracking**: No stock portfolio, no crypto, no assets.
- **Bill payment**: No bank integration, no automatic payments.
- **Receipt scanning**: No OCR, no image processing.
- **Multi-currency**: Single currency assumed (no exchange rates).

## Success Criteria

1. User can go from `pip install` to tracking finances in under 5 minutes
2. All commands complete in <100ms for databases up to 100,000 transactions
3. Works fully offline after initial install
4. Shell scripts can parse output reliably (stable JSON schema)
   - **Stability guarantee**: Existing fields maintain their names, types, and semantics within a major version
   - **Backward compatibility**: New optional fields may be added (scripts ignoring unknown fields continue to work)
   - **Breaking changes**: Field removal, renaming, or type changes require a major version bump
   - **Field ordering**: Not guaranteed stable (scripts must parse JSON by key name, not position)
