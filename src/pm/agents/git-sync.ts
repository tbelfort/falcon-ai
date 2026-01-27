import fs from 'node:fs/promises';
import path from 'node:path';
import { simpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git';
import {
  getAgentWorktreePath,
  getAgentsRoot,
  getProjectRoot,
} from './fs-layout.js';

const defaultOptions: Partial<SimpleGitOptions> = {
  maxConcurrentProcesses: 6,
  trimmed: true,
  timeout: {
    block: 300000, // 5 minutes
  },
};

const CREDENTIAL_PATTERNS = [
  /https?:\/\/[^:]+:[^@]+@/gi, // URLs with embedded credentials
  /ghp_[A-Za-z0-9_]+/gi, // GitHub PAT tokens
  /github_pat_[A-Za-z0-9_]+/gi, // GitHub fine-grained PAT
  /gho_[A-Za-z0-9_]+/gi, // GitHub OAuth tokens
  /Bearer\s+[A-Za-z0-9._-]+/gi, // Bearer tokens
];

function scrubCredentials(message: string): string {
  let scrubbed = message;
  for (const pattern of CREDENTIAL_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]');
  }
  return scrubbed;
}

function wrapGitError(error: unknown): Error {
  if (error instanceof Error) {
    const scrubbed = scrubCredentials(error.message);
    if (scrubbed !== error.message) {
      const newError = new Error(scrubbed);
      newError.stack = error.stack ? scrubCredentials(error.stack) : undefined;
      return newError;
    }
  }
  return error instanceof Error ? error : new Error(String(error));
}

export interface AgentGitContext {
  falconHome: string;
  projectSlug: string;
  agentName: string;
}

export interface CloneAgentInput extends AgentGitContext {
  repoUrl: string;
  baseBranch?: string;
}

export interface CheckoutIssueBranchInput extends AgentGitContext {
  issueBranch: string;
  baseBranch?: string;
}

export interface SyncBaseBranchInput extends AgentGitContext {
  baseBranch?: string;
}

export interface PullRebaseInput extends AgentGitContext {
  branch: string;
}

export interface CommitAndPushInput extends AgentGitContext {
  message: string;
  files?: string[];
  remote?: string;
  branch?: string;
}

export function createGit(workDir: string): SimpleGit {
  return simpleGit(workDir, defaultOptions);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function ensureAgentParentDirs(
  falconHome: string,
  projectSlug: string
): Promise<void> {
  const projectRoot = getProjectRoot(falconHome, projectSlug);
  const agentsRoot = getAgentsRoot(falconHome, projectSlug);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.mkdir(agentsRoot, { recursive: true });
}

async function isShallowRepository(git: SimpleGit): Promise<boolean> {
  const result = await git.raw(['rev-parse', '--is-shallow-repository']);
  return result.trim() === 'true';
}

export async function cloneAgentRepository(
  input: CloneAgentInput
): Promise<{ worktreePath: string }> {
  const { falconHome, projectSlug, agentName, repoUrl } = input;
  const baseBranch = input.baseBranch ?? 'main';
  const worktreePath = getAgentWorktreePath(
    falconHome,
    projectSlug,
    agentName
  );

  await ensureAgentParentDirs(falconHome, projectSlug);

  if (await pathExists(worktreePath)) {
    throw new Error(`Agent worktree already exists: ${worktreePath}`);
  }

  try {
    await simpleGit(undefined, defaultOptions).clone(repoUrl, worktreePath, [
      '--depth',
      '1',
      '--single-branch',
      '-b',
      baseBranch,
    ]);

    const git = createGit(worktreePath);
    if (await isShallowRepository(git)) {
      await git.fetch(['--unshallow']);
    }
  } catch (error) {
    // Clean up partial clone on failure
    try {
      await fs.rm(worktreePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw wrapGitError(error);
  }

  return { worktreePath };
}

export async function checkoutIssueBranch(
  input: CheckoutIssueBranchInput
): Promise<{ created: boolean; worktreePath: string }> {
  const { falconHome, projectSlug, agentName, issueBranch } = input;
  const baseBranch = input.baseBranch ?? 'main';
  const worktreePath = getAgentWorktreePath(
    falconHome,
    projectSlug,
    agentName
  );
  const git = createGit(worktreePath);

  try {
    // Check for uncommitted changes before any checkout
    const status = await git.status();
    if (!status.isClean()) {
      throw new Error(
        'Cannot checkout branch: worktree has uncommitted changes'
      );
    }

    const localBranches = await git.branchLocal();
    if (localBranches.all.includes(issueBranch)) {
      if (localBranches.current !== issueBranch) {
        await git.checkout(issueBranch);
      }
      return { created: false, worktreePath };
    }

    await git.fetch('origin', baseBranch);
    await git.checkout(baseBranch);
    await git.pull('origin', baseBranch);
    await git.checkoutLocalBranch(issueBranch);

    return { created: true, worktreePath };
  } catch (error) {
    throw wrapGitError(error);
  }
}

export async function syncIdleAgentToBase(
  input: SyncBaseBranchInput
): Promise<void> {
  const { falconHome, projectSlug, agentName } = input;
  const baseBranch = input.baseBranch ?? 'main';
  const worktreePath = getAgentWorktreePath(
    falconHome,
    projectSlug,
    agentName
  );
  const git = createGit(worktreePath);

  try {
    // Check for uncommitted changes before checkout
    const status = await git.status();
    if (!status.isClean()) {
      throw new Error(
        'Cannot sync to base: worktree has uncommitted changes'
      );
    }

    await git.fetch('origin', baseBranch);
    await git.checkout(baseBranch);
    await git.pull('origin', baseBranch);
  } catch (error) {
    throw wrapGitError(error);
  }
}

export async function pullRebase(
  input: PullRebaseInput
): Promise<void> {
  const { falconHome, projectSlug, agentName, branch } = input;
  const worktreePath = getAgentWorktreePath(
    falconHome,
    projectSlug,
    agentName
  );
  const git = createGit(worktreePath);

  try {
    await git.checkout(branch);
    await git.pull('origin', branch, { '--rebase': 'true' });
  } catch (error) {
    throw wrapGitError(error);
  }
}

export async function getAgentStatus(
  input: AgentGitContext
): Promise<Awaited<ReturnType<SimpleGit['status']>>> {
  const { falconHome, projectSlug, agentName } = input;
  const worktreePath = getAgentWorktreePath(
    falconHome,
    projectSlug,
    agentName
  );
  return createGit(worktreePath).status();
}

export async function commitAndPushAgentWork(
  input: CommitAndPushInput
): Promise<void> {
  const { falconHome, projectSlug, agentName, message } = input;
  const files = input.files ?? ['-A'];
  const remote = input.remote ?? 'origin';
  const worktreePath = getAgentWorktreePath(
    falconHome,
    projectSlug,
    agentName
  );
  const git = createGit(worktreePath);

  try {
    await git.add(files);
    await git.commit(message);

    if (input.branch) {
      await git.push(remote, input.branch);
    } else {
      await git.push(remote);
    }
  } catch (error) {
    throw wrapGitError(error);
  }
}

export function resolveAgentWorktreePath(
  falconHome: string,
  projectSlug: string,
  agentName: string
): string {
  return path.resolve(getAgentWorktreePath(falconHome, projectSlug, agentName));
}
