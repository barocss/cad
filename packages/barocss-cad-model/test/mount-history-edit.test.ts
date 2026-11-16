import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rectanglePart, type StudioDoc, type ModelNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import type { StudioMountRow } from '../src/engine/mountRows';
import { mountNodes } from '../src/app/mounts';
import { canEditSavedMount, mountHistoryEdit } from '../src/app/mountEdit';
import type { Ctx, Values } from '../src/app/commands';

const rows = JSON.parse(readFileSync(`${import.meta.dirname}/../samples/rows/mounts.json`, 'utf8')).rows as StudioMountRow[];
const recipe = (node: ModelNode) => node as Extract<ModelNode, { kind: 'hole' }>;
const empty = { bodies: [], edges: [], faces: [] };
const context = (doc: StudioDoc): Ctx => ({ doc, bodies: [], selection: empty });
function fixture(values: Values = {}, customRows = rows) {
  const base: StudioDoc = { ...rectanglePart(160, 100, 10), mounts: { version: 1, rows: customRows } };
  const result = evaluateDoc(base, 0); assert.ok(result.ok);
  const face = result.bodies[0].mesh.faces.find(face => face.name === 'n1.top')!;
  const ctx: Ctx = { doc: base, bodies: result.bodies, selection: { ...empty, faces: [{ body: 0, face: face.index }] } };
  return mountNodes(ctx, { row: customRows[0].id, x: 80, y: 50, turn: '0', pilot: 'through', ...values });
}
const command = (doc: StudioDoc) => { const cmd = mountHistoryEdit(doc, doc.nodes.length - 1); assert.ok(cmd); return cmd; };

test('saved Mount rebuilds terminal holes atomically and preserves output identity and catalogue', () => {
  const doc = fixture(), snapshot = JSON.stringify(doc), cmd = command(doc), ctx = context(doc), defaults = cmd.defaults!(ctx);
  assert.equal(cmd.id, 'edit'); assert.ok(canEditSavedMount(doc, doc.nodes.length - 1));
  assert.equal(canEditSavedMount(doc, 2), false);
  assert.equal(cmd.build!(ctx, defaults), doc);
  const next = cmd.build!(ctx, { ...defaults, x: 85, turn: '90', pilot: 'recess' });
  assert.equal(next.nodes.length, doc.nodes.length + 1);
  assert.equal(next.nodes.at(-1)!.id, doc.nodes.at(-1)!.id);
  assert.deepEqual(Object.keys(next.outputs), Object.keys(doc.outputs));
  assert.equal(next.mounts, doc.mounts);
  assert.equal(recipe(next.nodes.at(-1)!).made!.values.row, defaults.row);
  assert.ok(evaluateDoc(next, 1).ok);
  assert.equal(JSON.stringify(doc), snapshot);
  assert.throws(() => cmd.build!(context({ ...doc }), defaults), /current Mount/);
  assert.equal(cmd.available(context({ ...doc })).ok, false);
});

test('saved Mount handles servo recipes and explicit row changes without changing original row definitions', () => {
  const servo: StudioMountRow = { id: 'servo', type: 'servo', holes: { pattern: 'rect', spacing: [48, 10], diameter: 4.2 }, shaft: 6, shaftOffset: [10, 0], shaftHeight: 0, body: [40, 20], clearance: .5, estimate: true };
  const doc = fixture({}, [servo, ...rows]), ctx = context(doc), cmd = command(doc);
  assert.equal(cmd.build!(ctx, cmd.defaults!(ctx)), doc);
  const moved = cmd.build!(ctx, { ...cmd.defaults!(ctx), x: 90 });
  assert.ok(evaluateDoc(moved, 2).ok);
  const changed = cmd.build!(ctx, { ...cmd.defaults!(ctx), row: 'nema17' });
  assert.equal(recipe(changed.nodes.at(-1)!).made!.values.row, 'nema17');
  assert.equal(changed.nodes.at(-1)!.id, doc.nodes.at(-1)!.id);
  assert.equal(changed.mounts, doc.mounts);
  assert.ok(evaluateDoc(changed, 3).ok);
});

test('saved Mount fails closed for malformed groups, unavailable rows and changed stored recipes', () => {
  const doc = fixture();
  const copy = (): StudioDoc => JSON.parse(JSON.stringify(doc));
  for (const mutate of [
    (d: StudioDoc) => { recipe(d.nodes.at(-1)!).made!.nodes = 999; },
    (d: StudioDoc) => { d.nodes.at(-1)!.held = 'test'; },
    (d: StudioDoc) => { recipe(d.nodes[2]).made = { command: 'mount', values: {} }; },
    (d: StudioDoc) => { d.nodes[2].id = d.nodes[3].id; },
    (d: StudioDoc) => { d.mounts!.rows = []; },
    (d: StudioDoc) => { d.mounts!.rows.push(d.mounts!.rows[0]); },
  ]) { const bad = copy(); mutate(bad); assert.equal(mountHistoryEdit(bad, bad.nodes.length - 1), null); }
  const drift = copy(); drift.mounts!.rows[0].holes.diameter += .2;
  assert.throws(() => command(drift).build!(context(drift), command(drift).defaults!(context(drift))), /recipe changed/);
  const missing = copy(); recipe(missing.nodes.at(-1)!).made!.values.face = 'missing';
  const cmd = command(missing), ctx = context(missing);
  assert.doesNotThrow(() => cmd.steps!(ctx, cmd.defaults!(ctx)), 'steps never evaluate native source');
  assert.throws(() => cmd.build!(ctx, cmd.defaults!(ctx)), /face is missing/);
  const changed = copy(); const hole = changed.nodes[2]; assert.equal(hole.kind, 'hole'); if (hole.kind === 'hole') hole.radius = 2;
  assert.throws(() => command(changed).build!(context(changed), command(changed).defaults!(context(changed))), /recipe changed/);
});
