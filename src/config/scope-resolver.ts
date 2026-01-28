/**
 * Runtime scope resolution.
 *
 * Resolves the current workspace and project context using:
 * 1. .falcon/config.yaml (authoritative)
 * 2. Environment variables (for CI)
 * 3. Git remote origin URL lookup (or local path identifier)
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import path from 'path';
import { findConfigPath, loadConfig } from './loader.js';
import { canonicalizeGitUrl } from './url-utils.js';
import { getDatabase } from '../guardrail/storage/db.js';

export type ScopeResolutionReason = 'no_config' | 'no_remote' | 'not_registered';

/**
 * Error thrown when scope resolution fails.
 */
export class ScopeResolutionError extends Error {
  constructor(
    message: string,
    public readonly reason: ScopeResolutionReason
  ) {
    super(message);
    this.name = 'ScopeResolutionError';
  }
}

/**
 * Resolved scope containing workspace and project IDs.
 */
export interface ResolvedScope {
  workspaceId: string;
  projectId: string;
}

/**
 * Resolve scope following the policy in Section 1.9 of the main spec:
 * 1. Check .falcon/config.yaml (authoritative)
 * 2. Check environment variables (for CI)
 * 3. Lookup by git remote origin URL
 *
 * @returns Resolved scope with workspace and project IDs
 * @throws ScopeResolutionError if scope cannot be resolved
 */
export function resolveScope(): ResolvedScope {
  // STEP 1: Check for config file
  const configPath = findConfigPath();
  if (configPath) {
    const config = loadConfig(configPath);
    return {
      workspaceId: config.workspaceId,
      projectId: config.projectId,
    };
  }

  // STEP 2: Check environment variables
  const envWorkspaceId = process.env.FALCON_WORKSPACE_ID;
  const envProjectId = process.env.FALCON_PROJECT_ID;
  if (envWorkspaceId && envProjectId) {
    return {
      workspaceId: envWorkspaceId,
      projectId: envProjectId,
    };
  }

  // STEP 3: Lookup by git remote or local path identifier
  let canonicalUrl: string;
  let repoOriginUrl: string | null = null;

  try {
    repoOriginUrl = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    canonicalUrl = canonicalizeGitUrl(repoOriginUrl);
  } catch {
    // No remote - try local path identifier
    const gitRoot = getGitRoot();
    if (!gitRoot) {
      throw new ScopeResolutionError(
        'No .falcon/config.yaml found and not in a git repository.',
        'no_remote'
      );
    }
    const pathHash = createHash('sha256').update(gitRoot).digest('hex').slice(0, 16);
    canonicalUrl = `local:${pathHash}`;
  }

  const repoSubdir = getRepoSubdir();

  const db = getDatabase();
  const project = db
    .prepare(
      `
    SELECT * FROM projects
    WHERE repo_origin_url = ?
      AND (repo_subdir = ? OR (repo_subdir IS NULL AND ? IS NULL))
      AND status = ?
  `
    )
    .get(canonicalUrl, repoSubdir, repoSubdir, 'active') as
    | { workspace_id: string; id: string }
    | undefined;

  if (!project) {
    throw new ScopeResolutionError(
      'Repository not registered. Run "falcon init" to initialize.',
      'not_registered'
    );
  }

  return {
    workspaceId: project.workspace_id,
    projectId: project.id,
  };
}

/**
 * Get the git repository root directory.
 *
 * @returns Absolute path to git root, or null if not in a repo
 */
function getGitRoot(): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Get the subdirectory within the git repo, if any.
 *
 * @returns Subdirectory path relative to git root, or null if at root
 */
function getRepoSubdir(): string | null {
  const gitRoot = getGitRoot();
  if (!gitRoot) return null;
  const cwd = process.cwd();
  if (cwd === gitRoot) return null;
  return path.relative(gitRoot, cwd) || null;
}
