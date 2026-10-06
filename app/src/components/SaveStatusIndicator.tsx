import type { SaveStatus } from '../types';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  error: string | null;
}

const LABEL: Record<SaveStatus, string> = {
  idle: 'saved',
  saved: 'saved',
  saving: 'saving…',
  error: '⚠ not saving',
};

export function SaveStatusIndicator({ status, error }: SaveStatusIndicatorProps) {
  return (
    <div className={`save-status is-${status}`} title={status === 'error' ? (error ?? undefined) : undefined}>
      {LABEL[status]}
    </div>
  );
}
