/**
 * Attribution Engine exports.
 *
 * Phase 2 of the Pattern Attribution System.
 * Extracts structured evidence, resolves failure modes deterministically,
 * and creates patterns/noncompliance records.
 */

// Agent
export {
  runAttributionAgent,
  createMockAttributionAgent,
  createDynamicMockAgent,
  type RunAttributionAgentInput,
  type AttributionAgentOptions,
} from './agent.js';

// Prompts
export {
  ATTRIBUTION_AGENT_SYSTEM_PROMPT,
  createAttributionUserPrompt,
  type AttributionUserPromptParams,
} from './prompts/attribution-agent.js';

// Failure Mode Resolver
export {
  resolveFailureMode,
  describeFailureMode,
  type ResolverResult,
} from './failure-mode-resolver.js';

// Noncompliance Checker
export {
  checkForNoncompliance,
  extractKeywords,
  searchDocument,
  suggestSalienceFix,
  type NoncomplianceCheckResult,
  type NoncomplianceCheckInput,
  type DocumentMatch,
} from './noncompliance-checker.js';

// Orchestrator
export {
  AttributionOrchestrator,
  type AttributionInput,
  type AttributionResult,
  type OrchestratorOptions,
} from './orchestrator.js';
