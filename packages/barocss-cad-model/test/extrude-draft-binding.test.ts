import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep } from '@barocss/cad';
import { editFields, type BindableField } from '../src/app/editFields';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { digestOf } from '../src/util/digest';

function fixture(): StudioDoc {
  const doc = { ...emptyDoc(), parameters: { Angle: 35, Height: 6 } };
  return withNode(withNode(doc, { kind: 'sketch', profile: 'loop', segments: [
    { kind: 'line', start: [-10, 0] }, { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' },
  ] }), { kind: 'extrude', sketch: 0, height: 10, draft: 14 });
}
function field(doc: StudioDoc, key: string) {
  const found = editFields(doc.nodes, 1, doc.parameters).find(f => f.key === key);
  assert.ok(found?.kind === 'number'); return found;
}
function native(doc: StudioDoc) {
  const [{ brep }] = partBreps(doc); assert.ok(checkBrep(brep, { strict: true }).valid); return digestOf(brep);
}
function oracle(height: number, draft: number, n = 4096) {
  const slope = Math.tan(draft * Math.PI / 180), area = (z: number) => {
    const d = z * slope, r = 10 - d; return r * r * Math.acos(d / r) - d * Math.sqrt(r * r - d * d);
  };
  let sum = area(0) + area(height);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * area(i * height / n);
  return height / n / 3 * sum;
}
test('unsupported Extrude Draft binding is absent on curved and straight profiles while numeric draft still edits', () => {
  for (const doc of [fixture(), { ...rectanglePart(40, 30, 10), parameters: { Angle: 35, Height: 6 } }]) {
    const before = structuredClone(doc), draft = field(doc, 'draft'); assert.ok(!('bind' in draft)); assert.ok(!('param' in draft));
    const nodes = draft.set(doc.nodes, 14), feature = nodes[1]; assert.ok(feature.kind === 'extrude'); assert.equal(feature.draft, 14);
    assert.equal(draft.get(nodes), 14); assert.ok(native({ ...doc, nodes })); assert.deepEqual(doc, before);
  }
});
test('Distance Height binding preserves numeric Draft 14 and matches direct height6 native geometry and an independent half-disk integral', async () => {
  const doc = fixture(), before = structuredClone(doc), distance = field(doc, 'h'); assert.ok('bind' in distance);
  const binding = distance as BindableField, nodes = binding.bind(doc.nodes, 'Height'); assert.ok(nodes);
  const bound = { ...doc, nodes }, numeric = { ...doc, nodes: distance.set(doc.nodes, 6) }, feature = nodes[1];
  assert.ok(feature.kind === 'extrude'); assert.deepEqual(feature.height, { parameter: 'Height' }); assert.equal(feature.draft, 14); assert.equal(feature.sketch, 0);
  assert.equal(binding.param(nodes), 'Height'); assert.equal(binding.get(nodes), 6); assert.equal(native(bound), native(numeric));
  const evaluated = evaluateDoc(bound, 1); assert.ok(evaluated.ok);
  const expected = oracle(6, 14); assert.ok(Math.abs(expected - oracle(6, 14, 2048)) < 1e-9);
  assert.ok(Math.abs(evaluated.bodies[0].volume! - expected) < 1e-7);
  const opened = await readStudioFile(encodeStudioFile(bound)); assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(bound))); assert.equal(native(opened.doc), native(bound));
  assert.deepEqual(doc, before);
});
