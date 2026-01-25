import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../../../src/pm/api/server.js';
import { createWebSocketHub } from '../../../src/pm/api/websocket.js';
import type { WsServerMessage } from '../../../src/pm/contracts/ws.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

function createMessageQueue(ws: WebSocket) {
  const messages: WsServerMessage[] = [];
  const listeners = new Set<(message: WsServerMessage) => void>();

  ws.on('message', (data) => {
    const parsed = JSON.parse(data.toString()) as WsServerMessage;
    messages.push(parsed);
    for (const listener of listeners) {
      listener(parsed);
    }
  });

  const waitForMessage = (
    predicate: (message: WsServerMessage) => boolean,
    timeoutMs: number = 2000
  ) => {
    const existing = messages.find(predicate);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise<WsServerMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for WS message'));
      }, timeoutMs);

      const listener = (message: WsServerMessage) => {
        if (predicate(message)) {
          cleanup();
          resolve(message);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        listeners.delete(listener);
      };

      listeners.add(listener);
    });
  };

  return { waitForMessage };
}

describe('pm api ws events', () => {
  it('broadcasts issue.created events', async () => {
    const repos = createInMemoryRepos();
    const hub = createWebSocketHub();
    const app = createApiServer({ repos, broadcaster: hub.broadcast });
    const server = createServer(app);
    hub.setupWebSocket(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;

    const projectRes = await request(app)
      .post('/api/projects')
      .send({ name: 'Project', slug: 'project', defaultBranch: 'main' });
    const projectId = projectRes.body.data.id as string;

    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const queue = createMessageQueue(ws);
    await queue.waitForMessage((message) => message.type === 'connected');
    ws.send(JSON.stringify({ type: 'subscribe', channel: `project:${projectId}` }));
    await queue.waitForMessage(
      (message) => message.type === 'subscribed' && message.channel === `project:${projectId}`
    );

    await request(app)
      .post('/api/issues')
      .send({ projectId, title: 'Fix bug', priority: 'medium' });

    const eventMessage = await queue.waitForMessage(
      (message) =>
        message.type === 'event' && message.event === 'issue.created'
    );

    if (eventMessage.type !== 'event') {
      throw new Error('Expected event message');
    }

    const payload = eventMessage.data.payload as { projectId: string };
    expect(payload.projectId).toBe(projectId);
    expect(eventMessage.data.type).toBe('issue.created');

    ws.close();
    hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
