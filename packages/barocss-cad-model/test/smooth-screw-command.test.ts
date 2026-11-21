import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCurve } from '@barocss/cad';
import { commandById, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

const command = commandById('smooth-screw')!;
const source = withNode(emptyDoc(), {
  kind: 'sketch', profile: 'rectangle', min: [14, -4], max: [26, 4],
  plane: { origin: [11, -17, 23], normal: [0, .6, .8], xAxis: [1, 0, 0] },
});
const ctx: Ctx = { doc: source, bodies: [], selection: { faces: [], edges: [], bodies: [], sketches: [0] } };
const input = { axisX: 2, axisY: -1, pitch: 80, angle: -180 };

test('Smooth Screw keeps its external axis, signed pitch and display through native Open', async () => {
  for (const angle of [180, -180]) {
    const doc = command.build!(ctx, { ...input, angle });
    assert.equal(doc.nodes[0], source.nodes[0]);
    const index = doc.nodes.length - 1, loft = doc.nodes[index];
    assert.ok(loft.kind === 'loft' && loft.smooth);
    assert.deepEqual(loft.from, [0]);
    assert.deepEqual(loft.sections.map(s => s.z), Array.from({ length: 7 }, (_, i) => 40 * (i / 6)));
    assert.deepEqual(editFields(doc.nodes, index, doc.parameters).map(field => field.label), ['Total height']);
    const [{ brep }] = partBreps(doc);
    assert.ok(checkBrep(brep, { strict: true }).valid);
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 840.4060323005599 * 96 / 21) < 1e-7);
    const rails = brep.edges.filter(edge => /^c[0-3]$/.test(edge.id));
    assert.equal(rails.length, 4);
    for (const [i, { curve }] of rails.entries()) {
      const [x, y] = [[12, -3], [24, -3], [24, 5], [12, 5]][i];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6, a = angle * Math.PI / 180 * t;
        const u = Math.cos(a) * x - Math.sin(a) * y, v = Math.sin(a) * x + Math.cos(a) * y;
        const want = [13 + u, -17 + .8 * (v - 1) + 24 * t, 23 - .6 * (v - 1) + 32 * t];
        assert.ok(Math.hypot(...evaluateCurve(curve, t).map((value, k) => value - want[k])) < 1e-8);
      }
    }
    const displayed = evaluateDoc(doc, 2, 8, true);
    assert.ok(displayed.ok);
    const detail = displayed.bodies[0].mesh.loftDetail;
    assert.ok(detail && 'kind' in detail && detail.kind === 'smooth-turn');
    const reopened = await readStudioFile(encodeStudioFile(doc));
    assert.ok('doc' in reopened);
    assert.deepEqual(reopened.doc, doc);
    assert.deepEqual(partBreps(reopened.doc)[0].brep, brep);
  }
});

test('Smooth Screw rejects nonexterior axes, malformed values and ambiguous source selection', () => {
  for (const values of [
    { axisX: 14, axisY: 0 }, { axisX: 20, axisY: 0 }, { axisX: NaN }, { pitch: 0 }, { pitch: -80 },
    { angle: 0 }, { angle: Infinity }, { angle: 451 }, { pitch: 10000, angle: 450 }, { angle: 1e-8 },
  ]) assert.throws(() => command.build!(ctx, { ...input, ...values }));
  assert.equal(command.available({ ...ctx, selection: { ...ctx.selection, sketches: [0, 0] } }).ok, false);
});

test('Agent Smooth Screw uses an explicit current sketch and revision', async () => {
  const state = { doc: source, bodies: [] };
  const args = { action: 'command', command: 'smooth-screw', values: { ...input, sketch: source.nodes[0].id } };
  const revision = revisionOf(source);
  for (const request of [args, { ...args, expectedRevision: '0'.repeat(16) },
    { ...args, expectedRevision: revision, values: { ...args.values, sketch: 'unknown' } }]) {
    const rejected = await dispatchTool(state, 'features', request, () => assert.fail('Rejected commands must not evaluate.'));
    assert.ok(rejected.isError && !rejected.changed, rejected.content);
    assert.equal(rejected.state, state);
  }
  const accepted = await dispatchTool(state, 'features', { ...args, expectedRevision: revision }, async doc => evaluateDoc(doc, 1));
  assert.ok(accepted.changed && !accepted.isError, accepted.content);
  assert.deepEqual(accepted.state.doc, command.build!(ctx, input));
});
