# Fixes Applied to falcon_test/apps/app1/docs/design/use-cases.md

## Changes Made

### Issue ID 86: Soft Delete Feature Incomplete - Missing Database Schema
**What Changed**: Added complete schema definition for `status` and `discontinued_at` columns in UC9 (Deleting or Discontinuing Items), including data types, constraints, defaults, and index information.

**Content Added/Modified**:
```markdown
- **Note**: The database schema columns `status` and `discontinued_at` are defined in `systems/database/schema.md` and MUST be present in the `products` table schema in `technical.md`. See the complete schema definition below:
  - `status` (TEXT): NOT NULL, DEFAULT 'active', CHECK(status IN ('active', 'discontinued'))
  - `discontinued_at` (TEXT): Nullable, ISO 8601 timestamp, CHECK(discontinued_at IS NULL OR (status = 'discontinued' AND datetime(discontinued_at) IS NOT NULL))
  - Index: `idx_products_status` on `status` column for efficient filtering
```

**Rationale**: The original text mentioned that columns were "defined in schema.md" but didn't specify the actual column definitions (types, constraints, defaults, nullability). Implementers needed to know:
- Exact data types (TEXT for both columns)
- Default values (status defaults to 'active')
- Constraints (CHECK constraints for status enum and discontinued_at consistency)
- Nullability (status is NOT NULL, discontinued_at is nullable)
- Index requirements (idx_products_status for efficient filtering)

This fix provides all the information needed to implement the soft delete feature without having to cross-reference schema.md and make arbitrary decisions.

---

### Issue ID 91: Search Pagination Implementation Details Missing
**What Changed**: Added comprehensive pagination documentation to UC5 (Finding Items) and UC4 (Daily Low-Stock Report), including CLI flag names, default values, examples, and output format differences.

**Content Added/Modified**:

**In UC5 (Finding Items):**
```markdown
**Pagination (MANDATORY):**
All search operations include pagination to prevent unbounded result sets. The following flags control pagination behavior:
- `--limit N`: Maximum number of results to return (default: 100, max: 1000)
- `--offset N`: Number of results to skip before returning (default: 0)

**Example with pagination:**
```bash
# First page (default behavior)
warehouse-cli search --name "widget"
# Equivalent to: warehouse-cli search --name "widget" --limit 100 --offset 0

# Next page
warehouse-cli search --name "widget" --limit 100 --offset 100

# Custom page size
warehouse-cli search --name "widget" --limit 50 --offset 0
```

**Pagination in table format:**
When using the default table format, pagination information is printed to stderr:
```
Showing items 1-100 of 250 total. Use --offset 100 to see more results.
```

**Pagination in JSON format:**
When using `--format json`, pagination metadata is included in the response envelope:
```json
{
  "data": [...],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "count": 100,
    "total": 250,
    "has_more": true
  }
}
```
```

**In UC4 (Daily Low-Stock Report):**
```markdown
**Pagination (MANDATORY):**
Low-stock reports include pagination to prevent unbounded result sets:
- `--limit N`: Maximum number of items to return (default: 100, max: 1000)
- `--offset N`: Number of items to skip (default: 0)
- Example: `warehouse-cli low-stock-report --format json --limit 50 --offset 0`
- For automation scripts processing all low-stock items, iterate through pages:
  ```bash
  # Process all low-stock items in batches of 100
  OFFSET=0
  while true; do
    RESULT=$(warehouse-cli low-stock-report --format json --limit 100 --offset $OFFSET)
    COUNT=$(echo "$RESULT" | jq '.pagination.count')
    [ "$COUNT" -eq 0 ] && break
    # Process this batch...
    OFFSET=$((OFFSET + 100))
  done
  ```
```

**Rationale**: The original documentation stated pagination was "MANDATORY" but didn't show the CLI flags in use case examples. Implementers couldn't determine:
- Flag names (--limit vs --page-size? --offset vs --skip?)
- Default behavior (what happens when no pagination flags are provided?)
- Table format output (how is pagination communicated in non-JSON output?)
- COUNT query impact (JSON format includes total count - does this affect performance?)

This fix specifies:
- Exact CLI flag names: `--limit` and `--offset`
- Default values: limit=100, offset=0
- Maximum constraints: limit cannot exceed 1000
- Table vs JSON output differences (stderr messages vs pagination envelope)
- Backward compatibility (default behavior when flags not provided)
- Practical examples for both interactive use and automation scripts

---

## Summary
- **Issues fixed**: 2
- **Sections added**: 2 (pagination sections in UC5 and UC4)
- **Sections modified**: 1 (soft delete note in UC9)

## Verification

To verify these fixes resolve the blocking issues:

**Issue 86 Verification:**
- Implementers now have complete schema definition for status and discontinued_at columns
- No ambiguity about data types, defaults, constraints, or indexes
- Clear reference to source of truth (systems/database/schema.md)

**Issue 91 Verification:**
- CLI interface is now fully specified with exact flag names
- Default pagination behavior is documented
- Table and JSON output formats are distinguished
- Automation integration patterns are provided
- No arbitrary decisions needed about CLI design
