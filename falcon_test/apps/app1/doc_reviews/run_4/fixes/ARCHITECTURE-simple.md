# Fixes Applied to falcon_test/apps/app1/docs/systems/architecture/ARCHITECTURE-simple.md

## Changes Made

### Issue ID 94: SQLite WAL Mode on Network Filesystems Will Cause Silent Data Corruption
**What Changed**: Updated all references to mapped network drives to correctly classify them as network filesystems that WILL cause data corruption, not merely stability issues. Changed guidance from "allowed with warning" to "MUST NOT use" with explicit critical warnings.

**Content Added/Modified**:

#### 1. Code Comment (Lines 563-569)
```python
# CRITICAL WARNING: Mapped network drives (e.g., Z:\) cannot be reliably detected
# programmatically, but they WILL CAUSE DATA CORRUPTION with SQLite WAL mode.
# A mapped drive IS a network filesystem with a drive letter alias.
# Users MUST NOT use mapped network drives. This limitation must be documented
# prominently in user-facing documentation and error messages.
```

Previously stated: "Mapped network drives may cause WAL mode corruption" and were treated as a user responsibility issue.
Now states: "WILL CAUSE DATA CORRUPTION" with explicit requirement to document prominently.

#### 2. Path Type Support Table (Line 581)
```markdown
| Mapped drives (`Z:\db.sqlite`) | **No** | **MUST NOT use** | **CRITICAL: Mapped drives ARE network filesystems. Will cause silent data corruption with WAL mode. Cannot be reliably detected programmatically - users must be warned explicitly in documentation.** |
```

Previously stated: "Yes | Allowed with warning | User responsible for mount stability"
Now states: "No | MUST NOT use | CRITICAL: ... Will cause silent data corruption"

#### 3. UNC Path Error Message (Lines 542-549)
```python
raise ValidationError(
    "UNC paths (network shares) are not supported. "
    "SQLite WAL mode causes data corruption on network storage. "
    "Please use a local filesystem path. WARNING: Mapped network drives "
    "(Z:\\, Y:\\, etc.) also cause corruption and must not be used."
)
```

Previously: Only blocked UNC paths and suggested mapped drives as alternative.
Now: Explicitly warns that mapped drives also cause corruption and must not be used.

#### 4. Deployment File System Requirements (Lines 791-800)
Added new table row and critical warning section:
```markdown
| **Windows mapped network drives (Z:\, Y:\, etc.)** | **No** | **CRITICAL: These ARE network filesystems. Will cause silent data corruption with WAL mode.** |

**CRITICAL WARNING for Windows Users:**
Mapped network drives (Z:\, Y:\, etc.) are network filesystems with drive letter aliases. Using SQLite WAL mode on mapped network drives WILL cause silent data corruption and data loss. The application cannot reliably detect mapped drives programmatically. Users MUST ensure database paths point to physically local storage only. This warning MUST be prominently displayed in user-facing documentation and installation guides.
```

Previously: No mention of mapped drives in deployment requirements.
Now: Explicit table entry and prominent warning section for Windows users.

---

## Summary
- Issues fixed: 1 (Issue ID 94)
- Sections modified: 4
  - Path validation code comments
  - Path type support table
  - Error message in validation function
  - Deployment file system requirements table
- Critical severity: YES - addressed silent data corruption risk
- Impact: Documentation now correctly identifies mapped network drives as network filesystems that will cause data corruption, not just stability issues. Users are explicitly warned against using them, and the "allowed with warning" guidance has been replaced with "MUST NOT use" requirements.
