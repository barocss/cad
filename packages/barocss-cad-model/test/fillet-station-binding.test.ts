import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep } from '@barocss/cad';
import { commands, type Values } from '../src/app/commands';
import { editFields, type BindableField } from '../src/app/editFields';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { digestOf } from '../src/util/digest';

const params = { stationPercent: 40, middleRadius: 2 };
function fixture(extra: Values = {}): StudioDoc {
  const doc = { ...rectanglePart(40, 30, 10), parameters: params }, evaluated = evaluateDoc(doc, 0);
  assert.ok(evaluated.ok);
  const edge = evaluated.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top'));
  assert.ok(edge >= 0);
  const command = commands.find(c => c.id === 'fillet')!;
  const ctx = { doc, bodies: evaluated.bodies, selection: { edges: [{ body: 0, edge }], faces: [], bodies: [] } };
  return command.build!(ctx, { ...command.defaults!(ctx), radius: 1, endRadius: 4, stationMode: 'interior', stationAt: 25, stationRadius: 2, ...extra });
}
function numberField(doc: StudioDoc, key: string) {
  const field = editFields(doc.nodes, 2, doc.parameters).find(f => f.key === key);
  assert.ok(field?.kind === 'number'); return field;
}
function native(doc: StudioDoc) {
  const [{ brep }] = partBreps(doc); assert.ok(checkBrep(brep, { strict: true }).valid); return digestOf(brep);
}

test('fillet percent fields have no parameter affordance for one or two stations, but keep their numeric setters', () => {
  for (const doc of [fixture(), fixture({ stationMode: 'two-interior', station2At: 62.5, station2Radius: 3 })]) {
    const source = structuredClone(doc);
    for (const key of doc.nodes[2].kind === 'fillet' && doc.nodes[2].radii?.length === 4 ? ['stationAt', 'station2At'] : ['stationAt']) {
      const field = numberField(doc, key); assert.ok(!('bind' in field)); assert.ok(!('param' in field));
      const percent = key === 'stationAt' ? 40 : 70, nodes = field.set(doc.nodes, percent), node = nodes[2];
      assert.ok(node.kind === 'fillet'); assert.equal(node.radii?.[key === 'stationAt' ? 1 : 2].fraction, percent / 100);
      assert.equal(field.get(nodes), percent);
    }
    assert.deepEqual(doc, source);
  }
});

test('numeric 40 percent applies at the same native station as a fresh 40 percent fillet, not a parameter reference', () => {
  const doc = fixture(), changed = { ...doc, nodes: numberField(doc, 'stationAt').set(doc.nodes, 40) }, feature = changed.nodes[2];
  assert.ok(feature.kind === 'fillet'); assert.equal(feature.radii?.[1].fraction, .4);
  assert.equal(native(changed), native(fixture({ stationAt: 40 })));
  assert.notEqual(native(changed), native(doc));
});

test('interior radius still binds, evaluates identically to numeric 2 and survives native Save/Open', async () => {
  const doc = fixture(), field = numberField(doc, 'stationRadius'); assert.ok('bind' in field);
  const binding = field as BindableField, nodes = binding.bind(doc.nodes, 'middleRadius'); assert.ok(nodes);
  const bound = { ...doc, nodes }, feature = nodes[2]; assert.ok(feature.kind === 'fillet');
  assert.deepEqual(feature.radii?.[1].radius, { parameter: 'middleRadius' });
  assert.equal(binding.param(nodes), 'middleRadius'); assert.equal(binding.get(nodes), 2);
  assert.equal(native(bound), native(doc)); assert.deepEqual(doc, fixture());
  const opened = await readStudioFile(encodeStudioFile(bound)); assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(bound))); assert.equal(native(opened.doc), native(bound));
  for (const key of ['r1', 'stationRadius']) assert.ok('bind' in numberField(doc, key));
  const height = editFields(doc.nodes, 1, doc.parameters).find(f => f.key === 'h'); assert.ok(height && 'bind' in height);
});
