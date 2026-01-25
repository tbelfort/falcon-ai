import { useEffect, useRef, useCallback } from 'react';
import type { WsServerMessage, WsClientMessage } from '../api/types';

interface UseWebSocketOptions {
  url: string;
  onMessage: (message: WsServerMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  enabled?: boolean;
}

export function useWebSocket({
  url,
  onMessage,
  onConnect,
  onDisconnect,
  enabled = true,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const send = useCallback((message: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribe = useCallback(
    (channel: string) => {
      send({ type: 'subscribe', channel });
    },
    [send]
  );

  const unsubscribe = useCallback(
    (channel: string) => {
      send({ type: 'unsubscribe', channel });
    },
    [send]
  );

  useEffect(() => {
    if (!enabled) return;

    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsServerMessage;
          onMessage(message);
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        onDisconnect?.();
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = window.setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    // Ping interval to keep connection alive
    const pingInterval = setInterval(() => {
      send({ type: 'ping' });
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [url, onMessage, onConnect, onDisconnect, enabled, send]);

  return { subscribe, unsubscribe, send };
}
