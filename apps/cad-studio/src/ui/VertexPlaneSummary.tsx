import type { SketchAnchor } from '@barocss/cad-model/sketch/types';
import { yAxisOf, type SketchPlane } from '@barocss/cad-model/sketch/plane';

const vectorText = (values: readonly number[]) => values.map(value => String(Number(value.toPrecision(6)))).join(', ');

/** Read-only current frame; capture provenance exists only in the active vertex anchor. */
export function VertexPlaneSummary({ anchor, plane }: { anchor?: SketchAnchor; plane: SketchPlane }) {
  if (anchor?.kind !== 'vertices' || !anchor.vertexPlane) return null;
  const adjusted = anchor.offset !== 0 || (anchor.angle ?? 0) !== 0;
  return <section aria-label="Selected vertex plane summary" className="small">
    <div className="card-title">Current sketch frame</div>
    <div className="kv">Origin (mm)<b>{vectorText(plane.origin)}</b></div>
    <div className="kv">+X<b>{vectorText(plane.xAxis)}</b></div>
    <div className="kv">+Y<b>{vectorText(yAxisOf(plane))}</b></div>
    <div className="kv">Normal<b>{vectorText(plane.normal)}</b></div>
    <p className="muted">Approximate display: 6 significant digits. Axis and normal vectors are unitless.</p>
    <p>At capture, point 1 sets the origin, point 1 → point 2 sets +X, and point 3 sets the +Y side.</p>
    {adjusted && <p>The current frame includes the plane offset or angle; the capture rule describes the original frame.</p>}
    <p>Fixed snapshot: later source vertex changes do not update this plane.</p>
  </section>;
}
