# RFC 2119 / RFC 8174 — Normative Language Reference (Doc Review)

This file summarizes the RFC-2119 requirement keywords and the RFC-8174 clarification.
It is a guide for writing clear, testable specs, especially in `docs/systems/**`.

## Core Rule (Capitalization)
Per RFC 8174: the special meanings apply ONLY when the keywords are in ALL CAPS.
Lowercase "should/must/may" have normal English meaning and are ambiguous in specs.

## Keywords and Intended Meaning (Practical Summary)
- MUST / REQUIRED / SHALL
  - Absolute requirement.
- MUST NOT / SHALL NOT
  - Absolute prohibition.
- SHOULD / RECOMMENDED
  - Strong recommendation. Deviations are allowed only with a clearly understood and documented reason.
- SHOULD NOT / NOT RECOMMENDED
  - Strong discouragement. Allowed only with careful justification.
- MAY / OPTIONAL
  - Truly optional. If omitted, implementation must still interoperate with implementations that include it (as applicable).

## How to Use in Systems Docs
- Use MUST/MUST NOT for behavior that affects correctness, safety, or interoperability.
- Use SHOULD only when you explicitly allow exceptions and expect some implementations to differ.
- If you use SHOULD, your spec SHOULD ALSO state:
  - what valid reasons to deviate are
  - what alternative behavior is acceptable
  - what interoperability or safety impact occurs

## Anti-Patterns to Flag
- "should handle appropriately"
- "best effort"
- "reasonable timeout"
- "as needed"
- "implementation-defined"
- "sanitize input"
All of these MUST be rewritten into explicit, testable requirements in systems docs.

## Canonical Boilerplate (Recommended)
Specs that use RFC keywords SHOULD include a short note like:
"The key words MUST, MUST NOT, SHOULD, SHOULD NOT, MAY are to be interpreted as described in RFC 2119 and RFC 8174."

## Source (for future updates)
```text
RFC 2119: https://datatracker.ietf.org/doc/html/rfc2119
RFC 8174: https://www.rfc-editor.org/rfc/rfc8174.html
```
