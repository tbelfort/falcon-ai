# OWASP Top 10 (2025) — Doc Review Cheat Sheet

This file is a doc-review-oriented summary of common web app security risk categories.
It is NOT a verbatim copy of OWASP material.

Use it to:
- classify doc-level security findings
- recognize missing security requirements
- describe what "good security documentation" looks like

## A01 — Broken Access Control
Typical failures:
- missing authorization checks
- relying on client-side checks
- insecure direct object references (IDOR)

Doc red flags:
- endpoints/actions described without stating who is allowed to do them
- "admin-only" claimed without a deterministic enforcement rule
- no deny-by-default policy

Docs should specify:
- authorization decision points (before data access)
- role/permission model (explicit)
- object-level authorization rules (ownership, tenant boundaries)

## A02 — Security Misconfiguration
Typical failures:
- permissive defaults, exposed admin endpoints
- overly broad CORS, debug features in prod

Doc red flags:
- "configure as needed"
- missing defaults
- missing secure baseline

Docs should specify:
- secure defaults and required hardening
- environment-specific overrides
- validation rules for config values

## A03 — Software Supply Chain Failures
Typical failures:
- unpinned dependencies, unsigned artifacts, compromised build pipeline

Doc red flags:
- no dependency pinning policy
- "use latest" language
- no provenance expectations

Docs should specify:
- pinning/lockfile requirements
- artifact integrity verification expectations
- upgrade/patch cadence expectations

## A04 — Cryptographic Failures
Typical failures:
- weak or incorrect crypto, poor key handling

Doc red flags:
- "encrypt data" without algorithm/key requirements
- "hash password" without KDF details

Docs should specify:
- algorithms/modes, key sizes, key rotation/storage, TLS requirements

## A05 — Injection
Typical failures:
- SQL/command/template injection due to untrusted input reaching interpreters

Doc red flags:
- "build query string using input"
- "sanitize input" without rules

Docs should specify:
- parameterization requirements
- allowlists and canonicalization rules
- forbidden patterns (e.g., no shell concatenation)

## A06 — Insecure Design
Typical failures:
- missing threat modeling, insecure workflows

Doc red flags:
- core flows described without security invariants
- "trust the client" assumptions

Docs should specify:
- explicit trust boundaries
- threat assumptions and mitigations in the spec (not as warnings)

## A07 — Authentication Failures
Typical failures:
- weak login/session management, missing MFA where required

Doc red flags:
- vague "authenticate user" language
- no session/token validation rules

Docs should specify:
- credential rules, MFA requirements (if applicable), token/session lifecycle, invalidation

## A08 — Software or Data Integrity Failures
Typical failures:
- integrity not verified for updates/artifacts/data

Doc red flags:
- "download and run" without signature checks
- "accept webhook payload" without verification rules

Docs should specify:
- integrity checks (signatures, checksums)
- verification steps and failure handling

## A09 — Security Logging & Alerting Failures
Typical failures:
- missing audit trails, missed detection of attacks

Doc red flags:
- "log errors" without specifying security-relevant events

Docs should specify:
- what events MUST be logged
- redaction rules for secrets
- alert thresholds/escalation policies (at least minimally)

## A10 — Mishandling of Exceptional Conditions
Typical failures:
- exceptions cause information leaks, inconsistent states, bypasses

Doc red flags:
- unclear behavior on failure paths
- "ignore exceptions" patterns

Docs should specify:
- consistent error responses (no stack traces)
- rollback/compensation behavior
- resource cleanup guarantees

## Source (for future updates)
```text
OWASP Top 10:2025 project: https://owasp.org/www-project-top-ten/
OWASP Top 10:2025 intro/list: https://owasp.org/Top10/2025/0x00_2025-Introduction/
```
