/**
 * Tests for the Noncompliance Checker.
 *
 * Tests that execution noncompliance is correctly detected when
 * guidance exists but was ignored by the agent.
 */

import { describe, it, expect } from 'vitest';
import {
  checkForNoncompliance,
  extractKeywords,
  searchDocument,
} from '../../src/attribution/noncompliance-checker.js';
import type { EvidenceBundle } from '../../src/schemas/index.js';

/**
 * Base evidence for tests.
 */
const baseEvidence: EvidenceBundle = {
  carrierStage: 'context-pack',
  carrierQuote: 'Use string concatenation for queries',
  carrierQuoteType: 'inferred',
  carrierInstructionKind: 'unknown',
  carrierLocation: 'Section 4.2',
  hasCitation: false,
  citedSources: [],
  sourceRetrievable: false,
  sourceAgreesWithCarrier: null,
  mandatoryDocMissing: false,
  vaguenessSignals: [],
  hasTestableAcceptanceCriteria: false,
  conflictSignals: [],
};

describe('extractKeywords', () => {
  it('extracts meaningful keywords from text', () => {
    const keywords = extractKeywords(
      'SQL Injection Vulnerability',
      'User input was concatenated into SQL query'
    );

    expect(keywords).toContain('sql');
    expect(keywords).toContain('injection');
    expect(keywords).toContain('vulnerability');
    expect(keywords).toContain('user');
    expect(keywords).toContain('input');
    expect(keywords).toContain('concatenated');
    expect(keywords).toContain('query');
  });

  it('filters out stop words', () => {
    const keywords = extractKeywords(
      'The issue is found',
      'There was an error in the code'
    );

    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('is');
    expect(keywords).not.toContain('was');
    expect(keywords).not.toContain('an');
    expect(keywords).not.toContain('in');
  });

  it('filters out short words', () => {
    const keywords = extractKeywords('A bug is in API', 'It is a bad API');

    expect(keywords).not.toContain('a');
    expect(keywords).not.toContain('is');
    expect(keywords).not.toContain('in');
    expect(keywords).not.toContain('it');
  });

  it('returns unique keywords', () => {
    const keywords = extractKeywords('SQL SQL query', 'SQL query SQL');

    const sqlCount = keywords.filter((k) => k === 'sql').length;
    const queryCount = keywords.filter((k) => k === 'query').length;

    expect(sqlCount).toBe(1);
    expect(queryCount).toBe(1);
  });

  it('handles empty input', () => {
    const keywords = extractKeywords('', '');
    expect(keywords).toEqual([]);
  });
});

describe('searchDocument', () => {
  const sampleDoc = `
# Database Guidelines

## Section 1: Connection
Always use connection pooling for database connections.

## Section 2: Queries
Use parameterized queries for all SQL statements.
Never concatenate user input into SQL strings.
This prevents SQL injection attacks.

## Section 3: Transactions
Use transactions for multi-step operations.
`.trim();

  it('finds matching section with multiple keywords', () => {
    const keywords = ['sql', 'parameterized', 'queries'];
    const match = searchDocument(sampleDoc, keywords);

    expect(match).not.toBeNull();
    expect(match!.relevanceScore).toBeGreaterThanOrEqual(0.3);
    expect(match!.excerpt).toContain('parameterized');
  });

  it('returns null when keywords dont match', () => {
    const keywords = ['authentication', 'oauth', 'jwt'];
    const match = searchDocument(sampleDoc, keywords);

    expect(match).toBeNull();
  });

  it('returns null with empty keywords', () => {
    const match = searchDocument(sampleDoc, []);
    expect(match).toBeNull();
  });

  it('calculates relevance score correctly', () => {
    const keywords = ['sql', 'parameterized', 'queries', 'injection'];
    const match = searchDocument(sampleDoc, keywords);

    expect(match).not.toBeNull();
    // All 4 keywords should match in the SQL section
    expect(match!.relevanceScore).toBeGreaterThanOrEqual(0.5);
  });

  it('finds best matching section', () => {
    const keywords = ['transactions', 'operations'];
    const match = searchDocument(sampleDoc, keywords);

    expect(match).not.toBeNull();
    expect(match!.excerpt).toContain('transaction');
  });
});

describe('checkForNoncompliance', () => {
  const contextPackWithGuidance = `
# Context Pack

## Security Guidelines
Always use parameterized queries for SQL.
Never concatenate user input into queries.
This prevents SQL injection vulnerabilities.

## API Guidelines
Use REST conventions for API endpoints.
`;

  const specContent = `
# Spec

## Requirements
Implement user search endpoint.
`;

  it('detects noncompliance when guidance exists in context pack', () => {
    const result = checkForNoncompliance({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      evidence: baseEvidence,
      resolvedFailureMode: 'incomplete',
      contextPack: contextPackWithGuidance,
      spec: specContent,
      finding: {
        id: 'finding-1',
        issueId: 'PROJ-123',
        prNumber: 456,
        title: 'SQL Injection Vulnerability',
        description:
          'User input was concatenated into SQL query without parameterization',
      },
    });

    expect(result.isNoncompliance).toBe(true);
    expect(result.noncompliance).toBeDefined();
    expect(result.noncompliance!.violatedGuidanceStage).toBe('context-pack');
    expect(result.noncompliance!.possibleCauses.length).toBeGreaterThan(0);
  });

  it('returns false when guidance not found', () => {
    const result = checkForNoncompliance({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      evidence: baseEvidence,
      resolvedFailureMode: 'incomplete',
      contextPack: 'Some unrelated content about logging.',
      spec: 'Spec about logging.',
      finding: {
        id: 'finding-1',
        issueId: 'PROJ-123',
        prNumber: 456,
        title: 'SQL Injection Vulnerability',
        description: 'User input was concatenated into SQL query',
      },
    });

    expect(result.isNoncompliance).toBe(false);
    expect(result.noncompliance).toBeUndefined();
  });

  it('only checks for incomplete and missing_reference failure modes', () => {
    const result = checkForNoncompliance({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      evidence: baseEvidence,
      resolvedFailureMode: 'incorrect', // Not incomplete or missing_reference
      contextPack: contextPackWithGuidance,
      spec: specContent,
      finding: {
        id: 'finding-1',
        issueId: 'PROJ-123',
        prNumber: 456,
        title: 'SQL Injection Vulnerability',
        description: 'User input was concatenated into SQL query',
      },
    });

    expect(result.isNoncompliance).toBe(false);
  });

  it('checks missing_reference failure mode', () => {
    const result = checkForNoncompliance({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      evidence: baseEvidence,
      resolvedFailureMode: 'missing_reference',
      contextPack: contextPackWithGuidance,
      spec: specContent,
      finding: {
        id: 'finding-1',
        issueId: 'PROJ-123',
        prNumber: 456,
        title: 'SQL Injection in Query',
        description: 'SQL query lacks parameterization',
      },
    });

    expect(result.isNoncompliance).toBe(true);
  });

  it('includes scope fields in noncompliance record', () => {
    const result = checkForNoncompliance({
      workspaceId: 'workspace-abc',
      projectId: 'project-xyz',
      evidence: baseEvidence,
      resolvedFailureMode: 'incomplete',
      contextPack: contextPackWithGuidance,
      spec: specContent,
      finding: {
        id: 'finding-1',
        issueId: 'PROJ-123',
        prNumber: 456,
        title: 'SQL Injection Vulnerability',
        description: 'SQL query concatenated user input',
      },
    });

    expect(result.isNoncompliance).toBe(true);
    expect(result.noncompliance!.workspaceId).toBe('workspace-abc');
    expect(result.noncompliance!.projectId).toBe('project-xyz');
    expect(result.noncompliance!.findingId).toBe('finding-1');
    expect(result.noncompliance!.issueId).toBe('PROJ-123');
    expect(result.noncompliance!.prNumber).toBe(456);
  });

  it('identifies salience cause when location differs', () => {
    const result = checkForNoncompliance({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      evidence: {
        ...baseEvidence,
        carrierLocation: 'Some Other Section',
      },
      resolvedFailureMode: 'incomplete',
      contextPack: contextPackWithGuidance,
      spec: specContent,
      finding: {
        id: 'finding-1',
        issueId: 'PROJ-123',
        prNumber: 456,
        title: 'SQL Injection',
        description: 'SQL query with user input concatenation',
      },
    });

    expect(result.isNoncompliance).toBe(true);
    expect(result.noncompliance!.possibleCauses).toContain('salience');
  });
});
