import { createServer } from 'node:http';
import { createInMemoryRepos } from '../core/testing/in-memory-repos.js';
import { createApiServer } from './server.js';
import { broadcast, setupWebSocket } from './websocket.js';

const app = createApiServer({
  repos: createInMemoryRepos(),
  broadcaster: broadcast,
});

const server = createServer(app);
setupWebSocket(server);

server.listen(3002, () => {
  console.log('Falcon PM API listening on http://localhost:3002');
});
