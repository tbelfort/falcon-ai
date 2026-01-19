# Gemini Prompt: ai_docs Research (Research Only — Opus Writes Files)

**Gemini's role:** Return research content to Opus. **Do NOT create files.**

Opus owns ai_docs. Gemini is the research assistant that gathers information. Opus evaluates, requests follow-ups, and writes the final ai_docs.

---

## Template: Initial Research

```
gemini -y -m gemini-3-flash-preview -p "Research <LIBRARY> for <USE_CASE>.

## Context
**Task:** CON-XXX - <ISSUE_TITLE>
**What we're building:** <TASK_DESCRIPTION>
**Other libraries in use:** <OTHER_LIBRARIES>
**Architecture constraints:** <CONSTRAINTS>

## What I Need
For <LIBRARY>, research and return:

1. **Recommended version** for Python 3.12.x
   - What's the latest stable version?
   - Any known issues with 3.12?

2. **API patterns for our use case**
   - Code examples specific to <USE_CASE>
   - Not generic examples — focus on what we need

3. **Gotchas and edge cases**
   - What commonly goes wrong?
   - What's not obvious from the docs?
   - Production issues people hit?

4. **Combination issues with <OTHER_LIBRARIES>**
   - Known conflicts or quirks?
   - Import order issues?
   - Async compatibility?

5. **Best practices**
   - Error handling patterns
   - Resource cleanup
   - Testing approaches

## Output Format
Return the full research content as markdown. DO NOT create files.
I will review and decide what to include in the ai_doc."
```

---

## Template: Follow-Up Research

Use when Opus needs more information after initial research:

```
gemini -y -m gemini-3-flash-preview -p "Follow-up research for <LIBRARY>:

## Previous Research Gaps
The initial research was missing or unclear on:
1. <GAP_1>
2. <GAP_2>

## Specific Questions
Please research:
- <SPECIFIC_QUESTION_1>
- <SPECIFIC_QUESTION_2>

## Context (unchanged)
**Task:** <TASK_DESCRIPTION>
**Other libraries:** <OTHER_LIBRARIES>

Return additional research content. DO NOT create files."
```

---

## Template: Version Verification

Use when Opus needs to verify version compatibility:

```
gemini -y -m gemini-3-flash-preview -p "Verify version compatibility for <LIBRARY>:

**Our constraint:** <VERSION_CONSTRAINT> (from pyproject.toml)
**Python version:** 3.12.x
**Other libraries:** <OTHER_LIBRARIES_WITH_VERSIONS>

Questions:
1. Is <VERSION> compatible with Python 3.12?
2. Any breaking changes between <OLD_VERSION> and <NEW_VERSION>?
3. Any known issues with <OTHER_LIBRARY> at these versions?

Return findings. DO NOT create files."
```

---

## Variables to Replace

| Variable | Source |
|----------|--------|
| `<LIBRARY>` | The library being researched |
| `<USE_CASE>` | Specific use case (e.g., "async HTTP fetching with retries") |
| `<ISSUE_TITLE>` | From Linear issue |
| `<TASK_DESCRIPTION>` | 2-3 sentences on what's being built |
| `<OTHER_LIBRARIES>` | Other libs in the task |
| `<CONSTRAINTS>` | From Context Pack or architecture docs |
| `<VERSION_CONSTRAINT>` | From pyproject.toml |
| `<GAP_N>` | Missing information from initial research |
| `<SPECIFIC_QUESTION_N>` | Targeted follow-up questions |

---

## Workflow Summary

```
1. Opus identifies dependencies (Step 3.1)
       ↓
2. Opus asks Gemini for research (this template)
       ↓
3. Gemini returns research content (NOT files)
       ↓
4. Opus evaluates with extended thinking
       ↓
5. If gaps → Opus asks Gemini for more (follow-up template)
       ↓
6. Repeat until satisfied
       ↓
7. Opus writes ai_doc files
```

**Opus is the quality gate.** Gemini provides raw research; Opus decides what's accurate and complete.
