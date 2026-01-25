import { useCallback, useEffect, useRef, useState } from 'react';
import type { WsClientMessage } from '../types';

export type WebSocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export function useWebSocket(url: string | null, onEvent: (msg: unknown) => void) {
  const socketRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<string[]>([]);
  const [status, setStatus] = useState<WebSocketStatus>('idle');

  const send = useCallback((message: WsClientMessage) => {
    const payload = JSON.stringify(message);
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      queueRef.current.push(payload);
      return;
    }
    socket.send(payload);
  }, []);

  useEffect(() => {
    if (!url) {
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus('open');
      queueRef.current.forEach((payload) => socket.send(payload));
      queueRef.current = [];
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string);
        onEvent(parsed);
      } catch (error) {
        onEvent({ type: 'error', message: 'Invalid message payload', error });
      }
    };

    socket.onerror = () => {
      setStatus('error');
    };

    socket.onclose = () => {
      setStatus('closed');
    };

    return () => {
      socket.close();
    };
  }, [url, onEvent]);

  return { send, status };
}
