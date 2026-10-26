import { useLayoutEffect, type RefObject } from 'react';

/**
 * Grows a textarea's height to fit `value`, so text wraps downward instead of being
 * clipped or scrolling. Re-measures whenever `value` changes, not just when the user
 * types — a value set programmatically (an AI-drafted card body, a generated summary,
 * right when the note is created) sizes correctly too, not just the stale height from
 * whatever was on screen at mount.
 */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}
