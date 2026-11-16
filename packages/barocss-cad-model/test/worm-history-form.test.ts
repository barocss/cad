import test from 'node:test';
import assert from 'node:assert/strict';
import { commands, type Ctx } from '../src/app/commands';
import { emptyDoc, type ModelNode } from '../src/engine/doc';
import { editFields } from '../src/app/editFields';
import { evaluateDoc } from '../src/engine/evaluate';
const ctx: Ctx = { doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } };
function pair(wheel: 'throated' | 'cylindrical') {
  const command = commands.find(c => c.id === 'worm-pair')!;
  return command.build!(ctx, { ...command.defaults!(ctx), wheel, x: 0, y: 0, z: 0 });
}
function form(nodes: readonly ModelNode[]) {
  const field = editFields(nodes, 1).find(f => f.key === 'form'); assert.ok(field?.kind === 'choice'); return field;
}

test('throated history offers required ZA only; cylindrical history retains ZI and ZA', () => {
  const throat = pair('throated'), normal = pair('cylindrical');
  const snapshot = structuredClone(throat);
  assert.deepEqual(form(throat.nodes).options.map(o => o.value), ['ZA']);
  assert.match(form(throat.nodes).options[0].label, /required.*throated|throated.*required/i);
  assert.deepEqual(form(normal.nodes).options.map(o => o.value), ['ZI', 'ZA']);
  assert.deepEqual(form(throat.nodes).set(throat.nodes, 'ZI'), throat.nodes);
  assert.equal(form(normal.nodes).get(form(normal.nodes).set(normal.nodes, 'ZA')), 'ZA');
  assert.deepEqual(throat, snapshot);
});

test('a captured form setter reads the current worm parent rather than its original options', () => {
  const normal = pair('cylindrical'), throat = pair('throated');
  const old = form(normal.nodes), restricted = form(throat.nodes);
  assert.deepEqual(old.set(throat.nodes, 'ZI'), throat.nodes);
  assert.equal(restricted.get(restricted.set(normal.nodes, 'ZI')), 'ZI');
  const worm = throat.nodes[1]; assert.ok(worm.kind === 'worm');
  const moved: ModelNode[] = [normal.nodes[0], { ...worm, mesh: { gear: 2 } }, throat.nodes[0]];
  assert.deepEqual(old.set(moved, 'ZI'), moved, 'latest mesh.gear also determines the restriction');
  assert.equal(old.get(old.set([{ ...throat.nodes[0] }, { ...worm, mesh: { gear: 2 } }, normal.nodes[0]], 'ZI')), 'ZI');
});

test('missing parents and legacy incompatible forms are not silently rewritten; numeric edits preserve form', () => {
  const doc = pair('throated'), worm = doc.nodes[1]; assert.ok(worm.kind === 'worm');
  const legacy: ModelNode[] = [doc.nodes[0], { ...worm, form: 'ZI' }], snapshot = structuredClone(legacy);
  assert.equal(form(legacy).get(legacy), 'ZI'); assert.deepEqual(legacy, snapshot);
  assert.deepEqual(form(legacy).set(legacy, 'ZI'), legacy);
  assert.equal(form(legacy).get(form(legacy).set(legacy, 'ZA')), 'ZA', 'an explicit repair remains possible');
  const missing: ModelNode[] = [doc.nodes[0], { ...worm, mesh: { gear: 99 }, form: 'ZI' }];
  assert.deepEqual(form(missing).options.map(o => o.value), ['ZI', 'ZA']); assert.equal(form(missing).get(missing), 'ZI');
  for (const nodes of [doc.nodes, legacy, missing]) {
    const length = editFields(nodes, 1).find(f => f.key === 'L'); assert.ok(length?.kind === 'number');
    const changed = length.set(nodes, 80);
    assert.deepEqual(changed[1], { ...nodes[1], length: 80 }); assert.equal(changed[0], nodes[0]);
  }
  assert.deepEqual(legacy, snapshot);
});

test('the native evaluator still refuses a legacy throated ZI pairing rather than converting it', () => {
  const doc = pair('throated'), worm = doc.nodes[1]; assert.ok(worm.kind === 'worm');
  const nodes: ModelNode[] = [doc.nodes[0], { ...worm, form: 'ZI' }], snapshot = structuredClone(nodes);
  const result = evaluateDoc({ ...doc, nodes }, 1); assert.equal(result.ok, false);
  if (!result.ok) assert.match(JSON.stringify(result.error), /MATE_INCOMPATIBLE|throated wheel meshes with the ZA worm/);
  assert.deepEqual(nodes, snapshot);
});
