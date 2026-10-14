import { NODE_TYPE_ORDER, NODE_TYPES } from '../config';
import type { EdgeKindId, NodeTypeId } from '../types';

/**
 * Traceability: the board is a chain of justification, one step at a time:
 *
 *   Problem → Assumption → Evidence → Insight → Opportunity → Direction → Prototype
 *
 * so anyone can follow how a direction or prototype is backed by insights, evidence
 * and the assumptions that evidence validates. This module holds the rules everything
 * uses (drawing links by hand, AI suggestions, the board's checks):
 *
 * - A link joins cards in neighbouring steps, or in the same step (an iteration, e.g.
 *   Prototype v1 → v2). Skipping a step (Problem → Opportunity, Prototype → Assumption)
 *   isn't allowed: it hides how the later card is justified.
 * - Contradicts may join any two cards: it records a tension, not a step, so it never
 *   counts as backing for anything either.
 * - Links are read by step, not by arrow: "Evidence supports Assumption" is the
 *   Assumption → Evidence step.
 *
 * Prototype results feed back as new Evidence cards (marked with the prototype they came
 * from, `fromPrototypeId`), not as links pointing back across the chain.
 */

export type TraceIssue = 'needs-previous' | 'no-evidence' | 'unvalidated';

export interface TraceCard {
  id: string;
  nodeType: NodeTypeId;
  /** Evidence from testing a prototype: its origin is that prototype, so it doesn't
   * also need an Assumption before it. */
  fromPrototype?: boolean;
}

export interface TraceLink {
  id: string;
  source: string;
  target: string;
  kind: EdgeKindId;
}

export interface TraceReport {
  /** Cards with something missing in their trace, and what. */
  issues: Map<string, TraceIssue[]>;
  /** Links that skip a step. */
  skipLinks: Set<string>;
}

export function stepOf(type: NodeTypeId): number {
  return NODE_TYPE_ORDER.indexOf(type);
}

/** Whether a link between these card types keeps the step-by-step trace. */
export function isStepLink(a: NodeTypeId, b: NodeTypeId, kind: EdgeKindId): boolean {
  return kind === 'contradicts' || Math.abs(stepOf(a) - stepOf(b)) <= 1;
}

/** The steps a link between these types jumps over, e.g. Problem–Opportunity → [Assumption, Evidence, Insight]. */
export function skippedSteps(a: NodeTypeId, b: NodeTypeId): NodeTypeId[] {
  const [lo, hi] = [stepOf(a), stepOf(b)].sort((x, y) => x - y);
  return NODE_TYPE_ORDER.slice(lo + 1, hi);
}

/** The card type that must come right before this one ("an Assumption" before Evidence…). */
export function previousStep(type: NodeTypeId): NodeTypeId | null {
  const i = stepOf(type);
  return i > 0 ? NODE_TYPE_ORDER[i - 1] : null;
}

const ARTICLE: Record<NodeTypeId, string> = {
  problem: 'a Problem',
  assumption: 'an Assumption',
  evidence: 'Evidence',
  insight: 'an Insight',
  opportunity: 'an Opportunity',
  direction: 'a Direction',
  prototype: 'a Prototype',
};

export function withArticle(type: NodeTypeId): string {
  return ARTICLE[type];
}

/** Short text for a card's flag, as shown on the board. */
export function issueText(issue: TraceIssue, type: NodeTypeId): string {
  if (issue === 'needs-previous') return `needs a link from ${withArticle(previousStep(type)!)}`;
  if (issue === 'no-evidence') return 'not backed by evidence';
  return 'not yet validated by evidence';
}

/** A sentence explaining why a link between these types isn't allowed. */
export function skipExplanation(a: NodeTypeId, b: NodeTypeId): string {
  const [first, last] = stepOf(a) < stepOf(b) ? [a, b] : [b, a];
  const route = [first, ...skippedSteps(a, b), last].map((t) => NODE_TYPES[t].label).join(' → ');
  const text = `${NODE_TYPES[first].label} and ${NODE_TYPES[last].label} are ${skippedSteps(a, b).length + 1} steps apart. Trace it one step at a time: ${route}.`;
  return first === 'evidence' && last === 'prototype'
    ? `${text} If this Evidence is a result of testing the prototype, open the Prototype and use “+ Add result as Evidence” instead.`
    : text;
}

/**
 * Checks every card's trace:
 * - needs-previous: an Assumption needs a Problem, Evidence an Assumption, an Insight
 *   Evidence, and so on (a step link to a card one step back), or an earlier card in its
 *   own step that has one (iterations inherit their justification). Evidence that came
 *   from testing a prototype counts as traced.
 * - no-evidence: an Opportunity, Direction or Prototype whose chain back never reaches
 *   any Evidence card.
 * - unvalidated: an Assumption with no Evidence linked to it (supporting or contradicting).
 */
export function analyseTrace(cards: TraceCard[], links: TraceLink[]): TraceReport {
  const typeOf = new Map(cards.map((c) => [c.id, c.nodeType]));
  const skipLinks = new Set<string>();
  // Step links, undirected, as neighbour lists; Contradicts kept separately.
  const stepNeighbours = new Map<string, string[]>();
  const anyNeighbours = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, a: string, b: string) => m.set(a, [...(m.get(a) ?? []), b]);
  for (const l of links) {
    const a = typeOf.get(l.source);
    const b = typeOf.get(l.target);
    if (!a || !b) continue;
    if (!isStepLink(a, b, l.kind)) {
      skipLinks.add(l.id);
      continue;
    }
    add(anyNeighbours, l.source, l.target);
    add(anyNeighbours, l.target, l.source);
    if (l.kind === 'contradicts') continue;
    add(stepNeighbours, l.source, l.target);
    add(stepNeighbours, l.target, l.source);
  }
  const step = (id: string) => stepOf(typeOf.get(id)!);

  // needs-previous, with same-step inheritance (repeat until nothing changes).
  const satisfied = new Set(cards.filter((c) => stepOf(c.nodeType) === 0 || c.fromPrototype).map((c) => c.id));
  for (const c of cards) {
    if ((stepNeighbours.get(c.id) ?? []).some((n) => step(n) === step(c.id) - 1)) satisfied.add(c.id);
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of cards) {
      if (satisfied.has(c.id)) continue;
      if ((stepNeighbours.get(c.id) ?? []).some((n) => step(n) === step(c.id) && satisfied.has(n))) {
        satisfied.add(c.id);
        changed = true;
      }
    }
  }

  // Whether walking back along step links (to earlier or same steps) reaches Evidence.
  const reachesEvidence = (start: string): boolean => {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const id = queue.pop()!;
      for (const n of stepNeighbours.get(id) ?? []) {
        if (seen.has(n) || step(n) > step(id)) continue;
        if (typeOf.get(n) === 'evidence') return true;
        seen.add(n);
        queue.push(n);
      }
    }
    return false;
  };

  const issues = new Map<string, TraceIssue[]>();
  for (const c of cards) {
    const list: TraceIssue[] = [];
    if (!satisfied.has(c.id)) list.push('needs-previous');
    if (stepOf(c.nodeType) > stepOf('insight') && !reachesEvidence(c.id)) list.push('no-evidence');
    if (c.nodeType === 'assumption' && !(anyNeighbours.get(c.id) ?? []).some((n) => typeOf.get(n) === 'evidence')) {
      list.push('unvalidated');
    }
    if (list.length > 0) issues.set(c.id, list);
  }
  return { issues, skipLinks };
}
