import os from 'node:os';
import path from 'node:path';

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

function isWithinDir(targetPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, targetPath);
  if (relative === '') {
    return true;
  }
  return (
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

function isSystemDirectory(targetPath: string): boolean {
  const resolved = path.resolve(targetPath);
  const root = path.parse(resolved).root;
  if (resolved === root) {
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

    const resolvedLower = resolved.toLowerCase();
    return candidates.some((dir) =>
      isWithinDir(resolvedLower, dir.toLowerCase())
    );
  }

  return SYSTEM_DIRS_POSIX.some((dir) => isWithinDir(resolved, dir));
}

function validateFalconHome(rawPath: string): string {
  if (!path.isAbsolute(rawPath)) {
    throw new Error('FALCON_HOME must be an absolute path.');
  }
  if (hasTraversalSegments(rawPath)) {
    throw new Error('FALCON_HOME must not include ".." path segments.');
  }
  const resolved = path.resolve(rawPath);
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
