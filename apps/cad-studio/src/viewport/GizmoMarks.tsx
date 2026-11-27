import { historyFilletEndOnBlocked } from './scalarHandleDrag';
// The transform gizmo and feature handles as SVG marks over the viewport (see gizmo.ts): thin shafts with
// cone heads, translucent plane squares, quarter arcs, a centre dot; hover uses the accent colour,
// active transforms add a heavier outline, and only a nonzero turn drag shows a signed arrow.
import type React from 'react';
import { AXIS_COLORS, handleLayout, layout, type FeatureHandle, type GizmoHit, type Projector, type TransformGizmo } from './gizmo';

type XY = [number, number];
const HOT = '#f5c542';
const DRAG_EDGE = '#ffffff';
// Plane color identifies its normal axis, using the same XYZ palette as the handles.
const mix = [AXIS_COLORS[2], AXIS_COLORS[0], AXIS_COLORS[1]];
const EDGE = '#202833';
const pts = (p: XY[]) => p.map(q => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
/** A cone head at `to`, pointing from `from`: a solid triangle; the midpoint keeps the shaft exactly behind its base. */
function cone(from: XY, to: XY, len: number, half: number): XY[] {
  const dx = to[0] - from[0], dy = to[1] - from[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const b: XY = [to[0] - ux * len, to[1] - uy * len], m: XY = [to[0] - ux * len, to[1] - uy * len];
  return [to, [b[0] - uy * half, b[1] + ux * half], m, [b[0] + uy * half, b[1] - ux * half]];
}
const same = (a: GizmoHit | null, b: GizmoHit) => !!a && JSON.stringify(a) === JSON.stringify(b);

export function gizmoMarks(g: TransformGizmo | null, handles: readonly FeatureHandle[], P: Projector, hot: GizmoHit | null, readout: { at: XY; text: string } | null, drag: { hit: GizmoHit; degrees?: number } | null = null): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  if (g) {
    const L = layout(g, P);
    // Only an existing transform handle owns this hierarchy. Stale/feature hits do not dim it.
    const dragging = !!drag && (
      L.planes.some(q => same(drag.hit, { kind: "plane", axes: q.axes }))
      || L.arcs.some(q => same(drag.hit, { kind: "turn", axis: q.axis }))
      || L.arrows.some(q => same(drag.hit, { kind: "move", axis: q.axis }))
      || !!L.along && drag.hit.kind === 'move-along'
      || !!L.localArc && drag.hit.kind === 'turn-along'
      || L.cubes.some(q => same(drag.hit, { kind: "scale", axis: q.axis }))
    );
    const emphasis = (active: boolean) => dragging && !active ? 0.65 : 1;
    for (const q of L.planes) {
      const active = same(drag?.hit ?? null, { kind: 'plane', axes: q.axes }), on = active || same(hot, { kind: 'plane', axes: q.axes }), color = on ? HOT : mix[q.axes[0] === 0 && q.axes[1] === 1 ? 0 : q.axes[0] === 1 ? 1 : 2];
      items.push(<polygon key={'gp' + q.axes.join('')} points={pts(q.points)} fill={color} fillOpacity={active ? 0.6 : on ? 0.48 : 0.18} stroke={active ? DRAG_EDGE : color} strokeWidth={active ? 4 : on ? 2.5 : 1.8} strokeLinejoin="round" className="gizmo-plane" opacity={emphasis(active)} data-active={on} data-dragging={active} data-gizmo={'plane' + q.axes.map(a => 'XYZ'[a]).join('')} />);
    }
    for (const r of L.arcs) {
      const active = same(drag?.hit ?? null, { kind: 'turn', axis: r.axis }), on = active || same(hot, { kind: 'turn', axis: r.axis }), color = on ? HOT : AXIS_COLORS[r.axis];
      const u = (r.axis + 1) % 3, v = (r.axis + 2) % 3;
      // layout's cyclic u/v quarter arc runs with world sign su*sv, not a fixed screen direction.
      const su = P.forward[u] > 0 ? -1 : 1, sv = P.forward[v] > 0 ? -1 : 1;
      const forward = Math.sign(drag?.degrees ?? 0) === su * sv;
      const end = r.points[forward ? r.points.length - 1 : 0], prev = r.points[forward ? r.points.length - 3 : 2];
      const first = r.points[0], last = r.points[r.points.length - 1];
      const area = (first[0] - L.origin[0]) * (last[1] - L.origin[1]) - (first[1] - L.origin[1]) * (last[0] - L.origin[0]);
      const showTurn = active && Number.isFinite(drag?.degrees) && drag?.degrees !== 0
        && P.forward.every(Number.isFinite) && r.points.every(p => p.every(Number.isFinite))
        && Number.isFinite(area) && Math.abs(area) > 1e-6 && Math.hypot(end[0] - prev[0], end[1] - prev[1]) > 1e-6;
      items.push(<g key={'gr' + r.axis} className="gizmo-arc" opacity={emphasis(active)} data-active={on} data-dragging={active} data-gizmo={'turn' + 'XYZ'[r.axis]}>
        <polyline points={pts(r.points)} fill="none" stroke={active ? DRAG_EDGE : EDGE} strokeOpacity={active ? 1 : 0.85} strokeWidth={active ? 9 : on ? 7 : 5.5} strokeLinecap="round" />
        <polyline points={pts(r.points)} fill="none" stroke={color} strokeWidth={active ? 5.5 : on ? 4.5 : 3} strokeLinecap="round" />
        {showTurn && <polygon points={pts(cone(prev, end, 9, 5))} fill={color} stroke={DRAG_EDGE} strokeWidth={2} strokeLinejoin="round" />}</g>);
    }
    if (L.localArc) {
      const { points, label } = L.localArc;
      const active = drag?.hit.kind === 'turn-along', on = active || hot?.kind === 'turn-along';
      const color = on ? HOT : '#e8e9eb', forward = (drag?.degrees ?? 0) > 0;
      const end = points[forward ? points.length - 1 : 0], prev = points[forward ? points.length - 3 : 2];
      items.push(<g key="turnAlong" className="gizmo-arc" opacity={emphasis(active)} data-active={on} data-dragging={active} data-gizmo="turnAlong" aria-label={`Rotate about ${label}`}>
        <polyline points={pts(points)} fill="none" stroke={active ? DRAG_EDGE : EDGE} strokeWidth={active ? 9 : 5.5} strokeLinecap="round" />
        <polyline points={pts(points)} fill="none" stroke={color} strokeWidth={active ? 5.5 : on ? 4.5 : 3} strokeLinecap="round" />
        {active && drag.degrees !== undefined && drag.degrees !== 0 && <polygon points={pts(cone(prev, end, 9, 5))} fill={color} stroke={DRAG_EDGE} strokeWidth={2} strokeLinejoin="round" />}
      </g>);
    }
    const moveArrow = ({ from, to }: { from: XY; to: XY }, hit: GizmoHit, id: string, axisLabel: string, idleColor: string) => {
      const active = same(drag?.hit ?? null, hit), on = active || same(hot, hit);
      const color = on ? HOT : idleColor, head = cone(from, to, 13, 5.5);
      const base = head[2], length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const label: XY = [to[0] + (to[0] - from[0]) / length * 11, to[1] + (to[1] - from[1]) / length * 11];
      items.push(<g key={id} className="gizmo-arrow" opacity={emphasis(active)} data-active={on} data-dragging={active} data-gizmo={id}>
        <line x1={from[0]} y1={from[1]} x2={base[0]} y2={base[1]} stroke={active ? DRAG_EDGE : EDGE} strokeOpacity={active ? 1 : 0.85} strokeWidth={active ? 9 : on ? 6.5 : 5.5} strokeLinecap="round" />
        <line x1={from[0]} y1={from[1]} x2={base[0]} y2={base[1]} stroke={color} strokeWidth={active ? 5 : on ? 3.5 : 2.8} strokeLinecap="round" />
        <polygon points={pts(head)} fill={color} stroke={active ? DRAG_EDGE : EDGE} strokeWidth={active ? 2.5 : 1} strokeLinejoin="round" />
        <text x={label[0]} y={label[1]} className="gizmo-axis-label" fill={color} textAnchor="middle" dominantBaseline="central">{axisLabel}</text></g>);
    };
    for (const a of L.arrows) moveArrow(a, { kind: 'move', axis: a.axis }, 'move' + 'XYZ'[a.axis], 'XYZ'[a.axis], AXIS_COLORS[a.axis]);
    if (L.along) moveArrow(L.along, { kind: 'move-along' }, 'moveAlong', L.along.label, '#e8e9eb');
    for (const c of L.cubes) {
      const active = same(drag?.hit ?? null, { kind: 'scale', axis: c.axis }), on = active || same(hot, { kind: 'scale', axis: c.axis }), half = c.axis === null ? 7 : 5, color = on ? HOT : c.axis === null ? '#e8e9eb' : AXIS_COLORS[c.axis];
      if (c.axis !== null) items.push(<line key={'gsl' + c.axis} opacity={emphasis(active)} x1={L.origin[0]} y1={L.origin[1]} x2={c.at[0]} y2={c.at[1]} stroke={color} strokeOpacity={active ? 1 : 0.6} strokeWidth={active ? 3 : 1.5} strokeDasharray="3 3" />);
      items.push(<rect key={'gs' + c.axis} x={c.at[0] - half} y={c.at[1] - half} width={half * 2} height={half * 2} rx={1.5} fill={color} stroke={active ? DRAG_EDGE : "#000"} strokeOpacity={active ? 1 : 0.4} strokeWidth={active ? 3 : 1}
        className="gizmo-scale" opacity={emphasis(active)} data-active={on} data-dragging={active} data-gizmo={'scale' + (c.axis === null ? '' : 'XYZ'[c.axis])} />);
    }
    if (!L.cubes.length) items.push(<g key="go" aria-hidden="true">
      <circle cx={L.origin[0]} cy={L.origin[1]} r={5} className="gizmo-origin" />
      <circle cx={L.origin[0]} cy={L.origin[1]} r={1.5} fill={EDGE} /></g>);
  }
  handles.forEach((h, index) => {
    const { from, to, points } = handleLayout(h, P), on = same(hot, { kind: 'handle', index });
    if (h.plane) {
      // A puck with four arrow heads along its two directions on screen.
      const tips = [h.dir, h.plane.dir2].flatMap(d => { const e = P.project([h.at[0] + d[0] * P.size, h.at[1] + d[1] * P.size, h.at[2] + d[2] * P.size]), l = Math.hypot(e[0] - to[0], e[1] - to[1]) || 1, u: XY = [(e[0] - to[0]) / l, (e[1] - to[1]) / l]; return [u, [-u[0], -u[1]] as XY]; });
      const r = on ? 8 : 7;
      items.push(<g key={'gh' + h.id} className={'gizmo-handle puck' + (on ? ' hot' : '')} data-handle={h.id}>
        <circle cx={to[0]} cy={to[1]} r={r + 1.5} fill="#000" fillOpacity={0.35} stroke="none" /><circle cx={to[0]} cy={to[1]} r={r} />
        {tips.map((u, k) => <polygon key={k} points={pts(cone([to[0] + u[0] * r, to[1] + u[1] * r], [to[0] + u[0] * (r + 9), to[1] + u[1] * (r + 9)], 8, 3.5))} />)}</g>);
      return;
    }
    if (points) {
      const prev = points[Math.max(0, points.length - 3)], tip = cone(prev, to, on ? 13 : 11, on ? 5 : 4);
      items.push(<g key={'gh' + h.id} className={'gizmo-handle' + (on ? ' hot' : '')} data-handle={h.id}>
        <polyline points={pts(points)} fill="none" stroke={EDGE} strokeOpacity={0.85} strokeWidth={on ? 6 : 5} strokeLinecap="round" />
        <polyline points={pts(points)} fill="none" strokeWidth={on ? 3.5 : 2.5} strokeLinecap="round" className="arc" />
        <polygon points={pts(tip)} /><circle cx={from[0]} cy={from[1]} r={3.5} /></g>);
      return;
    }
    const head = cone(from, to, on ? 13 : 11, on ? 5 : 4);
    const waiting = historyFilletEndOnBlocked(h,P);
    items.push(<g key={'gh' + h.id} className={'gizmo-handle' + (on && !waiting ? ' hot' : '')} data-handle={h.id} aria-disabled={waiting||undefined}>
      {waiting ? <title>{h.label}: {h.historyFilletProofPending === 'circular'
        ? 'Drag needs a verified original circular edge. You can type Radius in History.'
        : h.historyFilletProofPending === 'pair' ? 'Drag needs both original edges. You can type Radius in History.'
          : h.historyFilletProofPending === 'group' ? 'Drag needs all three original edges. You can type Radius in History.'
          : 'End-on drag needs a verified original edge. Turn the view to drag, or type Radius in History.'}</title>
        : h.scalarDragSession && <title>{h.label}: when viewed end-on, drag up to increase or down to decrease. Sensitivity is fixed when the drag starts.</title>}
      <line x1={from[0]} y1={from[1]} x2={head[2][0]} y2={head[2][1]} stroke={EDGE} strokeOpacity={0.85} strokeWidth={on ? 6.5 : 5.5} strokeLinecap="round" />
      <line x1={from[0]} y1={from[1]} x2={head[2][0]} y2={head[2][1]} strokeWidth={on ? 3.5 : 2.8} strokeLinecap="round" />
      <polygon points={pts(head)} /><circle cx={from[0]} cy={from[1]} r={3.5} /></g>);
  });
  if (readout) {
    const w = Math.max(48, readout.text.length * 7 + 16);
    items.push(<g key="gread" className="gizmo-readout"><rect x={readout.at[0] + 16} y={readout.at[1] - 32} width={w} height={20} rx={4} className="dim-chip" />
      <text x={readout.at[0] + 16 + w / 2} y={readout.at[1] - 18} textAnchor="middle" className="dim-text">{readout.text}</text></g>);
  }
  return items;
}
