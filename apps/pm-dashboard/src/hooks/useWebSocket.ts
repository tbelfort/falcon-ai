import { useEffect, useRef } from 'react';
import type { WsClientMessage, WsServerMessage } from '@/api/types';

type WebSocketOptions = {
  url: string | null;
  onEvent: (message: WsServerMessage) => void;
  subscriptions?: string[];
};

const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const PING_INTERVAL_MS = 30000;

export function useWebSocket({ url, onEvent, subscriptions = [] }: WebSocketOptions) {
  const latestHandler = useRef(onEvent);
  latestHandler.current = onEvent;

  useEffect(() => {
    if (import.meta.env.VITEST) {
      return;
    }
    if (!url) {
      return;
    }

    if (typeof WebSocket === 'undefined') {
      return;
    }

    let ws: WebSocket | null = null;
    let pingInterval: number | null = null;
    let reconnectTimeout: number | null = null;
    let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    let isCleaningUp = false;

    const connect = () => {
      if (isCleaningUp) return;

      ws = new WebSocket(url);
      const send = (message: WsClientMessage) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      };

      ws.onopen = () => {
        reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        subscriptions.forEach((channel) => send({ type: 'subscribe', channel }));

        pingInterval = window.setInterval(() => {
          send({ type: 'ping' });
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsServerMessage;
          latestHandler.current(message);
        } catch (error) {
          console.error('WS parse error', error);
        }
      };

      ws.onerror = (event) => {
        console.error('WS error', event);
      };

      ws.onclose = () => {
        if (pingInterval !== null) {
          window.clearInterval(pingInterval);
          pingInterval = null;
        }

        if (!isCleaningUp) {
          reconnectTimeout = window.setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
            connect();
          }, reconnectDelay);
        }
      };
    };

    connect();

    return () => {
      isCleaningUp = true;

      if (reconnectTimeout !== null) {
        window.clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      if (pingInterval !== null) {
        window.clearInterval(pingInterval);
        pingInterval = null;
      }

      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            subscriptions.forEach((channel) => {
              ws!.send(JSON.stringify({ type: 'unsubscribe', channel }));
            });
          }
          ws.close();
        } catch {
          // Ignore errors during cleanup
        }
        ws = null;
      }
    };
  }, [url, subscriptions.join('|')]);
}
