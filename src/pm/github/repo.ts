export interface ParsedRepo {
  owner: string;
  repo: string;
}

export function parseRepoUrl(url: string): ParsedRepo {
  // Match HTTPS URLs - anchor to protocol and domain boundary
  const httpsMatch = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  // Match SSH URLs - anchor to git@ prefix
  const sshMatch = url.match(/^git@github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // Match short format (owner/repo) - but reject if owner contains ':'
  const shortMatch = url.match(/^([^/:]+)\/([^/]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  throw new Error(`Invalid GitHub repo URL: ${url}`);
}
