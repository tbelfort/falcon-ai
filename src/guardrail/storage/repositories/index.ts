/**
 * Repository exports for the Pattern Attribution System.
 *
 * All repositories follow the repository pattern with:
 * - Scope isolation (workspace/project)
 * - JSON field parsing utilities
 * - Zod schema validation on create/update
 */

// Base repository
export { BaseRepository } from './base.repo.js';

// Core entity repositories
export { WorkspaceRepository } from './workspace.repo.js';
export { ProjectRepository } from './project.repo.js';

// Pattern repositories
export { PatternDefinitionRepository } from './pattern-definition.repo.js';
export { PatternOccurrenceRepository } from './pattern-occurrence.repo.js';

// Principle repository
export { DerivedPrincipleRepository } from './derived-principle.repo.js';

// Noncompliance and doc update repositories
export { ExecutionNoncomplianceRepository } from './execution-noncompliance.repo.js';
export { DocUpdateRequestRepository } from './doc-update-request.repo.js';

// Injection and tagging repositories
export { TaggingMissRepository } from './tagging-miss.repo.js';
export { InjectionLogRepository } from './injection-log.repo.js';

// Alert and salience repositories
export { ProvisionalAlertRepository } from './provisional-alert.repo.js';
export { SalienceIssueRepository } from './salience-issue.repo.js';

// Kill switch repository
export { KillSwitchRepository } from './kill-switch.repo.js';
