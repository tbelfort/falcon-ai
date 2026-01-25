import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Block OS-managed directories if FALCON_HOME is misconfigured.
const SYSTEM_DIRS_POSIX = [
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

function hasTraversalSegments(value: string): boolean {
  const segments = value.split(/[\\/]+/).filter(Boolean);
  return segments.includes('..');
}

function isWindowsUncPath(value: string): boolean {
  return value.startsWith('\\\\') || value.startsWith('//');
}

function normalizeForComparison(value: string, caseInsensitive: boolean): string {
  const normalized = path.resolve(value);
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

function isWithinDir(
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

function resolvePathForValidation(targetPath: string): string {
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

function isSystemDirectory(targetPath: string): boolean {
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

function validateFalconHome(rawPath: string): string {
  if (process.platform === 'win32' && isWindowsUncPath(rawPath)) {
    throw new Error('FALCON_HOME must not be a UNC path.');
  }
  if (!path.isAbsolute(rawPath)) {
    throw new Error('FALCON_HOME must be an absolute path.');
  }
  if (hasTraversalSegments(rawPath)) {
    throw new Error('FALCON_HOME must not include ".." path segments.');
  }
  const resolved = resolvePathForValidation(rawPath);
  if (isSystemDirectory(resolved)) {
    throw new Error('FALCON_HOME must not be a system directory.');
  }
  return resolved;
}

export function getFalconHome(): string {
  const envHome = process.env.FALCON_HOME?.trim();
  if (envHome) {
    return validateFalconHome(envHome);
  }
  return path.join(os.homedir(), '.falcon');
}

export function getPmDbPath(): string {
  return path.join(getFalconHome(), 'pm.db');
}
