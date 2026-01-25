import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { startMockServiceWorker } from './mocks/browser';

async function bootstrap() {
  if (!import.meta.env.VITE_API_BASE_URL) {
    await startMockServiceWorker();
  }

  const root = document.getElementById('root');
  if (!root) {
    return;
  }

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
