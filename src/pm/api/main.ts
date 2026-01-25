import http from 'node:http';

import { createApiApp } from './server.js';
import { broadcast, setupWebSocket } from './websocket.js';
import { createServices } from '../core/services/index.js';
import { createInMemoryRepos } from '../core/testing/in-memory-repos.js';

const repos = createInMemoryRepos();
const services = createServices(repos);
const app = createApiApp({ services, broadcast });

const server = http.createServer(app);
setupWebSocket(server);

const port = 3002;
server.listen(port, () => {
  console.log(`Falcon PM API listening on http://localhost:${port}`);
});
