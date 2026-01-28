import { Octokit } from '@octokit/rest';

export const DEFAULT_GITHUB_USER_AGENT = 'falcon-pm/1.0.0';

export class MissingGitHubTokenError extends Error {
  constructor(message = 'GITHUB_TOKEN is required to use the GitHub adapter') {
    super(message);
    this.name = 'MissingGitHubTokenError';
  }
}

export function loadGitHubToken(env: NodeJS.ProcessEnv = process.env): string {
  const token = env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new MissingGitHubTokenError();
  }
  return token;
}

export function createOctokit(token: string): Octokit {
  return new Octokit({ auth: token, userAgent: DEFAULT_GITHUB_USER_AGENT });
}

export function createOctokitFromEnv(env: NodeJS.ProcessEnv = process.env): Octokit {
  return createOctokit(loadGitHubToken(env));
}
