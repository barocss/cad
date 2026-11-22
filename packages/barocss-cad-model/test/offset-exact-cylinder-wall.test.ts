import test from 'node:test';
import assert from 'node:assert/strict';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import type { Ctx } from '../src/app/commands';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { runCheck } from '../src/chat/spec';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

const outer = 'n0.normal', inner = 'n0.reverse';
const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
const sourceDoc = (reverseV = false): StudioDoc => withNode(emptyDoc(), {
  kind: 'thicken', name: 'Semicylinder', mode: 'exact-cylinder', thickness: 2, side: 'reverse',
  surface: {
    degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
    controlPoints: profile.map(([x, y]) => [[x, y, reverseV ? 12 : 0], [x, y, reverseV ? 0 : 12]]),
    weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
  },
});
const evaluate = async (doc: StudioDoc) => evaluateDoc(doc, 1);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

function context(doc: StudioDoc, name = outer): Ctx {
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok, result.ok ? '' : result.error.detail);
  const face = result.bodies[0].mesh.faces.findIndex(item => item.name === name);
  assert.ok(face >= 0, name);
  return { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face }], edges: [], bodies: [] } };
}

function measure(doc: StudioDoc, outside: number, inside: number, wall = outer) {
  const [{ brep }] = partBreps(doc);
  const report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.deepEqual([...new Set(brep.vertices.map(({ point }) => point[2]))].sort((a, b) => a - b), [0, 12]);
  for (const [name, radius, out] of [[wall, outside, 1], [wall === outer ? inner : outer, inside, -1]] as const) {
    const support = faceGeometry(brep.faces.find(face => face.name === name)!);
    assert.equal(support.kind, 'cylinder');
    assert.deepEqual([support.out, support.a], [out, [0, 0, 1]]);
    near(support.c[0], 20);
    near(support.c[1], 20);
    near(support.r, radius);
  }
  near(brepMassProperties(brep, 1).volume, 6 * Math.PI * (outside ** 2 - inside ** 2));
  return brep;
}

for (const [role, wall, sign, radius] of [['outer', outer, 1, 10], ['inner', inner, -1, 8]] as const) {
  test(`the original ${role} semicylinder wall supports signed Offset through Studio commands and native Open`, async () => {
    const source = sourceDoc(), ctx = context(source, wall);
    assert.equal(offsetFaceCommand.available(ctx).ok, true);
    assert.deepEqual(offsetFaceCommand.fields!(ctx).map(field => field.key), ['d']);
    const [handle] = offsetFaceCommand.handles!(ctx, { d: 2 });
    handle.dir.forEach((value, axis) => near(value, axis === 1 ? sign : 0));
    assert.deepEqual(handle.at, [20, 20 + radius, 6]);

    const expanded = offsetFaceCommand.build!(ctx, { d: 2 }), saved = expanded.nodes[1];
    assert.ok(saved.kind === 'offset-face');
    assert.deepEqual([saved.parent, saved.faces, saved.distance, saved.target], [{ node: 0, side: 'solid' }, [wall], 2, undefined]);
    assert.equal(saved.sigs?.[wall]?.k, 'curved');
    assert.deepEqual(expanded.nodes[0], source.nodes[0]);
    const positive: [number, number] = role === 'outer' ? [12, 8] : [10, 6];
    const negative: [number, number] = role === 'outer' ? [9, 8] : [10, 9];
    measure(expanded, ...positive);

    const agent = await dispatchTool({ doc: source, bodies: ctx.bodies }, 'features',
      { action: 'command', command: 'offset-face', faces: [wall], values: { d: 2 }, expectedRevision: revisionOf(source) }, evaluate);
    assert.ok(agent.changed && !agent.isError, agent.content);
    assert.deepEqual(agent.state.doc, expanded);

    const edit = editSavedOffsetFaceCommand(expanded, 1), after = context(expanded, wall);
    assert.ok(edit?.build);
    assert.deepEqual(edit.fields!(after).map(field => field.key), ['d']);
    assert.throws(() => edit.build!(after, { offsetMode: 'to-plane' }), /signed distance/);
    const reduced = edit.build(after, { d: -1 });
    assert.deepEqual(reduced.nodes[1], { ...saved, distance: -1 });
    const expected = measure(reduced, ...negative);
    const opened = await readStudioFile(encodeStudioFile(reduced));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, reduced);
    assert.deepEqual(measure(opened.doc, ...negative), expected);
    const checkWall = async (doc: StudioDoc, value: number) => {
      const wall = await runCheck(doc, context(doc).bodies, evaluate, {
        query: { fn: 'radial_wall', a: outer, b: inner }, op: '==', value, tol: 0.01, unit: 'mm',
      });
      assert.equal(wall.status, 'pass');
      assert.deepEqual(wall.entities, [outer, inner]);
      assert.ok(typeof wall.measured === 'number');
      near(wall.measured, value);
    };
    await checkWall(expanded, 4);
    await checkWall(opened.doc, 1);
    assert.equal(offsetFaceCommand.available(after).ok, false);
    const contacts = role === 'outer' ? /inner (?:skin|wall)/i : /outer (?:skin|wall)/i;
    for (const distance of [-2, -2.1, -2 + 1e-8]) {
      const refused = await evaluate(edit.build(after, { d: distance }));
      assert.ok(!refused.ok);
      assert.match(refused.error.detail, contacts);
    }

    if (role === 'inner') {
      for (const distance of [8, 8.1, 8 - 1e-8]) {
        const refused = await evaluate(edit.build(after, { d: distance }));
        assert.ok(!refused.ok);
        assert.match(refused.error.detail, /axis/i);
      }
    }
    const reverseCtx = context(sourceDoc(true), role === 'outer' ? inner : outer);
    assert.equal(offsetFaceCommand.available(reverseCtx).ok, true);
    const reverseRadii: [number, number] = role === 'outer' ? [12.1, 10] : [12, 9.9];
    measure(offsetFaceCommand.build!(reverseCtx, { d: 0.1 }), ...reverseRadii, inner);
  });
}
