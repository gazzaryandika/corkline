import { NODE_TYPE_ORDER, NODE_TYPES } from '../config';
import type { NodeTypeId } from '../types';

interface CardTypeSelectProps {
  value: NodeTypeId;
  onChange: (nodeType: NodeTypeId) => void;
}

/**
 * An invisible native dropdown laid over a card's type badge: clicking the badge
 * opens the list of card types. Native, so it works with keyboard and touch too.
 * Place it inside a `position: relative` wrapper around the badge.
 */
export function CardTypeSelect({ value, onChange }: CardTypeSelectProps) {
  return (
    <select
      className="card-type-select nodrag"
      value={value}
      aria-label={`Card type: ${NODE_TYPES[value].label}. Change type`}
      title="Change card type"
      onChange={(e) => onChange(e.target.value as NodeTypeId)}
      onClick={(e) => e.stopPropagation()}
    >
      {NODE_TYPE_ORDER.map((t) => (
        <option key={t} value={t}>
          {NODE_TYPES[t].label}
        </option>
      ))}
    </select>
  );
}
