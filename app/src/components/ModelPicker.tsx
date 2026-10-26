import { useEffect, useState } from 'react';
import { fetchAiModels, type AiModelList } from '../ai/client';
import { useAiModel, useUnavailableModels } from '../ai/mode';
import './ModelPicker.css';

/**
 * Dropdown of the Gemini chat models this API key can use. The choice is shared by
 * the chat and the Sources panel. "default" is GEMINI_MODEL from .env.local.
 */
export function ModelPicker() {
  const [list, setList] = useState<AiModelList | null>(null);
  const [model, setModel] = useAiModel();
  const unavailable = useUnavailableModels();

  useEffect(() => {
    let cancelled = false;
    fetchAiModels().then((l) => {
      if (!cancelled) setList(l);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A remembered model this key can't use (anymore) falls back to the default.
  useEffect(() => {
    if (list && model && !list.models.includes(model)) setModel(null);
  }, [list, model, setModel]);

  if (!list) return <span className="model-picker__loading">loading models…</span>;

  const value = model ?? list.default;
  return (
    <select
      className="model-picker"
      value={value}
      aria-label="Gemini model"
      title="Which Gemini model answers. Lite models have higher free limits."
      onChange={(e) => setModel(e.target.value === list.default ? null : e.target.value)}
    >
      {list.models.map((m) => (
        <option key={m} value={m} disabled={unavailable.includes(m) && m !== value}>
          {m.replace(/^gemini-/, '')}
          {m === list.default ? ' (default)' : ''}
          {unavailable.includes(m) ? ' (not available)' : ''}
        </option>
      ))}
    </select>
  );
}
