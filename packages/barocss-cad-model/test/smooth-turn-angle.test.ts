import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCurve } from '@barocss/cad';
import { commandById, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { smoothTurnAngleKey } from '../src/app/smoothLoftTurn';
import { emptyDoc, withNode, type LoopSegment, type StudioDoc } from '../src/engine/doc';
import { partBreps } from '../src/engine/evaluate';

const source = withNode(emptyDoc(), {
  kind: 'sketch', profile: 'rectangle', min: [1, 2], max: [13, 10],
  plane: { origin: [11, -17, 23], normal: [0, 0.6, 0.8], xAxis: [1, 0, 0] },
});
const context: Ctx = { doc: source, bodies: [], selection: { faces: [], edges: [], bodies: [], sketches: [0] } };
const create = (angle: number) => commandById('smooth-turn')!.build!(context, { angle, height: 70 });
const field = (doc: StudioDoc, index = doc.nodes.length - 1) =>
  editFields(doc.nodes, index, doc.parameters).find(field => field.key === smoothTurnAngleKey);

test('an existing Smooth Turn changes signed winding without changing its station count or native identities', () => {
  for (const [beforeAngle, afterAngle] of [[360, -360], [-450, 360], [450, 0], [72, 180]]) {
    const original = create(beforeAngle), angle = field(original);
    assert.ok(angle?.kind === 'number');
    assert.equal(angle.get(original.nodes), beforeAngle);
    assert.equal('bind' in angle, false);
    assert.deepEqual(angle.set(original.nodes, beforeAngle), original.nodes);
    const limit = Math.max(6, Math.ceil(Math.abs(beforeAngle) / 30)) * 30;
    for (const invalid of [limit + 1, -limit - 1, Infinity, NaN])
      assert.deepEqual(angle.set(original.nodes, invalid), original.nodes);

    const next = { ...original, nodes: angle.set(original.nodes, afterAngle) };
    assert.equal(angle.get(next.nodes), afterAngle);
    assert.equal(next.nodes[0], original.nodes[0]);
    assert.equal(next.nodes[1], original.nodes[1]);
    assert.equal(next.nodes.at(-1), original.nodes.at(-1));
    assert.deepEqual(next.nodes.map(node => node.id), original.nodes.map(node => node.id));
    const [before] = partBreps(original), [after] = partBreps(next);
    assert.equal(after.key, before.key);
    assert.equal(checkBrep(after.brep, { strict: true }).valid, true);
    assert.deepEqual(after.brep.faces.map(face => face.name), before.brep.faces.map(face => face.name));
    assert.deepEqual(after.brep.edges.map(edge => edge.name), before.brep.edges.map(edge => edge.name));
    assert.deepEqual([after.brep.faces.length, after.brep.edges.length], [6, 12]);
    if (afterAngle === 0) assert.ok(Math.abs(brepMassProperties(after.brep, 1).volume - 6720) < 1e-7);

    const first = after.brep.edges.find(edge => edge.id === 'c0')!;
    for (let station = 0; station <= limit / 30; station++) {
      const t = station / (limit / 30), radians = afterAngle * Math.PI / 180 * t;
      const c = Math.cos(radians), s = Math.sin(radians);
      const x = 7 - 6 * c + 4 * s, y = 6 - 6 * s - 4 * c, z = 70 * t;
      const expected = [11 + x, -17 + 0.8 * y + 0.6 * z, 23 - 0.6 * y + 0.8 * z];
      const actual = evaluateCurve(first.curve, t);
      assert.ok(Math.hypot(...actual.map((value, i) => value - expected[i])) < 1e-8);
    }
  }
});

test('only an intact terminal Smooth Turn owns the regenerated section copies', () => {
  const doc = create(450);
  assert.equal(field(doc)?.kind, 'number');
  const resizedSource: StudioDoc = { ...doc, nodes: doc.nodes.map((node, i) =>
    i === 0 && node.kind === 'sketch' && node.profile === 'rectangle' ? { ...node, max: [14, 10] } : node) };
  assert.ok(field(resizedSource));

  const changed: StudioDoc = { ...doc, nodes: doc.nodes.map((node, i) =>
    i === 2 && node.kind === 'sketch' && node.profile === 'loop' ? {
      ...node, segments: node.segments.map((segment, k): LoopSegment =>
        k === 1 ? { ...segment, start: [Number(segment.start[0]) + 0.001, segment.start[1]] } : segment),
    } : node) };
  assert.equal(field(changed), undefined);
  const ruled = commandById('ruled-turn')!.build!(context, { angle: 450, height: 70 });
  assert.equal(field(ruled), undefined);
  assert.equal(field(withNode(doc, { kind: 'sketch', profile: 'circle', center: [30, 0], radius: 3 }), doc.nodes.length - 1), undefined);
});
