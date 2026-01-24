# Design Documentation Index

This index helps Context Pack agents find relevant documentation for specific tasks.

---

## Document Map

| Document | Purpose | Read When |
|----------|---------|-----------|
| `vision.md` | Why we're building this | Always (provides context) |
| `use-cases.md` | How the tool is used | Any user-facing change |
| `technical.md` | Architecture decisions | Any structural change |
| `components.md` | Module breakdown | Implementation work |

---

## Systems Documentation

| Document | Purpose | Read When |
|----------|---------|-----------|
| `systems/architecture/ARCHITECTURE-simple.md` | Layer rules, data flow | Always |
| `systems/database/schema.md` | SQLite schema, queries | Database work |
| `systems/cli/interface.md` | Command specifications | CLI work |
| `systems/errors.md` | Exception handling | Error handling work |

---

## Component Mapping

| Component | Design Doc | Systems Doc |
|-----------|------------|-------------|
| `cli.py` | `components.md` | `cli/interface.md`, `errors.md` |
| `commands.py` | `components.md` | `architecture/ARCHITECTURE-simple.md` |
| `database.py` | `technical.md`, `components.md` | `database/schema.md` |
| `models.py` | `components.md` | `database/schema.md` |
| `formatters.py` | `components.md` | `cli/interface.md` |
| `exceptions.py` | `technical.md`, `components.md` | `errors.md` |
| `link_parser.py` | `components.md`, `technical.md` | - |

---

## Architecture Decisions

All architecture decisions are in `technical.md`:

| ID | Decision | Impact |
|----|----------|--------|
| AD1 | Layered architecture | Module structure |
| AD2 | No global state | All modules |
| AD3 | Explicit error types | `exceptions.py`, `cli.py` |
| AD4 | Parameterized queries only | `database.py` |
| AD5 | Input validation at boundary | `cli.py` |
| AD6 | Atomic database operations | `database.py`, `commands.py` |
| AD7 | Content in files, metadata in SQLite | `database.py`, `commands.py` |
| AD8 | Filename sanitization for note titles | `commands.py` |
| AD9 | Template variable expansion security | `commands.py` |

---

## Security Considerations

Security-relevant documentation:

1. **SQL Injection Prevention** -> `technical.md` (AD4), `architecture/ARCHITECTURE-simple.md` (S1)
2. **Path Traversal Prevention** -> `architecture/ARCHITECTURE-simple.md` (S2)
3. **Filename Sanitization** -> `architecture/ARCHITECTURE-simple.md` (S3)
4. **Error Message Sanitization** -> `architecture/ARCHITECTURE-simple.md` (S4), `errors.md`
