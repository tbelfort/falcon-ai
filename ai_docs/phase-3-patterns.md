# Phase 3 Injection System - Patterns and Dependencies Research

**Research Date:** 2026-01-19
**Purpose:** Document patterns, algorithms, and best practices for the Phase 3 Injection System
**Referenced By:** `specs/phases/phase-3-injection-system.md`

---

## 1. Warning Selector Patterns

### 1.1 Priority Queue Selection

The injection system uses a tiered selection algorithm that prioritizes warnings based on multiple weighted factors. This approach draws from established priority queue patterns:

**Core Algorithm Properties:**
- Priority queues require no more than `1 + lg n` compares for insert and `2 lg n` compares for remove-maximum operations
- Elements are processed by priority rather than insertion order (FIFO)
- Rank-sensitive variants provide O(log(n/r)) time complexity where r is the element's rank

**Scoring Model Applied to Injection:**
```
injectionPriority = attributionConfidence * severityWeight * relevanceWeight * recencyWeight
```

This follows the weighted average scoring pattern used in project portfolio management, where:
- Benefits (relevance) may have factor 1.5
- Risk mitigation (severity) has its own weight
- Final score is computed as weighted average

**Sources:**
- [Priority Queues - Princeton Algorithms](https://algs4.cs.princeton.edu/24pq/)
- [Introduction to Priority Queue - GeeksforGeeks](https://www.geeksforgeeks.org/dsa/priority-queue-set-1-introduction/)
- [Project Selection and Prioritization Guide](https://aliresources.hexagon.com/enterprise-project-performance/project-selection-prioritization-guide)

### 1.2 Tiered Selection Algorithm

The Phase 3 spec implements a tiered approach:

1. **Tier 1 (Guaranteed Slots):** 1 baseline principle + 1 derived principle
2. **Tier 2 (Security Priority):** Up to 3 security patterns (highest category priority)
3. **Tier 3 (Fill Remaining):** Non-security patterns sorted by priority
4. **Tier 4 (Fallback):** Project-wide HIGH/CRITICAL for low-confidence task profiles

This mirrors the Analytic Hierarchy Process (AHP) approach where pairwise comparisons reduce bias and ensure systematic prioritization.

### 1.3 Diversity Sampling for Category Coverage

**Problem:** Recommendation systems face an accuracy-diversity dilemma - the most accurate recommendations come from similar items, but diversity prevents filter bubbles.

**Applied Pattern for Injection:**
- **Intra-list variety:** The warning set should contain items from different categories (security, correctness, privacy)
- **Coverage:** Surface patterns from across the catalog rather than repeating popular ones
- **Serendipity:** Include derived principles that may surface unexpected but valuable guidance

**Implementation Strategies:**
1. **Re-ranking with diversification:** Start with relevance-ordered list, then apply greedy diversification
2. **Coverage constraints:** Guarantee representation from different categories (security gets up to 3 slots)
3. **Facility location model:** Balance similarity (relevance to task) with diversity

**Sources:**
- [Diversity in Recommendations - Comprehensive Guide 2025](https://www.shadecoder.com/topics/diversity-in-recommendations-a-comprehensive-guide-for-2025)
- [Bayesian-Guided Diversity in Sequential Sampling](https://arxiv.org/abs/2506.21617)
- [Solving the Diversity-Accuracy Dilemma - PNAS](https://www.pnas.org/doi/10.1073/pnas.1000488107)

### 1.4 Deterministic Tie-Breaking

The spec requires deterministic ordering for reproducibility. The tie-breaking hierarchy:

```
1. Primary: priority DESC
2. Secondary: severityMax DESC (CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1)
3. Tertiary: daysSinceLastSeen ASC (more recent = higher)
4. Final: id ASC (lexicographic, guaranteed unique)
```

This ensures identical inputs always produce identical outputs, critical for testing and debugging.

---

## 2. Template Rendering for Prompt Injection

### 2.1 Markdown Formatting Best Practices

Research shows markdown formatting significantly impacts LLM performance:

- **GPT-4 prefers Markdown** formatting over JSON
- Structured prompts with Markdown **improved accuracy by 10-13 percentage points** in complex tasks
- Headings create hierarchy: `## Warnings`, `### [SECURITY]`, etc.

**Recommended Structure for Injected Warnings:**
```markdown
## PROVISIONAL ALERTS (auto-generated)
> These are real-time alerts about known issues.

### [PROVISIONAL ALERT] Message here
**Issue ID:** PROJ-123
**Applies when:** touches=database,user_input
**Expires in:** 14 days

## Warnings from Past Issues (auto-generated)
These warnings are based on patterns learned from previous PR reviews.

### [SECURITY][incorrect][HIGH] SQL injection via concatenation
**Bad guidance:** "Build queries using string concatenation"
**Observed result:** This led to a security issue.
**Do instead:** Use parameterized queries
**Applies when:** touches=database,user_input; tech=sql
```

**Sources:**
- [Markdown for Prompt Engineering Best Practices](https://tenacity.io/snippets/supercharge-ai-prompts-with-markdown-for-better-results/)
- [Does Prompt Formatting Have Any Impact on LLM Performance?](https://arxiv.org/html/2411.10541v1)
- [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)

### 2.2 String Interpolation vs Template Engines

**Simple String Interpolation (Current Approach):**
- Direct variable substitution: `${pattern.patternContent}`
- Lightweight, no external dependencies
- Sufficient for structured, predictable content

**Template Engine Considerations:**
- Control flow (if/else, loops) built-in
- Better error handling with fallback defaults
- Useful when warning format varies significantly by type

**Recommendation for Phase 3:**
The current simple string interpolation is appropriate because:
1. Warning formats are well-defined and predictable
2. No complex conditional logic required
3. Performance is critical (injected at every prompt)

### 2.3 Security: Avoiding Prompt Injection

While we're *injecting* warnings into prompts, we must prevent malicious content from being injected INTO warnings:

**Attack Patterns to Guard Against:**
- Explicit malicious instructions: "Ignore all previous instructions..."
- Hidden instructions in external content the LLM processes
- HTML/Markdown injection in rendered responses

**Mitigations Applied:**
1. **Content sanitization:** Pattern content comes from trusted sources (PR reviews, admin-defined baselines)
2. **Structural isolation:** Warnings are in dedicated sections with clear boundaries
3. **Quote wrapping:** Bad guidance is always quoted: `"${pattern.patternContent}"`

**Sources:**
- [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [OWASP Top 10 for LLM Applications 2025: Prompt Injection](https://www.checkpoint.com/cyber-hub/what-is-llm-security/prompt-injection/)
- [LLM Prompt Injection Security Best Practices 2025](https://virtualcyberlabs.com/llm-prompt-injection-security-best-practices/)

---

## 3. Token Estimation for Context Management

### 3.1 Why Count Tokens Locally?

The injection system must ensure warnings fit within context limits without calling the API. Benefits:

- **Cost forecasting:** Even 10% token errors cause significant budget overruns at scale
- **Context window management:** Prevent truncation failures
- **Performance:** No network latency for estimation

### 3.2 Tiktoken for OpenAI Models

Tiktoken is OpenAI's official BPE tokenizer that provides exact token counts matching API charges.

**Encoding Selection:**
- `cl100k_base`: GPT-4, GPT-3.5-turbo, text-embedding-ada-002
- `o200k_base`: GPT-4o, newer models

**Basic Implementation:**
```python
import tiktoken

def count_tokens(text: str, encoding_name: str = "cl100k_base") -> int:
    encoding = tiktoken.get_encoding(encoding_name)
    return len(encoding.encode(text))
```

**Scaling Considerations:**
- For 10MB strings, peak memory can reach ~80MB with ~1.3s CPU time
- Consider streaming or chunking for very large inputs

**Sources:**
- [Calculating LLM Token Counts - Practical Guide](https://winder.ai/calculating-token-counts-llm-context-windows-practical-guide/)
- [How Tiktoken Stops AI Token Costs From Exploding](https://galileo.ai/blog/tiktoken-guide-production-ai)
- [Counting Tokens at Scale Using Tiktoken](https://www.dsdev.in/counting-tokens-at-scale-using-tiktoken)

### 3.3 Claude Token Estimation (Without Tiktoken)

Claude uses a different tokenizer than OpenAI. Options:

**Quick Heuristic:**
- Claude: 1 token ~ 3.5 English characters
- OpenAI: 1 token ~ 4 characters

**Linear Regression Approach:**
Train a simple model on representative dataset for greater accuracy than generic heuristics.

**Current Limitation:**
Tiktoken is specifically for OpenAI models; accuracy for Claude token counts is limited.

**Sources:**
- [Counting Claude Tokens Without a Tokenizer](https://blog.gopenai.com/counting-claude-tokens-without-a-tokenizer-e767f2b6e632)
- [The Ultimate Guide to LLM Token Counters](https://skywork.ai/skypage/en/The-Ultimate-Guide-to-LLM-Token-Counters:-Your-Key-to-Unlocking-AI-Efficiency-and-Cost-Control/1975590557433524224)

### 3.4 Token Budget for Warnings

**Current Spec:**
- Maximum 6 warnings (2 baseline + 4 learned)
- ProvisionalAlerts are additive (not counted against max)

**Estimation Strategy:**
```typescript
const ESTIMATED_TOKENS_PER_WARNING = 150; // Conservative average
const MAX_WARNINGS = 6;
const MAX_ALERTS = 3; // Practical cap for alerts
const SECTION_OVERHEAD = 100; // Headers, descriptions

const maxInjectionTokens =
  (MAX_WARNINGS * ESTIMATED_TOKENS_PER_WARNING) +
  (MAX_ALERTS * ESTIMATED_TOKENS_PER_WARNING) +
  SECTION_OVERHEAD;
// ~ 1450 tokens maximum
```

This fits comfortably within typical context windows (4K-128K+ tokens).

---

## 4. Hierarchical Scope Inheritance Patterns

### 4.1 Multi-Tenant Architecture Model

The Phase 3 system uses a two-level hierarchy: **Workspace -> Project**

This follows the hierarchical multi-tenant pattern:
- **Workspace:** Logical grouping (like a tenant)
- **Project:** Sub-tenant within workspace

**Key Principle:** Authorization is scope-dependent - it's not enough to know a pattern is "active"; you need to know which workspace/project it belongs to.

**Sources:**
- [Hierarchical Multi-Tenant Pattern - IEEE](https://ieeexplore.ieee.org/document/6825597/)
- [Multi-Tenant Architecture - Practical Guide](https://medium.com/@okan.yurt/multi-tenant-architecture-a-practical-guide-from-real-world-experience-158c0803c428)
- [How to Design a Multi-Tenant SaaS Architecture](https://clerk.com/blog/how-to-design-multitenant-saas-architecture)

### 4.2 Scope Assignment Rules

```
┌─────────────────────────────────────────────────────────────┐
│                      WORKSPACE SCOPE                        │
│  - DerivedPrinciple (baseline and derived)                  │
│  - Shared across all projects in workspace                  │
│  - Kill switch state tracked per workspace                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       PROJECT SCOPE                         │
│  - PatternDefinition                                        │
│  - PatternOccurrence                                        │
│  - ProvisionalAlert                                         │
│  - InjectionLog                                             │
│  - Project-specific patterns don't pollute other projects   │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Cross-Project Warning Inheritance

**Design Decision:** Cross-project warnings are opt-in and restricted:

1. **Only security patterns** cross project boundaries (v1.2 spec)
2. **Minimum severity:** HIGH or CRITICAL
3. **Relevance gate:** touchOverlap >= 2 OR techOverlap >= 1
4. **Deduplication:** Local patterns win over cross-project duplicates
5. **Priority penalty:** Cross-project patterns get 0.95x multiplier

**Rationale:**
- Reduces noise from irrelevant patterns
- Security issues are universally relevant
- Local context takes precedence

### 4.4 Data Isolation Patterns

**Shared Database with Tenant ID:**
- All entities include `workspaceId` and/or `projectId`
- Queries always filter by scope
- Risk: Data leakage if IDs not enforced

**Implementation Pattern:**
```typescript
// Always scope queries
const patterns = patternRepo.findActive({
  workspaceId,      // Required
  projectId,        // Required for patterns
  carrierStage: target
});
```

### 4.5 Scope Context Propagation

**Key Principle:** Tenant context is mandatory everywhere downstream.

```typescript
// Every injection operation requires scope context
export function selectWarningsForInjection(
  db: Database,
  options: {
    workspaceId: string;   // Always required
    projectId: string;     // Always required
    target: 'context-pack' | 'spec';
    taskProfile: TaskProfile;
    maxWarnings?: number;
    crossProjectWarnings?: boolean;
  }
): InjectionResult
```

---

## 5. Implementation Recommendations

### 5.1 Priority Calculation

Use floating-point arithmetic with deterministic tie-breaking:

```typescript
function computeInjectionPriority(
  pattern: PatternDefinition,
  taskProfile: TaskProfile,
  stats: PatternStats
): number {
  const confidence = computeAttributionConfidence(pattern, stats);
  const severityWeight = SEVERITY_WEIGHTS[pattern.severityMax];
  const relevanceWeight = computeRelevanceWeight(pattern, taskProfile);
  const recencyWeight = computeRecencyWeight(stats.lastSeenActive);

  return confidence * severityWeight * relevanceWeight * recencyWeight;
}
```

### 5.2 Token Budget Enforcement

```typescript
function formatWithTokenBudget(
  result: InjectionResult,
  maxTokens: number = 1500
): string {
  const formatted = formatInjectionForPrompt(result);
  const estimatedTokens = estimateTokens(formatted);

  if (estimatedTokens > maxTokens) {
    // Truncate from lowest priority items
    return formatWithReducedWarnings(result, maxTokens);
  }

  return formatted;
}

function estimateTokens(text: string): number {
  // Claude heuristic: 1 token ~ 3.5 characters
  return Math.ceil(text.length / 3.5);
}
```

### 5.3 Markdown Section Structure

```markdown
## PROVISIONAL ALERTS (auto-generated)
> [High-visibility section for critical real-time alerts]

## Warnings from Past Issues (auto-generated)
[Main warnings section with patterns and principles]

### [CATEGORY][failureMode][SEVERITY] Title
**Bad guidance:** "quoted content"
**Observed result:** Description
**Do instead:** Alternative
**Applies when:** touches=X,Y; tech=Z
```

### 5.4 Testing for Determinism

```typescript
describe('deterministic selection', () => {
  it('produces identical output for identical input', () => {
    const input = createTestInput();
    const result1 = selectWarningsForInjection(db, input);
    const result2 = selectWarningsForInjection(db, input);

    expect(result1.warnings.map(w => w.id))
      .toEqual(result2.warnings.map(w => w.id));
  });
});
```

---

## 6. Summary

| Component | Pattern | Key Insight |
|-----------|---------|-------------|
| Selection | Weighted priority queue | Multi-factor scoring with deterministic tie-breaking |
| Diversity | Tiered slots + category caps | Balance relevance with coverage |
| Formatting | Markdown with sections | GPT-4 prefers markdown; 10-13% accuracy improvement |
| Token Estimation | Character-based heuristic | Claude: 3.5 chars/token; OpenAI: 4 chars/token |
| Scoping | Hierarchical multi-tenant | Workspace for principles, Project for patterns |
| Cross-Project | Opt-in with gates | Security-only, HIGH+, relevance >= 2 touches |

---

## References

### Priority and Selection
- [Priority Queues - Princeton Algorithms](https://algs4.cs.princeton.edu/24pq/)
- [Rank-Sensitive Priority Queues - Springer](https://link.springer.com/chapter/10.1007/978-3-642-03367-4_16)
- [Project Selection and Prioritization Guide](https://aliresources.hexagon.com/enterprise-project-performance/project-selection-prioritization-guide)

### Diversity in Selection
- [Diversity in Recommendations Guide 2025](https://www.shadecoder.com/topics/diversity-in-recommendations-a-comprehensive-guide-for-2025)
- [Fairness and Diversity in Recommender Systems - ACM](https://dl.acm.org/doi/full/10.1145/3664928)
- [Bayesian-Guided Diversity - arXiv](https://arxiv.org/abs/2506.21617)

### Prompt Engineering and Formatting
- [Markdown for Prompt Engineering](https://tenacity.io/snippets/supercharge-ai-prompts-with-markdown-for-better-results/)
- [OpenAI Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- [Prompt Formatting Impact on LLM Performance](https://arxiv.org/html/2411.10541v1)

### Prompt Injection Security
- [OWASP LLM Prompt Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [OWASP Top 10 for LLM 2025: Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)

### Token Counting
- [Calculating LLM Token Counts - Practical Guide](https://winder.ai/calculating-token-counts-llm-context-windows-practical-guide/)
- [Tiktoken Production Guide - Galileo](https://galileo.ai/blog/tiktoken-guide-production-ai)
- [Counting Claude Tokens Without Tokenizer](https://blog.gopenai.com/counting-claude-tokens-without-a-tokenizer-e767f2b6e632)

### Multi-Tenant Architecture
- [Hierarchical Multi-Tenant Pattern - IEEE](https://ieeexplore.ieee.org/document/6825597/)
- [Multi-Tenant SaaS Architecture Guide - Clerk](https://clerk.com/blog/how-to-design-multitenant-saas-architecture)
- [Developer's Guide to Multi-Tenant Architecture - WorkOS](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
