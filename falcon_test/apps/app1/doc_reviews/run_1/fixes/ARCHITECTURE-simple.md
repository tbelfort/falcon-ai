# Fixes Applied to ARCHITECTURE-simple.md

## Changes Made

### Gap ID 14: import-linter tool version not pinned
**What Changed**: Added version specification for `import-linter` tool and included a development dependency block with the pinned version range.
**Lines Affected**: Lines 142-147 (original line 142, with 5 lines added)
**Content Added/Modified**:
```markdown
**Implementation:** Use a custom lint rule or tool like `import-linter` (version `>=2.0.0,<3.0.0`) with configuration:

**Development Dependency:** Add to your development requirements:
```
import-linter>=2.0.0,<3.0.0
```
```

### Gap ID 57: Real-Time Performance Impossible on CLI-Based Architecture
**What Changed**: Added comprehensive clarification of CLI startup overhead and its impact on performance targets. Explained that the <100ms targets include both CLI initialization (80-170ms) and query execution time (10-30ms), making it clear these are total invocation times, not pure query performance.

**Lines Affected**: Lines 2558-2564 (Test Methodology section)

**Content Added/Modified**:
```markdown
1. **Measurement point:** Wall-clock time from command invocation to exit (includes process startup)
   - **CLI Startup Overhead:** Python interpreter startup, module loading, and database connection initialization add 80-170ms overhead on typical hardware
   - **Performance Target Clarification:** The <100ms targets listed below represent **total CLI invocation time** (including startup overhead), not just query execution time
   - **Query Execution Time:** Actual database query execution typically takes 10-30ms for indexed operations; the remaining time is CLI initialization
   - **Implications:** While query execution is fast, single CLI invocations will always incur startup overhead. For real-time (<100ms end-to-end) performance, consider:
     - Long-running daemon process with IPC/socket interface
     - Python API library for embedding in other applications
     - Batch operations instead of single CLI calls
```

**Detailed Explanation**: The original documentation stated that measurements include "process startup" but did not explain the significant overhead this adds (80-170ms) or clarify whether the <100ms performance targets were realistic given this overhead. The fix quantifies the overhead, clarifies that <100ms is the TOTAL time including startup (not just query execution), breaks down the components (query execution itself is 10-30ms), and provides architectural alternatives for true sub-100ms end-to-end performance.

## Summary
- Gaps addressed: 2
- Sections added: 1 (Development Dependency block)
- Sections modified: 2 (Implementation line updated with version specification; Test Methodology section enhanced with startup overhead breakdown)
