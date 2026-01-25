import { useEffect, useMemo, useRef } from 'react';
import type { WsClientMessage } from '../api/ws';

export function useWebSocket(
  url: string,
  onEvent: (msg: unknown) => void,
  subscriptions: string[] = []
) {
  const handlerRef = useRef(onEvent);
  const subscriptionKey = useMemo(() => subscriptions.join('|'), [subscriptions]);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!url) {
      return undefined;
    }
    const ws = new WebSocket(url);
    const send = (message: WsClientMessage) => {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }
      ws.send(JSON.stringify(message));
    };

    ws.onopen = () => {
      subscriptions.forEach((channel) => send({ type: 'subscribe', channel }));
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        handlerRef.current(parsed);
      } catch (error) {
        console.warn('Failed to parse WS message', error);
      }
    };

    return () => {
      subscriptions.forEach((channel) => send({ type: 'unsubscribe', channel }));
      ws.close();
    };
  }, [url, subscriptionKey]);
}
