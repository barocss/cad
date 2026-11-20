import { evaluateCurve, type FlatSegment } from '@barocss/cad';

const f2 = (v: number) => String(Math.round(v * 1000) / 1000);
/** A loop as SVG path data, y flipped (the flat's y goes up) within a box `h` high. */
export function flatLoopPath(segs: readonly FlatSegment[], h: number): string {
  const p = (x: number, y: number) => `${f2(x)} ${f2(h - y)}`;
  let d = '';
  segs.forEach((s, i) => {
    if (s.kind === 'line') { d += (i ? 'L' : 'M') + p(s.a[0], s.a[1]) + 'L' + p(s.b[0], s.b[1]); return; }
    if (s.kind === 'arc') {
      const closed = s.start[0] === s.end[0] && s.start[1] === s.end[1], r = f2(s.radius);
      // Y reflection reverses numeric angular direction. SVG sweep 1 increases the angle in its own coordinates.
      const sweep = s.ccw ? 0 : 1;
      if (closed) { const o: [number, number] = [2 * s.center[0] - s.start[0], 2 * s.center[1] - s.start[1]]; d += `M${p(s.start[0], s.start[1])}A${r} ${r} 0 0 ${sweep} ${p(o[0], o[1])}A${r} ${r} 0 0 ${sweep} ${p(s.start[0], s.start[1])}`; return; }
      const a0 = Math.atan2(s.start[1] - s.center[1], s.start[0] - s.center[0]), a1 = Math.atan2(s.end[1] - s.center[1], s.end[0] - s.center[0]);
      let sw = a1 - a0; if (s.ccw) { while (sw <= 0) sw += 2 * Math.PI; } else { while (sw >= 0) sw -= 2 * Math.PI; }
      d += (i ? 'L' : 'M') + p(s.start[0], s.start[1]) + `A${r} ${r} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sweep} ${p(s.end[0], s.end[1])}`;
      return;
    }
    const curve = { kind: 'curve' as const, id: 'flat', degree: s.degree, knots: [...s.knots], controlPoints: s.control.map(q => [q[0], q[1], 0] as [number, number, number]), weights: [...s.weights] };
    const lo = s.knots[0], hi = s.knots[s.knots.length - 1];
    for (let k = 0; k <= 64; k++) { const q = evaluateCurve(curve, lo + (hi - lo) * k / 64); d += (i || k ? 'L' : 'M') + p(q[0], q[1]); }
  });
  return d + 'Z';
}
