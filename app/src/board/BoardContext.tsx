import { createContext, useContext } from 'react';
import type { CardData } from '../types';

export interface BoardContextValue {
  gapIds: Set<string>;
  laneById: Map<string, { index: number; count: number }>;
  updateCard: (id: string, patch: Partial<Pick<CardData, 'nodeType' | 'title' | 'body' | 'link' | 'image'>>) => void;
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
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoardContext must be used within a BoardContext.Provider');
  return ctx;
}
