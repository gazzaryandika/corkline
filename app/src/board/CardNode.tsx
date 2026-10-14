import { memo, useCallback, useRef, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NODE_TYPES } from '../config';
import { useBoardContext } from './BoardContext';
import { readAndResizeImage } from '../lib/image';
import { CardTypeSelect } from './CardTypeSelect';
import { issueText } from '../lib/trace';
import type { CardNode as CardNodeType } from '../state/useBoardState';
import './CardNode.css';

const DELETE_CONFIRM_MS = 2200;

function autosize(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function CardNodeComponent({ id, data, dragging, selected }: NodeProps<CardNodeType>) {
  const { traceIssues, prototypeTitles, updateCard, deleteNode, armedNodeId, onConnectorPointerDown, onExpandCard, focusNodeIds } =
    useBoardContext();
  const cfg = NODE_TYPES[data.nodeType];
  const issues = traceIssues.get(id);
  const isGap = !!issues;
  const isArmedSource = armedNodeId === id;
  const isFocused = focusNodeIds !== null && focusNodeIds.has(id);
  const isDimmed = focusNodeIds !== null && !isFocused;

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
        updateCard(id, { image: dataUrl });
      } catch {
        setImageError('Could not load that image.');
        window.setTimeout(() => setImageError(null), 2400);
      }
    },
    [id, updateCard],
  );

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirmingDelete) {
        setConfirmingDelete(true);
        deleteTimer.current = window.setTimeout(() => setConfirmingDelete(false), DELETE_CONFIRM_MS);
      } else {
        if (deleteTimer.current !== undefined) window.clearTimeout(deleteTimer.current);
        deleteNode(id);
      }
    },
    [confirmingDelete, deleteNode, id],
  );

  const classes = [
    'card-node',
    isGap && 'is-gap',
    isArmedSource && 'is-armed',
    dragging && 'is-dragging',
    selected && 'is-selected',
    isFocused && !selected && 'is-focus-highlight',
    isDimmed && 'is-focus-dim',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={{ ['--type-color' as string]: cfg.color } as React.CSSProperties}>
      {/* Not used for interaction (that's the custom connector button below) — React Flow refuses to
          render ANY edge touching a node that has zero registered handles, so these exist purely to
          satisfy that internal bookkeeping. */}
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ visibility: 'hidden' }} />
      <div className="card-node__bar">
        <span className="card-node__badge-wrap">
          <span className="card-node__badge">
            {cfg.short}
            <span className="card-node__badge-caret" aria-hidden>
              ▾
            </span>
          </span>
          <CardTypeSelect value={data.nodeType} onChange={(nodeType) => updateCard(id, { nodeType })} />
        </span>
        <div className="card-node__bar-actions">
          <button
            type="button"
            className="card-node__image-btn nodrag"
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            title={data.image ? 'Replace image' : 'Add image'}
          >
            🖼
          </button>
          <button
            type="button"
            className="card-node__expand nodrag"
            onClick={(e) => {
              e.stopPropagation();
              onExpandCard(id);
            }}
            title="Open full card"
          >
            ⤢
          </button>
          <button
            type="button"
            className={`card-node__delete nodrag${confirmingDelete ? ' is-confirming' : ''}`}
            onClick={handleDeleteClick}
            title={confirmingDelete ? 'Click again to confirm' : 'Delete card'}
          >
            {confirmingDelete ? '?' : '×'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="card-node__file-input"
          onChange={handleImageChange}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      {data.image && (
        <div className="card-node__thumb nodrag">
          <img src={data.image} alt="" />
          <button
            type="button"
            className="card-node__thumb-remove nodrag"
            onClick={(e) => {
              e.stopPropagation();
              updateCard(id, { image: undefined });
            }}
            title="Remove image"
          >
            ×
          </button>
        </div>
      )}
      {imageError && <div className="card-node__image-error">{imageError}</div>}
      <div className="card-node__body">
        <input
          className="card-node__title nodrag"
          placeholder={`${cfg.label} — title`}
          value={data.title}
          onChange={(e) => updateCard(id, { title: e.target.value })}
        />
        <textarea
          className="card-node__text nodrag"
          placeholder={cfg.placeholder}
          value={data.body}
          rows={1}
          ref={autosize}
          onChange={(e) => {
            updateCard(id, { body: e.target.value });
            autosize(e.target);
          }}
        />
        {issues && (
          <div className="card-node__gap-tag" title="A step is missing in this card's trace. See the gaps count in the toolbar for all of them.">
            ⚠ {issues.map((i) => issueText(i, data.nodeType)).join(' · ')}
          </div>
        )}
        {data.fromPrototypeId && prototypeTitles.has(data.fromPrototypeId) && (
          <div className="card-node__source" title="A result of testing this prototype">
            ↺ from Prototype “{prototypeTitles.get(data.fromPrototypeId)}”
          </div>
        )}
        {data.source && (
          <div className="card-node__source" title={`From "${data.source.docName}":\n“${data.source.quote}”`}>
            ▤ {data.source.docName}
          </div>
        )}
      </div>
      <button
        type="button"
        className="card-node__connector nodrag"
        title="Drag, or click then click another card, to connect"
        onPointerDown={(e) => onConnectorPointerDown(id, e)}
      />
    </div>
  );
}

export const CardNode = memo(CardNodeComponent);
