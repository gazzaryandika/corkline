import { useState } from 'react';
import { EDGE_KIND_ORDER, EDGE_KINDS, GAP_COLOR, NODE_TYPE_ORDER, NODE_TYPES } from '../config';
import './Legend.css';

export function Legend() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`legend${collapsed ? ' is-collapsed' : ''}`}>
      <button type="button" className="legend__head" onClick={() => setCollapsed((c) => !c)}>
        <span>LEGEND</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && (
        <div className="legend__body">
          <h4>Steps, left to right</h4>
          {NODE_TYPE_ORDER.map((key) => {
            const cfg = NODE_TYPES[key];
            return (
              <div className="legend__row" key={key}>
                <span className="legend__dot" style={{ background: cfg.color }} />
                <span>{cfg.label}</span>
              </div>
            );
          })}
          <h4>Connections</h4>
          {EDGE_KIND_ORDER.map((key) => {
            const cfg = EDGE_KINDS[key];
            return (
              <div className="legend__row" key={key}>
                <span className="legend__line" style={{ borderColor: cfg.color }} />
                <span>{cfg.label}</span>
              </div>
            );
          })}
          <p className="legend__note">
            Lines read left to right. A link pointing back to an earlier column reads the other way round:
            Supported by, Tested by, Follows from.
          </p>
          <div className="legend__row legend__row--gap">
            <span className="legend__dot" style={{ background: GAP_COLOR }} />
            <span>Amber glow = a step is missing in this card&rsquo;s trace (its tag says what)</span>
          </div>
          <p className="legend__note">
            Links go one step at a time: Problem → Assumption → Evidence → Insight → Opportunity → Direction →
            Prototype, or between cards in the same column. Only Contradicts may join any two cards. Results from
            testing a prototype come back as new Evidence (open the Prototype: &ldquo;+ Add result as Evidence&rdquo;).
          </p>
          <p className="legend__note">
            Click the dot on a card&rsquo;s edge, then click another card to link them — or drag the dot straight onto
            a target. Esc cancels. Click a line to highlight its whole path (everything leading into it and following
            from it); the &times; on its label then deletes it.
          </p>
          <p className="legend__note">
            ⌘/Ctrl-click cards to select several at once (drag one to move them together), or hold Shift and drag on
            empty canvas to box-select.
          </p>
          <p className="legend__note">
            With 2+ cards selected, click Group (or ⌘/Ctrl-G) to frame them — the frame fits itself to whatever it
            contains and refits live as cards move. Drag the frame&rsquo;s label to move the group; the × on it
            removes the frame without touching the cards.
          </p>
        </div>
      )}
    </div>
  );
}
