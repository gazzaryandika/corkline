import { useCallback, useEffect, useRef, useState } from 'react';
import { NODE_TYPES } from '../config';
import { askAi, fetchAiStatus, type AiStatus, type AiTurn } from '../ai/client';
import { describeBoard, describeBrief, describeSources } from '../ai/boardContext';
import { useAiMode } from '../ai/mode';
import { CHAT_SYSTEM_PROMPT } from '../ai/prompts';
import { stripMarkdown } from '../ai/plainText';
import { ModelPicker } from './ModelPicker';
import { SOURCE_KIND_ORDER, SOURCE_KINDS } from '../config';
import { displayLink, findLinks, isYouTube, withoutLinks } from '../lib/links';
import type { SourceActions } from '../state/useSourceActions';
import type { BoardState, CardNode } from '../state/useBoardState';
import { findThemes } from '../ai/themes';
import { summarise } from '../ai/summary';
import type { SourceDoc, SourceKindId, ThemeProposal } from '../types';
import './ChatPanel.css';

/** How many earlier chat turns are sent along, so follow-up questions make sense. */
const HISTORY_TURNS = 12;

interface AttachedCard {
  id: string;
  title: string;
  nodeType: keyof typeof NODE_TYPES;
}

/** A link found in a message, offered as a source. Not sent to the model as chat. */
interface LinkOffer {
  id: string;
  role: 'link';
  url: string;
  kind: SourceKindId;
  status: 'offer' | 'fetching' | 'reading' | 'done' | 'error' | 'dismissed';
  docId?: string;
  docName?: string;
  /** Cards proposed by the last read. */
  proposals?: number;
  error?: string;
}

/** A "Find themes" run and its outcome. Not sent to the model as chat. */
interface ThemesRun {
  id: string;
  role: 'themes';
  status: 'finding' | 'done' | 'error';
  /** Set when the run looked only at the designer's selected cards. */
  selectedIds?: string[];
  found?: number;
  considered?: number;
  alreadyGrouped?: number;
  /** The AI's reason when it found no themes. */
  note?: string;
  error?: string;
}

/** A summary request and the note it put on the board. Not sent to the model as chat. */
interface SummaryRun {
  id: string;
  role: 'summary';
  status: 'writing' | 'done' | 'error';
  /** Set when it summarised the designer's selection rather than the whole board. */
  selectedIds?: string[];
  noteId?: string;
  title?: string;
  error?: string;
}

/** "Summarise these", "give me a summary of the board", "recap", "tl;dr"… */
function isSummaryRequest(text: string): boolean {
  return /\b(summar(y|ies|ise|ize|ised|ized|ising|izing)|sum (it |this |these |them )?up|recap|tl;?dr)\b/i.test(text);
}

/** "Find themes in these", "are there any themes?", "cluster these cards"… */
function isThemeRequest(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(themes?|clusters?|affinity)\b/.test(t) &&
    /\b(find|identify|spot|look|any|are there|is there|show|suggest|group|cluster|emerg\w*|common|shared|see)\b/.test(t)
  );
}

type ChatMessage =
  | { id: string; role: 'user'; text: string; attachedCards?: AttachedCard[] }
  | { id: string; role: 'assistant'; text: string; model: string }
  | { id: string; role: 'error'; text: string }
  | LinkOffer
  | ThemesRun
  | SummaryRun;

interface ChatPanelProps {
  board: BoardState;
  sourceActions: SourceActions;
  /** Opens the Sources panel on this document's review list. */
  onOpenReview: (docId: string) => void;
  /** True while found themes are waiting for review. */
  themesPending: boolean;
  onThemesFound: (themes: ThemeProposal[], model: string) => void;
  onOpenThemes: () => void;
  /** Highlights a summary note's cards on the board (and shows them). */
  onShowNote: (noteId: string) => void;
}

export function ChatPanel({
  board,
  sourceActions,
  onOpenReview,
  themesPending,
  onThemesFound,
  onOpenThemes,
  onShowNote,
}: ChatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useAiMode();
  const [status, setStatus] = useState<AiStatus | null | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  /** The source each link offer created, so Retry re-reads it instead of adding it twice. */
  const linkDocs = useRef(new Map<string, SourceDoc>());

  const selectedCards: AttachedCard[] = board.nodes
    .filter((n): n is CardNode => n.type === 'card' && !!n.selected)
    .map((n) => ({ id: n.id, title: n.data.title || `${NODE_TYPES[n.data.nodeType].label} — untitled`, nodeType: n.data.nodeType }));

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, isTyping]);

  useEffect(() => {
    if (mode === 'gemini') fetchAiStatus().then(setStatus);
  }, [mode]);

  /** Sends the conversation so far (errors excluded) and appends the reply or a visible error. */
  const run = useCallback(
    async (conversation: ChatMessage[]) => {
      const turns: AiTurn[] = conversation
        .filter((m): m is Extract<ChatMessage, { role: 'user' | 'assistant' }> => m.role === 'user' || m.role === 'assistant')
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, text: m.text }));
      if (turns.length === 0) return;

      // The current board goes with the newest question only, so the model always
      // sees the latest state rather than stale copies from earlier turns.
      const last = turns[turns.length - 1];
      const boardText = describeBoard(board.nodes, board.edges, board.gapIds);
      const briefText = describeBrief(board.brief);
      const sourcesText = describeSources(board.sources);
      turns[turns.length - 1] = {
        ...last,
        text: `PROJECT BRIEF\n${briefText}\n\nSOURCE DOCUMENTS\n${sourcesText}\n\nCURRENT BOARD\n${boardText}\n\nQUESTION\n${last.text}`,
      };

      setIsTyping(true);
      try {
        const reply = await askAi(mode, { system: CHAT_SYSTEM_PROMPT, messages: turns });
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: stripMarkdown(reply.text), model: reply.model }]);
      } catch (err) {
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'error', text: (err as Error).message }]);
      } finally {
        setIsTyping(false);
      }
    },
    [board.nodes, board.edges, board.gapIds, board.brief, board.sources, mode],
  );

  const findingThemes = messages.some((m) => m.role === 'themes' && m.status === 'finding');

  /** Asks the AI for themes, then opens the review. With `selectedIds`, only among those
   * cards; otherwise among every card not yet in a group. `existingId` retries a run. */
  const runThemes = useCallback(
    async (selectedIds?: string[], existingId?: string) => {
      const id = existingId ?? crypto.randomUUID();
      const patch = (p: Partial<ThemesRun>) =>
        setMessages((prev) => prev.map((m) => (m.id === id && m.role === 'themes' ? { ...m, ...p } : m)));
      if (existingId) patch({ status: 'finding', error: undefined });
      else setMessages((prev) => [...prev, { id, role: 'themes', status: 'finding', selectedIds }]);
      try {
        const result = await findThemes(mode, board.nodes, board.brief, selectedIds);
        patch({
          status: 'done',
          found: result.themes.length,
          considered: result.considered,
          alreadyGrouped: result.alreadyGrouped,
          note: result.note,
        });
        onThemesFound(result.themes, result.model);
      } catch (err) {
        patch({ status: 'error', error: (err as Error).message });
      }
    },
    [mode, board.nodes, board.brief, onThemesFound],
  );

  const writingSummary = messages.some((m) => m.role === 'summary' && m.status === 'writing');

  /** Writes a summary of the selection (or the whole board) and puts it on the board
   * as a note. `existingId` retries a run. */
  const runSummary = useCallback(
    async (selectedIds?: string[], existingId?: string) => {
      const id = existingId ?? crypto.randomUUID();
      const patch = (p: Partial<SummaryRun>) =>
        setMessages((prev) => prev.map((m) => (m.id === id && m.role === 'summary' ? { ...m, ...p } : m)));
      if (existingId) patch({ status: 'writing', error: undefined });
      else setMessages((prev) => [...prev, { id, role: 'summary', status: 'writing', selectedIds }]);
      try {
        const result = await summarise(mode, board.nodes, board.edges, board.gapIds, board.brief, selectedIds);
        const noteId = board.addNote({
          title: result.title,
          body: result.body,
          createdAt: Date.now(),
          sourceCardIds: result.cardIds,
          scope: selectedIds ? 'selection' : 'board',
          model: result.model,
        });
        patch({ status: 'done', noteId, title: result.title });
        // Let the note render, then show it with its cards.
        window.setTimeout(() => onShowNote(noteId), 120);
      } catch (err) {
        patch({ status: 'error', error: (err as Error).message });
      }
    },
    [mode, board, onShowNote],
  );

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || isTyping) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      attachedCards: selectedCards.length > 0 ? selectedCards : undefined,
    };
    // Links get an offer to read them as sources. If the message was only links,
    // that's all; otherwise the question still goes to the model as usual.
    const offers: LinkOffer[] = findLinks(text).map((url) => ({
      id: crypto.randomUUID(),
      role: 'link',
      url,
      kind: 'research',
      status: 'offer',
    }));
    const next = [...messages, userMessage, ...offers];
    setMessages(next);
    setDraft('');
    // "Find themes in these" etc. runs the theme finder (on the selection, if any)
    // instead of a chat answer, so the result can be reviewed and put on the board.
    const selection = selectedCards.length > 0 ? selectedCards.map((c) => c.id) : undefined;
    if (offers.length === 0 && isThemeRequest(text) && !findingThemes) {
      void runThemes(selection);
      return;
    }
    // "Summarise these" puts a summary note on the board instead of answering in chat.
    if (offers.length === 0 && isSummaryRequest(text) && !writingSummary) {
      void runSummary(selection);
      return;
    }
    if (offers.length === 0 || withoutLinks(text).length > 0) void run(next);
  }, [draft, isTyping, messages, selectedCards, run, runThemes, findingThemes, runSummary, writingSummary]);

  const patchLink = useCallback((id: string, patch: Partial<LinkOffer>) => {
    setMessages((prev) => prev.map((m) => (m.id === id && m.role === 'link' ? { ...m, ...patch } : m)));
  }, []);

  /** Fetches the link (unless an earlier try already did), lists it as a source, and reads it. */
  const readLink = useCallback(
    async (offer: LinkOffer) => {
      let doc = linkDocs.current.get(offer.id);
      if (!doc) {
        patchLink(offer.id, { status: 'fetching', error: undefined });
        try {
          doc = await sourceActions.addLink(offer.url, offer.kind);
        } catch (err) {
          patchLink(offer.id, { status: 'error', error: (err as Error).message });
          return;
        }
        linkDocs.current.set(offer.id, doc);
      }
      patchLink(offer.id, { status: 'reading', docId: doc.id, docName: doc.name, error: undefined });
      const result = await sourceActions.readSource(doc);
      patchLink(
        offer.id,
        result.ok ? { status: 'done', proposals: result.proposals } : { status: 'error', error: result.error },
      );
    },
    [patchLink, sourceActions],
  );

  const handleRetry = useCallback(
    (errorId: string) => {
      const index = messages.findIndex((m) => m.id === errorId);
      const before = messages.slice(0, index);
      setMessages(before);
      void run(before);
    },
    [messages, run],
  );

  const geminiUnavailable = mode === 'gemini' && status !== undefined && !status?.configured;

  return (
    <div className={`chat-panel${collapsed ? ' is-collapsed' : ''}`}>
      <button type="button" className="chat-panel__head" onClick={() => setCollapsed((c) => !c)}>
        <span>AI ASSISTANT</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div className="chat-panel__body">
          <div className="chat-panel__mode">
            <div className="chat-panel__mode-toggle" role="radiogroup" aria-label="AI mode">
              {(['mock', 'gemini'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  className={mode === m ? 'is-active' : ''}
                  onClick={() => setMode(m)}
                >
                  {m === 'mock' ? 'Mock' : 'Gemini'}
                </button>
              ))}
            </div>
            {mode === 'gemini' && status?.configured ? (
              <ModelPicker />
            ) : (
              <span className={`chat-panel__mode-status${geminiUnavailable ? ' is-error' : ''}`}>
                {mode === 'mock'
                  ? 'canned replies, no API call'
                  : status === undefined
                    ? 'checking…'
                    : status === null
                      ? 'dev server unreachable'
                      : 'no API key set'}
              </span>
            )}
          </div>

          <div className="chat-panel__messages" ref={listRef}>
            {messages.length === 0 && !isTyping && (
              <p className="chat-panel__empty">
                Ask about the board, or select a card or two first. Paste a link to read it as a source.
              </p>
            )}
            {messages.map((m) =>
              m.role === 'summary' ? (
                <SummaryRunCard
                  key={m.id}
                  run={m}
                  noteExists={!!m.noteId && board.nodes.some((n) => n.id === m.noteId)}
                  onShow={() => m.noteId && onShowNote(m.noteId)}
                  onRetry={() => void runSummary(m.selectedIds, m.id)}
                />
              ) : m.role === 'themes' ? (
                <ThemesRunCard
                  key={m.id}
                  run={m}
                  // Only the newest run's themes can still be reviewed.
                  canReview={themesPending && m.id === [...messages].reverse().find((x) => x.role === 'themes')?.id}
                  onReview={onOpenThemes}
                  onRetry={() => void runThemes(m.selectedIds, m.id)}
                />
              ) : m.role === 'link' ? (
                <LinkOfferCard
                  key={m.id}
                  offer={m}
                  doc={m.docId ? board.sources.find((s) => s.id === m.docId) : undefined}
                  onKind={(kind) => patchLink(m.id, { kind })}
                  onRead={() => void readLink(m)}
                  onDismiss={() => patchLink(m.id, { status: 'dismissed' })}
                  onReview={() => m.docId && onOpenReview(m.docId)}
                />
              ) : (
              <div key={m.id} className={`chat-msg chat-msg--${m.role}`}>
                {m.role === 'user' && m.attachedCards && m.attachedCards.length > 0 && (
                  <div className="chat-msg__chips">
                    {m.attachedCards.map((c) => (
                      <span className="chat-chip" key={c.id}>
                        <span className="chat-chip__dot" style={{ background: NODE_TYPES[c.nodeType].color }} />
                        {c.title}
                      </span>
                    ))}
                  </div>
                )}
                <div className="chat-msg__bubble">{m.text}</div>
                {m.role === 'assistant' && <span className="chat-msg__meta">{m.model}</span>}
                {m.role === 'error' && (
                  <button type="button" className="chat-msg__retry" onClick={() => handleRetry(m.id)} disabled={isTyping}>
                    Retry
                  </button>
                )}
              </div>
              ),
            )}
            {isTyping && (
              <div className="chat-msg chat-msg--assistant">
                <div className="chat-msg__bubble chat-msg__bubble--typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>

          <div className="chat-panel__actions">
            <button
              type="button"
              onClick={() => void runThemes(selectedCards.length > 0 ? selectedCards.map((c) => c.id) : undefined)}
              disabled={findingThemes}
              title={
                selectedCards.length > 0
                  ? 'Ask the AI whether the selected cards share themes (same-type cards only); you review before anything changes'
                  : 'Ask the AI which cards of the same type share a theme (cards not in a group yet); you review before anything changes. Select cards first to look at just those.'
              }
            >
              ✦ Find themes{selectedCards.length > 0 ? ` in ${selectedCards.length} selected` : ''}
            </button>
            <button
              type="button"
              onClick={() => void runSummary(selectedCards.length > 0 ? selectedCards.map((c) => c.id) : undefined)}
              disabled={writingSummary}
              title="Write a summary as a yellow note on the board. Select cards first to summarise just those."
            >
              ✦ Summarise {selectedCards.length > 0 ? `${selectedCards.length} selected` : 'board'}
            </button>
          </div>

          <div className="chat-panel__context">
            {selectedCards.length === 0 ? (
              <span className="chat-panel__context-empty">No cards selected — the AI sees the whole board</span>
            ) : (
              <>
                <span className="chat-panel__context-label">
                  Referencing {selectedCards.length} {selectedCards.length === 1 ? 'card' : 'cards'}
                </span>
                <div className="chat-panel__context-chips">
                  {selectedCards.map((c) => (
                    <span className="chat-chip" key={c.id}>
                      <span className="chat-chip__dot" style={{ background: NODE_TYPES[c.nodeType].color }} />
                      {c.title}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="chat-panel__composer">
            <input
              type="text"
              placeholder="Ask about the board, or paste a link…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
            />
            <button type="button" onClick={handleSend} disabled={!draft.trim() || isTyping}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface LinkOfferCardProps {
  offer: LinkOffer;
  /** The source this link became, once added (to see whether its review is still open). */
  doc?: SourceDoc;
  onKind: (kind: SourceKindId) => void;
  onRead: () => void;
  onDismiss: () => void;
  onReview: () => void;
}

/** The chat's offer to read a pasted link as a source, and its progress. */
function LinkOfferCard({ offer, doc, onKind, onRead, onDismiss, onReview }: LinkOfferCardProps) {
  const pending = doc?.proposals?.length ?? 0;
  const label = isYouTube(offer.url) ? 'YouTube video' : 'Link';

  return (
    <div className={`chat-link is-${offer.status}`}>
      <div className="chat-link__head">
        <span className="chat-link__label">{label}</span>
        <a href={offer.url} target="_blank" rel="noopener noreferrer" title={offer.url}>
          {displayLink(offer.url)} ↗
        </a>
      </div>

      {offer.status === 'offer' && (
        <>
          <p>Read this as a source? Corkline drafts cards from it for you to review.</p>
          <div className="chat-link__actions">
            <select value={offer.kind} aria-label="Kind of source" onChange={(e) => onKind(e.target.value as SourceKindId)}>
              {SOURCE_KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {SOURCE_KINDS[k].label}
                </option>
              ))}
            </select>
            <button type="button" className="chat-link__primary" onClick={onRead}>
              Read as source
            </button>
            <button type="button" onClick={onDismiss}>
              No
            </button>
          </div>
        </>
      )}

      {(offer.status === 'fetching' || offer.status === 'reading') && (
        <p className="chat-link__progress">
          <span className="chat-link__spinner" aria-hidden />
          {offer.status === 'fetching' ? 'Fetching the page…' : `Reading “${doc?.name ?? offer.docName}”… this can take a minute`}
        </p>
      )}

      {offer.status === 'done' && (
        <>
          <p>
            Read “{doc?.name ?? offer.docName}”.{' '}
            {offer.proposals === 0
              ? 'No cards proposed; the summary is in Sources.'
              : pending > 0
                ? `${pending} ${pending === 1 ? 'card' : 'cards'} ready to review.`
                : 'Review finished.'}
          </p>
          {pending > 0 && (
            <div className="chat-link__actions">
              <button type="button" className="chat-link__primary" onClick={onReview}>
                Review cards
              </button>
            </div>
          )}
        </>
      )}

      {offer.status === 'error' && (
        <>
          <p className="chat-link__error">{offer.error}</p>
          <div className="chat-link__actions">
            <button type="button" onClick={onRead}>
              Retry
            </button>
            <button type="button" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        </>
      )}

      {offer.status === 'dismissed' && <p className="chat-link__muted">Not read.</p>}
    </div>
  );
}

interface ThemesRunCardProps {
  run: ThemesRun;
  canReview: boolean;
  onReview: () => void;
  onRetry: () => void;
}

/** Progress and result of a "Find themes" run in the chat. */
function ThemesRunCard({ run, canReview, onReview, onRetry }: ThemesRunCardProps) {
  const skipped =
    run.alreadyGrouped && run.alreadyGrouped > 0
      ? ` ${run.alreadyGrouped} ${run.alreadyGrouped === 1 ? 'card was' : 'cards were'} already in a group and left as ${run.alreadyGrouped === 1 ? 'it is' : 'they are'}.`
      : '';
  const count = run.considered ?? run.selectedIds?.length ?? 0;
  const among = run.selectedIds
    ? `the ${count} selected ${count === 1 ? 'card' : 'cards'}`
    : `${count} ${count === 1 ? 'card' : 'cards'}`;
  return (
    <div className={`chat-link chat-themes is-${run.status}`}>
      <div className="chat-link__head">
        <span className="chat-link__label">✦ Themes</span>
      </div>
      {run.status === 'finding' && (
        <p className="chat-link__progress">
          <span className="chat-link__spinner" aria-hidden />
          Looking for themes among {run.selectedIds ? `the ${run.selectedIds.length} selected cards` : 'the cards'}…
        </p>
      )}
      {run.status === 'done' && (
        <>
          <p>
            {run.found === 0
              ? `No themes among ${among}.${run.note ? ` ${run.note}` : ''}${skipped}`
              : `Found ${run.found} ${run.found === 1 ? 'theme' : 'themes'} among ${among}.${skipped}`}
          </p>
          {run.found !== 0 && (
            <div className="chat-link__actions">
              {canReview ? (
                <button type="button" className="chat-link__primary" onClick={onReview}>
                  Review themes
                </button>
              ) : (
                <span className="chat-link__muted">Review finished.</span>
              )}
            </div>
          )}
        </>
      )}
      {run.status === 'error' && (
        <>
          <p className="chat-link__error">{run.error}</p>
          <div className="chat-link__actions">
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface SummaryRunCardProps {
  run: SummaryRun;
  noteExists: boolean;
  onShow: () => void;
  onRetry: () => void;
}

/** Progress of a summary request in the chat; the summary itself goes on the board. */
function SummaryRunCard({ run, noteExists, onShow, onRetry }: SummaryRunCardProps) {
  const what = run.selectedIds
    ? `the ${run.selectedIds.length} selected ${run.selectedIds.length === 1 ? 'card' : 'cards'}`
    : 'the whole board';
  return (
    <div className={`chat-link chat-summary is-${run.status}`}>
      <div className="chat-link__head">
        <span className="chat-link__label">✦ Summary</span>
      </div>
      {run.status === 'writing' && (
        <p className="chat-link__progress">
          <span className="chat-link__spinner" aria-hidden />
          Summarising {what}…
        </p>
      )}
      {run.status === 'done' && (
        <>
          <p>
            {noteExists
              ? `Added a summary note of ${what} to the board: “${run.title}”.`
              : `The summary note “${run.title}” was deleted from the board.`}
          </p>
          {noteExists && (
            <div className="chat-link__actions">
              <button type="button" className="chat-link__primary" onClick={onShow}>
                Show on board
              </button>
            </div>
          )}
        </>
      )}
      {run.status === 'error' && (
        <>
          <p className="chat-link__error">{run.error}</p>
          <div className="chat-link__actions">
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        </>
      )}
    </div>
  );
}
