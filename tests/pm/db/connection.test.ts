import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getPmDb, openPmSqlite, closePmDb } from '../../../src/pm/db/connection.js';

describe('connection', () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-test-'));
    process.env = { ...originalEnv };
    // Ensure clean state
    closePmDb();
  });

  afterEach(() => {
    closePmDb();
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('openPmSqlite', () => {
    it('creates database file with correct permissions', () => {
      const dbPath = path.join(tempDir, 'test.db');
      const sqlite = openPmSqlite(dbPath);

      expect(fs.existsSync(dbPath)).toBe(true);

      if (process.platform !== 'win32') {
        const stats = fs.statSync(dbPath);
        const mode = stats.mode & 0o777;
        expect(mode).toBe(0o600);
      }

      sqlite.close();
    });

    it('creates parent directory with correct permissions', () => {
      const subDir = path.join(tempDir, 'subdir');
      const dbPath = path.join(subDir, 'test.db');
      const sqlite = openPmSqlite(dbPath);

      expect(fs.existsSync(subDir)).toBe(true);

      if (process.platform !== 'win32') {
        const stats = fs.statSync(subDir);
        const mode = stats.mode & 0o777;
        expect(mode).toBe(0o700);
      }

      sqlite.close();
    });

    it('applies WAL journal mode', () => {
      const dbPath = path.join(tempDir, 'test.db');
      const sqlite = openPmSqlite(dbPath);

      const journalMode = sqlite.pragma('journal_mode', { simple: true });
      expect(journalMode).toBe('wal');

      sqlite.close();
    });

    it('enables foreign keys', () => {
      const dbPath = path.join(tempDir, 'test.db');
      const sqlite = openPmSqlite(dbPath);

      const fkEnabled = sqlite.pragma('foreign_keys', { simple: true });
      expect(fkEnabled).toBe(1);

      sqlite.close();
    });

    it('sets synchronous to NORMAL', () => {
      const dbPath = path.join(tempDir, 'test.db');
      const sqlite = openPmSqlite(dbPath);

      const syncMode = sqlite.pragma('synchronous', { simple: true });
      expect(syncMode).toBe(1); // 1 = NORMAL

      sqlite.close();
    });

    it('returns cached connection for same path', () => {
      const dbPath = path.join(tempDir, 'test.db');
      const sqlite1 = openPmSqlite(dbPath);
      const sqlite2 = openPmSqlite(dbPath);

      expect(sqlite1).toBe(sqlite2);

      sqlite1.close();
    });

    it('creates new connection for different path', () => {
      const dbPath1 = path.join(tempDir, 'test1.db');
      const dbPath2 = path.join(tempDir, 'test2.db');

      const sqlite1 = openPmSqlite(dbPath1);
      closePmDb();

      const sqlite2 = openPmSqlite(dbPath2);

      expect(sqlite1).not.toBe(sqlite2);

      sqlite2.close();
    });

    it('handles :memory: database', () => {
      const sqlite = openPmSqlite(':memory:');

      expect(sqlite.open).toBe(true);
      // Verify pragmas are applied
      expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);

      sqlite.close();
    });
  });

  describe('getPmDb', () => {
    it('returns drizzle instance', () => {
      const dbPath = path.join(tempDir, 'test.db');
      const db = getPmDb(dbPath);

      // Verify it's a drizzle database by checking for query method
      expect(db).toBeDefined();
      expect(typeof db.select).toBe('function');
    });

    it('returns cached drizzle instance for same path', () => {
      const dbPath = path.join(tempDir, 'test.db');
      const db1 = getPmDb(dbPath);
      const db2 = getPmDb(dbPath);

      expect(db1).toBe(db2);
    });

    it('creates new drizzle instance for different path', () => {
      const dbPath1 = path.join(tempDir, 'test1.db');
      const dbPath2 = path.join(tempDir, 'test2.db');

      const db1 = getPmDb(dbPath1);
      closePmDb();

      const db2 = getPmDb(dbPath2);

      expect(db1).not.toBe(db2);
    });
  });

  describe('closePmDb', () => {
    it('closes cached connection', () => {
      const dbPath = path.join(tempDir, 'test.db');
      const sqlite = openPmSqlite(dbPath);

      expect(sqlite.open).toBe(true);

      closePmDb();

      expect(sqlite.open).toBe(false);
    });

    it('is idempotent - can be called multiple times', () => {
      const dbPath = path.join(tempDir, 'test.db');
      openPmSqlite(dbPath);

      // Should not throw
      closePmDb();
      closePmDb();
      closePmDb();
    });

    it('allows new connection after close', () => {
      const dbPath = path.join(tempDir, 'test.db');
      const sqlite1 = openPmSqlite(dbPath);
      closePmDb();

      const sqlite2 = openPmSqlite(dbPath);
      expect(sqlite2.open).toBe(true);
      expect(sqlite1).not.toBe(sqlite2);
    });
  });

  describe('permission handling', () => {
    it('fixes insecure directory permissions during setup', () => {
      if (process.platform === 'win32') return;

      // Create directory with insecure permissions
      const insecureDir = path.join(tempDir, 'insecure');
      fs.mkdirSync(insecureDir, { mode: 0o755 });
      const dbPath = path.join(insecureDir, 'test.db');

      // openPmSqlite should fix permissions and succeed
      const sqlite = openPmSqlite(dbPath);
      expect(sqlite.open).toBe(true);

      // Verify permissions were corrected to 0o700
      const stats = fs.statSync(insecureDir);
      expect(stats.mode & 0o777).toBe(0o700);

      sqlite.close();
    });

    it('creates new directory with secure permissions', () => {
      if (process.platform === 'win32') return;

      const newDir = path.join(tempDir, 'new-secure');
      const dbPath = path.join(newDir, 'test.db');

      const sqlite = openPmSqlite(dbPath);

      const stats = fs.statSync(newDir);
      expect(stats.mode & 0o777).toBe(0o700);

      sqlite.close();
    });
  });

  describe('existing database handling', () => {
    it('opens existing valid SQLite database', () => {
      const dbPath = path.join(tempDir, 'existing.db');

      // Create a valid SQLite database first
      const sqlite1 = openPmSqlite(dbPath);
      sqlite1.exec('CREATE TABLE test (id INTEGER PRIMARY KEY)');
      sqlite1.exec('INSERT INTO test VALUES (42)');
      closePmDb();

      // Reopen and verify data persists
      const sqlite2 = openPmSqlite(dbPath);
      const result = sqlite2.prepare('SELECT id FROM test').get() as { id: number };
      expect(result.id).toBe(42);

      sqlite2.close();
    });
  });
});
