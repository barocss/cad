import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, type StudioDoc, type SketchNode } from '@barocss/cad-model/engine/doc';
import { profileRings } from '@barocss/cad-model/app/profiles';
import { resolveAssociativeSketch } from '@barocss/cad-model/engine/part';
import { freeSketchProfile } from '../src/app/freeSketchProfile';
function fixture(width = 40): StudioDoc {
  return withNode(rectanglePart(width, 24, 8), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 24],
    holes: [[{ kind: 'line', start: [2, 2] }, { kind: 'line', start: [38, 2] }, { kind: 'line', start: [38, 22] }, { kind: 'line', start: [2, 22] }]],
    plane: { origin: [0, 0, 8], normal: [0, 0, 1], xAxis: [1, 0, 0] }, on: { node: 1, side: 'solid' },
    association: { kind: 'planar-face-outline-inset', version: 1, source: { node: 1, side: 'solid' }, sourceFeature: 'n1', face: 'n1.top', insetMM: 2 } });
}
const xs = (rings: number[][][]) => rings.map(ring => [Math.min(...ring.map(p => p[0])), Math.max(...ring.map(p => p[0]))]);
test('linked free profile uses canonical current native outlines without writing saved coordinates', () => {
  const before = fixture(), resized = fixture(60), saved = JSON.stringify(resized);
  assert.deepEqual(xs(freeSketchProfile(before, 2).rings), [[0, 40], [2, 38]]);
  const current = freeSketchProfile(resized, 2);
  assert.deepEqual(xs(current.rings), [[0, 60], [2, 58]]);
  assert.deepEqual(current.rings, profileRings(resolveAssociativeSketch(resized, 2), resized.parameters));
  assert.equal(current.outerCount, 1); assert.equal(current.canPickRegion, false);
  assert.equal(freeSketchProfile(resized, 2), current, 'selection rerender reuses resolved geometry');
  assert.equal(JSON.stringify(resized), saved);
  assert.deepEqual((resized.nodes[2] as Extract<SketchNode, { profile: 'rectangle' }>).max, [40, 24]);
});
test('same feature IDs in a replacement document cannot reuse previous geometry or failed links', () => {
  const first = fixture(), broken = fixture(60), node = broken.nodes[2] as SketchNode;
  node.association = { ...node.association!, sourceFeature: 'missing' };
  const snapshot = JSON.stringify(broken), failed = freeSketchProfile(broken, 2);
  assert.deepEqual(failed.rings, []); assert.equal(freeSketchProfile(broken, 2), failed);
  assert.equal(JSON.stringify(broken), snapshot);
  assert.deepEqual(xs(freeSketchProfile(first, 2).rings), [[0, 40], [2, 38]]);
  assert.deepEqual(xs(freeSketchProfile(fixture(60), 2).rings), [[0, 60], [2, 58]]);
});
test('ordinary profiles and parameter failures preserve existing behavior', () => {
  const doc = fixture(), linked = doc.nodes[2] as SketchNode;
  const ordinary = { ...linked }; delete ordinary.association;
  const next = { ...doc, nodes: [...doc.nodes.slice(0, 2), ordinary] };
  assert.deepEqual(freeSketchProfile(next, 2).rings, profileRings(ordinary, next.parameters));
  const bound = withNode(rectanglePart(40, 24, 8), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [{ parameter: 'W' }, 20] });
  assert.deepEqual(freeSketchProfile(bound, 2).rings, []);
  assert.deepEqual(xs(freeSketchProfile(bound, 2, { W: 70 }).rings), [[0, 70]]);
});
