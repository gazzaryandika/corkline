import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNodesState, useEdgesState, applyNodeChanges, type Node, type Edge, type NodeChange } from '@xyflow/react';
import { CARD_WIDTH } from '../config';
import { computeGapIds } from '../lib/gaps';
import { computeParallelLanes } from '../lib/parallelEdges';
import { loadBoard, saveBoard, downloadBoard, exportFilename, projectStorageKey } from '../lib/storage';
import { seedBoard } from '../data/seed';
import type {
  BoardDocument,
  BoardNode,
  CardBoardNode,
  CardData,
  EdgeKindId,
  GroupData,
  NodeTypeId,
  ProjectBrief,
  RelationData,
  SaveStatus,
} from '../types';

export type CardNode = Node<CardData, 'card'>;
export type GroupNode = Node<GroupData, 'group'>;
export type AnyNode = CardNode | GroupNode;
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

function toRFNodes(doc: BoardDocument): AnyNode[] {
  return doc.nodes.map((n) => {
    if (n.type === 'group') {
      return { id: n.id, type: 'group', position: { ...n.position }, width: n.width, height: n.height, data: { ...n.data } };
    }
    const rfNode: CardNode = { id: n.id, type: 'card', position: { ...n.position }, data: { ...n.data }, dragHandle: CARD_DRAG_HANDLE };
    if (n.parentId) rfNode.parentId = n.parentId;
    return rfNode;
  });
}

function toDocument(nodes: AnyNode[], edges: RelationEdgeType[], brief: ProjectBrief): BoardDocument {
  return {
    version: 1,
    brief,
    nodes: nodes.map((n): BoardNode => {
      if (isGroup(n)) {
        return { id: n.id, type: 'group', position: n.position, width: n.width ?? CARD_WIDTH, height: n.height ?? DEFAULT_CARD_HEIGHT, data: n.data };
      }
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

  const gapIds = useMemo(
    () =>
      computeGapIds(
        nodes.filter(isCard).map((n) => ({ id: n.id, nodeType: n.data.nodeType })),
        edges.map((e) => ({ target: e.target })),
      ),
    [nodes, edges],
  );

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
    pendingDoc.current = toDocument(nodes, edges, brief);
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(writePending, SAVE_DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, brief]);

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
  const addNode = useCallback(
    (nodeType: NodeTypeId, position: { x: number; y: number }) => {
      const id = crypto.randomUUID();
      const newNode: CardNode = { id, type: 'card', position, data: { nodeType, title: '', body: '' }, dragHandle: CARD_DRAG_HANDLE };
      setNodes((prev) => [...prev, newNode]);
      return id;
    },
    [setNodes],
  );

  const updateCard = useCallback(
    (id: string, patch: Partial<Pick<CardData, 'title' | 'body' | 'link' | 'image'>>) => {
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

  const updateGroupLabel = useCallback(
    (id: string, label: string) => {
      setNodes((prev) => prev.map((n) => (isGroup(n) && n.id === id ? { ...n, data: { ...n.data, label } } : n)));
    },
    [setNodes],
  );

  // ---- CRUD: edges ----
  const addRelation = useCallback(
    (source: string, target: string, kind: EdgeKindId) => {
      if (source === target) return;
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

  const exportBoard = useCallback(() => {
    downloadBoard(toDocument(nodes, edges, brief), exportFilename(brief.name));
  }, [nodes, edges, brief]);

  const updateBrief = useCallback((patch: Partial<ProjectBrief>) => {
    setBrief((prev) => ({ ...prev, ...patch }));
  }, []);

  return {
    nodes,
    edges,
    brief,
    updateBrief,
    onNodesChange,
    onEdgesChange,
    gapIds,
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
    updateGroupLabel,
  };
}

export type BoardState = ReturnType<typeof useBoardState>;
