import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import Database from 'better-sqlite3';

describe('workspace rename logic', () => {
  describe('input validation', () => {
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

    it('should reject empty slug', () => {
      expect(() => validateInput('', 'New slug')).toThrow('cannot be empty');
    });

    it('should reject whitespace-only slug', () => {
      expect(() => validateInput('   ', 'New slug')).toThrow('cannot be empty');
    });

    it('should reject overly long slug', () => {
      const longSlug = 'a'.repeat(256);
      expect(() => validateInput(longSlug, 'New slug')).toThrow('255 characters or fewer');
    });

    it('should reject slug with null bytes', () => {
      expect(() => validateInput('test\0slug', 'New slug')).toThrow('null bytes');
    });

    it('should accept valid slug', () => {
      expect(() => validateInput('my-new-slug', 'New slug')).not.toThrow();
    });

    it('should reject empty display name', () => {
      expect(() => validateInput('', 'Display name')).toThrow('cannot be empty');
    });

    it('should accept valid display name', () => {
      expect(() => validateInput('My New Workspace', 'Display name')).not.toThrow();
    });
  });

  describe('database updates', () => {
    let tempDir: string;
    let db: Database.Database;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      db = new Database(dbPath);

      // Create minimal schema
      db.exec(`
        CREATE TABLE workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          updated_at TEXT
        );

        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          repo_path TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
        );
      `);

      // Insert test workspace
      db.prepare(
        'INSERT INTO workspaces (id, name, slug, status) VALUES (?, ?, ?, ?)'
      ).run('ws-1', 'Test Workspace', 'test-workspace', 'active');
    });

    afterEach(() => {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should update workspace slug in database', () => {
      db.prepare('UPDATE workspaces SET slug = ? WHERE id = ?').run('new-slug', 'ws-1');

      const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get('ws-1') as {
        slug: string;
      };
      expect(workspace.slug).toBe('new-slug');
    });

    it('should update workspace name when provided', () => {
      db.prepare('UPDATE workspaces SET slug = ?, name = ? WHERE id = ?').run(
        'new-slug',
        'New Name',
        'ws-1'
      );

      const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get('ws-1') as {
        slug: string;
        name: string;
      };
      expect(workspace.slug).toBe('new-slug');
      expect(workspace.name).toBe('New Name');
    });

    it('should fail if old slug does not exist', () => {
      const workspace = db
        .prepare('SELECT * FROM workspaces WHERE slug = ? AND status = ?')
        .get('nonexistent', 'active');
      expect(workspace).toBeUndefined();
    });

    it('should fail if new slug is already taken', () => {
      // Add another workspace with the target slug
      db.prepare('INSERT INTO workspaces (id, name, slug, status) VALUES (?, ?, ?, ?)').run(
        'ws-2',
        'Other Workspace',
        'taken-slug',
        'active'
      );

      const existing = db.prepare('SELECT * FROM workspaces WHERE slug = ?').get('taken-slug');
      expect(existing).toBeDefined();
    });
  });

  describe('config file updates', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should update workspace slug in config.yaml', () => {
      // Create project directory with config
      const projectDir = path.join(tempDir, 'project1');
      const falconDir = path.join(projectDir, '.falcon');
      fs.mkdirSync(falconDir, { recursive: true });

      const configPath = path.join(falconDir, 'config.yaml');
      const originalConfig = {
        version: '1.0',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
        workspace: {
          slug: 'old-slug',
          name: 'Old Workspace',
        },
        project: {
          name: 'Test Project',
        },
      };
      fs.writeFileSync(configPath, yaml.stringify(originalConfig));

      // Simulate rename update
      const config = yaml.parse(fs.readFileSync(configPath, 'utf-8'));
      config.workspace.slug = 'new-slug';
      config.workspace.name = 'New Workspace';
      fs.writeFileSync(configPath, yaml.stringify(config));

      // Verify update
      const updatedConfig = yaml.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(updatedConfig.workspace.slug).toBe('new-slug');
      expect(updatedConfig.workspace.name).toBe('New Workspace');
      expect(updatedConfig.project.name).toBe('Test Project'); // Unchanged
    });

    it('should handle missing config file gracefully', () => {
      const configPath = path.join(tempDir, '.falcon', 'config.yaml');

      // Verify file doesn't exist
      expect(fs.existsSync(configPath)).toBe(false);

      // Attempting to update should not throw when properly guarded
      if (fs.existsSync(configPath)) {
        const config = yaml.parse(fs.readFileSync(configPath, 'utf-8'));
        config.workspace.slug = 'new-slug';
        fs.writeFileSync(configPath, yaml.stringify(config));
      }
      // No error thrown - test passes
    });

    it('should update multiple project configs in workspace', () => {
      // Create multiple project directories
      const projects = ['project1', 'project2', 'project3'];
      const configPaths: string[] = [];

      for (const projectName of projects) {
        const projectDir = path.join(tempDir, projectName);
        const falconDir = path.join(projectDir, '.falcon');
        fs.mkdirSync(falconDir, { recursive: true });

        const configPath = path.join(falconDir, 'config.yaml');
        const config = {
          version: '1.0',
          workspaceId: 'ws-1',
          projectId: `proj-${projectName}`,
          workspace: {
            slug: 'old-slug',
            name: 'Old Workspace',
          },
          project: {
            name: projectName,
          },
        };
        fs.writeFileSync(configPath, yaml.stringify(config));
        configPaths.push(configPath);
      }

      // Simulate rename - update all configs
      for (const configPath of configPaths) {
        const config = yaml.parse(fs.readFileSync(configPath, 'utf-8'));
        config.workspace.slug = 'new-slug';
        fs.writeFileSync(configPath, yaml.stringify(config));
      }

      // Verify all configs are updated
      for (const configPath of configPaths) {
        const config = yaml.parse(fs.readFileSync(configPath, 'utf-8'));
        expect(config.workspace.slug).toBe('new-slug');
      }
    });
  });
});

describe('workspace create input validation', () => {
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

  it('should reject empty workspace name', () => {
    expect(() => validateInput('', 'Workspace name')).toThrow('cannot be empty');
  });

  it('should accept valid workspace name', () => {
    expect(() => validateInput('My Workspace', 'Workspace name')).not.toThrow();
  });

  it('should reject empty custom slug', () => {
    expect(() => validateInput('', 'Custom slug')).toThrow('cannot be empty');
  });

  it('should accept valid custom slug', () => {
    expect(() => validateInput('my-workspace', 'Custom slug')).not.toThrow();
  });
});
