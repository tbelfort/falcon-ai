import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/pm/db/migrations',
  schema: './src/pm/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:~/.falcon/pm.db',
  },
});
