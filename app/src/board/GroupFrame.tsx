import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useBoardContext } from './BoardContext';
import type { GroupNode } from '../state/useBoardState';
import './GroupFrame.css';

function GroupFrameComponent({ id, data, width, height, selected }: NodeProps<GroupNode>) {
  const { updateGroupLabel, ungroupNode, focusNodeIds } = useBoardContext();
  const isFocused = focusNodeIds !== null && focusNodeIds.has(id);
  const isDimmed = focusNodeIds !== null && !isFocused;

  const classes = [
    'group-frame',
    selected && 'is-selected',
    isFocused && !selected && 'is-focus-highlight',
    isDimmed && 'is-focus-dim',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={{ width, height }}>
      <div className="group-frame__header">
        <input
          className="group-frame__label nodrag"
          placeholder="Group"
          value={data.label}
          onChange={(e) => updateGroupLabel(id, e.target.value)}
        />
        <button
          type="button"
          className="group-frame__remove nodrag"
          onClick={() => ungroupNode(id)}
          title="Remove this frame (keeps the cards)"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export const GroupFrame = memo(GroupFrameComponent);
