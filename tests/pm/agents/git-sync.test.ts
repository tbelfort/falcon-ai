import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import simpleGit from 'simple-git';
import {
  checkoutIssueBranch,
  cloneAgentRepository,
} from '../../../src/pm/agents/git-sync.js';
import { getAgentWorktreePath } from '../../../src/pm/agents/fs-layout.js';

async function createLocalRepo(repoPath: string): Promise<void> {
  fs.mkdirSync(repoPath, { recursive: true });
  const git = simpleGit(repoPath);
  await git.init(['-b', 'main']);
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('user.email', 'test@example.com');
  fs.writeFileSync(path.join(repoPath, 'README.md'), 'hello');
  await git.add(['README.md']);
  await git.commit('initial');
}

describe('git-sync', () => {
  let tempDir: string;
  let falconHome: string;
  let repoPath: string;
  const projectSlug = 'test-project';
  const agentName = 'agent-1';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-git-sync-'));
    falconHome = path.join(tempDir, 'falcon-home');
    repoPath = path.join(tempDir, 'remote-repo');
    await createLocalRepo(repoPath);

    await cloneAgentRepository({
      falconHome,
      projectSlug,
      agentName,
      repoUrl: repoPath,
      baseBranch: 'main',
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a new issue branch when missing', async () => {
    const result = await checkoutIssueBranch({
      falconHome,
      projectSlug,
      agentName,
      issueBranch: 'issue/123',
      baseBranch: 'main',
    });

    expect(result.created).toBe(true);
    const git = simpleGit(result.worktreePath);
    const branch = await git.branchLocal();
    expect(branch.current).toBe('issue/123');
  });

  it('switches to existing issue branch when present', async () => {
    const agentPath = getAgentWorktreePath(falconHome, projectSlug, agentName);
    const git = simpleGit(agentPath);

    await checkoutIssueBranch({
      falconHome,
      projectSlug,
      agentName,
      issueBranch: 'issue/456',
      baseBranch: 'main',
    });

    await git.checkout('main');

    const result = await checkoutIssueBranch({
      falconHome,
      projectSlug,
      agentName,
      issueBranch: 'issue/456',
      baseBranch: 'main',
    });

    expect(result.created).toBe(false);
    const branch = await git.branchLocal();
    expect(branch.current).toBe('issue/456');
  });
});
