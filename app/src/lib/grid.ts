import { CARD_WIDTH, NODE_TYPE_ORDER } from '../config';
import type { NodeTypeId } from '../types';

/**
 * The board's invisible grid: one lane per card type, in NODE_TYPE_ORDER (Problem on
 * the left … Prototype on the right). Each lane has two card columns: cards fill the
 * first column top to bottom up to CARDS_PER_COLUMN, then the second; after that a
 * new two-column block starts below. Nothing lands on top of anything else. Cards can
 * still be dragged anywhere afterwards; the grid only decides where things first
 * appear (and where "Tidy board" puts them).
 */

/** How many cards stack in one column before the next column of the lane is used. */
export const CARDS_PER_COLUMN = 10;
/** Padding of a group frame around its cards (same as useBoardState's GROUP_PADDING). */
export const GRID_FRAME_INSET = 44;
/** A theme frame's width: a card plus the frame's padding on both sides. */
const FRAME_WIDTH = CARD_WIDTH + GRID_FRAME_INSET * 2;
/** Breathing space between a lane's divider and its frames, and between its two columns' frames. */
const LANE_GUTTER = 80;
/** Distance between a lane's two columns: a full frame plus a gutter, so two frames sit side by side with room. */
export const SUB_COLUMN_STEP = FRAME_WIDTH + LANE_GUTTER;
/** From a lane's left edge to its first card (the gutter, then the frame's padding). */
export const LANE_PADDING = LANE_GUTTER + GRID_FRAME_INSET;
/** One lane: gutter, frame, gutter, frame, gutter (rounded up). 900 px. */
export const LANE_WIDTH = Math.ceil((LANE_GUTTER * 3 + FRAME_WIDTH * 2) / 100) * 100;
/** Vertical space between things stacked in a column. */
export const GRID_ROW_GAP = 28;
/** Summary notes get their own column left of the Problem lane when the board is tidied. */
export const GRID_NOTES_X = -380;

/** Something already on the board, in board coordinates. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** How many cards it counts as in its lane: 1 for a card, its cards for a frame, 0 for a note. */
  weight: number;
}

export function laneX(type: NodeTypeId): number {
  return NODE_TYPE_ORDER.indexOf(type) * LANE_WIDTH;
}

/** Left edge of a card in column `column` (0 or 1) of a type's lane. */
export function subColumnX(type: NodeTypeId, column: number): number {
  return laneX(type) + LANE_PADDING + column * SUB_COLUMN_STEP;
}

/** Where lanes start: the top of the board, or 0 on an empty board. */
export function gridTop(boxes: Box[]): number {
  return boxes.length > 0 ? Math.min(...boxes.map((b) => b.y)) : 0;
}

/** The first free height in the strip [x, x + w]: below every box overlapping it, or `top`. */
export function nextFreeY(boxes: Box[], x: number, w: number, top: number): number {
  let y = top;
  for (const b of boxes) {
    if (b.x < x + w && x < b.x + b.w) y = Math.max(y, b.y + b.h + GRID_ROW_GAP);
  }
  return y;
}

/**
 * Where something of `weight` cards and width `w` goes in a type's lane. `inset` is
 * how far its left edge sits left of the cards (a frame's padding), so cards in
 * frames line up with loose cards.
 */
function slotInLane(boxes: Box[], type: NodeTypeId, w: number, top: number, inset: number): { x: number; y: number } {
  const left = laneX(type);
  const inLane = boxes.filter((b) => {
    const centre = b.x + b.w / 2;
    return centre >= left && centre < left + LANE_WIDTH;
  });
  const total = inLane.reduce((n, b) => n + b.weight, 0);
  const inBlock = total % (CARDS_PER_COLUMN * 2);
  const column = inBlock < CARDS_PER_COLUMN ? 0 : 1;
  const x = subColumnX(type, column) - inset;
  // A full block (both columns) starts a new one below everything in the lane.
  const y = total > 0 && inBlock === 0 ? nextFreeY(boxes, left, LANE_WIDTH, top) : nextFreeY(boxes, x, w, top);
  return { x, y };
}

/** Where a new card of this type goes. */
export function cardSlot(boxes: Box[], type: NodeTypeId, top = gridTop(boxes)): { x: number; y: number } {
  return slotInLane(boxes, type, CARD_WIDTH, top, 0);
}

/** Where a group frame of `width` (for cards of this type) goes. */
export function frameSlot(boxes: Box[], type: NodeTypeId, width: number, top = gridTop(boxes)): { x: number; y: number } {
  return slotInLane(boxes, type, width, top, GRID_FRAME_INSET);
}

/**
 * A card's height before it has been drawn (React Flow only measures it after).
 * Erring on the tall side, since too much space looks fine and too little overlaps.
 */
export function estimateCardHeight(title: string, body: string, hasSource = false): number {
  const titleLines = Math.max(1, Math.ceil(title.length / 30));
  const bodyLines = body.trim() ? body.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 36)), 0) : 1;
  return 58 + titleLines * 18 + bodyLines * 17 + (hasSource ? 20 : 0);
}
