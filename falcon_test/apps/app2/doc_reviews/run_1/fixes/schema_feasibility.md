# Fixes Applied to schema.md (Feasibility Gaps)

## Changes Made

### Gap ID 7: Parameterized Query Pattern Documentation Could Be Clearer (LOW/NON_BLOCKING)
**What Changed**: Added an inline explanatory note immediately after the Parameters line for the "Search Transactions" query pattern to clarify the doubled parameter pattern and reference the Python example that follows.

**Lines Affected**: Lines 298-300 (after Parameters line, before existing notes)

**Content Added/Modified**:
```markdown
**Note:** Parameters must be passed in pairs for optional filters. Each optional filter uses the pattern `(? IS NULL OR column = ?)`, requiring the same value twice. See Python example below for correct parameter construction.
```

## Summary
- Gaps addressed: 1
- Sections added: 0
- Sections modified: 1 (Search Transactions query pattern)

## Rationale

The original documentation had all necessary information:
- The query definition showed the `(? IS NULL OR column = ?)` pattern
- The Parameters line explicitly showed doubled parameters
- A detailed Python example with extensive documentation appeared 11 lines later

However, the gap identified that the separation between the query definition and the Python example could be confusing. Rather than restructuring the entire section, I added a concise inline note that:

1. Explains WHY parameters are doubled (the NULL-checking pattern)
2. Explicitly states that the same value appears twice
3. Forward-references the Python example for implementation details

This minimal change improves clarity without disrupting the existing documentation structure or duplicating the comprehensive Python example.
