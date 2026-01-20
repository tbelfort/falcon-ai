import { describe, it, expect } from 'vitest';
import { canonicalizeGitUrl, gitUrlsEqual } from '../../src/config/url-utils.js';

describe('canonicalizeGitUrl', () => {
  it('should canonicalize SSH URLs', () => {
    expect(canonicalizeGitUrl('git@github.com:org/repo.git')).toBe('github.com/org/repo');
  });

  it('should canonicalize HTTPS URLs', () => {
    expect(canonicalizeGitUrl('https://github.com/org/repo.git')).toBe('github.com/org/repo');
  });

  it('should handle URLs without .git suffix', () => {
    expect(canonicalizeGitUrl('https://github.com/org/repo')).toBe('github.com/org/repo');
  });

  it('should remove trailing slashes', () => {
    expect(canonicalizeGitUrl('https://github.com/org/repo/')).toBe('github.com/org/repo');
  });

  it('should handle multiple trailing slashes', () => {
    expect(canonicalizeGitUrl('https://github.com/org/repo///')).toBe('github.com/org/repo');
  });

  it('should produce identical output for SSH and HTTPS', () => {
    const ssh = canonicalizeGitUrl('git@github.com:org/repo.git');
    const https = canonicalizeGitUrl('https://github.com/org/repo.git');
    expect(ssh).toBe(https);
  });

  it('should handle HTTP URLs', () => {
    expect(canonicalizeGitUrl('http://github.com/org/repo.git')).toBe('github.com/org/repo');
  });

  it('should handle GitLab URLs', () => {
    expect(canonicalizeGitUrl('git@gitlab.com:org/repo.git')).toBe('gitlab.com/org/repo');
    expect(canonicalizeGitUrl('https://gitlab.com/org/repo.git')).toBe('gitlab.com/org/repo');
  });

  it('should handle nested paths', () => {
    expect(canonicalizeGitUrl('git@github.com:org/subgroup/repo.git')).toBe(
      'github.com/org/subgroup/repo'
    );
    expect(canonicalizeGitUrl('https://github.com/org/subgroup/repo.git')).toBe(
      'github.com/org/subgroup/repo'
    );
  });

  it('should preserve already canonical URLs', () => {
    expect(canonicalizeGitUrl('github.com/org/repo')).toBe('github.com/org/repo');
  });

  it('should handle whitespace', () => {
    expect(canonicalizeGitUrl('  git@github.com:org/repo.git  ')).toBe('github.com/org/repo');
  });
});

describe('gitUrlsEqual', () => {
  it('should return true for equivalent URLs', () => {
    expect(gitUrlsEqual('git@github.com:org/repo.git', 'https://github.com/org/repo.git')).toBe(
      true
    );
  });

  it('should return true for identical URLs', () => {
    expect(gitUrlsEqual('git@github.com:org/repo.git', 'git@github.com:org/repo.git')).toBe(true);
  });

  it('should return false for different repositories', () => {
    expect(gitUrlsEqual('git@github.com:org/repo1.git', 'git@github.com:org/repo2.git')).toBe(
      false
    );
  });

  it('should return false for different organizations', () => {
    expect(gitUrlsEqual('git@github.com:org1/repo.git', 'git@github.com:org2/repo.git')).toBe(
      false
    );
  });

  it('should handle URLs with and without .git suffix', () => {
    expect(gitUrlsEqual('git@github.com:org/repo.git', 'git@github.com:org/repo')).toBe(true);
  });
});
