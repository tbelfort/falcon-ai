/**
 * Tests for validation helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  severityRank,
  compareSeverity,
  isHigherOrEqualSeverity,
  maxSeverity,
  isGlobalScope,
  isWorkspaceScope,
  isProjectScope,
  normalizeContent,
  computeContentHash,
  computePatternKey,
  computeLocationHash,
} from '../../../src/guardrail/schemas/validators.js';

describe('Severity Helpers', () => {
  it('severityRank returns correct ranks', () => {
    expect(severityRank('LOW')).toBe(1);
    expect(severityRank('MEDIUM')).toBe(2);
    expect(severityRank('HIGH')).toBe(3);
    expect(severityRank('CRITICAL')).toBe(4);
  });

  it('compareSeverity returns correct comparison', () => {
    expect(compareSeverity('LOW', 'HIGH')).toBeLessThan(0);
    expect(compareSeverity('HIGH', 'LOW')).toBeGreaterThan(0);
    expect(compareSeverity('MEDIUM', 'MEDIUM')).toBe(0);
  });

  it('isHigherOrEqualSeverity works correctly', () => {
    expect(isHigherOrEqualSeverity('CRITICAL', 'HIGH')).toBe(true);
    expect(isHigherOrEqualSeverity('HIGH', 'HIGH')).toBe(true);
    expect(isHigherOrEqualSeverity('LOW', 'MEDIUM')).toBe(false);
  });

  it('maxSeverity returns the higher severity', () => {
    expect(maxSeverity('LOW', 'HIGH')).toBe('HIGH');
    expect(maxSeverity('CRITICAL', 'MEDIUM')).toBe('CRITICAL');
    expect(maxSeverity('HIGH', 'HIGH')).toBe('HIGH');
  });
});

describe('Scope Type Guards', () => {
  it('isGlobalScope identifies global scope', () => {
    expect(isGlobalScope({ level: 'global' })).toBe(true);
    expect(isGlobalScope({ level: 'workspace', workspaceId: 'ws-1' })).toBe(false);
    expect(isGlobalScope({ level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' })).toBe(false);
  });

  it('isWorkspaceScope identifies workspace scope', () => {
    expect(isWorkspaceScope({ level: 'global' })).toBe(false);
    expect(isWorkspaceScope({ level: 'workspace', workspaceId: 'ws-1' })).toBe(true);
    expect(isWorkspaceScope({ level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' })).toBe(false);
  });

  it('isProjectScope identifies project scope', () => {
    expect(isProjectScope({ level: 'global' })).toBe(false);
    expect(isProjectScope({ level: 'workspace', workspaceId: 'ws-1' })).toBe(false);
    expect(isProjectScope({ level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' })).toBe(true);
  });
});

describe('Content Hashing', () => {
  it('normalizeContent trims and lowercases', () => {
    expect(normalizeContent('  Hello World  ')).toBe('hello world');
  });

  it('normalizeContent collapses whitespace', () => {
    expect(normalizeContent('hello   world\n\tfoo')).toBe('hello world foo');
  });

  it('computeContentHash is deterministic', () => {
    const hash1 = computeContentHash('hello world');
    const hash2 = computeContentHash('  HELLO   WORLD  ');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex length
  });

  it('computePatternKey is deterministic', () => {
    const key1 = computePatternKey('context-pack', 'Use SQL injection', 'security');
    const key2 = computePatternKey('context-pack', '  use SQL injection  ', 'security');
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64);
  });

  it('computePatternKey differs by stage', () => {
    const key1 = computePatternKey('context-pack', 'content', 'security');
    const key2 = computePatternKey('spec', 'content', 'security');
    expect(key1).not.toBe(key2);
  });

  it('computePatternKey differs by category', () => {
    const key1 = computePatternKey('context-pack', 'content', 'security');
    const key2 = computePatternKey('context-pack', 'content', 'correctness');
    expect(key1).not.toBe(key2);
  });

  it('computeLocationHash is deterministic', () => {
    const hash1 = computeLocationHash('context-pack', 'section-1', 'excerpt');
    const hash2 = computeLocationHash('context-pack', 'section-1', 'excerpt');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('computeLocationHash differs by input', () => {
    const hash1 = computeLocationHash('context-pack', 'section-1', 'excerpt');
    const hash2 = computeLocationHash('spec', 'section-1', 'excerpt');
    expect(hash1).not.toBe(hash2);
  });
});
