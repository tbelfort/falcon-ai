#!/usr/bin/env node
/**
 * Falcon CLI entry point.
 *
 * Pattern-based guardrail system for multi-agent development.
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { workspaceCommand } from './commands/workspace.js';
import { projectCommand } from './commands/project.js';
import { statusCommand } from './commands/status.js';
import { doctorCommand } from './commands/doctor.js';
import { healthCommand } from './commands/health.js';
import { pauseCommand } from './commands/pause.js';
import { resumeCommand } from './commands/resume.js';
import { deleteCommand } from './commands/delete.js';

const program = new Command();

program
  .name('falcon')
  .description('Pattern-based guardrail system for multi-agent development')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(workspaceCommand);
program.addCommand(projectCommand);
program.addCommand(statusCommand);
program.addCommand(doctorCommand);
program.addCommand(healthCommand);
program.addCommand(pauseCommand);
program.addCommand(resumeCommand);
program.addCommand(deleteCommand);

program.parseAsync().catch((error: Error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
