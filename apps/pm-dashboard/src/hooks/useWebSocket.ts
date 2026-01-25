import { useCallback, useEffect, useRef } from 'react';

export function useWebSocket<T>(url: string | null, onEvent: (msg: T) => void) {
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!url) {
      return;
    }

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        onEvent(JSON.parse(event.data) as T);
      } catch {
        return;
      }
    };

    return () => {
      socket.close();
    };
  }, [url, onEvent]);

  const send = useCallback((message: unknown) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { send };
}
