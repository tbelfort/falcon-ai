import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { createApiApp } from '../../../src/pm/api/server.js';
import { broadcast, setupWebSocket } from '../../../src/pm/api/websocket.js';
import { createInMemoryRepos } from '../../../src/pm/core/testing/in-memory-repos.js';

async function waitForMessage(
  ws: WebSocket,
  predicate: (message: any) => boolean,
  timeoutMs = 2000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error('Timed out waiting for message'));
    }, timeoutMs);

    const handler = (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString());
      if (predicate(parsed)) {
        clearTimeout(timeout);
        ws.off('message', handler);
        resolve(parsed);
      }
    };

    ws.on('message', handler);
  });
}

describe('PM API websocket events', () => {
  let server: http.Server | null = null;
  let ws: WebSocket | null = null;
  const authToken = 'test-token';
  const authHeader = { Authorization: `Bearer ${authToken}` };

  afterEach(async () => {
    if (ws) {
      ws.close();
      ws = null;
    }
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      server = null;
    }
  });

  it('broadcasts project, issue, comment, label, and document events', async () => {
    const app = createApiApp({ repos: createInMemoryRepos(), authToken });
    server = http.createServer(app);
    setupWebSocket(server, { authToken });

    await new Promise<void>((resolve) => {
      server?.listen(0, () => resolve());
    });
    const port = (server.address() as AddressInfo).port;
    const client = request(`http://localhost:${port}`);

    const projectResponse = await client
      .post('/api/projects')
      .set(authHeader)
      .send({
        name: 'Project',
        slug: 'project',
        description: null,
        repoUrl: null,
        defaultBranch: 'main',
      })
      .expect(200);
    const project = projectResponse.body.data;

    ws = new WebSocket(`ws://localhost:${port}/ws?token=${authToken}`);
    await once(ws, 'open');
    await waitForMessage(ws, (message) => message.type === 'connected');
    ws.send(
      JSON.stringify({ type: 'subscribe', channel: `project:${project.id}` })
    );
    await waitForMessage(
      ws,
      (message) =>
        message.type === 'subscribed' && message.channel === `project:${project.id}`
    );

    const projectCreatedPromise = waitForMessage(
      ws,
      (message) =>
        message.type === 'event' && message.event === 'project.created'
    );
    broadcast(`project:${project.id}`, 'project.created', {
      type: 'project.created',
      at: Date.now(),
      projectId: project.id,
      payload: project,
    });
    const projectCreatedMessage = await projectCreatedPromise;
    expect(projectCreatedMessage.channel).toBe(`project:${project.id}`);

    const projectUpdatedPromise = waitForMessage(
      ws,
      (message) =>
        message.type === 'event' && message.event === 'project.updated'
    );
    await client
      .patch(`/api/projects/${project.id}`)
      .set(authHeader)
      .send({ name: 'Project Updated' })
      .expect(200);
    await projectUpdatedPromise;

    const issueCreatedPromise = waitForMessage(
      ws,
      (message) => message.type === 'event' && message.event === 'issue.created'
    );
    const issueResponse = await client
      .post('/api/issues')
      .set(authHeader)
      .send({ projectId: project.id, title: 'Fix bug' })
      .expect(200);
    const issue = issueResponse.body.data;
    const issueCreatedMessage = await issueCreatedPromise;
    expect(issueCreatedMessage.data.issueId).toBe(issue.id);

    ws.send(
      JSON.stringify({ type: 'subscribe', channel: `issue:${issue.id}` })
    );
    await waitForMessage(
      ws,
      (message) =>
        message.type === 'subscribed' && message.channel === `issue:${issue.id}`
    );

    const issueUpdatedPromise = waitForMessage(
      ws,
      (message) => message.type === 'event' && message.event === 'issue.updated'
    );
    await client
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader)
      .send({ description: 'Updated' })
      .expect(200);
    await issueUpdatedPromise;

    const labelCreatedPromise = waitForMessage(
      ws,
      (message) => message.type === 'event' && message.event === 'label.created'
    );
    await client
      .post(`/api/projects/${project.id}/labels`)
      .set(authHeader)
      .send({ name: 'bug', color: '#ff0000' })
      .expect(200);
    await labelCreatedPromise;

    const commentCreatedPromise = waitForMessage(
      ws,
      (message) =>
        message.type === 'event' && message.event === 'comment.created'
    );
    await client
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader)
      .send({
        content: 'Looks good',
        authorType: 'human',
        authorName: 'Reviewer',
      })
      .expect(200);
    await commentCreatedPromise;

    const documentCreatedPromise = waitForMessage(
      ws,
      (message) =>
        message.type === 'event' && message.event === 'document.created'
    );
    await client
      .post(`/api/issues/${issue.id}/documents`)
      .set(authHeader)
      .send({
        title: 'Context Pack',
        docType: 'context_pack',
        filePath: '.falcon/issues/123/context-pack.md',
      })
      .expect(200);
    await documentCreatedPromise;

    const issueDeletedPromise = waitForMessage(
      ws,
      (message) => message.type === 'event' && message.event === 'issue.deleted'
    );
    await client
      .delete(`/api/issues/${issue.id}`)
      .set(authHeader)
      .expect(200);
    await issueDeletedPromise;

    const projectDeletedPromise = waitForMessage(
      ws,
      (message) =>
        message.type === 'event' && message.event === 'project.deleted'
    );
    await client
      .delete(`/api/projects/${project.id}`)
      .set(authHeader)
      .expect(200);
    await projectDeletedPromise;
  });
});
