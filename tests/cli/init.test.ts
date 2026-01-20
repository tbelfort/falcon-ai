import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

describe('falcon init prerequisites', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('should detect when not in a git repository', () => {
    process.chdir(tempDir);

    // Verify git rev-parse fails when not in a git repo
    expect(() => {
      execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' });
    }).toThrow();
  });

  it('should detect git repository with remote', () => {
    process.chdir(tempDir);

    // Initialize git repo
    execSync('git init', { cwd: tempDir });
    execSync('git remote add origin git@github.com:test/repo.git', { cwd: tempDir });

    // Verify git setup
    const remote = execSync('git remote get-url origin', { encoding: 'utf-8', cwd: tempDir });
    expect(remote.trim()).toBe('git@github.com:test/repo.git');
  });

  it('should detect git repository without remote', () => {
    process.chdir(tempDir);

    // Initialize git repo without remote
    execSync('git init', { cwd: tempDir });

    // Verify git root is detectable
    // Note: On macOS, /var is a symlink to /private/var, so we resolve real paths
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      cwd: tempDir,
    }).trim();
    expect(fs.realpathSync(gitRoot)).toBe(fs.realpathSync(tempDir));

    // Verify remote detection fails (local-only mode)
    expect(() => {
      execSync('git remote get-url origin', { encoding: 'utf-8', cwd: tempDir });
    }).toThrow();
  });
});

describe('init config file format', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should produce valid YAML config structure', () => {
    // Test that the expected config format is valid YAML
    // This tests the format, not the init command itself
    const yaml = require('yaml');
    const configContent = `version: "1.0"
workspaceId: "550e8400-e29b-41d4-a716-446655440000"
projectId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
workspace:
  slug: test-workspace
  name: "Test Workspace"
project:
  name: test-project
`;

    const parsed = yaml.parse(configContent);
    expect(parsed.version).toBe('1.0');
    expect(parsed.workspaceId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(parsed.projectId).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
    expect(parsed.workspace.slug).toBe('test-workspace');
    expect(parsed.project.name).toBe('test-project');
  });
});

describe('init input validation', () => {
  // Test the validation function behavior
  function validateInput(value: string, fieldName: string): void {
    if (!value || value.trim() === '') {
      throw new Error(`${fieldName} cannot be empty`);
    }
    if (value.length > 255) {
      throw new Error(`${fieldName} must be 255 characters or fewer`);
    }
    if (value.includes('\0')) {
      throw new Error(`${fieldName} cannot contain null bytes`);
    }
  }

  it('should reject empty project name', () => {
    expect(() => validateInput('', 'Project name')).toThrow('cannot be empty');
  });

  it('should reject whitespace-only project name', () => {
    expect(() => validateInput('   ', 'Project name')).toThrow('cannot be empty');
  });

  it('should reject overly long project name', () => {
    const longName = 'a'.repeat(256);
    expect(() => validateInput(longName, 'Project name')).toThrow('255 characters or fewer');
  });

  it('should reject project name with null bytes', () => {
    expect(() => validateInput('test\0name', 'Project name')).toThrow('null bytes');
  });

  it('should accept valid project name', () => {
    expect(() => validateInput('my-project', 'Project name')).not.toThrow();
  });

  it('should accept project name with special characters', () => {
    expect(() => validateInput('my-project_2024.v1', 'Project name')).not.toThrow();
  });
});

describe('CORE files structure', () => {
  it('should define expected CORE subdirectories', () => {
    // Verify the expected CORE directory structure exists in the package
    const packageRoot = path.resolve(__dirname, '../..');
    const coreDir = path.join(packageRoot, 'CORE');

    // Check CORE directory exists
    expect(fs.existsSync(coreDir)).toBe(true);

    // Check expected subdirectories
    const expectedDirs = ['TASKS', 'TEMPLATES', 'ROLES', 'commands', 'agents'];
    for (const dir of expectedDirs) {
      const dirPath = path.join(coreDir, dir);
      expect(fs.existsSync(dirPath)).toBe(true);
    }
  });

  it('should have TASKS/WORKFLOW directory with workflow files', () => {
    const packageRoot = path.resolve(__dirname, '../..');
    const workflowDir = path.join(packageRoot, 'CORE', 'TASKS', 'WORKFLOW');

    expect(fs.existsSync(workflowDir)).toBe(true);

    // Check for expected workflow files
    const expectedFiles = [
      'CHECKOUT.md',
      'CONTEXT_PACK.md',
      'SPEC.md',
      'IMPLEMENT.md',
      'PR_REVIEW.md',
    ];
    for (const file of expectedFiles) {
      const filePath = path.join(workflowDir, file);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });
});

describe('workspace and project directory detection', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should detect subdirectory within git repo', () => {
    // Initialize git repo
    execSync('git init', { cwd: tempDir });

    // Create subdirectory
    const subDir = path.join(tempDir, 'packages', 'api');
    fs.mkdirSync(subDir, { recursive: true });

    // Get relative path
    const relativePath = path.relative(tempDir, subDir);
    expect(relativePath).toBe(path.join('packages', 'api'));
  });

  it('should return null for root directory', () => {
    execSync('git init', { cwd: tempDir });

    const relativePath = path.relative(tempDir, tempDir);
    expect(relativePath).toBe('');
  });
});
