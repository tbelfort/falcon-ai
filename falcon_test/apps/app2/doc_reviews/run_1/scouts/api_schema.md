# API/Schema Coverage Scout Report

## Status: GAPS_FOUND

## Findings Summary

| # | Title | Affected Files |
|---|-------|----------------|
| 1 | No API endpoints defined - CLI-only interface documented | ALL |
| 2 | Missing request/response schemas for programmatic access | ALL |
| 3 | No HTTP methods specified (not a REST API) | ALL |
| 4 | Missing API authentication/authorization design | ALL |
| 5 | No paginated API endpoint for large transaction lists | interface.md, schema.md |
| 6 | Missing error response format specification | errors.md |
| 7 | No API rate limiting or quota design | N/A |
| 8 | Missing API versioning strategy | N/A |
| 9 | Field-level validation rules not in structured schema format | models.py (components.md), interface.md |
| 10 | CSV export schema incomplete - injection prevention not documented as schema constraint | interface.md |
| 11 | Missing structured schema for import CSV format | interface.md |
| 12 | Database schema lacks CHECK constraints for field validation | schema.md |
| 13 | No schema definition for verbose mode debug output | interface.md, errors.md |
| 14 | Budget report calculation logic not expressed as schema | schema.md |
| 15 | Balance calculation aggregate schema undefined | schema.md |

## Finding Details

#### Finding 1: No API endpoints defined - CLI-only interface documented
**Description:** The entire system is documented as a CLI tool with no HTTP API, REST endpoints, or programmatic access layer. All operations are command-line driven (`finance-cli <command>`). There are no endpoint paths like `/api/transactions`, no HTTP verbs (GET/POST/PUT/DELETE), and no web service layer.

**Affected Files:**
- falcon_test/apps/app2/docs/design/vision.md (explicitly states "no cloud sync", "no web interface")
- falcon_test/apps/app2/docs/design/technical.md (architecture shows CLI->Commands->Database, no API layer)
- falcon_test/apps/app2/docs/systems/cli/interface.md (documents CLI commands only)
- falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md (architecture diagram has no API layer)

**Evidence:**
From vision.md: "No cloud sync: No sync, no mobile app, no web interface."
From architecture diagram: Shows `cli.py -> commands.py -> database.py -> SQLite` with no HTTP/API layer.
All interface documentation in interface.md uses syntax like `finance-cli add-transaction --account ACCT` rather than REST endpoints.

**Suggested Fix:** Add API layer specification with:
- REST endpoint definitions (e.g., `POST /api/v1/transactions`, `GET /api/v1/accounts`)
- HTTP method specifications for each resource
- Request/response body schemas in JSON format
- Content-Type headers (application/json)
- Base URL and versioning strategy
- Authentication requirements (if any)

Example structure:
```
POST /api/v1/transactions
Content-Type: application/json

Request:
{
  "account_id": 1,
  "category_id": 3,
  "amount": "-45.67",
  "description": "Weekly groceries",
  "date": "2026-01-15"
}

Response (201 Created):
{
  "id": 42,
  "account_id": 1,
  "category_id": 3,
  "amount": "-45.67",
  "description": "Weekly groceries",
  "date": "2026-01-15",
  "created_at": "2026-01-15T09:00:00Z"
}
```

#### Finding 2: Missing request/response schemas for programmatic access
**Description:** While the CLI interface is fully documented, there are no structured request/response schemas that would enable programmatic access via API calls, libraries, or SDKs. The system has data models (Account, Category, Transaction, Budget) but no serialization schemas defining how these are represented in API payloads.

**Affected Files:**
- falcon_test/apps/app2/docs/design/components.md (defines Python dataclasses but not API schemas)
- falcon_test/apps/app2/docs/systems/cli/interface.md (shows CLI syntax but no JSON request bodies)

**Evidence:**
components.md defines dataclasses like:
```python
@dataclass
class Transaction:
    id: int | None
    account_id: int
    category_id: int
    amount_cents: int
    description: str | None
    transaction_date: str
    created_at: str
```

But there's no corresponding API schema showing:
- Which fields are required in POST requests
- Which fields are read-only (id, created_at)
- Whether to use `amount_cents` (internal) or `amount` (decimal string) in API
- Validation constraints per field

**Suggested Fix:** Define API schemas for each entity with:
- Request schema (for POST/PUT operations)
- Response schema (for GET operations)
- Field requirements (required/optional)
- Read-only fields
- Validation rules per field
- Example payloads

Example:
```
Transaction Request Schema (POST /api/v1/transactions):
{
  "account_id": integer (required, must exist),
  "category_id": integer (required, must exist),
  "amount": string (required, decimal format, max 2 decimal places, e.g., "-45.67"),
  "description": string (optional, max 500 chars),
  "date": string (optional, ISO 8601 date, defaults to today)
}

Transaction Response Schema:
{
  "id": integer (read-only),
  "account_id": integer,
  "category_id": integer,
  "amount": string (decimal format),
  "description": string | null,
  "date": string (ISO 8601),
  "created_at": string (ISO 8601 timestamp, read-only)
}
```

#### Finding 3: No HTTP methods specified (not a REST API)
**Description:** The system has no HTTP method specifications because it's a CLI tool, not a REST API. All operations are CLI commands with flags rather than RESTful resources with GET/POST/PUT/DELETE verbs.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/cli/interface.md (CLI commands only)
- falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md (no HTTP layer)

**Evidence:**
Interface specifies commands like:
- `finance-cli add-transaction --account ACCT --amount AMT --category CAT`
- `finance-cli list-transactions [filters]`
- `finance-cli balance [--account ACCT]`

No REST endpoints like:
- `POST /transactions` (create)
- `GET /transactions` (list)
- `GET /transactions/:id` (retrieve)
- `PUT /transactions/:id` (update)
- `DELETE /transactions/:id` (delete)

**Suggested Fix:** If REST API is needed, define HTTP methods for each resource:

**Accounts:**
- `GET /api/v1/accounts` - List all accounts
- `POST /api/v1/accounts` - Create account
- `GET /api/v1/accounts/:id` - Get account details
- `GET /api/v1/accounts/:id/balance` - Get account balance

**Categories:**
- `GET /api/v1/categories` - List all categories
- `POST /api/v1/categories` - Create category
- `GET /api/v1/categories/:id` - Get category details

**Transactions:**
- `GET /api/v1/transactions` - List transactions (with query params for filters)
- `POST /api/v1/transactions` - Create transaction
- `GET /api/v1/transactions/:id` - Get transaction details

**Budgets:**
- `GET /api/v1/budgets` - List budgets
- `PUT /api/v1/budgets/:category_id/:month` - Set/update budget
- `GET /api/v1/budgets/reports/:month` - Get budget report

#### Finding 4: Missing API authentication/authorization design
**Description:** No authentication or authorization mechanism is documented for API access. The CLI tool is single-user with filesystem permissions as the security boundary, but if exposed as an API, it would need authentication.

**Affected Files:**
- falcon_test/apps/app2/docs/design/vision.md (states "no auth" for single-user CLI)
- falcon_test/apps/app2/docs/systems/architecture/ARCHITECTURE-simple.md (no auth layer)

**Evidence:**
vision.md: "Multi-user access: This is single-user. No auth, no concurrent writes."
No documentation of:
- API keys
- JWT tokens
- OAuth flows
- Session management
- User/tenant isolation

**Suggested Fix:** If API is added, specify authentication:
- Auth mechanism (API keys, JWT, OAuth 2.0)
- Token format and validation
- Request headers (e.g., `Authorization: Bearer <token>`)
- Error responses for auth failures (401 Unauthorized, 403 Forbidden)
- Rate limiting per user/token
- Multi-tenancy model if multiple users

Example:
```
Authentication: Bearer token (JWT)

Headers:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Error responses:
401 Unauthorized: Missing or invalid token
403 Forbidden: Valid token but insufficient permissions
```

#### Finding 5: No paginated API endpoint for large transaction lists
**Description:** The CLI `list-transactions` command has a `--limit` parameter (default 50, max unspecified), but there's no cursor-based or offset-based pagination design for API access. The database could contain 100,000+ transactions, but the API design doesn't address how to iterate through large result sets efficiently.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/cli/interface.md (documents `--limit` but no pagination)
- falcon_test/apps/app2/docs/systems/database/schema.md (search query has LIMIT but no OFFSET)

**Evidence:**
interface.md: `--limit N | integer | 50 | Maximum transactions to return`
schema.md: `ORDER BY t.transaction_date DESC, t.id DESC LIMIT ?;` (no OFFSET parameter)

No specification of:
- Pagination strategy (offset-based, cursor-based, page number-based)
- Response metadata (total count, next page cursor, has_more flag)
- Max page size limits
- Handling of result set changes during pagination

**Suggested Fix:** Add pagination specification:

**Offset-based pagination:**
```
GET /api/v1/transactions?limit=50&offset=100

Response:
{
  "data": [...],
  "pagination": {
    "total": 1542,
    "limit": 50,
    "offset": 100,
    "has_more": true
  }
}
```

**Cursor-based pagination (preferred for large datasets):**
```
GET /api/v1/transactions?limit=50&after_id=42

Response:
{
  "data": [...],
  "pagination": {
    "limit": 50,
    "next_cursor": "eyJpZCI6OTJ9",
    "has_more": true
  }
}
```

Update schema.md query to support OFFSET or cursor:
```sql
-- Offset-based
SELECT ... ORDER BY t.transaction_date DESC, t.id DESC LIMIT ? OFFSET ?;

-- Cursor-based
SELECT ... WHERE t.id < ? ORDER BY t.transaction_date DESC, t.id DESC LIMIT ?;
```

#### Finding 6: Missing error response format specification
**Description:** Error handling is well-documented for the CLI (stderr messages, exit codes), but there's no structured error response format for API consumers. The errors.md file specifies text messages and exit codes, but no JSON error schema with machine-readable error codes.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/errors.md (CLI error messages only)
- falcon_test/apps/app2/docs/systems/cli/interface.md (exit codes but no HTTP status codes)

**Evidence:**
errors.md defines error messages like:
```
Error: Account 'Main Checking' already exists.
Exit code: 4
```

But no JSON error response like:
```json
{
  "error": {
    "code": "DUPLICATE_ACCOUNT",
    "message": "Account 'Main Checking' already exists.",
    "field": "name",
    "value": "Main Checking"
  }
}
```

**Suggested Fix:** Define structured error response schema:

```
Error Response Schema:
HTTP Status: 4xx/5xx
Content-Type: application/json

{
  "error": {
    "code": string (machine-readable error code, e.g., "DUPLICATE_ACCOUNT"),
    "message": string (human-readable error message),
    "field": string (optional, field that caused error),
    "details": object (optional, additional context)
  }
}

Error code mapping:
- VALIDATION_ERROR -> 400 Bad Request
- DUPLICATE_ACCOUNT -> 409 Conflict
- DUPLICATE_CATEGORY -> 409 Conflict
- NOT_FOUND -> 404 Not Found
- DATABASE_ERROR -> 500 Internal Server Error
- INVALID_DATE_FORMAT -> 400 Bad Request
- INVALID_AMOUNT -> 400 Bad Request
- PATH_TRAVERSAL -> 400 Bad Request

Example error responses:
{
  "error": {
    "code": "DUPLICATE_ACCOUNT",
    "message": "Account 'Checking' already exists.",
    "field": "name",
    "value": "Checking"
  }
}

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid amount format. Expected decimal with up to 2 decimal places.",
    "field": "amount",
    "value": "not-a-number"
  }
}
```

#### Finding 7: No API rate limiting or quota design
**Description:** The CLI tool has no rate limiting (runs locally, single-user), but if exposed as an API, it would need rate limiting to prevent abuse. No documentation of request quotas, throttling, or 429 error responses.

**Affected Files:** N/A (missing entirely)

**Evidence:**
No mention of rate limiting in any documentation.
Single-user CLI design doesn't require it.

**Suggested Fix:** If API is added, specify rate limiting:

```
Rate Limiting:
- 100 requests per minute per API key
- 1000 requests per hour per API key
- Rate limit headers in all responses:
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 45
  X-RateLimit-Reset: 1643723400

Error response (429 Too Many Requests):
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Try again in 30 seconds.",
    "retry_after": 30
  }
}
```

#### Finding 8: Missing API versioning strategy
**Description:** No API versioning is documented. If the system evolves (e.g., adding new fields, changing schemas), there's no strategy for backward compatibility or version negotiation.

**Affected Files:** N/A (missing entirely)

**Evidence:**
No discussion of API versions, schema evolution, or compatibility.

**Suggested Fix:** Define versioning strategy:

**URL-based versioning (recommended for simplicity):**
```
/api/v1/transactions
/api/v2/transactions

Version in URL path. When breaking changes are needed, increment major version.
```

**Header-based versioning (alternative):**
```
GET /api/transactions
Accept: application/vnd.finance-cli.v1+json

Response:
Content-Type: application/vnd.finance-cli.v1+json
```

**Deprecation policy:**
- Announce deprecation 6 months before removal
- Support N-1 versions (e.g., if v3 is current, v2 is supported but v1 is removed)
- Include deprecation warnings in response headers:
  ```
  Deprecation: true
  Sunset: Sat, 31 Dec 2026 23:59:59 GMT
  ```

#### Finding 9: Field-level validation rules not in structured schema format
**Description:** Validation rules are scattered across prose documentation in components.md and interface.md, but not consolidated into a structured schema definition (e.g., JSON Schema, OpenAPI). This makes it hard to generate validators, SDKs, or API documentation automatically.

**Affected Files:**
- falcon_test/apps/app2/docs/design/components.md (validation functions defined as prose)
- falcon_test/apps/app2/docs/systems/cli/interface.md (constraints in tables)

**Evidence:**
components.md has validation functions like:
```python
def validate_account_name(name: str) -> str:
    """Validate account name.
    ...
    Raises:
        ValidationError: If name is empty or exceeds 50 characters
    """
```

But no structured schema like:
```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50
    }
  }
}
```

**Suggested Fix:** Create structured schema definitions using JSON Schema or OpenAPI format:

**Account Schema (JSON Schema):**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name", "account_type"],
  "properties": {
    "id": {
      "type": "integer",
      "readOnly": true
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50,
      "description": "Account name"
    },
    "account_type": {
      "type": "string",
      "enum": ["checking", "savings", "credit", "cash"],
      "description": "Account type"
    },
    "created_at": {
      "type": "string",
      "format": "date-time",
      "readOnly": true
    }
  }
}
```

**Transaction Schema (JSON Schema):**
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["account_id", "category_id", "amount"],
  "properties": {
    "id": {
      "type": "integer",
      "readOnly": true
    },
    "account_id": {
      "type": "integer",
      "description": "Must reference existing account"
    },
    "category_id": {
      "type": "integer",
      "description": "Must reference existing category"
    },
    "amount": {
      "type": "string",
      "pattern": "^-?\\d+(\\.\\d{1,2})?$",
      "description": "Decimal amount with max 2 decimal places"
    },
    "description": {
      "type": ["string", "null"],
      "maxLength": 500
    },
    "date": {
      "type": "string",
      "format": "date",
      "description": "ISO 8601 date (YYYY-MM-DD)"
    },
    "created_at": {
      "type": "string",
      "format": "date-time",
      "readOnly": true
    }
  }
}
```

This allows auto-generation of validators, API docs, and client SDKs.

#### Finding 10: CSV export schema incomplete - injection prevention not documented as schema constraint
**Description:** CSV injection prevention is described in technical.md and interface.md as a procedural rule (prefix with single quote), but not encoded as a schema-level constraint. The CSV export format specification doesn't include the injection prevention as part of the formal schema definition.

**Affected Files:**
- falcon_test/apps/app2/docs/design/technical.md (describes CSV injection prevention)
- falcon_test/apps/app2/docs/systems/cli/interface.md (mentions prefixing but not in formal schema)

**Evidence:**
technical.md states:
"TEXT fields starting with the following characters MUST be prefixed with a single quote (`'`): `=`, `+`, `-`, `@`, `\t`, `\r`"

But the CSV export format in interface.md shows:
```
CSV format:
- Header: id,date,account,category,amount,description
- Encoding: UTF-8
- Delimiter: comma
```

No schema shows the actual output format with injection prevention applied.

**Suggested Fix:** Define complete CSV export schema with injection prevention:

```
CSV Export Schema:

Header Row:
id,date,account,category,amount,description

Data Rows (with sanitization applied):

Field: id
  Type: integer
  Format: raw number (no quotes unless contains comma)
  Example: 42

Field: date
  Type: string
  Format: YYYY-MM-DD
  Example: 2026-01-15

Field: account
  Type: string
  Format: quoted if contains comma/quote/newline
  Sanitization: prefix with ' if starts with =, +, -, @, \t, \r
  Example: "Main Checking" OR "'=SUM(A1:A10)" (injection prevented)

Field: category
  Type: string
  Format: quoted if contains comma/quote/newline
  Sanitization: prefix with ' if starts with =, +, -, @, \t, \r
  Example: Groceries OR "'+COMMAND" (injection prevented)

Field: amount
  Type: number
  Format: decimal (no quotes)
  Exception: NO sanitization even if starts with - (negative amounts)
  Example: -45.67

Field: description
  Type: string | null
  Format: quoted if contains comma/quote/newline, empty string if null
  Sanitization: prefix with ' if starts with =, +, -, @, \t, \r
  Example: "Weekly groceries" OR "'=1+1" (injection prevented)

Complete example row:
42,2026-01-15,"Main Checking",Groceries,-45.67,"Weekly groceries"

Example with injection prevention:
43,2026-01-16,"'=SUM(A1:A10)",Hacking,-100.00,"'@SHELL_CMD"
```

#### Finding 11: Missing structured schema for import CSV format
**Description:** CSV import format is partially specified in interface.md (header row, field order), but there's no formal schema defining field types, allowed values, or validation rules that apply during import.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/cli/interface.md (describes expected format as prose)

**Evidence:**
interface.md states:
```
Expected CSV format:
- Header row required: date,account,category,amount,description
- Date format: YYYY-MM-DD
- Amount: decimal (negative=expense, positive=income)
- Description column is optional
```

But no structured schema defining:
- Exact field order requirements
- Type validation per field
- How nulls/empty cells are handled
- Whether quotes are required or optional
- How the import differs from export (no id column)

**Suggested Fix:** Define formal CSV import schema:

```
CSV Import Schema:

Required Header Row (exact match):
date,account,category,amount,description

Field Specifications:

Field: date
  Position: 1
  Type: string
  Format: YYYY-MM-DD (ISO 8601)
  Required: yes
  Validation: must be valid date, year 1000-9999, month 01-12, day valid for month
  Example: 2026-01-15

Field: account
  Position: 2
  Type: string
  Format: unquoted or quoted
  Required: yes
  Validation: must match existing account name (case-sensitive)
  Max length: 50 chars
  Example: Checking OR "Main Checking"

Field: category
  Position: 3
  Type: string
  Format: unquoted or quoted
  Required: yes
  Validation: must match existing category name (case-sensitive)
  Max length: 50 chars
  Example: Groceries OR "Auto & Transport"

Field: amount
  Position: 4
  Type: string (parsed as decimal)
  Format: [-]DDDD.DD (up to 2 decimal places)
  Required: yes
  Validation: must match regex ^-?\d+(\.\d{1,2})?$, must be >= -999999999.99 and <= 999999999.99
  Example: -45.67 OR 5000.00

Field: description
  Position: 5
  Type: string | null
  Format: unquoted, quoted, or empty
  Required: no (can be omitted from header, or empty cell)
  Validation: max 500 chars if present
  Null handling: empty cell or missing column treated as NULL
  Example: "Weekly groceries" OR "" OR (cell omitted)

Parsing Rules:
- RFC 4180 compliant CSV parsing
- Fields with commas/quotes/newlines must be quoted
- Quotes within fields escaped as ""
- UTF-8 encoding
- LF or CRLF line endings accepted

Import Process:
1. Validate header row matches exactly (case-sensitive)
2. For each data row:
   - Validate field count matches header
   - Validate each field type and format
   - Check account exists in database
   - Check category exists in database
3. If all rows valid, insert in single transaction
4. If any row invalid, fail entire import with row number

Example valid CSV:
date,account,category,amount,description
2026-01-15,Checking,Groceries,-45.67,"Weekly shopping"
2026-01-16,Savings,Salary,5000.00,
2026-01-17,"Main Checking","Auto & Transport",-30.00,"Gas station"
```

#### Finding 12: Database schema lacks CHECK constraints for field validation
**Description:** The database schema in schema.md has some CHECK constraints (account_type, category_type, amount_cents > 0 for budgets), but many validation rules are enforced only at the application layer. This creates data integrity risks if the database is accessed directly or if application bugs bypass validation.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/database/schema.md

**Evidence:**
schema.md shows:
```sql
CREATE TABLE accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE,
    account_type TEXT    NOT NULL CHECK (account_type IN ('checking', 'savings', 'credit', 'cash')),
    created_at   TEXT    NOT NULL
);
```

But no CHECK constraints for:
- account name length <= 50 chars (app-enforced)
- category name length <= 50 chars (app-enforced)
- description length <= 500 chars (app-enforced)
- amount_cents range validation (app-enforced)
- date format validation (app-enforced)

Note in schema.md:
"The constraint that budgets can only be set on expense categories (not income categories) is enforced at the application layer (CLI validation), not via a CHECK constraint."

**Suggested Fix:** Add database-level CHECK constraints where possible:

```sql
CREATE TABLE accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL UNIQUE
                        CHECK (LENGTH(name) >= 1 AND LENGTH(name) <= 50),
    account_type TEXT    NOT NULL
                        CHECK (account_type IN ('checking', 'savings', 'credit', 'cash')),
    created_at   TEXT    NOT NULL
                        CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*')
);

CREATE TABLE categories (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL UNIQUE
                         CHECK (LENGTH(name) >= 1 AND LENGTH(name) <= 50),
    category_type TEXT    NOT NULL
                         CHECK (category_type IN ('income', 'expense')),
    created_at    TEXT    NOT NULL
                         CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*')
);

CREATE TABLE transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id       INTEGER NOT NULL REFERENCES accounts(id),
    category_id      INTEGER NOT NULL REFERENCES categories(id),
    amount_cents     INTEGER NOT NULL
                            CHECK (amount_cents >= -99999999999 AND amount_cents <= 99999999999),
    description      TEXT    CHECK (description IS NULL OR LENGTH(description) <= 500),
    transaction_date TEXT    NOT NULL
                            CHECK (transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    created_at       TEXT    NOT NULL
                            CHECK (created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*')
);

CREATE TABLE budgets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id   INTEGER NOT NULL REFERENCES categories(id),
    month         TEXT    NOT NULL
                         CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    amount_cents  INTEGER NOT NULL
                         CHECK (amount_cents > 0 AND amount_cents <= 99999999999),
    UNIQUE(category_id, month)
);
```

Note: Budget expense-category constraint still requires application-level enforcement (can't reference categories.category_type in CHECK constraint).

#### Finding 13: No schema definition for verbose mode debug output
**Description:** Verbose mode is described in interface.md and errors.md, but the structure and format of debug output is not formally defined. Debug messages are prose ("DEBUG: Looking up entity by name"), but there's no schema defining message format, severity levels, or structured logging fields.

**Affected Files:**
- falcon_test/apps/app2/docs/systems/cli/interface.md (describes verbose mode behavior)
- falcon_test/apps/app2/docs/systems/errors.md (shows example debug output)

**Evidence:**
errors.md shows example:
```
DEBUG: Connecting to finances.db
DEBUG: Connection established
DEBUG: Looking up entity by name
DEBUG: Found entity ID: 3
```

But no schema defines:
- Message format (prefix, timestamp, log level)
- Structured fields (component, operation, duration)
- Log levels (DEBUG, INFO, WARN, ERROR)
- Machine-readable format for parsing

**Suggested Fix:** Define structured logging schema:

```
Verbose Mode Debug Output Schema:

Format: Plain text (stderr) or JSON (optional --log-json flag)

Plain Text Format:
[TIMESTAMP] [LEVEL] [COMPONENT] message

Example:
[2026-01-23T10:15:30Z] DEBUG [cli] Connecting to database
[2026-01-23T10:15:30Z] DEBUG [database] Connection established
[2026-01-23T10:15:30Z] DEBUG [commands] Looking up entity by name
[2026-01-23T10:15:30Z] DEBUG [database] Query executed in 2ms

JSON Format (optional):
{
  "timestamp": "2026-01-23T10:15:30Z",
  "level": "DEBUG",
  "component": "database",
  "message": "Query executed",
  "duration_ms": 2
}

Log Levels:
- DEBUG: Detailed internal operations (only in verbose mode)
- INFO: High-level operation summaries
- WARN: Non-fatal issues
- ERROR: Fatal errors

Components:
- cli: Argument parsing, command routing
- commands: Business logic
- database: SQL operations
- formatters: Output formatting

Standard fields:
- timestamp: ISO 8601 UTC timestamp
- level: DEBUG/INFO/WARN/ERROR
- component: Source component
- message: Human-readable message
- duration_ms: Optional execution time
- operation: Optional operation name (e.g., "query", "insert")
```

#### Finding 14: Budget report calculation logic not expressed as schema
**Description:** The budget report calculation involves complex aggregation (sum of expenses, percentage calculation), but the output schema is not formally defined. The BudgetReportItem dataclass exists in components.md, but there's no schema showing field definitions, calculation formulas, or edge case handling.

**Affected Files:**
- falcon_test/apps/app2/docs/design/components.md (defines BudgetReportItem dataclass)
- falcon_test/apps/app2/docs/systems/database/schema.md (shows SQL query but not output schema)

**Evidence:**
components.md:
```python
@dataclass
class BudgetReportItem:
    category_id: int
    category_name: str
    budget_cents: int
    spent_cents: int
    remaining_cents: int
    percent_used: float
```

But no schema defines:
- How `remaining_cents` is calculated (budget - spent)
- How `percent_used` is calculated (spent / budget * 100)
- What happens if budget is 0 (division by zero)
- Decimal precision for percent_used
- Whether overspending shows >100% or caps at 100%

**Suggested Fix:** Define budget report output schema with calculation formulas:

```
Budget Report Schema:

Response format (JSON):
{
  "month": "2026-01",
  "categories": [
    {
      "category_id": integer,
      "category_name": string,
      "budget": string (decimal, e.g., "500.00"),
      "spent": string (decimal, e.g., "125.67"),
      "remaining": string (decimal, e.g., "374.33", can be negative),
      "percent_used": number (decimal, e.g., 25.1, can exceed 100)
    }
  ]
}

Field Calculations:

budget:
  - Convert budget_cents from database to decimal: budget_cents / 100
  - If no budget set for category, use 0.00

spent:
  - Sum of ABS(amount_cents) for all transactions where:
    - category_id matches
    - transaction_date >= month start
    - transaction_date < month end
    - amount_cents < 0 (expenses only)
  - Convert to decimal: spent_cents / 100

remaining:
  - Formula: budget - spent
  - Can be negative if overspending
  - Example: 500.00 - 625.00 = -125.00

percent_used:
  - Formula: (spent / budget) * 100
  - Round to 1 decimal place
  - Edge case: if budget = 0, percent_used = 0.0 (not infinity or NaN)
  - Can exceed 100% if overspending
  - Example: (625.00 / 500.00) * 100 = 125.0

Categories included:
  - Only expense categories (income categories excluded)
  - All expense categories shown, even if no budget set (budget = 0.00)
  - Sorted alphabetically by category_name

Example output:
{
  "month": "2026-01",
  "categories": [
    {
      "category_id": 5,
      "category_name": "Entertainment",
      "budget": "150.00",
      "spent": "175.00",
      "remaining": "-25.00",
      "percent_used": 116.7
    },
    {
      "category_id": 3,
      "category_name": "Groceries",
      "budget": "500.00",
      "spent": "125.67",
      "remaining": "374.33",
      "percent_used": 25.1
    },
    {
      "category_id": 8,
      "category_name": "Transportation",
      "budget": "0.00",
      "spent": "45.00",
      "remaining": "-45.00",
      "percent_used": 0.0
    }
  ]
}
```

#### Finding 15: Balance calculation aggregate schema undefined
**Description:** Account balance calculation is defined in SQL (SUM of transactions), but the output schema and calculation rules are not formally specified. The AccountBalance dataclass exists, but edge cases and calculation details are unclear.

**Affected Files:**
- falcon_test/apps/app2/docs/design/components.md (defines AccountBalance dataclass)
- falcon_test/apps/app2/docs/systems/database/schema.md (shows query with COALESCE but no schema)

**Evidence:**
schema.md:
```sql
SELECT
    a.id,
    a.name,
    a.account_type,
    COALESCE(SUM(t.amount_cents), 0) as balance_cents
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
```

But no schema defines:
- How balance is calculated (sum of all amounts)
- Sign convention (positive = asset, negative = liability)
- What COALESCE(SUM(...), 0) does (handles accounts with no transactions)
- Precision and rounding
- How credit card balances are interpreted

**Suggested Fix:** Define balance calculation schema:

```
Account Balance Schema:

Response format (JSON):
{
  "accounts": [
    {
      "account_id": integer,
      "account_name": string,
      "account_type": "checking" | "savings" | "credit" | "cash",
      "balance": string (decimal, e.g., "4829.33" or "-150.00")
    }
  ]
}

Field Calculations:

balance:
  - Formula: SUM(amount_cents) for all transactions where account_id matches
  - If no transactions, balance = 0.00 (via COALESCE)
  - Convert from cents to decimal: balance_cents / 100
  - Precision: exactly 2 decimal places

Sign Convention:
  - Positive balance: asset (money you have)
    - Example: Checking account with $5000.00 balance
  - Negative balance: liability (money you owe)
    - Example: Credit card with -$150.00 balance (you owe $150)

Account Type Interpretation:
  - checking, savings, cash: Positive = funds available, Negative = overdrawn
  - credit: Negative = amount owed, Positive = overpayment/credit

Transaction Amount Convention:
  - Positive amounts: income/deposits/payments
  - Negative amounts: expenses/withdrawals/charges
  - Balance = sum of all amounts (positive + negative)

Edge Cases:
  - Account with no transactions: balance = 0.00
  - Account with only income: balance = positive
  - Account with only expenses: balance = negative
  - Mixed transactions: balance = net of income and expenses

Example balances:
{
  "accounts": [
    {
      "account_id": 1,
      "account_name": "Main Checking",
      "account_type": "checking",
      "balance": "4829.33"
    },
    {
      "account_id": 3,
      "account_name": "Credit Card",
      "account_type": "credit",
      "balance": "-150.00"
    },
    {
      "account_id": 5,
      "account_name": "New Account",
      "account_type": "savings",
      "balance": "0.00"
    }
  ]
}

SQL Implementation:
SELECT
    a.id as account_id,
    a.name as account_name,
    a.account_type,
    COALESCE(SUM(t.amount_cents), 0) as balance_cents
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
WHERE (? IS NULL OR a.id = ?)  -- Optional account filter
GROUP BY a.id, a.name, a.account_type
ORDER BY a.name;

Note: COALESCE ensures accounts with no transactions return 0 instead of NULL.
```

## Coverage Summary
- Features with complete API: 0/10 (no REST API defined)
- Entities with schemas: 4/4 (Python dataclasses exist, but no API schemas)
- Endpoints defined: 0 (CLI commands only, no REST endpoints)
- Request schemas defined: 0
- Response schemas defined: 0
- Pagination defined: No
- Error response schemas: No (exit codes only)
- Authentication: No (single-user CLI)
- Versioning: No
- Rate limiting: No
- Database CHECK constraints: Partial (some constraints, many app-enforced)
