import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

const shouldMock = !import.meta.env.VITE_API_BASE_URL && import.meta.env.DEV;

async function prepare() {
  if (shouldMock) {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
}

void prepare().then(() => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }
  ReactDOM.createRoot(rootElement).render(<App />);
});
