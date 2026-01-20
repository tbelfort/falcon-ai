/**
 * Configuration file loader.
 *
 * Loads and validates .falcon/config.yaml files.
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { z } from 'zod';

const ConfigSchema = z.object({
  version: z.string(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  workspace: z
    .object({
      slug: z.string(),
      name: z.string(),
    })
    .optional(),
  project: z
    .object({
      name: z.string(),
    })
    .optional(),
  linear: z
    .object({
      projectId: z.string().optional(),
      teamId: z.string().optional(),
    })
    .optional(),
  settings: z
    .object({
      maxInjectedWarnings: z.number().int().positive().optional(),
      crossProjectWarningsEnabled: z.boolean().optional(),
    })
    .optional(),
});

export type FalconConfig = z.infer<typeof ConfigSchema>;

/**
 * Load and validate a Falcon config file.
 *
 * @param configPath - Absolute path to the config file
 * @returns Validated config object
 * @throws Error if file doesn't exist or fails validation
 */
export function loadConfig(configPath: string): FalconConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.parse(content) as unknown;

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid config file: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Find the nearest .falcon/config.yaml file by walking up the directory tree.
 *
 * @param startDir - Directory to start searching from (defaults to cwd)
 * @returns Path to config file, or null if not found
 */
export function findConfigPath(startDir: string = process.cwd()): string | null {
  let dir = startDir;

  while (dir !== path.dirname(dir)) {
    const configPath = path.join(dir, '.falcon', 'config.yaml');
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Parse a config file without validation (for error messages).
 */
export function parseConfig(configPath: string): unknown {
  const content = fs.readFileSync(configPath, 'utf-8');
  return yaml.parse(content) as unknown;
}
