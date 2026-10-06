import type { EdgeKindConfig, EdgeKindId, NodeTypeConfig, NodeTypeId } from './types';

// Distinct from every node-type color on purpose — a gap flag must never look
// like it could be an Opportunity node (the original had both use #e08a1e).
export const GAP_COLOR = '#c2410c';

export const NODE_TYPE_ORDER: NodeTypeId[] = [
  'problem',
  'evidence',
  'insight',
  'opportunity',
  'direction',
  'prototype',
  'assumption',
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
