import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, findConfigPath } from '../../src/config/loader.js';

describe('loadConfig', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  it('should load a valid config file', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    const config = {
      version: '1.0',
      workspaceId: '550e8400-e29b-41d4-a716-446655440000',
      projectId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      workspace: {
        slug: 'test-workspace',
        name: 'Test Workspace',
      },
      project: {
        name: 'test-project',
      },
    };

    fs.writeFileSync(
      configPath,
      `version: "1.0"
workspaceId: "550e8400-e29b-41d4-a716-446655440000"
projectId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
workspace:
  slug: test-workspace
  name: Test Workspace
project:
  name: test-project
`
    );

    const loaded = loadConfig(configPath);
    expect(loaded.version).toBe(config.version);
    expect(loaded.workspaceId).toBe(config.workspaceId);
    expect(loaded.projectId).toBe(config.projectId);
    expect(loaded.workspace?.slug).toBe(config.workspace.slug);
  });

  it('should throw if config file does not exist', () => {
    const configPath = path.join(tempDir, 'nonexistent.yaml');
    expect(() => loadConfig(configPath)).toThrow('Config file not found');
  });

  it('should throw if config has invalid UUIDs', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(
      configPath,
      `version: "1.0"
workspaceId: "not-a-uuid"
projectId: "also-not-a-uuid"
`
    );

    expect(() => loadConfig(configPath)).toThrow('Invalid config file');
  });

  it('should throw if required fields are missing', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(
      configPath,
      `version: "1.0"
workspaceId: "550e8400-e29b-41d4-a716-446655440000"
`
    );

    expect(() => loadConfig(configPath)).toThrow('Invalid config file');
  });

  it('should accept optional fields', () => {
    const configPath = path.join(tempDir, 'config.yaml');
    fs.writeFileSync(
      configPath,
      `version: "1.0"
workspaceId: "550e8400-e29b-41d4-a716-446655440000"
projectId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
linear:
  projectId: "PRJ-123"
  teamId: "TEAM-456"
settings:
  maxInjectedWarnings: 6
  crossProjectWarningsEnabled: false
`
    );

    const loaded = loadConfig(configPath);
    expect(loaded.linear?.projectId).toBe('PRJ-123');
    expect(loaded.linear?.teamId).toBe('TEAM-456');
    expect(loaded.settings?.maxInjectedWarnings).toBe(6);
    expect(loaded.settings?.crossProjectWarningsEnabled).toBe(false);
  });
});

describe('findConfigPath', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  it('should find config in current directory', () => {
    const falconDir = path.join(tempDir, '.falcon');
    fs.mkdirSync(falconDir);
    const configPath = path.join(falconDir, 'config.yaml');
    fs.writeFileSync(configPath, 'version: "1.0"');

    const found = findConfigPath(tempDir);
    expect(found).toBe(configPath);
  });

  it('should find config in parent directory', () => {
    const falconDir = path.join(tempDir, '.falcon');
    fs.mkdirSync(falconDir);
    const configPath = path.join(falconDir, 'config.yaml');
    fs.writeFileSync(configPath, 'version: "1.0"');

    const subDir = path.join(tempDir, 'subdir');
    fs.mkdirSync(subDir);

    const found = findConfigPath(subDir);
    expect(found).toBe(configPath);
  });

  it('should return null if config not found', () => {
    const found = findConfigPath(tempDir);
    expect(found).toBeNull();
  });
});
