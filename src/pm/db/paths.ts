import os from 'node:os';
import path from 'node:path';

export function getFalconHome(): string {
  const envHome = process.env.FALCON_HOME?.trim();
  if (envHome) {
    return envHome;
  }
  return path.join(os.homedir(), '.falcon');
}

export function getPmDbPath(): string {
  return path.join(getFalconHome(), 'pm.db');
}
