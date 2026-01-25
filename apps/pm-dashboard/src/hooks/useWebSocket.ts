import { useEffect, useRef, useCallback } from 'react';
import type { WsServerMessage, WsClientMessage } from '../types';

interface UseWebSocketOptions {
  url: string;
  onEvent?: (channel: string, event: string, data: unknown) => void;
  onConnected?: (clientId: string) => void;
  onError?: (message: string) => void;
  enabled?: boolean;
}

export function useWebSocket({
  url,
  onEvent,
  onConnected,
  onError,
  enabled = true,
}: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const subscribedChannelsRef = useRef<Set<string>>(new Set());

  const subscribe = useCallback((channel: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: WsClientMessage = { type: 'subscribe', channel };
      wsRef.current.send(JSON.stringify(msg));
      subscribedChannelsRef.current.add(channel);
    }
  }, []);

  const unsubscribe = useCallback((channel: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const msg: WsClientMessage = { type: 'unsubscribe', channel };
      wsRef.current.send(JSON.stringify(msg));
      subscribedChannelsRef.current.delete(channel);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      // Start ping interval
      pingIntervalRef.current = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const ping: WsClientMessage = { type: 'ping' };
          ws.send(JSON.stringify(ping));
        }
      }, 30000);

      // Resubscribe to any channels
      subscribedChannelsRef.current.forEach((channel) => {
        const msg: WsClientMessage = { type: 'subscribe', channel };
        ws.send(JSON.stringify(msg));
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsServerMessage;

        switch (msg.type) {
          case 'connected':
            onConnected?.(msg.clientId);
            break;
          case 'event':
            onEvent?.(msg.channel, msg.event, msg.data);
            break;
          case 'error':
            onError?.(msg.message);
            break;
          case 'subscribed':
          case 'unsubscribed':
          case 'pong':
            // Acknowledgments - no action needed
            break;
        }
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };

    ws.onerror = () => {
      onError?.('WebSocket connection error');
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
      ws.close();
    };
  }, [url, enabled, onEvent, onConnected, onError]);

  return { subscribe, unsubscribe };
}
