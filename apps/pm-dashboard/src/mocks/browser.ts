import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

const worker = setupWorker(...handlers);

export async function startMockServiceWorker() {
  if (typeof window === 'undefined') {
    return;
  }
  await worker.start({ onUnhandledRequest: 'bypass' });
}
