import path from 'node:path';
import { hasTraversalSegments } from '../db/path-validation.js';

function validatePathSegment(value: string, paramName: string): void {
  if (hasTraversalSegments(value)) {
    throw new Error(`Invalid ${paramName}: path traversal detected`);
  }
}

export function getProjectRoot(falconHome: string, projectSlug: string): string {
  validatePathSegment(projectSlug, 'projectSlug');
  return path.join(falconHome, 'projects', projectSlug);
}

export function getPrimaryPath(falconHome: string, projectSlug: string): string {
  return path.join(getProjectRoot(falconHome, projectSlug), 'primary');
}

export function getAgentsRoot(falconHome: string, projectSlug: string): string {
  return path.join(getProjectRoot(falconHome, projectSlug), 'agents');
}

export function getAgentWorktreePath(
  falconHome: string,
  projectSlug: string,
  agentName: string
): string {
  validatePathSegment(agentName, 'agentName');
  return path.join(getAgentsRoot(falconHome, projectSlug), agentName);
}

export function getIssuesRoot(falconHome: string, projectSlug: string): string {
  return path.join(getProjectRoot(falconHome, projectSlug), 'issues');
}

export function getIssuePath(
  falconHome: string,
  projectSlug: string,
  issueId: string
): string {
  validatePathSegment(issueId, 'issueId');
  return path.join(getIssuesRoot(falconHome, projectSlug), issueId);
}
