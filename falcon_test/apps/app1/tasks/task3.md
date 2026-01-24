# Task 3: Core Commands + Formatters

Implement add-item, update-stock, search, low-stock-report commands and output formatting.

## Context

Read before starting:
- `docs/design/components.md` - commands.py and formatters.py specifications
- `docs/systems/cli/interface.md` - Command specifications for all 4 commands
- `docs/systems/database/schema.md` - Query patterns including combined search
- `docs/systems/architecture/ARCHITECTURE-simple.md` - Layer rules

## Scope

- [ ] `warehouse_cli/commands.py` - Business logic for add-item, update-stock, search, low-stock-report
- [ ] `warehouse_cli/formatters.py` - Table and JSON formatters
- [ ] Integration of commands into cli.py argument parser
- [ ] Input validation for all command arguments

## Constraints

- **AD1**: Commands return data, CLI layer handles formatting and printing
- **AD4**: All queries use parameterized placeholders
- **AD5**: Validate inputs at CLI boundary
- Commands MUST NOT print to stdout/stderr (return data only)
- Commands MUST NOT catch exceptions (let them propagate to CLI)

## Tests Required

- add-item: success, duplicate SKU (exit 4), invalid quantity (exit 1)
- update-stock: --set, --add, --remove; --set 0 (valid edge case); not found (exit 3); would go negative (exit 1)
- search: by SKU, by name, by location, combined criteria, no results
- Combined search criteria tests:
  - SKU + name filter (should AND them)
  - name + location filter (should AND them)
  - SKU + location filter (should AND them)
  - All three criteria together
  - Combined criteria with no matches (empty result)
- **Combined search matching semantics:**
  - Multiple criteria are combined with AND (all must match)
  - SKU: exact match, case-sensitive (e.g., `--sku WH-001` matches only "WH-001")
  - Name: partial match, case-insensitive using LIKE (e.g., `--name widget` matches "Widget A", "Widget B", "Large Widget")
  - Location: exact match, case-sensitive (e.g., `--location Aisle-A` matches only "Aisle-A", not "aisle-a" or "Aisle-A-01")
- low-stock-report: default threshold, custom threshold, empty results
- Table format: proper column widths, truncation, empty table message
- JSON format: proper structure, null handling, empty array

### Additional Command Test Cases

**Max length and boundary tests:**
- add-item with max length SKU (50 chars)
- add-item with max length name (255 chars)
- add-item with max length description (4096 chars)
- add-item with quantity = 0 (valid edge case)
- update-stock --remove that brings quantity to exactly 0 (valid)
- update-stock --remove that would make quantity -1 (invalid)

**Unicode and special character tests:**
- add-item with Unicode name: `Widget`
- add-item with name containing quotes: `Widget "Pro"`
- add-item with name containing commas: `Widget, Large`
- search for partial Unicode name
- search with SQL-injection-like input (should return empty, not error)

**Low-stock-report threshold tests:**
- Threshold higher than all min_stock_levels
- Threshold of 0 (should return empty)
- Threshold = 1 with items at quantity 0
- Deficit calculation when threshold > min_stock_level

**Formatter edge cases:**
- Table truncation at exactly max width
- Table with NULL location values
- JSON with all nullable fields as null
- Table with empty result set

## Not In Scope

- export-csv command (Task 4)
- CSV formatting (Task 4)

## Acceptance Criteria

```bash
# Add item
python -m warehouse_cli add-item --sku WH-001 --name "Widget A" --quantity 100 --db ./test.db
# Output: Item created: WH-001 (ID: 1)
# Exit: 0

# Update stock
python -m warehouse_cli update-stock --sku WH-001 --remove 30 --db ./test.db
# Output: Updated WH-001: 100 -> 70
# Exit: 0

# Search
python -m warehouse_cli search --name widget --db ./test.db
# Output: Table with WH-001
# Exit: 0

# Search JSON
python -m warehouse_cli search --name widget --format json --db ./test.db
# Output: [{"sku": "WH-001", "name": "Widget A", ...}]
# Exit: 0

# Low stock report
python -m warehouse_cli low-stock-report --db ./test.db
# Output: Table of items below min_stock_level
# Exit: 0
```
