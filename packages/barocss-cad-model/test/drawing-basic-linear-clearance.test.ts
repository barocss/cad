import test from 'node:test';
import assert from 'node:assert/strict';
import { basicBox, dimensionMarks, frameMarks, PENS } from '../src/drawing/sheet';
import type { Resolved } from '../src/drawing/dimensions';
import type { ViewPlacement } from '../src/drawing/views';
import type { XY } from '../src/drawing/types';
import { PLAIN, presetFor } from '../src/drawing/standard';

for (const orient of ['horizontal', 'vertical', 'aligned'] as const) for (const reverse of [false, true]) for (const scale of [0.5, 1, 2]) {
  test(`basic frame clears its ruler: ${orient}, reverse=${reverse}, scale=${scale}`, () => {
    const start: XY = [0, 0], end: XY = orient === 'horizontal' ? [12, 0] : orient === 'vertical' ? [0, 12] : [7.2, 9.6];
    const a = reverse ? end : start, b = reverse ? start : end;
    const r: Extract<Resolved, { ok: true; kind: 'linear' }> = { ok: true, kind: 'linear', a, b, value: 12, text: '12', dim: { id: 'd', kind: 'linear', view: 'front', orient, a: { edge: 'a', at: 'end', near: [0, 0, 0] }, b: { edge: 'b', at: 'end', near: [12, 0, 0] }, place: [30, -30], basic: true } };
    const before = structuredClone(r), v: ViewPlacement = { id: 'front', origin: [100, 100], scale, box: [0, 0, 200, 200] };
    const marks = dimensionMarks(v, r, PLAIN), plain = dimensionMarks(v, { ...r, dim: { ...r.dim, basic: undefined } }, PLAIN);
    assert.deepEqual(marks.filter(m => m.kind !== 'text'), plain.filter(m => m.kind !== 'text'), 'lines and arrows unchanged');
    assert.deepEqual(r, before, 'references, place and values unchanged');
    const asme = presetFor({ standard: 'asme' });
    assert.deepEqual(dimensionMarks(v, r, asme), dimensionMarks(v, { ...r, dim: { ...r.dim, basic: undefined } }, asme), 'ASME primitive unchanged');
    const text = marks.find(m => m.kind === 'text'); assert.ok(text?.kind === 'text');
    const control = { id: 'attached', dim: 'd', characteristic: 'flatness' as const, value: 0.1, datums: [] };
    const controlBefore = structuredClone(control);
    assert.ok(frameMarks(text, control, PLAIN).length > 0);
    assert.deepEqual(control, controlBefore);
    const frame = basicBox(marks)[0]; assert.ok(frame.kind === 'polyline');
    const line = marks.find(m => m.kind === 'line' && m.role === 'dimension'); assert.ok(line?.kind === 'line');
    const dx = line.b[0] - line.a[0], dy = line.b[1] - line.a[1], length = Math.hypot(dx, dy);
    const distances = frame.points.map(p => ((p[0] - line.a[0]) * -dy + (p[1] - line.a[1]) * dx) / length);
    const half = PENS.thin.width / 2;
    assert.ok(Math.min(...distances) > half * 2 || Math.max(...distances) < -half * 2, `frame crosses ruler: ${distances}`);
  });
}
