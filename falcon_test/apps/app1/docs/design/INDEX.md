# Design Documentation Index

This index helps Context Pack agents find relevant documentation for specific tasks.

---

## Documentation Categories

This documentation is organized into two categories:

- **Design Documentation** (this directory): Covers the *why* and *what* - vision, use cases, architectural decisions, and component design. Read these when you need to understand the reasoning behind the system.

- **Systems Documentation** (`systems/` directory): Covers the *how* - implementation specifications, interface contracts, and operational details. Read these when you need to implement or operate the system. Systems documentation uses RFC 2119 language (MUST, MUST NOT, SHOULD, MAY) for formal requirements.

---

## Document Map

| Document | Purpose | Read When |
|----------|---------|-----------|
| `vision.md` | Why we're building this | Always (provides context) |
| `use-cases.md` | How the tool is used | Any user-facing change |
| `technical.md` | Architecture decisions | Any structural change |
| `components.md` | Module breakdown | When implementing any code module |

---

## Systems Documentation

| Document | Purpose | Read When |
|----------|---------|-----------|
| `systems/architecture/ARCHITECTURE-simple.md` | Layer rules, data flow | Always |
| `systems/database/schema.md` | SQLite schema, queries, indexes | Database work |
| `systems/cli/interface.md` | Command specifications | CLI work |
| `systems/errors.md` | Exception handling | Error handling work |

---

> **Index Strategy Note:** The SKU column uses SQLite's implicit indexing (automatically created for UNIQUE constraints) - do NOT create an explicit `idx_products_sku` index. Location, quantity, timestamps, and name have explicit indexes for their respective query patterns. See schema.md for the complete index strategy including the composite `idx_products_location_quantity` index.

## Component Mapping

| Component | Design Doc | Systems Doc |
|-----------|------------|-------------|
| `cli.py` | `components.md` | `cli/interface.md`, `errors.md` |
| `commands.py` | `components.md` | `architecture/ARCHITECTURE-simple.md` |
| `database.py` | `technical.md`, `components.md` | `database/schema.md` |
| `models.py` | `components.md` | `database/schema.md` |
| `formatters.py` | `components.md` | `cli/interface.md` |
| `exceptions.py` | `technical.md`, `components.md` | `errors.md` |

---

## Architecture Decisions

Architecture Decisions (ADs) are documented design choices that have significant impact on the codebase. Each AD is numbered for easy reference and explains *why* a particular approach was chosen over alternatives. All architecture decisions are in `technical.md`:

| ID | Decision | Impact |
|----|----------|--------|
| AD1 | Layered architecture | Module structure |
| AD2 | No global state | All modules |
| AD3 | Explicit error types | `exceptions.py`, `cli.py` |
| AD4 | Parameterized queries only | `database.py` |
| AD5 | Input validation at boundary | `cli.py` |
| AD6 | Atomic database operations | `database.py`, `commands.py` |

---

## Security Considerations

Security Rules (S1, S2, S3) are mandatory security requirements defined in `ARCHITECTURE-simple.md`. Unlike Architecture Decisions (ADs) which document design choices, Security Rules are non-negotiable constraints that must be followed to prevent vulnerabilities.

Security-relevant documentation:

1. **SQL Injection Prevention** → `technical.md` (AD4), `architecture/ARCHITECTURE-simple.md` (S1: Parameterized Queries Only)
2. **Path Validation** → `architecture/ARCHITECTURE-simple.md` (S2: Path Traversal Prevention)
3. **Error Message Sanitization** → `architecture/ARCHITECTURE-simple.md` (S3: No Internal Details in Error Messages), `errors.md`
