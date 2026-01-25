import http from 'node:http';
import { createApiApp } from './server.js';
import { setupWebSocket } from './websocket.js';
import { createInMemoryRepos } from '../core/testing/in-memory-repos.js';
import { resolveAllowedOrigins, resolveAuthToken } from './security.js';

const port = Number(process.env.PM_API_PORT ?? 3002);
const authToken = resolveAuthToken();
const allowedOrigins = resolveAllowedOrigins();
const app = createApiApp({
  repos: createInMemoryRepos(),
  authToken,
  allowedOrigins,
});
const server = http.createServer(app);

setupWebSocket(server, { authToken, allowedOrigins });

server.listen(port, () => {
  console.log(`Falcon PM API listening on http://localhost:${port}`);
});
