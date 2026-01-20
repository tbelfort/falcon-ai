/**
 * Warning Formatter
 *
 * Formats injection results for agent prompts using markdown.
 * See Spec Section 5.2.
 */

import type { PatternDefinition, DerivedPrinciple, ProvisionalAlert } from '../schemas/index.js';
import type { InjectedWarning, InjectedAlert, InjectionResult } from './selector.js';

/**
 * Format injection result for agent prompts.
 */
export function formatInjectionForPrompt(result: InjectionResult): string {
  const sections: string[] = [];

  // Format alerts first (high visibility)
  if (result.alerts.length > 0) {
    sections.push(formatAlertsSection(result.alerts));
  }

  // Format warnings
  if (result.warnings.length > 0) {
    sections.push(formatWarningsSection(result.warnings));
  }

  return sections.join('\n\n');
}

/**
 * Format provisional alerts section.
 */
function formatAlertsSection(alerts: InjectedAlert[]): string {
  const lines: string[] = [
    '<!-- BEGIN AUTO-GENERATED WARNINGS -->',
    '## PROVISIONAL ALERTS (auto-generated)',
    '',
    '> These are real-time alerts about known issues. Pay close attention!',
    '',
  ];

  // Sort by priority (highest first)
  const sorted = [...alerts].sort((a, b) => b.priority - a.priority);

  for (const alert of sorted) {
    lines.push(formatAlert(alert.content));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format warnings section (patterns and principles).
 */
function formatWarningsSection(warnings: InjectedWarning[]): string {
  const lines: string[] = [
    '<!-- BEGIN AUTO-GENERATED WARNINGS -->',
    '## Warnings from Past Issues (auto-generated)',
    '',
    'These warnings are based on patterns learned from previous PR reviews.',
    'Pay special attention to these areas to avoid repeating past mistakes.',
    '',
  ];

  // Sort by priority (highest first)
  const sorted = [...warnings].sort((a, b) => b.priority - a.priority);

  for (const warning of sorted) {
    if (warning.type === 'pattern') {
      lines.push(formatPattern(warning.content as PatternDefinition));
    } else {
      lines.push(formatPrinciple(warning.content as DerivedPrinciple));
    }
    lines.push('');
  }

  lines.push('<!-- END AUTO-GENERATED WARNINGS -->');
  return lines.join('\n');
}

/**
 * Legacy function for backward compatibility.
 * @deprecated Use formatInjectionForPrompt instead
 */
export function formatWarningsForInjection(warnings: InjectedWarning[]): string {
  return formatWarningsSection(warnings);
}

function formatPattern(pattern: PatternDefinition): string {
  const categoryUpper = pattern.findingCategory.toUpperCase();
  const failureModeFormatted = pattern.failureMode.replace(/_/g, ' ');
  const title = truncate(summarizeContent(pattern.patternContent), 60);

  const lines = [
    `### [${categoryUpper}][${failureModeFormatted}][${pattern.severityMax}] ${title}`,
    '',
    `**Bad guidance:** "${pattern.patternContent}"`,
    '',
    `**Observed result:** This led to a ${pattern.findingCategory} issue.`,
    '',
    `**Do instead:** ${pattern.alternative}`,
    '',
    `**Applies when:** touches=${pattern.touches.join(',')}`,
  ];

  if (pattern.technologies.length > 0) {
    lines[lines.length - 1] += `; tech=${pattern.technologies.join(',')}`;
  }

  if (pattern.consequenceClass) {
    lines.push('');
    lines.push(`**Reference:** ${pattern.consequenceClass}`);
  }

  return lines.join('\n');
}

function formatPrinciple(principle: DerivedPrinciple): string {
  const title = truncate(principle.principle, 60);
  const originLabel = principle.origin === 'baseline' ? 'BASELINE' : 'DERIVED';

  const lines = [
    `### [${originLabel}] ${title}`,
    '',
    `**Principle:** ${principle.principle}`,
    '',
    `**Rationale:** ${principle.rationale}`,
    '',
    `**Applies when:** touches=${principle.touches.join(',')}`,
  ];

  if (principle.externalRefs?.length) {
    lines.push('');
    lines.push(`**Reference:** ${principle.externalRefs.join(', ')}`);
  }

  return lines.join('\n');
}

function formatAlert(alert: ProvisionalAlert): string {
  const lines = [`### [PROVISIONAL ALERT] ${alert.message}`, '', `**Issue ID:** ${alert.issueId}`];

  if (alert.touches.length > 0) {
    lines.push('');
    lines.push(`**Applies when:** touches=${alert.touches.join(',')}`);
  }

  // Show expiration to indicate this is a temporary alert
  const expiresIn = Math.max(
    0,
    Math.floor((new Date(alert.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  );
  lines.push('');
  lines.push(`**Expires in:** ${expiresIn} days`);

  return lines.join('\n');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function summarizeContent(content: string): string {
  const firstSentence = content.split(/[.!?]/)[0];
  return firstSentence.trim();
}

/**
 * Format a compact summary for logging.
 */
export function formatWarningsSummary(warnings: InjectedWarning[]): string {
  const patterns = warnings.filter((w) => w.type === 'pattern');
  const principles = warnings.filter((w) => w.type === 'principle');

  return `Injected ${warnings.length} warnings: ${principles.length} baseline principles, ${patterns.length} learned patterns`;
}

/**
 * Format summary including alerts.
 */
export function formatInjectionSummary(result: InjectionResult): string {
  const patterns = result.warnings.filter((w) => w.type === 'pattern');
  const principles = result.warnings.filter((w) => w.type === 'principle');
  const alerts = result.alerts;

  const parts = [
    `${result.warnings.length} warnings (${principles.length} baselines, ${patterns.length} patterns)`,
  ];

  if (alerts.length > 0) {
    parts.push(`${alerts.length} provisional alerts`);
  }

  return `Injected: ${parts.join(', ')}`;
}
