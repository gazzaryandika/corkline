import { useViewport } from '@xyflow/react';
import { NODE_TYPES } from '../config';
import { bezierPath } from '../lib/geometry';
import type { NodeTypeId } from '../types';

interface ConnectionOverlayProps {
  sourceType: NodeTypeId;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export function ConnectionOverlay({ sourceType, start, end }: ConnectionOverlayProps) {
  const { x, y, zoom } = useViewport();
  const cfg = NODE_TYPES[sourceType];

  return (
    <>
      <svg className="connection-overlay" aria-hidden>
        <g transform={`translate(${x},${y}) scale(${zoom})`}>
          <path
            className="connection-overlay__path"
            d={bezierPath(start.x, start.y, end.x, end.y, 1, -1)}
            style={{ stroke: cfg.color }}
          />
        </g>
      </svg>
      <div className="connect-hint">
        <span style={{ color: cfg.color }}>
          Connecting from <b>{cfg.short}</b> — click another card to link
        </span>
        <span className="connect-hint__esc">esc</span>
      </div>
    </>
  );
}
