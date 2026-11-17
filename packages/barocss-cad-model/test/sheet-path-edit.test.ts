import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields, type BindableField } from '../src/app/editFields';
import { emptyDoc, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';
import { profilePath } from '../src/app/sheetCommands';

type Contour = Extract<ModelNode, { kind: 'sheet-contour' }>;
const source = (): StudioDoc => withNode(emptyDoc(), { kind: 'sheet-contour', path: [[0, 30], [0, 0], [40, 0]], side: 'left', width: 30, thickness: 1.5, bendRadius: 1.5, kFactor: .44, plane: { origin: [0, 30, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] } });
function field(doc: StudioDoc, key: string): BindableField {
  const f = editFields(doc.nodes, 0, doc.parameters).find(f => f.key === key);
  assert.ok(f && f.kind === 'number', key); return f as BindableField;
}
const put = (doc: StudioDoc, key: string, value: number): StudioDoc => ({ ...doc, nodes: field(doc, key).set(doc.nodes, value) as StudioDoc['nodes'] });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function check(doc: StudioDoc, a: number, b: number) {
  const result = evaluateDoc(doc, 1); assert.ok(result.ok, result.ok ? '' : result.error.detail);
  assert.equal(result.bodies.length, 1); const body = result.bodies[0];
  near(body.volume!, 30 * 1.5 * (a + b - 6 + Math.PI / 2 * 2.25));
  assert.ok(body.flat); near(body.flat.box.max[1] - body.flat.box.min[1], a + b - 6 + Math.PI / 2 * 2.16);
  near(body.flat.box.max[0] - body.flat.box.min[0], 30);
  assert.equal(body.flat.bends.length, 1); assert.equal(body.flat.bends[0].name, 'n0.bend1');
  near(body.flat.bends[0].angle, 90); near(body.flat.bends[0].radius, 1.5);
  return body;
}

test('authored sheet path coordinates are local, immutable, and preserve all non-coordinate data', () => {
  for (const shape of ['l', 'u', 'z', 'hat']) {
    const doc = source(), path = profilePath(shape, 40, 30, 12, 90).path;
    doc.nodes[0] = { ...doc.nodes[0] as Contour, path };
    const before = structuredClone(doc), fields = editFields(doc.nodes, 0, {});
    assert.equal(fields.filter(f => f.key.startsWith('path')).length, path.length * 2);
    for (let p = 0; p < path.length; p++) for (const axis of [0, 1]) {
      const f = field(doc, `path${p}.${axis}`);
      assert.equal(f.label, `Path point ${p + 1} local ${'XY'[axis]}`); assert.equal(f.unit, 'mm');
      assert.equal(f.get(doc.nodes), path[p][axis]);
      const next = put(doc, f.key, 123.25), expected = structuredClone(doc);
      (expected.nodes[0] as Contour).path[p][axis] = 123.25;
      assert.deepEqual(next, expected); assert.deepEqual(doc, before);
      assert.notEqual((next.nodes[0] as Contour).path[p], path[p]);
    }
  }
});

test('path coordinates retain the exact parameter leaf through bind, edit, unbind and document roundtrip', () => {
  let doc = source(); doc.parameters = { Base: 40, Leg: 35 };
  const f = field(doc, 'path2.0'), bound = f.bind(doc.nodes, 'Base'); assert.ok(bound);
  doc = { ...doc, nodes: bound as StudioDoc['nodes'] };
  assert.deepEqual((doc.nodes[0] as Contour).path[2], [{ parameter: 'Base' }, 0]);
  assert.equal(field(doc, 'path2.0').param(doc.nodes), 'Base');
  doc.parameters.Base = 50; assert.equal(field(doc, 'path2.0').get(doc.nodes), 50); check(doc, 50, 30);
  doc = put(doc, 'path0.1', 35); check(doc, 50, 35);
  assert.deepEqual((doc.nodes[0] as Contour).path[2], [{ parameter: 'Base' }, 0]);
  const read = readStudioDoc(JSON.stringify(doc)); assert.ok('doc' in read); assert.deepEqual(read.doc.nodes, doc.nodes); check(read.doc, 50, 35);
  doc = put(doc, 'path2.0', 45); assert.equal(field(doc, 'path2.0').param(doc.nodes), null); check(doc, 45, 35);
});

test('literal L base and leg edits rebuild folded and flat results without changing bend identity', () => {
  const initial = source(), base = put(initial, 'path2.0', 50), leg = put(base, 'path0.1', 35);
  check(initial, 40, 30); check(base, 50, 30); check(leg, 50, 35);
  const read = readStudioDoc(JSON.stringify(leg)); assert.ok('doc' in read); check(read.doc, 50, 35);
  assert.deepEqual(initial, source());
});

test('degenerate and radius-unfit edited paths stay native refusals without mutating the source', () => {
  const doc = source(), before = structuredClone(doc);
  for (const value of [0, 1]) {
    const invalid = put(doc, 'path2.0', value), result = evaluateDoc(invalid, 1);
    assert.equal(result.ok, false, `invalid base ${value}`); assert.deepEqual(doc, before);
  }
  check(put(doc, 'path2.0', 50), 50, 30);
});

test('point count and order stay literal for the existing two-to-64-point path boundary', () => {
  for (const count of [2, 64]) {
    const doc = source(), path: Contour['path'] = Array.from({ length: count }, (_, k) => [k * 10, k % 2]);
    doc.nodes[0] = { ...doc.nodes[0] as Contour, path };
    const next = put(doc, `path${count - 1}.1`, -2);
    assert.equal(editFields(doc.nodes, 0).filter(f => f.key.startsWith('path')).length, count * 2);
    assert.deepEqual((next.nodes[0] as Contour).path.slice(0, -1), path.slice(0, -1));
    assert.deepEqual((next.nodes[0] as Contour).path.at(-1), [(count - 1) * 10, -2]);
  }
});

test('downstream literal hole stays on its authored plane after a longer sheet base', () => {
  let doc = source();
  doc = withNode(doc, { kind: 'sketch', profile: 'circle', center: [25, 15], radius: 2, plane: { origin: [0, 0, -1], normal: [0, 0, 1], xAxis: [1, 0, 0] } });
  doc = withNode(doc, { kind: 'extrude', sketch: 1, height: 4 });
  doc = withNode(doc, { kind: 'difference', parent: { node: 0, side: 'solid' }, tool: { node: 2, side: 'solid' } });
  for (const a of [40, 50]) {
    const changed = put(doc, 'path2.0', a), result = evaluateDoc(changed, 1);
    assert.ok(result.ok, result.ok ? '' : result.error.detail); assert.equal(result.bodies.length, 1);
    assert.deepEqual(changed.nodes.slice(1), doc.nodes.slice(1));
    const body = result.bodies[0]; near(body.volume!, 45 * (a + 30 - 6 + Math.PI / 2 * 2.25) - Math.PI * 4 * 1.5);
    assert.ok(body.flat); assert.equal(body.flat.loops.length, 2); assert.equal(body.flat.bends[0].name, 'n0.bend1');
    assert.ok(body.mesh.faces.some(face => face.name.startsWith('n2.side')));
  }
});

test('authored bend table remains intact and unsupported new bend angles are refused', () => {
  const doc = source(), contour = doc.nodes[0] as Contour;
  const { kFactor: _k, ...rest } = contour; void _k;
  doc.nodes[0] = { ...rest, bendTable: { id: 'fixture', sources: [{ id: 'synthetic', label: 'Synthetic test row' }], rows: [{ thickness: 1.5, radius: 1.5, angle: 90, kFactor: .44, source: 'synthetic' }] } };
  const base = put(doc, 'path2.0', 50); check(base, 50, 30);
  assert.deepEqual((base.nodes[0] as Contour).bendTable, (doc.nodes[0] as Contour).bendTable);
  const angled = put(base, 'path0.0', -15), result = evaluateDoc(angled, 1);
  assert.equal(result.ok, false);
  assert.deepEqual((angled.nodes[0] as Contour).bendTable, (doc.nodes[0] as Contour).bendTable);
});
