import { useCallback, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { CARD_WIDTH, NODE_TYPE_ORDER, NODE_TYPES } from '../config';
import { parseImportedBoard } from '../lib/storage';
import type { BoardState, CardNode, RelationEdgeType } from '../state/useBoardState';
import type { NodeTypeId } from '../types';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { ProjectBriefModal } from './ProjectBriefModal';
import { goToProjects } from '../lib/route';
import './Toolbar.css';

interface ToolbarProps {
  board: BoardState;
  /** Open the Project panel on first render (used right after creating a project). */
  initialBriefOpen?: boolean;
  onOpenSources: () => void;
  /** How many documents the AI is reading right now. */
  readingCount: number;
}

export function Toolbar({ board, initialBriefOpen = false, onOpenSources, readingCount }: ToolbarProps) {
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow<CardNode, RelationEdgeType>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [briefOpen, setBriefOpen] = useState(initialBriefOpen);

  const handleAdd = useCallback(
    (nodeType: NodeTypeId) => {
      const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const jitter = (Math.random() - 0.5) * 70;
      board.addNode(nodeType, { x: center.x - CARD_WIDTH / 2 + jitter, y: center.y - 50 + jitter });
    },
    [board, screenToFlowPosition],
  );

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const doc = parseImportedBoard(text);
        if (window.confirm('Importing will replace everything on the current board. Continue?')) {
          board.importDocument(doc);
        }
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Could not import that file.');
      }
    },
    [board],
  );

  const handleResetToExample = useCallback(() => {
    if (window.confirm('Reset to the example board? This replaces everything currently on the canvas (export first if you want to keep it).')) {
      board.resetToExample();
    }
  }, [board]);

  const selectedCardIds = board.nodes.filter((n) => n.type === 'card' && n.selected && !n.parentId).map((n) => n.id);
  const canGroup = selectedCardIds.length >= 2;

  const gapCount = board.gapIds.size;
  const toReview = board.sources.reduce((n, s) => n + (s.proposals?.length ?? 0), 0);

  return (
    <div className="toolbar">
      <button type="button" className="group-btn" title="Back to all projects" onClick={goToProjects}>
        ← Projects
      </button>
      <div className="toolbar__brand">
        <span className="toolbar__mark" aria-hidden />
        CORKLINE<span> · {board.brief.name.trim() || 'opportunity map'}</span>
      </div>
      <button
        type="button"
        className="group-btn"
        title="Project name, description and context (the AI reads this)"
        onClick={() => setBriefOpen(true)}
      >
        ✎ Project
      </button>
      <button
        type="button"
        className="group-btn toolbar__sources"
        title="Documents behind this project: add them and let the AI draft cards for you to review"
        onClick={onOpenSources}
      >
        ▤ Sources{board.sources.length > 0 && <span className="toolbar__count">{board.sources.length}</span>}
        {readingCount > 0 ? (
          <span className="toolbar__badge">reading…</span>
        ) : (
          toReview > 0 && <span className="toolbar__badge">{toReview} to review</span>
        )}
      </button>
      <div className="toolbar__add-group">
        {NODE_TYPE_ORDER.map((key) => {
          const cfg = NODE_TYPES[key];
          return (
            <button key={key} type="button" className="add-btn" onClick={() => handleAdd(key)}>
              <span className="add-btn__dot" style={{ background: cfg.color }} />+ {cfg.label}
            </button>
          );
        })}
      </div>
      <div className="toolbar__spacer" />
      <SaveStatusIndicator status={board.saveStatus} error={board.saveError} />
      <div className={`gap-pill${gapCount > 0 ? ' has-gaps' : ''}`}>
        {gapCount} {gapCount === 1 ? 'gap' : 'gaps'}
      </div>
      <span className="toolbar__divider" aria-hidden />
      <button
        type="button"
        className="group-btn"
        disabled={!canGroup}
        title={canGroup ? 'Group the selected cards (⌘/Ctrl-G)' : 'Select 2+ cards to group them'}
        onClick={() => board.groupSelection(selectedCardIds)}
      >
        ▢ Group
      </button>
      <span className="toolbar__divider" aria-hidden />
      <div className="toolbar__io">
        <button type="button" className="icon-btn" title="Reset to the example board" onClick={handleResetToExample}>
          ↺
        </button>
        <button type="button" className="icon-btn" title="Export board as a JSON backup" onClick={board.exportBoard}>
          ⇩
        </button>
        <button type="button" className="icon-btn" title="Import a board JSON file" onClick={handleImportClick}>
          ⇧
        </button>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileChange} style={{ display: 'none' }} />
      </div>
      <span className="toolbar__divider" aria-hidden />
      <div className="toolbar__zoom">
        <button type="button" className="icon-btn" title="Zoom out" onClick={() => zoomOut()}>
          −
        </button>
        <button type="button" className="icon-btn" title="Zoom in" onClick={() => zoomIn()}>
          +
        </button>
        <button type="button" className="icon-btn" title="Fit to view" onClick={() => fitView({ padding: 0.2 })}>
          ⤾
        </button>
      </div>
      {briefOpen && <ProjectBriefModal brief={board.brief} onChange={board.updateBrief} onClose={() => setBriefOpen(false)} />}
    </div>
  );
}
