import { EDGE_KINDS, NODE_TYPES } from '../config';
import type { AnyNode, CardNode, RelationEdgeType } from '../state/useBoardState';

const MAX_CONTEXT_CHARS = 40_000;

/**
 * Writes the board out as plain text the model can read. Cards get short labels
 * (C1, C2…) instead of UUIDs so the model can refer to them reliably, and
 * selected cards are marked so the model knows what the user is pointing at.
 */
export function describeBoard(nodes: AnyNode[], edges: RelationEdgeType[], gapIds: Set<string>): string {
  const cards = nodes.filter((n): n is CardNode => n.type === 'card');
  if (cards.length === 0) return 'The board is empty.';

  const groupLabels = new Map(
    nodes.filter((n) => n.type === 'group').map((g) => [g.id, String(g.data.label || 'Untitled group')]),
  );
  const label = new Map(cards.map((c, i) => [c.id, `C${i + 1}`]));

  const cardLines = cards.map((c) => {
    const type = NODE_TYPES[c.data.nodeType].label;
    const flags = [
      c.selected ? 'SELECTED' : null,
      gapIds.has(c.id) ? 'GAP: needs evidence but nothing links into it' : null,
      c.parentId && groupLabels.has(c.parentId) ? `in group "${groupLabels.get(c.parentId)}"` : null,
    ].filter(Boolean);
    const title = c.data.title.trim() || '(untitled)';
    const body = c.data.body.trim();
    return [
      `${label.get(c.id)} [${type}] ${title}${flags.length ? `  (${flags.join('; ')})` : ''}`,
      body ? `    ${body.replace(/\n/g, '\n    ')}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  });

  const edgeLines = edges
    .filter((e) => label.has(e.source) && label.has(e.target) && e.data)
    .map((e) => `${label.get(e.source)} —${EDGE_KINDS[e.data!.kind].label}→ ${label.get(e.target)}`);

  const text = [
    `CARDS (${cards.length}):`,
    ...cardLines,
    '',
    `RELATIONSHIPS (${edgeLines.length}):`,
    ...(edgeLines.length ? edgeLines : ['(none)']),
  ].join('\n');

  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS)}\n…(board truncated)` : text;
}
