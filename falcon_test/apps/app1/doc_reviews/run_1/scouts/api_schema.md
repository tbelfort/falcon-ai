# API/Schema Coverage Scout Report

## Status: GAPS_FOUND

## Findings Summary

| # | Title | Affected Files |
|---|-------|----------------|
| 1 | No HTTP/REST API endpoints defined - CLI-only architecture confirmed | ["falcon_test/apps/app1/docs/systems/cli/interface.md"] |
| 2 | Product schema defined but missing field-level validation specifications for several fields | ["falcon_test/apps/app1/docs/systems/database/schema.md", "falcon_test/apps/app1/docs/design/technical.md"] |
| 3 | JSON output schema lacks complete field type specifications for error responses | ["falcon_test/apps/app1/docs/design/components.md", "falcon_test/apps/app1/docs/systems/errors.md"] |
| 4 | Missing request validation schema for batch operations | ["falcon_test/apps/app1/docs/design/use-cases.md"] |
| 5 | LowStockItem schema definition incomplete - missing field constraints | ["falcon_test/apps/app1/docs/design/components.md"] |
| 6 | CSV export schema lacks field-level escaping specifications | ["falcon_test/apps/app1/docs/design/use-cases.md", "falcon_test/apps/app1/docs/design/technical.md"] |
| 7 | Pagination metadata schema incomplete - missing field types | ["falcon_test/apps/app1/docs/design/technical.md"] |
| 8 | Update command schema missing null handling for optional fields | ["falcon_test/apps/app1/docs/design/components.md"] |

## Finding Details

#### Finding 1: No HTTP/REST API endpoints defined - CLI-only architecture confirmed
**Description:** The application is explicitly documented as CLI-only with no web API endpoints. However, the documentation should clarify what "endpoints" means in the CLI context (commands as endpoints).
**Affected Files:** ["falcon_test/apps/app1/docs/systems/cli/interface.md"]
**Evidence:**
- interface.md explicitly states: "Important: This is a CLI-only application with NO web API."
- Non-Goals section lists "Web API Endpoints", "API Versioning Strategy", "API Authentication/Authorization" as out of scope
- Commands (init, add-item, update-stock, search, etc.) serve as CLI "endpoints"

**Suggested Fix:** Add a "CLI Commands as API Contract" section to interface.md that documents:
```markdown
## CLI Commands as API Contract

While this application has no HTTP/REST API, the CLI commands serve as the programmatic interface:

**Command Interface Schema:**
- **Endpoint**: Command name (e.g., `add-item`, `search`)
- **Request Format**: Command-line arguments with typed parameters
- **Response Format**: JSON (with `--format json`) or table (default)
- **Status Codes**: Exit codes 0-4, 130 (documented in errors.md)

Each command specification below defines the full "endpoint" contract.
```

#### Finding 2: Product schema defined but missing field-level validation specifications for several fields
**Description:** While the Product dataclass and database schema are defined, several fields lack complete validation specifications (regex patterns, character sets, normalization rules).
**Affected Files:** ["falcon_test/apps/app1/docs/systems/database/schema.md", "falcon_test/apps/app1/docs/design/technical.md"]
**Evidence:**
- Product schema shows: `sku: string (1-50 chars)` but regex pattern is not in schema.md
- `description` field shows max length but no character set restrictions
- `location` field format not specified (free-form text? alphanumeric only?)
- Validation rules are in technical.md (AD5) and components.md (validate_* functions) but not consolidated

**Suggested Fix:** Add to schema.md:
```markdown
### Field Validation Schema

| Field | Type | Format/Pattern | Validation Rules | Normalization |
|-------|------|----------------|------------------|---------------|
| sku | TEXT | `/^[A-Za-z0-9_-]+$/` | 1-50 chars, alphanumeric/hyphen/underscore | Strip whitespace |
| name | TEXT | Any printable UTF-8 | 1-255 chars, non-empty after strip | Strip whitespace |
| description | TEXT | Any printable UTF-8 | 0-4096 chars, nullable | Strip whitespace, empty->NULL |
| quantity | INTEGER | Positive integer | 0 <= n <= 999999999 | None |
| min_stock_level | INTEGER | Non-negative integer | 0 <= n <= 999999999 | None |
| location | TEXT | Any printable UTF-8 | 0-100 chars, nullable | Strip whitespace, empty->NULL |
| created_at | TEXT | ISO 8601 timestamp | System-generated | None |
| updated_at | TEXT | ISO 8601 timestamp | System-generated | None |
```

#### Finding 3: JSON output schema lacks complete field type specifications for error responses
**Description:** Error response JSON schema is partially defined in components.md but missing detailed field type specifications and error code enumeration.
**Affected Files:** ["falcon_test/apps/app1/docs/design/components.md", "falcon_test/apps/app1/docs/systems/errors.md"]
**Evidence:**
- components.md shows `ErrorResponse` interface with fields but no complete type specs
- errors.md defines exit codes but not JSON error format
- Missing: error_code enumeration, message format constraints

**Suggested Fix:** Add to components.md CLI Command Data Schemas section:
```typescript
### Error Response Schema (JSON format)

interface ErrorResponse {
  status: "error";                 // Literal type
  error_type: ErrorType;           // See enum below
  error_code: number;              // Exit code (1-4, 130)
  message: string;                 // Human-readable, max 500 chars
  details?: ErrorDetails;          // Optional, verbose mode only
}

enum ErrorType {
  ValidationError = "ValidationError",
  DatabaseError = "DatabaseError",
  ItemNotFoundError = "ItemNotFoundError",
  DuplicateItemError = "DuplicateItemError",
  SecurityError = "SecurityError"
}

interface ErrorDetails {
  field?: string;                  // Field that failed validation
  constraint?: string;             // Constraint violated
  stacktrace?: string;             // Full stacktrace (verbose mode only)
}
```

**Example JSON error output:**
```json
{
  "status": "error",
  "error_type": "ValidationError",
  "error_code": 1,
  "message": "SKU cannot be empty.",
  "details": {
    "field": "sku",
    "constraint": "non_empty"
  }
}
```

#### Finding 4: Missing request validation schema for batch operations
**Description:** Batch import operations are documented in use-cases.md but there's no schema for the CSV input format validation.
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md"]
**Evidence:**
- UC1 describes batch import via shell scripts
- No CSV input schema defined (column order, header requirements, escaping rules)
- Missing: required vs optional columns, default values

**Suggested Fix:** Add to use-cases.md UC1 section:
```markdown
### Batch Import CSV Input Schema

**Required CSV Format:**
- **Encoding**: UTF-8 (BOM optional)
- **Header Row**: Required (must be first row)
- **Column Order**: sku, name, quantity, location (all required)
- **Escaping**: RFC 4180 (quotes around fields with commas/newlines)

**Column Specifications:**
| Column | Type | Required | Default | Validation |
|--------|------|----------|---------|------------|
| sku | string | Yes | N/A | 1-50 chars, alphanumeric/hyphen/underscore |
| name | string | Yes | N/A | 1-255 chars, non-empty |
| quantity | integer | Yes | N/A | 0 to 999999999 |
| location | string | No | NULL | 0-100 chars |

**Example Valid CSV:**
```csv
sku,name,quantity,location
WH-001,Widget A,100,Aisle-A
WH-002,Widget B,50,Aisle-B
WH-003,Special "Widget",25,"Location with, comma"
```

**Validation Errors:**
- Missing required columns → reject entire CSV
- Invalid SKU format → skip row, log error
- Duplicate SKU → skip row, log error
```

#### Finding 5: LowStockItem schema definition incomplete - missing field constraints
**Description:** LowStockItem dataclass is defined in components.md but lacks field-level constraints and validation rules.
**Affected Files:** ["falcon_test/apps/app1/docs/design/components.md"]
**Evidence:**
- components.md defines `LowStockItem` with fields but no type constraints
- Missing: deficit calculation formula, field ranges
- No specification of whether fields are nullable

**Suggested Fix:** Expand LowStockItem definition in components.md:
```typescript
interface LowStockItem {
  sku: string;                     // Non-empty, 1-50 chars, matches Product.sku
  name: string;                    // Non-empty, 1-255 chars, matches Product.name
  quantity: number;                // Integer, 0 to 999999999, current stock level
  min_stock_level: number;         // Integer, 0 to 999999999, threshold
  deficit: number;                 // Integer, always > 0, calculated as max(min_stock_level - quantity, 1)
}

**Field Constraints:**
- All fields are required (non-nullable)
- `deficit` is computed: `max(min_stock_level - quantity, 1)` to ensure always positive
- `sku` and `name` must match corresponding Product fields (referential integrity)
```

#### Finding 6: CSV export schema lacks field-level escaping specifications
**Description:** CSV export is mentioned in multiple documents but the output schema doesn't fully specify escaping rules for all field types.
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md", "falcon_test/apps/app1/docs/design/technical.md"]
**Evidence:**
- use-cases.md UC6 mentions CSV export with RFC 4180 escaping
- technical.md has CSV injection prevention for dangerous characters
- Missing: complete field-by-field escaping specification
- No schema for timestamp format in CSV output

**Suggested Fix:** Add to use-cases.md UC6:
```markdown
### CSV Export Output Schema

**Field Escaping Rules (by field type):**

| Field | Type | Escaping Rules | Example Input | Example CSV Output |
|-------|------|----------------|---------------|-------------------|
| sku | string | RFC 4180 + formula injection prevention | `=1+1` | `'=1+1` (prefixed with quote) |
| name | string | RFC 4180 + formula injection prevention | `Widget "Pro"` | `"Widget ""Pro"""` (quotes doubled) |
| description | string | RFC 4180 + formula injection prevention + NULL handling | `NULL` | `` (empty field) |
| quantity | integer | No escaping (numeric) | `100` | `100` |
| min_stock_level | integer | No escaping (numeric) | `10` | `10` |
| location | string | RFC 4180 + NULL handling | `Aisle-A, Row 5` | `"Aisle-A, Row 5"` |
| created_at | ISO 8601 | No escaping (system-generated, safe format) | `2026-01-23T10:30:00Z` | `2026-01-23T10:30:00Z` |
| updated_at | ISO 8601 | No escaping (system-generated, safe format) | `2026-01-23T14:00:00Z` | `2026-01-23T14:00:00Z` |

**Formula Injection Prevention:**
Characters triggering escaping: `=`, `+`, `-`, `@`, `\t`, `\r`, `|`, `!`
Action: Prefix field with single quote (`'`)

**NULL Handling:**
- Database NULL → empty CSV field (no quotes unless needed for adjacency)
```

#### Finding 7: Pagination metadata schema incomplete - missing field types
**Description:** Pagination response structure is defined in technical.md but lacks complete type specifications and constraints.
**Affected Files:** ["falcon_test/apps/app1/docs/design/technical.md"]
**Evidence:**
- technical.md shows pagination metadata fields but no type details
- Missing: field ranges (max limit value), required vs optional
- No specification of what happens when offset > total

**Suggested Fix:** Add to technical.md Pagination Response Schema section:
```typescript
### Pagination Metadata Schema (Complete)

interface PaginationMetadata {
  limit: number;        // Integer, 1-1000, requested page size
  offset: number;       // Integer, >= 0, number of items skipped
  count: number;        // Integer, 0-limit, actual items in current response
  total: number;        // Integer, >= 0, total matching items in database
  has_more: boolean;    // true if offset + count < total
}

**Field Constraints:**
- `limit`: Must be 1 <= limit <= 1000 (enforced at application layer)
- `offset`: Must be >= 0, no upper bound (can exceed total)
- `count`: Must be 0 <= count <= limit
- `total`: Must be >= 0
- `has_more`: Computed as `offset + count < total`

**Edge Cases:**
- `offset >= total`: Returns `{count: 0, data: []}` (not an error)
- `limit > remaining items`: `count < limit` (returns partial page)
- Empty result set: `{count: 0, total: 0, has_more: false}`
```

#### Finding 8: Update command schema missing null handling for optional fields
**Description:** The update-item command allows updating optional fields but doesn't specify how NULL/empty values are handled.
**Affected Files:** ["falcon_test/apps/app1/docs/design/components.md"]
**Evidence:**
- components.md defines `cmd_update_item` with optional parameters
- Missing: specification of what `description=""` means vs `description=None`
- No schema for distinguishing "don't change" vs "set to NULL"

**Suggested Fix:** Add to components.md `cmd_update_item` specification:
```markdown
**`cmd_update_item` NULL Handling Schema:**

The update command distinguishes between three states for optional fields:

| Parameter Value | Meaning | Database Action | Use Case |
|-----------------|---------|-----------------|----------|
| Not provided (`None` in function) | Don't change | No UPDATE for this field | User wants to change other fields only |
| Empty string (`""`) | Set to NULL | `UPDATE ... SET field = NULL` | User wants to clear the field |
| Non-empty string | Set to value | `UPDATE ... SET field = ?` with value | User wants to change the field |

**Request Schema:**
```typescript
interface UpdateItemRequest {
  sku: string;                    // Required, identifies item to update
  name?: string | null;           // Optional: omit=no change, ""=set NULL, value=update
  description?: string | null;    // Optional: omit=no change, ""=set NULL, value=update
  location?: string | null;       // Optional: omit=no change, ""=set NULL, value=update
  min_stock_level?: number | null; // Optional: omit=no change, null=error (can't be NULL in DB)
}
```

**Validation Rules:**
- `min_stock_level` cannot be set to NULL (database constraint) - reject with error
- Empty string for `name` is rejected (name is required, cannot be NULL)
- Empty string for `description` or `location` sets field to NULL
```

## Coverage Summary
- Features with complete API: 0/0 (CLI-only, no HTTP API)
- CLI Commands with complete schemas: 6/8 (init, add-item, search, low-stock-report partially complete)
- Entities with schemas: 2/3 (Product complete, LowStockItem incomplete, ErrorResponse incomplete)
- Endpoints defined: 8 CLI commands (all have basic syntax, but schemas need completion)

## Recommendations

1. **High Priority**: Complete the Product field validation schema in schema.md (Finding 2)
2. **High Priority**: Add complete error response schema to components.md (Finding 3)
3. **Medium Priority**: Add batch import CSV input schema to use-cases.md (Finding 4)
4. **Medium Priority**: Complete LowStockItem schema constraints (Finding 5)
5. **Medium Priority**: Add complete CSV export field escaping specifications (Finding 6)
6. **Low Priority**: Complete pagination metadata schema (Finding 7)
7. **Low Priority**: Add NULL handling schema for update command (Finding 8)
8. **Low Priority**: Add "CLI Commands as API Contract" clarification section (Finding 1)

## Notes

This is a **CLI-only application** with no HTTP/REST API. The "API" in this context refers to the command-line interface contract (commands, arguments, JSON output schemas, exit codes). All findings relate to improving the completeness and precision of these CLI interface specifications.

The core schema definitions exist but lack precision in several areas:
- Field-level validation rules are scattered across multiple documents
- Type constraints are sometimes implied but not explicitly stated
- Edge case handling (NULL, empty string, overflow) is not always specified
- Request/response formats for complex operations (batch import, pagination) need formalization
