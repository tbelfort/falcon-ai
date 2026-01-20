/**
 * Noncompliance Checker
 *
 * Before creating a Pattern with failureMode='incomplete' or 'missing_reference',
 * search the full Context Pack and Spec for the allegedly missing guidance.
 *
 * If found: This is ExecutionNoncompliance (agent ignored correct guidance)
 * If not found: Proceed with Pattern creation
 *
 * NOTE (v1.0): 'ambiguity' was removed from NoncomplianceCause.
 * If guidance was ignored because it was ambiguous, this is a guidance problem,
 * not an execution problem. Route to:
 * - DocUpdateRequest(updateType='clarify_guidance') AND
 * - PatternDefinition(failureMode='ambiguous')
 * Do NOT create ExecutionNoncompliance for ambiguity cases.
 */

import type {
  EvidenceBundle,
  ExecutionNoncompliance,
  NoncomplianceCause,
  FailureMode,
} from '../schemas/index.js';

/**
 * Result of the noncompliance check.
 */
export interface NoncomplianceCheckResult {
  /** True if this is an execution noncompliance (guidance exists but was ignored) */
  isNoncompliance: boolean;
  /** The noncompliance record to create (if isNoncompliance is true) */
  noncompliance?: Omit<ExecutionNoncompliance, 'id' | 'createdAt'>;
  /** Match details for debugging */
  match?: DocumentMatch;
}

/**
 * Match found in a document.
 */
export interface DocumentMatch {
  /** Location in the document (e.g., "Lines 45-50") */
  location: string;
  /** Excerpt from the matched section */
  excerpt: string;
  /** Relevance score (0-1) based on keyword matches */
  relevanceScore: number;
}

/**
 * Input for checking noncompliance.
 */
export interface NoncomplianceCheckInput {
  /** Workspace ID for scoping */
  workspaceId: string;
  /** Project ID for scoping */
  projectId: string;
  /** Evidence extracted by Attribution Agent */
  evidence: EvidenceBundle;
  /** Resolved failure mode from decision tree */
  resolvedFailureMode: FailureMode;
  /** Full Context Pack content */
  contextPack: string;
  /** Full Spec content */
  spec: string;
  /** Finding details */
  finding: {
    id: string;
    issueId: string;
    prNumber: number;
    title: string;
    description: string;
  };
}

/**
 * Check if a finding represents execution noncompliance.
 *
 * Only triggered for `incomplete` or `missing_reference` failureModes.
 * Searches Context Pack + Spec for guidance that matches finding keywords.
 *
 * @param params - The check parameters
 * @returns Result indicating if this is noncompliance
 */
export function checkForNoncompliance(
  params: NoncomplianceCheckInput
): NoncomplianceCheckResult {
  // Only check for incomplete/missing_reference failure modes
  if (
    params.resolvedFailureMode !== 'incomplete' &&
    params.resolvedFailureMode !== 'missing_reference'
  ) {
    return { isNoncompliance: false };
  }

  // Extract keywords from the finding
  const keywords = extractKeywords(
    params.finding.title,
    params.finding.description
  );

  if (keywords.length === 0) {
    return { isNoncompliance: false };
  }

  // Search both documents
  const contextPackMatch = searchDocument(params.contextPack, keywords);
  const specMatch = searchDocument(params.spec, keywords);

  const match = contextPackMatch || specMatch;

  // Threshold: relevanceScore >= 0.3 indicates guidance exists
  if (match && match.relevanceScore >= 0.3) {
    // Guidance exists! This is execution noncompliance.
    const causes = analyzePossibleCauses(match, params.evidence);

    return {
      isNoncompliance: true,
      match,
      noncompliance: {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        findingId: params.finding.id,
        issueId: params.finding.issueId,
        prNumber: params.finding.prNumber,
        violatedGuidanceStage: contextPackMatch ? 'context-pack' : 'spec',
        violatedGuidanceLocation: match.location,
        violatedGuidanceExcerpt: match.excerpt,
        possibleCauses: causes,
      },
    };
  }

  return { isNoncompliance: false };
}

/**
 * Extract meaningful keywords from finding text.
 *
 * Filters out common stop words to get domain-relevant terms.
 */
export function extractKeywords(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();

  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
    'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'can', 'and', 'but', 'or', 'if', 'this', 'that', 'these',
    'those', 'it', 'its', 'found', 'issue', 'error', 'bug', 'problem',
  ]);

  const words = text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Return unique keywords
  return [...new Set(words)];
}

/**
 * Search document for keyword matches using sliding window.
 *
 * Uses a 5-line sliding window to find sections with multiple keyword matches.
 */
export function searchDocument(
  doc: string,
  keywords: string[]
): DocumentMatch | null {
  if (keywords.length === 0) return null;

  const lines = doc.split('\n');
  let bestMatch: DocumentMatch | null = null;
  let bestScore = 0;

  // Sliding window of 5 lines
  const windowSize = 5;
  for (let i = 0; i <= lines.length - windowSize; i++) {
    const window = lines.slice(i, i + windowSize).join('\n').toLowerCase();
    const matchedKeywords = keywords.filter((kw) => window.includes(kw));
    const score = matchedKeywords.length;

    // Require at least 2 keyword matches
    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestMatch = {
        location: `Lines ${i + 1}-${i + windowSize}`,
        excerpt: lines.slice(i, i + windowSize).join('\n').slice(0, 500),
        relevanceScore: score / keywords.length,
      };
    }
  }

  return bestMatch;
}

/**
 * Analyze why guidance was ignored.
 *
 * NOTE (v1.0): 'ambiguity' was removed from NoncomplianceCause.
 * If guidance was ignored because it was ambiguous, this is a guidance problem,
 * not an execution problem.
 */
function analyzePossibleCauses(
  match: DocumentMatch,
  evidence: EvidenceBundle
): NoncomplianceCause[] {
  const causes: NoncomplianceCause[] = [];

  // If guidance was in a different section than expected
  if (!evidence.carrierLocation.includes(match.location)) {
    causes.push('salience');
  }

  // NOTE: vaguenessSignals indicate ambiguity, which is a GUIDANCE problem.
  // Don't add 'ambiguity' as a noncompliance cause - route to PatternDefinition instead.

  // Default to formatting if no other cause
  if (causes.length === 0) {
    causes.push('formatting');
  }

  return causes;
}

/**
 * Get suggested fix for a salience issue.
 */
export function suggestSalienceFix(
  noncompliance: Omit<ExecutionNoncompliance, 'id' | 'createdAt'>
): string {
  const causes = noncompliance.possibleCauses;

  if (causes.includes('salience')) {
    return `Move guidance to a more prominent location or add explicit section header. Current location: ${noncompliance.violatedGuidanceLocation}`;
  }

  if (causes.includes('formatting')) {
    return `Improve formatting with bullet points, code blocks, or callouts to increase visibility. Consider using MUST/SHOULD keywords.`;
  }

  return 'Review guidance placement and formatting for improved discoverability.';
}
