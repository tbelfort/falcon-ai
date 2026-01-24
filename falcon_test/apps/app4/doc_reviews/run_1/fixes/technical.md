# Fixes Applied to app4/docs/design/technical.md

## Changes Made

### Issue ID 12: CSV Injection Escaping Implementation Unclear
**What Changed**: Added comprehensive clarification section explaining how the CSV injection escaping function interacts with Python's csv module, including quoting modes, escaping order, edge cases, and multi-line handling.

**Content Added/Modified**:
```
**Integration with Python csv Module:**

The escaping MUST be applied BEFORE passing values to `csv.writer`. The interaction is as follows:

1. **Escaping Order**: Apply `escape_csv_field()` first, then pass result to `csv.writer.writerow()`
   [code example showing proper usage]

2. **CSV Quoting Mode**: Use `csv.QUOTE_MINIMAL` (default). The csv module will add double-quotes around fields containing commas, newlines, or double-quotes. This happens AFTER our single-quote prefix is added.
   [examples showing escaping + quoting interaction]

3. **Double Escaping Prevention**: The single-quote prefix is NOT subject to CSV quoting rules (it's just a regular character). No double-escaping occurs.

4. **Empty String vs None Handling**:
   - `None` → empty string `""`
   - Empty string `""` → empty string `""`
   - Both produce empty CSV fields

5. **Unicode Handling**: UTF-8 encoding is used. The csv module in Python 3 handles Unicode natively. No special treatment needed for Unicode characters.

6. **Multi-line Field Values**: Fields containing newlines are handled by csv module's quoting:
   [examples showing multi-line field handling]

7. **Important**: Only check the FIRST character of the field value. If a dangerous character appears later in the string (e.g., `"Hello =SUM()"`), it does NOT need escaping because spreadsheets only interpret formulas at the start of cells.
```

**Rationale**: The original specification showed the escaping function but left critical implementation details ambiguous:
- Which csv quoting mode to use (QUOTE_MINIMAL, QUOTE_ALL, etc.)
- Whether escaping happens before or after csv.writer processing
- Risk of double-escaping when combining manual escaping with csv module quoting
- How to handle edge cases (None vs empty string, Unicode, multi-line values)

The added section provides complete clarity by:
1. Specifying the exact order of operations (escape first, then csv.writer)
2. Recommending csv.QUOTE_MINIMAL and explaining the interaction
3. Demonstrating with concrete examples how escaping and quoting combine
4. Addressing all edge cases identified in the blocking issue
5. Clarifying that only first character matters for injection prevention

This prevents both security vulnerabilities (ineffective escaping) and implementation bugs (malformed CSV output).

---

## Summary
- Issues fixed: 1
- Sections added: 1 (Integration with Python csv Module)
- Sections modified: 1 (CSV Format section expanded)

The CSV injection prevention is now fully specified with clear implementation guidance that eliminates ambiguity about the interaction between manual escaping and Python's csv module quoting mechanisms.
