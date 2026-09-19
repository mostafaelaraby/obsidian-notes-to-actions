import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { RestTaskApi } from '../src/rest-api';
import { TaskImporter } from '../src/importer';
import { makeBatch } from '../src/daily-note';
import type { TaskFields } from '../src/api';
import { FakeTaskApi } from './fixtures';

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  // Close clients before their servers, then restore the proxy environment for other tests.
  for (const close of cleanup.splice(0).reverse()) {
    await close();
  }
  vi.unstubAllEnvs();
});

/** Bind an ephemeral loopback port so tests never contact a user's desktop API. */
async function server(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
) {
  const instance = createServer((req, res) => {
    void Promise.resolve(handler(req, res)).catch(() => {
      res.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve));
  const address = instance.address();
  if (!address || typeof address === 'string') {
    throw new Error('No test server port');
  }
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        instance.closeAllConnections();
        instance.close(() => resolve());
      }),
  );
  return address.port;
}

/** Register client cancellation even when an assertion fails midway through a request. */
function client(port: number, token = 'test-only-token', timeout = 1000) {
  const api = new RestTaskApi(token, port, timeout);
  cleanup.push(() => api.close());
  return api;
}

/** Successful fixtures use the same envelope that the production client must unwrap. */
function reply(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, data }));
}

describe('local REST transport over real HTTP', () => {
  it('authenticates and imports with existing tags, preserving unknown hashtags and archived identities', async () => {
    const store = new FakeTaskApi();
    store.tags = [{ id: 'work-id', title: 'Work' }];
    const requests: string[] = [];
    const port = await server(async (req, res) => {
      expect(req.headers.authorization).toBe('Bearer test-only-token');
      requests.push(`${req.method} ${req.url}`);
      if (req.url === '/status') {
        return reply(res, { taskCount: store.tasks.length });
      }
      if (req.url === '/tags') {
        return reply(res, store.tags);
      }
      if (req.method === 'GET' && req.url === '/tasks?source=all&includeDone=true') {
        return reply(res, await store.getTasks());
      }
      let text = '';
      for await (const chunk of req) {
        text += chunk.toString();
      }
      const fields = JSON.parse(text) as TaskFields;
      if (req.method === 'POST' && req.url === '/tasks') {
        expect(fields.title).toBe('Obsidian task');
        const id = await store.addTask(fields);
        return reply(res, { ...fields, id }, 201);
      }
      if (req.method === 'PATCH' && req.url?.startsWith('/tasks/')) {
        const id = decodeURIComponent(req.url.slice('/tasks/'.length));
        await store.updateTask(id, fields);
        return reply(res, { ...fields, id });
      }
      res.writeHead(404).end();
    });
    const api = client(port);
    await api.checkConnection();
    const batch = makeBatch(
      '- [ ] Draft +Project @tomorrow 30m #work #new\n- [x] Done',
      'vault',
      'Notes',
      'today.md',
      '2026-09-18',
    );
    expect(await new TaskImporter(api).import(batch, api.signal)).toEqual({
      created: 1,
      skipped: 0,
      unmatchedTags: ['new'],
    });
    expect(store.tasks[0]).toMatchObject({
      title: 'Draft +Project @tomorrow 30m #new',
      tagIds: ['work-id'],
      dueDay: '2026-09-18',
      projectId: 'INBOX_PROJECT',
    });
    store.archived.push(store.tasks.pop()!);
    expect(await new TaskImporter(client(port)).import(batch, api.signal)).toEqual({
      created: 0,
      skipped: 1,
      unmatchedTags: [],
    });
    expect(requests.filter((value) => value.startsWith('POST'))).toEqual(['POST /tasks']);
    expect(requests).toContain('GET /tasks?source=all&includeDone=true');
    expect(store.tags).toEqual([{ id: 'work-id', title: 'Work' }]);
  });

  it('checks authentication rather than relying on the unauthenticated health endpoint', async () => {
    const api = client(
      await server((req, res) => {
        expect(req.url).toBe('/status');
        res.writeHead(401).end(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED' } }));
      }),
    );
    await expect(api.checkConnection()).rejects.toThrow('rejected the access token');
  });

  it.each(['', 'bad\r\nheader', 'with spaces'])(
    'rejects missing or malformed tokens before sending requests: %j',
    async (token) => {
      const seen = vi.fn();
      const api = client(await server(seen), token);
      await expect(api.checkConnection()).rejects.toThrow(/token/);
      expect(seen).not.toHaveBeenCalled();
    },
  );

  it('never follows redirects or sends its token to a redirect target', async () => {
    const target = vi.fn((_req: IncomingMessage, res: ServerResponse) => reply(res, []));
    const targetPort = await server(target);
    const api = client(
      await server((_req, res) => {
        res.writeHead(302, { Location: `http://127.0.0.1:${targetPort}/tags` }).end();
      }),
    );
    await expect(api.getAllTags()).rejects.toThrow('redirect');
    expect(target).not.toHaveBeenCalled();
  });

  it('bypasses proxy environment variables for loopback requests', async () => {
    const proxy = vi.fn((_req: IncomingMessage, res: ServerResponse) => reply(res, []));
    const proxyPort = await server(proxy);
    for (const key of ['HTTP_PROXY', 'http_proxy', 'ALL_PROXY']) {
      vi.stubEnv(key, `http://127.0.0.1:${proxyPort}`);
    }
    const api = client(await server((_req, res) => reply(res, { taskCount: 0 })));
    await api.checkConnection();
    expect(proxy).not.toHaveBeenCalled();
  });

  it.each([
    'not json',
    JSON.stringify({ ok: true, data: {} }),
    JSON.stringify({ ok: true, data: [{ title: 'missing id' }] }),
  ])('rejects malformed task responses before any import mutation: %s', async (body) => {
    const api = client(
      await server((_req, res) => {
        res.end(body);
      }),
    );
    await expect(api.getTasks()).rejects.toThrow('Unexpected response');
  });

  it('reports API errors without echoing response text or credentials', async () => {
    const api = client(
      await server((_req, res) => {
        res.writeHead(500).end(
          JSON.stringify({
            ok: false,
            error: { code: 'INTERNAL_ERROR', message: 'test-only-token' },
          }),
        );
      }),
    );
    await expect(api.checkConnection()).rejects.toThrow('HTTP 500 (INTERNAL_ERROR)');
    await expect(api.checkConnection()).rejects.not.toThrow('test-only-token');
  });

  it('times out a stalled response and cancels outstanding requests on close', async () => {
    const port = await server(() => {});
    const slow = client(port, 'test-only-token', 50);
    await expect(slow.checkConnection()).rejects.toThrow('timed out');
    const api = client(port);
    const pending = api.checkConnection();
    const rejected = expect(pending).rejects.toThrow('cancelled');
    api.close();
    await rejected;
  });
  it('bounds partially delivered responses by deadline and size', async () => {
    const slow = client(
      await server((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{');
      }),
      'test-only-token',
      50,
    );
    await expect(slow.getTasks()).rejects.toThrow('timed out');
    const oversized = client(
      await server((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(Buffer.alloc(33 * 1024 * 1024, ' '));
      }),
    );
    await expect(oversized.getTasks()).rejects.toThrow('too large');
  });
});
