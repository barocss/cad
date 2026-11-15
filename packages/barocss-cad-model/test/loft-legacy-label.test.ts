import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { bodyName, withLook } from '../src/app/bodies';
import { emptyDoc, featureLabel, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { digestOf } from '../src/util/digest';
type Loft = Extract<ModelNode, { kind: 'loft' }>;
function fixture(): StudioDoc {
  let doc = withNode(emptyDoc(), { kind: 'sketch', profile: 'circle', center: [0, 0], radius: 3 });
  doc = withNode(doc, { kind: 'sketch', profile: 'circle', center: [0, 0], radius: 6 });
  return withNode(doc, { kind: 'loft', sections: [{ sketch: 0, z: 0 }, { sketch: 1, z: 20 }], smooth: true });
}
const label = (node: Loft) => featureLabel(node, 2, []);
function node(doc: StudioDoc): Loft { const loft = doc.nodes[2]; assert.ok(loft.kind === 'loft'); return loft; }
function native(doc: StudioDoc) {
  const [{ brep }] = partBreps(doc); assert.ok(checkBrep(brep, { strict: true }).valid);
  assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 420 * Math.PI) < 1e-6); return digestOf(brep);
}
test('legacy unguided unframed two-section label agrees with effective Ruled without rewriting authored smooth', () => {
  const doc = fixture(), before = structuredClone(doc), loft = node(doc);
  assert.equal(label(loft), 'Loft 2 sections'); assert.equal(label({ ...loft, smooth: false }), 'Loft 2 sections');
  const without = { ...loft }; delete without.smooth; assert.equal(label(without), 'Loft 2 sections');
  assert.equal(loft.smooth, true); assert.deepEqual(doc, before);
  const evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok); assert.equal(bodyName(doc, evaluated.bodies[0]), 'Loft 2 sections');
  assert.deepEqual(doc, before);
});
test('three-section Smooth and guided/framed labels keep their existing contract, including own-property malformed legacy boundaries', () => {
  const loft = node(fixture());
  assert.equal(label({ ...loft, sections: [...loft.sections, { sketch: 1, z: 30 }] }), 'Loft 3 sections · smooth');
  const guide = { kind: 'quadratic-bezier' as const, controlPoints: [[3, 0, 0], [5, 0, 10], [6, 0, 20]] as const };
  const frame = { origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 1, 0] };
  const variants = [
    { ...loft, guide }, { ...loft, guides: [guide, guide] },
    { ...loft, sections: loft.sections.map((s, i) => i ? s : { sketch: s.sketch, frame }) },
    { ...loft, guide: undefined }, { ...loft, guides: undefined },
    { ...loft, sections: loft.sections.map((s, i) => i ? s : { ...s, frame: undefined }) },
    ...[null, undefined, [], 0].map(section => ({ ...loft, sections: [section, loft.sections[1]] })),
  ];
  for (const value of variants) {
    const before = structuredClone(value); assert.equal(label(value as unknown as Loft), 'Loft 2 sections · smooth'); assert.deepEqual(value, before);
  }
  assert.equal(label({ ...loft, sections: [loft.sections[0]] }), 'Loft 1 sections · smooth', 'invalid section-count admission is not changed by naming');
});
test('legacy native geometry, document payload and user name survive labeling and native Save/Open', async () => {
  const doc = fixture(), before = structuredClone(doc), shape = native(doc);
  const plain = { ...doc, nodes: doc.nodes.map((n, i) => i === 2 && n.kind === 'loft' ? { ...n, smooth: false } : n) };
  assert.equal(native(plain), shape, 'the existing two-section effective native shape is unchanged');
  const evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const named = withLook(doc, evaluated.bodies[0], { name: 'Custom nozzle' }), namedBefore = structuredClone(named);
  assert.equal(bodyName(named, evaluated.bodies[0]), 'Custom nozzle'); assert.equal(label(node(named)), 'Loft 2 sections');
  const opened = await readStudioFile(encodeStudioFile(named)); assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(named))); assert.equal(node(opened.doc).smooth, true); assert.equal(native(opened.doc), shape);
  const reopened = evaluateDoc(opened.doc, 1); assert.ok(reopened.ok); assert.equal(bodyName(opened.doc, reopened.bodies[0]), 'Custom nozzle');
  assert.deepEqual(named, namedBefore); assert.deepEqual(doc, before);
});
