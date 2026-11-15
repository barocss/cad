import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep } from '@barocss/cad';
import { editFields, type BindableField } from '../src/app/editFields';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { partBreps } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { digestOf } from '../src/util/digest';

const cases = [{ kind: 'conic', key: 'rho' }, { kind: 'g2', key: 'tension' }] as const;
function fixture(kind: 'conic' | 'g2', value = .4): StudioDoc {
  return withNode({ ...rectanglePart(40, 30, 10), parameters: { shapeSetting: .7, filletRadius: 4 } }, {
    kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side0|n1.top'], radius: 4,
    section: kind === 'conic' ? { kind, rho: value } : { kind, tension: value },
  });
}
function field(doc: StudioDoc, key: string) {
  const found = editFields(doc.nodes, 2, doc.parameters).find(f => f.key === key); assert.ok(found?.kind === 'number'); return found;
}
function native(doc: StudioDoc) {
  const [{ brep }] = partBreps(doc); assert.ok(checkBrep(brep, { strict: true }).valid); return digestOf(brep);
}
for (const { kind, key } of cases) {
  test(`${kind}: unsupported section binding is absent while direct 0.7 edits the same native geometry as numeric input`, () => {
    const doc = fixture(kind), before = structuredClone(doc), shape = field(doc, key);
    assert.ok(!('bind' in shape)); assert.ok(!('param' in shape)); assert.equal(shape.get(doc.nodes), .4);
    const changed = { ...doc, nodes: shape.set(doc.nodes, .7) }, node = changed.nodes[2]; assert.ok(node.kind === 'fillet');
    assert.deepEqual(node.section, kind === 'conic' ? { kind, rho: .7 } : { kind, tension: .7 }); assert.equal(shape.get(changed.nodes), .7);
    assert.equal(native(changed), native(fixture(kind, .7))); assert.notEqual(native(changed), native(doc)); assert.deepEqual(doc, before);
  });
  test(`${kind}: radius binding remains native-equivalent with numeric section0.7 through native Save/Open`, async () => {
    const doc = fixture(kind, .7), before = structuredClone(doc), radius = field(doc, 'r'); assert.ok('bind' in radius);
    const binding = radius as BindableField, nodes = binding.bind(doc.nodes, 'filletRadius'); assert.ok(nodes);
    const bound = { ...doc, nodes }, feature = nodes[2]; assert.ok(feature.kind === 'fillet');
    assert.deepEqual(feature.radius, { parameter: 'filletRadius' }); assert.deepEqual(feature.section, doc.nodes[2].kind === 'fillet' ? doc.nodes[2].section : undefined);
    assert.equal(binding.param(nodes), 'filletRadius'); assert.equal(binding.get(nodes), 4); assert.equal(native(bound), native(doc));
    const opened = await readStudioFile(encodeStudioFile(bound)); assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(bound))); assert.equal(native(opened.doc), native(bound)); assert.deepEqual(doc, before);
  });
}
