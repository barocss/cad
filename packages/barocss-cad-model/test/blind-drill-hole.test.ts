import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { part } from '../src/api';
import { commands, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { checkNode } from '../src/chat/features';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';
import { toPartDocument } from '../src/engine/part';

const tipHeight = 4 / Math.tan(59 * Math.PI / 180);
function fixture(height = 20) {
  const doc = part('Drill point').box({ w: 32, d: 24, h: height }).doc;
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok);
  const face = result.bodies[0].mesh.faces.findIndex(face => face.kind === 'plane' && face.normal[2] === 1);
  assert.ok(face >= 0);
  const ctx: Ctx = { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face }], edges: [], bodies: [] }, pick: [16, 12, height] };
  const command = commands.find(candidate => candidate.id === 'hole');
  assert.ok(command?.build && command.defaults);
  const values = { ...command.defaults(ctx), type: 'blind-drill', d: 8, drillDepth: 9 };
  return { doc, ctx, command, values, build: command.build };
}

test('the Hole command saves a distinct 118-degree point and edits only the cylindrical depth', async () => {
  const { doc, ctx, command, values, build } = fixture();
  const made = build(ctx, values), hole = made.nodes.at(-1);
  assert.ok(hole?.kind === 'blind-drill-hole');
  assert.deepEqual(made.nodes.slice(0, -1), doc.nodes);
  assert.deepEqual([hole.depth, hole.center, hole.radius, hole.parent], [9, [16, 12], 4, { node: 1, side: 'solid' }]);
  assert.equal(checkNode(hole, doc.nodes, doc.parameters), null);
  assert.ok(command.steps?.(ctx, values).some(step => step.label === 'Total depth' && step.text.includes('11.403 mm')));
  assert.doesNotThrow(() => command.steps?.(ctx, { ...values, d: '' }));
  const native = toPartDocument(made).features.at(-1);
  assert.ok(native?.kind === 'blind-drill-hole');
  assert.equal(native.face, hole.face);
  const [{ brep }] = partBreps(made);
  assert.ok(checkBrep(brep, { strict: true }).valid);
  assert.ok(Math.abs(brepMassProperties(brep, 1).volume - (15360 - Math.PI * 16 * (9 + tipHeight / 3))) < 1e-7);
  const opened = await readStudioFile(encodeStudioFile(made));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, made);
  const depth = editFields(opened.doc.nodes, 2, opened.doc.parameters).find(field => field.key === 'depth');
  assert.ok(depth?.kind === 'number');
  assert.equal(depth.label, 'Cylindrical depth');
  assert.deepEqual(depth.set(opened.doc.nodes, 8)[2], { ...hole, depth: 8 });
  assert.equal(editFields(opened.doc.nodes, 2).some(field => field.key === 'end'), false);
});

test('a point that reaches the stock bottom refuses while the legacy flat floor still fits', () => {
  const { doc, ctx, values, build } = fixture(11);
  const before = structuredClone(doc);
  const drill = build(ctx, values), flat = build(ctx, { ...values, type: 'blind', depth: 9 });
  const refused = evaluateDoc(drill, 2);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.error.detail, /would reach the bottom/);
  assert.deepEqual(doc, before);
  assert.equal(flat.nodes.at(-1)?.kind, 'hole');
  assert.ok(evaluateDoc(flat, 3).ok);
  assert.throws(() => build(ctx, { ...values, pat: 'row' }), /supports one hole/);
  const point = drill.nodes.at(-1);
  assert.ok(point?.kind === 'blind-drill-hole');
  const malformed = { ...drill, nodes: [...doc.nodes, { ...point, thread: 'M8' }] };
  assert.ok('error' in readStudioDoc(JSON.stringify(malformed)));
  assert.throws(() => toPartDocument(malformed), /unsupported field/);
});
