import assert from 'node:assert/strict';
import test from 'node:test';
import { commands, type Ctx } from '../src/app/commands';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, placeBody } from '../src/engine/evaluate';

function quarterSector() {
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
  return { doc, bodies: result.bodies };
}

test('Single circular Constant Fillet uses the native arc midpoint and local radius direction', () => {
  const { doc, bodies } = quarterSector();
  const [body] = bodies;
  const edge = body.mesh.edges.findIndex(edge => edge.names[0] === 'n1.side1|n1.top');
  assert.ok(edge >= 0);
  const ctx: Ctx = { doc, bodies, selection: { bodies: [], faces: [], edges: [{ body: 0, edge }] } };
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

test('two picked circular rims create one Constant Fillet handle on the native upper arc in either order', () => {
  const { doc, bodies } = quarterSector();
  const mesh = bodies[0].mesh;
  const upper = mesh.edges.find(edge => edge.names.includes('n1.side1|n1.top'));
  const lower = mesh.edges.find(edge => edge.names.includes('n1.bottom|n1.side1'));
  assert.ok(upper?.nativeFilletRim?.quarter && lower?.nativeFilletRim?.quarter);
  const fillet = commands.find(command => command.id === 'fillet')!;
  const chamfer = commands.find(command => command.id === 'chamfer')!;
  const expected = [8 * Math.SQRT1_2 + .3, 8 * Math.SQRT1_2 + .3, 10 + .6 * Math.SQRT1_2];
  for (const picked of [[lower, upper], [upper, lower]]) {
    const ctx: Ctx = { doc, bodies, selection: { bodies: [], faces: [], edges: picked.map(edge => ({ body: 0, edge: edge.index })) } };
    const values = { ...fillet.defaults!(ctx), radius: .6 };
    const result = fillet.handles!(ctx, values);
    assert.equal(result.length, 1);
    assert.ok(Math.hypot(...result[0].at.map((point, i) => point - expected[i])) < 1e-12);
    assert.ok(Math.hypot(...result[0].dir.map((point, i) => point - [.5, .5, Math.SQRT1_2][i])) < 1e-12);
    assert.notDeepEqual(fillet.handles!(ctx, { ...values, endRadius: 1.2 })[0].at, result[0].at);
    assert.notDeepEqual(chamfer.handles!(ctx, { distance: .6 })[0].at, result[0].at);
    const unmatched = mesh.edges.map(edge => edge.index === lower.index ? { ...edge, nativeFilletRim: undefined } : edge);
    const changed = { ...ctx, bodies: [{ ...bodies[0], mesh: { ...mesh, edges: unmatched } }] };
    assert.notDeepEqual(fillet.handles!(changed, values)[0].at, result[0].at);
  }
});
