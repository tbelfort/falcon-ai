import { describe, expect, it } from 'vitest';
import { parseRepoUrl } from '../../../src/pm/github/repo.js';

describe('parseRepoUrl', () => {
  it('parses HTTPS URL', () => {
    const result = parseRepoUrl('https://github.com/acme/rocket');
    expect(result).toEqual({ owner: 'acme', repo: 'rocket' });
  });

  it('parses HTTPS URL with trailing path', () => {
    const result = parseRepoUrl('https://github.com/acme/rocket/tree/main');
    expect(result).toEqual({ owner: 'acme', repo: 'rocket' });
  });

  it('parses HTTP URL', () => {
    const result = parseRepoUrl('http://github.com/owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses SSH URL with git@ prefix', () => {
    const result = parseRepoUrl('git@github.com:acme/rocket.git');
    expect(result).toEqual({ owner: 'acme', repo: 'rocket' });
  });

  it('parses SSH URL without .git suffix', () => {
    const result = parseRepoUrl('git@github.com:owner/repo');
    expect(result).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses short format owner/repo', () => {
    const result = parseRepoUrl('acme/rocket');
    expect(result).toEqual({ owner: 'acme', repo: 'rocket' });
  });

  it('throws on invalid URL', () => {
    expect(() => parseRepoUrl('not-a-valid-url')).toThrow('Invalid GitHub repo URL');
  });

  it('throws on empty string', () => {
    expect(() => parseRepoUrl('')).toThrow('Invalid GitHub repo URL');
  });

  it('rejects URLs with github.com not at domain boundary', () => {
    // This should NOT match - github.com is not at the domain boundary
    expect(() => parseRepoUrl('https://evil.com/github.com/attacker/malicious')).toThrow(
      'Invalid GitHub repo URL'
    );
  });

  it('rejects SSH URLs without git@ prefix', () => {
    // This pattern should not match - requires git@ prefix
    expect(() => parseRepoUrl('github.com:owner/repo')).toThrow('Invalid GitHub repo URL');
  });
});
