# Architecture Decisions Judge Evaluation

## Summary

| Issue # | Title | Classification |
|---------|-------|----------------|
| 1 | Email Validation Regex Choice Left to Implementer | NON_BLOCKING |
| 2 | Phone Extension Normalization Strategy Ambiguous | NON_BLOCKING |
| 3 | vCard Empty Name Handling Placeholder Not Specified | NON_BLOCKING |
| 4 | Database Permissions on Windows Not Specified | NON_BLOCKING |

## Issue Details

### Issue 1: Email Validation Regex Choice Left to Implementer

**Scout's Assessment:**
> MINOR - Implementers can reasonably choose the standard regex (requiring domain with dot) as the default without configuration support, since the vision emphasizes simplicity and the note says local emails should be a "configuration option" which conflicts with the no-configuration design goal. However, explicitly stating "use standard regex, no local email support in v1" would eliminate ambiguity.

**Classification:** NON_BLOCKING

**Reasoning:**
The scout correctly identifies this as minor. There is a clear default choice available: use the standard regex with domain validation. The "no configuration" design goal from vision.md provides sufficient guidance to resolve the ambiguity - implementers should choose the simpler standard regex without configuration support. Implementation can proceed with the sensible default, and this can be clarified in documentation later without blocking development.

---

### Issue 2: Phone Extension Normalization Strategy Ambiguous

**Scout's Assessment:**
> MINOR - The recommendation ("store extensions in notes field") suggests extensions aren't a priority. Implementers can reasonably apply the simple rule: "remove all non-digit characters except leading +" without special-casing "ext". The examples appear to show edge cases rather than strict requirements. However, clarifying whether "ext" is actually special-cased would prevent implementation variance.

**Classification:** NON_BLOCKING

**Reasoning:**
The scout's analysis is sound. The core rule is clear: "Remove all non-digit characters EXCEPT leading +". The examples showing "ext" vs "x" behavior are edge cases that implementers can handle consistently by applying this simple rule. Phone normalization is not core functionality - it's a usability convenience. Implementation variance here would not break the application or create data inconsistency issues. Implementers can proceed with the straightforward interpretation of the rule.

---

### Issue 3: vCard Empty Name Handling Placeholder Not Specified

**Scout's Assessment:**
> VERY MINOR - This is defensive programming guidance for an impossible state (given that name validation requires non-empty). Implementers can reasonably implement this as a safety check. Not a blocker, just a minor documentation inconsistency that could confuse implementers about whether empty names are actually possible.

**Classification:** NON_BLOCKING

**Reasoning:**
The scout correctly identifies this as very minor. The placeholder "[No Name]" IS actually specified in the documentation. The inconsistency is that this handles a theoretically impossible case (validation prevents empty names). This is standard defensive programming practice - handling edge cases even when upstream validation should prevent them. The implementation path is clear: implement the defensive check with the specified placeholder. No ambiguity that would block implementation.

---

### Issue 4: Database Permissions on Windows Not Specified

**Scout's Assessment:**
> VERY MINOR - Implementers can reasonably choose option 1 (document in help) or option 2 (silent on Windows) without breaking functionality. The security goal is clear (restrict access), just the Windows behavior is underspecified. Given this is a CLI tool for personal use (per vision.md), not enterprise security software, skipping Windows-specific ACL handling is reasonable.

**Classification:** NON_BLOCKING

**Reasoning:**
The scout's assessment is accurate. Windows ACL handling is a deployment documentation concern, not a functional implementation concern. The application will work correctly on Windows without programmatic ACL handling. The Unix permission call (os.open with mode) still functions on Windows (mode is simply ignored). Given the tool's scope as a personal CLI utility, documenting Windows limitations in user-facing documentation is an acceptable approach. Implementation can proceed without Windows-specific ACL code.

---

## Statistics

- Total issues: 4
- Blocking: 0
- Non-blocking: 4
