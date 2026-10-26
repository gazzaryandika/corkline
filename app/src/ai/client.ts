/**
 * Browser-side entry point for every AI feature. Features call `askAi()` and never
 * talk to Google directly — live requests go through the dev-server proxy
 * (server/aiProxy.ts), which holds the API key.
 *
 * Two modes:
 * - 'mock': canned reply after a short delay. Free, offline, for building UI.
 * - 'gemini': real model call via the proxy.
 */

import { getAiModel, markModelUnavailable } from './mode';

export type AiMode = 'mock' | 'gemini';

/** A file for the model: inline base64 (no data: prefix), or a public YouTube link Gemini watches itself. */
export type AiFile = { mimeType: string; data: string } | { fileUri: string };

export interface AiTurn {
  role: 'user' | 'assistant';
  text: string;
  /** Files the model should read along with the text (PDF, image, audio). */
  files?: AiFile[];
}

export interface AiRequest {
  system?: string;
  messages: AiTurn[];
  /** Ask for JSON matching this schema (Gemini Schema format) instead of free text. */
  responseSchema?: Record<string, unknown>;
}

/** Chat models this API key can use, newest first, plus the one set in .env.local. */
export interface AiModelList {
  default: string;
  models: string[];
}

export interface AiReply {
  text: string;
  /** Which model actually produced this answer ('mock' for canned replies). */
  model: string;
}

export interface AiStatus {
  configured: boolean;
  model: string;
}

const MOCK_DELAY_MS = 600;

export class AiError extends Error {}

export async function askAi(mode: AiMode, request: AiRequest): Promise<AiReply> {
  if (mode === 'mock') {
    await new Promise((r) => setTimeout(r, MOCK_DELAY_MS));
    const last = request.messages[request.messages.length - 1]?.text ?? '';
    const [context, question = last] = last.split('\n\nQUESTION\n');
    return {
      model: 'mock',
      text:
        `[Mock reply — no model was called]\nYou asked: "${question.slice(0, 120)}"\n` +
        `A real request would send ${last.length.toLocaleString()} characters` +
        `${question !== last ? ` (${(context.length).toLocaleString()} of them describing the board)` : ''}.`,
    };
  }

  let response: Response;
  try {
    response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The model picked in the app, if any; otherwise the server uses GEMINI_MODEL.
      body: JSON.stringify({ ...request, model: getAiModel() ?? undefined }),
    });
  } catch {
    throw new AiError('Could not reach the Corkline dev server. Is `npm run dev` still running?');
  }

  const data = (await response.json().catch(() => null)) as
    | (Partial<AiReply> & { error?: string; unavailableModel?: string })
    | null;
  if (data?.unavailableModel) {
    // Grey it out in the model list and go back to the default, so Retry just works.
    markModelUnavailable(data.unavailableModel);
    throw new AiError(`${data.error} Switched back to the default model; press Retry.`);
  }
  if (!response.ok || !data || typeof data.text !== 'string') {
    throw new AiError(data?.error ?? `AI request failed (HTTP ${response.status}).`);
  }
  return { text: data.text, model: data.model ?? 'unknown' };
}

let modelListPromise: Promise<AiModelList | null> | null = null;

/** Fetched once per page load (the server caches Google's answer too). */
export function fetchAiModels(): Promise<AiModelList | null> {
  if (!modelListPromise) {
    modelListPromise = fetch('/api/ai/models')
      .then((r) => (r.ok ? (r.json() as Promise<AiModelList>) : null))
      .catch(() => null)
      .then((list) => {
        if (!list) modelListPromise = null; // try again next time
        return list;
      });
  }
  return modelListPromise;
}

export async function fetchAiStatus(): Promise<AiStatus | null> {
  try {
    const response = await fetch('/api/ai/status');
    if (!response.ok) return null;
    return (await response.json()) as AiStatus;
  } catch {
    return null;
  }
}
