/**
 * Custom validation helpers for the Pattern Attribution System.
 *
 * Provides reusable utilities for:
 * - Severity comparison
 * - Scope type guards
 * - Content hashing
 */

import { createHash } from 'crypto';
import type { Scope, Severity } from './index.js';

/**
 * Severity rank mapping for comparison.
 * Higher rank = more severe.
 */
const SEVERITY_RANKS: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/**
 * Get numeric rank for a severity level.
 * Useful for comparison and filtering operations.
 */
export function severityRank(severity: Severity): number {
  return SEVERITY_RANKS[severity];
}

/**
 * Compare two severities.
 * Returns negative if a < b, zero if equal, positive if a > b.
 */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_RANKS[a] - SEVERITY_RANKS[b];
}

/**
 * Check if severity a is higher than or equal to severity b.
 */
export function isHigherOrEqualSeverity(a: Severity, b: Severity): boolean {
  return SEVERITY_RANKS[a] >= SEVERITY_RANKS[b];
}

/**
 * Get the higher of two severities.
 */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANKS[a] >= SEVERITY_RANKS[b] ? a : b;
}

// Scope type guards

/**
 * Check if scope is global level.
 */
export function isGlobalScope(scope: Scope): scope is { level: 'global' } {
  return scope.level === 'global';
}

/**
 * Check if scope is workspace level.
 */
export function isWorkspaceScope(
  scope: Scope
): scope is { level: 'workspace'; workspaceId: string } {
  return scope.level === 'workspace';
}

/**
 * Check if scope is project level.
 */
export function isProjectScope(
  scope: Scope
): scope is { level: 'project'; workspaceId: string; projectId: string } {
  return scope.level === 'project';
}

// Content hashing utilities

/**
 * Normalize content for hashing (trim, lowercase, collapse whitespace).
 */
export function normalizeContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Compute SHA-256 hash of normalized content.
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(normalizeContent(content)).digest('hex');
}

/**
 * Compute deterministic pattern key from carrier stage, content, and category.
 * This is the canonical method for pattern deduplication.
 */
export function computePatternKey(
  carrierStage: string,
  patternContent: string,
  findingCategory: string
): string {
  const normalized = normalizeContent(patternContent);
  return createHash('sha256')
    .update(`${carrierStage}|${normalized}|${findingCategory}`)
    .digest('hex');
}

/**
 * Compute location hash for salience issue deduplication.
 */
export function computeLocationHash(
  stage: string,
  location: string,
  excerpt: string
): string {
  return createHash('sha256')
    .update(`${stage}|${location}|${excerpt}`)
    .digest('hex');
}
