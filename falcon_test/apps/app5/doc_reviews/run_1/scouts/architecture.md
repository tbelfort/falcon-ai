# Architecture Decisions Scout Report

## Assessment: READY

All critical technology choices are made and specified. The documentation provides clear, actionable decisions for implementers with minimal ambiguity. A few minor clarifications would improve implementation consistency, but none are blockers.

## Issues

### Issue 1: Email Validation Regex Choice Left to Implementer

**Affected Files:** ["app5/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**
```
**Validation Requirements:**
- Regex: `^[^\s@]+@[^\s@]+\.[^\s@]+$` (basic validation)
- Alternative (for internal/dev environments): `^[^\s@]+@[^\s@]+$` allows local-style emails like `user@localhost`
```

And:

```
**Note:** If the application allows local-style emails (`user@localhost`), this MUST be explicitly documented as a configuration option, not the default behavior.
```

**What's Missing/Wrong:**
The documentation presents two email validation options but doesn't definitively choose which one to implement. It states local-style emails "MUST be explicitly documented as a configuration option," but the vision.md lists "no configuration" as a design goal. This creates ambiguity about whether to implement configuration support or just pick the standard regex.

**Assessment:**
MINOR - Implementers can reasonably choose the standard regex (requiring domain with dot) as the default without configuration support, since the vision emphasizes simplicity and the note says local emails should be a "configuration option" which conflicts with the no-configuration design goal. However, explicitly stating "use standard regex, no local email support in v1" would eliminate ambiguity.

---

### Issue 2: Phone Extension Normalization Strategy Ambiguous

**Affected Files:** ["app5/docs/systems/cli/interface.md"]

**Relevant Text From Docs:**
```
**Extension Handling:**
Phone extensions are handled as follows during normalization:
- Input: `555-123-4567 ext 123` -> Normalized: `5551234567` (extension stripped for matching)
- Input: `555-123-4567x123` -> Normalized: `5551234567123` (x is treated as separator, digits kept)
```

**What's Missing/Wrong:**
The normalization algorithm is inconsistent: "ext 123" strips the extension (including digits), but "x123" keeps the digits after 'x'. The docs say "Remove all non-digit characters EXCEPT leading `+`" but then show different behavior for 'ext' vs 'x'. An implementer would need to decide whether to special-case "ext" keyword or use a simpler rule.

**Assessment:**
MINOR - The recommendation ("store extensions in notes field") suggests extensions aren't a priority. Implementers can reasonably apply the simple rule: "remove all non-digit characters except leading +" without special-casing "ext". The examples appear to show edge cases rather than strict requirements. However, clarifying whether "ext" is actually special-cased would prevent implementation variance.

---

### Issue 3: vCard Empty Name Handling Placeholder Not Specified

**Affected Files:** ["app5/docs/design/technical.md"]

**Relevant Text From Docs:**
```
**Empty Name Handling in vCard Export:**
vCard 3.0 requires FN (Formatted Name) to be non-empty. If a contact has
an empty/whitespace-only name (which should be prevented by validation),
the vCard export MUST use the placeholder "[No Name]" for both FN and N
properties. Do not skip contacts - always export with placeholder to ensure
data completeness. Log a warning: "Contact ID {id} has empty name, using placeholder."
```

**What's Missing/Wrong:**
While the exact placeholder string "[No Name]" is specified, there's a contradiction: the docs say empty names "should be prevented by validation" (name is required per schema and validation rules), so this case should be impossible. If validation works correctly, this code path is unreachable. The docs don't clarify whether this is defensive programming for database corruption or if there's a scenario where names can actually be empty.

**Assessment:**
VERY MINOR - This is defensive programming guidance for an impossible state (given that name validation requires non-empty). Implementers can reasonably implement this as a safety check. Not a blocker, just a minor documentation inconsistency that could confuse implementers about whether empty names are actually possible.

---

### Issue 4: Database Permissions on Windows Not Specified

**Affected Files:** ["app5/docs/design/technical.md", "app5/docs/systems/database/schema.md"]

**Relevant Text From Docs:**
```
**Windows Note:** Unix permissions (0o600) don't apply on Windows. The `os.open()` call with mode parameter still works but the mode is ignored. On Windows, the database file inherits ACLs from the parent directory. For secure deployments on Windows, users should ensure the parent directory has appropriate ACL restrictions (owner-only access). The application does not programmatically modify Windows ACLs - this is documented as a deployment consideration.
```

**What's Missing/Wrong:**
The docs state that Windows ACLs are "documented as a deployment consideration" but don't actually specify whether the application should:
1. Simply document the limitation in user-facing help/README
2. Warn the user on Windows that permissions aren't enforced
3. Attempt to verify ACLs and warn if insecure
4. Skip the os.open() call entirely on Windows

**Assessment:**
VERY MINOR - Implementers can reasonably choose option 1 (document in help) or option 2 (silent on Windows) without breaking functionality. The security goal is clear (restrict access), just the Windows behavior is underspecified. Given this is a CLI tool for personal use (per vision.md), not enterprise security software, skipping Windows-specific ACL handling is reasonable.

---

No additional issues found. The documentation is comprehensive and provides clear technology choices:
- Language: Python 3.10+ (specified)
- Database: SQLite3 via stdlib sqlite3 module (specified)
- CLI Framework: argparse from stdlib (specified)
- No external dependencies (specified)
- All schema details specified
- All command interfaces specified
- All validation rules specified with exact constraints
- Error codes and exception hierarchy fully defined
- Output formats specified with examples
- Security rules (S1-S6) clearly defined
