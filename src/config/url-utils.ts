/**
 * Git URL canonicalization utilities.
 *
 * Handles normalization of different git URL formats (SSH, HTTPS)
 * to a consistent canonical form for duplicate detection.
 */

/**
 * Canonicalize git URLs to a consistent format.
 *
 * Handles:
 * - SSH: git@github.com:org/repo.git
 * - HTTPS: https://github.com/org/repo.git
 * - Trailing slashes
 * - .git suffix normalization
 *
 * Output format: github.com/org/repo (no protocol, no .git)
 */
export function canonicalizeGitUrl(url: string): string {
  let normalized = url.trim();

  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');

  // Remove .git suffix
  normalized = normalized.replace(/\.git$/, '');

  // Convert SSH to canonical form
  // git@github.com:org/repo -> github.com/org/repo
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  // Convert HTTPS to canonical form
  // https://github.com/org/repo -> github.com/org/repo
  const httpsMatch = normalized.match(/^https?:\/\/([^/]+)\/(.+)$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  // Already canonical or unknown format - return as-is
  return normalized;
}

/**
 * Check if two git URLs refer to the same repository.
 */
export function gitUrlsEqual(url1: string, url2: string): boolean {
  return canonicalizeGitUrl(url1) === canonicalizeGitUrl(url2);
}
