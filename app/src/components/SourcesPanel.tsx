import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReactFlow } from '@xyflow/react';
import { NODE_TYPE_ORDER, NODE_TYPES, SOURCE_KIND_ORDER, SOURCE_KINDS } from '../config';
import { fetchAiStatus, type AiStatus } from '../ai/client';
import { useAiMode } from '../ai/mode';
import { extractCards, type ExtractContent } from '../ai/extract';
import { describeBoard } from '../ai/boardContext';
import {
  ACCEPTED_EXTENSIONS,
  MAX_FILE_BYTES,
  MAX_TEXT_CHARS,
  PASTED_MIME_TYPE,
  baseName,
  categoryOf,
  checkFile,
  detectFileType,
  extractText,
  formatSize,
  toBase64,
  type FileCategory,
} from '../lib/documents';
import { deleteFile, getFile, putFile, saveExtractedText } from '../lib/fileStore';
import type { BoardState } from '../state/useBoardState';
import type { CardProposal, NodeTypeId, SourceDoc, SourceKindId } from '../types';
import { ModelPicker } from './ModelPicker';
import './SourcesPanel.css';

const DELETE_CONFIRM_MS = 2400;

interface SourcesPanelProps {
  board: BoardState;
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Reports which sources are being read, so the toolbar can show it while the panel is closed. */
  onReadingChange?: (count: number) => void;
}

type View = { name: 'list' } | { name: 'paste' } | { name: 'review'; docId: string };

type ReadState = { status: 'reading' } | { status: 'error'; message: string };

const CATEGORY_ICON: Record<FileCategory, string> = {
  text: '¶',
  docx: 'W',
  pdf: 'PDF',
  image: '▣',
  audio: '♪',
};

const CATEGORY_LABEL: Record<FileCategory, string> = {
  text: 'Text',
  docx: 'Word',
  pdf: 'PDF',
  image: 'Image',
  audio: 'Audio',
};

/** A sensible starting kind, from the file name and type. The designer can change it. */
function guessKind(name: string, category: FileCategory, isFirst: boolean): SourceKindId {
  const n = name.toLowerCase();
  if (/interview|transcript/.test(n)) return 'interview';
  if (/observ|field|safari/.test(n)) return 'observation';
  if (/brief|context|assignment|challenge/.test(n)) return 'context';
  if (/workshop|sticky|whiteboard|post-?it/.test(n)) return 'workshop';
  if (/research|report|paper|study|survey/.test(n)) return 'research';
  if (category === 'audio') return 'interview';
  if (category === 'image') return 'workshop';
  return isFirst ? 'context' : 'other';
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function SourcesPanel({ board, projectId, open, onClose, onReadingChange }: SourcesPanelProps) {
  const { fitView } = useReactFlow();
  const [view, setView] = useState<View>({ name: 'list' });
  const [mode, setMode] = useAiMode();
  const [status, setStatus] = useState<AiStatus | null | undefined>(undefined);
  const [reads, setReads] = useState<Record<string, ReadState>>({});
  const [addErrors, setAddErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const deleteTimer = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Latest board, for reads that finish after the board has changed.
  const boardRef = useRef(board);
  useLayoutEffect(() => {
    boardRef.current = board;
  });

  useEffect(() => {
    if (open && mode === 'gemini') fetchAiStatus().then(setStatus);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => () => window.clearTimeout(deleteTimer.current), []);

  const readingCount = Object.values(reads).filter((r) => r.status === 'reading').length;
  useEffect(() => onReadingChange?.(readingCount), [readingCount, onReadingChange]);

  const setRead = (id: string, state: ReadState | null) =>
    setReads((prev) => {
      const next = { ...prev };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });

  // ---- adding ----

  const addFiles = useCallback(
    async (files: File[]) => {
      const errors: string[] = [];
      let isFirst = boardRef.current.sources.length === 0;
      for (const file of files) {
        const problem = checkFile(file);
        if (problem) {
          errors.push(problem);
          continue;
        }
        const info = detectFileType(file.name, file.type)!;
        const doc: SourceDoc = {
          id: crypto.randomUUID(),
          name: baseName(file.name),
          kind: guessKind(file.name, info.category, isFirst),
          mimeType: info.mimeType,
          size: file.size,
          addedAt: Date.now(),
        };
        try {
          await putFile(projectId, doc.id, file);
          boardRef.current.addSource(doc);
          isFirst = false;
        } catch (err) {
          errors.push(`Couldn't store "${file.name}": ${(err as Error).message}`);
        }
      }
      setAddErrors(errors);
    },
    [projectId],
  );

  const addPasted = useCallback(
    async (name: string, kind: SourceKindId, text: string) => {
      const blob = new Blob([text], { type: PASTED_MIME_TYPE });
      const doc: SourceDoc = {
        id: crypto.randomUUID(),
        name: name.trim() || `Pasted notes, ${shortDate(Date.now())}`,
        kind,
        mimeType: PASTED_MIME_TYPE,
        size: blob.size,
        addedAt: Date.now(),
      };
      try {
        await putFile(projectId, doc.id, blob, text);
        boardRef.current.addSource(doc);
        setAddErrors([]);
        setView({ name: 'list' });
      } catch (err) {
        setAddErrors([`Couldn't store the pasted text: ${(err as Error).message}`]);
      }
    },
    [projectId],
  );

  // ---- reading with AI ----

  const readSource = useCallback(
    async (doc: SourceDoc) => {
      setRead(doc.id, { status: 'reading' });
      try {
        const record = await getFile(projectId, doc.id);
        if (!record) {
          throw new Error(
            "This document's file isn't stored in this browser (projects imported from JSON don't include files). Delete it and add the file again.",
          );
        }
        const category = categoryOf(doc.mimeType);
        let content: ExtractContent;
        if (category === 'text' || category === 'docx') {
          let text = record.text;
          if (text === undefined) {
            text = await extractText(record.blob, category);
            await saveExtractedText(projectId, doc.id, text).catch(() => undefined);
          }
          if (!text.trim()) throw new Error('No text was found in this document.');
          content = { text: text.slice(0, MAX_TEXT_CHARS), truncated: text.length > MAX_TEXT_CHARS };
        } else {
          content = { file: { mimeType: doc.mimeType, data: mode === 'gemini' ? await toBase64(record.blob) : '' } };
        }

        const current = boardRef.current;
        const result = await extractCards({
          mode,
          doc,
          content,
          brief: current.brief,
          boardText: describeBoard(current.nodes, current.edges, current.gapIds),
        });
        current.updateSource(doc.id, {
          readAt: Date.now(),
          summary: result.summary,
          model: result.model,
          proposals: result.proposals,
        });
        setRead(doc.id, null);
        if (result.proposals.length > 0) {
          setView((v) => (v.name === 'list' ? { name: 'review', docId: doc.id } : v));
        }
      } catch (err) {
        setRead(doc.id, { status: 'error', message: (err as Error).message });
      }
    },
    [projectId, mode],
  );

  // ---- deleting ----

  const handleDelete = (doc: SourceDoc) => {
    window.clearTimeout(deleteTimer.current);
    if (confirmingDeleteId !== doc.id) {
      setConfirmingDeleteId(doc.id);
      deleteTimer.current = window.setTimeout(() => setConfirmingDeleteId(null), DELETE_CONFIRM_MS);
      return;
    }
    setConfirmingDeleteId(null);
    board.removeSource(doc.id);
    setRead(doc.id, null);
    deleteFile(projectId, doc.id).catch(() => undefined);
  };

  // ---- review ----

  const finishReview = useCallback(
    (doc: SourceDoc) => {
      const proposals = doc.proposals ?? [];
      const accepted = proposals.filter((p) => p.decision === 'accepted');
      const ids = accepted.length > 0 ? board.addCardsFromProposals(doc, accepted) : [];
      board.updateSource(doc.id, {
        proposals: undefined,
        acceptedCount: (doc.acceptedCount ?? 0) + accepted.length,
        rejectedCount: (doc.rejectedCount ?? 0) + proposals.length - accepted.length,
      });
      setView({ name: 'list' });
      if (ids.length > 0) {
        onClose();
        // Wait for React Flow to measure the new cards before framing them.
        window.setTimeout(() => fitView({ nodes: ids.map((id) => ({ id })), padding: 0.3, maxZoom: 1, duration: 500 }), 150);
      }
    },
    [board, fitView, onClose],
  );

  if (!open) return null;

  const reviewDoc = view.name === 'review' ? board.sources.find((s) => s.id === view.docId) : undefined;
  const geminiProblem =
    mode === 'gemini' && status !== undefined && (status === null ? 'dev server unreachable' : !status.configured ? 'no API key set' : null);

  return createPortal(
    <div
      className="sources-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sources-modal" role="dialog" aria-modal="true" aria-labelledby="sources-title">
        <div className="sources-modal__header">
          {view.name !== 'list' ? (
            <button type="button" className="sources-back" onClick={() => setView({ name: 'list' })}>
              ← Sources
            </button>
          ) : (
            <span id="sources-title" className="sources-modal__heading">
              Sources
            </span>
          )}
          <div className="sources-modal__header-right">
            <div className="sources-mode" role="radiogroup" aria-label="AI mode">
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
              <span className={`sources-mode__status${geminiProblem ? ' is-error' : ''}`}>
                {mode === 'mock' ? 'no API call' : status === undefined ? 'checking…' : geminiProblem}
              </span>
            )}
            <button type="button" className="sources-modal__close" onClick={onClose} title="Close">
              ×
            </button>
          </div>
        </div>

        {view.name === 'list' && (
          <SourceList
            board={board}
            reads={reads}
            mode={mode}
            dragOver={dragOver}
            setDragOver={setDragOver}
            addErrors={addErrors}
            onDismissErrors={() => setAddErrors([])}
            onChooseFiles={() => fileInputRef.current?.click()}
            onDropFiles={addFiles}
            onPaste={() => setView({ name: 'paste' })}
            onRead={readSource}
            onReview={(doc) => setView({ name: 'review', docId: doc.id })}
            onDelete={handleDelete}
            confirmingDeleteId={confirmingDeleteId}
          />
        )}

        {view.name === 'paste' && (
          <PasteForm isFirst={board.sources.length === 0} onAdd={addPasted} onCancel={() => setView({ name: 'list' })} />
        )}

        {view.name === 'review' && reviewDoc && (
          <ReviewList
            doc={reviewDoc}
            onChange={(proposals) => board.updateSource(reviewDoc.id, { proposals })}
            onFinish={() => finishReview(reviewDoc)}
            onLater={() => setView({ name: 'list' })}
          />
        )}
        {view.name === 'review' && !reviewDoc && (
          <div className="sources-body">
            <p className="sources-empty">That document was removed.</p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) void addFiles(files);
          }}
        />
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------

interface SourceListProps {
  board: BoardState;
  reads: Record<string, ReadState>;
  mode: string;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  addErrors: string[];
  onDismissErrors: () => void;
  onChooseFiles: () => void;
  onDropFiles: (files: File[]) => void;
  onPaste: () => void;
  onRead: (doc: SourceDoc) => void;
  onReview: (doc: SourceDoc) => void;
  onDelete: (doc: SourceDoc) => void;
  confirmingDeleteId: string | null;
}

function SourceList({
  board,
  reads,
  mode,
  dragOver,
  setDragOver,
  addErrors,
  onDismissErrors,
  onChooseFiles,
  onDropFiles,
  onPaste,
  onRead,
  onReview,
  onDelete,
  confirmingDeleteId,
}: SourceListProps) {
  const sources = [...board.sources].sort((a, b) => a.addedAt - b.addedAt);

  return (
    <div className="sources-body">
      <p className="sources-intro">
        Add the documents behind your project: the brief, interview transcripts, field notes. Corkline reads each one
        and drafts cards with the passage they come from. Nothing goes on the board until you accept it.
      </p>

      <div
        className={`sources-drop${dragOver ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length) onDropFiles(files);
        }}
      >
        <span className="sources-drop__title">Drop files here</span>
        <div className="sources-drop__actions">
          <button type="button" className="sources-btn sources-btn--primary" onClick={onChooseFiles}>
            Choose files
          </button>
          <button type="button" className="sources-btn" onClick={onPaste}>
            Paste text
          </button>
        </div>
        <span className="sources-drop__hint">
          PDF, Word (.docx), text, Markdown, images, audio · up to {formatSize(MAX_FILE_BYTES)} each
        </span>
      </div>

      {addErrors.length > 0 && (
        <div className="sources-errors" role="alert">
          {addErrors.map((e) => (
            <p key={e}>{e}</p>
          ))}
          <button type="button" onClick={onDismissErrors}>
            Dismiss
          </button>
        </div>
      )}

      {sources.length === 0 ? (
        <p className="sources-empty">No documents yet. Starting a new project? Add its brief first.</p>
      ) : (
        <ol className="sources-list">
          {sources.map((doc) => {
            const category = categoryOf(doc.mimeType);
            const read = reads[doc.id];
            const pending = doc.proposals?.length ?? 0;
            return (
              <li key={doc.id} className="source-row">
                <span className={`source-row__icon source-row__icon--${category}`} aria-hidden>
                  {CATEGORY_ICON[category]}
                </span>
                <div className="source-row__main">
                  <input
                    className="source-row__name"
                    value={doc.name}
                    aria-label="Document name"
                    onChange={(e) => board.updateSource(doc.id, { name: e.target.value })}
                  />
                  <div className="source-row__meta">
                    <select
                      value={doc.kind}
                      aria-label="Document kind"
                      title={SOURCE_KINDS[doc.kind].hint}
                      onChange={(e) => board.updateSource(doc.id, { kind: e.target.value as SourceKindId })}
                    >
                      {SOURCE_KIND_ORDER.map((k) => (
                        <option key={k} value={k}>
                          {SOURCE_KINDS[k].label}
                        </option>
                      ))}
                    </select>
                    <span>
                      {CATEGORY_LABEL[category]} · {formatSize(doc.size)} · added {shortDate(doc.addedAt)}
                    </span>
                  </div>
                  {doc.summary && <p className="source-row__summary">{doc.summary}</p>}
                  {read?.status === 'error' && <p className="source-row__error">{read.message}</p>}
                  {doc.readAt && !pending && read?.status !== 'reading' && (
                    <p className="source-row__result">
                      {doc.acceptedCount ?? 0} added to board · {doc.rejectedCount ?? 0} rejected · read{' '}
                      {shortDate(doc.readAt)} by {doc.model}
                    </p>
                  )}
                </div>
                <div className="source-row__actions">
                  {read?.status === 'reading' ? (
                    <span className="source-row__reading">
                      <span className="sources-spinner" aria-hidden />
                      Reading…
                    </span>
                  ) : pending > 0 ? (
                    <button type="button" className="sources-btn sources-btn--primary" onClick={() => onReview(doc)}>
                      Review {pending} {pending === 1 ? 'card' : 'cards'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`sources-btn${doc.readAt ? '' : ' sources-btn--primary'}`}
                      onClick={() => onRead(doc)}
                      title={mode === 'mock' ? 'Mock mode: canned proposals, no API call' : 'Send to Gemini and draft cards'}
                    >
                      {read?.status === 'error' ? 'Retry' : doc.readAt ? 'Read again' : 'Read with AI'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`source-row__delete${confirmingDeleteId === doc.id ? ' is-confirming' : ''}`}
                    onClick={() => onDelete(doc)}
                    title="Remove this document (cards already on the board stay)"
                  >
                    {confirmingDeleteId === doc.id ? 'Click again' : 'Remove'}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {mode === 'gemini' && (
        <p className="sources-privacy">
          In Gemini mode, documents are sent to Google. On the free tier Google may use them to improve its products, so
          remove names and sensitive details from real participant material first.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PasteForm({
  isFirst,
  onAdd,
  onCancel,
}: {
  isFirst: boolean;
  onAdd: (name: string, kind: SourceKindId, text: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SourceKindId>(isFirst ? 'context' : 'other');
  const [text, setText] = useState('');

  return (
    <div className="sources-body">
      <label className="sources-field">
        <span>Name</span>
        <input type="text" value={name} placeholder="e.g. Interview P3 notes" onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="sources-field">
        <span>Kind</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as SourceKindId)}>
          {SOURCE_KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {SOURCE_KINDS[k].label}
            </option>
          ))}
        </select>
        <small>{SOURCE_KINDS[kind].hint}</small>
      </label>
      <label className="sources-field sources-field--grow">
        <span>Text</span>
        <textarea value={text} placeholder="Paste notes, a transcript, or the project brief…" onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="sources-footer">
        <button type="button" className="sources-btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="sources-btn sources-btn--primary"
          disabled={!text.trim()}
          onClick={() => onAdd(name, kind, text)}
        >
          Add document
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReviewList({
  doc,
  onChange,
  onFinish,
  onLater,
}: {
  doc: SourceDoc;
  onChange: (proposals: CardProposal[]) => void;
  onFinish: () => void;
  onLater: () => void;
}) {
  const proposals = doc.proposals ?? [];
  const accepted = proposals.filter((p) => p.decision === 'accepted').length;
  const undecided = proposals.filter((p) => p.decision === 'pending').length;

  const patch = (id: string, change: Partial<CardProposal>) =>
    onChange(proposals.map((p) => (p.id === id ? { ...p, ...change } : p)));
  const setAll = (decision: CardProposal['decision']) => onChange(proposals.map((p) => ({ ...p, decision })));

  return (
    <>
      <div className="sources-body sources-body--review">
        <div className="review-head">
          <h3>{doc.name}</h3>
          {doc.summary && <p>{doc.summary}</p>}
          <span className="review-head__meta">
            {proposals.length} proposed {proposals.length === 1 ? 'card' : 'cards'} · {SOURCE_KINDS[doc.kind].label} · by{' '}
            {doc.model}
          </span>
        </div>
        <div className="review-bulk">
          <button type="button" className="sources-btn" onClick={() => setAll('accepted')}>
            Accept all
          </button>
          <button type="button" className="sources-btn" onClick={() => setAll('rejected')}>
            Reject all
          </button>
          <span>Edit anything before accepting. Check quotes marked ⚠ against the document.</span>
        </div>
        <ul className="review-list">
          {proposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} onPatch={(change) => patch(p.id, change)} />
          ))}
        </ul>
      </div>
      <div className="sources-footer sources-footer--review">
        <span className="sources-footer__note">
          {undecided === 1
            ? '1 card not decided yet; it will be discarded.'
            : undecided > 1
              ? `${undecided} cards not decided yet; they will be discarded.`
              : ' '}
        </span>
        <button type="button" className="sources-btn" onClick={onLater}>
          Finish later
        </button>
        <button type="button" className="sources-btn sources-btn--primary" onClick={onFinish}>
          {accepted > 0 ? `Add ${accepted} ${accepted === 1 ? 'card' : 'cards'} to board` : 'Done, add nothing'}
        </button>
      </div>
    </>
  );
}

function ProposalRow({ proposal: p, onPatch }: { proposal: CardProposal; onPatch: (change: Partial<CardProposal>) => void }) {
  const cfg = NODE_TYPES[p.nodeType];
  return (
    <li
      className={`proposal is-${p.decision}`}
      style={{ ['--type-color' as string]: cfg.color } as React.CSSProperties}
    >
      <div className="proposal__top">
        <label className="proposal__type-field">
          <span>Type</span>
          <select
            className="proposal__type"
            value={p.nodeType}
            title="Change the card type before accepting"
            onChange={(e) => onPatch({ nodeType: e.target.value as NodeTypeId })}
          >
            {NODE_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {NODE_TYPES[t].label}
              </option>
            ))}
          </select>
        </label>
        {p.suggestedType && p.suggestedType !== p.nodeType ? (
          <span className="proposal__changed">
            AI suggested {NODE_TYPES[p.suggestedType].label}
            <button type="button" onClick={() => onPatch({ nodeType: p.suggestedType })} title="Go back to the AI's type">
              undo
            </button>
          </span>
        ) : (
          <span className={`proposal__confidence proposal__confidence--${p.confidence}`}>{p.confidence} confidence</span>
        )}
        <div className="proposal__decide">
          <button
            type="button"
            className={p.decision === 'rejected' ? 'is-on is-reject' : ''}
            aria-pressed={p.decision === 'rejected'}
            onClick={() => onPatch({ decision: p.decision === 'rejected' ? 'pending' : 'rejected' })}
          >
            ✕ Reject
          </button>
          <button
            type="button"
            className={p.decision === 'accepted' ? 'is-on is-accept' : ''}
            aria-pressed={p.decision === 'accepted'}
            onClick={() => onPatch({ decision: p.decision === 'accepted' ? 'pending' : 'accepted' })}
          >
            ✓ Accept
          </button>
        </div>
      </div>
      <input
        className="proposal__title"
        value={p.title}
        aria-label="Card title"
        onChange={(e) => onPatch({ title: e.target.value })}
      />
      <textarea
        className="proposal__body"
        value={p.body}
        rows={2}
        aria-label="Card text"
        placeholder={cfg.placeholder}
        onChange={(e) => onPatch({ body: e.target.value })}
      />
      <blockquote className="proposal__quote">
        <span>“{p.quote}”</span>
        <span
          className={`proposal__check proposal__check--${p.quoteFound === null ? 'na' : p.quoteFound ? 'ok' : 'warn'}`}
        >
          {p.quoteFound === null
            ? 'not checked automatically (PDF, image or audio)'
            : p.quoteFound
              ? '✓ found in the document'
              : '⚠ not found word for word in the document; check it'}
        </span>
      </blockquote>
      {p.reason && (
        <p className="proposal__reason">
          Why {NODE_TYPES[p.suggestedType ?? p.nodeType].label}: {p.reason}
        </p>
      )}
    </li>
  );
}
