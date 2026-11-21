import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve } from '@barocss/cad';
import { commandById, type Ctx } from '../src/app/commands';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { partBreps } from '../src/engine/evaluate';

const command = commandById('ruled-turn')!;
const build = command.build!;
type Point = [number, number, number];
const doc = withNode({ ...emptyDoc(), parameters: { length: 13 } }, {
  kind: 'sketch', profile: 'rectangle', min: [1, 2], max: [{ parameter: 'length' }, 10],
  plane: { origin: [11, -17, 23], normal: [0, 0.6, 0.8], xAxis: [1, 0, 0] },
});
const context = (source: StudioDoc = doc, sketches = [0]): Ctx =>
  ({ doc: source, bodies: [], selection: { faces: [], edges: [], bodies: [], sketches } });
const near = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, index) => value - b[index])) < 1e-8;
const cornerOffsets = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
function cornerAt([x, y]: number[], turns: number, z: number): Point {
  const [u, v] = [[x, y], [-y, x], [-x, -y], [y, -x]][(turns % 4 + 4) % 4];
  return [18 + u, -17 + (6 + v) * 0.8 + z * 0.6, 23 - (6 + v) * 0.6 + z * 0.8];
}

test('Ruled Turn preserves the sign and every intermediate station through a native file', async () => {
  const sourceJSON = JSON.stringify(doc);
  for (const [angle, height] of [[-360, 40], [360, 40], [450, 50]]) {
    const turns = angle / 90, count = Math.abs(turns);
    const accepted = build(context(), { height, angle });
    assert.equal(JSON.stringify(doc), sourceJSON);
    assert.equal(accepted.nodes[0], doc.nodes[0]);
    const node = accepted.nodes.at(-1)!;
    assert.equal(node.kind, 'loft');
    if (node.kind !== 'loft') throw new Error('Expected a native Loft feature');
    assert.deepEqual(node.from, [0]);
    assert.equal(node.sections.length, count + 1);
    assert.equal(node.guide?.kind, 'nurbs');
    const guide = node.guide;
    if (guide?.kind !== 'nurbs') throw new Error('Expected a copied corner guide');
    for (let index = 0; index <= count; index++) {
      assert.ok(near(guide.controlPoints[index], cornerAt(cornerOffsets[0], index * Math.sign(turns), index * 10)));
    }
    const result = await readStudioFile(encodeStudioFile(accepted));
    assert.ok('doc' in result, JSON.stringify(result));
    const reopened = result.doc;
    assert.deepEqual(reopened, accepted);
    const [{ brep }] = partBreps(reopened);
    assert.equal(checkBrep(brep, { strict: true }).valid, true);
    assert.equal(brep.bodies.length, 1);
    assert.equal(brep.bodies[0].kind, 'solid');
    assert.equal(brep.faces.length, 4 * count + 2);
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - (96 * height * 2) / 3) < 1e-7);
    const rulings = brep.edges.map(edge => {
      const [start, end] = curveDomain(edge.curve);
      return [start, (start + end) / 2, end].map(t => evaluateCurve(edge.curve, t));
    });
    for (const corner of cornerOffsets) for (let index = 0; index < count; index++) {
      const a = cornerAt(corner, index * Math.sign(turns), index * 10);
      const b = cornerAt(corner, (index + 1) * Math.sign(turns), (index + 1) * 10);
      const midpoint = a.map((value, axis) => (value + b[axis]) / 2);
      assert.ok(rulings.some(([first, middle, last]) =>
        near(middle, midpoint) && ((near(first, a) && near(last, b)) || (near(first, b) && near(last, a)))));
    }
  }
});

test('Ruled Turn uses even spans for partial turns and admits the straight control', () => {
  for (const angle of [0, 90, 90.25, -311]) {
    const height = 53;
    const built = build(context(), { height, angle });
    const count = Math.max(1, Math.ceil(Math.abs(angle) / 90));
    const [{ brep }] = partBreps(built);
    assert.equal(checkBrep(brep, { strict: true }).valid, true);
    assert.equal(brep.faces.length, count * 4 + 2);
    const expected = (96 * height * (2 + Math.cos(angle * Math.PI / (count * 180)))) / 3;
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - expected) < 1e-7);
  }
});

test('Ruled Turn keeps legacy scaled frame directions and uses the native unit distances', () => {
  const input = withNode(emptyDoc(), {
    kind: 'sketch', profile: 'rectangle', min: [1, 2], max: [13, 10],
    plane: { origin: [11, -17, 23], normal: [0, 1.2, 1.6], xAxis: [3, 0, 0] },
  });
  const built = build(context(input), { height: 40, angle: 360 });
  assert.deepEqual(built.nodes[0], input.nodes[0]);
  const loft = built.nodes.at(-1);
  assert.ok(loft?.kind === 'loft' && loft.guide?.kind === 'nurbs');
  for (const [index, point] of loft.guide.controlPoints.entries())
    assert.ok(near(point, cornerAt(cornerOffsets[0], index, index * 10)));
  const [{ brep }] = partBreps(built);
  assert.equal(checkBrep(brep, { strict: true }).valid, true);
  assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 2560) < 1e-7);
});

test('Smooth Turn stores the signed station sequence in a native six-face Loft', async () => {
  const smooth = commandById('smooth-turn')!.build!;
  for (const [angle, count] of [[0, 7], [72, 7], [-311, 12], [360, 13], [-450, 16]]) {
    const accepted = smooth(context(), { height: 40, angle });
    const loft = accepted.nodes.at(-1);
    assert.ok(loft?.kind === 'loft' && loft.smooth);
    assert.equal(loft.guide, undefined);
    assert.equal(loft.sections.length, count);
    assert.deepEqual(loft.from, [0]);
    assert.equal(accepted.nodes[0], doc.nodes[0]);
    const result = await readStudioFile(encodeStudioFile(accepted));
    assert.ok('doc' in result);
    const [{ brep }] = partBreps(result.doc);
    assert.equal(checkBrep(brep, { strict: true }).valid, true);
    assert.deepEqual([brep.bodies.length, brep.faces.length, brep.edges.length], [1, 6, 12]);
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 3840) < 1);
  }
});

test('Ruled Turn refuses incomplete and out-of-range inputs without creating sections', () => {
  const original = JSON.stringify(doc);
  const ctx = context();
  assert.equal(command.available(ctx).ok, true);
  for (const picks of [[], [0, 0], [77]]) {
    assert.equal(command.available(context(doc, picks)).ok, false);
    assert.throws(() => build(context(doc, picks), { height: 40, angle: 360 }), /one standalone rectangular sketch/);
  }
  const circle = withNode(emptyDoc(), { kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2 });
  assert.equal(command.available(context(circle)).ok, false);
  for (const height of [0, -2, 10001, Infinity, '']) {
    assert.throws(() => build(ctx, { height, angle: 360 }), /Height above 0/);
  }
  for (const angle of [-450.1, 450.1, NaN, '']) {
    assert.throws(() => build(ctx, { height: 40, angle }), /Enter a Turn angle/);
  }
  assert.equal(JSON.stringify(doc), original);
});
