import path from 'node:path';

export function getProjectRoot(falconHome: string, projectSlug: string): string {
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
  return path.join(getIssuesRoot(falconHome, projectSlug), issueId);
}
