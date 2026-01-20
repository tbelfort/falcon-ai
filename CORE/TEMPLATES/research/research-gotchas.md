# Gemini Prompt: Breadth Research (Solution Space Exploration)

Use this template for **breadth research** — exploring the landscape of possible solutions, trade-offs, and third-party options.

**Gemini's role:** Explore options and surface trade-offs. Opus will later do **depth research** on the chosen approach.

---

## Template: Single Library/Tool

```
<CONFIG>Research tool command</CONFIG> "Research the solution space for <USE_CASE>. Specifically:

1. **Tool options:** What are the main approaches/libraries for this? (e.g., import-linter vs AST vs grep)
2. **Trade-offs:** What are the pros/cons of each approach?
3. **Production gotchas:** What commonly goes wrong with each approach?
4. **Version issues:** Any Python 3.12.x compatibility concerns?
5. **Combination issues:** Problems when used with <OTHER_LIBRARIES>?

I need to understand the landscape of options, not just one solution. Include tool names with brief trade-off summaries."
```

---

## Template: Specific Library Deep-Dive

```
<CONFIG>Research tool command</CONFIG> "What are the common gotchas when using <LIBRARY> for <USE_CASE>? Specifically:
- What can go wrong in production?
- Version-specific issues for Python 3.12.x?
- Edge cases that aren't obvious?
- Issues when combined with <OTHER_LIBRARIES>?

Focus on things that could bite us, not basic usage or tutorials."
```

---

## Template: Approach Comparison

```
<CONFIG>Research tool command</CONFIG> "Compare these approaches for <TASK>:
1. <APPROACH_1>
2. <APPROACH_2>
3. <APPROACH_3>

For each, tell me:
- When to use it
- When NOT to use it
- Hidden costs (complexity, dependencies, maintenance)
- Production gotchas

Our constraints: <CONSTRAINTS>

Which approach fits best and why?"
```

---

## Variables to Replace

- `<LIBRARY>` — The library being researched (e.g., `httpx AsyncClient`)
- `<USE_CASE>` — Specific use case (e.g., `timeout handling with retries`)
- `<OTHER_LIBRARIES>` — Other libs in the task (e.g., `pydantic v2`)
- `<TASK>` — What we're trying to accomplish
- `<APPROACH_N>` — Specific approaches to compare
- `<CONSTRAINTS>` — Architecture constraints that apply

---

## Output Format

Label findings as "(Source: Gemini research)" in Section 8.5 of the Context Pack.

**Example:**

```markdown
### From Gemini Breadth Research

- **Tool comparison:** import-linter requires packages to be importable in the environment; AST parsing is more self-contained but CPU-intensive for large codebases; grep is fastest but has many false positives. (Source: Gemini research)
- **Version compatibility:** import-linter 2.9+ fully supports Python 3.12. (Source: Gemini research)
- **Combination issue:** uv workspaces + import-linter may require `uv sync` before running. (Source: Gemini research)
```

---

## When to Use Which Template

| Scenario | Template |
|----------|----------|
| "What should we use for X?" | Solution Space Exploration |
| "We're using library X, what gotchas?" | Specific Library Deep-Dive |
| "Architecture says X but should we consider Y?" | Approach Comparison |
