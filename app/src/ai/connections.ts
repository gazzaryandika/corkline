import { EDGE_KIND_ORDER, NODE_TYPE_ORDER, NODE_TYPES } from '../config';
import type { AnyNode, CardNode, RelationEdgeType } from '../state/useBoardState';
import type { EdgeKindId, ProjectBrief } from '../types';
import { AiError, askAi, type AiMode } from './client';
import { isStepLink, issueText, type TraceIssue } from '../lib/trace';
import { describeBrief } from './boardContext';
import { CONNECTIONS_SYSTEM_PROMPT } from './prompts';
import { stripMarkdown } from './plainText';

/**
 * Proposes links between cards already on the board, from a request in the chat
 * ("the coins evidence supports the invisible-money insight", "find connections").
 * The designer reviews every proposal before anything is drawn.
 */

export interface LinkProposal {
  id: string;
  source: string;
  target: string;
  kind: EdgeKindId;
  reason: string;
  decision: 'pending' | 'accepted' | 'rejected';
}

export interface ConnectionsResult {
  links: LinkProposal[];
  /** The model's question when the request was ambiguous (then there are no links). */
  question: string;
  /** Why there are no links, when there aren't. */
  note: string;
  model: string;
  /** Suggestions left out because they skipped a column (e.g. Assumption → Prototype). */
  skipped: number;
}

const MAX_LINKS = 15;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    question: { type: 'STRING' },
    note: { type: 'STRING' },
    links: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          from: { type: 'STRING' },
          to: { type: 'STRING' },
          type: { type: 'STRING', enum: EDGE_KIND_ORDER },
          reason: { type: 'STRING' },
        },
        required: ['from', 'to', 'type', 'reason'],
        propertyOrdering: ['from', 'type', 'to', 'reason'],
      },
    },
  },
  required: ['links'],
};

/** True if this link (or, for contradicts, its reverse) is already on the board. */
export function linkExists(edges: RelationEdgeType[], source: string, target: string, kind: EdgeKindId): boolean {
  return edges.some(
    (e) =>
      e.data?.kind === kind &&
      ((e.source === source && e.target === target) || (kind === 'contradicts' && e.source === target && e.target === source)),
  );
}

export async function proposeConnections(
  mode: AiMode,
  request: string,
  nodes: AnyNode[],
  edges: RelationEdgeType[],
  traceIssues: Map<string, TraceIssue[]>,
  brief: ProjectBrief,
  selectedIds: string[],
): Promise<ConnectionsResult> {
  const cards = nodes.filter((n): n is CardNode => n.type === 'card');
  if (cards.length < 2) throw new AiError('Links need at least two cards on the board.');
  const selected = new Set(selectedIds);

  if (mode === 'mock') return mockConnections(cards, edges, traceIssues, selected);

  // Short references for the model (c1, c2…); never shown to the designer.
  const refOf = new Map(cards.map((c, i) => [c.id, `c${i + 1}`]));
  const idOf = new Map([...refOf].map(([id, ref]) => [ref, id]));
  const cardLines = cards.map((c) => {
    const issues = traceIssues.get(c.id);
    const flags = [
      selected.has(c.id) ? 'SELECTED' : null,
      issues ? `GAP: ${issues.map((i) => issueText(i, c.data.nodeType)).join(', ')}` : null,
      c.data.fromPrototypeId && refOf.has(c.data.fromPrototypeId) ? `result of testing ${refOf.get(c.data.fromPrototypeId)}` : null,
    ].filter(Boolean);
    const body = c.data.body.trim().replace(/\s+/g, ' ');
    return `${refOf.get(c.id)} [${NODE_TYPES[c.data.nodeType].label}] ${c.data.title.trim() || 'untitled'}${body ? ` — ${body}` : ''}${flags.length ? `  (${flags.join(', ')})` : ''}`;
  });
  const edgeLines = edges
    .filter((e) => refOf.has(e.source) && refOf.has(e.target) && e.data)
    .map((e) => `${refOf.get(e.source)} ${e.data!.kind} ${refOf.get(e.target)}`);

  const message = [
    `PROJECT BRIEF\n${describeBrief(brief)}`,
    `CARDS (${cards.length})\n${cardLines.join('\n')}`,
    `EXISTING LINKS (${edgeLines.length})\n${edgeLines.length ? edgeLines.join('\n') : '(none)'}`,
    `THE DESIGNER'S REQUEST\n${request}`,
  ].join('\n\n');

  const reply = await askAi('gemini', {
    system: CONNECTIONS_SYSTEM_PROMPT,
    messages: [{ role: 'user', text: message }],
    responseSchema: RESPONSE_SCHEMA,
  });

  let data: { question?: unknown; note?: unknown; links?: unknown };
  try {
    data = JSON.parse(reply.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw new AiError('Gemini answered, but not in the expected format. Try again.');
  }

  // Check everything: real cards, two different ones, a valid type, one step at a time
  // along the columns, not already on the board or proposed twice, and (with a
  // selection) touching a selected card.
  const typeOf = new Map(cards.map((c) => [c.id, c.data.nodeType]));
  const links: LinkProposal[] = [];
  let skipped = 0;
  const raw = Array.isArray(data.links) ? data.links : [];
  for (const item of raw) {
    const l = (item ?? {}) as Record<string, unknown>;
    const source = idOf.get(String(l.from ?? '').trim().toLowerCase());
    const target = idOf.get(String(l.to ?? '').trim().toLowerCase());
    const kind = String(l.type ?? '').toLowerCase() as EdgeKindId;
    if (!source || !target || source === target || !EDGE_KIND_ORDER.includes(kind)) continue;
    if (!isStepLink(typeOf.get(source)!, typeOf.get(target)!, kind)) {
      skipped++;
      continue;
    }
    if (selected.size > 0 && !selected.has(source) && !selected.has(target)) continue;
    if (linkExists(edges, source, target, kind)) continue;
    if (links.some((p) => p.kind === kind && ((p.source === source && p.target === target) || (kind === 'contradicts' && p.source === target && p.target === source)))) continue;
    links.push({
      id: crypto.randomUUID(),
      source,
      target,
      kind,
      reason: typeof l.reason === 'string' ? stripMarkdown(l.reason).trim() : '',
      decision: 'pending',
    });
    if (links.length >= MAX_LINKS) break;
  }

  const text = (v: unknown) => (typeof v === 'string' ? withCardNames(stripMarkdown(v), cards, idOf).trim() : '');
  return {
    links,
    question: links.length === 0 ? text(data.question) : '',
    note: links.length === 0 ? text(data.note) : '',
    model: reply.model,
    skipped,
  };
}

/**
 * The model sometimes mentions its internal card references in prose ("the Prototype
 * (c9)"); the designer never sees those, so name the card instead: Prototype "Piggy bank v1".
 */
export function withCardNames(text: string, cards: CardNode[], idOf: Map<string, string>): string {
  const name = (ref: string) => {
    const card = cards.find((c) => c.id === idOf.get(ref.toLowerCase()));
    return card ? `${NODE_TYPES[card.data.nodeType].label} "${card.data.title.trim() || 'untitled'}"` : null;
  };
  const typeWords = Object.values(NODE_TYPES).map((t) => t.label).join('|');
  return text
    .replace(new RegExp(`\\b(?:${typeWords})\\s*\\(?\\b(c\\d+)\\b\\)?`, 'gi'), (m, ref: string) => name(ref) ?? m)
    .replace(/\(?\b(c\d+)\b\)?/gi, (m, ref: string) => name(ref) ?? m);
}

/** Mock mode: links every card that needs one (GAP) from a card in the column just
 * before it ("leads to", or "supports" for an Insight), no API call. */
async function mockConnections(
  cards: CardNode[],
  edges: RelationEdgeType[],
  traceIssues: Map<string, TraceIssue[]>,
  selected: Set<string>,
): Promise<ConnectionsResult> {
  await new Promise((r) => setTimeout(r, 600));
  const links: LinkProposal[] = [];
  for (const target of cards.filter((c) => traceIssues.get(c.id)?.includes('needs-previous'))) {
    const previousType = NODE_TYPE_ORDER[NODE_TYPE_ORDER.indexOf(target.data.nodeType) - 1];
    const kind: EdgeKindId = target.data.nodeType === 'insight' ? 'supports' : 'leads';
    const source = cards.find(
      (c) => c.data.nodeType === previousType && (selected.size === 0 || selected.has(c.id) || selected.has(target.id)),
    );
    if (!source || linkExists(edges, source.id, target.id, kind)) continue;
    links.push({
      id: crypto.randomUUID(),
      source: source.id,
      target: target.id,
      kind,
      reason: '[Mock: no model was called] Picked without reading.',
      decision: 'pending',
    });
    if (links.length >= 3) break;
  }
  return {
    links,
    question: '',
    note: links.length === 0 ? '[Mock] No card needs a link, or the column before it is empty.' : '',
    model: 'mock',
    skipped: 0,
  };
}
