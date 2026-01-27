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
  /ghs_[A-Za-z0-9_]+/gi, // GitHub App installation tokens
  /ghr_[A-Za-z0-9_]+/gi, // GitHub refresh tokens
  /glpat-[A-Za-z0-9_-]+/gi, // GitLab PAT tokens
  /Bearer\s+[A-Za-z0-9._-]+/gi, // Bearer tokens
  /AKIA[A-Z0-9]{16}/g, // AWS access key IDs
];

const ALLOWED_URL_PROTOCOLS = ['https:', 'http:', 'git:', 'ssh:'];

function validateRepoUrl(url: string): void {
  // Reject dangerous protocols that can execute commands
  if (url.startsWith('ext::')) {
    throw new Error('Invalid repository URL: ext:: protocol is not allowed');
  }
  if (url.startsWith('file://')) {
    throw new Error('Invalid repository URL: file:// protocol is not allowed');
  }

  // Check for allowed protocols
  const isAllowedProtocol = ALLOWED_URL_PROTOCOLS.some((p) => url.startsWith(p));
  // Allow git@ SSH syntax (e.g., git@github.com:user/repo.git)
  const isSshSyntax = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+:/.test(url);
  // Allow local absolute paths (for testing and local repos)
  const isLocalPath = url.startsWith('/') || /^[A-Za-z]:[\\/]/.test(url);

  if (!isAllowedProtocol && !isSshSyntax && !isLocalPath) {
    throw new Error(
      `Invalid repository URL: must use https, git, ssh protocol, git@ syntax, or local path`
    );
  }
}

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

async function assertWorktreeExists(worktreePath: string): Promise<void> {
  if (!(await pathExists(worktreePath))) {
    throw new Error(`Agent worktree not found: ${worktreePath}`);
  }
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

  // Validate repo URL to prevent command injection via ext:: protocol
  validateRepoUrl(repoUrl);

  await ensureAgentParentDirs(falconHome, projectSlug);

  if (await pathExists(worktreePath)) {
    throw new Error(`Agent worktree already exists: ${worktreePath}`);
  }

  try {
    // SECURITY: Disable git hooks DURING clone to prevent RCE from malicious repos.
    // The -c option applies the config before any hooks can execute.
    await simpleGit(undefined, defaultOptions).clone(repoUrl, worktreePath, [
      '-c',
      'core.hooksPath=/dev/null',
      '--depth',
      '1',
      '--single-branch',
      '-b',
      baseBranch,
    ]);

    const git = createGit(worktreePath);

    // Ensure hooks remain disabled (belt-and-suspenders)
    await git.addConfig('core.hooksPath', '/dev/null');

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

  await assertWorktreeExists(worktreePath);
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
      // Sync with remote to avoid stale branch (if remote branch exists)
      try {
        await git.fetch('origin', issueBranch);
        await git.pull('origin', issueBranch);
      } catch {
        // Branch may not exist on remote yet (local-only branch) - that's OK
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

  await assertWorktreeExists(worktreePath);
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

  await assertWorktreeExists(worktreePath);
  const git = createGit(worktreePath);

  try {
    // Check for uncommitted changes before checkout
    const status = await git.status();
    if (!status.isClean()) {
      throw new Error(
        'Cannot pull rebase: worktree has uncommitted changes'
      );
    }

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
  await assertWorktreeExists(worktreePath);
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

  await assertWorktreeExists(worktreePath);
  const git = createGit(worktreePath);

  try {
    // Validate files array to prevent flag injection
    for (const file of files) {
      if (file !== '-A' && file.startsWith('-')) {
        throw new Error(`Invalid file path: "${file}" looks like a flag`);
      }
    }

    await git.add(files);

    // Check if there are staged changes before committing
    const status = await git.status();
    if (status.staged.length === 0) {
      return; // Nothing to commit
    }

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
