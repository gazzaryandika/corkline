import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, ReactFlow, useReactFlow, type NodeTypes, type EdgeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CardNode } from './CardNode';
import { GroupFrame } from './GroupFrame';
import { RelationEdge } from './RelationEdge';
import { EdgeMarkers } from './EdgeMarkers';
import { EdgeKindMenu } from './EdgeKindMenu';
import { CardContextMenu } from './CardContextMenu';
import { ConnectionOverlay } from './ConnectionOverlay';
import { CardDetailModal } from './CardDetailModal';
import { BoardContext, type BoardContextValue } from './BoardContext';
import type { BoardState, CardNode as CardNodeData, RelationEdgeType } from '../state/useBoardState';
import type { EdgeKindId } from '../types';
import './board.css';

const nodeTypes: NodeTypes = { card: CardNode, group: GroupFrame };
const edgeTypes: EdgeTypes = { relation: RelationEdge };
const SNAP_GRID: [number, number] = [26, 26];

interface PendingConnection {
  source: string;
  target: string;
  clientX: number;
  clientY: number;
}

interface CardMenu {
  cardId: string;
  clientX: number;
  clientY: number;
}

function findNodeIdAtPoint(clientX: number, clientY: number, excludeId: string): string | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    const nodeEl = el.closest?.('.react-flow__node');
    if (nodeEl) {
      const id = (nodeEl as HTMLElement).dataset.id;
      if (id && id !== excludeId) return id;
    }
  }
  return null;
}

interface BoardCanvasProps {
  board: BoardState;
}

export function BoardCanvas({ board }: BoardCanvasProps) {
  const { screenToFlowPosition, getInternalNode } = useReactFlow<CardNodeData, RelationEdgeType>();

  const [armedNodeId, setArmedNodeIdState] = useState<string | null>(null);
  const [tempEnd, setTempEnd] = useState<{ x: number; y: number } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [cardMenu, setCardMenu] = useState<CardMenu | null>(null);
  /** The frame a dragged card would join if dropped now (highlighted). */
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);

  /** The frame a dragged card is over (other than the one it's already in): where the
   * mouse pointer is, or failing that where the card's centre is. The smallest wins if
   * frames overlap. */
  const groupUnderCard = useCallback(
    (cardId: string, event: MouseEvent | React.MouseEvent | TouchEvent): string | null => {
      const card = getInternalNode(cardId);
      if (!card || card.type !== 'card') return null;
      const centre = {
        x: card.internals.positionAbsolute.x + (card.measured.width ?? 240) / 2,
        y: card.internals.positionAbsolute.y + (card.measured.height ?? 96) / 2,
      };
      const touch = 'changedTouches' in event ? event.changedTouches[0] : null;
      const client = touch ?? ('clientX' in event ? event : null);
      const points = client ? [screenToFlowPosition({ x: client.clientX, y: client.clientY }), centre] : [centre];

      for (const p of points) {
        let best: { id: string; area: number } | null = null;
        for (const n of board.nodes) {
          if (n.type !== 'group' || n.id === card.parentId) continue;
          const w = n.width ?? 0;
          const h = n.height ?? 0;
          if (p.x >= n.position.x && p.x <= n.position.x + w && p.y >= n.position.y && p.y <= n.position.y + h) {
            if (!best || w * h < best.area) best = { id: n.id, area: w * h };
          }
        }
        if (best) return best.id;
      }
      return null;
    },
    [board.nodes, getInternalNode, screenToFlowPosition],
  );

  const armedRef = useRef<string | null>(null);
  const setArmedNodeId = useCallback((id: string | null) => {
    armedRef.current = id;
    setArmedNodeIdState(id);
  }, []);

  const disarm = useCallback(() => {
    setArmedNodeId(null);
    setTempEnd(null);
  }, [setArmedNodeId]);

  const handleConnectorPointerDown = useCallback(
    (nodeId: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (armedRef.current) {
        if (armedRef.current === nodeId) {
          disarm();
          return;
        }
        const source = armedRef.current;
        disarm();
        setPendingConnection({ source, target: nodeId, clientX: e.clientX, clientY: e.clientY });
        return;
      }
      setArmedNodeId(nodeId);
      setTempEnd(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    },
    [disarm, screenToFlowPosition, setArmedNodeId],
  );

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      if (!armedRef.current) return;
      setTempEnd(screenToFlowPosition({ x: e.clientX, y: e.clientY }));
    }
    function handleUp(e: PointerEvent) {
      if (!armedRef.current) return;
      const targetId = findNodeIdAtPoint(e.clientX, e.clientY, armedRef.current);
      if (targetId) {
        const source = armedRef.current;
        disarm();
        setPendingConnection({ source, target: targetId, clientX: e.clientX, clientY: e.clientY });
      }
    }
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [disarm, screenToFlowPosition]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && armedRef.current) {
        disarm();
        return;
      }
      if (e.key === 'Escape' && highlightedCardId) {
        setHighlightedCardId(null);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
        const selectedCardIds = board.nodes.filter((n) => n.type === 'card' && n.selected).map((n) => n.id);
        if (selectedCardIds.length >= 2) {
          e.preventDefault();
          board.groupSelection(selectedCardIds);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [board, disarm, highlightedCardId]);

  const handlePick = useCallback(
    (kind: EdgeKindId) => {
      if (pendingConnection) board.addRelation(pendingConnection.source, pendingConnection.target, kind);
      setPendingConnection(null);
    },
    [board, pendingConnection],
  );

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: { id: string; type?: string }) => {
    event.preventDefault();
    if (node.type !== 'card') return;
    setCardMenu({ cardId: node.id, clientX: event.clientX, clientY: event.clientY });
  }, []);

  // ---- explicit "see connected cards" highlight: which nodes/edges stay lit while
  // everything else dims. Opt-in via the card's right-click menu — not tied to normal
  // (multi-)selection, since that's also what the chat panel reads for its own context. ----
  const highlightAnchorIds = useMemo(
    () => (highlightedCardId ? new Set([highlightedCardId]) : new Set<string>()),
    [highlightedCardId],
  );

  const focusNodeIds = useMemo(() => {
    if (highlightAnchorIds.size === 0) return null;
    const ids = new Set<string>(highlightAnchorIds);
    for (const n of board.nodes) {
      if (n.type !== 'card' || !highlightAnchorIds.has(n.id) || !n.parentId) continue;
      ids.add(n.parentId);
      for (const sibling of board.nodes) {
        if (sibling.type === 'card' && sibling.parentId === n.parentId) ids.add(sibling.id);
      }
    }
    for (const e of board.edges) {
      if (highlightAnchorIds.has(e.source)) ids.add(e.target);
      if (highlightAnchorIds.has(e.target)) ids.add(e.source);
    }
    return ids;
  }, [highlightAnchorIds, board.nodes, board.edges]);

  const focusEdgeIds = useMemo(() => {
    if (highlightAnchorIds.size === 0) return null;
    const ids = new Set<string>();
    for (const e of board.edges) {
      if (highlightAnchorIds.has(e.source) || highlightAnchorIds.has(e.target)) ids.add(e.id);
    }
    return ids;
  }, [highlightAnchorIds, board.edges]);

  const contextValue = useMemo<BoardContextValue>(
    () => ({
      gapIds: board.gapIds,
      laneById: board.laneById,
      updateCard: board.updateCard,
      deleteNode: board.deleteNode,
      deleteEdge: board.deleteEdge,
      armedNodeId,
      onConnectorPointerDown: handleConnectorPointerDown,
      onExpandCard: setExpandedCardId,
      updateGroupLabel: board.updateGroupLabel,
      ungroupNode: board.ungroupNode,
      focusNodeIds,
      focusEdgeIds,
      dropTargetGroupId,
    }),
    [
      dropTargetGroupId,
      board.gapIds,
      board.laneById,
      board.updateCard,
      board.deleteNode,
      board.deleteEdge,
      board.updateGroupLabel,
      board.ungroupNode,
      armedNodeId,
      handleConnectorPointerDown,
      focusNodeIds,
      focusEdgeIds,
    ],
  );

  const expandedNode = expandedCardId
    ? board.nodes.find((n): n is CardNodeData => n.type === 'card' && n.id === expandedCardId)
    : undefined;

  // The frame (e.g. an AI theme) the right-clicked card sits in, for "Remove from …".
  const menuCard = cardMenu ? board.nodes.find((n) => n.id === cardMenu.cardId) : undefined;
  const menuGroup = menuCard?.parentId ? board.nodes.find((n) => n.id === menuCard.parentId) : undefined;

  const armedNode = armedNodeId ? getInternalNode(armedNodeId) : undefined;
  const armedStart =
    armedNode && armedNode.measured.width !== undefined
      ? {
          x: armedNode.internals.positionAbsolute.x + armedNode.measured.width,
          y: armedNode.internals.positionAbsolute.y + (armedNode.measured.height ?? 96) / 2,
        }
      : null;

  return (
    <BoardContext.Provider value={contextValue}>
      <div className="board-canvas">
        <ReactFlow
          nodes={board.nodes}
          edges={board.edges}
          onNodesChange={board.onNodesChange}
          onEdgesChange={board.onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onPaneClick={() => {
            if (armedRef.current) disarm();
            setHighlightedCardId(null);
          }}
          onNodeContextMenu={handleNodeContextMenu}
          onNodeDrag={(event, node) => {
            const target = node.type === 'card' ? groupUnderCard(node.id, event) : null;
            setDropTargetGroupId((prev) => (prev === target ? prev : target));
          }}
          onNodeDragStop={(event, node, nodes) => {
            setDropTargetGroupId(null);
            if (node.type !== 'card') return;
            const target = groupUnderCard(node.id, event);
            // Dropped onto a frame: the dragged card(s) join it.
            if (target) board.moveCardsIntoGroup(nodes.filter((n) => n.type === 'card').map((n) => n.id), target);
          }}
          minZoom={0.35}
          maxZoom={2.4}
          defaultEdgeOptions={{ type: 'relation' }}
          snapToGrid
          snapGrid={SNAP_GRID}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="var(--dot-color)" />
        </ReactFlow>
        <EdgeMarkers />
        {armedNode && armedStart && tempEnd && (
          <ConnectionOverlay sourceType={armedNode.data.nodeType} start={armedStart} end={tempEnd} />
        )}
        {pendingConnection && (
          <EdgeKindMenu
            clientX={pendingConnection.clientX}
            clientY={pendingConnection.clientY}
            onPick={handlePick}
            onClose={() => setPendingConnection(null)}
          />
        )}
        {expandedNode && <CardDetailModal node={expandedNode} onClose={() => setExpandedCardId(null)} />}
        {cardMenu && (
          <CardContextMenu
            clientX={cardMenu.clientX}
            clientY={cardMenu.clientY}
            isHighlighted={highlightedCardId === cardMenu.cardId}
            onSeeConnections={() => {
              setHighlightedCardId(cardMenu.cardId);
              setCardMenu(null);
            }}
            onClearHighlight={() => {
              setHighlightedCardId(null);
              setCardMenu(null);
            }}
            groupLabel={menuGroup ? String(menuGroup.data.label || '') : undefined}
            onRemoveFromGroup={
              menuGroup
                ? () => {
                    board.removeFromGroup(cardMenu.cardId);
                    setCardMenu(null);
                  }
                : undefined
            }
            onClose={() => setCardMenu(null)}
          />
        )}
      </div>
    </BoardContext.Provider>
  );
}
