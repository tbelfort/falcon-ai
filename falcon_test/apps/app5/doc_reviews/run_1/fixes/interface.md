# Fixes Applied to app5/docs/systems/cli/interface.md

## Changes Made

### Issue ID 10: Concurrent Edit Protection Missing from Critical Operations
**What Changed**: Added a new section "Concurrent Edit Protection" to the merge command behavior documentation that specifies optimistic locking requirements.
**Content Added/Modified**:
```
**Concurrent Edit Protection:**
The merge operation MUST use optimistic locking when updating the target contact. Use the updated_at value read when loading the target contact to detect concurrent modifications. If the update affects 0 rows (because updated_at changed), exit with code 5 (Conflict).
```

### Issue ID 12: Phone Normalization Extension Handling Ambiguity
**What Changed**: Updated the "Extension Handling" section to show consistent output for both examples, removing the contradiction. Both examples now demonstrate the simple rule: "remove all non-digit characters except leading +".
**Content Added/Modified**:
```
**Extension Handling:**
Phone extensions are handled consistently during normalization using the simple rule above:
- Input: `555-123-4567 ext 123` -> Normalized: `5551234567123` (all non-digit characters removed, digits kept)
- Input: `555-123-4567x123` -> Normalized: `5551234567123` (all non-digit characters removed, digits kept)

**Recommendation:** For contacts with extensions, store the extension in the notes field for clarity.
```

---

## Summary
- Issues fixed: 2
- Sections added: 1 (Concurrent Edit Protection)
- Sections modified: 1 (Extension Handling)
