import { memo } from 'react';
import { ViewportPortal } from '@xyflow/react';
import { NODE_TYPE_ORDER, NODE_TYPES } from '../config';
import { LANE_WIDTH } from '../lib/grid';
import type { AnyNode } from '../state/useBoardState';
import './LaneGuides.css';

/** Room above the first cards for the lane labels, and below the last cards for the lines. */
const LABEL_SPACE = 96;
const LINE_OVERHANG = 160;

interface LaneGuidesProps {
  nodes: AnyNode[];
}

/**
 * Faint lines between the grid's lanes and a label above each, drawn in board
 * coordinates behind the cards (they pan and zoom with the board). Purely visual:
 * they can't be clicked or dragged.
 */
function LaneGuidesComponent({ nodes }: LaneGuidesProps) {
  // Vertical extent of the board, so the lines cover it.
  let top = Infinity;
  let bottom = -Infinity;
  const groupY = new Map(nodes.filter((n) => n.type === 'group').map((g) => [g.id, g.position.y]));
  for (const n of nodes) {
    const y = n.position.y + (n.type === 'card' && n.parentId ? groupY.get(n.parentId) ?? 0 : 0);
    const h = n.type === 'group' ? n.height ?? 0 : n.measured?.height ?? 120;
    top = Math.min(top, y);
    bottom = Math.max(bottom, y + h);
  }
  if (!Number.isFinite(top)) {
    top = 0;
    bottom = 600;
  }
  const lineTop = top - LABEL_SPACE - 20;
  const lineHeight = bottom - lineTop + LINE_OVERHANG;

  return (
    <ViewportPortal>
      <div className="lane-guides" aria-hidden>
        {NODE_TYPE_ORDER.map((type, i) => (
          <div key={type}>
            {i > 0 && <div className="lane-guides__line" style={{ left: i * LANE_WIDTH, top: lineTop, height: lineHeight }} />}
            <div
              className="lane-guides__label"
              style={{ left: i * LANE_WIDTH, top: top - LABEL_SPACE, width: LANE_WIDTH, ['--type-color' as string]: NODE_TYPES[type].color }}
            >
              <span className="lane-guides__dot" />
              {NODE_TYPES[type].label}
            </div>
          </div>
        ))}
      </div>
    </ViewportPortal>
  );
}

export const LaneGuides = memo(LaneGuidesComponent);
