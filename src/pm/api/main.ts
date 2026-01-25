import { createApp, startServer } from './server.js';
import { createDrizzleRepositories } from '../db/repos/index.js';

const PORT = Number(process.env.PORT) || 3002;

async function main(): Promise<void> {
  // Create repositories using Drizzle (SQLite)
  const repos = createDrizzleRepositories();

  // Create the Express app
  const { app } = createApp({ repos });

  // Start the server
  startServer(app, PORT);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
