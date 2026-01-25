import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

async function prepare() {
  if (!import.meta.env.VITE_API_BASE_URL) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
}

prepare().then(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
