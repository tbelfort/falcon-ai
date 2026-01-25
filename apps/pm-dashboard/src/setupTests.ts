import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { resetMockDb, server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());
