/**
 * Unit tests for Metrics Reporter.
 */

import { describe, it, expect } from 'vitest';
import {
  formatMetricsReport,
  formatMetricsJson,
  formatMetricsCsv,
  getMetricsCsvHeaders,
  formatMetricsSummary,
} from '../../src/metrics/reporter.js';
import type { MetricsSnapshot } from '../../src/metrics/collector.js';

describe('formatMetricsReport', () => {
  const mockMetrics: MetricsSnapshot = {
    timestamp: '2026-01-20T10:00:00.000Z',
    scope: {
      workspaceId: 'workspace-123',
      projectId: 'project-456',
    },
    attribution: {
      totalPatterns: 25,
      activePatterns: 20,
      archivedPatterns: 5,
      totalOccurrences: 100,
      activeOccurrences: 85,
      verbatimPatterns: 15,
      paraphrasePatterns: 6,
      inferredPatterns: 4,
    },
    injection: {
      totalInjections: 50,
      contextPackInjections: 30,
      specInjections: 20,
      averageWarningsPerInjection: 2.5,
      uniquePatternsInjected: 18,
    },
    health: {
      attributionPrecisionScore: 0.75,
      inferredRatio: 0.16,
      observedImprovementRate: 0.55,
      killSwitchState: 'active',
    },
    principles: {
      totalBaselines: 11,
      totalDerived: 5,
      activeBaselines: 11,
      activeDerived: 4,
    },
    alerts: {
      activeAlerts: 3,
      expiredAlerts: 7,
      promotedAlerts: 2,
    },
    salience: {
      openIssues: 2,
      resolvedIssues: 5,
    },
  };

  it('produces readable output', () => {
    const report = formatMetricsReport(mockMetrics);

    expect(report).toContain('Falcon AI Metrics Report');
    expect(report).toContain('2026-01-20');
    expect(report).toContain('Total Patterns: 25');
    expect(report).toContain('Active: 20');
    expect(report).toContain('Total Occurrences: 100');
    expect(report).toContain('Total Injections: 50');
    expect(report).toContain('Context Pack: 30');
    expect(report).toContain('Spec: 20');
  });

  it('includes health metrics section', () => {
    const report = formatMetricsReport(mockMetrics);

    expect(report).toContain('Health Metrics');
    expect(report).toContain('Precision Rate');
    expect(report).toContain('75.0%');
    expect(report).toContain('Inferred Rate');
    expect(report).toContain('16.0%');
    expect(report).toContain('Improvement Rate');
    expect(report).toContain('55.0%');
    expect(report).toContain('Kill Switch');
    expect(report).toContain('active');
  });

  it('includes principles section', () => {
    const report = formatMetricsReport(mockMetrics);

    expect(report).toContain('Principles');
    expect(report).toContain('Baselines: 11/11');
    expect(report).toContain('Derived: 4/5');
  });

  it('includes alerts section', () => {
    const report = formatMetricsReport(mockMetrics);

    expect(report).toContain('Provisional Alerts');
    expect(report).toContain('Active: 3');
    expect(report).toContain('Expired: 7');
    expect(report).toContain('Promoted: 2');
  });

  it('includes salience section', () => {
    const report = formatMetricsReport(mockMetrics);

    expect(report).toContain('Salience Issues');
    expect(report).toContain('Open: 2');
    expect(report).toContain('Resolved: 5');
  });

  it('includes pattern type breakdown', () => {
    const report = formatMetricsReport(mockMetrics);

    expect(report).toContain('Pattern Types');
    expect(report).toContain('Verbatim: 15');
    expect(report).toContain('Paraphrase: 6');
    expect(report).toContain('Inferred: 4');
  });
});

describe('formatMetricsJson', () => {
  const mockMetrics: MetricsSnapshot = {
    timestamp: '2026-01-20T10:00:00.000Z',
    scope: {
      workspaceId: 'workspace-123',
      projectId: 'project-456',
    },
    attribution: {
      totalPatterns: 10,
      activePatterns: 8,
      archivedPatterns: 2,
      totalOccurrences: 50,
      activeOccurrences: 45,
      verbatimPatterns: 5,
      paraphrasePatterns: 3,
      inferredPatterns: 2,
    },
    injection: {
      totalInjections: 20,
      contextPackInjections: 12,
      specInjections: 8,
      averageWarningsPerInjection: 1.8,
      uniquePatternsInjected: 7,
    },
    health: {
      attributionPrecisionScore: 0.65,
      inferredRatio: 0.2,
      observedImprovementRate: 0.45,
      killSwitchState: 'active',
    },
    principles: {
      totalBaselines: 11,
      totalDerived: 3,
      activeBaselines: 11,
      activeDerived: 3,
    },
    alerts: {
      activeAlerts: 1,
      expiredAlerts: 2,
      promotedAlerts: 0,
    },
    salience: {
      openIssues: 0,
      resolvedIssues: 1,
    },
  };

  it('produces valid JSON', () => {
    const json = formatMetricsJson(mockMetrics);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('preserves all metrics data', () => {
    const json = formatMetricsJson(mockMetrics);
    const parsed = JSON.parse(json);

    expect(parsed.timestamp).toBe(mockMetrics.timestamp);
    expect(parsed.scope.workspaceId).toBe(mockMetrics.scope.workspaceId);
    expect(parsed.attribution.totalPatterns).toBe(mockMetrics.attribution.totalPatterns);
    expect(parsed.health.attributionPrecisionScore).toBe(mockMetrics.health.attributionPrecisionScore);
  });

  it('produces formatted output', () => {
    const json = formatMetricsJson(mockMetrics);

    // Should contain newlines for readability (pretty printed)
    expect(json).toContain('\n');
    expect(json).toContain('  '); // Indentation
  });
});

describe('formatMetricsCsv', () => {
  const mockMetrics: MetricsSnapshot = {
    timestamp: '2026-01-20T10:00:00.000Z',
    scope: {
      workspaceId: 'workspace-123',
      projectId: 'project-456',
    },
    attribution: {
      totalPatterns: 10,
      activePatterns: 8,
      archivedPatterns: 2,
      totalOccurrences: 50,
      activeOccurrences: 45,
      verbatimPatterns: 5,
      paraphrasePatterns: 3,
      inferredPatterns: 2,
    },
    injection: {
      totalInjections: 20,
      contextPackInjections: 12,
      specInjections: 8,
      averageWarningsPerInjection: 1.8,
      uniquePatternsInjected: 7,
    },
    health: {
      attributionPrecisionScore: 0.65,
      inferredRatio: 0.2,
      observedImprovementRate: 0.45,
      killSwitchState: 'active',
    },
    principles: {
      totalBaselines: 11,
      totalDerived: 3,
      activeBaselines: 11,
      activeDerived: 3,
    },
    alerts: {
      activeAlerts: 1,
      expiredAlerts: 2,
      promotedAlerts: 0,
    },
    salience: {
      openIssues: 0,
      resolvedIssues: 1,
    },
  };

  it('produces correct columns', () => {
    const csv = formatMetricsCsv(mockMetrics);
    const values = csv.split(',');

    // Check specific values by position
    expect(values[0]).toBe(mockMetrics.timestamp);
    expect(values[1]).toBe(mockMetrics.scope.workspaceId);
    expect(values[2]).toBe(mockMetrics.scope.projectId);
    expect(values[3]).toBe('10'); // totalPatterns
    expect(values[4]).toBe('8'); // activePatterns
  });

  it('includes health metrics', () => {
    const csv = formatMetricsCsv(mockMetrics);

    expect(csv).toContain('0.65'); // precisionScore
    expect(csv).toContain('0.2'); // inferredRatio
    expect(csv).toContain('0.45'); // improvementRate
    expect(csv).toContain('active'); // killSwitchState
  });
});

describe('getMetricsCsvHeaders', () => {
  it('returns correct column headers', () => {
    const headers = getMetricsCsvHeaders();
    const columns = headers.split(',');

    expect(columns).toContain('timestamp');
    expect(columns).toContain('workspace_id');
    expect(columns).toContain('project_id');
    expect(columns).toContain('total_patterns');
    expect(columns).toContain('active_patterns');
    expect(columns).toContain('precision_rate');
    expect(columns).toContain('inferred_rate');
    expect(columns).toContain('kill_switch_state');
  });

  it('matches CSV column order', () => {
    const mockMetrics: MetricsSnapshot = {
      timestamp: '2026-01-20T10:00:00.000Z',
      scope: {
        workspaceId: 'ws',
        projectId: 'proj',
      },
      attribution: {
        totalPatterns: 1,
        activePatterns: 1,
        archivedPatterns: 0,
        totalOccurrences: 1,
        activeOccurrences: 1,
        verbatimPatterns: 1,
        paraphrasePatterns: 0,
        inferredPatterns: 0,
      },
      injection: {
        totalInjections: 1,
        contextPackInjections: 1,
        specInjections: 0,
        averageWarningsPerInjection: 1,
        uniquePatternsInjected: 1,
      },
      health: {
        attributionPrecisionScore: 0.5,
        inferredRatio: 0.1,
        observedImprovementRate: 0.3,
        killSwitchState: 'active',
      },
      principles: {
        totalBaselines: 0,
        totalDerived: 0,
        activeBaselines: 0,
        activeDerived: 0,
      },
      alerts: {
        activeAlerts: 0,
        expiredAlerts: 0,
        promotedAlerts: 0,
      },
      salience: {
        openIssues: 0,
        resolvedIssues: 0,
      },
    };

    const headers = getMetricsCsvHeaders().split(',');
    const values = formatMetricsCsv(mockMetrics).split(',');

    // Should have same number of columns
    expect(headers.length).toBe(values.length);
  });
});

describe('formatMetricsSummary', () => {
  const mockMetrics: MetricsSnapshot = {
    timestamp: '2026-01-20T10:00:00.000Z',
    scope: {
      workspaceId: 'workspace-123',
      projectId: 'project-456',
    },
    attribution: {
      totalPatterns: 25,
      activePatterns: 20,
      archivedPatterns: 5,
      totalOccurrences: 100,
      activeOccurrences: 85,
      verbatimPatterns: 15,
      paraphrasePatterns: 6,
      inferredPatterns: 4,
    },
    injection: {
      totalInjections: 50,
      contextPackInjections: 30,
      specInjections: 20,
      averageWarningsPerInjection: 2.5,
      uniquePatternsInjected: 18,
    },
    health: {
      attributionPrecisionScore: 0.75,
      inferredRatio: 0.16,
      observedImprovementRate: 0.55,
      killSwitchState: 'active',
    },
    principles: {
      totalBaselines: 11,
      totalDerived: 5,
      activeBaselines: 11,
      activeDerived: 4,
    },
    alerts: {
      activeAlerts: 3,
      expiredAlerts: 7,
      promotedAlerts: 2,
    },
    salience: {
      openIssues: 2,
      resolvedIssues: 5,
    },
  };

  it('produces compact output', () => {
    const summary = formatMetricsSummary(mockMetrics);

    // Should be a single line
    expect(summary.split('\n').length).toBe(1);

    // Should contain key metrics
    expect(summary).toContain('Patterns: 20');
    expect(summary).toContain('Injections: 50');
    expect(summary).toContain('Precision: 75%');
    expect(summary).toContain('Health: active');
  });

  it('handles different health states', () => {
    const pausedMetrics: MetricsSnapshot = {
      ...mockMetrics,
      health: {
        ...mockMetrics.health,
        killSwitchState: 'inferred_paused',
      },
    };

    const summary = formatMetricsSummary(pausedMetrics);
    expect(summary).toContain('Health: inferred_paused');
  });

  it('rounds precision percentage', () => {
    const preciseMetrics: MetricsSnapshot = {
      ...mockMetrics,
      health: {
        ...mockMetrics.health,
        attributionPrecisionScore: 0.6789,
      },
    };

    const summary = formatMetricsSummary(preciseMetrics);
    expect(summary).toContain('Precision: 68%');
  });
});

describe('health color thresholds', () => {
  it('shows green for healthy precision rate', () => {
    const healthyMetrics: MetricsSnapshot = {
      timestamp: '2026-01-20T10:00:00.000Z',
      scope: { workspaceId: 'ws', projectId: 'proj' },
      attribution: {
        totalPatterns: 0,
        activePatterns: 0,
        archivedPatterns: 0,
        totalOccurrences: 0,
        activeOccurrences: 0,
        verbatimPatterns: 0,
        paraphrasePatterns: 0,
        inferredPatterns: 0,
      },
      injection: {
        totalInjections: 0,
        contextPackInjections: 0,
        specInjections: 0,
        averageWarningsPerInjection: 0,
        uniquePatternsInjected: 0,
      },
      health: {
        attributionPrecisionScore: 0.7, // Above 0.6 threshold
        inferredRatio: 0.15, // Below 0.25 threshold
        observedImprovementRate: 0.5, // Above 0.4 threshold
        killSwitchState: 'active',
      },
      principles: {
        totalBaselines: 0,
        totalDerived: 0,
        activeBaselines: 0,
        activeDerived: 0,
      },
      alerts: {
        activeAlerts: 0,
        expiredAlerts: 0,
        promotedAlerts: 0,
      },
      salience: {
        openIssues: 0,
        resolvedIssues: 0,
      },
    };

    const report = formatMetricsReport(healthyMetrics);

    // Green color code should be present for healthy values
    expect(report).toContain('\x1b[32m'); // Green ANSI code
  });

  it('shows red for critical precision rate', () => {
    const criticalMetrics: MetricsSnapshot = {
      timestamp: '2026-01-20T10:00:00.000Z',
      scope: { workspaceId: 'ws', projectId: 'proj' },
      attribution: {
        totalPatterns: 0,
        activePatterns: 0,
        archivedPatterns: 0,
        totalOccurrences: 0,
        activeOccurrences: 0,
        verbatimPatterns: 0,
        paraphrasePatterns: 0,
        inferredPatterns: 0,
      },
      injection: {
        totalInjections: 0,
        contextPackInjections: 0,
        specInjections: 0,
        averageWarningsPerInjection: 0,
        uniquePatternsInjected: 0,
      },
      health: {
        attributionPrecisionScore: 0.3, // Below 0.5 (0.6 - 0.1) threshold
        inferredRatio: 0.5, // Above 0.35 (0.25 + 0.1) threshold
        observedImprovementRate: 0.2, // Below 0.3 (0.4 - 0.1) threshold
        killSwitchState: 'fully_paused',
      },
      principles: {
        totalBaselines: 0,
        totalDerived: 0,
        activeBaselines: 0,
        activeDerived: 0,
      },
      alerts: {
        activeAlerts: 0,
        expiredAlerts: 0,
        promotedAlerts: 0,
      },
      salience: {
        openIssues: 0,
        resolvedIssues: 0,
      },
    };

    const report = formatMetricsReport(criticalMetrics);

    // Red color code should be present for critical values
    expect(report).toContain('\x1b[31m'); // Red ANSI code
  });
});
