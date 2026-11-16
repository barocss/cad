import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDoc, brepsFor } from '../src/engine/evaluate';
import { rectanglePart, withNode } from '../src/engine/doc';
import { threadsOf, threadLines } from '../src/app/threads';
import { projectViews } from '../src/drawing/project';
import { layoutSheet } from '../src/drawing/views';
import { defaultDrawing } from '../src/drawing/types';
import { threadMarks } from '../src/drawing/threads';

for (const axis of ['x', 'z'] as const) for (const circular of [false, true]) for (const count of [4, 6]) {
  test(`${axis} ${circular ? 'circular' : 'linear'} tapped copies ${count} all carry model rings and drawing marks`, () => {
    const base = rectanglePart(60, 60, 60);
    const doc = withNode(base, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: circular ? [45, 30] : [8, 30],
      radius: 2.5, depth: 6, thread: 'M6×1', axis, side: 'max', pattern: circular ? { count, about: [30, 30] } : { count, step: [8, 0] } });
    const threads = threadsOf(doc.nodes, {});
    assert.equal(threads.size, count);
    const result = evaluateDoc(doc, 1); assert.ok(result.ok);
    const lines = threadLines(threads, result.bodies[0].mesh);
    assert.equal(lines.length / (6 * 32), count * 6);
    const coordinates = axis === 'z' ? [0, 1] : [1, 2];
    const centers = Array.from({ length: count }, (_, i) => circular
      ? [30 + 15 * Math.cos(2 * Math.PI * i / count), 30 + 15 * Math.sin(2 * Math.PI * i / count)] : [8 + i * 8, 30]);
    for (const center of centers) {
      let vertices = 0;
      for (let i = 0; i < lines.length; i += 3) if (Math.abs(Math.hypot(lines[i + coordinates[0]] - center[0], lines[i + coordinates[1]] - center[1]) - 2.5 * .985) < 1e-4) vertices++;
      assert.equal(vertices, 6 * 32 * 2);
    }
    const breps = brepsFor(doc); assert.ok('breps' in breps);
    const projected = projectViews(breps.breps, breps.prefixes); assert.ok(projected.ok);
    const layout = layoutSheet(projected.views, defaultDrawing());
    const view = axis === 'z' ? 'top' : 'right';
    const marks = threadMarks(layout.views[view], projected.views[view], threads, true);
    assert.equal(marks.filter(mark => mark.kind === 'arc').length, count);
    assert.ok(marks.every(mark => mark.kind === 'arc' && Math.abs(mark.u[0] / layout.views[view].scale - 3) < 1e-9));
  });
}
