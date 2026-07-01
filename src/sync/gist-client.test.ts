import { describe, expect, it, vi, type Mock } from 'vitest';
import type { Workspace } from '../domain/types';
import { GistClient } from './gist-client';

type FetchMock = Mock<typeof fetch>;

const token = 'ghp_secret-token';
const filename = 'open-tabtab-backup.json';
const workspace: Workspace = {
  version: 10,
  spaceOrder: ['space-1'],
  spaces: {
    'space-1': {
      id: 'space-1',
      name: 'Default',
      groups: [
        {
          id: 'group-1',
          name: 'Read later',
          tabs: [
            {
              id: 'tab-1',
              title: 'Example',
              url: 'https://example.com',
              favIconUrl: 'https://example.com/favicon.ico',
              kind: 'record',
            },
          ],
        },
      ],
      pins: {},
    },
  },
};

function createFetchMock(): FetchMock {
  return vi.fn() as FetchMock;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

function requestAt(fetchMock: FetchMock, index = 0): [string, RequestInit] {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit | undefined];

  return [url, init ?? {}];
}

function requestHeaders(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>;
}

function requestBody(init: RequestInit): unknown {
  return JSON.parse(init.body as string);
}

describe('GistClient', () => {
  it('validates a token with GET /gists and maps non-200 to false', async () => {
    const fetchMock = createFetchMock();
    const client = new GistClient(fetchMock);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    await expect(client.validateToken(token)).resolves.toBe(true);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(client.validateToken(token)).resolves.toBe(false);

    const [url, init] = requestAt(fetchMock);

    expect(url).toBe('https://api.github.com/gists');
    expect(requestHeaders(init)).toMatchObject({
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    });
  });

  it('creates a private Gist with the configured filename and content', async () => {
    const fetchMock = createFetchMock();
    const client = new GistClient(fetchMock);

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'gist-1' }, 201));

    await expect(client.createGist(token, {
      filename,
      content: '{"ok":true}',
      description: 'Open TabTab backup',
      public: false,
    })).resolves.toBe('gist-1');

    const [url, init] = requestAt(fetchMock);

    expect(url).toBe('https://api.github.com/gists');
    expect(init.method).toBe('POST');
    expect(requestHeaders(init).Authorization).toBe(`Bearer ${token}`);
    expect(requestBody(init)).toEqual({
      description: 'Open TabTab backup',
      public: false,
      files: {
        [filename]: {
          content: '{"ok":true}',
        },
      },
    });
  });

  it('updates an existing Gist file with PATCH', async () => {
    const fetchMock = createFetchMock();
    const client = new GistClient(fetchMock);

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'gist-1' }));

    await client.updateGist('gist-1', token, filename, '{"ok":true}');

    const [url, init] = requestAt(fetchMock);

    expect(url).toBe('https://api.github.com/gists/gist-1');
    expect(init.method).toBe('PATCH');
    expect(requestHeaders(init).Authorization).toBe(`Bearer ${token}`);
    expect(requestBody(init)).toEqual({
      files: {
        [filename]: {
          content: '{"ok":true}',
        },
      },
    });
  });

  it('returns found when the configured file contains a valid workspace', async () => {
    const fetchMock = createFetchMock();
    const client = new GistClient(fetchMock);

    fetchMock.mockResolvedValueOnce(jsonResponse({
      files: {
        [filename]: {
          content: JSON.stringify(workspace),
          truncated: false,
          raw_url: 'https://gist.githubusercontent.com/raw-file',
        },
      },
    }));

    await expect(client.getGist('gist-1', token, filename)).resolves.toEqual({
      kind: 'found',
      workspace,
      remoteVersion: workspace.version,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows raw_url only when the Gist file is truncated', async () => {
    const fetchMock = createFetchMock();
    const client = new GistClient(fetchMock);
    const rawUrl = 'https://gist.githubusercontent.com/raw-file';

    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        files: {
          [filename]: {
            truncated: true,
            raw_url: rawUrl,
          },
        },
      }))
      .mockResolvedValueOnce(textResponse(JSON.stringify(workspace)));

    await expect(client.getGist('gist-1', token, filename)).resolves.toMatchObject({
      kind: 'found',
      remoteVersion: workspace.version,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestAt(fetchMock, 1)[0]).toBe(rawUrl);
  });

  it('maps 404, absent files, and empty content to missing', async () => {
    const fetchMock = createFetchMock();
    const client = new GistClient(fetchMock);

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(client.getGist('missing-gist', token, filename)).resolves.toEqual({ kind: 'missing' });

    fetchMock.mockResolvedValueOnce(jsonResponse({ files: {} }));
    await expect(client.getGist('gist-1', token, filename)).resolves.toEqual({ kind: 'missing' });

    fetchMock.mockResolvedValueOnce(jsonResponse({
      files: {
        [filename]: {
          content: '   ',
          truncated: false,
        },
      },
    }));
    await expect(client.getGist('gist-1', token, filename)).resolves.toEqual({ kind: 'missing' });
  });

  it('maps bad JSON and bad backup shape to invalid', async () => {
    const fetchMock = createFetchMock();
    const client = new GistClient(fetchMock);

    fetchMock.mockResolvedValueOnce(jsonResponse({
      files: {
        [filename]: {
          content: '{bad json',
          truncated: false,
        },
      },
    }));
    await expect(client.getGist('gist-1', token, filename)).resolves.toEqual({
      kind: 'invalid',
      error: 'Backup JSON could not be parsed',
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({
      files: {
        [filename]: {
          content: JSON.stringify({ nope: true }),
          truncated: false,
        },
      },
    }));
    await expect(client.getGist('gist-1', token, filename)).resolves.toMatchObject({
      kind: 'invalid',
    });
  });

  it('sanitizes thrown transport errors so they do not expose the token', async () => {
    const fetchMock = createFetchMock();
    const client = new GistClient(fetchMock);

    fetchMock.mockRejectedValueOnce(new Error(`network failed for ${token}`));

    try {
      await client.updateGist('gist-1', token, filename, '{}');
      throw new Error('expected updateGist to throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      expect(message).not.toContain(token);
      expect(message).toContain('[redacted]');
    }
  });
});
