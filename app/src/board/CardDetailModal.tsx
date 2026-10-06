import { useCallback, useEffect, useRef, useState } from 'react';
import { NODE_TYPES } from '../config';
import { useBoardContext } from './BoardContext';
import { readAndResizeImage } from '../lib/image';
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
  const { gapIds, updateCard, deleteNode } = useBoardContext();
  const cfg = NODE_TYPES[node.data.nodeType];
  const isGap = gapIds.has(node.id);
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
          <span className="card-modal__badge">{cfg.short}</span>
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

          {isGap && <div className="card-modal__gap-tag">⚠ no evidence trail yet</div>}

          <textarea
            className="card-modal__text"
            placeholder={cfg.placeholder}
            value={node.data.body}
            onChange={(e) => updateCard(node.id, { body: e.target.value })}
          />

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
