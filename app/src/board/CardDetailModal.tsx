import { useCallback, useEffect, useRef, useState } from 'react';
import { NODE_TYPES } from '../config';
import { useBoardContext } from './BoardContext';
import { readAndResizeImage } from '../lib/image';
import { CardTypeSelect } from './CardTypeSelect';
import { issueText } from '../lib/trace';
import type { CardNode } from '../state/useBoardState';
import './CardDetailModal.css';

interface CardDetailModalProps {
  node: CardNode;
  onClose: () => void;
}

const DELETE_CONFIRM_MS = 2200;

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function CardDetailModal({ node, onClose }: CardDetailModalProps) {
  const { traceIssues, prototypeTitles, addEvidenceFromPrototype, onExpandCard, updateCard, deleteNode } = useBoardContext();
  const cfg = NODE_TYPES[node.data.nodeType];
  const issues = traceIssues.get(node.id);
  const dialogRef = useRef<HTMLDivElement>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteTimer = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const handleImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const dataUrl = await readAndResizeImage(file);
        setImageError(null);
        updateCard(node.id, { image: dataUrl });
      } catch {
        setImageError('Could not load that image.');
        window.setTimeout(() => setImageError(null), 2400);
      }
    },
    [node.id, updateCard],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => () => {
    if (deleteTimer.current !== undefined) window.clearTimeout(deleteTimer.current);
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleDeleteClick = useCallback(() => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      deleteTimer.current = window.setTimeout(() => setConfirmingDelete(false), DELETE_CONFIRM_MS);
    } else {
      if (deleteTimer.current !== undefined) window.clearTimeout(deleteTimer.current);
      deleteNode(node.id);
      onClose();
    }
  }, [confirmingDelete, deleteNode, node.id, onClose]);

  const openUrl = normalizeUrl(node.data.link ?? '');

  return (
    <div className="card-modal-backdrop" onMouseDown={handleBackdropClick}>
      <div
        className="card-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        style={{ ['--type-color' as string]: cfg.color } as React.CSSProperties}
      >
        <div className="card-modal__header">
          <span className="card-modal__badge-wrap">
            <span className="card-modal__badge">{cfg.label} ▾</span>
            <CardTypeSelect value={node.data.nodeType} onChange={(nodeType) => updateCard(node.id, { nodeType })} />
          </span>
          <button type="button" className="card-modal__close" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="card-modal__body">
          <input
            className="card-modal__title"
            placeholder={`${cfg.label} — title`}
            value={node.data.title}
            onChange={(e) => updateCard(node.id, { title: e.target.value })}
            autoFocus
          />

          {issues && (
            <div className="card-modal__gap-tag">⚠ {issues.map((i) => issueText(i, node.data.nodeType)).join(' · ')}</div>
          )}

          <textarea
            className="card-modal__text"
            placeholder={cfg.placeholder}
            value={node.data.body}
            onChange={(e) => updateCard(node.id, { body: e.target.value })}
          />

          {node.data.source && (
            <>
              <span className="card-modal__field-label">Source</span>
              <div className="card-modal__source">
                <span className="card-modal__source-name">▤ {node.data.source.docName}</span>
                <blockquote>“{node.data.source.quote}”</blockquote>
                {node.data.source.aiType && node.data.source.aiType !== node.data.nodeType && (
                  <span className="card-modal__source-ai-type">
                    AI suggested: {NODE_TYPES[node.data.source.aiType].label} · changed by the designer
                  </span>
                )}
              </div>
            </>
          )}

          {node.data.nodeType === 'evidence' && node.data.fromPrototypeId && (
            <>
              <span className="card-modal__field-label">Iteration</span>
              <div className="card-modal__iteration">
                <span>
                  ↺ Result of testing Prototype “
                  {prototypeTitles.get(node.data.fromPrototypeId) ?? 'a prototype that has been deleted'}”
                </span>
                <button type="button" onClick={() => updateCard(node.id, { fromPrototypeId: undefined })} title="Not a prototype result">
                  ×
                </button>
              </div>
            </>
          )}

          {node.data.nodeType === 'prototype' && (
            <>
              <span className="card-modal__field-label">Iteration</span>
              <p className="card-modal__hint">
                Tested this prototype? Its results come back as new Evidence, which then feeds new insights, so the next
                version stays traceable.
              </p>
              <button
                type="button"
                className="card-modal__image-add"
                onClick={() => onExpandCard(addEvidenceFromPrototype(node.id).id)}
              >
                + Add result as Evidence
              </button>
            </>
          )}

          <span className="card-modal__field-label">Image</span>
          {node.data.image ? (
            <div className="card-modal__image">
              <img src={node.data.image} alt="" />
              <div className="card-modal__image-actions">
                <button type="button" onClick={() => fileInputRef.current?.click()}>
                  Replace
                </button>
                <button type="button" onClick={() => updateCard(node.id, { image: undefined })}>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="card-modal__image-add"
              onClick={() => fileInputRef.current?.click()}
            >
              + Add image
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="card-modal__file-input"
            onChange={handleImageChange}
          />
          {imageError && <div className="card-modal__image-error">{imageError}</div>}

          <label className="card-modal__field-label" htmlFor="card-modal-link">
            Link
          </label>
          <div className="card-modal__link-row">
            <input
              id="card-modal-link"
              className="card-modal__link-input"
              type="text"
              placeholder="Paste a link to a source, recording, or document…"
              value={node.data.link ?? ''}
              onChange={(e) => updateCard(node.id, { link: e.target.value })}
            />
            <a
              className={`card-modal__link-open${openUrl ? '' : ' is-disabled'}`}
              href={openUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!openUrl}
              onClick={(e) => {
                if (!openUrl) e.preventDefault();
              }}
              title={openUrl ? 'Open link in a new tab' : 'No link set yet'}
            >
              Open ↗
            </a>
          </div>
        </div>

        <div className="card-modal__footer">
          <button
            type="button"
            className={`card-modal__delete${confirmingDelete ? ' is-confirming' : ''}`}
            onClick={handleDeleteClick}
          >
            {confirmingDelete ? 'Click again to delete' : 'Delete card'}
          </button>
          <button type="button" className="card-modal__done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
