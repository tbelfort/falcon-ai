/**
 * Credential scrubbing patterns for agent output.
 * Prevents accidental exposure of tokens in logs, error reports, or UI.
 *
 * These patterns are shared with git-sync.ts for consistency.
 */

const CREDENTIAL_PATTERNS = [
  /https?:\/\/[^:]+:[^@]+@/gi, // URLs with embedded credentials
  /ghp_[A-Za-z0-9_]+/gi, // GitHub PAT tokens
  /github_pat_[A-Za-z0-9_]+/gi, // GitHub fine-grained PAT
  /gho_[A-Za-z0-9_]+/gi, // GitHub OAuth tokens
  /ghs_[A-Za-z0-9_]+/gi, // GitHub App installation tokens
  /ghr_[A-Za-z0-9_]+/gi, // GitHub refresh tokens
  /glpat-[A-Za-z0-9_-]+/gi, // GitLab PAT tokens
  /Bearer\s+[A-Za-z0-9._-]+/gi, // Bearer tokens
  /AKIA[A-Z0-9]{16}/g, // AWS access key IDs
  /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)['"=:\s]+[A-Za-z0-9/+=]{40}/gi, // AWS secret access keys
  /sk-[A-Za-z0-9]{20,}/gi, // OpenAI API keys
  /sk-ant-[A-Za-z0-9_-]+/gi, // Anthropic API keys
  /xoxb-[A-Za-z0-9-]+/gi, // Slack bot tokens
  /xoxp-[A-Za-z0-9-]+/gi, // Slack user tokens
];

/**
 * Scrubs credentials from a string, replacing them with [REDACTED].
 */
export function scrubCredentials(message: string): string {
  let scrubbed = message;
  for (const pattern of CREDENTIAL_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]');
  }
  return scrubbed;
}
