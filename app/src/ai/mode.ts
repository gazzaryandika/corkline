import { useSyncExternalStore } from 'react';
import type { AiMode } from './client';

/**
 * The Mock / Gemini switch and the chosen Gemini model, shared by every AI feature
 * (chat, reading documents) so changing them in one place applies everywhere.
 * Remembered in localStorage.
 */

const MODE_STORAGE_KEY = 'corkline-ai-mode';
const listeners = new Set<() => void>();

function loadMode(): AiMode {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'gemini' ? 'gemini' : 'mock';
  } catch {
    return 'mock';
  }
}

let current: AiMode = loadMode();

export function setAiMode(mode: AiMode): void {
  current = mode;
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Remembering the mode is a convenience only.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAiMode(): [AiMode, (mode: AiMode) => void] {
  const mode = useSyncExternalStore(subscribe, () => current);
  return [mode, setAiMode];
}

// ---- which Gemini model; null means the server's default (GEMINI_MODEL in .env.local) ----

const MODEL_STORAGE_KEY = 'corkline-ai-model';

function loadModel(): string | null {
  try {
    return localStorage.getItem(MODEL_STORAGE_KEY);
  } catch {
    return null;
  }
}

let currentModel: string | null = loadModel();

export function getAiModel(): string | null {
  return currentModel;
}

export function setAiModel(model: string | null): void {
  currentModel = model;
  try {
    if (model) localStorage.setItem(MODEL_STORAGE_KEY, model);
    else localStorage.removeItem(MODEL_STORAGE_KEY);
  } catch {
    // Remembering the model is a convenience only.
  }
  listeners.forEach((l) => l());
}

export function useAiModel(): [string | null, (model: string | null) => void] {
  const model = useSyncExternalStore(subscribe, () => currentModel);
  return [model, setAiModel];
}

// ---- models Google refused for this key (listed but "not available"), greyed out in the picker ----

const UNAVAILABLE_STORAGE_KEY = 'corkline-ai-unavailable-models';

function loadUnavailable(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(UNAVAILABLE_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === 'string') : [];
  } catch {
    return [];
  }
}

let unavailable: string[] = loadUnavailable();

export function markModelUnavailable(model: string): void {
  if (!unavailable.includes(model)) {
    unavailable = [...unavailable, model];
    try {
      localStorage.setItem(UNAVAILABLE_STORAGE_KEY, JSON.stringify(unavailable));
    } catch {
      // Convenience only.
    }
  }
  if (currentModel === model) setAiModel(null);
  else listeners.forEach((l) => l());
}

export function useUnavailableModels(): string[] {
  return useSyncExternalStore(subscribe, () => unavailable);
}
