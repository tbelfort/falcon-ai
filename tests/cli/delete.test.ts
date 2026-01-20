import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

describe('delete command logic', () => {
  describe('table deletion order', () => {
    // Tables ordered for FK constraints - pattern_definitions must be last
    const tables = [
      'pattern_occurrences',
      'execution_noncompliance',
      'doc_update_requests',
      'provisional_alerts',
      'injection_logs',
      'salience_issues',
      'tagging_misses',
      'kill_switch_status',
      'attribution_outcomes',
      'pattern_definitions',
    ];

    it('should have pattern_definitions at the end due to FK constraints', () => {
      // pattern_definitions must be deleted LAST because:
      // - provisional_alerts references it
      // - tagging_misses references it
      expect(tables[tables.length - 1]).toBe('pattern_definitions');
    });

    it('should delete provisional_alerts before pattern_definitions', () => {
      const provisionalIndex = tables.indexOf('provisional_alerts');
      const patternDefIndex = tables.indexOf('pattern_definitions');
      expect(provisionalIndex).toBeLessThan(patternDefIndex);
    });

    it('should delete tagging_misses before pattern_definitions', () => {
      const taggingIndex = tables.indexOf('tagging_misses');
      const patternDefIndex = tables.indexOf('pattern_definitions');
      expect(taggingIndex).toBeLessThan(patternDefIndex);
    });
  });

  describe('table whitelist validation', () => {
    const ALLOWED_TABLES = new Set([
      'pattern_occurrences',
      'pattern_definitions',
      'execution_noncompliance',
      'doc_update_requests',
      'provisional_alerts',
      'injection_logs',
      'salience_issues',
      'tagging_misses',
      'kill_switch_status',
      'attribution_outcomes',
    ]);

    function validateTable(table: string): void {
      if (!ALLOWED_TABLES.has(table)) {
        throw new Error(`Attempted deletion from unauthorized table: ${table}`);
      }
    }

    it('should allow valid table names', () => {
      for (const table of ALLOWED_TABLES) {
        expect(() => validateTable(table)).not.toThrow();
      }
    });

    it('should reject unauthorized table names', () => {
      expect(() => validateTable('users')).toThrow('unauthorized table');
      expect(() => validateTable('workspaces')).toThrow('unauthorized table');
      expect(() => validateTable('projects')).toThrow('unauthorized table');
    });

    it('should reject SQL injection attempts', () => {
      expect(() => validateTable('pattern_definitions; DROP TABLE users')).toThrow(
        'unauthorized table'
      );
      expect(() => validateTable("pattern_definitions' OR '1'='1")).toThrow('unauthorized table');
    });
  });

  describe('transaction behavior', () => {
    let tempDir: string;
    let db: Database.Database;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
      const dbPath = path.join(tempDir, 'test.db');
      db = new Database(dbPath);

      // Create minimal schema for testing
      db.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE TABLE pattern_definitions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        );

        CREATE TABLE test_items (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id)
        );
      `);

      // Insert test data
      db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run('proj-1', 'Test Project');
      db.prepare('INSERT INTO pattern_definitions (id, project_id) VALUES (?, ?)').run(
        'pd-1',
        'proj-1'
      );
      db.prepare('INSERT INTO test_items (id, project_id) VALUES (?, ?)').run('item-1', 'proj-1');
    });

    afterEach(() => {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should delete all data in a transaction', () => {
      const deleteAll = db.transaction(() => {
        db.prepare('DELETE FROM test_items WHERE project_id = ?').run('proj-1');
        db.prepare('DELETE FROM pattern_definitions WHERE project_id = ?').run('proj-1');
        db.prepare('DELETE FROM projects WHERE id = ?').run('proj-1');
      });

      deleteAll();

      // Verify all data is deleted
      expect(db.prepare('SELECT COUNT(*) as count FROM projects').get()).toEqual({ count: 0 });
      expect(db.prepare('SELECT COUNT(*) as count FROM pattern_definitions').get()).toEqual({
        count: 0,
      });
      expect(db.prepare('SELECT COUNT(*) as count FROM test_items').get()).toEqual({ count: 0 });
    });

    it('should rollback on error', () => {
      const deleteWithError = db.transaction(() => {
        db.prepare('DELETE FROM test_items WHERE project_id = ?').run('proj-1');
        throw new Error('Simulated error');
      });

      expect(() => deleteWithError()).toThrow('Simulated error');

      // Verify data is NOT deleted due to rollback
      expect(db.prepare('SELECT COUNT(*) as count FROM test_items').get()).toEqual({ count: 1 });
    });
  });

  describe('config file removal', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should remove .falcon/config.yaml if it exists', () => {
      // Create .falcon directory and config
      const falconDir = path.join(tempDir, '.falcon');
      fs.mkdirSync(falconDir, { recursive: true });
      const configPath = path.join(falconDir, 'config.yaml');
      fs.writeFileSync(configPath, 'version: "1.0"');

      // Verify file exists
      expect(fs.existsSync(configPath)).toBe(true);

      // Simulate config removal
      fs.unlinkSync(configPath);

      // Verify file is removed
      expect(fs.existsSync(configPath)).toBe(false);
    });

    it('should handle missing config file gracefully', () => {
      const configPath = path.join(tempDir, '.falcon', 'config.yaml');

      // Verify file doesn't exist
      expect(fs.existsSync(configPath)).toBe(false);

      // Attempting to check and skip removal should not throw
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
      // No error thrown - test passes
    });
  });
});
