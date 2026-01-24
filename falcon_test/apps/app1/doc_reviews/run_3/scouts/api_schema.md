# API/Schema Coverage Scout Report

## Status: GAPS_FOUND

## Findings Summary

| # | Title | Affected Files |
|---|-------|----------------|
| 1 | No API endpoints - CLI-only interface lacks programmatic HTTP access | All design and systems docs |
| 2 | Missing request/response schema definitions for CLI commands | cli/interface.md, components.md |
| 3 | JSON output schemas incomplete - missing field type specifications | cli/interface.md, technical.md, use-cases.md |
| 4 | No defined error response schemas with structured error codes | errors.md, cli/interface.md |
| 5 | Missing validation rule schemas for input constraints | components.md, cli/interface.md |
| 6 | No pagination schema definition with field specifications | technical.md |
| 7 | Missing Product entity complete field type definitions | components.md, schema.md |
| 8 | LowStockItem entity incomplete field specifications | components.md, use-cases.md |
| 9 | No defined authentication/authorization mechanisms | All documentation |
| 10 | Missing relationship schemas between entities | All documentation |

## Finding Details

#### Finding 1: No API endpoints - CLI-only interface lacks programmatic HTTP access
**Description:** The application is entirely CLI-based with no HTTP API endpoints defined. All features are accessed through CLI commands (init, add-item, update-stock, search, etc.) with no REST, GraphQL, or RPC endpoints for programmatic access over HTTP. This makes integration with web applications, mobile apps, or remote systems impossible without wrapping the CLI in shell scripts.

**Affected Files:**
- falcon_test/apps/app1/docs/design/vision.md (lines 21-26: describes CLI tool with no mention of API)
- falcon_test/apps/app1/docs/design/components.md (lines 1-427: entire component structure is CLI-focused)
- falcon_test/apps/app1/docs/systems/cli/interface.md (entire file: only CLI commands, no API endpoints)
- falcon_test/apps/app1/docs/design/technical.md (lines 99-111: describes argparse for CLI, no API framework)

**Evidence:**
- Vision document states: "A pip-installable CLI tool that... Provides simple commands for daily operations" with no mention of HTTP/REST API
- Component architecture shows only CLI entry points: `cli.py`, `__main__.py`
- No HTTP server, route definitions, or API gateway mentioned anywhere
- Technical decisions reference only argparse (CLI framework), not Flask/FastAPI/Django

**Suggested Fix:** Define REST API specification with:
```yaml
# Example API endpoint structure needed:
POST /api/v1/products
  Request: { sku: string, name: string, quantity: number, ... }
  Response: { id: number, sku: string, created_at: timestamp }
  Status codes: 201 Created, 400 Bad Request, 409 Conflict

GET /api/v1/products?sku={sku}&name={name}&location={location}
  Response: [{ sku, name, quantity, location }]
  Status codes: 200 OK, 400 Bad Request

PATCH /api/v1/products/{sku}/stock
  Request: { operation: "add"|"remove"|"set", amount: number }
  Response: { sku, previous_quantity, new_quantity }
  Status codes: 200 OK, 404 Not Found, 400 Bad Request

GET /api/v1/reports/low-stock?threshold={number}
  Response: [{ sku, name, quantity, min_stock_level, deficit }]
  Status codes: 200 OK, 400 Bad Request
```

#### Finding 2: Missing request/response schema definitions for CLI commands
**Description:** While CLI commands are documented with arguments, there are no formal schema definitions for the data structures of command inputs and outputs. For example, `add-item` command parameters are described informally but lack schema specifications like: required vs optional, exact types (string vs integer), validation rules, default values.

**Affected Files:**
- falcon_test/apps/app1/docs/systems/cli/interface.md (entire file: describes commands but no formal schemas)
- falcon_test/apps/app1/docs/design/components.md (lines 77-87: function signatures without detailed schemas)

**Evidence:**
- components.md shows function signatures like: `cmd_add_item(db_path: str, sku: str, name: str, quantity: int, ...)` but the `...` elides optional parameters
- No JSON Schema, OpenAPI spec, or equivalent formal definition
- Validation rules are scattered across multiple files (models.py validations, errors.md constraints)
- Example from use-cases.md line 217: Shows JSON output format but doesn't define schema with field types

**Suggested Fix:** Create formal schemas for each command:
```json
// add-item command schema
{
  "command": "add-item",
  "input_schema": {
    "type": "object",
    "required": ["sku", "name", "quantity"],
    "properties": {
      "sku": {
        "type": "string",
        "minLength": 1,
        "maxLength": 50,
        "pattern": "^[A-Za-z0-9_-]+$"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 255
      },
      "quantity": {
        "type": "integer",
        "minimum": 0,
        "maximum": 999999999
      },
      "description": {
        "type": ["string", "null"],
        "maxLength": 4096
      },
      "location": {
        "type": ["string", "null"],
        "maxLength": 100
      },
      "min_stock_level": {
        "type": "integer",
        "minimum": 0,
        "maximum": 999999999,
        "default": 10
      }
    }
  },
  "output_schema": {
    "type": "object",
    "properties": {
      "id": { "type": "integer" },
      "sku": { "type": "string" },
      "message": { "type": "string" }
    }
  }
}
```

#### Finding 3: JSON output schemas incomplete - missing field type specifications
**Description:** Several places mention JSON output format but don't provide complete schema definitions with field types. For example, use-cases.md line 216 shows a JSON structure but doesn't specify that `quantity` is number, `deficit` is positive integer, etc.

**Affected Files:**
- falcon_test/apps/app1/docs/design/use-cases.md (lines 216-226: JSON schema without type definitions)
- falcon_test/apps/app1/docs/systems/cli/interface.md (lines 1111-1122: lists fields but no type specifications)
- falcon_test/apps/app1/docs/design/technical.md (lines 341-350: shows JSON format without schema)

**Evidence:**
- use-cases.md line 216: `"sku": "string (1-50 chars)"` - this is informal, not a schema type definition
- cli/interface.md line 1122: "JSON fields for search command" lists field names but not structured as schema
- No explicit type definitions like: `"quantity": { "type": "number", "minimum": 0 }`
- Missing constraints: nullable fields, enum values for operation types, timestamp formats

**Suggested Fix:** Define complete JSON schemas for all outputs:
```json
// low-stock-report JSON output schema
{
  "type": "array",
  "items": {
    "type": "object",
    "required": ["sku", "name", "quantity", "min_stock_level", "deficit"],
    "properties": {
      "sku": {
        "type": "string",
        "minLength": 1,
        "maxLength": 50
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 255
      },
      "quantity": {
        "type": "integer",
        "minimum": 0,
        "maximum": 999999999
      },
      "min_stock_level": {
        "type": "integer",
        "minimum": 0,
        "maximum": 999999999
      },
      "deficit": {
        "type": "integer",
        "minimum": 1,
        "description": "Amount needed to reach min_stock_level (positive integer)"
      }
    }
  }
}

// search JSON output schema
{
  "type": "array",
  "items": {
    "type": "object",
    "required": ["sku", "name", "quantity", "location"],
    "properties": {
      "sku": { "type": "string" },
      "name": { "type": "string" },
      "quantity": { "type": "integer", "minimum": 0 },
      "location": {
        "type": ["string", "null"],
        "description": "NULL represented as JSON null, never omitted"
      }
    }
  }
}
```

#### Finding 4: No defined error response schemas with structured error codes
**Description:** Error handling documentation describes error messages and exit codes but lacks structured error response schemas. Modern APIs return JSON error objects with error codes, messages, and metadata. The current CLI only outputs text to stderr with exit codes.

**Affected Files:**
- falcon_test/apps/app1/docs/systems/errors.md (entire file: text error messages, no structured schemas)
- falcon_test/apps/app1/docs/systems/cli/interface.md (no error response format section)

**Evidence:**
- errors.md line 28: Documents exit codes (0-4, 130) but no error object structure
- errors.md line 153: Shows plain text error messages like "Error: SKU cannot be empty." without JSON structure
- No error code taxonomy beyond exit codes (e.g., ERR_VALIDATION_001, ERR_DB_LOCKED)
- CLI/interface.md has no section on structured error responses

**Suggested Fix:** Define error response schema:
```json
// Error response schema
{
  "type": "object",
  "required": ["error", "code", "message"],
  "properties": {
    "error": {
      "type": "string",
      "enum": ["ValidationError", "DatabaseError", "NotFoundError", "DuplicateError"]
    },
    "code": {
      "type": "string",
      "pattern": "^ERR_[A-Z_]+$",
      "examples": [
        "ERR_VALIDATION_SKU_EMPTY",
        "ERR_DB_LOCKED",
        "ERR_NOT_FOUND",
        "ERR_DUPLICATE_SKU"
      ]
    },
    "message": {
      "type": "string",
      "description": "Human-readable error message"
    },
    "details": {
      "type": "object",
      "description": "Additional context (field name, current value, etc.)",
      "properties": {
        "field": { "type": "string" },
        "constraint": { "type": "string" },
        "provided_value": { "type": ["string", "number", "null"] }
      }
    },
    "suggestion": {
      "type": "string",
      "description": "Optional suggestion for fixing the error"
    }
  }
}

// Example error response instances:
{
  "error": "ValidationError",
  "code": "ERR_VALIDATION_SKU_LENGTH",
  "message": "SKU must be 50 characters or fewer. Got: 75",
  "details": {
    "field": "sku",
    "constraint": "maxLength",
    "provided_value": "A_VERY_LONG_SKU_THAT_EXCEEDS_THE_MAXIMUM_LENGTH_OF_50_CHARACTERS_..."
  }
}
```

#### Finding 5: Missing validation rule schemas for input constraints
**Description:** Validation rules are documented informally in prose across multiple files but not as structured schemas that could be machine-readable or programmatically validated. For example, components.md mentions validation functions but doesn't specify their rule sets formally.

**Affected Files:**
- falcon_test/apps/app1/docs/design/components.md (lines 250-257: lists validators without rule schemas)
- falcon_test/apps/app1/docs/systems/cli/interface.md (validation rules scattered throughout)
- falcon_test/apps/app1/docs/design/technical.md (lines 191-199: describes validation philosophy, not schemas)

**Evidence:**
- components.md line 251: `validate_sku(sku: str) → str  # raises ValidationError` - signature without rule spec
- No schema defining: allowed characters for SKU, exact regex pattern, length bounds
- technical.md AD5 states validation occurs "at boundary" but doesn't define validation rule format
- Validation constraints are in prose: "max 50 chars, alphanumeric/hyphen/underscore only"

**Suggested Fix:** Define validation rule schemas:
```json
// Validation rules schema
{
  "field_validations": {
    "sku": {
      "type": "string",
      "required": true,
      "constraints": {
        "minLength": 1,
        "maxLength": 50,
        "pattern": "^[A-Za-z0-9_-]+$",
        "patternDescription": "Alphanumeric, hyphen, and underscore only"
      },
      "normalization": {
        "trim": true,
        "description": "Leading and trailing whitespace stripped before validation"
      },
      "error_codes": {
        "empty": "ERR_VALIDATION_SKU_EMPTY",
        "tooLong": "ERR_VALIDATION_SKU_LENGTH",
        "invalidChars": "ERR_VALIDATION_SKU_CHARS"
      }
    },
    "name": {
      "type": "string",
      "required": true,
      "constraints": {
        "minLength": 1,
        "maxLength": 255
      },
      "normalization": {
        "trim": true
      },
      "error_codes": {
        "empty": "ERR_VALIDATION_NAME_EMPTY",
        "tooLong": "ERR_VALIDATION_NAME_LENGTH"
      }
    },
    "quantity": {
      "type": "integer",
      "required": true,
      "constraints": {
        "minimum": 0,
        "maximum": 999999999,
        "exclusiveMinimum": false
      },
      "error_codes": {
        "notInteger": "ERR_VALIDATION_QUANTITY_TYPE",
        "negative": "ERR_VALIDATION_QUANTITY_NEGATIVE",
        "tooLarge": "ERR_VALIDATION_QUANTITY_MAX"
      }
    }
  }
}
```

#### Finding 6: No pagination schema definition with field specifications
**Description:** Pagination is mentioned for search and low-stock-report commands (limit/offset parameters) but there's no formal schema defining the pagination metadata structure, link relations, or response envelope format.

**Affected Files:**
- falcon_test/apps/app1/docs/design/technical.md (lines 364-598: discusses pagination but no schema)
- falcon_test/apps/app1/docs/systems/cli/interface.md (pagination mentioned without schema)

**Evidence:**
- technical.md line 518: "Default `limit`: 100 results per query" - parameter documented without response schema
- No definition of pagination metadata like: total_count, has_next_page, current_page
- Missing specification for HATEOAS links: next, previous, first, last
- No envelope structure showing where paginated data vs metadata appears

**Suggested Fix:** Define pagination schema:
```json
// Paginated response envelope schema
{
  "type": "object",
  "required": ["data", "pagination"],
  "properties": {
    "data": {
      "type": "array",
      "items": { "$ref": "#/definitions/Product" },
      "description": "Array of result items"
    },
    "pagination": {
      "type": "object",
      "required": ["limit", "offset", "total", "has_more"],
      "properties": {
        "limit": {
          "type": "integer",
          "minimum": 1,
          "maximum": 1000,
          "description": "Items per page"
        },
        "offset": {
          "type": "integer",
          "minimum": 0,
          "description": "Starting position"
        },
        "total": {
          "type": "integer",
          "minimum": 0,
          "description": "Total items matching query"
        },
        "has_more": {
          "type": "boolean",
          "description": "True if more results available"
        },
        "links": {
          "type": "object",
          "properties": {
            "self": { "type": "string", "format": "uri" },
            "next": { "type": ["string", "null"], "format": "uri" },
            "prev": { "type": ["string", "null"], "format": "uri" },
            "first": { "type": "string", "format": "uri" },
            "last": { "type": "string", "format": "uri" }
          }
        }
      }
    }
  }
}
```

#### Finding 7: Missing Product entity complete field type definitions
**Description:** The Product entity is mentioned throughout documentation but lacks a single authoritative schema definition with complete field types, constraints, and relationships. Different files show partial views of the Product structure.

**Affected Files:**
- falcon_test/apps/app1/docs/design/components.md (lines 230-240: dataclass definition without full specification)
- falcon_test/apps/app1/docs/design/technical.md (lines 299-322: database table schema, not entity schema)
- falcon_test/apps/app1/docs/systems/database/schema.md (table definition but not entity contract)

**Evidence:**
- components.md line 230: Shows `@dataclass` structure but uses comments for constraints instead of formal schema
- technical.md line 300: Shows database columns but type mapping to entity fields unclear (e.g., TEXT → string)
- No JSON Schema or OpenAPI definition of Product as a transferable entity
- Missing: created_at/updated_at timestamp format specification (ISO 8601 mentioned but not formally defined)

**Suggested Fix:** Define complete Product entity schema:
```json
// Product entity schema
{
  "type": "object",
  "required": ["sku", "name", "quantity", "min_stock_level", "created_at", "updated_at"],
  "properties": {
    "id": {
      "type": ["integer", "null"],
      "description": "Database primary key, null for unsaved entities",
      "readOnly": true
    },
    "sku": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50,
      "pattern": "^[A-Za-z0-9_-]+$",
      "description": "Stock Keeping Unit, unique identifier"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 255,
      "description": "Product name"
    },
    "description": {
      "type": ["string", "null"],
      "maxLength": 4096,
      "description": "Optional product description"
    },
    "quantity": {
      "type": "integer",
      "minimum": 0,
      "maximum": 999999999,
      "description": "Current stock quantity"
    },
    "min_stock_level": {
      "type": "integer",
      "minimum": 0,
      "maximum": 999999999,
      "default": 10,
      "description": "Reorder point threshold"
    },
    "location": {
      "type": ["string", "null"],
      "maxLength": 100,
      "description": "Storage location (e.g., 'Aisle-A', 'Bin-42')"
    },
    "created_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$",
      "description": "ISO 8601 timestamp with timezone",
      "readOnly": true,
      "example": "2026-01-23T10:30:00Z"
    },
    "updated_at": {
      "type": "string",
      "format": "date-time",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$",
      "description": "ISO 8601 timestamp with timezone",
      "readOnly": true,
      "example": "2026-01-23T14:45:30Z"
    }
  }
}
```

#### Finding 8: LowStockItem entity incomplete field specifications
**Description:** LowStockItem is used in low-stock reports but lacks formal schema definition. It's mentioned in components.md and use-cases.md but without complete type specifications and constraints.

**Affected Files:**
- falcon_test/apps/app1/docs/design/components.md (lines 243-248: dataclass without schema)
- falcon_test/apps/app1/docs/design/use-cases.md (lines 216-226: informal structure)

**Evidence:**
- components.md line 243: Shows `@dataclass` for LowStockItem with 5 fields but no constraint specs
- use-cases.md line 216: Shows JSON example but doesn't define schema formally
- Missing: specification that deficit is always positive integer, how deficit is calculated
- No definition of required vs optional fields

**Suggested Fix:** Define LowStockItem schema:
```json
// LowStockItem entity schema
{
  "type": "object",
  "required": ["sku", "name", "quantity", "min_stock_level", "deficit"],
  "properties": {
    "sku": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50,
      "description": "Stock Keeping Unit"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 255,
      "description": "Product name"
    },
    "quantity": {
      "type": "integer",
      "minimum": 0,
      "maximum": 999999999,
      "description": "Current stock level"
    },
    "min_stock_level": {
      "type": "integer",
      "minimum": 0,
      "maximum": 999999999,
      "description": "Reorder threshold"
    },
    "deficit": {
      "type": "integer",
      "minimum": 1,
      "exclusiveMinimum": true,
      "description": "Amount needed to reach min_stock_level. Always positive. Calculated as: max(0, min_stock_level - quantity). Items with deficit=0 are excluded from report."
    }
  },
  "constraints": {
    "businessRule": "deficit = min_stock_level - quantity, must be > 0 to appear in report"
  }
}
```

#### Finding 9: No defined authentication/authorization mechanisms
**Description:** The entire application lacks authentication/authorization design. There are no API keys, OAuth flows, role-based access control (RBAC), or user management features defined. Security model relies solely on filesystem permissions.

**Affected Files:**
- falcon_test/apps/app1/docs/design/vision.md (lines 67-106: security section mentions only file permissions)
- falcon_test/apps/app1/docs/systems/database/schema.md (lines 22-93: security focused on encryption, not authn/authz)
- All documentation files (no mention of users, roles, permissions, sessions)

**Evidence:**
- vision.md line 70: "No authentication system, no user management" explicitly stated as non-goal
- No User entity, Role entity, or Permission entity defined
- No API authentication methods: no Bearer tokens, API keys, OAuth, JWT
- Security model is single-user file-system-based only
- Multi-user access explicitly marked as out of scope (vision.md line 70)

**Suggested Fix:** If multi-user support is needed, define:
```json
// Authentication schema (if multi-user support added)
{
  "authentication_methods": [
    {
      "method": "API_KEY",
      "schema": {
        "header": "X-API-Key",
        "format": "string",
        "pattern": "^[A-Za-z0-9]{32}$",
        "description": "32-character alphanumeric API key"
      }
    },
    {
      "method": "JWT",
      "schema": {
        "header": "Authorization",
        "format": "Bearer {token}",
        "algorithm": "HS256",
        "claims": {
          "sub": "user_id",
          "exp": "expiration timestamp",
          "roles": "array of role strings"
        }
      }
    }
  ],
  "authorization_model": {
    "type": "RBAC",
    "roles": [
      {
        "name": "admin",
        "permissions": ["read", "write", "delete", "export"]
      },
      {
        "name": "operator",
        "permissions": ["read", "write"]
      },
      {
        "name": "viewer",
        "permissions": ["read"]
      }
    ],
    "resource_types": ["products", "reports", "config"],
    "permission_format": "{action}:{resource_type}"
  }
}
```
Note: Currently this is a non-goal per vision.md, but documenting the gap for completeness.

#### Finding 10: Missing relationship schemas between entities
**Description:** While the documentation mentions relationships (e.g., LowStockItem is derived from Product), there are no formal definitions of entity relationships, foreign keys, or how entities relate to each other in a structured way.

**Affected Files:**
- falcon_test/apps/app1/docs/design/technical.md (lines 299-322: single products table, no relationships)
- falcon_test/apps/app1/docs/design/components.md (lines 230-248: entities defined independently)
- falcon_test/apps/app1/docs/systems/database/schema.md (no foreign key relationships defined)

**Evidence:**
- Database schema shows only a single `products` table with no foreign keys
- No tables for: categories, suppliers, orders, inventory_movements, locations
- LowStockItem relationship to Product is implicit (derived data) but not formalized
- No junction tables or many-to-many relationships
- Missing: how Product relates to Location (if locations are first-class entities)

**Suggested Fix:** Define relationship schemas:
```json
// Entity relationship schema
{
  "entities": {
    "Product": {
      "primary_key": "id",
      "unique_keys": ["sku"],
      "relationships": {
        "location": {
          "type": "many-to-one",
          "target_entity": "Location",
          "foreign_key": "location_id",
          "optional": true,
          "description": "Product stored at a location"
        }
      }
    },
    "LowStockItem": {
      "type": "view",
      "description": "Derived from Product with quantity < min_stock_level",
      "source_entity": "Product",
      "derivation": "SELECT sku, name, quantity, min_stock_level, (min_stock_level - quantity) AS deficit FROM products WHERE quantity < min_stock_level"
    }
  }
}

// If expanding to multi-table design:
{
  "relationships": [
    {
      "name": "product_location",
      "type": "many-to-one",
      "from_entity": "Product",
      "from_field": "location_id",
      "to_entity": "Location",
      "to_field": "id",
      "on_delete": "SET NULL",
      "description": "Products are stored at locations"
    },
    {
      "name": "product_category",
      "type": "many-to-one",
      "from_entity": "Product",
      "from_field": "category_id",
      "to_entity": "Category",
      "to_field": "id",
      "on_delete": "RESTRICT",
      "description": "Products belong to categories"
    }
  ]
}
```
Note: Current single-table design may be intentional for simplicity. If future expansion is planned, relationships should be documented.

## Coverage Summary
- **Features with complete API:** 0/8 (init, add-item, update-item, update-stock, delete-item, search, low-stock-report, export-csv all lack HTTP endpoints)
- **Entities with complete schemas:** 0/2 (Product and LowStockItem have partial definitions only)
- **Endpoints defined:** 0 (CLI-only application)
- **Commands with formal request/response schemas:** 0/8
- **JSON output schemas with field types:** 0/8 (informal examples only, no JSON Schema)
- **Error response schemas:** 0 (text-only error messages)
- **Validation rule schemas:** 0 (prose descriptions only)
- **Authentication mechanisms:** 0 (single-user, no authn/authz)
- **Authorization mechanisms:** 0 (file-system permissions only)
- **Entity relationship definitions:** 0 (implicit relationships not formalized)

## Recommendations

### Critical (must address for API integration)
1. **If HTTP API is needed:** Define complete REST/GraphQL API specification with endpoints, HTTP methods, request/response schemas
2. **Formalize schemas:** Convert all informal type descriptions to JSON Schema or OpenAPI format
3. **Define error schema:** Create structured error response format with error codes beyond exit codes

### High Priority (improve specification quality)
4. **Complete Product schema:** Single authoritative schema with all fields, types, constraints
5. **Validation rules schema:** Machine-readable validation rules for automated validation
6. **Pagination schema:** Formal pagination metadata structure

### Medium Priority (future enhancements)
7. **Authentication/Authorization:** If multi-user support needed, define authn/authz model
8. **Entity relationships:** If expanding to multi-table design, document foreign key relationships
9. **API versioning strategy:** If adding HTTP API, define versioning approach (URL path, header, etc.)

### Low Priority (documentation quality)
10. **Consolidate schemas:** Create single "API Reference" document with all schemas in one place

## Notes
- This application is intentionally CLI-only per design/vision.md, which explains the lack of HTTP API endpoints
- Single-user model explains the absence of authentication/authorization features
- Simple single-table database design explains minimal entity relationships
- However, even for CLI applications, formal schema definitions would improve:
  - Automated testing (contract testing)
  - Code generation (from schemas)
  - Documentation clarity
  - Integration with tools expecting structured specs
