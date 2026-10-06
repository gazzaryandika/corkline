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
import type { SourceDoc, SourceKindId } from '../types';
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

type ChatMessage =
  | { id: string; role: 'user'; text: string; attachedCards?: AttachedCard[] }
  | { id: string; role: 'assistant'; text: string; model: string }
  | { id: string; role: 'error'; text: string }
  | LinkOffer;

interface ChatPanelProps {
  board: BoardState;
  sourceActions: SourceActions;
  /** Opens the Sources panel on this document's review list. */
  onOpenReview: (docId: string) => void;
}

export function ChatPanel({ board, sourceActions, onOpenReview }: ChatPanelProps) {
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
    if (offers.length === 0 || withoutLinks(text).length > 0) void run(next);
  }, [draft, isTyping, messages, selectedCards, run]);

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
              m.role === 'link' ? (
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
