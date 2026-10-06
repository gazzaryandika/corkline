import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProjectBrief } from '../types';
import './ProjectBriefModal.css';

interface ProjectBriefModalProps {
  brief: ProjectBrief;
  onChange: (patch: Partial<ProjectBrief>) => void;
  onClose: () => void;
}

type Tab = 'overview' | 'context';

interface Field {
  key: keyof ProjectBrief;
  label: string;
  placeholder: string;
  multiline?: boolean;
}

const OVERVIEW_FIELDS: Field[] = [
  { key: 'name', label: 'Project name', placeholder: 'e.g. Kids & sustainable money' },
  {
    key: 'description',
    label: 'Description',
    placeholder: 'What is this project about, and what are you trying to find out or design?',
    multiline: true,
  },
];

const CONTEXT_FIELDS: Field[] = [
  { key: 'users', label: 'Intended users', placeholder: 'Who is this for? e.g. children 6–12 and their parents', multiline: true },
  { key: 'context', label: 'Client / setting', placeholder: 'e.g. Triodos Bank challenge, TU Delft IDEM307 course project', multiline: true },
  { key: 'stage', label: 'Current stage', placeholder: 'e.g. synthesising interviews, testing first prototypes' },
  {
    key: 'notes',
    label: 'Anything else the AI should know',
    placeholder: 'Constraints, decisions already made, what kind of feedback you want…',
    multiline: true,
  },
];

export function ProjectBriefModal({ brief, onChange, onClose }: ProjectBriefModalProps) {
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const fields = tab === 'overview' ? OVERVIEW_FIELDS : CONTEXT_FIELDS;

  // Rendered at <body> level so it sits above the canvas and chat panel,
  // not inside the toolbar's stacking context.
  return createPortal(
    <div
      className="brief-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="brief-modal" role="dialog" aria-modal="true" aria-labelledby="brief-modal-title">
        <div className="brief-modal__header">
          <span id="brief-modal-title" className="brief-modal__heading">
            Project
          </span>
          <button type="button" className="brief-modal__close" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="brief-modal__tabs" role="tablist">
          {(['overview', 'context'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'is-active' : ''}
              onClick={() => setTab(t)}
            >
              {t === 'overview' ? 'Overview' : 'Context'}
            </button>
          ))}
        </div>

        <div className="brief-modal__body">
          {fields.map((f, i) => (
            <label key={f.key} className="brief-field">
              <span className="brief-field__label">{f.label}</span>
              {f.multiline ? (
                <textarea
                  rows={f.key === 'description' ? 6 : 3}
                  placeholder={f.placeholder}
                  value={brief[f.key]}
                  onChange={(e) => onChange({ [f.key]: e.target.value })}
                  autoFocus={i === 0}
                />
              ) : (
                <input
                  type="text"
                  placeholder={f.placeholder}
                  value={brief[f.key]}
                  onChange={(e) => onChange({ [f.key]: e.target.value })}
                  autoFocus={i === 0}
                />
              )}
            </label>
          ))}
        </div>

        <div className="brief-modal__footer">
          <span className="brief-modal__hint">Saved automatically. The AI assistant reads this with every question.</span>
          <button type="button" className="brief-modal__done" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
