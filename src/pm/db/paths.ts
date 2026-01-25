import os from 'node:os';
import path from 'node:path';
import {
  hasTraversalSegments,
  isSystemDirectory,
  isWindowsUncPath,
  resolvePathForValidation,
} from './path-validation.js';

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
