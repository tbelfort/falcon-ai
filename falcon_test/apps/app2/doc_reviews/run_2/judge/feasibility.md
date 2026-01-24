# Feasibility Judge Evaluation

## Summary

| Issue # | Title | Classification |
|---------|-------|----------------|
| 1 | Critical Security Conflict - Path Validation Implementation Location | BLOCKING |
| 2 | URL Decoding DoS Vulnerability | NON_BLOCKING |
| 3 | Foreign Key Enforcement Documentation Inconsistency | BLOCKING |
| 4 | CSV Import Memory Handling Contradicts Performance Targets | NON_BLOCKING |
| 5 | Currency Precision Contradiction | NON_BLOCKING |
| 6 | Inconsistent Row Numbering in CSV Import Error Messages | NON_BLOCKING |

## Issue Details

### Issue 1: Critical Security Conflict - Path Validation Implementation Location

**Scout Assessment:** This is a solvable architectural flaw but needs clarification. The architecture documentation contradicts itself - it says TOCTOU must be prevented atomically, then says the single-user design accepts a small TOCTOU window. This needs resolution before implementation.

**Judge Classification:** BLOCKING

**Reasoning:** This is a security-critical function where the documentation contradicts itself on atomicity requirements. Implementers cannot proceed without knowing: (1) where safe_open_file() should be located, (2) whether atomicity is required or a TOCTOU window is acceptable, and (3) what validate_path() should return. These contradictions affect core security architecture and must be resolved before implementation.

---

### Issue 2: URL Decoding DoS Vulnerability

**Scout Assessment:** Medium severity - exploitable in multi-user scenarios. For the stated single-user personal finance use case, this is low risk. However, it contradicts the security-first design philosophy. Fix: Add `if len(path) > 4096: raise ValidationError("Path too long")` before the decoding loop.

**Judge Classification:** NON_BLOCKING

**Reasoning:** The scout correctly identifies this as medium severity for single-user CLI. The fix is trivial (add path length check) and can be implemented without architectural changes. This is a security hardening improvement but does not block core functionality implementation. Implementers can reasonably proceed and add this check during implementation.

---

### Issue 3: Foreign Key Enforcement Documentation Inconsistency

**Scout Assessment:** This is implementable but needs clarification on the exact sequence. Should init_database() pre-create the file with open(path, 'w') and os.chmod() before calling sqlite3.connect()? Or rely on umask manipulation? Or use os.open() with mode?

**Judge Classification:** BLOCKING

**Reasoning:** This is a security-critical requirement where the implementation mechanism is unclear given SQLite's API limitations. The documentation requires atomic creation with 0600 permissions but SQLite's connect() creates files with default umask permissions. Implementers cannot satisfy both atomicity and permission requirements without clarification on which approach is sanctioned. This needs resolution to avoid security vulnerabilities.

---

### Issue 4: CSV Import Memory Handling Contradicts Performance Targets

**Scout Assessment:** This is feasible but the documentation is misleading about the memory implications. The two-phase validation approach will work for 100,000 rows but requires ~100-150MB of RAM during import, not the "~1MB for typical row sizes" claimed.

**Judge Classification:** NON_BLOCKING

**Reasoning:** The implementation approach (two-phase validation) is sound and feasible. The documentation has inaccurate memory estimates but this does not prevent implementation. The system will work correctly on modern hardware; the docs just need updating to reflect actual memory usage. Implementers can proceed with the documented approach.

---

### Issue 5: Currency Precision Contradiction

**Scout Assessment:** This is a documentation clarity issue, not a fundamental flaw. The intended behavior is clear (reject >2 decimal places in validation), but the defensive rounding specification creates confusion.

**Judge Classification:** NON_BLOCKING

**Reasoning:** The intended behavior is clear: reject >2 decimal places at validation. The confusion is about defensive programming style, not functionality. Implementers can proceed with validation-first approach and either include or exclude defensive rounding - both approaches produce correct results for valid inputs. This is a documentation clarity issue that does not block implementation.

---

### Issue 6: Inconsistent Row Numbering in CSV Import Error Messages

**Scout Assessment:** This is a UX design issue that needs clarification before implementation. Neither approach is technically infeasible, but the documentation should be explicit about which behavior is intended.

**Judge Classification:** NON_BLOCKING

**Reasoning:** Both approaches (stop at first error vs. collect all errors) are valid UX choices and both are implementable. The core import functionality works regardless of which approach is chosen. An implementer can make a reasonable choice (e.g., stop at first error as explicitly stated in errors.md) and proceed. This is a UX polish decision that can be clarified during implementation or in review.

---

## Statistics

- Total issues: 6
- Blocking: 2
- Non-blocking: 4
