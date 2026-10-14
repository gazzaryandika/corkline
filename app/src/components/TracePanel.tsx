import { useEffect, useState } from 'react';
import { EDGE_KINDS, NODE_TYPE_ORDER, NODE_TYPES } from '../config';
import type { BoardState, CardNode } from '../state/useBoardState';
import { issueText, skipExplanation, stepOf } from '../lib/trace';
import './TracePanel.css';

interface TracePanelProps {
  board: BoardState;
  onClose: () => void;
  /** Lights up these cards on the board and shows them. */
  onShowCards: (cardIds: string[]) => void;
  /** Asks the AI (in the chat) for a step-by-step route to replace a skipping link. */
  onAskRoute: (request: string) => void;
}

/**
 * The trace check: links that skip a step, and cards whose trace is missing a step
 * (see lib/trace.ts). Nothing is changed here without the designer clicking it, and
 * nothing is deleted automatically.
 */
export function TracePanel({ board, onClose, onShowCards, onAskRoute }: TracePanelProps) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const cards = new Map(board.nodes.filter((n): n is CardNode => n.type === 'card').map((n) => [n.id, n]));
  const name = (c: CardNode) => `${NODE_TYPES[c.data.nodeType].label} “${c.data.title.trim() || 'untitled'}”`;

  // Skipping links, read left to right (earlier step first) like they're drawn.
  const skips = board.edges
    .filter((e) => board.skipLinkIds.has(e.id) && e.data && cards.has(e.source) && cards.has(e.target))
    .map((e) => {
      const source = cards.get(e.source)!;
      const target = cards.get(e.target)!;
      const reversed = stepOf(target.data.nodeType) < stepOf(source.data.nodeType);
      const kind = EDGE_KINDS[e.data!.kind];
      return {
        id: e.id,
        left: reversed ? target : source,
        right: reversed ? source : target,
        label: reversed ? kind.reverseLabel : kind.label,
        isPrototypeResult:
          [source, target].some((c) => c.data.nodeType === 'prototype') &&
          [source, target].some((c) => c.data.nodeType === 'evidence'),
      };
    })
    .sort((a, b) => stepOf(a.left.data.nodeType) - stepOf(b.left.data.nodeType));

  const flagged = [...board.traceIssues.entries()]
    .filter(([id]) => cards.has(id))
    .map(([id, issues]) => ({ card: cards.get(id)!, issues }))
    .sort((a, b) => NODE_TYPE_ORDER.indexOf(a.card.data.nodeType) - NODE_TYPE_ORDER.indexOf(b.card.data.nodeType));

  return (
    <aside className="trace-panel" aria-label="Trace check">
      <div className="trace-panel__head">
        <span className="trace-panel__title">Trace check</span>
        <button type="button" className="trace-panel__close" onClick={onClose} title="Close (Esc)">
          ×
        </button>
      </div>
      <div className="trace-panel__body">
        <p className="trace-panel__intro">
          Each card should be traceable one step at a time: Problem → Assumption → Evidence → Insight → Opportunity →
          Direction → Prototype. Nothing here changes unless you click it.
        </p>

        <h4>
          Links that skip a step <span className="trace-panel__count">{skips.length}</span>
        </h4>
        {skips.length === 0 && <p className="trace-panel__empty">None. Every link goes one step at a time.</p>}
        <ul className="trace-panel__list">
          {skips.map((s) => (
            <li key={s.id} className="trace-item trace-item--skip">
              <button type="button" className="trace-item__link" onClick={() => onShowCards([s.left.id, s.right.id])} title="Show on the board">
                <span style={{ color: NODE_TYPES[s.left.data.nodeType].color }}>{name(s.left)}</span>
                <span className="trace-item__kind"> — {s.label} → </span>
                <span style={{ color: NODE_TYPES[s.right.data.nodeType].color }}>{name(s.right)}</span>
              </button>
              <p className="trace-item__why">
                {s.isPrototypeResult
                  ? 'Results from testing a prototype come back as new Evidence, rather than a link back across the chain.'
                  : skipExplanation(s.left.data.nodeType, s.right.data.nodeType)}
              </p>
              <div className="trace-item__actions">
                {s.isPrototypeResult ? (
                  <button
                    type="button"
                    className="trace-btn trace-btn--primary"
                    onClick={() => board.linkToPrototypeResult(s.id)}
                    title="Remove the link and mark the Evidence card as a result of this prototype"
                  >
                    Mark as prototype result
                  </button>
                ) : (
                  <button
                    type="button"
                    className="trace-btn trace-btn--primary"
                    onClick={() =>
                      onAskRoute(
                        `The link ${name(s.left)} ${s.label} ${name(s.right)} skips steps. Suggest step-by-step links between them through cards already on the board (${[
                          s.left.data.nodeType,
                          ...NODE_TYPE_ORDER.slice(stepOf(s.left.data.nodeType) + 1, stepOf(s.right.data.nodeType)),
                          s.right.data.nodeType,
                        ]
                          .map((t) => NODE_TYPES[t].label)
                          .join(' → ')}). If there's no card for a step yet, say which one is missing.`,
                      )
                    }
                  >
                    ✦ Ask AI for the steps
                  </button>
                )}
                <button
                  type="button"
                  className={`trace-btn${confirmRemove === s.id ? ' is-confirming' : ''}`}
                  onClick={() => {
                    if (confirmRemove === s.id) {
                      board.deleteEdge(s.id);
                      setConfirmRemove(null);
                    } else setConfirmRemove(s.id);
                  }}
                >
                  {confirmRemove === s.id ? 'Remove link?' : 'Remove link'}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <h4>
          Cards missing a step <span className="trace-panel__count">{flagged.length}</span>
        </h4>
        {flagged.length === 0 && <p className="trace-panel__empty">None. Every card traces back to its previous step.</p>}
        <ul className="trace-panel__list">
          {flagged.map(({ card, issues }) => (
            <li key={card.id} className="trace-item">
              <button type="button" className="trace-item__link" onClick={() => onShowCards([card.id])} title="Show on the board">
                <span style={{ color: NODE_TYPES[card.data.nodeType].color }}>{name(card)}</span>
              </button>
              <p className="trace-item__why">{issues.map((i) => issueText(i, card.data.nodeType)).join(' · ')}</p>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
