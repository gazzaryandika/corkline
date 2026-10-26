import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNodesState, useEdgesState, applyNodeChanges, type Node, type Edge, type NodeChange } from '@xyflow/react';
import { CARD_WIDTH, NODE_TYPE_ORDER } from '../config';
import { GRID_NOTES_X, GRID_ROW_GAP, cardSlot, estimateCardHeight, frameSlot, gridTop, type Box } from '../lib/grid';
import { analyseTrace, isStepLink } from '../lib/trace';
import { computeParallelLanes } from '../lib/parallelEdges';
import { loadBoard, saveBoard, downloadBoard, exportFilename, projectStorageKey } from '../lib/storage';
import { seedBoard } from '../data/seed';
import type {
  BoardDocument,
  BoardNode,
  CardBoardNode,
  CardData,
  CardProposal,
  EdgeKindId,
  GroupData,
  NodeTypeId,
  NoteData,
  ProjectBrief,
  RelationData,
  SaveStatus,
  SourceDoc,
} from '../types';

export type CardNode = Node<CardData, 'card'>;
export type GroupNode = Node<GroupData, 'group'>;
export type NoteNode = Node<NoteData, 'note'>;
export type AnyNode = CardNode | GroupNode | NoteNode;
export type RelationEdgeType = Edge<RelationData, 'relation'>;

const SAVE_DEBOUNCE_MS = 500;
const CARD_DRAG_HANDLE = '.card-node__bar';
const GROUP_DRAG_HANDLE = '.group-frame__header';
const GROUP_PADDING = 44;
const DEFAULT_CARD_HEIGHT = 96;

export const EMPTY_BRIEF: ProjectBrief = { name: '', description: '', users: '', context: '', stage: '', notes: '' };

function isCard(n: AnyNode): n is CardNode {
  return n.type === 'card';
}
function isGroup(n: AnyNode): n is GroupNode {
  return n.type === 'group';
}
function isNote(n: AnyNode): n is NoteNode {
  return n.type === 'note';
}

const NOTE_WIDTH = 280;
const NOTE_GAP = 60;

function toRFNodes(doc: BoardDocument): AnyNode[] {
  return doc.nodes.map((n): AnyNode => {
    if (n.type === 'group') {
      return { id: n.id, type: 'group', position: { ...n.position }, width: n.width, height: n.height, data: { ...n.data } };
    }
    if (n.type === 'note') {
      return { id: n.id, type: 'note', position: { ...n.position }, data: { ...n.data, sourceCardIds: [...n.data.sourceCardIds] } };
    }
    const rfNode: CardNode = { id: n.id, type: 'card', position: { ...n.position }, data: { ...n.data }, dragHandle: CARD_DRAG_HANDLE };
    if (n.parentId) rfNode.parentId = n.parentId;
    return rfNode;
  });
}

function toDocument(
  nodes: AnyNode[],
  edges: RelationEdgeType[],
  brief: ProjectBrief,
  sources: SourceDoc[],
  guides: boolean,
): BoardDocument {
  return {
    version: 1,
    brief,
    sources,
    layout: { guides },
    nodes: nodes.map((n): BoardNode => {
      if (isGroup(n)) {
        return { id: n.id, type: 'group', position: n.position, width: n.width ?? CARD_WIDTH, height: n.height ?? DEFAULT_CARD_HEIGHT, data: n.data };
      }
      if (isNote(n)) return { id: n.id, type: 'note', position: n.position, data: n.data };
      const entry: CardBoardNode = { id: n.id, type: 'card', position: n.position, data: n.data };
      if (n.parentId) entry.parentId = n.parentId;
      return entry;
    }),
    edges: edges.map((e) => ({ id: e.id, type: 'relation', source: e.source, target: e.target, data: e.data! })),
  };
}

/** Recomputes a group's frame to tightly wrap its current children, padded — the
 * frame's origin can shift (not just its size) so a child dragged above/left of the
 * existing bounds is still fully enclosed rather than clipped. */
function fitGroupToChildren(nodes: AnyNode[], groupId: string): AnyNode[] {
  const group = nodes.find((n): n is GroupNode => isGroup(n) && n.id === groupId);
  if (!group) return nodes;
  const children = nodes.filter((n): n is CardNode => isCard(n) && n.parentId === groupId);
  if (children.length === 0) return nodes;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const child of children) {
    const w = child.measured?.width ?? CARD_WIDTH;
    const h = child.measured?.height ?? DEFAULT_CARD_HEIGHT;
    const absX = group.position.x + child.position.x;
    const absY = group.position.y + child.position.y;
    minX = Math.min(minX, absX);
    minY = Math.min(minY, absY);
    maxX = Math.max(maxX, absX + w);
    maxY = Math.max(maxY, absY + h);
  }

  const nextX = minX - GROUP_PADDING;
  const nextY = minY - GROUP_PADDING;
  const nextWidth = maxX - minX + GROUP_PADDING * 2;
  const nextHeight = maxY - minY + GROUP_PADDING * 2;

  const unchanged =
    Math.abs(nextX - group.position.x) < 0.5 &&
    Math.abs(nextY - group.position.y) < 0.5 &&
    Math.abs(nextWidth - (group.width ?? 0)) < 0.5 &&
    Math.abs(nextHeight - (group.height ?? 0)) < 0.5;
  if (unchanged) return nodes;

  return nodes.map((n) => {
    if (n.id === groupId && isGroup(n)) {
      return { ...n, position: { x: nextX, y: nextY }, width: nextWidth, height: nextHeight };
    }
    if (isCard(n) && n.parentId === groupId) {
      const absX = group.position.x + n.position.x;
      const absY = group.position.y + n.position.y;
      return { ...n, position: { x: absX - nextX, y: absY - nextY } };
    }
    return n;
  });
}

const DEFAULT_NOTE_HEIGHT = 220;

/** What takes up space on the board, for the grid: loose cards, frames (with the
 * cards inside them) and notes, each with how many cards it counts as in its lane.
 * `skip` leaves out nodes that are about to move. */
function boxesOf(nodes: AnyNode[], skip?: Set<string>): Box[] {
  const cardsIn = new Map<string, number>();
  for (const n of nodes) if (isCard(n) && n.parentId) cardsIn.set(n.parentId, (cardsIn.get(n.parentId) ?? 0) + 1);
  const boxes: Box[] = [];
  for (const n of nodes) {
    if (skip?.has(n.id) || (isCard(n) && n.parentId)) continue;
    if (isGroup(n)) {
      boxes.push({ x: n.position.x, y: n.position.y, w: n.width ?? CARD_WIDTH, h: n.height ?? DEFAULT_CARD_HEIGHT, weight: cardsIn.get(n.id) ?? 0 });
    } else if (isNote(n)) {
      boxes.push({ x: n.position.x, y: n.position.y, w: n.measured?.width ?? NOTE_WIDTH, h: n.measured?.height ?? DEFAULT_NOTE_HEIGHT, weight: 0 });
    } else {
      boxes.push({ x: n.position.x, y: n.position.y, w: n.measured?.width ?? CARD_WIDTH, h: n.measured?.height ?? DEFAULT_CARD_HEIGHT, weight: 1 });
    }
  }
  return boxes;
}

/** Positions for new cards: each goes in its type's lane after what's already there
 * (and after the ones placed before it in the same batch). */
function gridSlotsFor(nodes: AnyNode[], cards: Array<{ nodeType: NodeTypeId; height: number }>): Array<{ x: number; y: number }> {
  const boxes = boxesOf(nodes);
  const top = gridTop(boxes);
  return cards.map((c) => {
    const slot = cardSlot(boxes, c.nodeType, top);
    boxes.push({ ...slot, w: CARD_WIDTH, h: c.height, weight: 1 });
    return slot;
  });
}

/** The lane a frame belongs in: the type most of its cards have (ties: the earlier lane). */
function frameType(nodes: AnyNode[], groupId: string): NodeTypeId {
  const counts = new Map<NodeTypeId, number>();
  for (const c of nodes) if (isCard(c) && c.parentId === groupId) counts.set(c.data.nodeType, (counts.get(c.data.nodeType) ?? 0) + 1);
  let best: NodeTypeId = NODE_TYPE_ORDER[0];
  for (const t of NODE_TYPE_ORDER) if ((counts.get(t) ?? 0) > (counts.get(best) ?? 0)) best = t;
  return best;
}

/**
 * "Tidy board": moves every loose card, frame and note into the grid. Cards go in
 * their type's lane, filling its first column (up to CARDS_PER_COLUMN cards) and then
 * its second; a frame goes in the lane of the type most of its cards have and counts
 * as its cards; notes go in a column of their own left of Problem. Each lane keeps
 * its current top-to-bottom order. Cards inside frames move with their frame. Lanes
 * start at the board's current top, so it doesn't jump far.
 */
function tidyNodes(nodes: AnyNode[]): AnyNode[] {
  const items = nodes.filter((n) => !(isCard(n) && n.parentId));
  if (items.length === 0) return nodes;
  const top = gridTop(boxesOf(nodes));
  const cardsIn =(groupId: string) => nodes.filter((c) => isCard(c) && c.parentId === groupId).length;
  const heightOf = (n: AnyNode) =>
    isGroup(n) ? n.height ?? DEFAULT_CARD_HEIGHT : n.measured?.height ?? (isNote(n) ? DEFAULT_NOTE_HEIGHT : DEFAULT_CARD_HEIGHT);
  const byOrder = (a: AnyNode, b: AnyNode) => a.position.y - b.position.y || a.position.x - b.position.x;

  const placed = new Map<string, { x: number; y: number }>();
  const placedBoxes: Box[] = [];
  for (const type of NODE_TYPE_ORDER) {
    const lane = items
      .filter((n) => (isCard(n) && n.data.nodeType === type) || (isGroup(n) && frameType(nodes, n.id) === type))
      .sort(byOrder);
    for (const n of lane) {
      if (isGroup(n)) {
        const w = n.width ?? CARD_WIDTH + GROUP_PADDING * 2;
        const pos = frameSlot(placedBoxes, type, w, top);
        placedBoxes.push({ ...pos, w, h: heightOf(n), weight: cardsIn(n.id) });
        placed.set(n.id, pos);
      } else {
        const pos = cardSlot(placedBoxes, type, top);
        placedBoxes.push({ ...pos, w: CARD_WIDTH, h: heightOf(n), weight: 1 });
        placed.set(n.id, pos);
      }
    }
  }
  let noteY = top;
  for (const n of items.filter(isNote).sort(byOrder)) {
    placed.set(n.id, { x: GRID_NOTES_X, y: noteY });
    noteY += heightOf(n) + GRID_ROW_GAP;
  }
  return nodes.map((n) => (placed.has(n.id) ? { ...n, position: placed.get(n.id)! } : n));
}

const THEME_STACK_GAP = 48;
const THEME_CARD_GAP = 16;

export interface ThemeToCreate {
  nodeType: NodeTypeId;
  label: string;
  description: string;
  cardIds: string[];
}

/**
 * Gathers each theme's cards into a labelled group frame, placed in its card type's
 * grid column below whatever else is there (the cards in the frame line up with the
 * column's loose cards). `groupIds[i]` is the id for `themes[i]`'s frame (made by
 * the caller, so they're known straight away and stay the same if React runs this
 * update twice).
 */
function placeThemes(nodes: AnyNode[], themes: ThemeToCreate[], groupIds: string[]): AnyNode[] {
  const moving = new Set(themes.flatMap((t) => t.cardIds));
  const heightOf = (n: AnyNode) => (isGroup(n) ? n.height ?? DEFAULT_CARD_HEIGHT : n.measured?.height ?? DEFAULT_CARD_HEIGHT);

  // Frames the moving cards leave behind still count as taken space for now; they're
  // refitted (or removed) below.
  const boxes = boxesOf(nodes, moving);
  const top = gridTop(boxes.length > 0 ? boxes : boxesOf(nodes));

  const frameWidth = CARD_WIDTH + GROUP_PADDING * 2;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const newGroups: GroupNode[] = [];
  const cardUpdates = new Map<string, { parentId: string; position: { x: number; y: number } }>();

  themes.forEach((theme, i) => {
    const cards = theme.cardIds.map((id) => byId.get(id)).filter((n): n is CardNode => !!n && isCard(n));
    if (cards.length === 0) return;
    const groupId = groupIds[i];
    let y = GROUP_PADDING;
    for (const card of cards) {
      cardUpdates.set(card.id, { parentId: groupId, position: { x: GROUP_PADDING, y } });
      y += heightOf(card) + THEME_CARD_GAP;
    }
    const height = y - THEME_CARD_GAP + GROUP_PADDING;
    const pos = frameSlot(boxes, theme.nodeType, frameWidth, top);
    boxes.push({ ...pos, w: frameWidth, h: height, weight: cards.length });
    newGroups.push({
      id: groupId,
      type: 'group',
      position: pos,
      width: frameWidth,
      height,
      data: { label: theme.label, description: theme.description },
      dragHandle: GROUP_DRAG_HANDLE,
    });
  });

  // Frames must come before their cards in React Flow's node list.
  const updated = nodes.map((n) => {
    const u = cardUpdates.get(n.id);
    return u && isCard(n) ? { ...n, parentId: u.parentId, position: u.position } : n;
  });
  let next: AnyNode[] = [...newGroups, ...updated];
  // Frames the moved cards came from may now be empty or too big.
  const oldParents = new Set(
    nodes.filter((n): n is CardNode => isCard(n) && moving.has(n.id) && !!n.parentId).map((n) => n.parentId!),
  );
  for (const groupId of oldParents) {
    next = next.some((n) => isCard(n) && n.parentId === groupId) ? fitGroupToChildren(next, groupId) : removeNodeById(next, groupId);
  }
  return next;
}

/** After a frame grows, pushes any frame it now overlaps (that starts lower down) below
 * it, and so on down the column, so frames never end up on top of each other. Cards in
 * those frames move with them. */
function pushFramesBelow(nodes: AnyNode[], grownId: string): AnyNode[] {
  const rects = new Map(
    nodes.filter(isGroup).map((g) => [g.id, { x: g.position.x, y: g.position.y, w: g.width ?? 0, h: g.height ?? 0 }]),
  );
  const queue = [grownId];
  while (queue.length > 0) {
    const above = rects.get(queue.shift()!)!;
    for (const [id, r] of rects) {
      if (r === above || r.y < above.y) continue;
      const overlapsX = r.x < above.x + above.w && above.x < r.x + r.w;
      const overlapsY = r.y < above.y + above.h + THEME_STACK_GAP;
      if (overlapsX && overlapsY) {
        r.y = above.y + above.h + THEME_STACK_GAP;
        queue.push(id);
      }
    }
  }
  return nodes.map((n) => {
    const r = isGroup(n) ? rects.get(n.id) : undefined;
    return r && r.y !== n.position.y ? { ...n, position: { x: n.position.x, y: r.y } } : n;
  });
}

/** Runs pushFramesBelow for every frame, top to bottom, so no two frames overlap. */
function separateFrames(nodes: AnyNode[]): AnyNode[] {
  let next = nodes;
  const order = nodes.filter(isGroup).sort((a, b) => a.position.y - b.position.y);
  for (const g of order) next = pushFramesBelow(next, g.id);
  return next;
}

/** If a frame's cards form one column (like an AI theme), closes gaps left by cards
 * taken out, then refits the frame. Frames arranged freely are only refitted. */
function tidyFrame(nodes: AnyNode[], groupId: string): AnyNode[] {
  const members = nodes
    .filter((n): n is CardNode => isCard(n) && n.parentId === groupId)
    .sort((a, b) => a.position.y - b.position.y);
  if (members.length === 0) return removeNodeById(nodes, groupId);
  const oneColumn = members.every((m) => Math.abs(m.position.x - members[0].position.x) < 2);
  if (!oneColumn) return fitGroupToChildren(nodes, groupId);
  const newY = new Map<string, number>();
  let y = members[0].position.y;
  for (const m of members) {
    newY.set(m.id, y);
    y += (m.measured?.height ?? DEFAULT_CARD_HEIGHT) + THEME_CARD_GAP;
  }
  const compacted = nodes.map((n) =>
    newY.has(n.id) && newY.get(n.id) !== n.position.y ? { ...n, position: { ...n.position, y: newY.get(n.id)! } } : n,
  );
  return fitGroupToChildren(compacted, groupId);
}

function removeNodeById(nodes: AnyNode[], id: string): AnyNode[] {
  return nodes.filter((n) => n.id !== id);
}

/** Un-parents every child of a group, converting each back to an absolute position,
 * then drops the group node itself. Used by both explicit "ungroup" and by deleting
 * a group (which should never take its members down with it). */
function releaseGroup(nodes: AnyNode[], groupId: string): AnyNode[] {
  const group = nodes.find((n): n is GroupNode => isGroup(n) && n.id === groupId);
  if (!group) return removeNodeById(nodes, groupId);
  const released = nodes.map((n) =>
    isCard(n) && n.parentId === groupId
      ? { ...n, parentId: undefined, position: { x: group.position.x + n.position.x, y: group.position.y + n.position.y } }
      : n,
  );
  return removeNodeById(released, groupId);
}

export function useBoardState(projectId: string) {
  const initial = useRef<BoardDocument | null>(null);
  if (initial.current === null) {
    initial.current = loadBoard(projectId) ?? seedBoard();
  }

  const [nodes, setNodes] = useNodesState<AnyNode>(toRFNodes(initial.current));
  const [edges, setEdges, onEdgesChange] = useEdgesState<RelationEdgeType>(
    initial.current.edges.map((e) => ({ id: e.id, type: 'relation', source: e.source, target: e.target, data: { ...e.data } })),
  );
  const [brief, setBrief] = useState<ProjectBrief>({ ...EMPTY_BRIEF, ...initial.current.brief });
  const [sources, setSources] = useState<SourceDoc[]>(initial.current.sources ?? []);
  // Lane lines and labels: on once the board has been tidied, and from the start on a
  // board with no cards yet (it follows the grid from its first card).
  const [guides, setGuides] = useState<boolean>(
    initial.current.layout?.guides ?? !initial.current.nodes.some((n) => n.type === 'card'),
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [crossTabNotice, setCrossTabNotice] = useState(false);

  const onNodesChange = useCallback(
    (changes: NodeChange<AnyNode>[]) => {
      setNodes((prev) => {
        let next = applyNodeChanges(changes, prev);
        const touchedGroupIds = new Set<string>();
        for (const change of changes) {
          if (change.type === 'position') {
            const node = next.find((n) => n.id === change.id);
            if (node && isCard(node) && node.parentId) touchedGroupIds.add(node.parentId);
          }
        }
        for (const groupId of touchedGroupIds) next = fitGroupToChildren(next, groupId);
        return next;
      });
    },
    [setNodes],
  );

  // ---- one-time self-heal: fit every group's frame once real card sizes are measured ----
  const groupsFittedOnLoad = useRef(false);
  useEffect(() => {
    if (groupsFittedOnLoad.current) return;
    const groupIds = nodes.filter(isGroup).map((n) => n.id);
    if (groupIds.length === 0) {
      groupsFittedOnLoad.current = true;
      return;
    }
    const allMeasured = nodes.every((n) => !isCard(n) || (n.measured?.width && n.measured?.height));
    if (!allMeasured) return;
    groupsFittedOnLoad.current = true;
    setNodes((prev) => {
      let next = prev;
      for (const id of groupIds) next = fitGroupToChildren(next, id);
      return next;
    });
  }, [nodes, setNodes]);

  // Traceability checks (lib/trace.ts): what each card's trace is missing, and links that skip a step.
  const trace = useMemo(
    () =>
      analyseTrace(
        nodes.filter(isCard).map((n) => ({
          id: n.id,
          nodeType: n.data.nodeType,
          fromPrototype: n.data.nodeType === 'evidence' && !!n.data.fromPrototypeId,
        })),
        edges.filter((e) => e.data).map((e) => ({ id: e.id, source: e.source, target: e.target, kind: e.data!.kind })),
      ),
    [nodes, edges],
  );
  const traceIssues = trace.issues;
  const skipLinkIds = trace.skipLinks;
  /** Cards with any trace issue. */
  const gapIds = useMemo(() => new Set(trace.issues.keys()), [trace]);

  const laneById = useMemo(() => computeParallelLanes(edges), [edges]);

  // ---- debounced persistence ----
  const saveTimer = useRef<number | undefined>(undefined);
  const skipNextSave = useRef(true); // the very first render just loaded this data; no need to re-save it immediately

  /** The latest unsaved board, waiting for the debounce timer. */
  const pendingDoc = useRef<BoardDocument | null>(null);

  const writePending = useCallback(() => {
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const doc = pendingDoc.current;
    if (!doc) return;
    pendingDoc.current = null;
    const result = saveBoard(projectId, doc);
    if (result.ok) {
      setSaveStatus('saved');
      setSaveError(null);
    } else {
      setSaveStatus('error');
      setSaveError(result.reason);
    }
  }, [projectId]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    setSaveStatus('saving');
    pendingDoc.current = toDocument(nodes, edges, brief, sources, guides);
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(writePending, SAVE_DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, brief, sources, guides]);

  // Write any pending change straight away when leaving the board (e.g. back to the
  // projects page) or closing the tab, instead of losing the last half-second of edits.
  useEffect(() => {
    window.addEventListener('pagehide', writePending);
    return () => {
      window.removeEventListener('pagehide', writePending);
      writePending();
    };
  }, [writePending]);

  // ---- cross-tab awareness ----
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key === projectStorageKey(projectId) && e.newValue) setCrossTabNotice(true);
    }
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [projectId]);

  const importDocument = useCallback(
    (doc: BoardDocument) => {
      // Replace the board wholesale: drop any older pending save so it can't
      // overwrite this, and persist the new board right away.
      if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      pendingDoc.current = null;
      const result = saveBoard(projectId, doc);
      setSaveStatus(result.ok ? 'saved' : 'error');
      setSaveError(result.ok ? null : result.reason);
      skipNextSave.current = true;
      groupsFittedOnLoad.current = false;
      setNodes(toRFNodes(doc));
      setBrief({ ...EMPTY_BRIEF, ...doc.brief });
      setSources(doc.sources ?? []);
      setGuides(doc.layout?.guides ?? !doc.nodes.some((n) => n.type === 'card'));
      setEdges(doc.edges.map((e) => ({ id: e.id, type: 'relation', source: e.source, target: e.target, data: { ...e.data } })));
    },
    [setNodes, setEdges, projectId],
  );

  const reloadFromStorage = useCallback(() => {
    const doc = loadBoard(projectId);
    if (doc) importDocument(doc);
    setCrossTabNotice(false);
  }, [importDocument, projectId]);

  const resetToExample = useCallback(() => {
    importDocument(seedBoard());
  }, [importDocument]);

  const dismissCrossTabNotice = useCallback(() => setCrossTabNotice(false), []);

  // ---- CRUD: cards ----
  // The latest nodes, so a new card's grid slot can be worked out (and returned)
  // straight away rather than inside a state update.
  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  /** Adds an empty card. Without a position it goes in its type's grid column, below
   * what's already there. Returns its id and where it went. */
  const addNode = useCallback(
    (nodeType: NodeTypeId, position?: { x: number; y: number }) => {
      const id = crypto.randomUUID();
      const at = position ?? cardSlot(boxesOf(nodesRef.current), nodeType);
      const newNode: CardNode = { id, type: 'card', position: at, data: { nodeType, title: '', body: '' }, dragHandle: CARD_DRAG_HANDLE };
      // Count it straight away, so a quick second click lands below it rather than on it.
      nodesRef.current = [...nodesRef.current, newNode];
      setNodes((prev) => [...prev, newNode]);
      return { id, position: at };
    },
    [setNodes],
  );

  // ---- Tidy board: sort everything into the grid, with a one-step undo ----

  /** Positions (and whether guides were on) from just before the last tidy, while Undo is offered. */
  const [tidyUndo, setTidyUndo] = useState<{ positions: Map<string, { x: number; y: number }>; guides: boolean } | null>(null);

  const tidyBoard = useCallback(() => {
    const positions = new Map(nodesRef.current.filter((n) => !(isCard(n) && n.parentId)).map((n) => [n.id, { ...n.position }]));
    setTidyUndo({ positions, guides });
    setNodes((prev) => tidyNodes(prev));
    setGuides(true);
  }, [setNodes, guides]);

  const undoTidy = useCallback(() => {
    if (!tidyUndo) return;
    const { positions } = tidyUndo;
    setNodes((prev) => prev.map((n) => (positions.has(n.id) ? { ...n, position: { ...positions.get(n.id)! } } : n)));
    setGuides(tidyUndo.guides);
    setTidyUndo(null);
  }, [tidyUndo, setNodes]);

  const dismissTidyUndo = useCallback(() => setTidyUndo(null), []);

  const updateCard = useCallback(
    (id: string, patch: Partial<Pick<CardData, 'nodeType' | 'title' | 'body' | 'link' | 'image' | 'fromPrototypeId'>>) => {
      setNodes((prev) => prev.map((n) => (isCard(n) && n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((prev) => {
        const target = prev.find((n) => n.id === id);
        if (!target) return prev;

        if (isGroup(target)) return releaseGroup(prev, id);

        const parentId = isCard(target) ? target.parentId : undefined;
        let next = removeNodeById(prev, id);
        if (parentId) {
          const hasRemainingSiblings = next.some((n) => isCard(n) && n.parentId === parentId);
          next = hasRemainingSiblings ? fitGroupToChildren(next, parentId) : removeNodeById(next, parentId);
        }
        return next;
      });
      setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges],
  );

  // ---- CRUD: groups ----
  const groupSelection = useCallback(
    (memberIds: string[]) => {
      setNodes((prev) => {
        const eligibleIds = new Set(
          prev.filter((n): n is CardNode => isCard(n) && memberIds.includes(n.id) && !n.parentId).map((n) => n.id),
        );
        if (eligibleIds.size < 2) return prev;

        const groupId = crypto.randomUUID();
        const newGroup: GroupNode = {
          id: groupId,
          type: 'group',
          position: { x: 0, y: 0 },
          width: CARD_WIDTH + GROUP_PADDING * 2,
          height: DEFAULT_CARD_HEIGHT + GROUP_PADDING * 2,
          data: { label: '' },
          dragHandle: GROUP_DRAG_HANDLE,
        };

        const withParenting: AnyNode[] = [
          newGroup,
          ...prev.map((n) => (isCard(n) && eligibleIds.has(n.id) ? { ...n, parentId: groupId } : n)),
        ];
        return fitGroupToChildren(withParenting, groupId);
      });
    },
    [setNodes],
  );

  const ungroupNode = useCallback(
    (groupId: string) => {
      setNodes((prev) => releaseGroup(prev, groupId));
    },
    [setNodes],
  );

  /** Takes one card out of its group frame, placing it just right of the frame.
   * The frame refits, or disappears if it's now empty. */
  const removeFromGroup = useCallback(
    (cardId: string) => {
      setNodes((prev) => {
        const card = prev.find((n): n is CardNode => isCard(n) && n.id === cardId);
        const group = card?.parentId ? prev.find((n): n is GroupNode => isGroup(n) && n.id === card.parentId) : undefined;
        if (!card || !group) return prev;
        let next = prev.map((n) =>
          n.id === cardId
            ? {
                ...n,
                parentId: undefined,
                position: { x: group.position.x + (group.width ?? CARD_WIDTH) + 40, y: group.position.y + card.position.y },
              }
            : n,
        );
        return tidyFrame(next, group.id);
      });
    },
    [setNodes],
  );

  /** Puts cards (dropped onto a frame) into that group, stacked neatly under the cards
   * already in it. The frame grows to fit; frames they came from refit or disappear
   * when empty. */
  const moveCardsIntoGroup = useCallback(
    (cardIds: string[], groupId: string) => {
      setNodes((prev) => {
        const group = prev.find((n): n is GroupNode => isGroup(n) && n.id === groupId);
        if (!group) return prev;
        const moving = new Set(cardIds.filter((id) => prev.some((n) => n.id === id && isCard(n) && n.parentId !== groupId)));
        if (moving.size === 0) return prev;

        // Continue the frame's column: same left edge, below its lowest card.
        const members = prev.filter((n): n is CardNode => isCard(n) && n.parentId === groupId);
        const left = members.length > 0 ? Math.min(...members.map((m) => m.position.x)) : GROUP_PADDING;
        let top =
          members.length > 0
            ? Math.max(...members.map((m) => m.position.y + (m.measured?.height ?? DEFAULT_CARD_HEIGHT))) + THEME_CARD_GAP
            : GROUP_PADDING;

        const oldParents = new Set<string>();
        let next = prev.map((n) => {
          if (!isCard(n) || !moving.has(n.id)) return n;
          if (n.parentId) oldParents.add(n.parentId);
          const position = { x: left, y: top };
          top += (n.measured?.height ?? DEFAULT_CARD_HEIGHT) + THEME_CARD_GAP;
          return { ...n, parentId: groupId, position };
        });
        // React Flow needs a frame listed before its cards.
        next = [...next.filter((n) => n.id === groupId), ...next.filter((n) => n.id !== groupId)];
        next = fitGroupToChildren(next, groupId);
        for (const oldId of oldParents) next = tidyFrame(next, oldId);
        return separateFrames(next);
      });
    },
    [setNodes],
  );

  /** Puts a summary note on the board and returns its id. A note about some cards goes
   * just right of them; a whole-board summary goes left of the board. Notes already in
   * that spot are stepped past, so they never stack exactly. */
  const addNote = useCallback(
    (data: NoteData) => {
      const id = crypto.randomUUID();
      setNodes((prev) => {
        const groupPos = new Map(prev.filter(isGroup).map((g) => [g.id, g.position]));
        const sources = new Set(data.sourceCardIds);
        const relevant = data.scope === 'selection' ? prev.filter((n) => sources.has(n.id)) : prev.filter((n) => !isNote(n));
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        for (const n of relevant) {
          const offset = isCard(n) && n.parentId ? groupPos.get(n.parentId) ?? { x: 0, y: 0 } : { x: 0, y: 0 };
          const x = offset.x + n.position.x;
          const width = isGroup(n) ? n.width ?? CARD_WIDTH : n.measured?.width ?? CARD_WIDTH;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x + width);
          minY = Math.min(minY, offset.y + n.position.y);
        }
        const position = Number.isFinite(minX)
          ? { x: data.scope === 'selection' ? maxX + NOTE_GAP : minX - NOTE_WIDTH - NOTE_GAP, y: minY }
          : { x: 0, y: 0 };
        const notes = prev.filter(isNote);
        while (notes.some((n) => Math.abs(n.position.x - position.x) < 30 && Math.abs(n.position.y - position.y) < 30)) {
          position.y += 48;
        }
        const note: NoteNode = { id, type: 'note', position, data };
        return [...prev, note];
      });
      return id;
    },
    [setNodes],
  );

  const updateNoteTitle = useCallback(
    (id: string, title: string) => {
      setNodes((prev) => prev.map((n) => (isNote(n) && n.id === id ? { ...n, data: { ...n.data, title } } : n)));
    },
    [setNodes],
  );

  const updateNoteBody = useCallback(
    (id: string, body: string) => {
      setNodes((prev) => prev.map((n) => (isNote(n) && n.id === id ? { ...n, data: { ...n.data, body } } : n)));
    },
    [setNodes],
  );

  /** Puts accepted AI themes on the board as group frames. Returns the frame ids. */
  const createThemes = useCallback(
    (themes: ThemeToCreate[]) => {
      const groupIds = themes.map(() => crypto.randomUUID());
      setNodes((prev) => placeThemes(prev, themes, groupIds));
      return groupIds;
    },
    [setNodes],
  );

  const updateGroupLabel = useCallback(
    (id: string, label: string) => {
      setNodes((prev) => prev.map((n) => (isGroup(n) && n.id === id ? { ...n, data: { ...n.data, label } } : n)));
    },
    [setNodes],
  );

  // ---- CRUD: edges ----
  /** Links two cards. Links that would skip a step (lib/trace.ts) are refused; callers
   * explain why before getting here. */
  const addRelation = useCallback(
    (source: string, target: string, kind: EdgeKindId) => {
      if (source === target) return;
      const typeOf = (id: string) => nodesRef.current.find((n): n is CardNode => isCard(n) && n.id === id)?.data.nodeType;
      const a = typeOf(source);
      const b = typeOf(target);
      if (!a || !b || !isStepLink(a, b, kind)) return;
      setEdges((prev) => {
        const exists = prev.some((e) => e.source === source && e.target === target && e.data?.kind === kind);
        if (exists) return prev;
        const id = crypto.randomUUID();
        const edge: RelationEdgeType = { id, type: 'relation', source, target, data: { kind } };
        return [...prev, edge];
      });
    },
    [setEdges],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      setEdges((prev) => prev.filter((e) => e.id !== id));
    },
    [setEdges],
  );

  // ---- iteration: prototype results come back as Evidence ----

  /** Adds an empty Evidence card in the Evidence column, marked as a result of this
   * Prototype. Returns its id. */
  const addEvidenceFromPrototype = useCallback(
    (prototypeId: string) => {
      const id = crypto.randomUUID();
      const at = cardSlot(boxesOf(nodesRef.current), 'evidence');
      const card: CardNode = {
        id,
        type: 'card',
        position: at,
        data: { nodeType: 'evidence', title: '', body: '', fromPrototypeId: prototypeId },
        dragHandle: CARD_DRAG_HANDLE,
      };
      nodesRef.current = [...nodesRef.current, card];
      setNodes((prev) => [...prev, card]);
      return { id, position: at };
    },
    [setNodes],
  );

  /** Turns a link between a Prototype and an Evidence card (which skips the middle of the
   * chain) into "this evidence came from that prototype": the link goes, the Evidence
   * card remembers the prototype. */
  const linkToPrototypeResult = useCallback(
    (edgeId: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;
      const cards = nodesRef.current.filter(isCard);
      const ends = [edge.source, edge.target].map((id) => cards.find((c) => c.id === id));
      const prototype = ends.find((c) => c?.data.nodeType === 'prototype');
      const evidence = ends.find((c) => c?.data.nodeType === 'evidence');
      if (!prototype || !evidence) return;
      setNodes((prev) =>
        prev.map((n) => (isCard(n) && n.id === evidence.id ? { ...n, data: { ...n.data, fromPrototypeId: prototype.id } } : n)),
      );
      setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    },
    [edges, setNodes, setEdges],
  );

  const exportBoard = useCallback(() => {
    downloadBoard(toDocument(nodes, edges, brief, sources, guides), exportFilename(brief.name));
  }, [nodes, edges, brief, sources, guides]);

  const updateBrief = useCallback((patch: Partial<ProjectBrief>) => {
    setBrief((prev) => ({ ...prev, ...patch }));
  }, []);

  // ---- source documents ----
  const addSource = useCallback((doc: SourceDoc) => {
    setSources((prev) => [...prev, doc]);
  }, []);

  /** `patch` can be a function of the current source, for changes based on its latest state. */
  const updateSource = useCallback((id: string, patch: Partial<SourceDoc> | ((current: SourceDoc) => Partial<SourceDoc>)) => {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...(typeof patch === 'function' ? patch(s) : patch) } : s)),
    );
  }, []);

  const removeSource = useCallback((id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /** Puts approved proposals on the board as cards that remember their source.
   * Returns the new card ids. */
  const addCardsFromProposals = useCallback(
    (source: SourceDoc, proposals: CardProposal[]) => {
      const ids = proposals.map(() => crypto.randomUUID());
      setNodes((prev) => {
        const positions = gridSlotsFor(
          prev,
          proposals.map((p) => ({ nodeType: p.nodeType, height: estimateCardHeight(p.title, p.body, true) })),
        );
        const added: CardNode[] = proposals.map((p, i) => ({
          id: ids[i],
          type: 'card',
          position: positions[i],
          dragHandle: CARD_DRAG_HANDLE,
          data: {
            nodeType: p.nodeType,
            title: p.title,
            body: p.body,
            source: { docId: source.id, docName: source.name, quote: p.quote, aiType: p.suggestedType ?? p.nodeType },
            // Cards read from a link point back to it (the card's own Link field, with its Open button).
            ...(source.url ? { link: source.url } : {}),
          },
        }));
        return [...prev, ...added];
      });
      return ids;
    },
    [setNodes],
  );

  return {
    nodes,
    edges,
    brief,
    updateBrief,
    sources,
    addSource,
    updateSource,
    removeSource,
    addCardsFromProposals,
    onNodesChange,
    onEdgesChange,
    gapIds,
    traceIssues,
    skipLinkIds,
    addEvidenceFromPrototype,
    linkToPrototypeResult,
    laneById,
    saveStatus,
    saveError,
    crossTabNotice,
    dismissCrossTabNotice,
    reloadFromStorage,
    resetToExample,
    addNode,
    updateCard,
    deleteNode,
    addRelation,
    deleteEdge,
    exportBoard,
    importDocument,
    groupSelection,
    ungroupNode,
    removeFromGroup,
    moveCardsIntoGroup,
    createThemes,
    addNote,
    updateNoteTitle,
    updateNoteBody,
    updateGroupLabel,
    tidyBoard,
    guides,
    canUndoTidy: tidyUndo !== null,
    undoTidy,
    dismissTidyUndo,
  };
}

export type BoardState = ReturnType<typeof useBoardState>;
