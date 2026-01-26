import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

async function enableMocking() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return;
  }

  const { worker } = await import('./mocks/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
  });
}

enableMocking()
  .then(() => {
    const container = document.getElementById('root');
    if (!container) {
      return;
    }

    createRoot(container).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch((error) => {
    console.error('Failed to initialize application:', error);
    const container = document.getElementById('root');
    if (container) {
      container.textContent = 'Failed to load application. Please refresh the page.';
    }
  });
