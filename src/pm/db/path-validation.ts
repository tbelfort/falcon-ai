/**
 * Shared path validation utilities for security-critical path checks.
 *
 * These functions validate that paths don't escape into system directories,
 * don't contain traversal segments, and resolve symlinks before validation
 * to prevent symlink-based bypasses.
 *
 * Used by both runtime code (paths.ts) and build tooling (drizzle.config.ts).
 */
import fs from 'node:fs';
import path from 'node:path';

/** OS-managed directories that should never contain user data. */
export const SYSTEM_DIRS_POSIX = [
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/lib64',
  '/proc',
  '/sbin',
  '/sys',
  '/usr',
  '/var',
  '/tmp',
  '/opt',
  '/System',
  '/Applications',
  '/Library',
] as const;

/** Detects ".." segments that could escape intended directories. */
export function hasTraversalSegments(value: string): boolean {
  const segments = value.split(/[\\/]+/).filter(Boolean);
  return segments.includes('..');
}

/** Detects Windows UNC paths (\\server\share or //server/share). */
export function isWindowsUncPath(value: string): boolean {
  return value.startsWith('\\\\') || value.startsWith('//');
}

/** Normalizes path for comparison, optionally case-insensitive for Windows. */
export function normalizeForComparison(value: string, caseInsensitive: boolean): string {
  const normalized = path.resolve(value);
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

/** Checks if targetPath is within or equal to parentPath. */
export function isWithinDir(
  targetPath: string,
  parentPath: string,
  caseInsensitive = false
): boolean {
  const target = normalizeForComparison(targetPath, caseInsensitive);
  const parent = normalizeForComparison(parentPath, caseInsensitive);
  const relative = path.relative(parent, target);
  if (relative === '') {
    return true;
  }
  return (
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

/**
 * Resolves symlinks in the path, handling non-existent trailing segments.
 * This prevents symlink-based bypasses of directory restrictions.
 */
export function resolvePathForValidation(targetPath: string): string {
  const absolute = path.resolve(targetPath);
  let current = absolute;
  let suffix = '';

  while (true) {
    try {
      const resolved = fs.realpathSync(current);
      return suffix ? path.join(resolved, suffix) : resolved;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return absolute;
      }
      suffix = suffix ? path.join(path.basename(current), suffix) : path.basename(current);
      current = parent;
    }
  }
}

/**
 * Checks if a path resolves to a system directory.
 * Returns true for filesystem root, Windows system folders, or POSIX system dirs.
 */
export function isSystemDirectory(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  const caseInsensitive = process.platform === 'win32';
  const root = path.parse(resolved).root;
  if (
    normalizeForComparison(resolved, caseInsensitive) ===
    normalizeForComparison(root, caseInsensitive)
  ) {
    return true;
  }

  if (process.platform === 'win32') {
    const candidates = [
      process.env.SystemRoot,
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.ProgramData,
    ]
      .filter(Boolean)
      .map((dir) => path.resolve(dir!));

    return candidates.some((dir) => isWithinDir(resolved, dir, true));
  }

  return SYSTEM_DIRS_POSIX.some((dir) => isWithinDir(resolved, dir));
}
