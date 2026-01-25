import { useCallback, useEffect, useRef, useState } from 'react';
import { WsClientMessage, WsServerMessage } from '../api/types';

type WebSocketStatus = 'connecting' | 'open' | 'closed' | 'error';

export function useWebSocket(
  url: string | null,
  onEvent: (message: WsServerMessage) => void
) {
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<WebSocketStatus>('closed');

  useEffect(() => {
    if (!url) {
      return undefined;
    }

    const socket = new WebSocket(url);
    socketRef.current = socket;
    setStatus('connecting');

    socket.onopen = () => setStatus('open');
    socket.onclose = () => setStatus('closed');
    socket.onerror = () => setStatus('error');
    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as WsServerMessage;
        onEvent(parsed);
      } catch {
        onEvent({ type: 'error', message: 'Failed to parse WebSocket payload' });
      }
    };

    return () => {
      socket.close();
    };
  }, [url, onEvent]);

  const send = useCallback((message: WsClientMessage) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    socketRef.current.send(JSON.stringify(message));
  }, []);

  return { send, status };
}
