import { createPmApiServer } from './server.js';

const PORT = 3002;

const { server } = createPmApiServer();

server.listen(PORT, () => {
  console.log(`Falcon PM API listening on http://localhost:${PORT}`);
});
