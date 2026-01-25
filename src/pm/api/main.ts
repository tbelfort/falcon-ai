import http from 'node:http';
import { createApiApp } from './server.js';
import { setupWebSocket } from './websocket.js';
import { createInMemoryRepos } from '../core/testing/in-memory-repos.js';

const port = Number(process.env.PM_API_PORT ?? 3002);
const app = createApiApp({ repos: createInMemoryRepos() });
const server = http.createServer(app);

setupWebSocket(server);

server.listen(port, () => {
  console.log(`Falcon PM API listening on http://localhost:${port}`);
});
