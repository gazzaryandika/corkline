interface EdgeLike {
  id: string;
  source: string;
  target: string;
}

/**
 * Multiple relationships between the same two cards (e.g. both "Leads to"
 * and "Supports" from A to B) used to draw exactly on top of each other,
 * hiding all but the last one. This assigns each a lane index within its
 * pair so the renderer can bow the curve and offset the label.
 */
export function computeParallelLanes(edges: EdgeLike[]): Map<string, { index: number; count: number }> {
  const groups = new Map<string, string[]>();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join('::');
    const list = groups.get(key) ?? [];
    list.push(edge.id);
    groups.set(key, list);
  }
  const result = new Map<string, { index: number; count: number }>();
  for (const ids of groups.values()) {
    ids.forEach((id, index) => result.set(id, { index, count: ids.length }));
  }
  return result;
}
