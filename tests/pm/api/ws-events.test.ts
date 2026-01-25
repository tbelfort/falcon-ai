import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { createPmApiServer } from '../../../src/pm/api/server.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

function waitForMessage<T>(
  ws: WebSocket,
  predicate: (message: T) => boolean,
  timeoutMs = 2000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('Timed out waiting for websocket message'));
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData): void => {
      const message = JSON.parse(data.toString()) as T;
      if (predicate(message)) {
        clearTimeout(timeout);
        ws.off('message', onMessage);
        resolve(message);
      }
    };

    ws.on('message', onMessage);
  });
}

describe('pm api websocket events', () => {
  it('broadcasts issue created events', async () => {
    const { server } = createPmApiServer({ repos: createInMemoryRepos() });
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Server address not available');
    }

    const ws = new WebSocket(`ws://localhost:${address.port}/ws`);
    try {
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));

      const projectRes = await request(server)
        .post('/api/projects')
        .send({ name: 'WS Project', slug: 'ws-project' });
      const projectId = projectRes.body.data.id as string;

      const subscribedPromise = waitForMessage(
        ws,
        (message: { type: string }) => message.type === 'subscribed'
      );
      ws.send(
        JSON.stringify({ type: 'subscribe', channel: `project:${projectId}` })
      );
      await subscribedPromise;

      const eventPromise = waitForMessage<{
        type: string;
        event?: string;
        channel: string;
        data: { type: string; projectId: string; payload: { title: string } };
      }>(
        ws,
        (message) => message.type === 'event' && message.event === 'issue.created',
        4000
      );

      await request(server)
        .post('/api/issues')
        .send({ projectId, title: 'WS Issue' });

      const eventMessage = await eventPromise;

      expect(eventMessage.channel).toBe(`project:${projectId}`);
      expect(eventMessage.data.type).toBe('issue.created');
      expect(eventMessage.data.projectId).toBe(projectId);
      expect(eventMessage.data.payload.title).toBe('WS Issue');
    } finally {
      await new Promise<void>((resolve) => {
        ws.once('close', () => resolve());
        ws.close();
      });
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
