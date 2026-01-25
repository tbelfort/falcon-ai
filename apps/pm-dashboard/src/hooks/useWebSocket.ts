import { useEffect } from 'react';

export function useWebSocket(url: string | null, onEvent: (msg: unknown) => void) {
  useEffect(() => {
    if (!url) {
      return undefined;
    }
    const ws = new WebSocket(url);
    ws.onmessage = (event) => {
      try {
        onEvent(JSON.parse(event.data));
      } catch {
        onEvent(event.data);
      }
    };
    return () => ws.close();
  }, [url, onEvent]);
}
