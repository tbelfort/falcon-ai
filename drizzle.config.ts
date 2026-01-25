import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/pm/db/migrations',
  schema: './src/pm/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      `file:${path.join(os.homedir(), '.falcon', 'pm.db')}`,
  },
});
