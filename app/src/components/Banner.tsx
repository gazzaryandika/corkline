import type { ReactNode } from 'react';
import './Banner.css';

interface BannerProps {
  tone: 'error' | 'info';
  children: ReactNode;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
}

export function Banner({ tone, children, onDismiss, action }: BannerProps) {
  return (
    <div className={`banner banner--${tone}`} role="status">
      <span className="banner__text">{children}</span>
      {action && (
        <button type="button" className="banner__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {onDismiss && (
        <button type="button" className="banner__dismiss" onClick={onDismiss} title="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
