import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, ReactFlow, useReactFlow, type NodeTypes, type EdgeTypes } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CardNode } from './CardNode';
import { GroupFrame } from './GroupFrame';
import { NoteNode } from './NoteNode';
import { LaneGuides } from './LaneGuides';
import { RelationEdge } from './RelationEdge';
import { EdgeMarkers } from './EdgeMarkers';
import { EdgeKindMenu } from './EdgeKindMenu';
import { CardContextMenu } from './CardContextMenu';
import { ConnectionOverlay } from './ConnectionOverlay';
import { CardDetailModal } from './CardDetailModal';
import { BoardContext, type BoardContextValue } from './BoardContext';
import type { BoardState, CardNode as CardNodeData, RelationEdgeType } from '../state/useBoardState';
import type { EdgeKindId } from '../types';
import { isStepLink, skipExplanation } from '../lib/trace';
import './board.css';

const nodeTypes: NodeTypes = { card: CardNode, group: GroupFrame, note: NoteNode };
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
  /** The summary note whose cards are highlighted (set by clicking it, or from the chat). */
  highlightedNoteId: string | null;
  onHighlightNote: (id: string | null) => void;
  /** Cards to light up and show (e.g. the two ends of a link the AI suggests); null: none. */
  previewCardIds: string[] | null;
  onClearPreview: () => void;
}

export function BoardCanvas({ board, highlightedNoteId, onHighlightNote, previewCardIds, onClearPreview }: BoardCanvasProps) {
  const { screenToFlowPosition, getInternalNode, fitView } = useReactFlow<CardNodeData, RelationEdgeType>();

  const [armedNodeId, setArmedNodeIdState] = useState<string | null>(null);
  const [tempEnd, setTempEnd] = useState<{ x: number; y: number } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [cardMenu, setCardMenu] = useState<CardMenu | null>(null);
  /** The link whose path is traced (clicked); see edgeTrace below. */
  const [highlightedEdgeId, setHighlightedEdgeId] = useState<string | null>(null);
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
      if (e.key === 'Escape' && highlightedEdgeId) {
        setHighlightedEdgeId(null);
        return;
      }
      if (e.key === 'Escape' && highlightedNoteId) {
        onHighlightNote(null);
        return;
      }
      if (e.key === 'Escape' && previewCardIds) {
        onClearPreview();
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
  }, [board, disarm, highlightedCardId, highlightedEdgeId, highlightedNoteId, onHighlightNote, previewCardIds, onClearPreview]);

  const handlePick = useCallback(
    (kind: EdgeKindId) => {
      if (pendingConnection) board.addRelation(pendingConnection.source, pendingConnection.target, kind);
      setPendingConnection(null);
    },
    [board, pendingConnection],
  );

  // Hand-drawn links follow the same step-by-step rule as everything else (lib/trace.ts):
  // between cards more than one step apart, explain why and offer only Contradicts.
  const pendingBlockedReason = useMemo(() => {
    if (!pendingConnection) return undefined;
    const typeOf = (id: string) => board.nodes.find((n): n is CardNodeData => n.type === 'card' && n.id === id)?.data.nodeType;
    const a = typeOf(pendingConnection.source);
    const b = typeOf(pendingConnection.target);
    if (!a || !b || isStepLink(a, b, 'leads')) return undefined;
    return skipExplanation(a, b);
  }, [pendingConnection, board.nodes]);

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

  // A clicked summary note lights up itself, the cards it summarises, the frames they
  // sit in, and the links between those cards. A preview (cards picked from the chat)
  // works the same way, without a note.
  const noteFocus = useMemo(() => {
    let cards: Set<string>;
    const nodeIds = new Set<string>();
    if (previewCardIds && previewCardIds.length > 0) {
      cards = new Set(previewCardIds);
    } else {
      if (!highlightedNoteId) return null;
      const note = board.nodes.find((n) => n.id === highlightedNoteId && n.type === 'note');
      if (!note || note.type !== 'note') return null;
      cards = new Set(note.data.sourceCardIds);
      nodeIds.add(note.id);
    }
    for (const n of board.nodes) {
      if (n.type === 'card' && cards.has(n.id)) {
        nodeIds.add(n.id);
        if (n.parentId) nodeIds.add(n.parentId);
      }
    }
    const edgeIds = new Set(board.edges.filter((e) => cards.has(e.source) && cards.has(e.target)).map((e) => e.id));
    return { nodeIds, edgeIds };
  }, [highlightedNoteId, previewCardIds, board.nodes, board.edges]);

  // A clicked link traces its path: the two cards it joins, everything leading into the
  // left one and everything following from the right one, all the way along. Links are
  // followed left to right as drawn (see RelationEdge). Contradicts links mark a tension,
  // not a step, so they're only included when they're the one clicked.
  const edgeTrace = useMemo(() => {
    if (!highlightedEdgeId) return null;
    const x = (id: string) => getInternalNode(id)?.internals.positionAbsolute.x ?? 0;
    const flow = board.edges.map((e) =>
      x(e.target) < x(e.source) ? { id: e.id, from: e.target, to: e.source, kind: e.data?.kind } : { id: e.id, from: e.source, to: e.target, kind: e.data?.kind },
    );
    const start = flow.find((f) => f.id === highlightedEdgeId);
    if (!start) return null;
    const nodeIds = new Set([start.from, start.to]);
    const edgeIds = new Set([start.id]);
    const walk = (first: string, step: (f: (typeof flow)[number]) => [string, string]) => {
      const queue = [first];
      while (queue.length > 0) {
        const card = queue.pop()!;
        for (const f of flow) {
          if (f.kind === 'contradicts' || edgeIds.has(f.id)) continue;
          const [here, next] = step(f);
          if (here !== card) continue;
          edgeIds.add(f.id);
          if (!nodeIds.has(next)) {
            nodeIds.add(next);
            queue.push(next);
          }
        }
      }
    };
    walk(start.from, (f) => [f.to, f.from]); // everything leading into the left card
    walk(start.to, (f) => [f.from, f.to]); // everything following from the right card
    for (const n of board.nodes) if (n.type === 'card' && nodeIds.has(n.id) && n.parentId) nodeIds.add(n.parentId);
    return { nodeIds, edgeIds };
  }, [highlightedEdgeId, board.edges, board.nodes, getInternalNode]);

  const traceEdge = useCallback(
    (edgeId: string) => {
      setHighlightedCardId(null);
      onHighlightNote(null);
      onClearPreview();
      setHighlightedEdgeId((current) => (current === edgeId ? null : edgeId));
    },
    [onHighlightNote, onClearPreview],
  );

  // Another highlight (a note, cards shown from the chat, "See connected cards") replaces a traced path.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (highlightedNoteId || previewCardIds || highlightedCardId) setHighlightedEdgeId(null);
  }, [highlightedNoteId, previewCardIds, highlightedCardId]);

  // Show a traced path.
  useEffect(() => {
    if (!edgeTrace) return;
    const id = window.setTimeout(
      () => fitView({ nodes: [...edgeTrace.nodeIds].map((nodeId) => ({ id: nodeId })), padding: 0.2, maxZoom: 1, duration: 450 }),
      60,
    );
    return () => window.clearTimeout(id);
    // Only when a different link is traced, not on every board change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedEdgeId]);

  // Show the note (or previewed cards) when highlighted.
  const previewKey = previewCardIds?.join(',') ?? '';
  useEffect(() => {
    if (!noteFocus) return;
    const id = window.setTimeout(
      () => fitView({ nodes: [...noteFocus.nodeIds].map((nodeId) => ({ id: nodeId })), padding: 0.3, maxZoom: 1, duration: 450 }),
      60,
    );
    return () => window.clearTimeout(id);
    // Only when a different note or preview is highlighted, not on every board change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedNoteId, previewKey]);

  const focusNodeIds = useMemo(() => {
    if (edgeTrace) return edgeTrace.nodeIds;
    if (noteFocus) return noteFocus.nodeIds;
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
  }, [edgeTrace, noteFocus, highlightAnchorIds, board.nodes, board.edges]);

  const focusEdgeIds = useMemo(() => {
    if (edgeTrace) return edgeTrace.edgeIds;
    if (noteFocus) return noteFocus.edgeIds;
    if (highlightAnchorIds.size === 0) return null;
    const ids = new Set<string>();
    for (const e of board.edges) {
      if (highlightAnchorIds.has(e.source) || highlightAnchorIds.has(e.target)) ids.add(e.id);
    }
    return ids;
  }, [edgeTrace, noteFocus, highlightAnchorIds, board.edges]);

  const prototypeTitles = useMemo(
    () =>
      new Map(
        board.nodes
          .filter((n): n is CardNodeData => n.type === 'card' && n.data.nodeType === 'prototype')
          .map((n) => [n.id, n.data.title.trim() || 'untitled']),
      ),
    [board.nodes],
  );

  const contextValue = useMemo<BoardContextValue>(
    () => ({
      traceIssues: board.traceIssues,
      skipLinkIds: board.skipLinkIds,
      prototypeTitles,
      addEvidenceFromPrototype: board.addEvidenceFromPrototype,
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
      updateNoteTitle: board.updateNoteTitle,
      highlightedNoteId,
      onEdgeClick: traceEdge,
      highlightedEdgeId,
    }),
    [
      traceEdge,
      highlightedEdgeId,
      dropTargetGroupId,
      board.updateNoteTitle,
      highlightedNoteId,
      board.traceIssues,
      board.skipLinkIds,
      prototypeTitles,
      board.addEvidenceFromPrototype,
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
            setHighlightedEdgeId(null);
            onHighlightNote(null);
            onClearPreview();
          }}
          onNodeClick={(_, node) => {
            // Clicking a summary note toggles highlighting its cards.
            if (node.type !== 'note') return;
            setHighlightedCardId(null);
            onHighlightNote(highlightedNoteId === node.id ? null : node.id);
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
          {/* Lane lines and labels: on tidied (or new) boards, once there's at least one card. */}
          {board.guides && board.nodes.some((n) => n.type === 'card') && <LaneGuides nodes={board.nodes} />}
        </ReactFlow>
        <EdgeMarkers />
        {armedNode && armedStart && tempEnd && (
          <ConnectionOverlay sourceType={armedNode.data.nodeType} start={armedStart} end={tempEnd} />
        )}
        {pendingConnection && (
          <EdgeKindMenu
            clientX={pendingConnection.clientX}
            clientY={pendingConnection.clientY}
            blockedReason={pendingBlockedReason}
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
              onHighlightNote(null);
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
