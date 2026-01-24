# Design Readiness Report

**App**: falcon_test/apps/app1
**Run**: 4
**Date**: 2026-01-23
**Docs Path**: falcon_test/apps/app1/docs

## Status: READY_FOR_SPEC

All blocking issues resolved. Ready for spec creation.

---

## Summary

| Metric | Count |
|--------|-------|
| Total Issues | 15 |
| Blocking | 10 |
| Non-Blocking | 5 |
| Fixed | 10 |

---

## Blocking Issues (Fixed)

### Issue #86: Soft Delete Feature Incomplete - Missing Database Schema
**Category**: design
**Files**: `falcon_test/apps/app1/docs/design/use-cases.md`

**Problem:**
The use case mentions that status and discontinued_at columns are defined in schema.md, but these columns are NOT present in the Products Table definition in technical.md. Implementer would be confused about: allowed values for status, default values, whether discontinued_at is nullable, whether indexes are needed, and migration for existing databases.

**Relevant Text (from scout):**
> The documentation says "status (TEXT) and discontinued_at (TIMESTAMP) are defined in schema.md" but these columns are missing from the Products Table schema in technical.md.

**Judge's Reasoning:**
> The soft-delete feature cannot be implemented without knowing the schema. The scout correctly identified that the referenced columns do not exist. Implementers cannot proceed without making arbitrary decisions about column types, defaults, and constraints - which could lead to inconsistent implementations or data model conflicts.

**Fix Applied:**
Fixed in documentation - Added complete schema definition for status and discontinued_at columns.

---

### Issue #87: Security Module Location and Boundaries Unclear
**Category**: design
**Files**: `falcon_test/apps/app1/docs/design/technical.md`, `falcon_test/apps/app1/docs/design/components.md`

**Problem:**
The technical.md references systems/database/security.py for security functions (verify_secure_permissions, detect_multiuser_environment), but components.md does not show this module in the project structure or dependency graph.

**Relevant Text (from scout):**
> There is NO security.py module listed in the component structure. The technical documentation references systems/database/security.py as if it exists, but the module structure shows only: cli.py, commands.py, database.py, models.py, formatters.py, exceptions.py.

**Judge's Reasoning:**
> Module boundaries are architectural decisions that affect the entire codebase structure. Without knowing whether security.py exists as a separate module, the implementer cannot establish proper imports, maintain the dependency graph, or ensure no circular dependencies. This is not a detail that can be reasonably inferred during implementation.

**Fix Applied:**
Fixed in documentation - Added security.py to components.md and clarified module boundaries.

---

### Issue #88: Encryption Configuration Implementation Details Missing
**Category**: design
**Files**: `falcon_test/apps/app1/docs/systems/database/schema.md`

**Problem:**
Multiple issues with encryption specification: (1) Where does the startup check run? (2) The code example uses f-string interpolation for encryption key violating parameterized query principles. (3) Dependency conflict: docs say standard library only but encryption requires pysqlcipher3. (4) Missing key format and validation specification.

**Relevant Text (from scout):**
> The documentation says implementations MUST validate encryption at startup but does not specify which module performs this check. The encryption example uses insecure f-string interpolation. There is a conflict between standard library only requirement and pysqlcipher3 dependency.

**Judge's Reasoning:**
> The encryption feature involves security-critical decisions that cannot be left to implementer discretion. The dependency conflict (stdlib-only vs pysqlcipher3 requirement) is a fundamental architectural contradiction that must be resolved before implementation. Additionally, the insecure code example could lead to security vulnerabilities if copied verbatim.

**Fix Applied:**
Fixed in documentation - Fixed insecure code examples, clarified startup check location, resolved dependency conflict, added key format specification.

---

### Issue #90: Rate Limiter Implementation Incomplete for CLI Context
**Category**: design
**Files**: `falcon_test/apps/app1/docs/design/technical.md`

**Problem:**
Documentation acknowledges rate limiting is problematic for CLI but provides three options without making a definitive choice. If SQLite-based is chosen, missing schema definition for rate_limits table. Code snippet has race conditions and incomplete error handling.

**Relevant Text (from scout):**
> The spec says choose one of these approaches but does not specify which one MUST be implemented. If SQLite-based rate limiting is chosen (marked as RECOMMENDED), the rate_limits table schema is not defined anywhere. The provided code has a race condition between checking the count and inserting.

**Judge's Reasoning:**
> Rate limiting is a security feature that the documentation explicitly marks as a requirement. Leaving the implementation approach as an open question creates ambiguity that will either result in no rate limiting (security gap) or inconsistent implementations. The race condition in the provided code example further complicates matters - copying it would result in a broken implementation. A definitive architectural decision must be made before implementation.

**Fix Applied:**
Fixed in documentation - Made SQLite-based rate limiting MANDATORY, added schema definition, fixed race condition with BEGIN IMMEDIATE.

---

### Issue #91: Search Pagination Implementation Details Missing
**Category**: design
**Files**: `falcon_test/apps/app1/docs/design/technical.md`, `falcon_test/apps/app1/docs/design/use-cases.md`

**Problem:**
Pagination is marked as MANDATORY but CLI flag names are not specified (--limit? --page-size? --offset? --skip?). Current behavior for default pagination is undefined. Table format pagination output requires COUNT query but performance impact not addressed. Backward compatibility not addressed.

**Relevant Text (from scout):**
> The documentation specifies that pagination is MANDATORY with limit/offset, but the CLI interface specification does not show the command-line flags. The use cases show search examples without pagination flags. The JSON schema is provided but table format behavior and COUNT query requirements are unclear.

**Judge's Reasoning:**
> CLI interface design must be specified - implementers cannot invent flag names as this affects the public API contract. The discrepancy between mandatory pagination and use case examples without pagination flags suggests incomplete specification. Additionally, the COUNT query question has performance implications that could affect architecture decisions.

**Fix Applied:**
Fixed in documentation - Specified --limit and --offset flags with defaults, added COUNT query considerations.

---

### Issue #92: Multi-User Environment Detection Implementation Incomplete
**Category**: design
**Files**: `falcon_test/apps/app1/docs/design/technical.md`

**Problem:**
Detection algorithm has multiple gaps: false positive scenarios unclear, getent group parsing logic underspecified (which group? how many users?), Windows ACL check has zero implementation detail (no library specified, no specific checks defined), caching strategy location unclear, missing error handling for edge cases.

**Relevant Text (from scout):**
> The detection logic checks mode & 0o077 != 0 which would cause false positives. getent group logic does not specify which group or how many users counts as multiple. Windows ACL check says to check NTFS ACLs but provides zero implementation detail - no library, no specific ACL entries, no handling of inherited ACLs. Caching strategy does not specify where cache is stored.

**Judge's Reasoning:**
> Multi-user detection is a security feature that, if incorrectly implemented, could either annoy users with false positives or create security vulnerabilities with false negatives. The Windows implementation is essentially unspecified. The scout correctly notes this should either be fully specified or marked as optional for v1. In its current state, an implementer would be guessing at critical security logic.

**Fix Applied:**
Fixed in documentation - Added complete Unix/Linux and Windows detection logic with thresholds and error handling.

---

### Issue #94: SQLite WAL Mode on Network Filesystems Will Cause Silent Data Corruption
**Category**: feasibility
**Files**: `falcon_test/apps/app1/docs/design/technical.md`, `falcon_test/apps/app1/docs/systems/architecture/ARCHITECTURE-simple.md`

**Problem:**
The architecture claims to block network filesystems but allows mapped network drives on Windows (Z:\) while blocking UNC paths. A mapped drive IS a network filesystem with a drive letter alias. SQLite WAL mode on network storage causes data corruption, not just stability issues.

**Relevant Text (from scout):**
> Mapped network drives on Windows (Z:\) are explicitly allowed while UNC paths are blocked. A mapped drive IS a network filesystem. SQLite WAL mode causes data corruption on network storage, not just stability issues. Users following this guidance will experience silent data corruption.

**Judge's Reasoning:**
> This is a critical data integrity issue. Silent data corruption is one of the worst possible failure modes for a database application. The current specification allows a configuration that will reliably cause data loss. Implementation cannot proceed safely until the spec clarifies how to prevent network filesystem usage.

**Fix Applied:**
Fixed in documentation - Changed mapped drives to MUST NOT use, added detection methods and clear error messages.

---

### Issue #95: Performance Targets Contradict CLI Invocation Model
**Category**: feasibility
**Files**: `falcon_test/apps/app1/docs/design/technical.md`

**Problem:**
The architecture acknowledges CLI startup overhead (80-170ms) makes sub-100ms end-to-end latency impossible, but documented use cases assume 220ms+ response times are acceptable. Suggested workarounds like daemon mode are not specified anywhere.

**Relevant Text (from scout):**
> CLI startup overhead makes sub-100ms end-to-end latency impossible. Use cases (UC3: Order Fulfillment) describe rapid stock updates where 220ms latency would be unacceptable. Daemon mode suggested but not specified anywhere.

**Judge's Reasoning:**
> The mismatch between documented use cases (rapid warehouse operations) and achievable performance (220ms+ per command) represents a fundamental architectural disconnect. The spec must either revise performance expectations downward or specify the daemon mode that is mentioned but not designed.

**Fix Applied:**
Fixed in documentation - Added optional Daemon Mode specification, marked as NOT required for v1.

---

### Issue #98: Windows Permission Verification Requires Dependency Breaking No Dependencies Constraint
**Category**: feasibility
**Files**: `falcon_test/apps/app1/docs/systems/database/schema.md`, `falcon_test/apps/app1/docs/design/technical.md`

**Problem:**
Direct contradiction: "Standard library only. No pip dependencies" vs pywin32 REQUIRED for Windows deployments with sensitive data. Target user (parts distributor) tracks pricing and supplier information which requires pywin32 per the spec apply.

**Relevant Text (from scout):**
> Spec states "Standard library only. No pip dependencies" but pywin32 is REQUIRED for Windows deployments with sensitive data. Target user tracks pricing/supplier data requiring pywin32. icacls fallback documented as unreliable.

**Judge's Reasoning:**
> This is a direct contradiction in the specification that cannot be resolved by implementers without a design decision. The spec simultaneously requires no external dependencies AND requires pywin32 for the target use case. Either the dependency constraint or security requirements must be relaxed.

**Fix Applied:**
Fixed in documentation - Clarified scope: stdlib-only for non-sensitive deployments, pywin32 REQUIRED for sensitive data.

---

### Issue #100: Pagination Response Schema Breaks JSON Backward Compatibility
**Category**: feasibility
**Files**: `falcon_test/apps/app1/docs/design/technical.md`, `falcon_test/apps/app1/docs/design/use-cases.md`

**Problem:**
Three different incompatible JSON schemas described: Schema A uses "data" and "pagination", Schema B uses "results" and "meta", Schema C is bare array. Spec claims backward compatibility but this breaks stability guarantee.

**Relevant Text (from scout):**
> Three incompatible JSON schemas: {"data": [...], "pagination": {...}} vs {"results": [], "meta": {...}} vs bare array [...]. Spec claims backward compatibility via --format json-compact but breaks stability guarantee for field names.

**Judge's Reasoning:**
> This is a specification inconsistency that will cause implementation confusion. The spec documents three different JSON schemas in different places. Implementers cannot know which to implement. Scripts need a stable, documented JSON schema. This requires a design decision before implementation.

**Fix Applied:**
Fixed in documentation - Made "data" and "pagination" the ONLY valid schema, added --format json-legacy for backward compatibility.

---

## Non-Blocking Issues (Reported Only)

These issues were identified but do not block implementation. Consider addressing them during or after implementation.

### Issue #89: Disaster Recovery Procedures Referenced But Not Defined
**Category**: design
**Files**: `falcon_test/apps/app1/docs/design/use-cases.md`

**Problem:**
The documentation repeatedly references a Disaster Recovery section in ARCHITECTURE-simple.md for automated backup schedules, retention policies, point-in-time recovery, and off-site backup recommendations, but this section does not exist.

**Relevant Text (from scout):**
> The use case says see ARCHITECTURE-simple.md - Disaster Recovery section for: automated backup cron schedules, backup retention policies, point-in-time recovery procedures, off-site backup recommendations. But this section does NOT exist.

**Judge's Reasoning:**
> While the missing disaster recovery documentation is a documentation completeness issue, it does not block the implementation of core warehouse CLI functionality. Disaster recovery is an operational concern that can be addressed post-implementation. The core backup/restore commands are documented in the use cases - what is missing is operational guidance for production deployments, which is a deployment concern rather than an implementation blocker.

---

### Issue #93: Python 3.13+ Compatibility Claims Contradicted by Implementation Requirements
**Category**: feasibility
**Files**: `falcon_test/apps/app1/docs/design/technical.md`

**Problem:**
The documentation states Python 3.13+ has not been tested and may have changes to standard library modules, but provides no concrete information about what those changes might be. Additionally, backport guidance for Python 3.8-3.9 contradicts the stated minimum version of 3.10.0.

**Relevant Text (from scout):**
> Documentation explicitly states Python 3.13+ has "not been tested and may have changes to standard library modules" but provides no concrete information. Backport guidance for 3.8-3.9 contradicts minimum version 3.10.0.

**Judge's Reasoning:**
> This is a documentation inconsistency that can be resolved during implementation. The core architecture is sound for Python 3.10-3.12. Implementers can proceed by targeting Python 3.10-3.12 and adding a runtime version check to warn on untested versions.

---

### Issue #96: Rate Limiting Cannot Work as Specified for CLI Tool
**Category**: feasibility
**Files**: `falcon_test/apps/app1/docs/design/technical.md`

**Problem:**
SQLite-based rate limiting creates chicken-and-egg problem: rate limiting prevents concurrent database access issues, but rate limiting mechanism itself requires database access. Rate limiting in single-user CLI tool protects against nothing meaningful.

**Relevant Text (from scout):**
> SQLite-based rate limiting creates lock contention it is meant to prevent. Stale rate limit entries accumulate. Rate limiting in single-user CLI tool serves no purpose. Threat model assumes multi-user server scenario that does not apply.

**Judge's Reasoning:**
> While the rate limiting design is architecturally misguided for a CLI tool, this does not prevent implementation. Implementers can skip rate limiting entirely or implement a simple version. The feature provides no real security benefit for single-user CLI usage.

---

### Issue #97: CSV Injection Prevention Cannot Be Reliably Automated
**Category**: feasibility
**Files**: `falcon_test/apps/app1/docs/design/technical.md`

**Problem:**
Requirement for automated static analysis to enforce CSV sanitization is not feasible without significant tooling investment. No standard Python linter can detect this pattern. Runtime enforcement via wrapper class would be more reliable but is not specified.

**Relevant Text (from scout):**
> No standard Python linter can detect whether sanitize_csv_field() is called around field accesses. Custom AST-based linter would be extremely complex. Runtime enforcement via wrapper class is more practical but not specified.

**Judge's Reasoning:**
> The core requirement (CSV sanitization) is clear and implementable. The enforcement mechanism is overly ambitious, but implementers can proceed by implementing the sanitization function, using a wrapper class for runtime enforcement, and adding comprehensive tests.

---

### Issue #99: Multi-User Environment Detection Requires Unavailable Tools
**Category**: feasibility
**Files**: `falcon_test/apps/app1/docs/design/technical.md`

**Problem:**
getent group requires glibc and does not exist on Alpine Linux, macOS, or BSD. Directory permissions do not indicate multi-user usage. Windows NTFS ACL checking without pywin32 has same icacls problems. Detection can be trivially bypassed.

**Relevant Text (from scout):**
> getent group requires glibc, does not exist on Alpine, macOS, BSD. Directory permissions do not indicate actual multi-user usage. Windows NTFS ACL checking has same icacls problems. Detection trivially bypassed with 0700 permissions.

**Judge's Reasoning:**
> While the multi-user detection as specified cannot be reliably implemented, this is a security enhancement feature, not core functionality. Implementers can proceed with simple permission-based checks and document the limitations.

---

## Audit Trail

- Scout reports: `falcon_test/apps/app1/doc_reviews/run_4/scouts/`
- Judge evaluations: `falcon_test/apps/app1/doc_reviews/run_4/judge/`
- Fix summaries: `falcon_test/apps/app1/doc_reviews/run_4/fixes/`
