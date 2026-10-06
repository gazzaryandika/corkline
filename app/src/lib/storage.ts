import { NODE_TYPES, EDGE_KINDS, SOURCE_KINDS } from '../config';
import { copyProjectFiles, deleteProjectFiles } from './fileStore';
import type { BoardDocument } from '../types';

function isValidSource(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    typeof s.kind === 'string' &&
    s.kind in SOURCE_KINDS &&
    typeof s.mimeType === 'string' &&
    typeof s.size === 'number' &&
    typeof s.addedAt === 'number' &&
    (s.proposals === undefined || Array.isArray(s.proposals))
  );
}

function isValidCardSource(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.docId === 'string' &&
    typeof s.docName === 'string' &&
    typeof s.quote === 'string' &&
    (s.aiType === undefined || (typeof s.aiType === 'string' && s.aiType in NODE_TYPES))
  );
}

// The single-board key used before projects existed (bumped from v1 earlier so a
// cached placeholder board wasn't reused). Now only read once, for migration.
const LEGACY_KEY = 'corkline-board-v2';

function isValidBoardDocument(value: unknown): value is BoardDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Record<string, unknown>;
  if (doc.version !== 1) return false;
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) return false;
  if (doc.brief !== undefined) {
    if (!doc.brief || typeof doc.brief !== 'object') return false;
    if (!Object.values(doc.brief).every((v) => typeof v === 'string')) return false;
  }
  if (doc.sources !== undefined && (!Array.isArray(doc.sources) || !doc.sources.every(isValidSource))) return false;

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

    if (n.type === 'note') {
      const data = n.data as Record<string, unknown> | undefined;
      if (
        !data ||
        typeof data.title !== 'string' ||
        typeof data.body !== 'string' ||
        typeof data.createdAt !== 'number' ||
        !Array.isArray(data.sourceCardIds) ||
        !data.sourceCardIds.every((id) => typeof id === 'string') ||
        (data.scope !== 'selection' && data.scope !== 'board')
      ) {
        return false;
      }
      continue;
    }

    if (n.parentId !== undefined && typeof n.parentId !== 'string') return false;
    const data = n.data as Record<string, unknown> | undefined;
    if (!data || typeof data.nodeType !== 'string' || !(data.nodeType in NODE_TYPES)) return false;
    if (data.link !== undefined && typeof data.link !== 'string') return false;
    if (data.image !== undefined && typeof data.image !== 'string') return false;
    if (data.source !== undefined && !isValidCardSource(data.source)) return false;
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

/*
 * Storage layout (all in this browser's localStorage):
 * - INDEX_KEY holds the list of projects (id + timestamps).
 * - Each project's board lives under its own key, `corkline-project:<id>`.
 * - LEGACY_KEY is the single board saved before projects existed. It is copied into
 *   the first project on first run and then left untouched as a backup.
 */
const INDEX_KEY = 'corkline-projects-v1';

export function projectStorageKey(id: string): string {
  return `corkline-project:${id}`;
}

interface ProjectIndexEntry {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary extends ProjectIndexEntry {
  name: string;
  description: string;
  cardCount: number;
  /** True when the project's board data is missing or unreadable. */
  broken: boolean;
}

type SaveResult = { ok: true } | { ok: false; reason: string };

function failureReason(err: unknown): string {
  return err instanceof DOMException && err.name === 'QuotaExceededError'
    ? 'Browser storage is full.'
    : 'Browser storage is unavailable.';
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readIndex(): ProjectIndexEntry[] | null {
  const value = readJson(INDEX_KEY) as { projects?: unknown } | null;
  if (!value || !Array.isArray(value.projects)) return null;
  return value.projects.filter(
    (p): p is ProjectIndexEntry =>
      !!p && typeof p.id === 'string' && typeof p.createdAt === 'number' && typeof p.updatedAt === 'number',
  );
}

function writeIndex(projects: ProjectIndexEntry[]): SaveResult {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify({ version: 1, projects }));
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: failureReason(err) };
  }
}

export function loadBoard(id: string): BoardDocument | null {
  const parsed = readJson(projectStorageKey(id));
  if (parsed === null) return null;
  if (isValidBoardDocument(parsed)) return parsed;
  console.warn(`Corkline: stored board for project ${id} failed validation, ignoring it.`);
  return null;
}

export function saveBoard(id: string, doc: BoardDocument): SaveResult {
  try {
    localStorage.setItem(projectStorageKey(id), JSON.stringify(doc));
  } catch (err) {
    return { ok: false, reason: failureReason(err) };
  }
  const index = readIndex() ?? [];
  const now = Date.now();
  const next = index.some((p) => p.id === id)
    ? index.map((p) => (p.id === id ? { ...p, updatedAt: now } : p))
    : [...index, { id, createdAt: now, updatedAt: now }];
  return writeIndex(next);
}

/** Saves `doc` as a brand-new project and returns its id. */
export function createProject(doc: BoardDocument): { ok: true; id: string } | { ok: false; reason: string } {
  const id = crypto.randomUUID();
  const result = saveBoard(id, doc);
  return result.ok ? { ok: true, id } : result;
}

export function deleteProject(id: string): void {
  const index = readIndex() ?? [];
  writeIndex(index.filter((p) => p.id !== id));
  try {
    localStorage.removeItem(projectStorageKey(id));
  } catch {
    // The index no longer lists it, which is what the user sees.
  }
  deleteProjectFiles(id).catch((err) => console.warn('Corkline: could not delete the project’s files.', err));
}

/** Copies a project's board and its source files into a new project. */
export function duplicateProject(
  id: string,
  rename: (doc: BoardDocument) => BoardDocument,
): { ok: true; id: string } | { ok: false; reason: string } {
  const doc = loadBoard(id);
  if (!doc) return { ok: false, reason: 'The project could not be read.' };
  const result = createProject(rename(doc));
  if (result.ok) {
    copyProjectFiles(id, result.id).catch((err) => console.warn('Corkline: could not copy the project’s files.', err));
  }
  return result;
}

export function projectExists(id: string): boolean {
  return (readIndex() ?? []).some((p) => p.id === id);
}

/**
 * Makes sure at least the project list exists. On first run, the board saved before
 * projects existed (if any) becomes the first project; otherwise `fallback()` does.
 */
export function ensureProjects(fallback: () => BoardDocument): void {
  if (readIndex() !== null) return;
  const legacy = readJson(LEGACY_KEY);
  createProject(isValidBoardDocument(legacy) ? legacy : fallback());
}

export function listProjects(): ProjectSummary[] {
  return (readIndex() ?? [])
    .map((entry) => {
      const doc = loadBoard(entry.id);
      return {
        ...entry,
        name: doc?.brief?.name.trim() ?? '',
        description: doc?.brief?.description.trim() ?? '',
        cardCount: doc ? doc.nodes.filter((n) => n.type === 'card').length : 0,
        broken: !doc,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** e.g. "Triodos Project" → "corkline-triodos-project.json". */
export function exportFilename(projectName: string): string {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `corkline-${slug || 'board'}.json`;
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

