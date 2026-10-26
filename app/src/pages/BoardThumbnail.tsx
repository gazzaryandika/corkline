import { memo } from 'react';
import { CARD_WIDTH, NODE_TYPES } from '../config';
import type { BoardPreview } from '../lib/storage';

/** Rough sizes for drawing, in board coordinates (real cards vary in height). */
const CARD_H = 130;
const NOTE_W = 300;
const NOTE_H = 170;
const PAD = 120;
const ASPECT = 16 / 10;

interface BoardThumbnailProps {
  preview: BoardPreview;
  /** Shown when the board has nothing on it. */
  emptyLabel?: string;
}

/** A miniature of a board: cards in their type colours, frames, notes and links. */
function BoardThumbnailComponent({ preview, emptyLabel = 'Empty board' }: BoardThumbnailProps) {
  const { cards, frames, notes, links } = preview;
  if (cards.length === 0 && notes.length === 0) {
    return (
      <div className="thumb thumb--empty">
        <span>{emptyLabel}</span>
      </div>
    );
  }

  // Wide, sparse boards would shrink cards to specks, so cards are drawn at least
  // 1/11 of the view's width, centred where the real card is.
  const centres = cards.map((c) => ({ x: c.x + CARD_WIDTH / 2, y: c.y + CARD_H / 2, type: c.type }));
  const fit = (cw: number, ch: number) => {
    const left = [...centres.map((c) => c.x - cw / 2), ...frames.map((f) => f.x), ...notes.map((n) => n.x)];
    const top = [...centres.map((c) => c.y - ch / 2), ...frames.map((f) => f.y), ...notes.map((n) => n.y)];
    const right = [...centres.map((c) => c.x + cw / 2), ...frames.map((f) => f.x + f.w), ...notes.map((n) => n.x + NOTE_W)];
    const bottom = [...centres.map((c) => c.y + ch / 2), ...frames.map((f) => f.y + f.h), ...notes.map((n) => n.y + NOTE_H)];
    const minX = Math.min(...left) - PAD;
    const minY = Math.min(...top) - PAD;
    const maxX = Math.max(...right) + PAD;
    const maxY = Math.max(...bottom) + PAD;
    let w = maxX - minX;
    let h = maxY - minY;
    // Keep a landscape frame so tall or tiny boards don't look stretched or zoomed in.
    if (w / h < ASPECT) w = h * ASPECT;
    else h = w / ASPECT;
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w, h };
  };
  const first = fit(CARD_WIDTH, CARD_H);
  const cw = Math.max(CARD_WIDTH, first.w / 11);
  const ch = (cw * CARD_H) / CARD_WIDTH;
  const { cx, cy, w, h } = cw > CARD_WIDTH ? fit(cw, ch) : first;
  const k = cw / CARD_WIDTH;
  const viewBox = `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;
  const stroke = Math.max(w / 260, 2);

  return (
    <svg className="thumb" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {frames.map((f, i) => (
        <rect key={`f${i}`} className="thumb__frame" x={f.x} y={f.y} width={f.w} height={f.h} rx={24} strokeWidth={stroke} />
      ))}
      {links.map((l, i) => {
        const a = centres[l.from];
        const b = centres[l.to];
        return (
          <line
            key={`l${i}`}
            className="thumb__link"
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={stroke}
          />
        );
      })}
      {notes.map((n, i) => (
        <rect key={`n${i}`} className="thumb__note" x={n.x} y={n.y} width={NOTE_W} height={NOTE_H} rx={18} />
      ))}
      {centres.map((c, i) => {
        const color = NODE_TYPES[c.type].color;
        const x = c.x - cw / 2;
        const y = c.y - ch / 2;
        return (
          <g key={`c${i}`}>
            <rect className="thumb__card" x={x} y={y} width={cw} height={ch} rx={16 * k} strokeWidth={stroke} />
            <rect x={x} y={y} width={cw} height={22 * k} rx={10 * k} fill={color} />
            <rect x={x + 22 * k} y={y + 50 * k} width={cw * 0.7} height={14 * k} rx={7 * k} fill={color} opacity={0.22} />
            <rect x={x + 22 * k} y={y + 80 * k} width={cw * 0.45} height={14 * k} rx={7 * k} fill={color} opacity={0.14} />
          </g>
        );
      })}
    </svg>
  );
}

export const BoardThumbnail = memo(BoardThumbnailComponent);
