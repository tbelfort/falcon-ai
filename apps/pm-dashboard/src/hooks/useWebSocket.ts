import { useEffect, useRef } from 'react';
import type { WsClientMessage, WsServerMessage } from '@/api/types';

type WebSocketOptions = {
  url: string | null;
  onEvent: (message: WsServerMessage) => void;
  subscriptions?: string[];
};

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

    const ws = new WebSocket(url);
    const send = (message: WsClientMessage) => ws.send(JSON.stringify(message));

    const pingInterval = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        send({ type: 'ping' });
      }
    }, 30000);

    ws.onopen = () => {
      subscriptions.forEach((channel) => send({ type: 'subscribe', channel }));
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

    return () => {
      window.clearInterval(pingInterval);
      if (ws.readyState === WebSocket.OPEN) {
        subscriptions.forEach((channel) => send({ type: 'unsubscribe', channel }));
      }
      ws.close();
    };
  }, [url, subscriptions.join('|')]);
}
