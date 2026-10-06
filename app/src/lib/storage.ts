import { NODE_TYPES, EDGE_KINDS } from '../config';
import type { BoardDocument } from '../types';

// Bumped from v1 so a browser that already cached the old placeholder board
// loads the new seed fresh instead of silently reusing the stale localStorage entry.
const STORAGE_KEY = 'corkline-board-v2';

function isValidBoardDocument(value: unknown): value is BoardDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Record<string, unknown>;
  if (doc.version !== 1) return false;
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) return false;

  for (const node of doc.nodes) {
    if (!node || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    if (typeof n.id !== 'string' || !n.id) return false;
    if (!n.position || typeof (n.position as { x?: unknown }).x !== 'number') return false;

    if (n.type === 'group') {
      if (typeof n.width !== 'number' || typeof n.height !== 'number') return false;
      const data = n.data as Record<string, unknown> | undefined;
      if (!data || typeof data.label !== 'string') return false;
      continue;
    }

    if (n.parentId !== undefined && typeof n.parentId !== 'string') return false;
    const data = n.data as Record<string, unknown> | undefined;
    if (!data || typeof data.nodeType !== 'string' || !(data.nodeType in NODE_TYPES)) return false;
    if (data.link !== undefined && typeof data.link !== 'string') return false;
    if (data.image !== undefined && typeof data.image !== 'string') return false;
  }
  for (const edge of doc.edges) {
    if (!edge || typeof edge !== 'object') return false;
    const e = edge as Record<string, unknown>;
    if (typeof e.id !== 'string' || typeof e.source !== 'string' || typeof e.target !== 'string') return false;
    const data = e.data as Record<string, unknown> | undefined;
    if (!data || typeof data.kind !== 'string' || !(data.kind in EDGE_KINDS)) return false;
  }
  return true;
}

export function loadBoard(): BoardDocument | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isValidBoardDocument(parsed)) return parsed;
    console.warn('Corkline: stored board failed validation, ignoring it.');
    return null;
  } catch {
    console.warn('Corkline: stored board was not valid JSON, ignoring it.');
    return null;
  }
}

export function saveBoard(doc: BoardDocument): { ok: true } | { ok: false; reason: string } {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    return { ok: true };
  } catch (err) {
    const reason = err instanceof DOMException && err.name === 'QuotaExceededError'
      ? 'Browser storage is full.'
      : 'Browser storage is unavailable.';
    return { ok: false, reason };
  }
}

export function downloadBoard(doc: BoardDocument, filename = 'corkline-board.json'): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseImportedBoard(text: string): BoardDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!isValidBoardDocument(parsed)) {
    throw new Error('That file is not a Corkline board export.');
  }
  return parsed;
}

export { STORAGE_KEY };
