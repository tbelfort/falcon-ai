# Fixes Applied to falcon_test/apps/app2/docs/design/vision.md

## Changes Made

### Gap ID 21: JSON schema stability guarantees undefined
**What Changed**: Expanded success criterion #4 with explicit JSON schema stability guarantees, defining what "stable" means for backward compatibility, field evolution, and breaking changes.

**Lines Affected**: Lines 39-44

**Content Added/Modified**:
```markdown
4. Shell scripts can parse output reliably (stable JSON schema)
   - **Stability guarantee**: Existing fields maintain their names, types, and semantics within a major version
   - **Backward compatibility**: New optional fields may be added (scripts ignoring unknown fields continue to work)
   - **Breaking changes**: Field removal, renaming, or type changes require a major version bump
   - **Field ordering**: Not guaranteed stable (scripts must parse JSON by key name, not position)
```

**Rationale**: The original success criterion mentioned "stable JSON schema" without defining what constitutes stability. This addition clarifies:
- What changes are allowed without breaking existing scripts (adding new optional fields)
- What changes are breaking (field removal, renaming, type changes)
- That field ordering is not part of the stability contract
- That stability is tied to major version semantics

This addresses the judge's concern about schema evolution policy while maintaining the MVP focus - implementers now have clear rules for what constitutes a breaking change.

## Summary
- Gaps addressed: 1
- Sections added: 0
- Sections modified: 1 (Success Criteria #4)
- Total lines added: 4 sub-bullets clarifying JSON schema stability contract
