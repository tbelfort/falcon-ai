import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getFalconHome, getPmDbPath } from '../../../src/pm/db/paths.js';

describe('paths', () => {
  const originalEnv = process.env;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paths-test-'));
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getFalconHome', () => {
    it('returns default ~/.falcon when FALCON_HOME not set', () => {
      delete process.env.FALCON_HOME;
      const result = getFalconHome();
      expect(result).toBe(path.join(os.homedir(), '.falcon'));
    });

    it('returns validated FALCON_HOME when set to valid path', () => {
      const validPath = path.join(tempDir, 'falcon-home');
      fs.mkdirSync(validPath);
      process.env.FALCON_HOME = validPath;

      const result = getFalconHome();
      expect(result).toBe(fs.realpathSync(validPath));
    });

    it('trims whitespace from FALCON_HOME', () => {
      const validPath = path.join(tempDir, 'falcon-home');
      fs.mkdirSync(validPath);
      process.env.FALCON_HOME = `  ${validPath}  `;

      const result = getFalconHome();
      expect(result).toBe(fs.realpathSync(validPath));
    });

    it('rejects relative paths', () => {
      process.env.FALCON_HOME = './relative/path';
      expect(() => getFalconHome()).toThrow('must be an absolute path');
    });

    it('rejects paths with traversal segments', () => {
      process.env.FALCON_HOME = '/home/user/../root/.falcon';
      expect(() => getFalconHome()).toThrow('must not include ".."');
    });

    it('rejects paths into /usr', () => {
      if (process.platform === 'win32') return;
      // /usr is a real directory on all Unix systems (not a symlink like /etc on macOS)
      process.env.FALCON_HOME = '/usr/local/falcon';
      expect(() => getFalconHome()).toThrow('must not be a system directory');
    });

    it('rejects filesystem root', () => {
      process.env.FALCON_HOME = '/';
      expect(() => getFalconHome()).toThrow('must not be a system directory');
    });

    it('resolves symlinks before validation', () => {
      if (process.platform === 'win32') return;

      // Create a symlink to /usr and verify it's rejected
      // /usr is a real directory on all Unix systems (not a symlink like /etc on macOS)
      const linkToUsr = path.join(tempDir, 'link-to-usr');
      fs.symlinkSync('/usr', linkToUsr);
      process.env.FALCON_HOME = linkToUsr;

      expect(() => getFalconHome()).toThrow('must not be a system directory');
    });

    it('allows symlink to valid location', () => {
      if (process.platform === 'win32') return;

      const realDir = path.join(tempDir, 'real-falcon');
      const linkPath = path.join(tempDir, 'link-falcon');
      fs.mkdirSync(realDir);
      fs.symlinkSync(realDir, linkPath);
      process.env.FALCON_HOME = linkPath;

      const result = getFalconHome();
      expect(result).toBe(fs.realpathSync(realDir));
    });

    it('handles non-existent FALCON_HOME path', () => {
      const nonExistent = path.join(tempDir, 'does-not-exist');
      process.env.FALCON_HOME = nonExistent;

      // Should succeed - the path doesn't need to exist yet
      const result = getFalconHome();
      expect(result).toContain('does-not-exist');
    });
  });

  describe('getPmDbPath', () => {
    it('returns pm.db in FALCON_HOME', () => {
      const validPath = path.join(tempDir, 'falcon-home');
      fs.mkdirSync(validPath);
      process.env.FALCON_HOME = validPath;

      const result = getPmDbPath();
      expect(result).toBe(path.join(fs.realpathSync(validPath), 'pm.db'));
    });

    it('returns default path when FALCON_HOME not set', () => {
      delete process.env.FALCON_HOME;
      const result = getPmDbPath();
      expect(result).toBe(path.join(os.homedir(), '.falcon', 'pm.db'));
    });
  });
});
