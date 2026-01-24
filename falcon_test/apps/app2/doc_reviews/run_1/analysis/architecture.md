# Architecture Decisions Analysis

## Status: READY

All architecture decisions have been made. Technologies are specified with clear rationale, versions are pinned where applicable, and no unresolved choices remain.

## Undecided Items

None found. All technology choices are explicitly decided with clear rationale.

## Decision Summary

### Technologies Specified: 10

| Decision | Choice | Location |
|----------|--------|----------|
| Language | Python 3.10+ | `technical.md` |
| Database | SQLite3 | `technical.md`, `schema.md` |
| CLI Framework | argparse | `technical.md` |
| Database ORM | None (raw sqlite3) | `technical.md` |
| External Dependencies | None (stdlib only) | `vision.md`, `technical.md` |
| Currency Storage | INTEGER cents | `technical.md` (AD7), `schema.md` |
| Timestamp Format | ISO 8601 with UTC | `schema.md` |
| Output Formats | Table, JSON, CSV | `technical.md`, `interface.md` |
| Error Handling | Custom exception hierarchy | `errors.md` |
| File Permissions | 0600 for database | `schema.md`, `ARCHITECTURE-simple.md` |

### Versions Pinned: 1/1

| Dependency | Version | Location |
|------------|---------|----------|
| Python | 3.10+ | `vision.md`, `technical.md` |

Note: SQLite version is not explicitly pinned, but this is acceptable as SQLite3 is bundled with Python's standard library and maintains strong backward compatibility. The schema uses only standard SQL features compatible with any SQLite 3.x version.

### Undecided Choices: 0

No undecided technology choices found. All "or" decisions have been resolved:

1. **CLI Framework**: Explicitly chose argparse. Click and Typer were considered and rejected with rationale provided in `technical.md`.

2. **Database Approach**: Explicitly chose raw sqlite3 module. SQLAlchemy was rejected in `technical.md`.

3. **Dependency Policy**: Explicitly "Standard library only. No pip dependencies" in `technical.md`.

## Architecture Decisions Documented

The following architecture decisions (AD1-AD7) are fully specified in `technical.md`:

| ID | Decision | Status |
|----|----------|--------|
| AD1 | Layered Architecture (CLI/Command/Database) | Decided |
| AD2 | No Global State | Decided |
| AD3 | Explicit Error Types with exit codes | Decided |
| AD4 | Parameterized Queries Only (security) | Decided |
| AD5 | Input Validation at Boundary | Decided |
| AD6 | Atomic Database Operations | Decided |
| AD7 | Decimal for Currency (stored as cents) | Decided |

## Security Decisions Documented

The following security rules (S1-S4) are fully specified in `ARCHITECTURE-simple.md`:

| ID | Decision | Status |
|----|----------|--------|
| S1 | Parameterized Queries Only | Decided |
| S2 | Path Validation (URL-decode, no .., symlink resolution) | Decided |
| S3 | Error Message Sanitization | Decided |
| S4 | Financial Data Protection (no PII in logs) | Decided |

## Hosting/Deployment

Explicitly scoped as a pip-installable CLI tool (`pip install finance-cli`) that runs locally. From `vision.md`:
- "Works fully offline after initial install"
- "No server required"
- "No cloud sync"

This is a local single-user tool, so no hosting/deployment decisions are required.

## Notes

1. **Explicit Non-Goals**: The documentation explicitly lists features that are out of scope (multi-user, cloud sync, investment tracking, bill payment, receipt scanning, multi-currency), which demonstrates intentional architecture scoping.

2. **Rejected Alternatives Documented**: `technical.md` documents why Click, Typer, and Fire were rejected for the CLI framework, showing deliberate decision-making.

3. **Performance Targets Defined**: `technical.md` includes specific performance targets (e.g., <100ms for balance query with 100,000 transactions).

4. **Schema Finalized**: `schema.md` is marked as [FINAL] status, indicating the database schema is locked.

5. **Interface Finalized**: `interface.md` is marked as [FINAL] status, indicating the CLI interface specification is locked.
