import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Small server-side proxy between the browser and Google's Gemini API.
 *
 * The API key lives only here (read from app/.env.local, which git ignores) and is
 * never sent to the browser. The browser posts { system, messages } to /api/ai/chat;
 * this forwards it to Gemini and returns { text, model } or { error }.
 *
 * A turn can carry files (PDF, image, audio) as base64, and a request can ask for
 * JSON matching a schema (used when drafting cards from a document).
 *
 * Runs inside the Vite dev server (`npm run dev`) and `npm run preview`.
 */

export interface AiProxyOptions {
  apiKey: string | undefined;
  model: string;
}

interface InlineFile {
  mimeType: string;
  /** base64, no data: prefix */
  data: string;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  files?: InlineFile[];
}

interface ChatRequest {
  system?: string;
  messages: ChatTurn[];
  /** When set, Gemini must answer with JSON matching this (Gemini Schema format). */
  responseSchema?: Record<string, unknown>;
  /** Model picked in the app; falls back to GEMINI_MODEL when missing. */
  model?: string;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Gemini text-chat models the app may ask for, e.g. gemini-3.5-flash-lite,
 * gemini-3.1-pro-preview, gemini-flash-latest. Leaves out image, speech,
 * robotics and other special-purpose models, which can't do Corkline's chat.
 */
const CHAT_MODEL_PATTERN = /^gemini-(\d+(\.\d+)?-(flash|pro)(-lite)?(-preview)?|(flash|flash-lite|pro)-latest)$/;
const MODEL_LIST_CACHE_MS = 10 * 60_000;
// Reading a long PDF or an interview recording can take a couple of minutes.
const TIMEOUT_MS = 180_000;
// Big enough for one file up to the browser's 14 MB limit once base64-encoded.
const MAX_BODY_BYTES = 21_000_000;
const OVERLOAD_RETRY_DELAYS_MS = [2_000, 6_000];

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
  if (v.responseSchema !== undefined && (!v.responseSchema || typeof v.responseSchema !== 'object')) return false;
  if (v.model !== undefined && (typeof v.model !== 'string' || !CHAT_MODEL_PATTERN.test(v.model))) return false;
  return (
    Array.isArray(v.messages) &&
    v.messages.length > 0 &&
    v.messages.every(
      (m) =>
        m &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.text === 'string' &&
        (m.files === undefined ||
          (Array.isArray(m.files) &&
            m.files.every(
              (f: unknown) =>
                !!f &&
                typeof (f as InlineFile).mimeType === 'string' &&
                typeof (f as InlineFile).data === 'string',
            ))),
    )
  );
}

/** Google lists some models it then refuses for this key (e.g. older ones for new accounts). */
class ModelUnavailableError extends Error {
  readonly model: string;
  constructor(model: string, detail: string) {
    super(`${model} isn't available to this API key. (${detail})`);
    this.model = model;
  }
}

async function callGemini(opts: AiProxyOptions, body: ChatRequest): Promise<{ text: string; model: string }> {
  const model = body.model ?? opts.model;
  const payload = {
    ...(body.system ? { systemInstruction: { parts: [{ text: body.system }] } } : {}),
    contents: body.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(m.files ?? []).map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.data } })),
        { text: m.text },
      ],
    })),
    ...(body.responseSchema
      ? { generationConfig: { responseMimeType: 'application/json', responseSchema: body.responseSchema } }
      : {}),
  };

  // Google often answers 503 "high demand" for a few seconds at a time, so try again
  // after a short pause before giving up. Anything else fails straight away.
  let response: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`, {
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
    if (response.status !== 503 || attempt >= OVERLOAD_RETRY_DELAYS_MS.length) break;
    await new Promise((r) => setTimeout(r, OVERLOAD_RETRY_DELAYS_MS[attempt]));
  }

  const data = (await response.json().catch(() => null)) as {
    error?: { message?: string; status?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
  } | null;

  if (!response.ok) {
    const detail = data?.error?.message ?? response.statusText;
    if (response.status === 429) {
      throw new Error(`Free-tier limit reached for ${model}. Wait a minute and retry, or pick another model. (${detail})`);
    }
    if (response.status === 404) throw new ModelUnavailableError(model, detail);
    if (response.status === 503) {
      throw new Error(`Gemini is overloaded right now (tried ${OVERLOAD_RETRY_DELAYS_MS.length + 1} times). Wait a minute and retry. (${detail})`);
    }
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
  return { text, model };
}

/** Asks Google which chat models this key can use. Cached, since the list rarely changes. */
function createModelLister(opts: AiProxyOptions) {
  let cache: { at: number; models: string[] } | null = null;
  return async (): Promise<string[]> => {
    if (cache && Date.now() - cache.at < MODEL_LIST_CACHE_MS) return cache.models;
    const response = await fetch(`${GEMINI_BASE}?pageSize=200`, {
      headers: { 'x-goog-api-key': opts.apiKey! },
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await response.json().catch(() => null)) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      error?: { message?: string };
    } | null;
    if (!response.ok) throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
    const models = (data?.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter((name) => CHAT_MODEL_PATTERN.test(name))
      // Versioned models newest first, then the "-latest" aliases.
      .sort((a, b) => {
        const aliasOrder = Number(a.endsWith('-latest')) - Number(b.endsWith('-latest'));
        return aliasOrder || b.localeCompare(a, undefined, { numeric: true });
      });
    cache = { at: Date.now(), models };
    return models;
  };
}

function createHandler(opts: AiProxyOptions) {
  const listModels = createModelLister(opts);

  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split('?')[0];

    if (url === '/api/ai/status' && req.method === 'GET') {
      sendJson(res, 200, { configured: !!opts.apiKey, model: opts.model });
      return;
    }

    if (url === '/api/ai/models' && req.method === 'GET') {
      if (!opts.apiKey) {
        sendJson(res, 200, { default: opts.model, models: [opts.model] });
        return;
      }
      try {
        const models = await listModels();
        sendJson(res, 200, { default: opts.model, models: models.includes(opts.model) ? models : [opts.model, ...models] });
      } catch (err) {
        // Still usable: offer just the configured model.
        sendJson(res, 200, { default: opts.model, models: [opts.model], error: (err as Error).message });
      }
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
      } catch (err) {
        const tooLarge = (err as Error).message === 'Request too large';
        sendJson(res, tooLarge ? 413 : 400, {
          error: tooLarge ? 'That file is too large to send to Gemini in one request.' : 'Request body was not valid JSON.',
        });
        return;
      }
      if (!isChatRequest(parsed)) {
        sendJson(res, 400, {
          error: 'Request must be { system?, messages: [{ role, text, files? }], responseSchema?, model? } with a Gemini chat model.',
        });
        return;
      }
      try {
        sendJson(res, 200, await callGemini(opts, parsed));
      } catch (err) {
        if (err instanceof ModelUnavailableError) {
          sendJson(res, 404, { error: err.message, unavailableModel: err.model });
        } else {
          sendJson(res, 502, { error: (err as Error).message });
        }
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
