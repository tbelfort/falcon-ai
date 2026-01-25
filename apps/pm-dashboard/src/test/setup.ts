import '@testing-library/jest-dom';
import { server } from '../mocks/server';
import { resetMockDb } from '../mocks/data';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});

afterAll(() => {
  server.close();
});
