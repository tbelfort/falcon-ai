import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getAgentWorktreePath,
  getIssuesRoot,
  getPrimaryPath,
  getProjectRoot,
} from './fs-layout.js';
import { cloneAgentRepository, createGit } from './git-sync.js';

export interface ProvisionAgentInput {
  falconHome: string;
  projectSlug: string;
  agentName: string;
  repoUrl: string;
  baseBranch?: string;
  gitUserName: string;
  gitUserEmail: string;
  enableSymlinks?: boolean;
}

async function ensureProjectLayout(
  falconHome: string,
  projectSlug: string
): Promise<void> {
  const projectRoot = getProjectRoot(falconHome, projectSlug);
  const primaryPath = getPrimaryPath(falconHome, projectSlug);
  const issuesPath = getIssuesRoot(falconHome, projectSlug);

  await fs.mkdir(projectRoot, { recursive: true, mode: 0o700 });
  await fs.mkdir(primaryPath, { recursive: true, mode: 0o700 });
  await fs.mkdir(issuesPath, { recursive: true, mode: 0o700 });
}

async function safeSymlink(target: string, linkPath: string): Promise<void> {
  try {
    await fs.stat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    return;
  }

  try {
    const stats = await fs.lstat(linkPath);
    // Only skip if it's actually a symlink; if it's a regular file/dir, continue
    if (stats.isSymbolicLink()) {
      return;
    }
    // Path exists but is not a symlink - don't overwrite
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      return;
    }
  }

  try {
    await fs.mkdir(path.dirname(linkPath), { recursive: true, mode: 0o700 });
    await fs.symlink(target, linkPath);
  } catch (error) {
    return;
  }
}

async function linkSharedResources(
  falconHome: string,
  projectSlug: string,
  worktreePath: string
): Promise<void> {
  const primaryPath = getPrimaryPath(falconHome, projectSlug);
  await safeSymlink(
    path.join(primaryPath, 'node_modules'),
    path.join(worktreePath, 'node_modules')
  );
  await safeSymlink(
    path.join(primaryPath, '.falcon', 'CORE'),
    path.join(worktreePath, '.falcon', 'CORE')
  );
}

export async function provisionAgent(
  input: ProvisionAgentInput
): Promise<{ worktreePath: string }> {
  const {
    falconHome,
    projectSlug,
    agentName,
    repoUrl,
    gitUserName,
    gitUserEmail,
  } = input;
  const baseBranch = input.baseBranch ?? 'main';
  const enableSymlinks = input.enableSymlinks ?? true;

  await ensureProjectLayout(falconHome, projectSlug);

  const { worktreePath } = await cloneAgentRepository({
    falconHome,
    projectSlug,
    agentName,
    repoUrl,
    baseBranch,
  });

  const git = createGit(worktreePath);
  await git.addConfig('user.name', gitUserName);
  await git.addConfig('user.email', gitUserEmail);

  if (enableSymlinks) {
    await linkSharedResources(falconHome, projectSlug, worktreePath);
  }

  return { worktreePath: getAgentWorktreePath(falconHome, projectSlug, agentName) };
}
