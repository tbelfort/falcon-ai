# Design Completeness Scout Report

## Status: GAPS_FOUND

## Findings Summary

| # | Title | Severity | Blocking | Confidence | Affected Files |
|---|-------|----------|----------|------------|----------------|
| 1 | Soft Delete Implementation Details Missing | HIGH | BLOCKING | HIGH | ["falcon_test/apps/app1/docs/design/use-cases.md", "falcon_test/apps/app1/docs/systems/database/schema.md"] |
| 2 | Delete-Item Command Missing from CLI Interface Documentation | HIGH | BLOCKING | HIGH | ["falcon_test/apps/app1/docs/design/use-cases.md", "falcon_test/apps/app1/docs/design/components.md", "falcon_test/apps/app1/docs/systems/cli/interface.md"] |
| 3 | Update-Item Command Missing from CLI Interface Documentation | HIGH | BLOCKING | HIGH | ["falcon_test/apps/app1/docs/design/components.md", "falcon_test/apps/app1/docs/systems/cli/interface.md"] |
| 4 | Appendix A Secure Batch Import Script Referenced But Not Provided | MEDIUM | NON_BLOCKING | HIGH | ["falcon_test/apps/app1/docs/design/use-cases.md"] |
| 5 | Disaster Recovery Section Referenced But Not Found | MEDIUM | NON_BLOCKING | HIGH | ["falcon_test/apps/app1/docs/design/use-cases.md", "falcon_test/apps/app1/docs/systems/architecture/ARCHITECTURE-simple.md"] |
| 6 | Config Show Command Not Fully Specified | LOW | NON_BLOCKING | MEDIUM | ["falcon_test/apps/app1/docs/systems/cli/interface.md"] |

## Finding Details

#### Finding 1: Soft Delete Implementation Details Missing
**Severity:** HIGH
**Blocking:** BLOCKING
**Confidence:** HIGH
**Description:** UC8 (Deleting or Discontinuing Items) in use-cases.md describes a `--soft-delete` flag that marks items as inactive with `status = 'discontinued'` and a `discontinued_at` timestamp. However, the database schema in schema.md does not include these fields. The products table schema only defines: id, sku, name, description, quantity, min_stock_level, location, created_at, updated_at. Without corresponding schema columns, the soft delete feature cannot be implemented as designed.
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md", "falcon_test/apps/app1/docs/systems/database/schema.md"]
**Evidence:** UC8 in use-cases.md (lines 413-416) states: "Item remains in database with `status = 'discontinued'` and `discontinued_at` timestamp". The schema definition in schema.md (lines 596-608) shows the CREATE TABLE statement which does not include status or discontinued_at columns.
**Suggested Fix:** Either add `status TEXT DEFAULT 'active' CHECK (status IN ('active', 'discontinued'))` and `discontinued_at TEXT` columns to the products table schema in schema.md, OR remove/defer the soft delete feature from UC8 until a future version and update the use case documentation accordingly.

#### Finding 2: Delete-Item Command Missing from CLI Interface Documentation
**Severity:** HIGH
**Blocking:** BLOCKING
**Confidence:** HIGH
**Description:** UC8 (Deleting or Discontinuing Items) describes a `delete-item` command with `--sku`, `--force`, and `--soft-delete` options. The components.md file documents a `cmd_delete_item(db_path: str, sku: str, force: bool)` function. However, the CLI interface specification (interface.md) does not include a `delete-item` command section. The file documents init, add-item, update-stock, search, low-stock-report, and export-csv, but delete-item is absent. Without CLI specification, implementers lack command syntax, option details, behavior steps, output formats, and exit codes.
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md", "falcon_test/apps/app1/docs/design/components.md", "falcon_test/apps/app1/docs/systems/cli/interface.md"]
**Evidence:** UC8 references `warehouse-cli delete-item --sku "WH-123"` with `--soft-delete` and `--force` flags. components.md (lines 102-117) specifies `cmd_delete_item` function signature. interface.md scope section (line 26) lists "delete-item" as one of the commands but no corresponding specification section exists in the commands section of interface.md.
**Suggested Fix:** Add a complete `delete-item` command specification section to interface.md including syntax, options (--sku, --force, --soft-delete), confirmation behavior, output messages, failure modes, and exit codes consistent with the use case and components documentation.

#### Finding 3: Update-Item Command Missing from CLI Interface Documentation
**Severity:** HIGH
**Blocking:** BLOCKING
**Confidence:** HIGH
**Description:** The components.md file documents a `cmd_update_item` function that updates non-quantity fields (name, description, location, min_stock_level) of an existing item. The INDEX.md component mapping also references this. The interface.md scope section (line 26) lists "update-item" as one of the commands. However, interface.md does not contain an `update-item` command specification section. This command is necessary for users to modify item metadata without affecting stock quantities (separate from update-stock which only handles quantity changes).
**Affected Files:** ["falcon_test/apps/app1/docs/design/components.md", "falcon_test/apps/app1/docs/systems/cli/interface.md"]
**Evidence:** components.md (lines 119-138) fully specifies: `cmd_update_item(db_path: str, sku: str, name: str | None, description: str | None, location: str | None, min_stock_level: int | None) -> Product` with detailed behavior. interface.md line 26 mentions "update-item" in the command list but the Commands section only has: init, add-item, update-stock, search, low-stock-report, export-csv.
**Suggested Fix:** Add a complete `update-item` command specification section to interface.md including syntax, required options (--sku), optional options (--name, --description, --location, --min-stock), validation rules (at least one field to update required), behavior, output format, and exit codes.

#### Finding 4: Appendix A Secure Batch Import Script Referenced But Not Provided
**Severity:** MEDIUM
**Blocking:** NON_BLOCKING
**Confidence:** HIGH
**Description:** UC1 (Initial Setup) in use-cases.md references "Appendix A: Complete Secure Batch Import Script" for a production-ready implementation with comprehensive error logging, rollback support, and audit trail. A basic inline secure batch import script is provided, but it explicitly states users should see Appendix A for the complete version. No such appendix exists in the document.
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md"]
**Evidence:** use-cases.md line 25 states: "See also: [Appendix A: Complete Secure Batch Import Script](#appendix-a-secure-batch-import) for the full production-ready implementation with comprehensive error logging, rollback support, and audit trail." The document ends at UC9 with no appendices section.
**Suggested Fix:** Either add Appendix A at the end of use-cases.md with a complete secure batch import script including error logging to file, rollback support (tracking successful inserts for potential cleanup), and audit trail (logging timestamps and outcomes), OR remove the reference to the non-existent appendix and expand the inline script to include the mentioned features.

#### Finding 5: Disaster Recovery Section Referenced But Not Found
**Severity:** MEDIUM
**Blocking:** NON_BLOCKING
**Confidence:** HIGH
**Description:** UC9 (Database Backup and Restore) references a "Disaster Recovery" section in ARCHITECTURE-simple.md that should contain: automated backup cron schedules, backup retention policies, point-in-time recovery procedures, and off-site backup recommendations. The architecture document covers security rules S1-S3, layer rules, and data flow, but the referenced Disaster Recovery section was not found in the reviewed portion of the document (lines 1-700).
**Affected Files:** ["falcon_test/apps/app1/docs/design/use-cases.md", "falcon_test/apps/app1/docs/systems/architecture/ARCHITECTURE-simple.md"]
**Evidence:** use-cases.md lines 434 and 451-456 state: "For comprehensive backup and restore procedures... see the Disaster Recovery section in ARCHITECTURE-simple.md" and lists expected content including "Automated backup cron schedules, Backup retention policies, Point-in-time recovery procedures, Off-site backup recommendations". The ARCHITECTURE-simple.md Table of Contents and reviewed sections do not include a Disaster Recovery heading.
**Suggested Fix:** Either add a Disaster Recovery section to ARCHITECTURE-simple.md with the referenced content (backup schedules, retention policies, recovery procedures, off-site recommendations), OR update UC9 references to indicate this content is planned for a future version, OR move the disaster recovery content to a separate operations guide and update the cross-references.

#### Finding 6: Config Show Command Not Fully Specified
**Severity:** LOW
**Blocking:** NON_BLOCKING
**Confidence:** MEDIUM
**Description:** The interface.md describes a `config show` command (lines 437-445) that displays current configuration including database path, WAREHOUSE_DB environment variable status, and verbose mode status. The command's purpose and basic behavior are described, but unlike other commands (init, add-item, etc.), there is no formal command specification section with syntax, options table, output format examples, and complete exit code documentation.
**Affected Files:** ["falcon_test/apps/app1/docs/systems/cli/interface.md"]
**Evidence:** interface.md states: "`config show` Command (REQUIRED): warehouse-cli config show. Displays current configuration... This command does NOT require database access and always exits with code 0." However, there is no formal section header like other commands, no syntax box, no options table, and no output format example showing what the actual output looks like.
**Suggested Fix:** Add a formal command specification section for `config show` following the same format as other commands: syntax box, options table (even if none), behavior steps, output format example, and exit codes table.

## Coverage Summary
- Features defined: 8/10 (delete-item and update-item commands not specified in CLI interface)
- User flows complete: 7/9 (UC8 soft delete depends on missing schema fields; UC8/UC9 reference missing content)
- Use cases addressed: 7/9 (UC8 incomplete due to schema mismatch; UC9 references missing section)

## Notes

The documentation is comprehensive and well-structured for most features. The design provides detailed specifications with excellent coverage of security considerations, error handling, edge cases, and testable acceptance criteria. The main gaps identified are:

1. **Schema-Design Mismatch:** The soft delete feature in UC8 references database columns (`status`, `discontinued_at`) that do not exist in the schema definition
2. **Missing CLI Command Specifications:** Two commands mentioned in scope and components (delete-item, update-item) lack formal CLI interface specifications
3. **Missing Cross-Referenced Content:** Two internal document references point to sections that do not exist (Appendix A, Disaster Recovery)

These gaps would cause implementation ambiguity and potential inconsistencies. The delete-item and update-item gaps are blocking because implementers would need to guess at command syntax, validation rules, and output formats. The soft delete gap is blocking because the feature cannot be implemented without schema changes.
