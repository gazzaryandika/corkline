import { EDGE_KINDS, NODE_TYPES, SOURCE_KINDS } from '../config';
import type { AnyNode, CardNode, RelationEdgeType } from '../state/useBoardState';
import type { ProjectBrief, SourceDoc } from '../types';

const MAX_CONTEXT_CHARS = 40_000;

/**
 * Writes the board out as plain text the model can read. Each card is named the
 * way a person would find it on the canvas — its type plus its title, e.g.
 * Insight "Physical money is understood" — so the model's answers can be traced
 * back without any internal codes. Selected cards are marked so the model knows
 * what the user is pointing at.
 */
export function describeBoard(nodes: AnyNode[], edges: RelationEdgeType[], gapIds: Set<string>): string {
  const cards = nodes.filter((n): n is CardNode => n.type === 'card');
  if (cards.length === 0) return 'The board is empty.';

  const groupLabels = new Map(
    nodes.filter((n) => n.type === 'group').map((g) => [g.id, String(g.data.label || 'Untitled group')]),
  );

  // Name every card as Type "Title". Two cards with the same type and title get
  // "(2)", "(3)"… so they can still be told apart.
  const seen = new Map<string, number>();
  const name = new Map(
    cards.map((c) => {
      const base = `${NODE_TYPES[c.data.nodeType].label} "${c.data.title.trim() || 'untitled'}"`;
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      return [c.id, count > 1 ? `${base} (${count})` : base];
    }),
  );

  const cardLines = cards.map((c) => {
    const flags = [
      c.selected ? 'SELECTED' : null,
      gapIds.has(c.id) ? 'GAP: needs evidence but nothing links into it' : null,
      c.parentId && groupLabels.has(c.parentId) ? `in group "${groupLabels.get(c.parentId)}"` : null,
      c.data.source ? `from document "${c.data.source.docName}"` : null,
      c.data.source?.aiType && c.data.source.aiType !== c.data.nodeType
        ? `AI suggested ${NODE_TYPES[c.data.source.aiType].label}; the designer changed the type`
        : null,
    ].filter(Boolean);
    const body = c.data.body.trim();
    return [
      `- ${name.get(c.id)}${flags.length ? `  (${flags.join('; ')})` : ''}`,
      body ? `    ${body.replace(/\n/g, '\n    ')}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  });

  const edgeLines = edges
    .filter((e) => name.has(e.source) && name.has(e.target) && e.data)
    .map((e) => `- ${name.get(e.source)} —${EDGE_KINDS[e.data!.kind].label}→ ${name.get(e.target)}`);

  const text = [
    `CARDS (${cards.length}):`,
    ...cardLines,
    '',
    `RELATIONSHIPS (${edgeLines.length}):`,
    ...(edgeLines.length ? edgeLines : ['(none)']),
  ].join('\n');

  return text.length > MAX_CONTEXT_CHARS ? `${text.slice(0, MAX_CONTEXT_CHARS)}\n…(board truncated)` : text;
}

const BRIEF_FIELDS: Array<[keyof ProjectBrief, string]> = [
  ['name', 'Project name'],
  ['description', 'Description'],
  ['users', 'Intended users'],
  ['context', 'Client / setting'],
  ['stage', 'Current stage'],
  ['notes', 'Other notes from the designer'],
];

/** Writes the project brief as text; empty fields are left out. */
export function describeBrief(brief: ProjectBrief): string {
  const lines = BRIEF_FIELDS.filter(([key]) => brief[key].trim()).map(
    ([key, label]) => `${label}: ${brief[key].trim().replace(/\n/g, '\n  ')}`,
  );
  return lines.length ? lines.join('\n') : 'No project brief has been filled in yet.';
}

/** Lists the project's source documents, oldest first, so the model can see how the project's material grew. */
export function describeSources(sources: SourceDoc[]): string {
  if (sources.length === 0) return 'No documents have been added yet.';
  return [...sources]
    .sort((a, b) => a.addedAt - b.addedAt)
    .map((s) => {
      const date = new Date(s.addedAt).toISOString().slice(0, 10);
      const read = s.readAt ? `${s.acceptedCount ?? 0} cards accepted from it` : 'not read yet';
      const summary = s.summary ? `\n    ${s.summary}` : '';
      return `- "${s.name}" (${SOURCE_KINDS[s.kind].label}, added ${date}; ${read})${summary}`;
    })
    .join('\n');
}
