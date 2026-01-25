import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { createApp, startServer, stopServer, type AppContext } from '../../../src/pm/api/server.js';
import { createInMemoryRepositories } from '../../../src/pm/core/testing/in-memory-repos.js';
import type { WsServerMessage } from '../../../src/pm/contracts/ws.js';

describe('WebSocket Events', () => {
  let appContext: AppContext;
  let repos: ReturnType<typeof createInMemoryRepositories>;
  const port = 13002 + Math.floor(Math.random() * 1000);
  let wsUrl: string;

  beforeAll(async () => {
    repos = createInMemoryRepositories();
    appContext = createApp({ repos });

    startServer(appContext.app, port);
    wsUrl = `ws://127.0.0.1:${port}/ws`;

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    await stopServer();
    repos.clear();
  });

  // Connect to WebSocket and wait for first message (connected) in a single step
  function connectAndWaitForConnected(timeout = 5000): Promise<{ ws: WebSocket; msg: WsServerMessage }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Connection/message timeout'));
      }, timeout);

      const ws = new WebSocket(wsUrl);

      // Set up message listener BEFORE open event
      ws.once('message', (data) => {
        clearTimeout(timer);
        const msg = JSON.parse(data.toString()) as WsServerMessage;
        resolve({ ws, msg });
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function waitForMessage(ws: WebSocket, timeout = 3000): Promise<WsServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout waiting for message'));
      }, timeout);

      ws.once('message', (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(data.toString()));
      });
    });
  }

  async function subscribe(ws: WebSocket, channel: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Subscribe timeout')), 3000);
      const handler = (data: WebSocket.RawData) => {
        const msg = JSON.parse(data.toString()) as WsServerMessage;
        if (msg.type === 'subscribed' && msg.channel === channel) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve();
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ type: 'subscribe', channel }));
    });
  }

  describe('Connection', () => {
    it('should receive connected message with clientId', async () => {
      const { ws, msg } = await connectAndWaitForConnected();
      try {
        expect(msg.type).toBe('connected');
        expect((msg as { type: 'connected'; clientId: string }).clientId).toBeDefined();
      } finally {
        ws.close();
      }
    }, 10000);

    it('should respond to ping with pong', async () => {
      const { ws } = await connectAndWaitForConnected();
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
        const msg = await waitForMessage(ws);
        expect(msg.type).toBe('pong');
      } finally {
        ws.close();
      }
    }, 10000);

    it('should confirm subscription', async () => {
      const { ws } = await connectAndWaitForConnected();
      try {
        ws.send(JSON.stringify({ type: 'subscribe', channel: 'project:test' }));
        const msg = await waitForMessage(ws);
        expect(msg.type).toBe('subscribed');
        expect((msg as { type: 'subscribed'; channel: string }).channel).toBe('project:test');
      } finally {
        ws.close();
      }
    }, 10000);
  });

  describe('Events', () => {
    it('should broadcast issue.created event to project channel', async () => {
      // Create project
      const projectRes = await request(appContext.app)
        .post('/api/projects')
        .send({ name: 'Issue Event Test', slug: 'issue-event-test' });
      const projectId = projectRes.body.data.id;

      const { ws } = await connectAndWaitForConnected();
      try {
        await subscribe(ws, `project:${projectId}`);

        // Set up message listener BEFORE making the request
        const msgPromise = waitForMessage(ws);

        // Create issue - should trigger event
        await request(appContext.app)
          .post('/api/issues')
          .send({ projectId, title: 'New Issue' });

        const msg = await msgPromise;

        expect(msg.type).toBe('event');
        const eventMsg = msg as { type: 'event'; channel: string; event: string; data: unknown };
        expect(eventMsg.event).toBe('issue.created');
        expect((eventMsg.data as { title: string }).title).toBe('New Issue');
      } finally {
        ws.close();
      }
    }, 10000);
  });
});
