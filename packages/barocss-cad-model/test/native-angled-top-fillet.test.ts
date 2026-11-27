import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, faceGeometry, type CadPartOutput } from '@barocss/cad';
import { emptyDoc, withNode, type ModelNode, type SketchNode } from '../src/engine/doc';
import { evaluateDoc, snapshotOf } from '../src/engine/evaluate';
import { captureSignatures } from '../src/engine/references';
import { angledTopFilletSource, nativeAngledTopFilletOf } from '../src/engine/nativeAngledTopFillet';

type Mutable<T> = T extends ArrayBufferView ? T : { -readonly [K in keyof T]: Mutable<T[K]> };
const plane = { origin: [4, 3, 0] as [number, number, number], normal: [0, 0, 1] as [number, number, number], xAxis: [.6, .8, 0] as [number, number, number] };
const sketch: SketchNode = { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [12, 8], plane };
const close = (a: number, b: number, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function fixture(radius = 1, shape = sketch) {
  const base = withNode(withNode(emptyDoc(), shape), { kind: 'extrude', sketch: 0, height: 8 });
  const stock = evaluateDoc(base, 1); assert.ok(stock.ok);
  const doc = captureSignatures(withNode(base, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side0|n1.top'], radius }), stock.bodies);
  const source = angledTopFilletSource(doc.nodes, 2); assert.ok(source);
  return { doc, source, output: snapshotOf(doc).outputs[0] };
}

for (const radius of [1, 2]) {
  test(`angled XY top-rim R${radius} has one exact quarter-cylinder and the independent single-edge volume`, () => {
    const { doc, source, output } = fixture(radius), saved = structuredClone(output);
    const proof = nativeAngledTopFilletOf(output, source); assert.ok(proof);
    assert.equal(proof.edge, 'n1.side0|n1.top');
    assert.equal(output.brep.faces.find(face => face.id === proof.faceId)?.name, 'n2.face');
    close(proof.radius, radius);
    source.axis.forEach((value, i) => close(Math.abs(proof.axis[i]), value));
    [4 - .8 * radius, 3 + .6 * radius, 8 - radius].forEach((value, i) => close(proof.centre[i], value));
    assert.deepEqual(source.outward, [.8, -.6, 0]);
    assert.ok(checkBrep(output.brep, { strict: true }).valid);
    close(brepMassProperties(output.brep, 1).volume, 768 - 12 * (1 - Math.PI / 4) * radius ** 2);
    const reordered = structuredClone(output) as Mutable<CadPartOutput>;
    reordered.brep.faces.reverse(); reordered.brep.loops.reverse(); reordered.brep.coedges.reverse(); reordered.brep.edges.reverse();
    assert.deepEqual(nativeAngledTopFilletOf(reordered, source), proof);
    assert.deepEqual(output, saved);
    assert.deepEqual(doc.nodes[0], { ...sketch, id: 'n0' });
  });
}

test('shifted local rectangle and another positive XY angle retain world-frame support and volume', () => {
  const shape: SketchNode = { kind: 'sketch', profile: 'rectangle', min: [-2, 1], max: [10, 9],
    plane: { origin: [-3, 5, 2], normal: [0, 0, 1], xAxis: [.8, .6, 0] } };
  const { output, source } = fixture(1, shape), proof = nativeAngledTopFilletOf(output, source);
  assert.ok(proof);
  [-5.2, 4.6, 10].forEach((value, i) => close(source.a[i], value));
  [-5.8, 5.4, 9].forEach((value, i) => close(proof.centre[i], value));
  close(brepMassProperties(output.brep, 1).volume, 768 - 12 * (1 - Math.PI / 4));
});

test('authored eligibility rejects broader planes, edges, feature variants and disappearing-wall limits', () => {
  const { doc } = fixture();
  const reject = (index: number, patch: object) => {
    const nodes = doc.nodes.map((node, at) => at === index ? { ...node, ...patch } as ModelNode : node);
    assert.equal(angledTopFilletSource(nodes, 2), undefined);
  };
  for (const patch of [{ plane: undefined }, { construction: [] }, { profile: 'polygon' },
    { plane: { ...plane, normal: [0, 0, -1] } }, { plane: { ...plane, xAxis: [1, 0, 0] } },
    { plane: { ...plane, xAxis: [-.6, .8, 0] } }, { plane: { ...plane, xAxis: [.6, .8, .1] } },
    { plane: { ...plane, xAxis: [.3, .4, 0] } }, { plane: { ...plane, origin: [Infinity, 0, 0] } },
    { min: [12, 0], max: [0, 8] }, { min: [0, 0], max: [12, 0] }]) reject(0, patch);
  for (const patch of [{ draft: 1 }, { suppressed: true }, { from: 'mid' }, { sketch: 1 }, { height: -8 }]) reject(1, patch);
  for (const patch of [{ edges: ['n1.side1|n1.top'] }, { edges: ['n1.side0|n1.top', 'n1.side2|n1.top'] },
    { radii: [] }, { section: { kind: 'g2', tension: .5 } }, { suppressed: true }, { held: 'held' },
    { parent: { node: 0, side: 'solid' } }, { radius: { parameter: 'R' } }, { radius: 0 }, { radius: 4 }, { radius: Infinity }]) reject(2, patch);
  assert.equal(angledTopFilletSource(doc.nodes, 1), undefined);
  assert.equal(angledTopFilletSource([...doc.nodes, doc.nodes[2]], 2), undefined);
});

test('native proof rejects borrowed targets, source identity, open shells and changed native supports', () => {
  const { output, source } = fixture(), saved = structuredClone(output);
  const reject = (edit: (copy: Mutable<CadPartOutput>) => void) => {
    const copy = structuredClone(output) as Mutable<CadPartOutput>; edit(copy);
    assert.equal(nativeAngledTopFilletOf(copy, source), undefined);
  };
  reject(copy => { copy.feature = 'other'; });
  reject(copy => { copy.filletTargets = ['n1.side1|n1.top']; });
  reject(copy => { copy.brep.source.id = 'old'; });
  reject(copy => { copy.brep.source.family = 'step-import'; });
  reject(copy => { copy.brep.shells[0].closed = false; });
  reject(copy => { copy.brep.faces.find(face => face.name === 'n1.side0')!.name = 'other.side0'; });
  reject(copy => {
    const surface = copy.brep.faces.find(face => face.name === 'n1.side2')!.surface;
    assert.equal(surface.kind, 'surface'); if (surface.kind === 'surface') surface.controlPoints[0][0][0] += .01;
  });
  assert.deepEqual(output, saved);
});

test('quarter-net and every trim require original poles, weights, knots and reciprocal owners', () => {
  const { output, source } = fixture();
  for (const change of ['pole', 'weight', 'knot', 'trim-pole', 'trim-weight', 'trim-knot', 'twin', 'neighbor', 'endpoint'] as const) {
    const copy = structuredClone(output) as Mutable<CadPartOutput>;
    const face = copy.brep.faces.find(face => face.name === 'n2.face')!, surface = face.surface;
    assert.equal(surface.kind, 'surface'); if (surface.kind !== 'surface') throw Error('Expected surface');
    const loop = copy.brep.loops.find(loop => loop.id === face.loops[0])!;
    const use = copy.brep.coedges.find(use => use.id === loop.coedges[0])!;
    const edge = copy.brep.edges.find(edge => edge.id === use.edge)!;
    if (change === 'pole') {
      surface.controlPoints[1][1][2] += 1e-9;
      assert.equal(faceGeometry(face).kind, 'cylinder', 'broad cylinder recognition alone does not certify its net');
    }
    if (change === 'weight') surface.weights[1][1] += 1e-9;
    if (change === 'knot') surface.knotsU[2] = 1e-9;
    if (change === 'trim-pole') edge.curve.controlPoints[1][0] += 1e-9;
    if (change === 'trim-weight') edge.curve.weights[1] += 1e-9;
    if (change === 'trim-knot') edge.curve.knots[2] = 1e-9;
    if (change === 'twin') use.twin = copy.brep.coedges.find(other => other.edge !== use.edge)!.id;
    if (change === 'neighbor') {
      const twin = copy.brep.coedges.find(other => other.id === use.twin)!;
      twin.loop = loop.id;
    }
    if (change === 'endpoint') edge.vertices[0] = copy.brep.vertices.find(vertex => !edge.vertices.includes(vertex.id))!.id;
    assert.equal(nativeAngledTopFilletOf(copy, source), undefined, change);
  }
});


test('each of the four native trims independently rejects a changed control pole', () => {
  const { output, source } = fixture();
  for (let index = 0; index < 4; index++) {
    const copy = structuredClone(output) as Mutable<CadPartOutput>;
    const face = copy.brep.faces.find(face => face.name === 'n2.face')!;
    const loop = copy.brep.loops.find(loop => loop.id === face.loops[0])!;
    const use = copy.brep.coedges.find(use => use.id === loop.coedges[index])!;
    copy.brep.edges.find(edge => edge.id === use.edge)!.curve.controlPoints[0][0] += 1e-9;
    assert.equal(nativeAngledTopFilletOf(copy, source), undefined, `trim ${index}`);
  }
});
