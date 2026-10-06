import { useCallback, useEffect, useRef, useState } from 'react';
import { NODE_TYPES } from '../config';
import { askAi, fetchAiStatus, type AiStatus, type AiTurn } from '../ai/client';
import { describeBoard, describeBrief, describeSources } from '../ai/boardContext';
import { useAiMode } from '../ai/mode';
import { CHAT_SYSTEM_PROMPT } from '../ai/prompts';
import { stripMarkdown } from '../ai/plainText';
import { ModelPicker } from './ModelPicker';
import type { BoardState, CardNode } from '../state/useBoardState';
import './ChatPanel.css';

/** How many earlier chat turns are sent along, so follow-up questions make sense. */
const HISTORY_TURNS = 12;

interface AttachedCard {
  id: string;
  title: string;
  nodeType: keyof typeof NODE_TYPES;
}

type ChatMessage =
  | { id: string; role: 'user'; text: string; attachedCards?: AttachedCard[] }
  | { id: string; role: 'assistant'; text: string; model: string }
  | { id: string; role: 'error'; text: string };

interface ChatPanelProps {
  board: BoardState;
}

export function ChatPanel({ board }: ChatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useAiMode();
  const [status, setStatus] = useState<AiStatus | null | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

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
        .filter((m) => m.role !== 'error')
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text }));
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
    const next = [...messages, userMessage];
    setMessages(next);
    setDraft('');
    void run(next);
  }, [draft, isTyping, messages, selectedCards, run]);

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
              <p className="chat-panel__empty">Ask about the board, or select a card or two first.</p>
            )}
            {messages.map((m) => (
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
            ))}
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
              placeholder="Ask about the board…"
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
