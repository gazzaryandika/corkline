import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { NODE_TYPES } from '../config';
import type { BoardState, CardNode } from '../state/useBoardState';
import type { ThemeProposal } from '../types';
import './SourcesPanel.css';
import './ThemesPanel.css';

interface ThemesPanelProps {
  board: BoardState;
  themes: ThemeProposal[];
  model: string;
  /** Applied to the latest themes, so quick successive clicks don't overwrite each other. */
  onChange: (update: (themes: ThemeProposal[]) => ThemeProposal[]) => void;
  /** Called once the review is finished (themes applied or all rejected). */
  onDone: () => void;
  /** Close but keep the themes for later. */
  onClose: () => void;
}

/** Review of the themes the AI found: rename, take cards out, accept or reject each. */
export function ThemesPanel({ board, themes, model, onChange, onDone, onClose }: ThemesPanelProps) {
  const { fitView } = useReactFlow();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const cardsById = new Map(
    board.nodes.filter((n): n is CardNode => n.type === 'card').map((n) => [n.id, n]),
  );
  // Cards can be deleted on the board while the review is open; those drop out.
  const live = (t: ThemeProposal) => t.cardIds.filter((id) => cardsById.has(id));

  const patch = (id: string, change: Partial<ThemeProposal>) =>
    onChange((current) => current.map((t) => (t.id === id ? { ...t, ...change } : t)));
  const removeCard = (themeId: string, cardId: string) =>
    onChange((current) => current.map((t) => (t.id === themeId ? { ...t, cardIds: t.cardIds.filter((c) => c !== cardId) } : t)));
  const setAll = (decision: ThemeProposal['decision']) =>
    onChange((current) => current.map((t) => (live(t).length > 0 ? { ...t, decision } : t)));

  const accepted = themes.filter((t) => t.decision === 'accepted' && live(t).length > 0);
  const undecided = themes.filter((t) => t.decision === 'pending' && live(t).length > 0).length;

  const apply = () => {
    const groupIds =
      accepted.length > 0
        ? board.createThemes(
            accepted.map((t) => ({ nodeType: t.nodeType, label: t.name.trim() || 'Untitled theme', description: t.description, cardIds: live(t) })),
          )
        : [];
    onDone();
    if (groupIds.length > 0) {
      window.setTimeout(() => fitView({ nodes: groupIds.map((id) => ({ id })), padding: 0.2, maxZoom: 1, duration: 500 }), 150);
    }
  };

  return createPortal(
    <div
      className="sources-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sources-modal" role="dialog" aria-modal="true" aria-labelledby="themes-title">
        <div className="sources-modal__header">
          <span id="themes-title" className="sources-modal__heading">
            Themes
          </span>
          <div className="sources-modal__header-right">
            <span className="sources-mode__status">by {model}</span>
            <button type="button" className="sources-modal__close" onClick={onClose} title="Close (keeps the themes for later)">
              ×
            </button>
          </div>
        </div>

        <div className="sources-body sources-body--review">
          <p className="sources-intro">
            Themes the AI sees among cards of the same type. Rename them, take out cards that don&rsquo;t belong, and
            accept the ones that hold up. Accepted themes become labelled frames on the board; right-click a card there to
            take it out of its theme later.
          </p>
          <div className="review-bulk">
            <button type="button" className="sources-btn" onClick={() => setAll('accepted')}>
              Accept all
            </button>
            <button type="button" className="sources-btn" onClick={() => setAll('rejected')}>
              Reject all
            </button>
          </div>

          <ul className="theme-list">
            {themes.map((t) => {
              const cfg = NODE_TYPES[t.nodeType];
              const cards = live(t);
              const empty = cards.length === 0;
              return (
                <li
                  key={t.id}
                  className={`theme-item is-${empty ? 'rejected' : t.decision}`}
                  style={{ ['--type-color' as string]: cfg.color } as React.CSSProperties}
                >
                  <div className="proposal__top">
                    <span className="theme-item__type">{cfg.label} theme</span>
                    <span className="proposal__confidence">
                      {cards.length} {cards.length === 1 ? 'card' : 'cards'}
                    </span>
                    <div className="proposal__decide">
                      <button
                        type="button"
                        className={t.decision === 'rejected' ? 'is-on is-reject' : ''}
                        aria-pressed={t.decision === 'rejected'}
                        disabled={empty}
                        onClick={() => patch(t.id, { decision: t.decision === 'rejected' ? 'pending' : 'rejected' })}
                      >
                        ✕ Reject
                      </button>
                      <button
                        type="button"
                        className={t.decision === 'accepted' ? 'is-on is-accept' : ''}
                        aria-pressed={t.decision === 'accepted'}
                        disabled={empty}
                        onClick={() => patch(t.id, { decision: t.decision === 'accepted' ? 'pending' : 'accepted' })}
                      >
                        ✓ Accept
                      </button>
                    </div>
                  </div>
                  <input
                    className="proposal__title"
                    value={t.name}
                    aria-label="Theme name"
                    onChange={(e) => patch(t.id, { name: e.target.value })}
                  />
                  {t.description && <p className="theme-item__desc">{t.description}</p>}
                  <ul className="theme-item__cards">
                    {cards.map((id) => {
                      const card = cardsById.get(id)!;
                      return (
                        <li key={id}>
                          <span className="theme-item__dot" aria-hidden />
                          <span className="theme-item__card-title" title={card.data.body || undefined}>
                            {card.data.title.trim() || `${cfg.label}, untitled`}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeCard(t.id, id)}
                            title="Take this card out of the theme"
                            aria-label={`Take “${card.data.title}” out of the theme`}
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                    {empty && <li className="theme-item__empty">No cards left in this theme.</li>}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="sources-footer sources-footer--review">
          <span className="sources-footer__note">
            {accepted.length === 0 && undecided > 0
              ? 'Accept themes to add them, or reject all to finish.'
              : undecided > 0
                ? `${undecided} not decided yet; ${undecided === 1 ? 'it' : 'they'} will be discarded.`
                : ' '}
          </span>
          <button type="button" className="sources-btn" onClick={onClose}>
            Finish later
          </button>
          {accepted.length === 0 && undecided === 0 ? (
            <button type="button" className="sources-btn sources-btn--primary" onClick={apply}>
              Finish review (all rejected)
            </button>
          ) : (
            <button type="button" className="sources-btn sources-btn--primary" onClick={apply} disabled={accepted.length === 0}>
              {accepted.length > 0
                ? `Add ${accepted.length} ${accepted.length === 1 ? 'theme' : 'themes'} to board`
                : 'Add themes to board'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
