import { createContext, useContext } from 'react';
import type { CardData } from '../types';
import type { TraceIssue } from '../lib/trace';

export interface BoardContextValue {
  /** What each flagged card's trace is missing (lib/trace.ts). */
  traceIssues: Map<string, TraceIssue[]>;
  /** Links that skip a step, drawn as warnings. */
  skipLinkIds: Set<string>;
  /** Prototype titles by id, for Evidence cards that came from testing one. */
  prototypeTitles: Map<string, string>;
  /** Adds an Evidence card for a result of testing this prototype; returns its id. */
  addEvidenceFromPrototype: (prototypeId: string) => { id: string };
  laneById: Map<string, { index: number; count: number }>;
  updateCard: (id: string, patch: Partial<Pick<CardData, 'nodeType' | 'title' | 'body' | 'link' | 'image' | 'fromPrototypeId'>>) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  armedNodeId: string | null;
  onConnectorPointerDown: (nodeId: string, event: React.PointerEvent) => void;
  onExpandCard: (id: string) => void;
  updateGroupLabel: (id: string, label: string) => void;
  ungroupNode: (id: string) => void;
  /** Ids of nodes (cards + their group frame) to keep at full strength while a
   * selection is active — everything else dims. `null` means no selection, so
   * nothing dims. See BoardCanvas for how this set is built. */
  focusNodeIds: Set<string> | null;
  /** Edge ids that touch the current selection — these glow instead of dimming. */
  focusEdgeIds: Set<string> | null;
  /** The frame a card being dragged would join if dropped now. */
  dropTargetGroupId: string | null;
  updateNoteTitle: (id: string, title: string) => void;
  updateNoteBody: (id: string, body: string) => void;
  /** The summary note whose cards are highlighted right now. */
  highlightedNoteId: string | null;
  /** Clicking a link traces its path (toggles). */
  onEdgeClick: (edgeId: string) => void;
  /** The link whose path is traced right now. */
  highlightedEdgeId: string | null;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoardContext must be used within a BoardContext.Provider');
  return ctx;
}
