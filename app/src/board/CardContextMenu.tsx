import { useEffect, useRef } from 'react';

interface CardContextMenuProps {
  clientX: number;
  clientY: number;
  isHighlighted: boolean;
  onSeeConnections: () => void;
  onClearHighlight: () => void;
  onClose: () => void;
}

const MENU_WIDTH = 190;
const ROW_HEIGHT = 32;

export function CardContextMenu({
  clientX,
  clientY,
  isHighlighted,
  onSeeConnections,
  onClearHighlight,
  onClose,
}: CardContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // Deferred so the same pointerdown/contextmenu that opened this menu doesn't also close it.
    const id = window.setTimeout(() => {
      window.addEventListener('pointerdown', handlePointerDown);
    }, 0);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const menuHeight = (isHighlighted ? 2 : 1) * ROW_HEIGHT + 14;
  const left = Math.min(clientX + 8, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(clientY + 8, window.innerHeight - menuHeight - 8);

  return (
    <div ref={ref} className="edge-kind-menu" style={{ left, top, width: MENU_WIDTH }}>
      <button type="button" onClick={onSeeConnections}>
        See connected cards
      </button>
      {isHighlighted && (
        <button type="button" onClick={onClearHighlight}>
          Clear highlight
        </button>
      )}
    </div>
  );
}
