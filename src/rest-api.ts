import { request } from 'node:http';
import type { RemoteTask, TaskApi, TaskFields } from './api';
import { isRecord } from './import-types';

export const REST_PORT = 3876;
// Bound memory use even if a malformed endpoint keeps streaming response data.
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const UNREACHABLE =
  'Cannot reach Super Productivity. Open the desktop app and enable Settings → General → Misc Settings → Enable local REST API.';

/** Direct loopback HTTP bypasses CORS and proxy settings; redirects are never followed. */
export class RestTaskApi implements TaskApi {
  // One controller cancels every request started by this operation's client.
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;

  constructor(
    private readonly token: string,
    private readonly port = REST_PORT,
    private readonly timeoutMs = 15000,
  ) {}

  /** Abort in-flight requests and prevent this client from starting new ones. */
  close(): void {
    this.controller.abort();
  }

  /** /status requires authentication, unlike the public health endpoint. */
  async checkConnection(): Promise<void> {
    const data = await this.send('GET', '/status');
    if (!isRecord(data) || typeof data.taskCount !== 'number') {
      this.invalidResponse();
    }
  }

  /** Include completed and archived tasks so repeat imports keep their identities. */
  async getTasks(): Promise<RemoteTask[]> {
    const data = await this.send('GET', '/tasks?source=all&includeDone=true');
    if (
      !Array.isArray(data) ||
      data.some(
        (task) =>
          !isRecord(task) ||
          typeof task.id !== 'string' ||
          !task.id ||
          (task.notes != null && typeof task.notes !== 'string'),
      )
    ) {
      this.invalidResponse();
    }
    return data as RemoteTask[];
  }

  /** Read the existing tag catalog; the importer never creates missing tags. */
  async getAllTags(): Promise<Array<{ id: string; title: string }>> {
    const data = await this.send('GET', '/tags');
    if (
      !Array.isArray(data) ||
      data.some(
        (tag) =>
          !isRecord(tag) || typeof tag.id !== 'string' || !tag.id || typeof tag.title !== 'string',
      )
    ) {
      this.invalidResponse();
    }
    return data as Array<{ id: string; title: string }>;
  }

  /** Return the server's task ID so the importer can finalize or later resume it. */
  async addTask(fields: TaskFields): Promise<string> {
    const data = await this.send('POST', '/tasks', fields);
    if (!isRecord(data) || typeof data.id !== 'string' || !data.id) {
      this.invalidResponse();
    }
    return data.id as string;
  }

  /** Verify that PATCH acknowledges the exact task the importer requested. */
  async updateTask(id: string, fields: TaskFields): Promise<void> {
    const data = await this.send('PATCH', `/tasks/${encodeURIComponent(id)}`, fields);
    if (!isRecord(data) || data.id !== id) {
      this.invalidResponse();
    }
  }

  /** Share a safe error message without displaying untrusted response contents. */
  private invalidResponse(): never {
    throw new Error(
      'Unexpected response from Super Productivity. Use desktop version 19.0.1 or newer.',
    );
  }

  /** Send one bounded loopback request and unwrap the API's { ok, data } envelope. */
  private async send(method: string, path: string, fields?: TaskFields): Promise<unknown> {
    const token = this.token.trim();
    // Reject invalid header characters before Node opens a socket.
    if (!token) {
      throw new Error('Enter the Super Productivity access token in this plugin’s settings.');
    }
    if (/[^\x21-\x7e]/.test(token)) {
      throw new Error('The access token is invalid. Copy it again from Super Productivity.');
    }
    this.signal.throwIfAborted();
    const body = fields ? JSON.stringify(fields) : undefined;

    // Adapt Node's request/response events to the Promise-based TaskApi contract.
    return new Promise((resolve, reject) => {
      // A total deadline also bounds a server that keeps sending a partial response.
      const timer = setTimeout(() => {
        req.destroy(
          new Error('Super Productivity request timed out. Keep the app open, then try again.'),
        );
      }, this.timeoutMs);
      const finish = (error?: Error, value?: unknown): void => {
        clearTimeout(timer);
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      };

      // A direct IP and a non-pooled connection avoid DNS/proxy routing and idle sockets.
      const req = request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path,
          method,
          signal: this.signal,
          agent: false,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(body
              ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
              : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          // Stop buffering as soon as the cumulative payload exceeds the size limit.
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_RESPONSE_BYTES) {
              req.destroy(new Error('Super Productivity response is too large to import safely.'));
            } else {
              chunks.push(chunk);
            }
          });
          response.on('error', () => finish(new Error(UNREACHABLE)));
          response.on('end', () => {
            try {
              // Authentication and redirect failures are meaningful even without JSON.
              if (response.statusCode === 401 || response.statusCode === 403) {
                throw new Error(
                  'Super Productivity rejected the access token. Copy the current token from Settings → General → Misc Settings.',
                );
              }
              if ((response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400) {
                throw new Error(
                  'Unexpected redirect from the local API. Redirects are not followed.',
                );
              }

              // The endpoint-specific methods validate data after this shared envelope.
              let envelope: unknown;
              try {
                envelope = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              } catch {
                this.invalidResponse();
              }
              if (!isRecord(envelope)) {
                this.invalidResponse();
              }
              if (
                (response.statusCode ?? 0) < 200 ||
                (response.statusCode ?? 0) >= 300 ||
                envelope.ok !== true
              ) {
                // Avoid echoing an untrusted response body or any credentials in a notice.
                const code =
                  isRecord(envelope.error) &&
                  typeof envelope.error.code === 'string' &&
                  /^[A-Z_]{1,64}$/.test(envelope.error.code)
                    ? ` (${envelope.error.code})`
                    : '';
                throw new Error(
                  `Super Productivity API request failed: HTTP ${response.statusCode}${code}.`,
                );
              }
              if (!('data' in envelope)) {
                this.invalidResponse();
              }
              finish(undefined, envelope.data);
            } catch (error) {
              finish(error instanceof Error ? error : new Error('Invalid API response.'));
            }
          });
        },
      );

      // Cancellation gets a retry hint; socket errors do not expose system details.
      req.on('error', (error: NodeJS.ErrnoException) => {
        if (this.signal.aborted) {
          finish(new Error('Import cancelled. Run the command again to resume.'));
        } else if (error.code) {
          finish(new Error(UNREACHABLE));
        } else {
          finish(error);
        }
      });
      req.end(body);
    });
  }
}
