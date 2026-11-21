import assert from 'node:assert/strict';
import test from 'node:test';
import { commands, type Ctx } from '../src/app/commands';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, placeBody } from '../src/engine/evaluate';

test('Single circular Constant Fillet uses the native arc midpoint and local radius direction', () => {
  const seed = rectanglePart(8, 8, 10);
  const doc: StudioDoc = { ...seed, nodes: [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [0, 0] },
      { kind: 'arc', start: [8, 0], center: [0, 0], direction: 'ccw' },
      { kind: 'line', start: [0, 8] },
    ] },
    seed.nodes[1],
  ] };
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok);
  const [body] = result.bodies;
  const edge = body.mesh.edges.findIndex(edge => edge.names[0] === 'n1.side1|n1.top');
  assert.ok(edge >= 0);
  const ctx: Ctx = { doc, bodies: result.bodies, selection: { bodies: [], faces: [], edges: [{ body: 0, edge }] } };
  const fillet = commands.find(command => command.id === 'fillet')!;
  const chamfer = commands.find(command => command.id === 'chamfer')!;
  const values = { ...fillet.defaults!(ctx), radius: .6 };
  const [handle] = fillet.handles!(ctx, values);
  const expected = [8 * Math.SQRT1_2 + .3, 8 * Math.SQRT1_2 + .3, 10 + .6 * Math.SQRT1_2];
  const near = (a: number[], b: number[]) => assert.ok(Math.hypot(...a.map((value, i) => value - b[i])) < 1e-12);
  near(handle.at, expected);
  near(handle.dir, [.5, .5, Math.SQRT1_2]);
  const chordAnchor = [4.3, 4.3, 10 + .6 * Math.SQRT1_2];
  near(fillet.handles!(ctx, { ...values, endRadius: 1.2 })[0].at, chordAnchor);
  near(fillet.handles!(ctx, { ...values, shape: 'conic' })[0].at, chordAnchor);
  near(chamfer.handles!(ctx, { distance: .6 })[0].at, chordAnchor);
  assert.equal(placeBody(body, [1, 0, 0, 0, 1, 0, 0, 0, 1], [5, 0, 0]).mesh.edges[edge].nativeFilletRim, undefined);
});
