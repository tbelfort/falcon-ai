import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from '@/mocks/server';
import { resetMockData } from '@/mocks/data';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
});

beforeEach(() => {
  resetMockData();
});

afterAll(() => {
  server.close();
});
