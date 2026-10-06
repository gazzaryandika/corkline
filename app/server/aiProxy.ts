import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Small server-side proxy between the browser and Google's Gemini API.
 *
 * The API key lives only here (read from app/.env.local, which git ignores) and is
 * never sent to the browser. The browser posts { system, messages } to /api/ai/chat;
 * this forwards it to Gemini and returns { text, model } or { error }.
 *
 * Runs inside the Vite dev server (`npm run dev`) and `npm run preview`.
 */

export interface AiProxyOptions {
  apiKey: string | undefined;
  model: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface ChatRequest {
  system?: string;
  messages: ChatTurn[];
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 60_000;
const MAX_BODY_BYTES = 1_000_000;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isChatRequest(value: unknown): value is ChatRequest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.system !== undefined && typeof v.system !== 'string') return false;
  return (
    Array.isArray(v.messages) &&
    v.messages.length > 0 &&
    v.messages.every(
      (m) =>
        m && typeof m === 'object' && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string',
    )
  );
}

async function callGemini(opts: AiProxyOptions, body: ChatRequest): Promise<{ text: string; model: string }> {
  const payload = {
    ...(body.system ? { systemInstruction: { parts: [{ text: body.system }] } } : {}),
    contents: body.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
  };

  let response: Response;
  try {
    response = await fetch(`${GEMINI_BASE}/${encodeURIComponent(opts.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey! },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as Error).name;
    if (name === 'TimeoutError') throw new Error(`Gemini didn't answer within ${TIMEOUT_MS / 1000}s.`);
    throw new Error(`Couldn't reach Gemini (${(err as Error).message}). Are you online?`);
  }

  const data = (await response.json().catch(() => null)) as {
    error?: { message?: string; status?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  } | null;

  if (!response.ok) {
    const detail = data?.error?.message ?? response.statusText;
    if (response.status === 429) throw new Error(`Free-tier rate limit hit — wait a minute and retry. (${detail})`);
    throw new Error(`Gemini error ${response.status}: ${detail}`);
  }
  if (data?.promptFeedback?.blockReason) {
    throw new Error(`Gemini refused the request (${data.promptFeedback.blockReason}).`);
  }

  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) {
    throw new Error(`Gemini returned an empty answer${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}.`);
  }
  return { text, model: opts.model };
}

function createHandler(opts: AiProxyOptions) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split('?')[0];

    if (url === '/api/ai/status' && req.method === 'GET') {
      sendJson(res, 200, { configured: !!opts.apiKey, model: opts.model });
      return;
    }

    if (url === '/api/ai/chat' && req.method === 'POST') {
      if (!opts.apiKey) {
        sendJson(res, 503, { error: 'No Gemini API key set. Add GEMINI_API_KEY to app/.env.local and restart the dev server.' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readBody(req));
      } catch {
        sendJson(res, 400, { error: 'Request body was not valid JSON.' });
        return;
      }
      if (!isChatRequest(parsed)) {
        sendJson(res, 400, { error: 'Request must be { system?: string, messages: [{ role, text }] }.' });
        return;
      }
      try {
        sendJson(res, 200, await callGemini(opts, parsed));
      } catch (err) {
        sendJson(res, 502, { error: (err as Error).message });
      }
      return;
    }

    next();
  };
}

export function aiProxy(opts: AiProxyOptions): Plugin {
  const handler = createHandler(opts);
  return {
    name: 'corkline-ai-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
