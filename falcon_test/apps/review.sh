#!/bin/bash
# Documentation Review & Fix Script
# Usage: ./review.sh <app_number> [model] [num_tries] [min_severity]
# Examples:
#   ./review.sh 1                      # App 1, sonnet, 1 run, fix HIGH+CRITICAL
#   ./review.sh 5                      # App 5, opus, 1 run, fix HIGH+CRITICAL
#   ./review.sh 2 opus                 # App 2 with opus, 1 run
#   ./review.sh 3 haiku 5              # App 3 with haiku, up to 5 runs
#   ./review.sh 1 sonnet 10 medium     # App 1, fix MEDIUM and above
#   ./review.sh 2 opus 5 critical      # App 2, fix only CRITICAL
#   ./review.sh 3 sonnet 10 low        # App 3, fix ALL severities
#
# Auto-stops early if no new issues found at or above min_severity
# Default models: Apps 1-4 = sonnet, App 5 = opus

set -eu

# Help command (use ${1:-} to handle unset $1 with set -u)
if [ "${1:-}" = "help" ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    echo "Documentation Review & Fix Script"
    echo ""
    echo "Usage: $0 <app_number> [model] [num_tries] [min_severity] [mode]"
    echo ""
    echo "Two-Phase Architecture:"
    echo "  1. DISCOVERY: Uses specified model to find issues"
    echo "  2. FIX: Always uses opus to fix issues (highest quality)"
    echo ""
    echo "Arguments:"
    echo "  app_number    1-5 (required)"
    echo "  model         opus, sonnet, or haiku for DISCOVERY (default: sonnet for 1-4, opus for 5)"
    echo "                Note: FIX phase always uses opus regardless of this setting"
    echo "  num_tries     number of review loops (default: 1)"
    echo "  min_severity  minimum severity to fix (default: high)"
    echo "                  critical - fix only CRITICAL"
    echo "                  high     - fix HIGH + CRITICAL"
    echo "                  medium   - fix MEDIUM + HIGH + CRITICAL"
    echo "                  low      - fix ALL severities"
    echo "  mode          review mode (default: full)"
    echo "                  full            - detailed checklist-driven review"
    echo "                  simple          - minimal prompt, model figures it out"
    echo "                  full-thorough   - full + no solved issues (fresh eyes)"
    echo "                  simple-thorough - simple + no solved issues (fresh eyes)"
    echo ""
    echo "Examples:"
    echo "  $0 1                              # App 1: discover=sonnet, fix=opus"
    echo "  $0 5                              # App 5: discover=opus, fix=opus"
    echo "  $0 2 haiku                        # App 2: discover=haiku (fast), fix=opus"
    echo "  $0 3 sonnet 5                     # App 3: discover=sonnet, fix=opus, 5 runs"
    echo "  $0 1 sonnet 10 medium             # Fix MEDIUM and above"
    echo "  $0 2 haiku 5 critical             # Fast discovery, fix only CRITICAL"
    echo "  $0 3 sonnet 10 low                # Fix ALL severities"
    echo "  $0 1 haiku 5 high simple          # Simple mode, fast discovery"
    echo "  $0 2 sonnet 3 high full-thorough  # Full mode, fresh eyes"
    echo ""
    echo "Modes:"
    echo "  full            - Detailed security checklist for discovery"
    echo "                    Solved issues injected to prevent re-reporting"
    echo "  simple          - General code review (security, bugs, quality)"
    echo "                    Solved issues injected to prevent re-reporting"
    echo "  full-thorough   - Full checklist, but NO solved issues context"
    echo "                    Fresh eyes, may find issues others missed"
    echo "  simple-thorough - General code review, NO solved issues context"
    echo "                    Fresh eyes, broad exploration"
    echo ""
    echo "Auto-stops early if no new issues found at or above min_severity."
    exit 0
fi

# Parse arguments (use ${:-} syntax for set -u compatibility)
APP_NUM="${1:-}"
MODEL_OVERRIDE="${2:-}"
NUM_TRIES="${3:-1}"
MIN_SEVERITY="${4:-high}"
MODE="${5:-full}"

# Validate app number
if [ -z "$APP_NUM" ] || [ "$APP_NUM" -lt 1 ] || [ "$APP_NUM" -gt 5 ] 2>/dev/null; then
    echo "Usage: $0 <app_number> [model] [num_tries] [min_severity] [mode]"
    echo ""
    echo "Two-Phase Architecture:"
    echo "  1. DISCOVERY: Uses specified model to find issues"
    echo "  2. FIX: Always uses opus (highest quality)"
    echo ""
    echo "  app_number:   1-5"
    echo "  model:        opus, sonnet, or haiku for DISCOVERY (default: sonnet for 1-4, opus for 5)"
    echo "  num_tries:    number of review loops (optional, default: 1)"
    echo "  min_severity: minimum severity to fix (optional, default: high)"
    echo "                - critical: fix only CRITICAL"
    echo "                - high:     fix HIGH + CRITICAL"
    echo "                - medium:   fix MEDIUM + HIGH + CRITICAL"
    echo "                - low:      fix ALL (LOW + MEDIUM + HIGH + CRITICAL)"
    echo "  mode:         review mode (optional, default: full)"
    echo "                - full:            detailed checklist-driven discovery"
    echo "                - simple:          general code review (security, bugs, quality)"
    echo "                - full-thorough:   full mode, no solved issues (fresh eyes)"
    echo "                - simple-thorough: general code review, fresh eyes"
    echo ""
    echo "Examples:"
    echo "  $0 1                            # discover=sonnet, fix=opus"
    echo "  $0 5                            # discover=opus, fix=opus"
    echo "  $0 2 haiku                      # discover=haiku (fast), fix=opus"
    echo "  $0 3 sonnet 5                   # 5 runs, discover=sonnet, fix=opus"
    echo "  $0 1 haiku 10 medium            # Fast discovery, fix MEDIUM+"
    echo "  $0 2 sonnet 5 critical          # Fix only CRITICAL"
    echo "  $0 3 haiku 10 low simple        # Fast simple discovery, fix ALL"
    echo ""
    echo "Auto-stops early if no new issues found at or above min_severity."
    exit 1
fi

# Validate num_tries
if ! [[ "$NUM_TRIES" =~ ^[0-9]+$ ]] || [ "$NUM_TRIES" -lt 1 ]; then
    echo "Error: num_tries must be a positive integer"
    exit 1
fi

# Validate min_severity and set FIX_LEVELS
case "$MIN_SEVERITY" in
    critical)
        FIX_LEVELS="CRITICAL"
        FIX_DESC="CRITICAL only"
        ;;
    high)
        FIX_LEVELS="CRITICAL and HIGH"
        FIX_DESC="HIGH + CRITICAL"
        ;;
    medium)
        FIX_LEVELS="CRITICAL, HIGH, and MEDIUM"
        FIX_DESC="MEDIUM + HIGH + CRITICAL"
        ;;
    low)
        FIX_LEVELS="all severities (CRITICAL, HIGH, MEDIUM, and LOW)"
        FIX_DESC="ALL severities"
        ;;
    *)
        echo "Error: Invalid min_severity '$MIN_SEVERITY'"
        echo "Valid options: critical, high, medium, low"
        exit 1
        ;;
esac

# Validate mode and set flags
THOROUGH=false
case "$MODE" in
    full)
        PROMPT_TYPE="full"
        ;;
    simple)
        PROMPT_TYPE="simple"
        ;;
    full-thorough)
        PROMPT_TYPE="full"
        THOROUGH=true
        ;;
    simple-thorough)
        PROMPT_TYPE="simple"
        THOROUGH=true
        ;;
    *)
        echo "Error: Invalid mode '$MODE'"
        echo "Valid options: full, simple, full-thorough, simple-thorough"
        exit 1
        ;;
esac

# Select model: use override if provided, otherwise default
if [ -n "$MODEL_OVERRIDE" ]; then
    # Validate model
    case "$MODEL_OVERRIDE" in
        opus|sonnet|haiku)
            MODEL="$MODEL_OVERRIDE"
            ;;
        *)
            echo "Error: Invalid model '$MODEL_OVERRIDE'"
            echo "Valid models: opus, sonnet, haiku"
            exit 1
            ;;
    esac
else
    # Default: Apps 1-4 = sonnet, App 5 = opus
    if [ "$APP_NUM" -eq 5 ]; then
        MODEL="opus"
    else
        MODEL="sonnet"
    fi
fi

# Get app name
case $APP_NUM in
    1) APP_NAME="Warehouse Inventory CLI" ;;
    2) APP_NAME="Personal Finance Tracker CLI" ;;
    3) APP_NAME="Note-taking/Wiki CLI" ;;
    4) APP_NAME="Task Manager CLI" ;;
    5) APP_NAME="Contact Book CLI" ;;
    *) APP_NAME="Unknown App" ;;  # Fallback (validation above should prevent this)
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/app$APP_NUM"

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  App $APP_NUM: $APP_NAME"
echo "║  Discovery Model: $MODEL"
echo "║  Fix Model: opus (always)"
echo "║  Max Tries: $NUM_TRIES"
echo "║  Fix: $FIX_DESC"
echo "║  Mode: $MODE"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# The full DISCOVERY prompt (detailed checklist, no fixing)
read -r -d '' PROMPT_DISCOVER_FULL << 'PROMPT_EOF' || true
# Documentation Review - DISCOVERY PHASE

You are a senior security engineer performing a thorough review of CLI application documentation.
**YOUR ROLE: DISCOVER AND RECORD ISSUES ONLY. DO NOT FIX ANYTHING.**

## Workflow Steps
1. **DISCOVER** - Find all issues in the documentation
2. **LOAD** - Read the existing issues tracking file
3. **MERGE** - Combine new issues with existing, de-duplicate MEDIUM/LOW
4. **SAVE** - Update the issues tracking file with current status (issues marked OPEN)
5. **REPORT** - Output progress summary for tracking

---

## CONFIGURATION

### App Details
| App | Name | Path |
|-----|------|------|
| 1 | Warehouse Inventory CLI | `falcon_test/apps/app1/` |
| 2 | Personal Finance Tracker CLI | `falcon_test/apps/app2/` |
| 3 | Note-taking/Wiki CLI | `falcon_test/apps/app3/` |
| 4 | Task Manager CLI | `falcon_test/apps/app4/` |
| 5 | Contact Book CLI | `falcon_test/apps/app5/` |

### Current App
**App Number:** __APP_NUM__
**App Name:** __APP_NAME__
**App Path:** `falcon_test/apps/app__APP_NUM__/`
**Issues File:** `falcon_test/apps/app__APP_NUM__/app___APP_NUM__-issues.md`

---

## PHASE 1: DISCOVERY

### Step 1.1: Read All Documentation Files

Use Glob to find all markdown files:
```
falcon_test/apps/app__APP_NUM__/**/*.md
```

Then use Read to examine each file. Typical structure:
- `docs/design/*.md` (technical.md, components.md, use-cases.md)
- `docs/systems/cli/interface.md`
- `docs/systems/database/schema.md`
- `docs/systems/errors.md`
- `docs/systems/architecture/*.md`
- `tasks/*.md`

### Step 1.2: Apply Discovery Checklist

Check EVERY item. Mark N/A if not applicable to this app.

### Issue Classification

**Severity Levels:**
- **CRITICAL**: Security vulnerabilities, data loss risks, race conditions causing corruption
- **HIGH**: Data integrity issues, missing validation, undefined behavior for common cases
- **MEDIUM**: UX inconsistencies, missing features, unclear specifications
- **LOW**: Documentation typos, minor UX improvements, nice-to-haves

**Issue ID Format:** `APP__APP_NUM__-{SEVERITY}-{NUMBER}`
- Numbers are sequential within each severity level
- Numbers are never reused (even if issue is removed)

---

## DISCOVERY CHECKLIST

### 1. SECURITY ISSUES

#### 1.1 Path/File Security (All Apps)
- [ ] Path traversal: Is ".." checked BEFORE os.path.abspath()/normpath()?
- [ ] URL encoding bypass: Are paths URL-decoded before validation?
- [ ] Symlink TOCTOU: Is path validation atomic with file access (os.open + O_NOFOLLOW)?
- [ ] Export paths: Are output file paths validated the same as input paths?
- [ ] Backup file permissions: Are backups created with 0600 permissions atomically?
- [ ] Import file paths: Are import source paths validated?

#### 1.2 Database Security (All Apps)
- [ ] SQL injection: Does EVERY query use parameterized statements?
- [ ] Database permissions: Is DB created atomically with 0600?
- [ ] PRAGMA foreign_keys: Is it enabled on every connection?
- [ ] Busy timeout: Is SQLite busy_timeout configured?

#### 1.3 FTS5 Security (App 3 Only)
- [ ] FTS5 operator injection: Are operators escaped? (AND, OR, NOT, NEAR, *, ^, ")
- [ ] Search input sanitization: Is user input wrapped in quotes with escaping?

#### 1.4 Input Validation (All Apps)
- [ ] Integer overflow: Are numeric fields bounded with explicit max values?
- [ ] String length limits: Are ALL text fields length-limited with specific values?
- [ ] Required fields: Are required vs optional fields clearly specified?

#### 1.5 Format-Specific Injection
- [ ] CSV injection (Apps 1, 2, 5): Are formula characters (=, +, -, @, TAB, CR) prefixed?
- [ ] vCard injection (App 5 Only): Are special chars escaped per RFC 6350?
- [ ] Template injection (App 3 Only): Are template variables whitelisted?

#### 1.6 Information Disclosure (All Apps)
- [ ] Error messages: Do they avoid leaking internal paths?
- [ ] Stack traces: Are they suppressed in production mode?

### 2. CONCURRENCY & RACE CONDITIONS (All Apps)

- [ ] TOCTOU in file ops: Any check-then-act patterns?
- [ ] Batch operations: Do multi-item operations use BEGIN IMMEDIATE?
- [ ] Recurring/scheduled tasks (Apps 2, 4): Is generation idempotent?
- [ ] Concurrent edits: Is there optimistic locking (version/updated_at)?
- [ ] FTS sync (App 3 Only): Are FTS updates in same transaction as content?

### 3. DATA INTEGRITY (All Apps)

- [ ] Atomic transactions: Are related operations wrapped in transactions?
- [ ] Foreign key cascades: Is ON DELETE behavior specified?
- [ ] Orphan prevention: Can records become orphaned?
- [ ] Duplicate handling: Is duplicate detection/prevention specified?
- [ ] Merge conflicts: Is import conflict resolution defined?
- [ ] Decimal precision (App 2 Only): Are monetary values stored as integers/Decimal?
- [ ] Timezone handling: Are timestamps in UTC? Display tz specified?

### 4. LOGIC & EDGE CASES (All Apps)

- [ ] Empty states: Behavior for empty input, results, database?
- [ ] Boundary values: Min/max, zero, negative, very large numbers?
- [ ] Circular references (Apps 3, 4): Can cycles be created? Detection?
- [ ] Archived/deleted items: Can operations target them?
- [ ] Parent-child cascades: Behavior when parent modified/deleted?
- [ ] Default values: Are defaults specified for all optional fields?
- [ ] Case sensitivity: Is search/matching behavior specified?

### 5. SPECIFICATION QUALITY (All Apps)

- [ ] Contradictions: Do different files conflict on same behavior?
- [ ] Ambiguous language: "should" vs "MUST" - is it consistent?
- [ ] Missing specs: Behaviors referenced but never defined?
- [ ] Terminology: Same concept with different names?

### 6. CLI INTERFACE (All Apps)

- [ ] Destructive operation flags: --force for overwrites?
- [ ] Scripting support: --quiet, JSON output?
- [ ] Overwrite protection: File existence check before write?
- [ ] Exit codes: Are all error codes documented?
- [ ] Pagination: Large result set handling?

### 7. ERROR HANDLING (All Apps)

- [ ] Error conditions: Is every failure mode documented?
- [ ] Partial failures: Batch operation rollback behavior?
- [ ] Recovery: Can user recover from errors?
- [ ] Corrupt data: Detection and handling?

---

## PHASE 2: LOAD EXISTING ISSUES

### Step 2.1: Check for Existing File

Use Read to check:
```
falcon_test/apps/app__APP_NUM__/app___APP_NUM__-issues.md
```

**If file exists:**
- Parse all existing issues
- Note which are [x] SOLVED vs [ ] OPEN
- Record the highest issue number for each severity
- Record counts for "BEFORE" snapshot

**If file doesn't exist:**
- Start fresh with empty issue lists
- All issue numbers start at 001
- "BEFORE" counts are all zero

### Step 2.2: Record BEFORE Snapshot

Track: BEFORE_CRITICAL_OPEN, BEFORE_CRITICAL_SOLVED, BEFORE_HIGH_OPEN, BEFORE_HIGH_SOLVED, BEFORE_MEDIUM_OPEN, BEFORE_MEDIUM_SOLVED, BEFORE_LOW_OPEN, BEFORE_LOW_SOLVED, BEFORE_TOTAL

### Step 2.3: Check for Regressions

For each issue marked [x] SOLVED:
- Re-check the documented fix in the source files
- If the fix is no longer present or is incomplete:
  - Change status back to [ ] OPEN
  - Add note: "REGRESSION - fix no longer present"

---

## PHASE 3: MERGE & DE-DUPLICATE

### Step 3.1: Process CRITICAL and HIGH Issues

For each newly discovered CRITICAL or HIGH issue:
1. Check if it matches an existing issue (same file + category + root cause)
2. If match found and OPEN: Skip (already tracked)
3. If match found and SOLVED: Mark as REGRESSION, reopen
4. If no match: Add as new issue

**IMPORTANT: Once an issue is assigned a severity, that severity is FINAL. You are NOT authorized to downgrade or reclassify existing issues.**

### Step 3.2: Process MEDIUM and LOW Issues

**De-duplication is AGGRESSIVE for MEDIUM/LOW.**

1. Check against ALL existing issues (any severity)
2. Same root cause = DUPLICATE (skip)
3. **Maximum limits:** 15 MEDIUM, 10 LOW
4. Only add if genuinely new and under limit

---

## PHASE 4: SAVE ISSUES FILE (DISCOVERY ONLY)

**DO NOT FIX ANYTHING.** Just save the discovered issues as OPEN.

Write to: `falcon_test/apps/app__APP_NUM__/app___APP_NUM__-issues.md`

### Step 4.1: Update Run History Table

**MANDATORY:** Add a new row to the Run History table with this run's stats:
- Run = increment from last run (or 1 if first run)
- Date = today's date (YYYY-MM-DD)
- Model = __MODEL__ (discovery)
- New C/H/M/L = count of NEW issues discovered this run at each severity
- Fixed C/H/M/L = 0 (no fixes in discovery phase)
- Open/Solved/Total = running totals AFTER this run completes

### File Template

```markdown
# App __APP_NUM__: __APP_NAME__ - Issues Tracker

**Last Updated:** {YYYY-MM-DD}
**Last Review By:** Claude __MODEL__
**Review Count:** {n}

---

## Status Legend
- [ ] **OPEN** - Issue identified, not yet fixed
- [x] **SOLVED** - Issue has been fixed
- [-] **WONTFIX** - Acknowledged but not fixing

---

## Summary

| Severity | Open | Solved | Total |
|----------|------|--------|-------|
| CRITICAL | {n} | {n} | {n} |
| HIGH | {n} | {n} | {n} |
| MEDIUM | {n} | {n} | {n} |
| LOW | {n} | {n} | {n} |
| **Total** | **{n}** | **{n}** | **{n}** |

---

## Critical Issues
| ID | Status | Description | File(s) | Notes |
|----|--------|-------------|---------|-------|

## High Issues
| ID | Status | Description | File(s) | Notes |
|----|--------|-------------|---------|-------|

## Medium Issues
| ID | Status | Description | File(s) | Notes |
|----|--------|-------------|---------|-------|

## Low Issues
| ID | Status | Description | File(s) | Notes |
|----|--------|-------------|---------|-------|

---

## Run History

| Run | Date | Model | New C | New H | New M | New L | Fixed C | Fixed H | Fixed M | Fixed L | Open | Solved | Total |
|-----|------|-------|-------|-------|-------|-------|---------|---------|---------|---------|------|--------|-------|
| 1   | {date} | {model} | {n} | {n} | {n} | {n} | {n} | {n} | {n} | {n} | {n} | {n} | {n} |

**Column definitions:**
- New C/H/M/L = NEW issues discovered this run at each severity
- Fixed C/H/M/L = Issues fixed this run at each severity
- Open/Solved/Total = Running totals AFTER this run

---

## Change Log
| Date | Action | Details |
|------|--------|---------|
```

---

## PHASE 5: PROGRESS REPORT

**Output this EXACT format at the end:**

```
╔══════════════════════════════════════════════════════════════════╗
║                    DISCOVERY COMPLETE                            ║
║                  App __APP_NUM__: __APP_NAME__
║                  Model: __MODEL__
╠══════════════════════════════════════════════════════════════════╣
║  NEW_CRITICAL: {n}                                               ║
║  NEW_HIGH: {n}                                                   ║
║  NEW_MEDIUM: {n}                                                 ║
║  NEW_LOW: {n}                                                    ║
╠══════════════════════════════════════════════════════════════════╣
║  OPEN_CRITICAL: {n}                                              ║
║  OPEN_HIGH: {n}                                                  ║
║  OPEN_MEDIUM: {n}                                                ║
║  OPEN_LOW: {n}                                                   ║
╚══════════════════════════════════════════════════════════════════╝
```

**CRITICAL:** The NEW_* and OPEN_* lines are MANDATORY - script depends on them.

---

## RULES

1. Read before write - Always Read a file before Edit
2. Be thorough - Check every checklist item
3. Aggressive de-duplication - MEDIUM/LOW must not bloat
4. Preserve history - Never delete issues
5. Respect limits - Max 15 MEDIUM, 10 LOW
6. Check regressions - SOLVED issues may regress
7. Always output Phase 5 report - Mandatory, exact format
8. **DO NOT FIX ANYTHING** - Discovery only. Fixes are done by a separate agent.
PROMPT_EOF

# The full FIX prompt (always opus)
read -r -d '' PROMPT_FIX_FULL << 'PROMPT_FIX_EOF' || true
# Documentation Fix - FIX PHASE

You are a senior security engineer fixing documentation issues.
**YOUR ROLE: FIX OPEN ISSUES. DO NOT DISCOVER NEW ISSUES.**

## Configuration

**App Number:** __APP_NUM__
**App Name:** __APP_NAME__
**App Path:** `falcon_test/apps/app__APP_NUM__/`
**Issues File:** `falcon_test/apps/app__APP_NUM__/app___APP_NUM__-issues.md`

## Severity Levels to Fix

**FIX THESE SEVERITY LEVELS:** __FIX_LEVELS__

---

## PHASE 1: LOAD ISSUES

### Step 1.1: Read Issues File

Use Read to load:
```
falcon_test/apps/app__APP_NUM__/app___APP_NUM__-issues.md
```

### Step 1.2: Identify Open Issues to Fix

Find all issues with status [ ] OPEN at these severity levels: __FIX_LEVELS__

---

## PHASE 2: FIX ISSUES

**CRITICAL INSTRUCTION - NO EXCEPTIONS:**
- You MUST fix ALL issues at these severity levels: __FIX_LEVELS__
- You are NOT authorized to skip ANY issue at these levels
- You are NOT authorized to decide an issue "doesn't really need fixing"
- You are NOT authorized to reclassify issue severity
- You are NOT authorized to mark issues as "documentation only" or "low priority"
- If an issue is listed at a severity level you're told to fix, YOU MUST FIX IT
- NO JUDGMENT CALLS - fix everything at the specified levels

For each issue at the above severity levels with status [ ] OPEN:

### Step 2.1: Locate and Read
Identify file(s), use Read to get current content

### Step 2.2: Apply Fix
Use Edit to modify the documentation.

**Fix Requirements:**
| Issue Type | Fix Must Include |
|------------|------------------|
| Path validation | Exact order of checks, code pattern with flags |
| SQL injection | "MUST use parameterized queries" + example |
| Integer bounds | Exact min/max values with CHECK constraint |
| String limits | Exact character limits for each field |
| Race condition | Transaction type (BEGIN IMMEDIATE) + locking |
| TOCTOU | Atomic operation pattern (os.open flags) |
| Injection | Exact escaping rules + characters |
| Missing spec | Complete specification with edge cases |

**Language:** Use RFC 2119 (MUST/SHOULD/MAY), be specific, include examples.

### Step 2.3: Mark as Solved
Change [ ] to [x], add "SOLVED - {YYYY-MM-DD}: {brief description of fix}"

**REMINDER: You must process and fix EVERY SINGLE issue at the target severity levels. Count them. If you started with N open issues at target levels, you must attempt to fix all N. Do not skip any.**

---

## PHASE 3: VERIFY FIXES

For each issue just marked SOLVED:
1. Re-read the modified file
2. Confirm fix is present and complete
3. If verification fails: revert to [ ] OPEN, try again

---

## PHASE 4: SAVE ISSUES FILE

Write to: `falcon_test/apps/app__APP_NUM__/app___APP_NUM__-issues.md`

Update:
- Summary table counts
- Issue statuses ([ ] → [x] SOLVED)
- Notes with fix details
- Change Log with today's entry

---

## PHASE 5: PROGRESS REPORT

**Output this EXACT format at the end:**

```
╔══════════════════════════════════════════════════════════════════╗
║                    FIX PHASE COMPLETE                            ║
║                  App __APP_NUM__: __APP_NAME__
║                  Model: opus
╠══════════════════════════════════════════════════════════════════╣
║  FIXED_CRITICAL: {n}                                             ║
║  FIXED_HIGH: {n}                                                 ║
║  FIXED_MEDIUM: {n}                                               ║
║  FIXED_LOW: {n}                                                  ║
╠══════════════════════════════════════════════════════════════════╣
║  REMAINING_OPEN_CRITICAL: {n}                                    ║
║  REMAINING_OPEN_HIGH: {n}                                        ║
║  REMAINING_OPEN_MEDIUM: {n}                                      ║
║  REMAINING_OPEN_LOW: {n}                                         ║
╚══════════════════════════════════════════════════════════════════╝
```

**CRITICAL:** The FIXED_* and REMAINING_OPEN_* lines are MANDATORY - script depends on them.

---

## RULES

1. Read before write - Always Read a file before Edit
2. Precise fixes - Vague is not fixed
3. Verify everything - Confirm fixes applied
4. Preserve history - Never delete issues
5. Always output Phase 5 report - Mandatory, exact format
6. **NO SKIPPING ISSUES** - You MUST fix EVERY issue at the specified severity levels
7. **DO NOT DISCOVER NEW ISSUES** - Focus only on fixing existing open issues
PROMPT_FIX_EOF

# The simple DISCOVERY prompt (minimal guidance, matches general opus agent style)
read -r -d '' PROMPT_DISCOVER_SIMPLE << 'PROMPT_SIMPLE_EOF' || true
# Code Review - DISCOVERY ONLY

Review the code in `falcon_test/apps/app__APP_NUM__/` for any issues including:
- Security vulnerabilities (injection, path traversal, XSS, etc.)
- Bugs and logic errors
- Code quality issues
- Missing error handling
- Documentation inconsistencies or missing specs

**DO NOT FIX ANYTHING.** Report all issues found and record them to the issues file.

**App:** __APP_NUM__ - __APP_NAME__

## What to Do

1. Read all files in the app directory (docs/, tasks/, any code files)
2. Look for issues - be thorough and check everything
3. Read the existing issues file if it exists: `falcon_test/apps/app__APP_NUM__/app___APP_NUM__-issues.md`
4. Add any new issues you find (mark them as OPEN)
5. Save the updated issues file
6. Provide a summary of what was found

## Issue Severities

- **CRITICAL**: Security vulnerabilities, data loss risks, race conditions
- **HIGH**: Data integrity issues, missing validation, undefined behavior
- **MEDIUM**: Code quality issues, unclear specs, missing features
- **LOW**: Typos, minor improvements, style issues

## Issues File Format

Save to: `falcon_test/apps/app__APP_NUM__/app___APP_NUM__-issues.md`

```markdown
# App __APP_NUM__: __APP_NAME__ - Issues Tracker

**Last Updated:** {YYYY-MM-DD}
**Last Review By:** Claude __MODEL__

## Summary

| Severity | Open | Solved | Total |
|----------|------|--------|-------|
| CRITICAL | {n} | {n} | {n} |
| HIGH | {n} | {n} | {n} |
| MEDIUM | {n} | {n} | {n} |
| LOW | {n} | {n} | {n} |
| **Total** | **{n}** | **{n}** | **{n}** |

## Critical Issues
| ID | Status | Description | File(s) | Notes |
|----|--------|-------------|---------|-------|

## High Issues
| ID | Status | Description | File(s) | Notes |
|----|--------|-------------|---------|-------|

## Medium Issues
| ID | Status | Description | File(s) | Notes |
|----|--------|-------------|---------|-------|

## Low Issues
| ID | Status | Description | File(s) | Notes |
|----|--------|-------------|---------|-------|

## Run History

| Run | Date | Model | New C | New H | New M | New L | Fixed C | Fixed H | Fixed M | Fixed L | Open | Solved | Total |
|-----|------|-------|-------|-------|-------|-------|---------|---------|---------|---------|------|--------|-------|

## Change Log
| Date | Action | Details |
|------|--------|---------|
```

## Output Required

At the end, output these lines (script parses them):
```
NEW_CRITICAL: {n}
NEW_HIGH: {n}
NEW_MEDIUM: {n}
NEW_LOW: {n}
OPEN_CRITICAL: {n}
OPEN_HIGH: {n}
OPEN_MEDIUM: {n}
OPEN_LOW: {n}
```
PROMPT_SIMPLE_EOF

# The simple FIX prompt (always opus)
read -r -d '' PROMPT_FIX_SIMPLE << 'PROMPT_FIX_SIMPLE_EOF' || true
# Code Fix

Fix open issues in `falcon_test/apps/app__APP_NUM__/app___APP_NUM__-issues.md`.
**DO NOT DISCOVER NEW ISSUES.** Just fix existing open ones.

**App:** __APP_NUM__ - __APP_NAME__

## What to Do

1. Read the issues file: `falcon_test/apps/app__APP_NUM__/app___APP_NUM__-issues.md`
2. Find all [ ] OPEN issues at these severity levels: __FIX_LEVELS__
3. For each open issue:
   - Read the file mentioned in the issue
   - Make the actual edits to fix the issue
   - Mark the issue as [x] SOLVED with a note describing the fix
4. Save the updated issues file
5. Provide a summary of what was fixed

## Output Required

At the end, output these lines (script parses them):
```
FIXED_CRITICAL: {n}
FIXED_HIGH: {n}
FIXED_MEDIUM: {n}
FIXED_LOW: {n}
REMAINING_OPEN_CRITICAL: {n}
REMAINING_OPEN_HIGH: {n}
REMAINING_OPEN_MEDIUM: {n}
REMAINING_OPEN_LOW: {n}
```
PROMPT_FIX_SIMPLE_EOF

# Select prompts based on mode
if [ "$PROMPT_TYPE" = "simple" ]; then
    PROMPT_DISCOVER="$PROMPT_DISCOVER_SIMPLE"
    PROMPT_FIX="$PROMPT_FIX_SIMPLE"
else
    PROMPT_DISCOVER="$PROMPT_DISCOVER_FULL"
    PROMPT_FIX="$PROMPT_FIX_FULL"
fi

# Load existing solved issues into context for discovery (skip if thorough - fresh eyes)
if [ "$THOROUGH" = false ]; then
    ISSUES_FILE="$APP_DIR/app_${APP_NUM}-issues.md"
    if [ -f "$ISSUES_FILE" ]; then
        # Extract solved issues - handle both table format and header format
        # Table format: | APP1-CRITICAL-001 | [x] SOLVED...
        # Header format: ### [x] C1. Missing...
        SOLVED_TABLE=$(grep -E "^\| APP[0-9]+-[A-Z]+-[0-9]+ \| \[x\]" "$ISSUES_FILE" 2>/dev/null || true)
        SOLVED_HEADERS=$(grep -E "^### \[x\]" "$ISSUES_FILE" 2>/dev/null || true)

        SOLVED_ISSUES=""
        if [ -n "$SOLVED_TABLE" ]; then
            SOLVED_ISSUES="$SOLVED_TABLE"
        fi
        if [ -n "$SOLVED_HEADERS" ]; then
            if [ -n "$SOLVED_ISSUES" ]; then
                SOLVED_ISSUES="$SOLVED_ISSUES
$SOLVED_HEADERS"
            else
                SOLVED_ISSUES="$SOLVED_HEADERS"
            fi
        fi

        if [ -n "$SOLVED_ISSUES" ]; then
            # Use printf to avoid echo adding an extra newline which would miscount
            SOLVED_COUNT=$(printf '%s\n' "$SOLVED_ISSUES" | wc -l | tr -d ' ')
            PROMPT_DISCOVER="$PROMPT_DISCOVER

---

## PREVIOUSLY SOLVED ISSUES ($SOLVED_COUNT total - DO NOT RE-REPORT)

The following issues have already been identified and solved. Do NOT report these as new issues:

$SOLVED_ISSUES

**IMPORTANT:** These $SOLVED_COUNT issues are already tracked and solved. Only report NEW issues not in this list.
"
        fi
    fi
fi

# Substitute placeholders in discovery prompt (use | delimiter to handle / in app names)
PROMPT_DISCOVER=$(echo "$PROMPT_DISCOVER" | sed "s|__APP_NUM__|$APP_NUM|g")
PROMPT_DISCOVER=$(echo "$PROMPT_DISCOVER" | sed "s|__APP_NAME__|$APP_NAME|g")
PROMPT_DISCOVER=$(echo "$PROMPT_DISCOVER" | sed "s|__MODEL__|$MODEL|g")
PROMPT_DISCOVER=$(echo "$PROMPT_DISCOVER" | sed "s|__FIX_LEVELS__|$FIX_LEVELS|g")
PROMPT_DISCOVER=$(echo "$PROMPT_DISCOVER" | sed "s|__MIN_SEVERITY__|$MIN_SEVERITY|g")

# Substitute placeholders in fix prompt (always opus)
PROMPT_FIX=$(echo "$PROMPT_FIX" | sed "s|__APP_NUM__|$APP_NUM|g")
PROMPT_FIX=$(echo "$PROMPT_FIX" | sed "s|__APP_NAME__|$APP_NAME|g")
PROMPT_FIX=$(echo "$PROMPT_FIX" | sed "s|__MODEL__|opus|g")
PROMPT_FIX=$(echo "$PROMPT_FIX" | sed "s|__FIX_LEVELS__|$FIX_LEVELS|g")
PROMPT_FIX=$(echo "$PROMPT_FIX" | sed "s|__MIN_SEVERITY__|$MIN_SEVERITY|g")

# Change to project root for correct relative paths
cd "$SCRIPT_DIR/.."

# Function to run claude with retry on rate limit
run_claude() {
    local PROMPT_CONTENT="$1"
    local MODEL_TO_USE="$2"
    local LOG_FILE="$3"
    local PHASE_NAME="$4"

    # Create temp file with secure permissions
    local OLD_UMASK
    OLD_UMASK=$(umask)
    umask 077
    local PROMPT_FILE=$(mktemp)
    local STDERR_FILE=$(mktemp)
    umask "$OLD_UMASK"
    echo "$PROMPT_CONTENT" > "$PROMPT_FILE"

    local MAX_RETRIES=5
    local RETRY_COUNT=0
    while true; do
        # Run claude with stream-json and extract text in real-time
        # Capture stderr separately to detect rate limit errors without false positives
        claude --model "$MODEL_TO_USE" --print --dangerously-skip-permissions --verbose --output-format stream-json < "$PROMPT_FILE" 2>"$STDERR_FILE" | \
        python3 -u -c '
import sys, json
log = open("'"$LOG_FILE"'", "w", buffering=1)
parse_errors = 0
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        o = json.loads(line)
        t = o.get("type", "")
        text = ""
        if t == "content_block_delta":
            text = o.get("delta", {}).get("text", "")
        elif t == "assistant":
            for b in o.get("message", {}).get("content", []):
                if b.get("type") == "text": text += b.get("text", "")
        elif t == "result":
            text = o.get("result", "")
        if text:
            sys.stdout.write(text)
            sys.stdout.flush()
            log.write(text)
            log.flush()
    except json.JSONDecodeError:
        parse_errors += 1
        if parse_errors <= 3:
            sys.stderr.write(f"Warning: JSON parse error on line: {line[:100]}...\n")
    except Exception as e:
        sys.stderr.write(f"Warning: {type(e).__name__}: {e}\n")
log.close()
print()
'
        # Check for rate limit error in stderr (not in log content to avoid false positives)
        if grep -qi "rate.limit\|429\|too.many.requests\|overloaded" "$STDERR_FILE" 2>/dev/null; then
            RETRY_COUNT=$((RETRY_COUNT + 1))
            if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
                echo "  ⚠ Rate limited $MAX_RETRIES times, giving up on $PHASE_NAME"
                break
            fi
            local WAIT_TIME=$((RANDOM % 21 + 10))  # Random 10-30 seconds
            echo ""
            echo "  ⚠ Rate limited, waiting ${WAIT_TIME}s before retry ($RETRY_COUNT/$MAX_RETRIES)..."
            sleep $WAIT_TIME
            > "$LOG_FILE"  # Clear log for retry
            > "$STDERR_FILE"  # Clear stderr for retry
        else
            break  # Success, exit retry loop
        fi
    done

    rm -f "$PROMPT_FILE" "$STDERR_FILE"
}

# Track log files created during this run for cleanup
LOGS_TO_CLEANUP=()

# Run the review loop
for ((TRY=1; TRY<=NUM_TRIES; TRY++)); do
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    DISCOVER_LOG="$APP_DIR/discover-${TIMESTAMP}.log"
    FIX_LOG="$APP_DIR/fix-${TIMESTAMP}.log"
    LOGS_TO_CLEANUP+=("$DISCOVER_LOG" "$FIX_LOG")

    # Random initial delay on first run to stagger parallel executions
    if [ $TRY -eq 1 ]; then
        INIT_WAIT=$((RANDOM % 9 + 2))  # Random 2-10 seconds
        echo "  Starting in ${INIT_WAIT}s..."
        sleep $INIT_WAIT
    fi

    echo ""
    echo "┌─────────────────────────────────────────────────────────────┐"
    echo "│  TRY $TRY of $NUM_TRIES                                            │"
    echo "└─────────────────────────────────────────────────────────────┘"

    # ===== PHASE 1: DISCOVERY (user-specified model) =====
    echo ""
    echo "  ┌─ DISCOVERY PHASE ─────────────────────────────────────────┐"
    echo "  │  Model: $MODEL"
    echo "  │  Log: app$APP_NUM/discover-${TIMESTAMP}.log"
    echo "  └───────────────────────────────────────────────────────────┘"
    echo ""

    run_claude "$PROMPT_DISCOVER" "$MODEL" "$DISCOVER_LOG" "discovery"

    # Extract new issue counts from discovery log
    if [ -f "$DISCOVER_LOG" ]; then
        NEW_CRITICAL=$(grep -oE "NEW_CRITICAL: [0-9]+" "$DISCOVER_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "-1")
        NEW_HIGH=$(grep -oE "NEW_HIGH: [0-9]+" "$DISCOVER_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "-1")
        NEW_MEDIUM=$(grep -oE "NEW_MEDIUM: [0-9]+" "$DISCOVER_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "-1")
        NEW_LOW=$(grep -oE "NEW_LOW: [0-9]+" "$DISCOVER_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "-1")

        # Extract open issue counts
        OPEN_CRITICAL=$(grep -oE "OPEN_CRITICAL: [0-9]+" "$DISCOVER_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
        OPEN_HIGH=$(grep -oE "OPEN_HIGH: [0-9]+" "$DISCOVER_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
        OPEN_MEDIUM=$(grep -oE "OPEN_MEDIUM: [0-9]+" "$DISCOVER_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
        OPEN_LOW=$(grep -oE "OPEN_LOW: [0-9]+" "$DISCOVER_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
    else
        echo "  Warning: Discovery log not created - claude may have failed"
        NEW_CRITICAL="-1"; NEW_HIGH="-1"; NEW_MEDIUM="-1"; NEW_LOW="-1"
        OPEN_CRITICAL="0"; OPEN_HIGH="0"; OPEN_MEDIUM="0"; OPEN_LOW="0"
    fi

    echo ""
    echo "  ───────────────────────────────────────────────────────────"
    echo "  Discovery complete"
    echo "  New: CRIT=$NEW_CRITICAL HIGH=$NEW_HIGH MED=$NEW_MEDIUM LOW=$NEW_LOW"
    echo "  Open: CRIT=$OPEN_CRITICAL HIGH=$OPEN_HIGH MED=$OPEN_MEDIUM LOW=$OPEN_LOW"
    echo "  ───────────────────────────────────────────────────────────"

    # Determine if there are open issues to fix at target severity
    NEED_FIX=false
    case "$MIN_SEVERITY" in
        critical)
            if [ "$OPEN_CRITICAL" != "0" ] && [ "$OPEN_CRITICAL" != "-1" ]; then NEED_FIX=true; fi
            ;;
        high)
            if [ "$OPEN_CRITICAL" != "0" ] && [ "$OPEN_CRITICAL" != "-1" ]; then NEED_FIX=true; fi
            if [ "$OPEN_HIGH" != "0" ] && [ "$OPEN_HIGH" != "-1" ]; then NEED_FIX=true; fi
            ;;
        medium)
            if [ "$OPEN_CRITICAL" != "0" ] && [ "$OPEN_CRITICAL" != "-1" ]; then NEED_FIX=true; fi
            if [ "$OPEN_HIGH" != "0" ] && [ "$OPEN_HIGH" != "-1" ]; then NEED_FIX=true; fi
            if [ "$OPEN_MEDIUM" != "0" ] && [ "$OPEN_MEDIUM" != "-1" ]; then NEED_FIX=true; fi
            ;;
        low)
            if [ "$OPEN_CRITICAL" != "0" ] && [ "$OPEN_CRITICAL" != "-1" ]; then NEED_FIX=true; fi
            if [ "$OPEN_HIGH" != "0" ] && [ "$OPEN_HIGH" != "-1" ]; then NEED_FIX=true; fi
            if [ "$OPEN_MEDIUM" != "0" ] && [ "$OPEN_MEDIUM" != "-1" ]; then NEED_FIX=true; fi
            if [ "$OPEN_LOW" != "0" ] && [ "$OPEN_LOW" != "-1" ]; then NEED_FIX=true; fi
            ;;
    esac

    # ===== PHASE 2: FIX (always opus) =====
    if [ "$NEED_FIX" = true ]; then
        echo ""
        echo "  ┌─ FIX PHASE ───────────────────────────────────────────────┐"
        echo "  │  Model: opus (always)"
        echo "  │  Log: app$APP_NUM/fix-${TIMESTAMP}.log"
        echo "  └───────────────────────────────────────────────────────────┘"
        echo ""

        run_claude "$PROMPT_FIX" "opus" "$FIX_LOG" "fix"

        # Extract fix counts
        if [ -f "$FIX_LOG" ]; then
            FIXED_CRITICAL=$(grep -oE "FIXED_CRITICAL: [0-9]+" "$FIX_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
            FIXED_HIGH=$(grep -oE "FIXED_HIGH: [0-9]+" "$FIX_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
            FIXED_MEDIUM=$(grep -oE "FIXED_MEDIUM: [0-9]+" "$FIX_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
            FIXED_LOW=$(grep -oE "FIXED_LOW: [0-9]+" "$FIX_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")

            # Extract remaining open counts
            REMAINING_CRITICAL=$(grep -oE "REMAINING_OPEN_CRITICAL: [0-9]+" "$FIX_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
            REMAINING_HIGH=$(grep -oE "REMAINING_OPEN_HIGH: [0-9]+" "$FIX_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
            REMAINING_MEDIUM=$(grep -oE "REMAINING_OPEN_MEDIUM: [0-9]+" "$FIX_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
            REMAINING_LOW=$(grep -oE "REMAINING_OPEN_LOW: [0-9]+" "$FIX_LOG" 2>/dev/null | tail -1 | grep -oE "[0-9]+" || echo "0")
        else
            echo "  Warning: Fix log not created - claude may have failed"
            FIXED_CRITICAL="0"; FIXED_HIGH="0"; FIXED_MEDIUM="0"; FIXED_LOW="0"
            REMAINING_CRITICAL="0"; REMAINING_HIGH="0"; REMAINING_MEDIUM="0"; REMAINING_LOW="0"
        fi

        echo ""
        echo "  ───────────────────────────────────────────────────────────"
        echo "  Fix complete"
        echo "  Fixed: CRIT=$FIXED_CRITICAL HIGH=$FIXED_HIGH MED=$FIXED_MEDIUM LOW=$FIXED_LOW"
        echo "  Remaining: CRIT=$REMAINING_CRITICAL HIGH=$REMAINING_HIGH MED=$REMAINING_MEDIUM LOW=$REMAINING_LOW"
        echo "  ───────────────────────────────────────────────────────────"
    else
        echo ""
        echo "  ───────────────────────────────────────────────────────────"
        echo "  No open issues at $MIN_SEVERITY+ level - skipping fix phase"
        echo "  ───────────────────────────────────────────────────────────"
        FIXED_CRITICAL=0
        FIXED_HIGH=0
        FIXED_MEDIUM=0
        FIXED_LOW=0
        # No fix phase, so remaining = open from discovery
        REMAINING_CRITICAL=0
        REMAINING_HIGH=0
        REMAINING_MEDIUM=0
        REMAINING_LOW=0
    fi

    # Summary for this try
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Try $TRY/$NUM_TRIES Summary"
    echo "  New: CRIT=$NEW_CRITICAL HIGH=$NEW_HIGH MED=$NEW_MEDIUM LOW=$NEW_LOW"
    echo "  Fixed: CRIT=$FIXED_CRITICAL HIGH=$FIXED_HIGH MED=$FIXED_MEDIUM LOW=$FIXED_LOW"
    echo "═══════════════════════════════════════════════════════════════"

    # Check if we should stop early:
    # 1. No new issues found at target severity, AND
    # 2. No remaining open issues at target severity (fixes succeeded or nothing to fix)
    SHOULD_STOP=false
    NO_NEW=false
    NO_REMAINING=false

    case "$MIN_SEVERITY" in
        critical)
            if [ "$NEW_CRITICAL" = "0" ]; then NO_NEW=true; fi
            if [ "$REMAINING_CRITICAL" = "0" ]; then NO_REMAINING=true; fi
            ;;
        high)
            if [ "$NEW_CRITICAL" = "0" ] && [ "$NEW_HIGH" = "0" ]; then NO_NEW=true; fi
            if [ "$REMAINING_CRITICAL" = "0" ] && [ "$REMAINING_HIGH" = "0" ]; then NO_REMAINING=true; fi
            ;;
        medium)
            if [ "$NEW_CRITICAL" = "0" ] && [ "$NEW_HIGH" = "0" ] && [ "$NEW_MEDIUM" = "0" ]; then NO_NEW=true; fi
            if [ "$REMAINING_CRITICAL" = "0" ] && [ "$REMAINING_HIGH" = "0" ] && [ "$REMAINING_MEDIUM" = "0" ]; then NO_REMAINING=true; fi
            ;;
        low)
            if [ "$NEW_CRITICAL" = "0" ] && [ "$NEW_HIGH" = "0" ] && [ "$NEW_MEDIUM" = "0" ] && [ "$NEW_LOW" = "0" ]; then NO_NEW=true; fi
            if [ "$REMAINING_CRITICAL" = "0" ] && [ "$REMAINING_HIGH" = "0" ] && [ "$REMAINING_MEDIUM" = "0" ] && [ "$REMAINING_LOW" = "0" ]; then NO_REMAINING=true; fi
            ;;
    esac

    if [ "$NO_NEW" = true ] && [ "$NO_REMAINING" = true ]; then
        SHOULD_STOP=true
    fi

    if [ "$SHOULD_STOP" = true ]; then
        echo ""
        echo "╔═══════════════════════════════════════════════════════════════╗"
        echo "║  STOPPING EARLY: No new/remaining issues at $MIN_SEVERITY+ level"
        echo "║  Completed $TRY of $NUM_TRIES tries"
        echo "╚═══════════════════════════════════════════════════════════════╝"
        break
    elif [ "$NO_NEW" = true ]; then
        echo ""
        echo "  Note: No new issues, but $((REMAINING_CRITICAL + REMAINING_HIGH + REMAINING_MEDIUM + REMAINING_LOW)) issues remain unfixed"
    fi

    # Small delay between runs if more to go
    if [ $TRY -lt $NUM_TRIES ]; then
        echo ""
        echo "  Waiting 2 seconds before next try..."
        sleep 2
    fi
done

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  REVIEW COMPLETE: App $APP_NUM - $APP_NAME"
echo "  Discovery Model: $MODEL"
echo "  Fix Model: opus"
echo "  Tries: $TRY of $NUM_TRIES"
echo "  Fixed: $FIX_DESC"
echo "═══════════════════════════════════════════════════════════════"

# Clean up only log files created during THIS run (not concurrent runs)
CLEANED_COUNT=0
for LOG_FILE in "${LOGS_TO_CLEANUP[@]}"; do
    if [ -f "$LOG_FILE" ]; then
        rm -f "$LOG_FILE"
        CLEANED_COUNT=$((CLEANED_COUNT + 1))
    fi
done
# Also clean up legacy review-*.log files from old script versions
OLD_LOG_COUNT=$(find "$APP_DIR" -name "review-*.log" 2>/dev/null | wc -l | tr -d ' ')
if [ "$OLD_LOG_COUNT" -gt 0 ]; then
    rm -f "$APP_DIR"/review-*.log
    CLEANED_COUNT=$((CLEANED_COUNT + OLD_LOG_COUNT))
fi
if [ "$CLEANED_COUNT" -gt 0 ]; then
    echo ""
    echo "  Cleaned up $CLEANED_COUNT log file(s)"
fi
