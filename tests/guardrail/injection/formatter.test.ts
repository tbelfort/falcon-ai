/**
 * Tests for the warning formatter.
 */

import { describe, it, expect } from 'vitest';
import {
  formatInjectionForPrompt,
  formatWarningsForInjection,
  formatWarningsSummary,
  formatInjectionSummary,
} from '../../../src/guardrail/injection/formatter.js';
import type { InjectedWarning, InjectedAlert, InjectionResult } from '../../../src/guardrail/injection/selector.js';
import type { PatternDefinition, DerivedPrinciple, ProvisionalAlert } from '../../../src/guardrail/schemas/index.js';

describe('formatter', () => {
  const basePattern: PatternDefinition = {
    id: 'pattern-1',
    scope: { level: 'project', workspaceId: 'ws-1', projectId: 'proj-1' },
    patternKey: 'a'.repeat(64),
    contentHash: 'b'.repeat(64),
    patternContent: 'Use string concatenation for SQL queries',
    failureMode: 'incorrect',
    findingCategory: 'security',
    severity: 'HIGH',
    severityMax: 'HIGH',
    alternative: 'Use parameterized queries',
    carrierStage: 'context-pack',
    primaryCarrierQuoteType: 'verbatim',
    technologies: ['sql'],
    taskTypes: ['api'],
    touches: ['database', 'user_input'],
    status: 'active',
    permanent: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const basePrinciple: DerivedPrinciple = {
    id: 'principle-1',
    scope: { level: 'workspace', workspaceId: 'ws-1' },
    principle: 'Always validate user input',
    rationale: 'Prevents injection attacks',
    origin: 'baseline',
    injectInto: 'context-pack',
    touches: ['user_input'],
    confidence: 0.9,
    status: 'active',
    permanent: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const baseAlert: ProvisionalAlert = {
    id: 'alert-1',
    workspaceId: 'ws-1',
    projectId: 'proj-1',
    findingId: 'finding-1',
    issueId: 'issue-1',
    message: 'Critical security issue found',
    touches: ['user_input'],
    injectInto: 'context-pack',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  describe('formatInjectionForPrompt', () => {
    it('formats empty result correctly', () => {
      const result: InjectionResult = { warnings: [], alerts: [] };
      const output = formatInjectionForPrompt(result);
      expect(output).toBe('');
    });

    it('formats warnings section with patterns', () => {
      const warnings: InjectedWarning[] = [
        { type: 'pattern', id: 'p1', priority: 0.8, content: basePattern },
      ];
      const result: InjectionResult = { warnings, alerts: [] };

      const output = formatInjectionForPrompt(result);

      expect(output).toContain('## Warnings from Past Issues');
      expect(output).toContain('[SECURITY]');
      expect(output).toContain('Use string concatenation');
      expect(output).toContain('Use parameterized queries');
    });

    it('includes non-citable instruction', () => {
      const warnings: InjectedWarning[] = [
        { type: 'pattern', id: 'p1', priority: 0.8, content: basePattern },
      ];
      const result: InjectionResult = { warnings, alerts: [] };

      const output = formatInjectionForPrompt(result);

      expect(output).toContain('DO NOT cite warnings as sources of truth');
    });

    it('formats principles section', () => {
      const warnings: InjectedWarning[] = [
        { type: 'principle', id: 'pr1', priority: 0.9, content: basePrinciple },
      ];
      const result: InjectionResult = { warnings, alerts: [] };

      const output = formatInjectionForPrompt(result);

      expect(output).toContain('[BASELINE]');
      expect(output).toContain('Always validate user input');
      expect(output).toContain('Prevents injection attacks');
    });

    it('formats alerts section', () => {
      const alerts: InjectedAlert[] = [
        { type: 'alert', id: 'a1', priority: 0.9, content: baseAlert },
      ];
      const result: InjectionResult = { warnings: [], alerts };

      const output = formatInjectionForPrompt(result);

      expect(output).toContain('PROVISIONAL ALERT');
      expect(output).toContain('Critical security issue found');
      expect(output).toContain('issue-1');
    });

    it('formats expiry correctly - today', () => {
      const expiringToday = {
        ...baseAlert,
        expiresAt: new Date().toISOString(),
      };
      const alerts: InjectedAlert[] = [
        { type: 'alert', id: 'a1', priority: 0.9, content: expiringToday },
      ];
      const result: InjectionResult = { warnings: [], alerts };

      const output = formatInjectionForPrompt(result);

      expect(output).toContain('Expires in:** today');
    });

    it('formats expiry correctly - 1 day', () => {
      const expiringTomorrow = {
        ...baseAlert,
        expiresAt: new Date(Date.now() + 1.5 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const alerts: InjectedAlert[] = [
        { type: 'alert', id: 'a1', priority: 0.9, content: expiringTomorrow },
      ];
      const result: InjectionResult = { warnings: [], alerts };

      const output = formatInjectionForPrompt(result);

      expect(output).toContain('Expires in:** 1 day');
    });

    it('formats expiry correctly - multiple days', () => {
      const expiringLater = {
        ...baseAlert,
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const alerts: InjectedAlert[] = [
        { type: 'alert', id: 'a1', priority: 0.9, content: expiringLater },
      ];
      const result: InjectionResult = { warnings: [], alerts };

      const output = formatInjectionForPrompt(result);

      expect(output).toMatch(/Expires in:\*\* [45] days/);
    });

    it('sorts warnings by priority', () => {
      const highPriority: PatternDefinition = { ...basePattern, id: 'high', severityMax: 'CRITICAL' };
      const lowPriority: PatternDefinition = { ...basePattern, id: 'low', severityMax: 'LOW' };

      const warnings: InjectedWarning[] = [
        { type: 'pattern', id: 'low', priority: 0.5, content: lowPriority },
        { type: 'pattern', id: 'high', priority: 0.9, content: highPriority },
      ];
      const result: InjectionResult = { warnings, alerts: [] };

      const output = formatInjectionForPrompt(result);

      // CRITICAL should appear before LOW
      const criticalIndex = output.indexOf('CRITICAL');
      const lowIndex = output.indexOf('LOW');
      expect(criticalIndex).toBeLessThan(lowIndex);
    });
  });

  describe('formatWarningsForInjection (legacy)', () => {
    it('formats warnings section', () => {
      const warnings: InjectedWarning[] = [
        { type: 'pattern', id: 'p1', priority: 0.8, content: basePattern },
      ];

      const output = formatWarningsForInjection(warnings);

      expect(output).toContain('## Warnings from Past Issues');
      expect(output).toContain('[SECURITY]');
    });
  });

  describe('formatWarningsSummary', () => {
    it('summarizes warnings correctly', () => {
      const warnings: InjectedWarning[] = [
        { type: 'pattern', id: 'p1', priority: 0.8, content: basePattern },
        { type: 'pattern', id: 'p2', priority: 0.7, content: basePattern },
        { type: 'principle', id: 'pr1', priority: 0.9, content: basePrinciple },
      ];

      const summary = formatWarningsSummary(warnings);

      expect(summary).toContain('3 warnings');
      expect(summary).toContain('1 baseline');
      expect(summary).toContain('2 learned patterns');
    });

    it('handles empty warnings', () => {
      const summary = formatWarningsSummary([]);
      expect(summary).toContain('0 warnings');
    });
  });

  describe('formatInjectionSummary', () => {
    it('includes alerts count', () => {
      const result: InjectionResult = {
        warnings: [
          { type: 'pattern', id: 'p1', priority: 0.8, content: basePattern },
        ],
        alerts: [
          { type: 'alert', id: 'a1', priority: 0.9, content: baseAlert },
        ],
      };

      const summary = formatInjectionSummary(result);

      expect(summary).toContain('1 warnings');
      expect(summary).toContain('1 provisional alerts');
    });

    it('omits alerts when none present', () => {
      const result: InjectionResult = {
        warnings: [
          { type: 'pattern', id: 'p1', priority: 0.8, content: basePattern },
        ],
        alerts: [],
      };

      const summary = formatInjectionSummary(result);

      expect(summary).not.toContain('provisional alerts');
    });
  });
});
