import { describe, it, expect } from 'vitest';
import {
  hasTraversalSegments,
  isWindowsUncPath,
  isSystemDirectory,
  normalizeForComparison,
  isWithinDir,
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
});
