import { setupServer } from 'msw/node';
import { handlers } from './handlers';
import { resetDb } from './data';

export const server = setupServer(...handlers);

export function resetMockDb() {
  resetDb();
}
