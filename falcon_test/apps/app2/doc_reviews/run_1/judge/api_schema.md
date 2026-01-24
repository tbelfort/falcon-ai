# API/Schema Judge Evaluation

## Summary

| Finding # | Title | Determination | Severity | Blocking |
|-----------|-------|---------------|----------|----------|
| 1 | No API endpoints defined - CLI-only interface documented | DISMISSED | - | - |
| 2 | Missing request/response schemas for programmatic access | DISMISSED | - | - |
| 3 | No HTTP methods specified (not a REST API) | DISMISSED | - | - |
| 4 | Missing API authentication/authorization design | DISMISSED | - | - |
| 5 | No paginated API endpoint for large transaction lists | DISMISSED | - | - |
| 6 | Missing error response format specification | DISMISSED | - | - |
| 7 | No API rate limiting or quota design | DISMISSED | - | - |
| 8 | Missing API versioning strategy | DISMISSED | - | - |
| 9 | Field-level validation rules not in structured schema format | DISMISSED | - | - |
| 10 | CSV export schema incomplete - injection prevention not documented as schema constraint | DISMISSED | - | - |
| 11 | Missing structured schema for import CSV format | CONFIRMED | MEDIUM | NON_BLOCKING |
| 12 | Database schema lacks CHECK constraints for field validation | CONFIRMED | LOW | NON_BLOCKING |
| 13 | No schema definition for verbose mode debug output | DISMISSED | - | - |
| 14 | Budget report calculation logic not expressed as schema | CONFIRMED | MEDIUM | NON_BLOCKING |
| 15 | Balance calculation aggregate schema undefined | DISMISSED | - | - |

## Statistics

- Total findings: 15
- Confirmed: 3
- Dismissed: 12

## Overall Assessment

The scout report fundamentally misunderstands the project scope. This is explicitly a **CLI-only tool** with **no REST API** by design. The vision document explicitly states: "No cloud sync: No sync, no mobile app, no web interface." and lists multi-user access and authentication as NON-GOALS.

Findings 1-10 all request REST API features (endpoints, HTTP methods, authentication, rate limiting, JSON Schema, OpenAPI specs) that are explicitly out of scope. These findings were correctly DISMISSED.

Three minor documentation gaps were CONFIRMED as MEDIUM or LOW severity, all NON_BLOCKING.

---

## Finding Details

### Finding 1: No API endpoints defined - CLI-only interface documented

**Scout Description:**
The system is documented as a CLI tool with no REST API endpoints. The scout suggests adding REST endpoint definitions, HTTP methods, request/response body schemas, authentication requirements, etc.

**My Verification:**
I checked vision.md Non-Goals section which explicitly states:
- "Multi-user access: This is single-user. No auth, no concurrent writes."
- "No cloud sync: No sync, no mobile app, no web interface."

The architecture diagram in ARCHITECTURE-simple.md shows: USER -> cli.py -> commands.py -> database.py -> SQLite with no API layer.

**Determination:** DISMISSED

**Confidence:** 0.95

**Reasoning:**
This is not a gap - it is a deliberate design decision documented in vision.md Non-Goals section. The project is explicitly designed as a single-user CLI tool with no web interface. Requesting REST API endpoints contradicts the documented project scope.

---

### Finding 2: Missing request/response schemas for programmatic access

**Scout Description:**
No structured request/response schemas for API payloads. Python dataclasses exist but no serialization schemas for API consumption.

**My Verification:**
I verified that:
- components.md defines Python dataclasses as internal data models
- interface.md documents JSON output format for CLI with examples
- vision.md states "Shell scripts can parse output reliably (stable JSON schema)" indicating JSON CLI output IS the programmatic access format
- technical.md documents JSON output format specifications

**Determination:** DISMISSED

**Confidence:** 0.95

**Reasoning:**
This is a CLI tool, not a REST API. The JSON output format documented in interface.md and technical.md IS the programmatic access format. The vision document explicitly identifies shell script integration as the programmatic access method, not REST API calls.

---

### Finding 3: No HTTP methods specified (not a REST API)

**Scout Description:**
The system has no HTTP method specifications because it is a CLI tool. The scout suggests adding GET/POST/PUT/DELETE endpoints if REST API is needed.

**My Verification:**
The scout correctly identifies this is a CLI tool, not a REST API. The architecture in ARCHITECTURE-simple.md has no HTTP layer by design.

**Determination:** DISMISSED

**Confidence:** 0.95

**Reasoning:**
The scout acknowledges this is not a REST API, then suggests adding one anyway. This contradicts the explicit non-goal in vision.md. There is no gap here - the absence of HTTP methods is intentional.

---

### Finding 4: Missing API authentication/authorization design

**Scout Description:**
No authentication mechanism documented. The CLI relies on filesystem permissions as the security boundary.

**My Verification:**
I checked vision.md which explicitly states: "Multi-user access: This is single-user. No auth, no concurrent writes." This is listed under Non-Goals. technical.md documents the security model: "Database files should have restrictive permissions (0600)".

**Determination:** DISMISSED

**Confidence:** 0.95

**Reasoning:**
Authentication is explicitly a non-goal. The single-user CLI design uses filesystem permissions as the security boundary, which is documented and appropriate for the use case.

---

### Finding 5: No paginated API endpoint for large transaction lists

**Scout Description:**
The CLI has --limit but no cursor-based or offset-based pagination for API access.

**My Verification:**
interface.md documents:
- `--limit N` parameter with default 50
- `--from DATE` and `--to DATE` filters
- schema.md has LIMIT in the query

**Determination:** DISMISSED

**Confidence:** 0.80

**Reasoning:**
The CLI has --limit which provides basic result limiting. For CLI use, combining --limit with date filters (--from/--to) provides effective pagination. The 100,000 transaction performance target is documented. While OFFSET support would be nice-to-have, the current design is adequate for CLI use. This would only be a gap if building an API.

---

### Finding 6: Missing error response format specification

**Scout Description:**
Error handling documents CLI stderr messages and exit codes, but no JSON error schema for API consumers.

**My Verification:**
errors.md thoroughly documents:
- Exit codes (0-4) with meanings
- Exception hierarchy with exit_code attributes
- Error message templates for all error types
- Error handling rules
- Examples for testing error conditions

**Determination:** DISMISSED

**Confidence:** 0.90

**Reasoning:**
For CLI tools, exit codes + stderr messages ARE the standard error interface. JSON error schemas are only needed for REST APIs. The error documentation in errors.md is comprehensive for a CLI tool.

---

### Finding 7: No API rate limiting or quota design

**Scout Description:**
No rate limiting documented. The scout acknowledges single-user CLI design does not require it.

**My Verification:**
The scout itself states: "Single-user CLI design doesn't require it."

**Determination:** DISMISSED

**Confidence:** 0.95

**Reasoning:**
There is no API, so rate limiting is not applicable. This is a single-user local CLI tool running against a local SQLite database. Rate limiting would be meaningless.

---

### Finding 8: Missing API versioning strategy

**Scout Description:**
No API versioning documented for schema evolution or backward compatibility.

**My Verification:**
components.md defines `__version__ = "0.1.0"` for the CLI. interface.md provides stable CLI argument specifications.

**Determination:** DISMISSED

**Confidence:** 0.95

**Reasoning:**
There is no API to version. The CLI uses semantic versioning. CLI backward compatibility is managed through stable argument specifications in interface.md. API versioning is only relevant for REST APIs.

---

### Finding 9: Field-level validation rules not in structured schema format

**Scout Description:**
Validation rules scattered in prose, not in JSON Schema or OpenAPI format.

**My Verification:**
I verified that components.md contains:
- validate_account_name() with docstring specifying 1-50 chars
- validate_amount() with regex pattern and range limits
- validate_date() with ISO 8601 format
- Many other validate_* functions with full specifications

interface.md has tables with "Constraints" columns specifying rules per field.

**Determination:** DISMISSED

**Confidence:** 0.85

**Reasoning:**
For a CLI tool implemented in Python, Python function specifications with docstrings ARE the appropriate schema format. The docs include regex patterns (e.g., `^-?\d+(\.\d{1,2})?$`), length limits, and validation behavior. JSON Schema/OpenAPI are REST API formats.

---

### Finding 10: CSV export schema incomplete - injection prevention not documented as schema constraint

**Scout Description:**
CSV injection prevention described procedurally but not as formal schema constraint.

**My Verification:**
technical.md documents: "TEXT fields starting with the following characters MUST be prefixed with a single quote: =, +, -, @, \t, \r"

interface.md has a dedicated "CSV Injection Prevention" section with:
- List of characters requiring sanitization
- Note about amount field exception
- Examples

**Determination:** DISMISSED

**Confidence:** 0.90

**Reasoning:**
CSV injection prevention IS thoroughly documented in BOTH technical.md and interface.md. The documentation clearly specifies which fields require sanitization, which characters trigger it, and the exception for numeric amount fields. This is sufficient for implementation.

---

### Finding 11: Missing structured schema for import CSV format

**Scout Description:**
CSV import format partially specified without formal schema for field types, validation rules, and null handling.

**My Verification:**
interface.md documents:
- Header row required: `date,account,category,amount,description`
- Date format: YYYY-MM-DD
- Amount format: decimal
- Description optional, empty cells = NULL
- Two-phase validation approach
- RFC 4180 compliance for export (import should match)

However, some details are implicit:
- Exact column order requirements not explicit
- Quote handling for import not explicitly stated
- Encoding validation not explicit

**Determination:** CONFIRMED

**Severity:** MEDIUM
**Blocking:** NON_BLOCKING
**Confidence:** 0.75

**Reasoning:**
The import format is documented but could be more explicit. A spec writer can reasonably infer most details from the export format (RFC 4180) and validation rules, but some ambiguity exists around column ordering strictness and quote handling. MEDIUM severity because the core requirements are documented.

---

### Finding 12: Database schema lacks CHECK constraints for field validation

**Scout Description:**
Many validation rules enforced only at application layer, not as database CHECK constraints.

**My Verification:**
schema.md shows existing CHECK constraints:
- `CHECK (account_type IN ('checking', 'savings', 'credit', 'cash'))`
- `CHECK (category_type IN ('income', 'expense'))`
- `CHECK (amount_cents > 0)` for budgets

Documentation explicitly notes: "Max 50 chars (app-enforced)" for names, acknowledging this is a design decision.

**Determination:** CONFIRMED

**Severity:** LOW
**Blocking:** NON_BLOCKING
**Confidence:** 0.80

**Reasoning:**
The design decision to use app-layer validation is documented and intentional. For a single-user CLI tool where the app layer is the only access path, this is acceptable. Database CHECK constraints would provide defense-in-depth but are not required. This is LOW severity as a nice-to-have enhancement.

---

### Finding 13: No schema definition for verbose mode debug output

**Scout Description:**
Debug output format not formally specified with log levels, timestamps, or structured fields.

**My Verification:**
interface.md has "Verbose Mode Behavior" section with:
- Table of debug messages per command
- "DEBUG:" prefix format
- Written to stderr

errors.md specifies:
- What MUST NOT be logged (PII)
- Examples of correct vs incorrect debug output

**Determination:** DISMISSED

**Confidence:** 0.85

**Reasoning:**
Verbose mode IS documented with the format (DEBUG: prefix to stderr), per-command messages, and PII restrictions. For a simple CLI debug mode, this specification is appropriate. Implementing structured JSON logging with timestamps would be over-engineering.

---

### Finding 14: Budget report calculation logic not expressed as schema

**Scout Description:**
BudgetReportItem dataclass exists but calculation formulas and edge cases not in formal schema.

**My Verification:**
I found calculation logic spread across multiple files:
- components.md: calculate_percent_used() function with division-by-zero handling
- schema.md: SQL query showing spent_cents = ABS(SUM(CASE WHEN amount_cents < 0...))
- interface.md: Output format examples

The pieces exist but are not consolidated:
- remaining_cents calculation (budget - spent) is implicit
- percent_used rounding (1 decimal place) documented in calculate_percent_used()
- Division by zero handling documented

**Determination:** CONFIRMED

**Severity:** MEDIUM
**Blocking:** NON_BLOCKING
**Confidence:** 0.70

**Reasoning:**
The calculation logic IS documented but scattered. A consolidated section showing all formulas together would help spec writers. The key edge cases (budget=0, overspending >100%) are addressed but could be clearer. MEDIUM because the information exists but requires assembly.

---

### Finding 15: Balance calculation aggregate schema undefined

**Scout Description:**
AccountBalance dataclass exists but calculation rules, sign convention, and edge cases not formally specified.

**My Verification:**
I found comprehensive documentation:
- schema.md: SQL query with `COALESCE(SUM(t.amount_cents), 0)` showing NULL handling
- interface.md: "Note on Credit Card Balance Interpretation" section explaining sign convention
- components.md: AccountBalance dataclass definition

The sign convention is clearly documented: negative = liability, positive = asset.

**Determination:** DISMISSED

**Confidence:** 0.80

**Reasoning:**
Balance calculation IS documented. The SQL shows the calculation, interface.md explains sign convention and credit card interpretation, and edge cases (accounts with no transactions) are handled by COALESCE. A spec writer has sufficient information.

---

## Recommendations

1. **Finding 11 (Import CSV schema)**: Add a consolidated section in interface.md specifying exact column order requirements, quote handling behavior, and encoding expectations for import files.

2. **Finding 12 (Database CHECK constraints)**: Consider adding as a low-priority enhancement. Document this as an optional defense-in-depth measure in schema.md.

3. **Finding 14 (Budget report calculations)**: Add a "Calculation Reference" subsection in either components.md or interface.md that consolidates all budget report formulas in one place.
