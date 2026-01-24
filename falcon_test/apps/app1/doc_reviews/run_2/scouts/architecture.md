# Architecture Decisions Scout Report

## Status: GAPS_FOUND

The architecture documentation demonstrates well-specified technology choices with explicit versions and clear rationale. However, there is an internal inconsistency in Python version requirements that must be resolved before implementation.

## Findings Summary

| # | Title | Severity | Blocking | Confidence | Affected Files |
|---|-------|----------|----------|------------|----------------|
| 1 | Python version inconsistency: 3.10+ vs 3.8+ | HIGH | BLOCKING | HIGH | ["falcon_test/apps/app1/docs/design/technical.md", "falcon_test/apps/app1/docs/systems/architecture/ARCHITECTURE-simple.md"] |

## Finding Details

#### Finding 1: Python version inconsistency between design and deployment documentation
**Severity:** HIGH
**Blocking:** BLOCKING
**Confidence:** HIGH
**Description:** The design documentation specifies Python 3.10+ as the language requirement with 3.10-specific syntax features, but deployment documentation specifies Python 3.8+ as the minimum version. This creates ambiguity about the actual minimum supported version. The codebase cannot support both versions without modification since 3.10+ syntax features (union type `int | None`, type parameter `list[Product]`) are explicitly listed as being used.
**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md", "falcon_test/apps/app1/docs/systems/architecture/ARCHITECTURE-simple.md"]
**Evidence:**
- technical.md line 5: "Language: Python 3.10+" with rationale "Type hints (3.10+) improve code quality"
- technical.md lines 35-47 explicitly list Python 3.10+ specific features used:
  - Union type syntax: `int | None` (requires 3.10+)
  - Type parameter syntax: `list[Product]` (requires 3.9+, but bundled with union types as 3.10+ features)
- ARCHITECTURE-simple.md line 778: "Python version MUST be 3.8 or higher"
- ARCHITECTURE-simple.md line 901: Deployment verification checks for "3.8+"
- ARCHITECTURE-simple.md line 932: CI script fails if Python < 3.8 (not 3.10)
- ARCHITECTURE-simple.md line 2049: "Python 3.8+, writable storage"
- ARCHITECTURE-simple.md line 2556: "Python: 3.8+ with standard library sqlite3"
- technical.md lines 43-47 describe backporting as "if backporting to Python 3.8-3.9 is required" suggesting it's optional, but deployment docs treat 3.8 as the minimum

**Suggested Fix:** Choose ONE of:
1. **Align on Python 3.10+**: Update ARCHITECTURE-simple.md deployment requirements to Python 3.10+ since the codebase uses 3.10+ syntax features. This is the recommended approach as it matches the actual code.
2. **Align on Python 3.8+**: If 3.8 support is genuinely required, update technical.md to mark backport as REQUIRED (not optional), remove references to using 3.10+ features, and mandate using `typing.Union` and `typing.List` throughout.

## Decision Summary

### Technologies Specified: 9
1. **Language:** Python 3.10+ (with conflicting 3.8+ in deployment docs - see Finding 1)
2. **Database:** SQLite 3.24.0+ minimum (explicit version with enforcement code)
3. **CLI Framework:** argparse (standard library)
4. **Database Encryption (optional):** SQLCipher with pysqlcipher3>=1.2.0
5. **Windows Permission Verification:** pywin32>=305 (for sensitive data deployments)
6. **Layer Boundary Linting:** import-linter>=2.0.0,<3.0.0 (development dependency)
7. **JSON Processing (for scripts):** jq (external tool for automation examples)
8. **Database Journal Mode:** WAL mode (with rollback journal fallback)
9. **File Encoding:** UTF-8

### Versions Pinned: 5/5 core dependencies
| Dependency | Version Specification | Location |
|------------|----------------------|----------|
| Python | 3.10+ (conflicting with 3.8+ in deployment) | technical.md line 5 |
| SQLite | 3.24.0+ | technical.md lines 59-91 |
| pysqlcipher3 | >=1.2.0 | schema.md line 77 |
| pywin32 | >=305 | schema.md line 411 |
| import-linter | >=2.0.0,<3.0.0 | ARCHITECTURE-simple.md lines 142-146 |

### Undecided Choices: 1
The Python version requirement is effectively undecided due to conflicting specifications.

### Notable Strengths

1. **Zero external runtime dependencies** - Explicitly documented as a design constraint: "Standard library only. No pip dependencies."

2. **Explicit version enforcement code** - SQLite version validation includes actual Python implementation code showing how to enforce minimum version at runtime.

3. **Rejected alternatives with rationale** - Every technology choice includes explanation of why alternatives were rejected:
   - Click/Typer rejected: "External dependency"
   - Fire rejected: "Magic behavior, harder to control"
   - SQLAlchemy/ORMs rejected: "No ORM, no SQLAlchemy"

4. **Platform-specific considerations** - Windows vs Unix handling explicitly documented for permissions, including pywin32 fallback requirements.

5. **Development vs Runtime dependencies** - Clear distinction between runtime (zero external) and development dependencies (import-linter).

### Architecture Decision Records

The documentation includes formal Architecture Decisions (ADs) in technical.md:

| ID | Decision | Status |
|----|----------|--------|
| AD1 | Layered Architecture | Decided |
| AD2 | No Global State | Decided |
| AD3 | Explicit Error Types | Decided |
| AD4 | Parameterized Queries Only | Decided |
| AD5 | Input Validation at Boundary | Decided |
| AD6 | Atomic Database Operations | Decided |

### Security Rules

Security requirements are explicitly defined in ARCHITECTURE-simple.md:

| ID | Rule | Status |
|----|------|--------|
| S1 | Parameterized Queries Only | Decided |
| S2 | Path Traversal Prevention | Decided |
| S3 | No Internal Details in Error Messages | Decided |
