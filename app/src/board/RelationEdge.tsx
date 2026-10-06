import { useCallback, useRef, useState } from 'react';
import { EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode, type Node } from '@xyflow/react';
import { CARD_WIDTH, EDGE_KINDS } from '../config';
import { useBoardContext } from './BoardContext';
import { bezierMidpoint, bezierPath, type AnchorDir } from '../lib/geometry';
import type { RelationEdgeType } from '../state/useBoardState';

const DELETE_CONFIRM_MS = 2200;
const LANE_SPACING = 26;

interface Anchor {
  x: number;
  y: number;
  /** Which way is "away from the card" at this point — see bezierPath. */
  dir: AnchorDir;
}

function anchor(node: InternalNode<Node>, side: 'left' | 'right'): Anchor {
  const width = node.measured.width ?? CARD_WIDTH;
  const height = node.measured.height ?? 96;
  const x = node.internals.positionAbsolute.x + (side === 'left' ? 0 : width);
  const y = node.internals.positionAbsolute.y + height / 2;
  return { x, y, dir: side === 'left' ? -1 : 1 };
}

export function RelationEdge({ id, source, target, data }: EdgeProps<RelationEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const { deleteEdge, laneById, focusEdgeIds } = useBoardContext();
  const isFocused = focusEdgeIds !== null && focusEdgeIds.has(id);
  const isDimmed = focusEdgeIds !== null && !isFocused;
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      if (!confirming) {
        setConfirming(true);
        timer.current = window.setTimeout(() => setConfirming(false), DELETE_CONFIRM_MS);
      } else {
        if (timer.current !== undefined) window.clearTimeout(timer.current);
        deleteEdge(id);
      }
    },
    [confirming, deleteEdge, id],
  );

  if (!sourceNode || !targetNode || !data) return null;

  const cfg = EDGE_KINDS[data.kind];
  const leftToRight = sourceNode.internals.positionAbsolute.x <= targetNode.internals.positionAbsolute.x;
  const p1 = anchor(sourceNode, leftToRight ? 'right' : 'left');
  const p2 = anchor(targetNode, leftToRight ? 'left' : 'right');

  const laneInfo = laneById.get(id) ?? { index: 0, count: 1 };
  const lane = laneInfo.count > 1 ? laneInfo.index - (laneInfo.count - 1) / 2 : 0;
  const offset = lane * LANE_SPACING;

  const path = bezierPath(p1.x, p1.y + offset, p2.x, p2.y + offset, p1.dir, p2.dir);
  const mid = bezierMidpoint(p1.x, p1.y + offset, p2.x, p2.y + offset, p1.dir, p2.dir);
  const labelText = confirming ? 'DELETE?' : cfg.label.toUpperCase();
  const labelColor = confirming ? '#dc2626' : cfg.color;

  return (
    <>
      <path d={path} className="relation-edge-hit" />
      <path
        d={path}
        fill="none"
        stroke={cfg.color}
        strokeWidth={data.kind === 'tests' ? 2.6 : 2.2}
        strokeLinecap="round"
        className={[
          'relation-edge',
          data.kind === 'contradicts' && 'is-contradicts',
          isFocused && 'is-focus-highlight',
          isDimmed && 'is-focus-dim',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ color: cfg.color, ...(isFocused ? { filter: `drop-shadow(0 0 5px ${cfg.color})` } : null) }}
        markerStart={cfg.arrow ? undefined : 'url(#tension-diamond)'}
        markerEnd={cfg.arrow ? `url(#arrow-${data.kind})` : 'url(#tension-diamond)'}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={[
            'relation-edge__label',
            'nodrag',
            'nopan',
            isFocused && 'is-focus-highlight',
            isDimmed && 'is-focus-dim',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`,
            borderColor: labelColor,
            color: labelColor,
          }}
          onPointerDown={handlePointerDown}
          title={confirming ? 'Click again to delete' : `Click twice to delete "${cfg.label}"`}
        >
          {labelText}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
