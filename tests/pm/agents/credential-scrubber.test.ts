import { describe, expect, it } from 'vitest';
import { scrubCredentials } from '../../../src/pm/agents/invokers/credential-scrubber.js';

describe('credential scrubber', () => {
  it('scrubs URLs with embedded credentials', () => {
    const input = 'Cloning https://user:token123@github.com/repo.git';
    expect(scrubCredentials(input)).toBe('Cloning [REDACTED]github.com/repo.git');
  });

  it('scrubs GitHub PAT tokens (classic)', () => {
    const input = 'Using token ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    expect(scrubCredentials(input)).toBe('Using token [REDACTED]');
  });

  it('scrubs GitHub fine-grained PATs', () => {
    const input = 'Token: github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    expect(scrubCredentials(input)).toBe('Token: [REDACTED]');
  });

  it('scrubs GitHub OAuth tokens', () => {
    const input = 'OAuth: gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    expect(scrubCredentials(input)).toBe('OAuth: [REDACTED]');
  });

  it('scrubs GitHub App installation tokens', () => {
    const input = 'App token: ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    expect(scrubCredentials(input)).toBe('App token: [REDACTED]');
  });

  it('scrubs GitHub refresh tokens', () => {
    const input = 'Refresh: ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    expect(scrubCredentials(input)).toBe('Refresh: [REDACTED]');
  });

  it('scrubs GitLab PAT tokens', () => {
    const input = 'GitLab token: glpat-xxxxxxxxxxxxxxxxxxxx';
    expect(scrubCredentials(input)).toBe('GitLab token: [REDACTED]');
  });

  it('scrubs Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx';
    expect(scrubCredentials(input)).toBe('Authorization: [REDACTED]');
  });

  it('scrubs AWS access key IDs', () => {
    const input = 'AWS key: AKIAIOSFODNN7EXAMPLE';
    expect(scrubCredentials(input)).toBe('AWS key: [REDACTED]');
  });

  it('scrubs AWS secret access keys', () => {
    const input = 'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    expect(scrubCredentials(input)).toBe('[REDACTED]');
  });

  it('scrubs AWS secret access keys with quotes', () => {
    const input = 'AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"';
    expect(scrubCredentials(input)).toBe('[REDACTED]"');
  });

  it('scrubs OpenAI API keys', () => {
    const input = 'OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    expect(scrubCredentials(input)).toBe('OPENAI_API_KEY=[REDACTED]');
  });

  it('scrubs Anthropic API keys', () => {
    const input = 'ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    expect(scrubCredentials(input)).toBe('ANTHROPIC_API_KEY=[REDACTED]');
  });

  it('scrubs Slack bot tokens', () => {
    const input = 'Slack token: xoxb-0000000FAKE-0000000FAKE0-TESTTESTtesttestTESTTEST';
    expect(scrubCredentials(input)).toBe('Slack token: [REDACTED]');
  });

  it('scrubs Slack user tokens', () => {
    const input = 'User token: xoxp-0000000FAKE-0000000FAKE0-TESTTESTtesttestTESTTEST';
    expect(scrubCredentials(input)).toBe('User token: [REDACTED]');
  });

  it('scrubs multiple credentials in one message', () => {
    const input = 'Tokens: ghp_abc123abc123abc123abc123abc123abc123 and AKIAIOSFODNN7EXAMPLE';
    const result = scrubCredentials(input);
    expect(result).not.toContain('ghp_');
    expect(result).not.toContain('AKIA');
    expect(result).toBe('Tokens: [REDACTED] and [REDACTED]');
  });

  it('leaves non-credential text unchanged', () => {
    const input = 'This is a normal message with no credentials';
    expect(scrubCredentials(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(scrubCredentials('')).toBe('');
  });

  it('does not partially expose credentials', () => {
    const input = 'ghp_reallyLongTokenThatShouldBeFullyRedacted123456';
    const result = scrubCredentials(input);
    expect(result).not.toContain('ghp_');
    expect(result).not.toContain('reallyLong');
    expect(result).toBe('[REDACTED]');
  });
});
