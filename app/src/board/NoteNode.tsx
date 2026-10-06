import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
import { useBoardContext } from './BoardContext';
import type { NoteNode as NoteNodeType } from '../state/useBoardState';
import './NoteNode.css';

const DELETE_CONFIRM_MS = 2200;

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** A yellow summary note. Clicking it highlights the cards it summarises (handled by
 * the canvas's onNodeClick); it can be renamed and deleted, but not linked. */
function NoteNodeComponent({ id, data, selected, dragging }: NodeProps<NoteNodeType>) {
  const { deleteNode, updateNoteTitle, highlightedNoteId, focusNodeIds } = useBoardContext();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteTimer = useRef<number | undefined>(undefined);
  // How many of its cards are still on the board.
  const remaining = useStore((s) => data.sourceCardIds.filter((cardId) => s.nodeLookup.has(cardId)).length);

  useEffect(() => () => window.clearTimeout(deleteTimer.current), []);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirmingDelete) {
        setConfirmingDelete(true);
        deleteTimer.current = window.setTimeout(() => setConfirmingDelete(false), DELETE_CONFIRM_MS);
      } else {
        window.clearTimeout(deleteTimer.current);
        deleteNode(id);
      }
    },
    [confirmingDelete, deleteNode, id],
  );

  const total = data.sourceCardIds.length;
  const covers =
    data.scope === 'board'
      ? `the whole board (${total} ${total === 1 ? 'card' : 'cards'})`
      : `${total} selected ${total === 1 ? 'card' : 'cards'}`;
  const isActive = highlightedNoteId === id;
  const isDimmed = focusNodeIds !== null && !focusNodeIds.has(id);

  return (
    <div
      className={['note-node', isActive && 'is-active', selected && 'is-selected', dragging && 'is-dragging', isDimmed && 'is-focus-dim']
        .filter(Boolean)
        .join(' ')}
      title={isActive ? 'Click again (or on empty canvas) to stop highlighting' : 'Click to highlight the cards this summarises'}
    >
      {/* React Flow needs handles on every node it might draw an edge to; notes can't be linked. */}
      <Handle type="target" position={Position.Left} isConnectable={false} style={{ visibility: 'hidden' }} />
      <Handle type="source" position={Position.Right} isConnectable={false} style={{ visibility: 'hidden' }} />
      <div className="note-node__head">
        <span className="note-node__kind">✦ Summary</span>
        <button
          type="button"
          className={`note-node__delete nodrag${confirmingDelete ? ' is-confirming' : ''}`}
          onClick={handleDelete}
          title={confirmingDelete ? 'Click again to delete this note' : 'Delete note'}
        >
          {confirmingDelete ? 'Delete?' : '×'}
        </button>
      </div>
      <input
        className="note-node__title nodrag"
        value={data.title}
        aria-label="Summary title"
        onChange={(e) => updateNoteTitle(id, e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="note-node__meta">
        {formatWhen(data.createdAt)} · {covers}
        {remaining < total && ` (${total - remaining} since removed)`}
      </div>
      <p className="note-node__body">{data.body}</p>
      <div className="note-node__foot">
        <span>{isActive ? 'Showing its cards' : 'Click to show its cards'}</span>
        <span>{data.model}</span>
      </div>
    </div>
  );
}

export const NoteNode = memo(NoteNodeComponent);
