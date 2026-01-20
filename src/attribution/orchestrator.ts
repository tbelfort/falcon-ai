/**
 * Attribution Orchestrator
 *
 * Full orchestration of the attribution flow:
 * 1. Check kill switch state FIRST
 * 2. Run Attribution Agent → EvidenceBundle
 * 3. Resolve failureMode via decision tree
 * 4. Check for ExecutionNoncompliance
 * 5. Handle decisions findings (DocUpdateRequest)
 * 6. Check for ProvisionalAlert (HIGH/CRITICAL + inferred)
 * 7. Create/update Pattern and Occurrence
 * 8. Record attribution outcome for health metrics
 */

import { createHash } from 'crypto';
import type { Database } from 'better-sqlite3';
import type {
  PatternDefinition,
  PatternOccurrence,
  ExecutionNoncompliance,
  DocUpdateRequest,
  EvidenceBundle,
  DocFingerprint,
  FindingCategory,
  DecisionClass,
  ProvisionalAlert,
  Touch,
  Severity,
} from '../schemas/index.js';
import { resolveFailureMode, type ResolverResult } from './failure-mode-resolver.js';
import { checkForNoncompliance } from './noncompliance-checker.js';
import {
  runAttributionAgent,
  type RunAttributionAgentInput,
} from './agent.js';
import { PatternDefinitionRepository } from '../storage/repositories/pattern-definition.repo.js';
import { PatternOccurrenceRepository } from '../storage/repositories/pattern-occurrence.repo.js';
import { ExecutionNoncomplianceRepository } from '../storage/repositories/execution-noncompliance.repo.js';
import { DocUpdateRequestRepository } from '../storage/repositories/doc-update-request.repo.js';
import { DerivedPrincipleRepository } from '../storage/repositories/derived-principle.repo.js';
import { SalienceIssueRepository } from '../storage/repositories/salience-issue.repo.js';
import { ProvisionalAlertRepository } from '../storage/repositories/provisional-alert.repo.js';
import { KillSwitchService, type PatternCreationState } from '../services/kill-switch.service.js';

/**
 * Input for attributing a finding.
 */
export interface AttributionInput {
  /** Workspace ID for scoping */
  workspaceId: string;
  /** Project ID for scoping */
  projectId: string;
  /** The finding to attribute */
  finding: {
    id: string;
    issueId: string;
    prNumber: number;
    title: string;
    description: string;
    scoutType: string;
    severity: Severity;
    evidence: string;
    location: { file: string; line?: number };
  };
  /** Context Pack document */
  contextPack: {
    content: string;
    fingerprint: DocFingerprint;
  };
  /** Spec document */
  spec: {
    content: string;
    fingerprint: DocFingerprint;
  };
}

/**
 * Result of attribution.
 */
export interface AttributionResult {
  /** Type of result */
  type: 'pattern' | 'noncompliance' | 'doc_update_only' | 'provisional_alert' | 'skipped';
  /** Created/updated pattern (if type is 'pattern') */
  pattern?: PatternDefinition;
  /** Created occurrence (if type is 'pattern') */
  occurrence?: PatternOccurrence;
  /** Created noncompliance record (if type is 'noncompliance') */
  noncompliance?: ExecutionNoncompliance;
  /** Created doc update request (if decisions finding) */
  docUpdateRequest?: DocUpdateRequest;
  /** Created provisional alert (if type is 'provisional_alert') */
  provisionalAlert?: ProvisionalAlert;
  /** Resolver result for debugging */
  resolverResult?: {
    failureMode: string;
    reasoning: string;
  };
  /** Kill switch state that led to skip (if type is 'skipped') */
  killSwitchState?: PatternCreationState;
}

/**
 * Options for the orchestrator.
 */
export interface OrchestratorOptions {
  /** Custom agent function (for testing) */
  agentFn?: (input: RunAttributionAgentInput) => Promise<EvidenceBundle>;
}

/**
 * Attribution Orchestrator
 *
 * Coordinates the full attribution flow from finding to pattern/noncompliance.
 */
export class AttributionOrchestrator {
  private patternRepo: PatternDefinitionRepository;
  private occurrenceRepo: PatternOccurrenceRepository;
  private noncomplianceRepo: ExecutionNoncomplianceRepository;
  private docUpdateRepo: DocUpdateRequestRepository;
  private principleRepo: DerivedPrincipleRepository;
  private salienceIssueRepo: SalienceIssueRepository;
  private provisionalAlertRepo: ProvisionalAlertRepository;
  private killSwitchService: KillSwitchService;
  private agentFn: (input: RunAttributionAgentInput) => Promise<EvidenceBundle>;

  constructor(db: Database, options: OrchestratorOptions = {}) {
    this.patternRepo = new PatternDefinitionRepository(db);
    this.occurrenceRepo = new PatternOccurrenceRepository(db);
    this.noncomplianceRepo = new ExecutionNoncomplianceRepository(db);
    this.docUpdateRepo = new DocUpdateRequestRepository(db);
    this.principleRepo = new DerivedPrincipleRepository(db);
    this.salienceIssueRepo = new SalienceIssueRepository(db);
    this.provisionalAlertRepo = new ProvisionalAlertRepository(db);
    this.killSwitchService = new KillSwitchService(db);
    this.agentFn = options.agentFn ?? runAttributionAgent;
  }

  /**
   * Attribute a finding to guidance.
   *
   * @param input - The finding and documents to analyze
   * @returns The attribution result
   */
  async attributeFinding(input: AttributionInput): Promise<AttributionResult> {
    // Step 0: Check kill switch state FIRST
    const killSwitchStatus = this.killSwitchService.getStatus({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    });

    // Step 1: Run Attribution Agent to extract evidence
    const evidence = await this.agentFn({
      finding: input.finding,
      contextPack: input.contextPack.content,
      spec: input.spec.content,
    });

    // Step 2: Resolve failureMode deterministically
    const resolverResult = resolveFailureMode(evidence);

    // Step 3: Check for ExecutionNoncompliance (always runs regardless of kill switch)
    const noncomplianceCheck = checkForNoncompliance({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      evidence,
      resolvedFailureMode: resolverResult.failureMode,
      contextPack: input.contextPack.content,
      spec: input.spec.content,
      finding: input.finding,
    });

    if (noncomplianceCheck.isNoncompliance && noncomplianceCheck.noncompliance) {
      const noncompliance = this.noncomplianceRepo.create(
        noncomplianceCheck.noncompliance
      );

      // Track salience issues
      this.trackSalienceIssue(input, noncompliance);

      // Record outcome
      this.recordAndEvaluate(input, evidence, false);

      return {
        type: 'noncompliance',
        noncompliance,
        resolverResult: {
          failureMode: resolverResult.failureMode,
          reasoning: resolverResult.reasoning,
        },
      };
    }

    // Step 4: Kill switch state handling for pattern creation
    const patternCreationResult = await this.handlePatternCreationWithKillSwitch(
      input,
      evidence,
      resolverResult,
      killSwitchStatus.state
    );

    // Step 5: Record attribution outcome and evaluate health
    this.recordAndEvaluate(input, evidence, patternCreationResult.patternCreated);

    return patternCreationResult.result;
  }

  /**
   * Handle pattern creation based on kill switch state.
   */
  private async handlePatternCreationWithKillSwitch(
    input: AttributionInput,
    evidence: EvidenceBundle,
    resolverResult: ResolverResult,
    killSwitchState: PatternCreationState
  ): Promise<{ patternCreated: boolean; result: AttributionResult }> {
    // FULLY_PAUSED: Log-only mode, no pattern creation
    if (killSwitchState === 'fully_paused') {
      console.log('[AttributionOrchestrator] Kill switch FULLY_PAUSED - logging only', {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        findingId: input.finding.id,
        carrierQuoteType: evidence.carrierQuoteType,
        failureMode: resolverResult.failureMode,
      });

      return {
        patternCreated: false,
        result: {
          type: 'skipped',
          killSwitchState: 'fully_paused',
          resolverResult: {
            failureMode: resolverResult.failureMode,
            reasoning: `[KILL_SWITCH:FULLY_PAUSED] ${resolverResult.reasoning}`,
          },
        },
      };
    }

    // INFERRED_PAUSED: Skip inferred patterns, only create verbatim/paraphrase
    if (killSwitchState === 'inferred_paused') {
      if (evidence.carrierQuoteType === 'inferred') {
        console.log(
          '[AttributionOrchestrator] Kill switch INFERRED_PAUSED - skipping inferred pattern',
          {
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            findingId: input.finding.id,
          }
        );

        return {
          patternCreated: false,
          result: {
            type: 'skipped',
            killSwitchState: 'inferred_paused',
            resolverResult: {
              failureMode: resolverResult.failureMode,
              reasoning: `[KILL_SWITCH:INFERRED_PAUSED] ${resolverResult.reasoning}`,
            },
          },
        };
      }
      // Fall through to normal pattern creation for verbatim/paraphrase
    }

    // ACTIVE (or INFERRED_PAUSED with verbatim/paraphrase): Normal pattern creation

    // Handle Decisions findings specially
    if (input.finding.scoutType === 'decisions') {
      const result = await this.handleDecisionsFinding(input, evidence, resolverResult);
      return { patternCreated: result.type === 'pattern', result };
    }

    // Check for ProvisionalAlert
    const provisionalAlert = this.checkAndCreateProvisionalAlert(
      input,
      evidence,
      resolverResult
    );

    if (provisionalAlert) {
      return {
        patternCreated: false,
        result: {
          type: 'provisional_alert',
          provisionalAlert,
          resolverResult: {
            failureMode: resolverResult.failureMode,
            reasoning: resolverResult.reasoning,
          },
        },
      };
    }

    // Create pattern and occurrence
    const { pattern, occurrence } = this.createPatternAndOccurrence(
      input,
      evidence,
      resolverResult
    );

    return {
      patternCreated: true,
      result: {
        type: 'pattern',
        pattern,
        occurrence,
        resolverResult: {
          failureMode: resolverResult.failureMode,
          reasoning: resolverResult.reasoning,
        },
      },
    };
  }

  /**
   * Handle decisions findings specially - always create DocUpdateRequest.
   */
  private async handleDecisionsFinding(
    input: AttributionInput,
    evidence: EvidenceBundle,
    resolverResult: ResolverResult
  ): Promise<AttributionResult> {
    // Decisions findings ALWAYS create DocUpdateRequest
    const decisionClass = this.inferDecisionClass(input, evidence);

    const docUpdateRequest = this.docUpdateRepo.create({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      findingId: input.finding.id,
      issueId: input.finding.issueId,
      findingCategory: 'decisions',
      scoutType: 'decisions',
      decisionClass,
      targetDoc: this.inferTargetDoc(evidence),
      updateType: 'add_decision',
      description: input.finding.description,
      status: 'pending',
    });

    // Only create pattern if recurring (3+) or high-risk
    const shouldCreatePattern = await this.shouldCreatePatternForDecision(
      evidence,
      input.finding.severity
    );

    if (!shouldCreatePattern) {
      return {
        type: 'doc_update_only',
        docUpdateRequest,
        resolverResult: {
          failureMode: resolverResult.failureMode,
          reasoning: resolverResult.reasoning,
        },
      };
    }

    const { pattern, occurrence } = this.createPatternAndOccurrence(
      input,
      evidence,
      resolverResult
    );

    return {
      type: 'pattern',
      pattern,
      occurrence,
      docUpdateRequest,
      resolverResult: {
        failureMode: resolverResult.failureMode,
        reasoning: resolverResult.reasoning,
      },
    };
  }

  /**
   * Create pattern and occurrence records.
   */
  private createPatternAndOccurrence(
    input: AttributionInput,
    evidence: EvidenceBundle,
    resolverResult: ResolverResult
  ): { pattern: PatternDefinition; occurrence: PatternOccurrence } {
    const patternContent = evidence.carrierQuote;
    const normalizedContent = patternContent.replace(/\s+/g, ' ').trim();
    const findingCategory = this.mapScoutToCategory(input.finding.scoutType);

    // patternKey = SHA-256(carrierStage|patternContent|findingCategory)
    const patternKey = createHash('sha256')
      .update(`${evidence.carrierStage}|${normalizedContent}|${findingCategory}`)
      .digest('hex');

    // Check for existing pattern within same scope
    let pattern = this.patternRepo.findByPatternKey({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      patternKey,
    });

    if (pattern) {
      // Update severityMax if this occurrence has higher severity
      const severityOrder: Record<Severity, number> = {
        LOW: 0,
        MEDIUM: 1,
        HIGH: 2,
        CRITICAL: 3,
      };
      if (severityOrder[input.finding.severity] > severityOrder[pattern.severityMax]) {
        pattern = this.patternRepo.update(pattern.id, {
          severityMax: input.finding.severity,
        })!;
      }

      // Update if this evidence is better
      if (this.isBetterEvidence(evidence.carrierQuoteType, pattern.primaryCarrierQuoteType)) {
        pattern = this.patternRepo.update(pattern.id, {
          primaryCarrierQuoteType: evidence.carrierQuoteType,
        })!;
      }
    } else {
      // Create new pattern
      const touches = this.extractTouches(input, evidence);
      const alignedBaseline = this.findAlignedBaseline(
        input.workspaceId,
        touches,
        findingCategory
      );

      pattern = this.patternRepo.create({
        scope: {
          level: 'project',
          workspaceId: input.workspaceId,
          projectId: input.projectId,
        },
        patternContent,
        failureMode: resolverResult.failureMode,
        findingCategory,
        severity: input.finding.severity,
        alternative: this.generateAlternative(evidence, resolverResult.failureMode),
        carrierStage: evidence.carrierStage,
        primaryCarrierQuoteType: evidence.carrierQuoteType,
        technologies: this.extractTechnologies(input),
        taskTypes: this.extractTaskTypes(input),
        touches,
        alignedBaselineId: alignedBaseline?.id,
        status: 'active',
        permanent: false,
      });
    }

    // Create occurrence (always append)
    const carrierExcerptHash = createHash('sha256')
      .update(evidence.carrierQuote)
      .digest('hex');

    const originFingerprint = this.resolveOriginFingerprint(evidence);
    const originExcerptHash =
      evidence.citedSources.length > 0
        ? createHash('sha256').update(evidence.citedSources[0]).digest('hex')
        : undefined;

    const occurrence = this.occurrenceRepo.create({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      patternId: pattern.id,
      findingId: input.finding.id,
      issueId: input.finding.issueId,
      prNumber: input.finding.prNumber,
      severity: input.finding.severity,
      evidence,
      carrierFingerprint:
        evidence.carrierStage === 'context-pack'
          ? input.contextPack.fingerprint
          : input.spec.fingerprint,
      originFingerprint,
      provenanceChain: this.buildProvenanceChain(evidence, input),
      carrierExcerptHash,
      originExcerptHash,
      wasInjected: false,
      wasAdheredTo: null,
      status: 'active',
    });

    return { pattern, occurrence };
  }

  /**
   * Track salience issues when guidance is ignored.
   */
  private trackSalienceIssue(
    input: AttributionInput,
    noncompliance: ExecutionNoncompliance
  ): void {
    if (
      noncompliance.possibleCauses.includes('salience') ||
      noncompliance.possibleCauses.includes('formatting')
    ) {
      this.salienceIssueRepo.upsert(
        {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          guidanceStage: noncompliance.violatedGuidanceStage,
          guidanceLocation: noncompliance.violatedGuidanceLocation,
          guidanceExcerpt: noncompliance.violatedGuidanceExcerpt,
          occurrenceCount: 1,
          windowDays: 30,
          noncomplianceIds: [], // Will be populated by upsert
          status: 'pending',
        },
        noncompliance.id
      );
    }
  }

  /**
   * Check if new evidence is better than existing.
   */
  private isBetterEvidence(
    newType: EvidenceBundle['carrierQuoteType'],
    existingType: PatternDefinition['primaryCarrierQuoteType']
  ): boolean {
    const rank = { verbatim: 3, paraphrase: 2, inferred: 1 };
    return rank[newType] > rank[existingType];
  }

  /**
   * Map scout type to finding category.
   */
  private mapScoutToCategory(scoutType: string): FindingCategory {
    const mapping: Record<string, FindingCategory> = {
      adversarial: 'security',
      security: 'security',
      bugs: 'correctness',
      tests: 'testing',
      docs: 'compliance',
      spec: 'compliance',
      decisions: 'decisions',
    };
    return mapping[scoutType] || 'correctness';
  }

  /**
   * Extract touches from finding context.
   */
  private extractTouches(
    input: AttributionInput,
    evidence: EvidenceBundle
  ): Touch[] {
    const text =
      `${input.finding.description} ${input.finding.evidence} ${evidence.carrierQuote}`.toLowerCase();
    const touches: Touch[] = [];

    const patterns: [RegExp, Touch][] = [
      [/user.?input|request.?body|query.?param|form|payload/i, 'user_input'],
      [/database|sql|query|postgres|mysql|mongo/i, 'database'],
      [/network|http|api.?call|fetch|external/i, 'network'],
      [/auth|login|token|session|jwt/i, 'auth'],
      [/permission|role|access|authz|rbac/i, 'authz'],
      [/cache|redis|memcache/i, 'caching'],
      [/schema|migration|ddl|alter/i, 'schema'],
      [/log|logging|trace|audit/i, 'logging'],
      [/config|env|setting/i, 'config'],
      [/api|endpoint|route|rest|graphql/i, 'api'],
    ];

    for (const [pattern, touch] of patterns) {
      if (pattern.test(text) && !touches.includes(touch)) {
        touches.push(touch);
      }
    }

    return touches.length > 0 ? touches : ['api'];
  }

  /**
   * Extract technologies from finding context.
   */
  private extractTechnologies(input: AttributionInput): string[] {
    const text = `${input.finding.evidence} ${input.finding.location.file}`.toLowerCase();
    const techs: string[] = [];

    const patterns: [RegExp, string][] = [
      [/sql/i, 'sql'],
      [/postgres/i, 'postgres'],
      [/mysql/i, 'mysql'],
      [/mongo/i, 'mongodb'],
      [/redis/i, 'redis'],
      [/graphql/i, 'graphql'],
      [/rest/i, 'rest'],
    ];

    for (const [pattern, tech] of patterns) {
      if (pattern.test(text) && !techs.includes(tech)) {
        techs.push(tech);
      }
    }

    return techs;
  }

  /**
   * Extract task types from finding context.
   */
  private extractTaskTypes(input: AttributionInput): string[] {
    const text =
      `${input.finding.description} ${input.finding.location.file}`.toLowerCase();
    const types: string[] = [];

    const patterns: [RegExp, string][] = [
      [/api|endpoint/i, 'api'],
      [/database|query/i, 'database'],
      [/migration/i, 'migration'],
      [/auth/i, 'auth'],
    ];

    for (const [pattern, type] of patterns) {
      if (pattern.test(text) && !types.includes(type)) {
        types.push(type);
      }
    }

    return types;
  }

  /**
   * Find aligned baseline for pattern.
   */
  private findAlignedBaseline(
    workspaceId: string,
    touches: Touch[],
    _category: FindingCategory
  ) {
    const baselines = this.principleRepo.findActive({
      workspaceId,
      origin: 'baseline',
    });

    for (const baseline of baselines) {
      const touchOverlap = baseline.touches.some((t) =>
        touches.includes(t as Touch)
      );
      if (touchOverlap) {
        return baseline;
      }
    }

    return null;
  }

  /**
   * Generate alternative guidance text.
   */
  private generateAlternative(
    evidence: EvidenceBundle,
    failureMode: string
  ): string {
    switch (failureMode) {
      case 'incorrect':
        return `Do NOT follow: "${evidence.carrierQuote.slice(0, 100)}..." Follow security best practices instead.`;
      case 'incomplete':
        return 'Ensure all edge cases and security considerations are explicitly addressed.';
      case 'missing_reference':
        return `Reference ${evidence.missingDocId || 'relevant documentation'} before proceeding.`;
      case 'ambiguous':
        return 'Clarify requirements with specific, testable acceptance criteria.';
      case 'conflict_unresolved':
        return 'Resolve conflicting guidance before implementation.';
      case 'synthesis_drift':
        return 'Verify synthesized guidance accurately reflects source documentation.';
      default:
        return 'Review and improve guidance clarity.';
    }
  }

  /**
   * Infer target doc for update request.
   */
  private inferTargetDoc(evidence: EvidenceBundle): string {
    if (evidence.missingDocId) return evidence.missingDocId;
    if (evidence.carrierStage === 'context-pack') return 'ARCHITECTURE.md';
    return 'DECISIONS.md';
  }

  /**
   * Infer decision class from finding content.
   */
  private inferDecisionClass(
    input: AttributionInput,
    evidence: EvidenceBundle
  ): DecisionClass {
    const text =
      `${input.finding.title} ${input.finding.description} ${evidence.carrierQuote}`.toLowerCase();

    // Weighted patterns: [regex, class, weight]
    const patterns: [RegExp, DecisionClass, number][] = [
      // High-risk classes - prioritized
      [/\b(authz|authorization|permission|role|rbac|acl|access.?control)\b/i, 'authz_model', 10],
      [/\b(schema.?migration|db.?migration|rollback.?plan|migration.?strategy|alter.?table)\b/i, 'migrations', 12],
      [/\b(backcompat|backward.?compat|deprecat|version|breaking.?change)\b/i, 'backcompat', 10],
      [/\b(pii|gdpr|privacy|mask|redact|sensitive.?data|log.?retention)\b/i, 'logging_privacy', 10],
      // Standard classes
      [/\b(cache|caching|ttl|invalidat|stale|expire)\b/i, 'caching', 5],
      [/\b(retry|retries|backoff|exponential|jitter)\b/i, 'retries', 5],
      [/\b(timeout|circuit.?breaker|deadline|cancel)\b/i, 'timeouts', 5],
      [/\b(error.?code|error.?shape|status.?code|error.?response|exception)\b/i, 'error_contract', 3],
    ];

    // Score each class
    const scores: Record<string, number> = {};
    for (const [pattern, decisionClass, weight] of patterns) {
      if (pattern.test(text)) {
        scores[decisionClass] = (scores[decisionClass] || 0) + weight;
      }
    }

    // Find winner with deterministic tie-break (alphabetical)
    const entries = Object.entries(scores);
    if (entries.length === 0) {
      return 'error_contract'; // Default
    }

    entries.sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    return entries[0][0] as DecisionClass;
  }

  /**
   * Determine if a pattern should be created for a decisions finding.
   */
  private async shouldCreatePatternForDecision(
    _evidence: EvidenceBundle,
    severity: Severity
  ): Promise<boolean> {
    // High-risk always creates pattern
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      return true;
    }
    // TODO: Check for recurrence (3+ similar)
    return false;
  }

  /**
   * Resolve origin fingerprint from evidence.
   */
  private resolveOriginFingerprint(evidence: EvidenceBundle): DocFingerprint | undefined {
    if (!evidence.hasCitation || evidence.citedSources.length === 0) {
      return undefined;
    }

    const source = evidence.citedSources[0];
    if (source.endsWith('.md')) {
      return {
        kind: 'git',
        repo: 'current',
        path: source,
        commitSha: '0000000000000000000000000000000000000000', // Placeholder - Phase 4 will resolve
      };
    }

    return undefined;
  }

  /**
   * Build provenance chain from evidence.
   */
  private buildProvenanceChain(
    evidence: EvidenceBundle,
    input: AttributionInput
  ): DocFingerprint[] {
    const chain: DocFingerprint[] = [];

    chain.push(
      evidence.carrierStage === 'context-pack'
        ? input.contextPack.fingerprint
        : input.spec.fingerprint
    );

    for (const source of evidence.citedSources) {
      if (source.endsWith('.md')) {
        chain.push({
          kind: 'git',
          repo: 'current',
          path: source,
          commitSha: '0000000000000000000000000000000000000000',
        });
      }
    }

    return chain;
  }

  /**
   * Check if a ProvisionalAlert should be created.
   */
  private checkAndCreateProvisionalAlert(
    input: AttributionInput,
    evidence: EvidenceBundle,
    resolverResult: ResolverResult
  ): ProvisionalAlert | undefined {
    // Only create for HIGH/CRITICAL security findings with inferred quote
    const isHighSeverity =
      input.finding.severity === 'HIGH' || input.finding.severity === 'CRITICAL';
    const isSecurityRelated =
      input.finding.scoutType === 'security' || input.finding.scoutType === 'adversarial';
    const isInferred = evidence.carrierQuoteType === 'inferred';

    if (!isHighSeverity || !isSecurityRelated || !isInferred) {
      return undefined;
    }

    const touches = this.extractTouches(input, evidence);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

    return this.provisionalAlertRepo.create({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      findingId: input.finding.id,
      issueId: input.finding.issueId,
      message: this.generateAlertMessage(input, evidence, resolverResult),
      touches,
      injectInto: evidence.carrierStage,
      expiresAt: expiresAt.toISOString(),
      status: 'active',
    });
  }

  /**
   * Generate alert message for provisional alert.
   */
  private generateAlertMessage(
    input: AttributionInput,
    evidence: EvidenceBundle,
    resolverResult: ResolverResult
  ): string {
    const mode = resolverResult.failureMode;

    if (mode === 'incomplete') {
      return `[${input.finding.severity}] Missing security constraint: ${input.finding.title.slice(0, 100)}`;
    }
    if (mode === 'missing_reference') {
      return `[${input.finding.severity}] Security doc not referenced: ${evidence.missingDocId || 'unknown'}`;
    }
    return `[${input.finding.severity}] ${input.finding.scoutType} issue: ${input.finding.title.slice(0, 100)}`;
  }

  /**
   * Record attribution outcome and trigger health evaluation.
   */
  private recordAndEvaluate(
    input: AttributionInput,
    evidence: EvidenceBundle,
    patternCreated: boolean
  ): void {
    const scope = {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    };

    // Record outcome for metrics
    this.killSwitchService.recordAttributionOutcome(scope, {
      issueKey: input.finding.issueId,
      carrierQuoteType: evidence.carrierQuoteType,
      patternCreated,
      injectionOccurred: false, // Injection happens in Phase 3
      recurrenceObserved: null, // Will be updated after future PR reviews
    });

    // Evaluate health to check if kill switch state should change
    this.killSwitchService.evaluateHealth(scope);
  }
}
