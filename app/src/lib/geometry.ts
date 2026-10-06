/** +1 if the anchor faces rightward out of its card (a "right" side anchor), -1 if it
 * faces leftward (a "left" side anchor) — i.e. which direction is *away* from the
 * card body at that point. */
export type AnchorDir = 1 | -1;

/** Cubic-bezier control points are pulled *away from each card* along each anchor's
 * own facing direction, not just "toward each other" — critical for edges where the
 * source ends up positioned further right than the target (e.g. a card far to the
 * right connecting back to one on the left). Pulling both control points blindly
 * rightward-then-leftward in that case sends the curve looping back through the
 * target card before it can turn to meet the endpoint. Pulling each control point
 * outward along its own anchor's facing side keeps the curve entirely outside both
 * cards regardless of which one is physically further right. */
export function bezierPath(x1: number, y1: number, x2: number, y2: number, dir1: AnchorDir, dir2: AnchorDir): string {
  const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dir1 * dx;
  const c2x = x2 + dir2 * dx;
  return `M${x1},${y1} C${c1x},${y1} ${c2x},${y2} ${x2},${y2}`;
}

/** Point at t=0.5 on the same cubic bezier curve, for label placement. */
export function bezierMidpoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dir1: AnchorDir,
  dir2: AnchorDir,
): { x: number; y: number } {
  const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
  const c1x = x1 + dir1 * dx;
  const c1y = y1;
  const c2x = x2 + dir2 * dx;
  const c2y = y2;
  return { x: (x1 + 3 * c1x + 3 * c2x + x2) / 8, y: (y1 + 3 * c1y + 3 * c2y + y2) / 8 };
}
