import { EDGE_KIND_ORDER, EDGE_KINDS } from '../config';

/** Arrowhead + tension-diamond marker defs, shared by every RelationEdge instance. */
export function EdgeMarkers() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        {EDGE_KIND_ORDER.filter((key) => EDGE_KINDS[key].arrow).map((key) => (
          <marker
            key={key}
            id={`arrow-${key}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={EDGE_KINDS[key].color} />
          </marker>
        ))}
        <marker id="tension-diamond" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7">
          <path d="M5,0 L10,5 L5,10 L0,5 z" fill={EDGE_KINDS.contradicts.color} />
        </marker>
      </defs>
    </svg>
  );
}
