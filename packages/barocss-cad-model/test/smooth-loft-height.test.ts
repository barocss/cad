import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCurve } from '@barocss/cad';
import { commandById, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { smoothLoftHeightKey } from '../src/app/smoothLoftHeight';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { partBreps } from '../src/engine/evaluate';

const source = withNode(emptyDoc(), {
  kind: 'sketch', profile: 'rectangle', min: [1, 2], max: [13, 10],
  plane: { origin: [11, -17, 23], normal: [0, 0.6, 0.8], xAxis: [1, 0, 0] },
});
const ctx: Ctx = { doc: source, bodies: [], selection: { faces: [], edges: [], bodies: [], sketches: [0] } };

function heightField(doc: StudioDoc) {
  return editFields(doc.nodes, doc.nodes.length - 1, doc.parameters).find(field => field.key === smoothLoftHeightKey);
}

test('Smooth Loft height edits stretch the native solid along its tilted axis and keep the corner identities', () => {
  const original = commandById('smooth-turn')!.build!(ctx, { height: 50, angle: -450 });
  const field = heightField(original);
  assert.ok(field?.kind === 'number');
  assert.equal(field.get(original.nodes), 50);
  assert.equal('bind' in field, false);
  for (const value of [50, 0, -3, Infinity, NaN]) assert.deepEqual(field.set(original.nodes, value), original.nodes);
  const edited = { ...original, nodes: field.set(original.nodes, 70) };
  assert.equal(field.get(edited.nodes), 70);
  assert.deepEqual(edited.nodes.slice(0, -1), original.nodes.slice(0, -1));
  const [{ brep: before, key }] = partBreps(original), [{ brep: after, key: nextKey }] = partBreps(edited);
  assert.equal(key, nextKey);
  assert.equal(checkBrep(after, { strict: true }).valid, true);
  assert.deepEqual(after.faces.map(face => face.name), before.faces.map(face => face.name));
  assert.deepEqual(after.edges.map(edge => edge.name), before.edges.map(edge => edge.name));
  const [a, b] = [before, after].map(body => brepMassProperties(body, 1).volume);
  assert.ok(Math.abs(b - a * 1.4) < 1e-7);

  const rails = before.edges.filter(edge => /^c[0-3]$/.test(edge.id));
  assert.equal(rails.length, 4);
  for (const original of rails) {
    const resized = after.edges.find(edge => edge.id === original.id)!;
    for (const t of [0, 0.071, 0.25, 0.565, 0.875, 1]) {
      const oldPoint = evaluateCurve(original.curve, t), newPoint = evaluateCurve(resized.curve, t);
      const expected = [oldPoint[0], oldPoint[1] + 20 * t * 0.6, oldPoint[2] + 20 * t * 0.8];
      assert.ok(Math.hypot(...newPoint.map((value, i) => value - expected[i])) < 1e-7);
    }
  }
});

test('only numeric height-based Smooth Loft exposes the total-height editor', () => {
  const ruled = commandById('ruled-turn')!.build!(ctx, { height: 40, angle: 360 });
  assert.equal(heightField(ruled), undefined);
  const smooth = commandById('smooth-turn')!.build!(ctx, { height: 40, angle: 360 });
  const node = smooth.nodes.at(-1)!;
  assert.equal(node.kind, 'loft');
  if (node.kind !== 'loft') throw new Error('Expected Smooth Loft');
  const invalid = {
    ...smooth, parameters: { h: 40 },
    nodes: [...smooth.nodes.slice(0, -1), { ...node, sections: node.sections.map((section, i) =>
      i === 2 ? { sketch: section.sketch, z: { parameter: 'h' } } : section) }],
  };
  assert.equal(heightField(invalid), undefined);
});
