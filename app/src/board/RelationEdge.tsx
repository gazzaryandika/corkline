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
  const { deleteEdge, laneById, focusEdgeIds, onEdgeClick, highlightedEdgeId, skipLinkIds } = useBoardContext();
  // A link that skips a step (lib/trace.ts): kept, but drawn as a warning until it's fixed.
  const isSkip = skipLinkIds.has(id);
  const isFocused = focusEdgeIds !== null && focusEdgeIds.has(id);
  const isDimmed = focusEdgeIds !== null && !isFocused;
  const isTraced = highlightedEdgeId === id;
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  // Clicking a line (or its label) traces its path: the cards it joins and everything
  // leading into and out of them, left to right.
  const handleTrace = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdgeClick(id);
    },
    [onEdgeClick, id],
  );

  // Deleting goes through the small × shown on a traced line's label: click, then confirm.
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
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
  // Lines always run left to right, so the board reads Problem → … → Prototype. A link
  // whose meaning points at a card further left (e.g. Evidence supports a Problem) is
  // drawn from that card instead, with its wording turned round ("Supported by").
  const reversed = targetNode.internals.positionAbsolute.x < sourceNode.internals.positionAbsolute.x;
  const leftNode = reversed ? targetNode : sourceNode;
  const rightNode = reversed ? sourceNode : targetNode;
  const p1 = anchor(leftNode, 'right');
  const p2 = anchor(rightNode, 'left');
  const kindLabel = reversed ? cfg.reverseLabel : cfg.label;

  const laneInfo = laneById.get(id) ?? { index: 0, count: 1 };
  const lane = laneInfo.count > 1 ? laneInfo.index - (laneInfo.count - 1) / 2 : 0;
  const offset = lane * LANE_SPACING;

  const path = bezierPath(p1.x, p1.y + offset, p2.x, p2.y + offset, p1.dir, p2.dir);
  const mid = bezierMidpoint(p1.x, p1.y + offset, p2.x, p2.y + offset, p1.dir, p2.dir);
  const labelText = kindLabel.toUpperCase();
  const labelColor = cfg.color;

  return (
    <>
      <path d={path} className="relation-edge-hit" onClick={handleTrace} />
      <path
        d={path}
        fill="none"
        stroke={cfg.color}
        strokeWidth={data.kind === 'tests' ? 2.6 : 2.2}
        strokeLinecap="round"
        className={[
          'relation-edge',
          data.kind === 'contradicts' && 'is-contradicts',
          isSkip && 'is-skip',
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
        <div
          className={[
            'relation-edge__label-wrap',
            'nodrag',
            'nopan',
            isFocused && 'is-focus-highlight',
            isDimmed && 'is-focus-dim',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}
        >
          <button
            type="button"
            className={`relation-edge__label${isTraced ? ' is-traced' : ''}${isSkip ? ' is-skip' : ''}`}
            style={{ borderColor: labelColor, color: labelColor }}
            onClick={handleTrace}
            title={
              (isSkip ? 'This link skips a step in the trace. See the trace check (gaps count in the toolbar) to fix it.\n' : '') +
              (isTraced ? 'Click again to stop highlighting' : `"${kindLabel}": click to highlight this path`)
            }
          >
            {isSkip && '⚠ '}
            {labelText}
          </button>
          {isTraced && (
            <button
              type="button"
              className={`relation-edge__delete${confirming ? ' is-confirming' : ''}`}
              onClick={handleDelete}
              title={confirming ? 'Click again to delete this link' : 'Delete this link'}
            >
              {confirming ? 'Delete?' : '×'}
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
