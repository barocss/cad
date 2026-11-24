import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode } from '../src/engine/doc';
import { profileOf } from '../src/sketch/loops';
import { applyConstraint, solveShape, type Polygon } from '../src/sketch/rules';

const edge = (i: number) => ({ kind: 'edge', i } as const);
const points: Polygon['points'] = [[0, -1.5], [12, 0], [20, 8], [0, 12]];
const bulge = Math.tan(Math.PI / 8);
const base: Polygon = { kind: 'polygon', closed: true, points, bulges: [0, -bulge, 0, 0], radii: { 1: 8 }, hv: { h: [], v: [] } };

const cases: [string, Polygon, number, number][] = [
  ['clockwise at arc start', base, 0, 1],
  ['counterclockwise at arc end', { ...base, points: [...points].reverse(), bulges: [0, bulge, 0, 0] }, 2, 1],
  ['clockwise across last/first', { ...base, points: [...points.slice(1), points[0]], bulges: [-bulge, 0, 0, 0], radii: { 0: 8 } }, 3, 0],
];

for (const [label, shape, line, arc] of cases) {
  test(label + ': pick order, exact tangent and native reopen', async () => {
    const before = solveShape(shape);
    const forward = applyConstraint(shape, [edge(line), edge(arc)], 'perpendicular');
    const reverse = applyConstraint(shape, [edge(arc), edge(line)], 'perpendicular');
    assert.deepEqual(reverse, forward);
    assert.ok(before.ok && forward.ok, JSON.stringify(forward));
    assert.equal(forward.report.dof, before.dof - 1);
    const built = profileOf([forward.shape]);
    assert.ok('node' in built && built.node.profile === 'loop');
    const native = built.node.segments;
    const circle = native[arc];
    assert.equal(circle.kind, 'arc');
    const numeric = (p: readonly unknown[]): [number, number] => {
      assert.ok(typeof p[0] === 'number' && typeof p[1] === 'number');
      return [p[0], p[1]];
    };
    const start = numeric(native[line].start), finish = numeric(native[(line + 1) % native.length].start);
    const center = numeric(circle.center);
    const joint = (line + 1) % native.length === arc ? finish : start;
    const dx = finish[0] - start[0], dy = finish[1] - start[1];
    const rx = joint[0] - center[0], ry = joint[1] - center[1];
    assert.ok(Math.abs((-dx * ry + dy * rx) / Math.hypot(dx, dy) / Math.hypot(rx, ry)) < 1e-8);
    const doc = withNode(emptyDoc(), built.node);
    const bytes = encodeStudioFile(doc);
    const reopened = await readStudioFile(bytes);
    assert.ok('doc' in reopened, JSON.stringify(reopened));
    assert.deepEqual(encodeStudioFile(reopened.doc), bytes);
  });
}

test('a nonadjacent line and arc are refused without changing the draft', () => {
  const source = structuredClone(base);
  assert.equal(applyConstraint(base, [edge(1), edge(3)], 'perpendicular').ok, false);
  assert.deepEqual(base, source);
});

test('marking an unsatisfied saved rule does not authorize its admission', async () => {
  const built = profileOf([base]);
  assert.ok('node' in built && built.node.profile === 'loop' && built.node.outline);
  built.node.outline.rules = [{ kind: 'perpendicular', a: 0, b: 1, at: 'shared-endpoint' }];
  const result = await readStudioFile(encodeStudioFile(withNode(emptyDoc(), built.node)));
  assert.ok('error' in result);
  assert.match(result.error, /\[BAD_REFERENCE\].*marked shared-endpoint perpendicular/);
});
