/**
 * Session State Management
 *
 * Manages .falcon/session.json for tracking current issue context.
 * Used by injection hooks to determine which warnings to inject.
 */

import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { findConfigPath } from './loader.js';

/**
 * Session state schema.
 */
export const SessionStateSchema = z.object({
  issueId: z.string().min(1),
  target: z.enum(['context-pack', 'spec']).nullable(),
  workflowState: z.string(),
  issueTitle: z.string().optional(),
  issueDescription: z.string().optional(),
  issueLabels: z.array(z.string()).optional(),
  updatedAt: z.string().datetime(),
});

export type SessionState = z.infer<typeof SessionStateSchema>;

/**
 * Map workflow state to injection target.
 */
export function workflowStateToTarget(state: string): 'context-pack' | 'spec' | null {
  const normalizedState = state.toLowerCase().trim();

  // Context Pack phase
  if (
    normalizedState === 'todo' ||
    normalizedState === 'context pack in progress' ||
    normalizedState === 'context pack in review'
  ) {
    return 'context-pack';
  }

  // Spec phase
  if (
    normalizedState === 'ready for spec' ||
    normalizedState === 'spec in progress' ||
    normalizedState === 'spec drafted' ||
    normalizedState === 'spec in review'
  ) {
    return 'spec';
  }

  // Implementation and later phases - use spec warnings
  if (
    normalizedState === 'ready to start' ||
    normalizedState === 'work started' ||
    normalizedState === 'in progress' ||
    normalizedState === 'in review' ||
    normalizedState === 'review passed' ||
    normalizedState === 'testing' ||
    normalizedState === 'ready to merge'
  ) {
    return 'spec';
  }

  return null;
}

/**
 * Find the .falcon directory by locating config.yaml.
 */
function findFalconDir(): string | null {
  const configPath = findConfigPath();
  if (!configPath) return null;
  return path.dirname(configPath);
}

/**
 * Get the path to session.json.
 */
function getSessionPath(): string | null {
  const falconDir = findFalconDir();
  if (!falconDir) return null;
  return path.join(falconDir, 'session.json');
}

/**
 * Load session state from .falcon/session.json.
 *
 * @returns Session state or null if not found or invalid
 */
export function loadSessionState(): SessionState | null {
  const sessionPath = getSessionPath();
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(sessionPath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;
    const result = SessionStateSchema.safeParse(parsed);

    if (!result.success) {
      return null;
    }

    return result.data;
  } catch {
    return null;
  }
}

/**
 * Write session state to .falcon/session.json.
 *
 * @param state - Session state to write
 */
export function writeSessionState(state: SessionState): void {
  const sessionPath = getSessionPath();
  if (!sessionPath) {
    throw new Error('Not in a Falcon project. Run "falcon init" first.');
  }

  // Validate state before writing
  SessionStateSchema.parse(state);

  fs.writeFileSync(sessionPath, JSON.stringify(state, null, 2));
}

/**
 * Clear session state by removing .falcon/session.json.
 */
export function clearSessionState(): void {
  const sessionPath = getSessionPath();
  if (sessionPath && fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
}

/**
 * Update session state with new issue context.
 *
 * @param options - Update options
 */
export function updateSessionState(options: {
  issueId: string;
  workflowState: string;
  issueTitle?: string;
  issueDescription?: string;
  issueLabels?: string[];
}): SessionState {
  const target = workflowStateToTarget(options.workflowState);

  const state: SessionState = {
    issueId: options.issueId,
    target,
    workflowState: options.workflowState,
    issueTitle: options.issueTitle,
    issueDescription: options.issueDescription,
    issueLabels: options.issueLabels,
    updatedAt: new Date().toISOString(),
  };

  writeSessionState(state);
  return state;
}
