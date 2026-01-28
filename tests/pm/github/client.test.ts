import { describe, expect, it } from 'vitest';
import {
  loadGitHubToken,
  MissingGitHubTokenError,
  createOctokit,
  createOctokitFromEnv,
  buildOctokitConfig,
  DEFAULT_GITHUB_USER_AGENT,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from '../../../src/pm/github/client.js';

describe('MissingGitHubTokenError', () => {
  it('has correct name and default message', () => {
    const error = new MissingGitHubTokenError();
    expect(error.name).toBe('MissingGitHubTokenError');
    expect(error.message).toBe('GITHUB_TOKEN is required to use the GitHub adapter');
  });

  it('accepts custom message', () => {
    const error = new MissingGitHubTokenError('Custom message');
    expect(error.message).toBe('Custom message');
  });

  it('is instanceof Error', () => {
    const error = new MissingGitHubTokenError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MissingGitHubTokenError);
  });
});

describe('loadGitHubToken', () => {
  it('returns token when present', () => {
    const token = loadGitHubToken({ GITHUB_TOKEN: 'ghp_test123' });
    expect(token).toBe('ghp_test123');
  });

  it('trims whitespace from token', () => {
    const token = loadGitHubToken({ GITHUB_TOKEN: '  ghp_test123  ' });
    expect(token).toBe('ghp_test123');
  });

  it('throws MissingGitHubTokenError when token is missing', () => {
    expect(() => loadGitHubToken({})).toThrow(MissingGitHubTokenError);
  });

  it('throws MissingGitHubTokenError when token is empty string', () => {
    expect(() => loadGitHubToken({ GITHUB_TOKEN: '' })).toThrow(MissingGitHubTokenError);
  });

  it('throws MissingGitHubTokenError when token is whitespace only', () => {
    expect(() => loadGitHubToken({ GITHUB_TOKEN: '   ' })).toThrow(MissingGitHubTokenError);
  });

  it('throws MissingGitHubTokenError when token is undefined', () => {
    expect(() => loadGitHubToken({ GITHUB_TOKEN: undefined })).toThrow(MissingGitHubTokenError);
  });
});

describe('buildOctokitConfig', () => {
  it('builds config with auth token', () => {
    const config = buildOctokitConfig('ghp_test123');
    expect(config.auth).toBe('ghp_test123');
  });

  it('includes correct userAgent', () => {
    const config = buildOctokitConfig('test-token');
    expect(config.userAgent).toBe('falcon-pm/1.0.0');
    expect(config.userAgent).toBe(DEFAULT_GITHUB_USER_AGENT);
  });

  it('includes request timeout', () => {
    const config = buildOctokitConfig('test-token');
    expect(config.request.timeout).toBe(30000);
    expect(config.request.timeout).toBe(DEFAULT_REQUEST_TIMEOUT_MS);
  });

  it('uses provided token without modification', () => {
    const token = 'gho_exactToken123';
    const config = buildOctokitConfig(token);
    expect(config.auth).toBe(token);
  });
});

describe('createOctokit', () => {
  it('creates Octokit with provided token', () => {
    const octokit = createOctokit('test-token');
    expect(octokit).toBeDefined();
    expect(octokit.rest).toBeDefined();
  });

  it('creates functional Octokit instance', () => {
    const octokit = createOctokit('test-token');
    // Verify key REST API namespaces are available
    expect(octokit.rest.repos).toBeDefined();
    expect(octokit.rest.pulls).toBeDefined();
    expect(octokit.rest.issues).toBeDefined();
  });
});

describe('createOctokitFromEnv', () => {
  it('creates Octokit when token is present in env', () => {
    const octokit = createOctokitFromEnv({ GITHUB_TOKEN: 'ghp_test123' });
    expect(octokit).toBeDefined();
    expect(octokit.rest).toBeDefined();
  });

  it('throws MissingGitHubTokenError when token is missing from env', () => {
    expect(() => createOctokitFromEnv({})).toThrow(MissingGitHubTokenError);
  });
});

describe('constants', () => {
  it('exports DEFAULT_GITHUB_USER_AGENT', () => {
    expect(DEFAULT_GITHUB_USER_AGENT).toBe('falcon-pm/1.0.0');
  });

  it('exports DEFAULT_REQUEST_TIMEOUT_MS', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30000);
  });
});
