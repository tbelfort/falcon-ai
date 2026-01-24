# Fixes Applied to interface.md

## Changes Made

### Issue ID 39: Missing CSV Import Auto-Creation Specification
**What Changed**: Added explicit clarification that CSV import does NOT support auto-creation of accounts or categories. All referenced entities must exist before import.

**Content Added/Modified**:
```markdown
**IMPORTANT - No Auto-Creation:** Import does NOT automatically create accounts or categories that do not exist. All accounts and categories referenced in the CSV file MUST be created using `add-account` and `add-category` commands BEFORE importing transactions. If any row references a non-existent account or category, the entire import fails with no partial data inserted (see Transaction Handling below).
```

**Location**: Added immediately after the Behavior section of the `import-csv` command (after line 727 in the original file).

**Rationale**: The original documentation stated "error if not found" for both accounts and categories, which was correct. However, the contradiction with components.md required an explicit statement that auto-creation is NOT supported. This clarification:
1. Resolves the design contradiction between interface.md and components.md
2. Makes the "error if not found" behavior unambiguous
3. Provides clear guidance to users about the prerequisite steps (create accounts/categories first)
4. References the existing "Transaction Handling" section that explains the all-or-nothing atomic behavior

## Summary
- Issues fixed: 1
- Sections added: 1 (clarification note)
- Sections modified: 0 (existing content preserved)

The fix maintains minimal changes to the document while resolving the blocking design contradiction. The interface.md behavior (error on not found) is confirmed as the correct specification.
