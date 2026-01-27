import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import simpleGit from 'simple-git';
import { provisionAgent } from '../../../src/pm/agents/provisioner.js';
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

describe('provisioner', () => {
  let tempDir: string;
  let falconHome: string;
  let repoPath: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-provisioner-'));
    falconHome = path.join(tempDir, 'falcon-home');
    repoPath = path.join(tempDir, 'remote-repo');
    await createLocalRepo(repoPath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('clones repo and sets git config', async () => {
    const projectSlug = 'test-project';
    const agentName = 'agent-1';

    const result = await provisionAgent({
      falconHome,
      projectSlug,
      agentName,
      repoUrl: repoPath,
      baseBranch: 'main',
      gitUserName: 'Falcon Bot',
      gitUserEmail: 'bot@example.com',
      enableSymlinks: false,
    });

    const agentPath = getAgentWorktreePath(falconHome, projectSlug, agentName);
    expect(result.worktreePath).toBe(agentPath);
    expect(fs.existsSync(path.join(agentPath, '.git'))).toBe(true);

    const git = simpleGit(agentPath);
    const branch = await git.branchLocal();
    expect(branch.current).toBe('main');

    const nameConfig = await git.getConfig('user.name');
    const emailConfig = await git.getConfig('user.email');
    expect(nameConfig.value).toBe('Falcon Bot');
    expect(emailConfig.value).toBe('bot@example.com');
  });
});
