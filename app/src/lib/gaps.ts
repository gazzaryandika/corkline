import { NODE_TYPES } from '../config';
import type { NodeTypeId } from '../types';

interface EdgeLike {
  target: string;
}

interface NodeLike {
  id: string;
  nodeType: NodeTypeId;
}

/** Which node ids currently lack the incoming edge their type requires. */
export function computeGapIds(nodes: NodeLike[], edges: EdgeLike[]): Set<string> {
  const incomingCount = new Map<string, number>();
  for (const edge of edges) {
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }
  const gaps = new Set<string>();
  for (const node of nodes) {
    if (NODE_TYPES[node.nodeType].needsIncoming && !incomingCount.get(node.id)) {
      gaps.add(node.id);
    }
  }
  return gaps;
}
