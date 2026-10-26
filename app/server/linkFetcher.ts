import type { IncomingMessage, ServerResponse } from 'node:http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Plugin } from 'vite';

/**
 * Fetches a web page or file for the browser, which can't do it itself because of
 * CORS. GET /api/fetch-url?url=… returns the raw body with the upstream
 * Content-Type and the final address (after redirects) in X-Final-Url, or
 * { error } as JSON.
 *
 * Only public http(s) addresses are fetched: anything resolving to this computer
 * or a private network is refused, at every redirect, so a pasted link can't be
 * used to reach things like a router admin page. (The address is checked just
 * before fetching, not pinned, which is enough for a local dev tool but not for a
 * public server.)
 */

const MAX_BYTES = 14 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'Mozilla/5.0 (compatible; Corkline/0.1; design-research tool)';

class FetchRefused extends Error {}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
      (a === 169 && b === 254) || // link-local
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast and reserved
    );
  }
  const v6 = address.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') || // unique local
    v6.startsWith('fe8') ||
    v6.startsWith('fe9') ||
    v6.startsWith('fea') ||
    v6.startsWith('feb') || // link-local
    v6.startsWith('ff') // multicast
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchRefused("That doesn't look like a web address.");
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchRefused('Only http and https links can be read.');
  }
  if (url.username || url.password) throw new FetchRefused('Links with a username or password are not read.');
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new FetchRefused('Only links on the standard web ports can be read.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new FetchRefused('Links to this computer or the local network are not read.');
  }
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new FetchRefused(`Couldn't find the website "${host}". Check the link.`);
  }
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new FetchRefused('Links to this computer or the local network are not read.');
  }
  return url;
}

async function readLimited(response: Response): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) throw new FetchRefused('That file is larger than 14 MB.');
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new FetchRefused('That file is larger than 14 MB.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function fetchPublic(raw: string): Promise<{ body: Buffer; contentType: string; finalUrl: string }> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; ; hop++) {
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/pdf,text/plain,image/*;q=0.9,*/*;q=0.5' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') throw new FetchRefused(`The website didn't answer within ${TIMEOUT_MS / 1000}s.`);
      throw new FetchRefused(`Couldn't reach the website (${(err as Error).message}).`);
    }

    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      if (hop >= MAX_REDIRECTS) throw new FetchRefused('The link redirects too many times.');
      // Check every hop, so a public link can't bounce to a private address.
      url = await assertPublicUrl(new URL(response.headers.get('location')!, url).toString());
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      throw new FetchRefused(
        `The website refused access (HTTP ${response.status}). It may need a login; download or copy the content instead.`,
      );
    }
    if (response.status === 404) throw new FetchRefused('The website says this page does not exist (HTTP 404).');
    if (!response.ok) throw new FetchRefused(`The website answered with an error (HTTP ${response.status}).`);

    return {
      body: await readLimited(response),
      contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      finalUrl: url.toString(),
    };
  }
}

export function linkFetcher(): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const [path, query = ''] = (req.url ?? '').split('?');
    if (path !== '/api/fetch-url' || req.method !== 'GET') {
      next();
      return;
    }
    const target = new URLSearchParams(query).get('url');
    if (!target) {
      sendJson(res, 400, { error: 'No link given.' });
      return;
    }
    try {
      const { body, contentType, finalUrl } = await fetchPublic(target);
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Final-Url', encodeURI(finalUrl));
      res.end(body);
    } catch (err) {
      sendJson(res, err instanceof FetchRefused ? 422 : 502, { error: (err as Error).message });
    }
  };

  return {
    name: 'corkline-link-fetcher',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
