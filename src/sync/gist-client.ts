import { parseBackup } from '../domain/backup';
import type { Workspace } from '../domain/types';

const GITHUB_API_BASE_URL = 'https://api.github.com';
const GITHUB_ACCEPT = 'application/vnd.github+json';

export type RemoteBackupResult =
  | { kind: 'found'; workspace: Workspace; remoteVersion: number }
  | { kind: 'missing' }
  | { kind: 'invalid'; error: string };

export type CreateGistInput = {
  filename: string;
  content: string;
  description?: string;
  public: false;
};

type GistFileResponse = {
  content?: unknown;
  truncated?: unknown;
  raw_url?: unknown;
};

/** GitHub Gist REST client with injectable fetch for tests. */
export class GistClient {
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  /** Checks whether the token can access the authenticated user's Gists. */
  async validateToken(token: string): Promise<boolean> {
    const response = await this.request(`${GITHUB_API_BASE_URL}/gists`, token);

    return response.status === 200;
  }

  /** Reads and parses the configured Gist backup file. */
  async getGist(gistId: string, token: string, filename: string): Promise<RemoteBackupResult> {
    const response = await this.request(`${GITHUB_API_BASE_URL}/gists/${encodeURIComponent(gistId)}`, token);

    if (response.status === 404) {
      return { kind: 'missing' };
    }

    this.assertOk(response);

    const gist = await this.readJson(response);
    const file = readGistFile(gist, filename);

    if (!file) {
      return { kind: 'missing' };
    }

    const content = await this.readFileContent(file, token);

    if (content.trim() === '') {
      return { kind: 'missing' };
    }

    const parsed = parseRemoteBackup(content);

    if (!parsed.ok) {
      return { kind: 'invalid', error: parsed.error };
    }

    return {
      kind: 'found',
      workspace: parsed.workspace,
      remoteVersion: parsed.workspace.version,
    };
  }

  /** Creates a private Gist containing the configured backup file. */
  async createGist(token: string, input: CreateGistInput): Promise<string> {
    const response = await this.request(`${GITHUB_API_BASE_URL}/gists`, token, {
      method: 'POST',
      body: JSON.stringify({
        description: input.description,
        public: input.public,
        files: {
          [input.filename]: {
            content: input.content,
          },
        },
      }),
    });

    this.assertOk(response);

    const gist = await this.readJson(response);

    if (!isRecord(gist) || typeof gist.id !== 'string') {
      throw new Error('GitHub create Gist response was missing an id');
    }

    return gist.id;
  }

  /** Replaces or creates the configured backup file inside an existing Gist. */
  async updateGist(gistId: string, token: string, filename: string, content: string): Promise<void> {
    const response = await this.request(`${GITHUB_API_BASE_URL}/gists/${encodeURIComponent(gistId)}`, token, {
      method: 'PATCH',
      body: JSON.stringify({
        files: {
          [filename]: {
            content,
          },
        },
      }),
    });

    this.assertOk(response);
  }

  private async readFileContent(file: GistFileResponse, token: string): Promise<string> {
    if (file.truncated === true) {
      if (typeof file.raw_url !== 'string' || file.raw_url.length === 0) {
        return '';
      }

      const response = await this.request(file.raw_url, token);

      if (!response.ok) {
        return '';
      }

      return response.text();
    }

    return typeof file.content === 'string' ? file.content : '';
  }

  private async request(url: string, token: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await this.fetchImpl(url, {
        ...init,
        headers: {
          Accept: GITHUB_ACCEPT,
          Authorization: `Bearer ${token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      throw new Error(`GitHub request failed: ${sanitizeError(error, token)}`);
    }
  }

  private assertOk(response: Response): void {
    if (!response.ok) {
      throw new Error(`GitHub request failed with status ${response.status}`);
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new Error('GitHub response was not valid JSON');
    }
  }
}

function readGistFile(gist: unknown, filename: string): GistFileResponse | undefined {
  if (!isRecord(gist) || !isRecord(gist.files)) {
    return undefined;
  }

  const file = gist.files[filename];

  return isRecord(file) ? file : undefined;
}

function parseRemoteBackup(
  content: string,
): { ok: true; workspace: Workspace } | { ok: false; error: string } {
  let value: unknown;

  try {
    value = JSON.parse(content);
  } catch {
    return { ok: false, error: 'Backup JSON could not be parsed' };
  }

  return parseBackup(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeError(error: unknown, token: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = token ? message.replaceAll(token, '[redacted]') : message;

  return sanitized || 'unknown error';
}
