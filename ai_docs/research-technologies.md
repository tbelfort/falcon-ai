# Research: Technologies for Pattern Attribution System

## 1. Linear API (GraphQL)

**Source:** [Linear Developers](https://linear.app/developers/graphql)

### Key Information
- **Endpoint:** `https://api.linear.app/graphql`
- **Authentication:** Personal API keys or OAuth2
- **Rate Limits:**
  - API key: 1,500 requests/hour/user
  - OAuth: 500 requests/hour/user/app
  - Complexity: 250,000 points/hour (API key)

### Relevant Features
- Issues, Comments, Labels all accessible via GraphQL
- Webhooks support: Issues, Comments, Attachments, Labels, Users
- **Important:** Label IDs use `String!` type, not `ID!`
- TypeScript SDK available for type-safe operations

### Usage in Our System
- Fetch issue details for taskProfile extraction
- Read issue labels for preliminary classification
- Post comments with pattern attribution results
- Update issue labels (e.g., `pattern-attributed`)

---

## 2. TypeScript Discriminated Unions

**Source:** [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html)

### Best Practices
1. **Common discriminant property:** Use `.kind`, `.type`, or `.tag`
2. **Exhaustiveness with `never`:** Ensure all cases handled
3. **Type narrowing:** Automatic in switch statements
4. **`satisfies` + `as const`:** Useful for discriminated unions

### Application to Our System
```typescript
// DocFingerprint uses discriminated union
type DocFingerprint =
  | { kind: 'git'; repo: string; path: string; commitSha: string }
  | { kind: 'linear'; docId: string; updatedAt: string; contentHash: string }
  | { kind: 'web'; url: string; retrievedAt: string; excerptHash: string }
  | { kind: 'external'; id: string; version?: string };

// FailureMode resolution can use exhaustive switch
function resolveFailureMode(evidence: EvidenceBundle): FailureMode {
  // ... decision tree logic
  // exhaustive switch ensures all cases covered
}
```

### Statistics
- 65% of TypeScript users report increased maintainability with unions
- ~30% reduction in code complexity when using discriminated unions

---

## 3. Content-Addressable Hashing (SHA-256)

**Source:** [fast-sha256-js](https://github.com/dchest/fast-sha256-js)

### Implementation Options

**Option A: Node.js crypto (Recommended for server)**
```typescript
import { createHash } from 'crypto';

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
```

**Option B: SubtleCrypto (Browser/Edge)**
```typescript
async function contentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### Content-Addressable Storage Principles
- Same content → same hash (deterministic)
- Hash collision probability: negligible (2^256 space)
- Used by: Git, Docker, IPFS, Restic

### Application to Our System
- `contentHash` field on PatternDefinition
- Deduplication: Same guidance text = same pattern
- Change detection: Document content changes = occurrence invalidation

---

## 4. SQLite with better-sqlite3

**Source:** [better-sqlite3 Guide](https://generalistprogrammer.com/tutorials/better-sqlite3-npm-package-guide)

### Why better-sqlite3
- **Synchronous API:** Simpler code, no async complexity
- **Performance:** Faster than node-sqlite3 in most cases
- **TypeScript:** Full type support via `@types/better-sqlite3`

### Critical Performance Settings
```typescript
db.pragma('journal_mode = WAL');        // Write-Ahead Logging
db.pragma('synchronous = NORMAL');      // Balance durability/speed
db.pragma('cache_size = 20000');        // Larger cache
db.pragma('page_size = 8192');          // Optimal for BLOB I/O
```

### When NOT to Use
- High concurrent writes (use PostgreSQL)
- Terabyte-scale data
- High-volume large BLOB reads

### Application to Our System
- Local pattern storage (better than JSON files)
- Indexed queries by `touches`, `technologies`, `taskTypes`
- Full-text search for carrier quotes
- Transaction support for atomic updates

---

## 5. Zod Schema Validation

**Source:** [Zod Best Practices 2025](https://javascript.plainenglish.io/9-best-practices-for-using-zod-in-2025-31ee7418062e)

### Best Practices
1. **Use `z.infer<typeof schema>`** instead of separate interfaces
2. **Use `safeParse`** over `parse` (don't throw)
3. **Enable TypeScript strict mode**
4. **Use `z.coerce()`** for external data (query params, env vars)
5. **Refinements** for custom validation logic

### Example Pattern
```typescript
import { z } from 'zod';

const PatternDefinitionSchema = z.object({
  id: z.string().uuid(),
  contentHash: z.string().length(64),
  patternContent: z.string().min(1).max(2000),
  failureMode: z.enum(['incorrect', 'incomplete', 'missing_reference',
                       'ambiguous', 'conflict_unresolved', 'synthesis_drift']),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  touches: z.array(z.enum(['user_input', 'database', 'network', 'auth',
                           'authz', 'caching', 'schema', 'logging',
                           'config', 'api'])),
  status: z.enum(['active', 'archived', 'superseded']),
  permanent: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

type PatternDefinition = z.infer<typeof PatternDefinitionSchema>;
```

### Validation Strategy
- Validate at trust boundaries (API input, file reads)
- Use discriminated unions for entity type checking
- `safeParse` returns `{ success: true, data }` or `{ success: false, error }`

---

## 6. GitHub GraphQL API (PR Reviews)

**Source:** [GitHub GraphQL Explorer](https://docs.github.com/en/graphql/overview/explorer)

### Retrieving PR Review Data
```graphql
query GetPRReviews($owner: String!, $repo: String!, $prNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $prNumber) {
      reviews(last: 50) {
        nodes {
          id
          state
          body
          author { login }
          submittedAt
          comments(first: 50) {
            nodes {
              body
              path
              line
            }
          }
        }
      }
      reviewThreads(last: 50) {
        nodes {
          id
          isResolved
          comments(first: 10) {
            nodes {
              body
              author { login }
            }
          }
        }
      }
    }
  }
}
```

### Key Considerations
- `reviews` returns top-level review data
- `reviewThreads` for threaded comments with resolution status
- REST and GraphQL APIs have different feature sets (Venn diagram)

### Application to Our System
- Fetch PR review comments after review completes
- Extract scout/judge findings from structured comments
- Track review threads for follow-up attribution

---

## 7. Prompt Injection Defense (OWASP)

**Source:** [OWASP LLM Top 10 2025](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)

### Risk Level
- **#1 AI Security Risk** in OWASP 2025 Top 10
- Both direct and indirect injection are threats

### Defense Best Practices

**1. Prompt Scaffolding**
- Wrap user inputs in structured, guarded templates
- Define trusted instruction boundaries with XML-like markers
- Fixed format with consistent ordering

**2. Dynamic Templating**
- Randomized delimiters per session
- Context-based phrasing
- Salted sequence tags (e.g., `<abcde12345>`)

**3. Input Validation**
- Check for instruction-like patterns
- Sanitize before injection
- Size limits on user-provided content

### Application to Our System
- Pattern warnings are **internal** (not user input) — lower risk
- Still use structured format with clear boundaries
- Don't allow pattern content to contain prompt-like instructions
- Validate `alternative` field doesn't contain injection attempts

---

## 8. Confidence Scoring

**Source:** [Confidence Scores in ML](https://www.mindee.com/blog/how-use-confidence-scores-ml-models)

### Bayesian vs Frequentist
- **Frequentist:** Fixed confidence intervals
- **Bayesian:** Credible intervals with prior beliefs

### Our Approach (Spec Section 4)
Deterministic formula, not ML-based:

```
attributionConfidence = CLAMP(
  evidenceQualityBase
  + occurrenceBoost
  - decayPenalty
  + confidenceModifiers,
  0.0, 1.0
)
```

### Calibration Considerations
- Start with theoretical values (0.75 for verbatim, etc.)
- Defer calibration based on observed data to v2
- Track `wasAdheredTo` to measure real-world effectiveness

---

## Summary: Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Schema Validation | Zod | Type inference, safeParse, refinements |
| Storage | better-sqlite3 | Synchronous, performant, indexed queries |
| Hashing | Node.js crypto | Native, fast SHA-256 |
| Issue Tracking | Linear GraphQL | Already in workflow, typed SDK |
| PR Integration | GitHub GraphQL | Review threads, comments |
| TypeScript | Discriminated unions | Type safety for entities |

---

## References

- [Linear Developers](https://linear.app/developers)
- [TypeScript Handbook - Unions](https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [Zod](https://zod.dev/)
- [OWASP LLM Top 10](https://genai.owasp.org/)
- [GitHub GraphQL](https://docs.github.com/en/graphql)
