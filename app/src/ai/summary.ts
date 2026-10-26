import { NODE_TYPES } from '../config';
import type { AnyNode, CardNode, RelationEdgeType } from '../state/useBoardState';
import type { ProjectBrief } from '../types';
import type { TraceIssue } from '../lib/trace';
import { AiError, askAi, type AiMode } from './client';
import { describeBoard, describeBrief } from './boardContext';
import { SUMMARY_SYSTEM_PROMPT } from './prompts';
import { stripMarkdown } from './plainText';

/**
 * Writes a summary of some cards (the designer's selection) or of the whole board,
 * for a summary note on the board.
 */

export interface SummaryResult {
  title: string;
  body: string;
  model: string;
  /** The cards it covers, for highlighting them later. */
  cardIds: string[];
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
  },
  required: ['title', 'summary'],
  propertyOrdering: ['title', 'summary'],
};

export async function summarise(
  mode: AiMode,
  nodes: AnyNode[],
  edges: RelationEdgeType[],
  traceIssues: Map<string, TraceIssue[]>,
  brief: ProjectBrief,
  /** Only these cards; without it, every card on the board. */
  selectedIds?: string[],
): Promise<SummaryResult> {
  const allCards = nodes.filter((n): n is CardNode => n.type === 'card');
  const wanted = selectedIds ? new Set(selectedIds) : null;
  const cards = wanted ? allCards.filter((c) => wanted.has(c.id)) : allCards;
  if (cards.length === 0) throw new AiError('There are no cards to summarise yet.');
  const cardIds = cards.map((c) => c.id);

  if (mode === 'mock') {
    await new Promise((r) => setTimeout(r, 600));
    return {
      model: 'mock',
      cardIds,
      title: `Mock summary of ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`,
      body:
        '[Mock: no model was called] A real summary would describe what these cards say together. Covered:\n' +
        cards
          .slice(0, 6)
          .map((c) => `- ${NODE_TYPES[c.data.nodeType].label} "${c.data.title.trim() || 'untitled'}"`)
          .join('\n') +
        (cards.length > 6 ? `\n- and ${cards.length - 6} more` : ''),
    };
  }

  // Only the chosen cards (plus the frames they sit in) and the links between them,
  // without selection marks: the summary is about the cards, not what's selected.
  const ids = new Set(cardIds);
  const scopedNodes = nodes
    .filter((n) => ids.has(n.id) || n.type === 'group')
    .map((n) => (n.selected ? { ...n, selected: false } : n)) as AnyNode[];
  const scopedEdges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const scope = wanted ? `CARDS SELECTED BY THE DESIGNER (${cards.length})` : `THE WHOLE BOARD (${cards.length} cards)`;

  const reply = await askAi('gemini', {
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        text: `PROJECT BRIEF\n${describeBrief(brief)}\n\n${scope}\n${describeBoard(scopedNodes, scopedEdges, traceIssues)}`,
      },
    ],
    responseSchema: RESPONSE_SCHEMA,
  });

  let data: { title?: unknown; summary?: unknown };
  try {
    data = JSON.parse(reply.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AiError('Gemini answered, but not in the expected format. Try again.');
  }
  const body = typeof data.summary === 'string' ? stripMarkdown(data.summary).trim() : '';
  if (!body) throw new AiError('Gemini returned an empty summary. Try again.');
  const title = typeof data.title === 'string' ? stripMarkdown(data.title).trim().slice(0, 100) : '';
  return { title: title || 'Summary', body, model: reply.model, cardIds };
}
