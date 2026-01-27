import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import simpleGit from 'simple-git';
import {
  cloneAgentRepository,
  checkoutIssueBranch,
  commitAndPushAgentWork,
  getAgentStatus,
  syncIdleAgentToBase,
  pullRebase,
} from '../../../src/pm/agents/git-sync.js';
import { provisionAgent } from '../../../src/pm/agents/provisioner.js';
import {
  getProjectRoot,
  getAgentWorktreePath,
  getIssuePath,
} from '../../../src/pm/agents/fs-layout.js';

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

describe('security: credential scrubbing', () => {
  it('should export scrubCredentials for testing', async () => {
    // The scrubCredentials function is internal, but we can test via error messages
    // by triggering git errors with credentials in the URL
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-cred-test-'));
    const falconHome = path.join(tempDir, 'falcon');

    try {
      await cloneAgentRepository({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        // This URL will fail but should have credentials scrubbed in error
        repoUrl: 'https://user:ghp_secret123token@github.com/fake/repo.git',
        baseBranch: 'main',
      });
    } catch (error) {
      const message = (error as Error).message;
      // Credentials should be scrubbed
      expect(message).not.toContain('ghp_secret123token');
      expect(message).not.toContain('user:ghp');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('security: repo URL validation', () => {
  let tempDir: string;
  let falconHome: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-url-test-'));
    falconHome = path.join(tempDir, 'falcon');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should reject ext:: protocol URLs', async () => {
    await expect(
      cloneAgentRepository({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        repoUrl: 'ext::sh -c whoami% >&2',
        baseBranch: 'main',
      })
    ).rejects.toThrow('ext:: protocol is not allowed');
  });

  it('should reject file:// protocol URLs', async () => {
    await expect(
      cloneAgentRepository({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        repoUrl: 'file:///etc/passwd',
        baseBranch: 'main',
      })
    ).rejects.toThrow('file:// protocol is not allowed');
  });

  it('should accept https:// URLs', async () => {
    // This will fail for other reasons (repo doesn't exist), but URL validation should pass
    await expect(
      cloneAgentRepository({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        repoUrl: 'https://github.com/nonexistent/repo.git',
        baseBranch: 'main',
      })
    ).rejects.not.toThrow('protocol is not allowed');
  });

  it('should accept git@ SSH syntax', async () => {
    // This will fail for other reasons (can't connect), but URL validation should pass
    await expect(
      cloneAgentRepository({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        repoUrl: 'git@github.com:user/repo.git',
        baseBranch: 'main',
      })
    ).rejects.not.toThrow('protocol is not allowed');
  });
});

describe('security: git hooks protection', () => {
  let tempDir: string;
  let falconHome: string;
  let repoPath: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-hooks-test-'));
    falconHome = path.join(tempDir, 'falcon');
    repoPath = path.join(tempDir, 'remote-repo');
    await createLocalRepo(repoPath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should disable git hooks after clone', async () => {
    const { worktreePath } = await cloneAgentRepository({
      falconHome,
      projectSlug: 'test',
      agentName: 'agent-1',
      repoUrl: repoPath,
      baseBranch: 'main',
    });

    const git = simpleGit(worktreePath);
    const hooksPath = await git.getConfig('core.hooksPath');
    expect(hooksPath.value).toBe('/dev/null');
  });
});

describe('security: git config injection', () => {
  let tempDir: string;
  let falconHome: string;
  let repoPath: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-config-test-'));
    falconHome = path.join(tempDir, 'falcon');
    repoPath = path.join(tempDir, 'remote-repo');
    await createLocalRepo(repoPath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should reject git user.name with newlines', async () => {
    await expect(
      provisionAgent({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        repoUrl: repoPath,
        gitUserName: 'Attacker\n[core]\nhooksPath = /tmp/evil',
        gitUserEmail: 'test@example.com',
        enableSymlinks: false,
      })
    ).rejects.toThrow('cannot contain newlines or control characters');
  });

  it('should reject git user.email with newlines', async () => {
    await expect(
      provisionAgent({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        repoUrl: repoPath,
        gitUserName: 'Test User',
        gitUserEmail: 'test@example.com\n[core]\nhooksPath = /tmp/evil',
        enableSymlinks: false,
      })
    ).rejects.toThrow('cannot contain newlines or control characters');
  });

  it('should reject git user.name with null bytes', async () => {
    await expect(
      provisionAgent({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        repoUrl: repoPath,
        gitUserName: 'Test\0User',
        gitUserEmail: 'test@example.com',
        enableSymlinks: false,
      })
    ).rejects.toThrow('cannot contain newlines or control characters');
  });

  it('should reject empty git user.name', async () => {
    await expect(
      provisionAgent({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        repoUrl: repoPath,
        gitUserName: '',
        gitUserEmail: 'test@example.com',
        enableSymlinks: false,
      })
    ).rejects.toThrow('cannot be empty');
  });

  it('should reject whitespace-only git user.name', async () => {
    await expect(
      provisionAgent({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        repoUrl: repoPath,
        gitUserName: '   ',
        gitUserEmail: 'test@example.com',
        enableSymlinks: false,
      })
    ).rejects.toThrow('cannot be empty');
  });

  it('should reject empty git user.email', async () => {
    await expect(
      provisionAgent({
        falconHome,
        projectSlug: 'test',
        agentName: 'agent-1',
        repoUrl: repoPath,
        gitUserName: 'Test User',
        gitUserEmail: '',
        enableSymlinks: false,
      })
    ).rejects.toThrow('cannot be empty');
  });

  it('should accept valid git user.name and email', async () => {
    const result = await provisionAgent({
      falconHome,
      projectSlug: 'test',
      agentName: 'agent-1',
      repoUrl: repoPath,
      gitUserName: 'Test User',
      gitUserEmail: 'test@example.com',
      enableSymlinks: false,
    });

    expect(result.worktreePath).toBeDefined();

    const git = simpleGit(result.worktreePath);
    const name = await git.getConfig('user.name');
    const email = await git.getConfig('user.email');
    expect(name.value).toBe('Test User');
    expect(email.value).toBe('test@example.com');
  });
});

describe('security: flag injection in files array', () => {
  let tempDir: string;
  let falconHome: string;
  let repoPath: string;
  const projectSlug = 'test';
  const agentName = 'agent-1';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-flag-test-'));
    falconHome = path.join(tempDir, 'falcon');
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

  it('should reject files starting with dash (flag injection)', async () => {
    await expect(
      commitAndPushAgentWork({
        falconHome,
        projectSlug,
        agentName,
        message: 'test commit',
        files: ['--exec=malicious'],
      })
    ).rejects.toThrow('looks like a flag');
  });

  it('should allow -A flag explicitly', async () => {
    // This should not throw about flags (will succeed with nothing to commit)
    await expect(
      commitAndPushAgentWork({
        falconHome,
        projectSlug,
        agentName,
        message: 'test commit',
        files: ['-A'],
      })
    ).resolves.not.toThrow();
  });

  it('should reject other dash-prefixed values', async () => {
    await expect(
      commitAndPushAgentWork({
        falconHome,
        projectSlug,
        agentName,
        message: 'test commit',
        files: ['-n'],
      })
    ).rejects.toThrow('looks like a flag');
  });
});

describe('security: path traversal validation', () => {
  it('should reject projectSlug with path traversal', () => {
    expect(() => getProjectRoot('/home/user/.falcon', '../etc')).toThrow(
      'path traversal detected'
    );
  });

  it('should reject agentName with path traversal', () => {
    expect(() =>
      getAgentWorktreePath('/home/user/.falcon', 'project', '../../etc')
    ).toThrow('path traversal detected');
  });

  it('should reject issueId with path traversal', () => {
    expect(() =>
      getIssuePath('/home/user/.falcon', 'project', '../../../etc/passwd')
    ).toThrow('path traversal detected');
  });

  it('should reject empty projectSlug', () => {
    expect(() => getProjectRoot('/home/user/.falcon', '')).toThrow(
      'cannot be empty'
    );
  });

  it('should reject whitespace-only projectSlug', () => {
    expect(() => getProjectRoot('/home/user/.falcon', '   ')).toThrow(
      'cannot be empty'
    );
  });
});

describe('security: falconHome validation', () => {
  it('should reject empty falconHome', () => {
    expect(() => getProjectRoot('', 'project')).toThrow('cannot be empty');
  });

  it('should reject relative falconHome path', () => {
    expect(() => getProjectRoot('relative/path', 'project')).toThrow(
      'must be an absolute path'
    );
  });

  it('should accept absolute falconHome path', () => {
    const result = getProjectRoot('/home/user/.falcon', 'project');
    expect(result).toBe('/home/user/.falcon/projects/project');
  });
});

describe('security: worktree existence checks', () => {
  let tempDir: string;
  let falconHome: string;
  const projectSlug = 'test';
  const agentName = 'nonexistent-agent';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-worktree-test-'));
    falconHome = path.join(tempDir, 'falcon');
    // Create the falcon home but NOT the agent worktree
    fs.mkdirSync(falconHome, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('checkoutIssueBranch should throw if worktree does not exist', async () => {
    await expect(
      checkoutIssueBranch({
        falconHome,
        projectSlug,
        agentName,
        issueBranch: 'issue/123',
      })
    ).rejects.toThrow('Agent worktree not found');
  });

  it('syncIdleAgentToBase should throw if worktree does not exist', async () => {
    await expect(
      syncIdleAgentToBase({
        falconHome,
        projectSlug,
        agentName,
      })
    ).rejects.toThrow('Agent worktree not found');
  });

  it('pullRebase should throw if worktree does not exist', async () => {
    await expect(
      pullRebase({
        falconHome,
        projectSlug,
        agentName,
        branch: 'main',
      })
    ).rejects.toThrow('Agent worktree not found');
  });

  it('getAgentStatus should throw if worktree does not exist', async () => {
    await expect(
      getAgentStatus({
        falconHome,
        projectSlug,
        agentName,
      })
    ).rejects.toThrow('Agent worktree not found');
  });

  it('commitAndPushAgentWork should throw if worktree does not exist', async () => {
    await expect(
      commitAndPushAgentWork({
        falconHome,
        projectSlug,
        agentName,
        message: 'test',
      })
    ).rejects.toThrow('Agent worktree not found');
  });
});

describe('security: dirty state checks', () => {
  let tempDir: string;
  let falconHome: string;
  let repoPath: string;
  const projectSlug = 'test';
  const agentName = 'agent-1';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-dirty-test-'));
    falconHome = path.join(tempDir, 'falcon');
    repoPath = path.join(tempDir, 'remote-repo');
    await createLocalRepo(repoPath);

    await cloneAgentRepository({
      falconHome,
      projectSlug,
      agentName,
      repoUrl: repoPath,
      baseBranch: 'main',
    });

    // Create uncommitted changes
    const agentPath = getAgentWorktreePath(falconHome, projectSlug, agentName);
    fs.writeFileSync(path.join(agentPath, 'dirty.txt'), 'uncommitted');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('checkoutIssueBranch should reject dirty worktree', async () => {
    await expect(
      checkoutIssueBranch({
        falconHome,
        projectSlug,
        agentName,
        issueBranch: 'issue/123',
      })
    ).rejects.toThrow('worktree has uncommitted changes');
  });

  it('syncIdleAgentToBase should reject dirty worktree', async () => {
    await expect(
      syncIdleAgentToBase({
        falconHome,
        projectSlug,
        agentName,
      })
    ).rejects.toThrow('worktree has uncommitted changes');
  });

  it('pullRebase should reject dirty worktree', async () => {
    await expect(
      pullRebase({
        falconHome,
        projectSlug,
        agentName,
        branch: 'main',
      })
    ).rejects.toThrow('worktree has uncommitted changes');
  });
});

describe('security: branch validation', () => {
  let tempDir: string;
  let falconHome: string;
  let repoPath: string;
  const projectSlug = 'test';
  const agentName = 'agent-1';

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-branch-test-'));
    falconHome = path.join(tempDir, 'falcon');
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

  it('pullRebase should reject non-existent branch', async () => {
    await expect(
      pullRebase({
        falconHome,
        projectSlug,
        agentName,
        branch: 'nonexistent-branch',
      })
    ).rejects.toThrow('does not exist locally');
  });
});
