# Abuse Patterns — Doc Review Reference

This reference helps scouts/judges identify missing requirements that enable intentional misuse.

## Common Abuse Categories
### 1) Resource Exhaustion (DoS)
- Large payloads, huge file uploads, deep JSON, pathological regex inputs
- Unbounded loops, unbounded fanout, missing pagination
Doc requirements to look for:
- max sizes, max counts, timeouts, streaming behavior, pagination defaults
- "reject before processing" enforcement points

### 2) Credential Stuffing / Brute Force
- login endpoints without throttling/lockout/monitoring
Doc requirements:
- rate limits, lockout rules, MFA requirements (if applicable), alerting signals

### 3) Enumeration
- error messages that reveal whether users/resources exist
Doc requirements:
- consistent error responses, timing behavior, auditing

### 4) Cost Amplification
- small request triggers expensive backend work (N+1 queries, fanout calls)
Doc requirements:
- quotas, batching limits, caching rules, circuit breakers, backpressure

### 5) Queue/Worker Flooding
- unlimited job creation, missing per-tenant limits
Doc requirements:
- queue size caps, per-tenant quotas, dedupe/idempotency keys

### 6) Storage Abuse
- unlimited logs/artifacts/uploads
Doc requirements:
- retention policies, max disk usage, cleanup schedules, safe failure modes

### 7) Abuse of Exceptional Conditions
- forcing error paths to leak info or corrupt state
Doc requirements:
- rollback/compensation rules, safe defaults, no debug traces

## What "Good" Mitigations Look Like in Docs
- numeric limits (not vibes)
- explicit enforcement location (server-side, before expensive work)
- explicit response behavior when limits are hit
- logging/metrics for detection (at least minimal)

## Review Heuristic
If a spec contains:
- "unlimited", "any size", "as much as needed", "wait indefinitely"
it is almost always a HIGH severity adversarial finding unless the doc also specifies compensating controls.
