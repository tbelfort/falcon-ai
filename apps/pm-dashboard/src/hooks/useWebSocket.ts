import { useEffect, useRef, useCallback } from 'react';
import type { WsClientMessage, WsServerMessage } from '../types';

interface UseWebSocketOptions {
  onMessage?: (msg: WsServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export function useWebSocket(url: string | null, options: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const { onMessage, onOpen, onClose } = options;

  useEffect(() => {
    if (!url) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsServerMessage;
        onMessage?.(msg);
      } catch {
        // Ignore invalid JSON
      }
    };

    ws.onclose = () => {
      onClose?.();
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [url, onMessage, onOpen, onClose]);

  const send = useCallback((msg: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const subscribe = useCallback((channel: string) => {
    send({ type: 'subscribe', channel });
  }, [send]);

  const unsubscribe = useCallback((channel: string) => {
    send({ type: 'unsubscribe', channel });
  }, [send]);

  return { send, subscribe, unsubscribe };
}
