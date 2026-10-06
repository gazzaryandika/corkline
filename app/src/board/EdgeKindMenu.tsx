import { useEffect, useRef } from 'react';
import { EDGE_KIND_ORDER, EDGE_KINDS } from '../config';
import type { EdgeKindId } from '../types';

interface EdgeKindMenuProps {
  clientX: number;
  clientY: number;
  onPick: (kind: EdgeKindId) => void;
  onClose: () => void;
}

const MENU_WIDTH = 168;
const ROW_HEIGHT = 32;

export function EdgeKindMenu({ clientX, clientY, onPick, onClose }: EdgeKindMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // Deferred so the same pointerdown that opened this menu doesn't also close it.
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

  const menuHeight = EDGE_KIND_ORDER.length * ROW_HEIGHT + 14;
  const left = Math.min(clientX + 8, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(clientY + 8, window.innerHeight - menuHeight - 8);

  return (
    <div ref={ref} className="edge-kind-menu" style={{ left, top }}>
      {EDGE_KIND_ORDER.map((key) => {
        const cfg = EDGE_KINDS[key];
        return (
          <button key={key} type="button" onClick={() => onPick(key)}>
            <span className="edge-kind-menu__swatch" style={{ background: cfg.color }} />
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}
