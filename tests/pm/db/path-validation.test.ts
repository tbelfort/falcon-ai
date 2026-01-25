import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  hasTraversalSegments,
  isWindowsUncPath,
  isSystemDirectory,
  normalizeForComparison,
  isWithinDir,
  resolvePathForValidation,
  SYSTEM_DIRS_POSIX,
} from '../../../src/pm/db/path-validation.js';

describe('path-validation', () => {
  describe('hasTraversalSegments', () => {
    it('detects .. in path segments', () => {
      expect(hasTraversalSegments('../etc/passwd')).toBe(true);
      expect(hasTraversalSegments('foo/../bar')).toBe(true);
      expect(hasTraversalSegments('foo/bar/..')).toBe(true);
      expect(hasTraversalSegments('/home/user/../root')).toBe(true);
    });

    it('detects .. with Windows separators', () => {
      expect(hasTraversalSegments('..\\Windows\\System32')).toBe(true);
      expect(hasTraversalSegments('foo\\..\\bar')).toBe(true);
    });

    it('allows safe paths', () => {
      expect(hasTraversalSegments('/home/user/.falcon')).toBe(false);
      expect(hasTraversalSegments('/var/data/app')).toBe(false);
      expect(hasTraversalSegments('C:\\Users\\test')).toBe(false);
    });

    it('allows .. in filenames (not as segment)', () => {
      expect(hasTraversalSegments('/home/user/file..txt')).toBe(false);
      expect(hasTraversalSegments('/home/..hidden/file')).toBe(false);
    });
  });

  describe('isWindowsUncPath', () => {
    it('detects UNC paths with backslashes', () => {
      expect(isWindowsUncPath('\\\\server\\share')).toBe(true);
      expect(isWindowsUncPath('\\\\192.168.1.1\\data')).toBe(true);
    });

    it('detects UNC paths with forward slashes', () => {
      expect(isWindowsUncPath('//server/share')).toBe(true);
      expect(isWindowsUncPath('//nas/backup')).toBe(true);
    });

    it('allows local paths', () => {
      expect(isWindowsUncPath('C:\\Users\\test')).toBe(false);
      expect(isWindowsUncPath('/home/user')).toBe(false);
      expect(isWindowsUncPath('./relative')).toBe(false);
    });
  });

  describe('normalizeForComparison', () => {
    it('returns resolved path for case-sensitive comparison', () => {
      const result = normalizeForComparison('/home/User', false);
      expect(result).toContain('User');
    });

    it('lowercases for case-insensitive comparison', () => {
      const result = normalizeForComparison('/home/User', true);
      expect(result).toBe(result.toLowerCase());
    });
  });

  describe('isWithinDir', () => {
    it('returns true when target equals parent', () => {
      expect(isWithinDir('/home/user', '/home/user')).toBe(true);
    });

    it('returns true when target is inside parent', () => {
      expect(isWithinDir('/home/user/subdir', '/home/user')).toBe(true);
      expect(isWithinDir('/home/user/a/b/c', '/home/user')).toBe(true);
    });

    it('returns false when target is outside parent', () => {
      expect(isWithinDir('/home/other', '/home/user')).toBe(false);
      expect(isWithinDir('/var/data', '/home/user')).toBe(false);
    });

    it('returns false for sibling directories', () => {
      expect(isWithinDir('/home/user2', '/home/user')).toBe(false);
    });

    it('handles case-insensitive comparison', () => {
      expect(isWithinDir('/HOME/USER/sub', '/home/user', true)).toBe(true);
      expect(isWithinDir('/HOME/USER/sub', '/home/user', false)).toBe(false);
    });
  });

  describe('isSystemDirectory', () => {
    it('blocks POSIX system directories', () => {
      for (const dir of SYSTEM_DIRS_POSIX) {
        if (process.platform !== 'win32') {
          expect(isSystemDirectory(dir)).toBe(true);
        }
      }
    });

    it('blocks paths within system directories', () => {
      if (process.platform !== 'win32') {
        expect(isSystemDirectory('/usr/local/bin')).toBe(true);
        expect(isSystemDirectory('/etc/passwd')).toBe(true);
        expect(isSystemDirectory('/var/log/app')).toBe(true);
      }
    });

    it('blocks filesystem root', () => {
      expect(isSystemDirectory('/')).toBe(true);
    });

    it('allows home directory paths', () => {
      const homePath = process.env.HOME || '/home/testuser';
      expect(isSystemDirectory(homePath)).toBe(false);
      expect(isSystemDirectory(`${homePath}/.falcon`)).toBe(false);
    });

    it('allows standard user data locations', () => {
      if (process.platform !== 'win32') {
        expect(isSystemDirectory('/home/user/.falcon')).toBe(false);
        expect(isSystemDirectory('/Users/dev/Projects')).toBe(false);
      }
    });
  });

  describe('resolvePathForValidation', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-validation-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('resolves existing directory to itself', () => {
      const result = resolvePathForValidation(tempDir);
      expect(result).toBe(fs.realpathSync(tempDir));
    });

    it('resolves symlink to its target', () => {
      if (process.platform === 'win32') return; // Symlinks require admin on Windows

      const realDir = path.join(tempDir, 'real');
      const linkPath = path.join(tempDir, 'link');
      fs.mkdirSync(realDir);
      fs.symlinkSync(realDir, linkPath);

      const result = resolvePathForValidation(linkPath);
      expect(result).toBe(fs.realpathSync(realDir));
    });

    it('resolves nested symlinks', () => {
      if (process.platform === 'win32') return;

      const realDir = path.join(tempDir, 'real');
      const link1 = path.join(tempDir, 'link1');
      const link2 = path.join(tempDir, 'link2');
      fs.mkdirSync(realDir);
      fs.symlinkSync(realDir, link1);
      fs.symlinkSync(link1, link2);

      const result = resolvePathForValidation(link2);
      expect(result).toBe(fs.realpathSync(realDir));
    });

    it('handles non-existent file in existing directory', () => {
      const nonExistent = path.join(tempDir, 'does-not-exist.db');
      const result = resolvePathForValidation(nonExistent);
      // Should resolve parent and append filename
      expect(result).toBe(path.join(fs.realpathSync(tempDir), 'does-not-exist.db'));
    });

    it('handles deeply nested non-existent path', () => {
      const deepPath = path.join(tempDir, 'a', 'b', 'c', 'file.db');
      const result = resolvePathForValidation(deepPath);
      // Should resolve tempDir and append the rest
      expect(result).toBe(path.join(fs.realpathSync(tempDir), 'a', 'b', 'c', 'file.db'));
    });

    it('resolves symlink in parent path for non-existent file', () => {
      if (process.platform === 'win32') return;

      const realDir = path.join(tempDir, 'real');
      const linkPath = path.join(tempDir, 'link');
      fs.mkdirSync(realDir);
      fs.symlinkSync(realDir, linkPath);

      // Path through symlink to non-existent file
      const throughLink = path.join(linkPath, 'nonexistent.db');
      const result = resolvePathForValidation(throughLink);

      // Should resolve symlink and append filename
      expect(result).toBe(path.join(fs.realpathSync(realDir), 'nonexistent.db'));
    });

    it('detects symlink pointing to system directory', () => {
      if (process.platform === 'win32') return;

      // Use /usr which is a real directory on all Unix systems
      // (unlike /etc which is a symlink to /private/etc on macOS)
      const linkToUsr = path.join(tempDir, 'usr-link');
      fs.symlinkSync('/usr', linkToUsr);

      const resolved = resolvePathForValidation(linkToUsr);
      expect(isSystemDirectory(resolved)).toBe(true);
    });

    it('throws ENOTDIR when path goes through a file', () => {
      // Create a file and try to resolve a path "through" it
      const filePath = path.join(tempDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');

      // Path that treats the file as a directory - should throw ENOTDIR
      const throughFile = path.join(filePath, 'subdir', 'file.db');
      expect(() => resolvePathForValidation(throughFile)).toThrow('ENOTDIR');
    });
  });
});
