import { NODE_TYPE_ORDER, NODE_TYPES } from '../config';
import type { CardNode, AnyNode } from '../state/useBoardState';
import type { NodeTypeId, ProjectBrief, ThemeProposal } from '../types';
import { AiError, askAi, type AiMode } from './client';
import { describeBrief } from './boardContext';
import { THEMES_SYSTEM_PROMPT } from './prompts';
import { stripMarkdown } from './plainText';

/**
 * Finds themes among the cards on the board: groups of same-type cards that share a
 * thread, for the designer to review. Only cards not already in a group frame are
 * considered, so the designer's own groupings are left alone.
 */

export interface ThemesResult {
  themes: ThemeProposal[];
  model: string;
  /** How many cards were looked at, and (whole-board runs) how many were skipped because they're already grouped. */
  considered: number;
  alreadyGrouped: number;
  /** The model's one-sentence explanation when it found no themes. */
  note: string;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    note: { type: 'STRING' },
    themes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: NODE_TYPE_ORDER },
          name: { type: 'STRING' },
          description: { type: 'STRING' },
          cards: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['type', 'name', 'description', 'cards'],
        propertyOrdering: ['type', 'cards', 'name', 'description'],
      },
    },
  },
  required: ['themes'],
};

/**
 * `selectedIds`: look only at these cards (the designer's selection, even if some are
 * already in a group). Without it, every card not yet in a group is considered.
 */
export async function findThemes(
  mode: AiMode,
  nodes: AnyNode[],
  brief: ProjectBrief,
  selectedIds?: string[],
): Promise<ThemesResult> {
  const cards = nodes.filter((n): n is CardNode => n.type === 'card');
  const selection = selectedIds ? new Set(selectedIds) : null;
  const free = selection ? cards.filter((c) => selection.has(c.id)) : cards.filter((c) => !c.parentId);
  const alreadyGrouped = selection ? 0 : cards.length - free.length;

  // Short references for the model (c1, c2…); never shown to the designer.
  const refToId = new Map(free.map((c, i) => [`c${i + 1}`, c.id]));
  const typeOf = new Map(free.map((c) => [c.id, c.data.nodeType]));

  const enoughToGroup = NODE_TYPE_ORDER.some((t) => free.filter((c) => c.data.nodeType === t).length >= 2);
  if (!enoughToGroup) {
    return {
      themes: [],
      model: mode === 'mock' ? 'mock' : 'none',
      considered: free.length,
      alreadyGrouped,
      note: 'A theme needs at least two cards of the same type.',
    };
  }

  if (mode === 'mock') return mockThemes(free, alreadyGrouped);

  const lines: string[] = [];
  free.forEach((c, i) => {
    const body = c.data.body.trim().replace(/\s+/g, ' ');
    lines.push(`c${i + 1} [${NODE_TYPES[c.data.nodeType].label}] ${c.data.title.trim() || 'untitled'}${body ? ` — ${body}` : ''}`);
  });
  const heading = selection ? `CARDS SELECTED BY THE DESIGNER (${free.length})` : `CARDS NOT IN A GROUP (${free.length})`;
  const message = `PROJECT BRIEF\n${describeBrief(brief)}\n\n${heading}\n${lines.join('\n')}`;

  const reply = await askAi('gemini', {
    system: THEMES_SYSTEM_PROMPT,
    messages: [{ role: 'user', text: message }],
    responseSchema: RESPONSE_SCHEMA,
  });

  let data: unknown;
  try {
    data = JSON.parse(reply.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AiError('Gemini answered, but not in the expected format. Try again.');
  }

  // Check everything the model says: real card references, one type per theme,
  // each card in one theme only, at least two cards per theme.
  const used = new Set<string>();
  const themes: ThemeProposal[] = [];
  const raw = Array.isArray((data as { themes?: unknown })?.themes) ? (data as { themes: unknown[] }).themes : [];
  for (const item of raw) {
    const t = (item ?? {}) as Record<string, unknown>;
    const nodeType = String(t.type ?? '').toLowerCase() as NodeTypeId;
    if (!(nodeType in NODE_TYPES) || typeof t.name !== 'string' || !Array.isArray(t.cards)) continue;
    const cardIds = t.cards
      .map((ref) => refToId.get(String(ref).trim().toLowerCase()))
      .filter((id): id is string => !!id && typeOf.get(id) === nodeType && !used.has(id));
    const unique = [...new Set(cardIds)];
    if (unique.length < 2) continue;
    unique.forEach((id) => used.add(id));
    themes.push({
      id: crypto.randomUUID(),
      nodeType,
      name: stripMarkdown(t.name).trim().slice(0, 80),
      description: typeof t.description === 'string' ? stripMarkdown(t.description).trim() : '',
      cardIds: unique,
      decision: 'pending',
    });
  }
  const note = (data as { note?: unknown })?.note;
  return {
    themes,
    model: reply.model,
    considered: free.length,
    alreadyGrouped,
    note: themes.length === 0 && typeof note === 'string' ? stripMarkdown(note).trim() : '',
  };
}

/** Mock mode: same-type cards in batches of up to three, no API call. */
async function mockThemes(free: CardNode[], alreadyGrouped: number): Promise<ThemesResult> {
  await new Promise((r) => setTimeout(r, 700));
  const themes: ThemeProposal[] = [];
  for (const t of NODE_TYPE_ORDER) {
    const ofType = free.filter((c) => c.data.nodeType === t);
    for (let i = 0; i + 1 < ofType.length; i += 3) {
      const batch = ofType.slice(i, i + 3);
      if (batch.length < 2) break;
      themes.push({
        id: crypto.randomUUID(),
        nodeType: t,
        name: `Mock ${NODE_TYPES[t].label} theme ${themes.filter((x) => x.nodeType === t).length + 1}`,
        description: '[Mock: no model was called] Cards batched in board order, not by meaning.',
        cardIds: batch.map((c) => c.id),
        decision: 'pending',
      });
    }
  }
  return { themes, model: 'mock', considered: free.length, alreadyGrouped, note: '' };
}
