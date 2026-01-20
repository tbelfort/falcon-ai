#!/usr/bin/env node
/**
 * Post-install hook for falcon-ai.
 *
 * Creates the ~/.falcon-ai directory structure on package install.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const FALCON_DIR = path.join(os.homedir(), '.falcon-ai');
const DB_DIR = path.join(FALCON_DIR, 'db');

// Create directories if they don't exist
if (!fs.existsSync(FALCON_DIR)) {
  fs.mkdirSync(FALCON_DIR, { recursive: true });
  console.log(`Created ${FALCON_DIR}`);
}

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
  console.log(`Created ${DB_DIR}`);
}

console.log('falcon-ai installed successfully.');
console.log('Run "falcon init" in a git repository to get started.');
