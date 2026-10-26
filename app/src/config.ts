import type { EdgeKindConfig, EdgeKindId, NodeTypeConfig, NodeTypeId, SourceKindId } from './types';

// Distinct from every node-type color on purpose — a gap flag must never look
// like it could be an Opportunity node (the original had both use #e08a1e).
export const GAP_COLOR = '#c2410c';

/** The order of card types everywhere: toolbar, legend, dropdowns, and the board's
 * grid columns, left to right. Follows the design process from problem to prototype. */
export const NODE_TYPE_ORDER: NodeTypeId[] = [
  'problem',
  'assumption',
  'evidence',
  'insight',
  'opportunity',
  'direction',
  'prototype',
];

export const NODE_TYPES: Record<NodeTypeId, NodeTypeConfig> = {
  problem: {
    id: 'problem',
    label: 'Problem',
    short: 'PROB',
    color: '#dc2626',
    placeholder: 'State the problem or design challenge…',
    needsIncoming: false,
  },
  evidence: {
    id: 'evidence',
    label: 'Evidence',
    short: 'EVID',
    color: '#0d9488',
    placeholder: 'A quote, observation, artefact or data point…',
    needsIncoming: false,
  },
  insight: {
    id: 'insight',
    label: 'Insight',
    short: 'INS',
    color: '#7c3aed',
    placeholder: 'What does this mean? An interpretation…',
    needsIncoming: true,
  },
  opportunity: {
    id: 'opportunity',
    label: 'Opportunity',
    short: 'OPP',
    color: '#b45309',
    placeholder: 'How might we…',
    needsIncoming: true,
  },
  direction: {
    id: 'direction',
    label: 'Direction',
    short: 'DIR',
    color: '#15803d',
    placeholder: 'A concept or route worth developing…',
    needsIncoming: true,
  },
  prototype: {
    id: 'prototype',
    label: 'Prototype',
    short: 'PROT',
    color: '#be185d',
    placeholder: 'What was built or tested, and how…',
    needsIncoming: true,
  },
  assumption: {
    id: 'assumption',
    label: 'Assumption',
    short: 'ASM',
    color: '#2563eb',
    placeholder: 'What are we taking for granted?…',
    needsIncoming: false,
  },
};

export const EDGE_KIND_ORDER: EdgeKindId[] = ['leads', 'supports', 'tests', 'contradicts'];

export const EDGE_KINDS: Record<EdgeKindId, EdgeKindConfig> = {
  leads: { id: 'leads', label: 'Leads to', color: '#64748b', arrow: true },
  supports: { id: 'supports', label: 'Supports', color: '#15803d', arrow: true },
  tests: { id: 'tests', label: 'Tests', color: '#2563eb', arrow: true },
  contradicts: { id: 'contradicts', label: 'Contradicts', color: '#dc2626', arrow: false },
};

export const CARD_WIDTH = 240;

/** What kind of document a source is. The kind tells the AI which card types to look for. */
export const SOURCE_KIND_ORDER: SourceKindId[] = ['context', 'interview', 'observation', 'research', 'workshop', 'other'];

export const SOURCE_KINDS: Record<SourceKindId, { label: string; hint: string }> = {
  context: { label: 'Project context / brief', hint: 'Looks for problem statements and assumptions' },
  interview: { label: 'Interview transcript', hint: 'Looks for evidence: what people said and did' },
  observation: { label: 'Observation / field notes', hint: 'Looks for evidence: what was seen' },
  research: { label: 'Desk research / report', hint: 'Looks for evidence and assumptions' },
  workshop: { label: 'Workshop / sticky notes', hint: 'Types each written point as it was meant' },
  other: { label: 'Other', hint: 'Any card type, only what the document states' },
};
