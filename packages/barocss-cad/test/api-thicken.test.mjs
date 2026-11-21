import test from 'node:test';
import assert from 'node:assert/strict';
import { part, param, thickenSpec, BarocssError, Location } from '../dist/api/index.js';
import { evaluateCadPart, checkBrep, outputOf, saveCadPart, loadCadPart } from '../dist/index.js';

// Independent plane S(u,v)=[20+5u,-11+5v,3], u in [-2,6], v in [1,7].
const plane = () => ({ degreeU: 1, degreeV: 1, knotsU: [-2, -2, 6, 6], knotsV: [1, 1, 7, 7], controlPoints: [[[10, -6, 3], [10, 24, 3]], [[50, -6, 3], [50, 24, 3]]], weights: [[1, 1], [1, 1]] });
const refused = (run, code, where = 'facade') => assert.throws(run, e => e instanceof BarocssError && e.code === code && e.where === where);
const namesOf = p => outputOf(evaluateCadPart(p.doc), 'thicken1').brep.faces.map(f => f.name).sort();
function plate(p, t, z0, z1) {
  const m = p.mass({ density: 1 });
  assert.ok(Math.abs(m.volume - 1200 * t) < 1e-6, `${m.volume}`);
  for (const [i, want] of [30, 9, (z0 + z1) / 2].entries()) assert.ok(Math.abs(m.centroid[i] - want) < 1e-7, `${m.centroid}`);
  const output = outputOf(evaluateCadPart(p.doc), 'thicken1'), brep = output.brep;
  assert.equal(checkBrep(brep).valid, true);
  assert.equal(brep.bodies.length, 1); assert.equal(brep.bodies[0].kind, 'solid');
  const points = brep.vertices.map(v => v.point);
  for (let k = 0; k < 3; k++) {
    assert.ok(Math.abs(Math.min(...points.map(p => p[k])) - [10, -6, z0][k]) < 1e-7);
    assert.ok(Math.abs(Math.max(...points.map(p => p[k])) - [50, 24, z1][k]) < 1e-7);
  }
  assert.deepEqual(namesOf(p), Array.from({ length: 73 }, (_, i) => `thicken1.facet${i}`).sort());
}

test('public thicken: three sides make one valid planar body with independent mass, bounds and native names', () => {
  for (const [side, z0, z1] of [['normal', 3, 5], ['reverse', 1, 3], ['both', 2, 4]]) {
    const source = part('plate'), before = source.doc, surface = plane(), options = { t: 2, side };
    const originalSurface = structuredClone(surface), originalOptions = structuredClone(options);
    const accepted = source.thicken(surface, options);
    assert.deepEqual(accepted.bodies(), ['thicken1']); plate(accepted, 2, z0, z1);
    const feature = accepted.doc.features[0];
    assert.equal(feature.kind, 'thicken'); assert.deepEqual(feature.surface, originalSurface);
    assert.equal(Object.hasOwn(feature, 'side'), side !== 'normal');
    assert.deepEqual(source.doc, before); assert.deepEqual(surface, originalSurface); assert.deepEqual(options, originalOptions);
    surface.controlPoints[0][0][0] = 900; surface.knotsU[0] = -9; surface.weights[0][0] = 7; options.t = 99;
    const copy = accepted.doc; copy.features[0].surface.controlPoints[0][0][0] = 800;
    assert.deepEqual(accepted.doc.features[0], feature);
  }
  assert.deepEqual(thickenSpec(plane(), { t: 2 }), thickenSpec(plane(), { t: 2, side: 'normal' }));
  assert.deepEqual(thickenSpec(plane(), { t: 2 }), thickenSpec(plane(), { t: 2, mode: 'sampled' }));
});

test('opt-in exact planar Thicken keeps six native faces on a tilted and skew affine sheet', () => {
  const raw = { ...plane(), controlPoints: [[[10, -6, 3], [16, 24, 11]], [[34, -6, 35], [40, 24, 43]]], weights: [[2, 2], [2, 2]] };
  const normal = [-0.8, 0, 0.6], t = 4;
  for (const [side, lo, hi] of [['normal', 0, 4], ['reverse', -4, 0], ['both', -2, 2]]) {
    const made = part().thicken(raw, { t, side, mode: 'exact-planar' });
    const doc = made.doc, { brep } = outputOf(evaluateCadPart(doc), 'thicken1');
    assert.equal(doc.features[0].mode, 'exact-planar');
    assert.equal(checkBrep(brep, { strict: true }).valid, true);
    assert.deepEqual([brep.bodies[0].kind, brep.vertices.length, brep.edges.length, brep.faces.length], ['solid', 8, 12, 6]);
    assert.deepEqual(brep.faces.map(face => face.name).sort(), ['normal', 'reverse', 'u-max', 'u-min', 'v-max', 'v-min'].map(face => 'thicken1.' + face));
    assert.ok(brep.faces.every(face => face.surface.kind === 'surface' && face.surface.degreeU === 1 && face.surface.degreeV === 1));
    const mass = made.mass({ density: 1 });
    assert.ok(Math.abs(mass.volume - 40 * 30 * t) < 1e-8);
    const offset = (lo + hi) / 2;
    for (const [axis, expected] of [25, 9, 23].entries())
      assert.ok(Math.abs(mass.centroid[axis] - expected - offset * normal[axis]) < 1e-8);
    for (const point of raw.controlPoints.flat()) for (const distance of [lo, hi]) {
      const expected = point.map((value, axis) => value + normal[axis] * distance);
      assert.ok(brep.vertices.some(vertex => vertex.point.every((value, axis) => Math.abs(value - expected[axis]) < 1e-10)));
    }
  }
});

test('exact planar admission refuses a one-ULP twist and unequal weights', () => {
  const small = plane();
  small.controlPoints[1][1][2] = 3 + Number.EPSILON * 2;
  refused(() => part().thicken(small, { t: 2, mode: 'exact-planar' }), 'CAPABILITY', 'evaluate');
  const rational = plane();
  rational.weights[1][1] = 2;
  refused(() => part().thicken(rational, { t: 2, mode: 'exact-planar' }), 'CAPABILITY', 'evaluate');
});

test('exact planar Thicken offsets a non-affine tilted trapezoid and preserves all six boundary names', () => {
  const raw = { ...plane(), controlPoints: [[[10, -6, 3], [16, 24, 11]], [[34, -6, 35], [34, 24, 35]]], weights: [[2, 2], [2, 2]] };
  const made = part().thicken(raw, { t: 4, side: 'both', mode: 'exact-planar' });
  const { brep } = outputOf(evaluateCadPart(made.doc), 'thicken1');
  assert.equal(checkBrep(brep, { strict: true }).valid, true);
  assert.deepEqual([brep.bodies[0].kind, brep.vertices.length, brep.edges.length, brep.faces.length], ['solid', 8, 12, 6]);
  assert.deepEqual(brep.faces.map(face => face.name).sort(), ['normal', 'reverse', 'u-max', 'u-min', 'v-max', 'v-min'].map(face => 'thicken1.' + face));
  const normal = [-0.8, 0, 0.6];
  for (const point of raw.controlPoints.flat()) for (const distance of [-2, 2]) {
    const expected = point.map((value, axis) => value + normal[axis] * distance);
    assert.ok(brep.vertices.some(vertex => vertex.point.every((value, axis) => Math.abs(value - expected[axis]) < 1e-10)));
  }
  const expected = (40 + 30) / 2 * 30 * 4;
  assert.ok(Math.abs(made.mass({ density: 1 }).volume - expected) < 1e-8);

  const asymmetric = plane();
  asymmetric.controlPoints[1][1] = [40, 9, 3];
  const mixed = part().thicken(asymmetric, { t: 2, mode: 'exact-planar' });
  const { brep: mixedBrep } = outputOf(evaluateCadPart(mixed.doc), 'thicken1');
  assert.equal(checkBrep(mixedBrep, { strict: true }).valid, true);
  assert.equal(mixedBrep.faces.length, 6);
  assert.ok(Math.abs(mixed.mass({ density: 1 }).volume - 2 * (40 * 15 + 30 * 30) / 2) < 1e-8);
});

test('exact planar Thicken refuses a twisted, collinear or folded trapezoid', () => {
  // UV boundary order is (0,0), (1,0), (1,1), (0,1). The second control is collinear
  // with the two adjacent corners. The last two give a concave and a crossed outline.
  for (const corner of [[40, 24, 3 + Number.EPSILON * 2], [30, 9, 3], [20, 1.5, 3], [0, 24, 3]]) {
    const raw = plane();
    raw.controlPoints[1][1] = corner;
    refused(() => part().thicken(raw, { t: 2, mode: 'exact-planar' }), 'CAPABILITY', 'evaluate');
  }
});

test('public thicken: exact six-field plain dense snapshot refuses metadata, accessors, wrappers and malformed geometry', () => {
  const inputs = [];
  for (const key of ['trims', 'objectId', 'source', 'geometry', 'kind', 'id', 'transform']) inputs.push({ ...plane(), [key]: key === 'trims' ? [] : 'extra' });
  inputs.push({ surface: plane() }, null, [], new Map(), Object.assign(Object.create({ inherited: true }), plane()));
  for (const mutate of [
    s => { delete s.degreeU; }, s => { s.degreeU = 0; }, s => { s.degreeU = 6; }, s => { s.degreeU = 1.5; },
    s => { s.knotsU[1] = Infinity; }, s => { s.knotsU[2] = -2; }, s => { s.knotsV.pop(); },
    s => { s.controlPoints[0][0][0] = 1e6 + 1; }, s => { s.controlPoints[0][0][0] = NaN; },
    s => { s.controlPoints[0][0].pop(); }, s => { s.controlPoints[0].pop(); },
    s => { s.weights[0][0] = 0; }, s => { s.weights[0][0] = 1e6 + 1; }, s => { s.weights.pop(); },
    s => { delete s.knotsU[1]; }, s => { delete s.controlPoints[0][0][1]; },
    s => { s.weights[0].extra = 2; }, s => { s.knotsU = new Float64Array(s.knotsU); },
    s => { s[Symbol('metadata')] = true; }, s => { s.controlPoints[0][0][Symbol('metadata')] = true; },
    s => { Object.setPrototypeOf(s.knotsU, { ...Array.prototype }); },
  ]) { const s = plane(); mutate(s); inputs.push(s); }
  let reads = 0;
  for (const [target, key] of [['surface', 'degreeU'], ['array', '0'], ['point', '1']]) {
    const s = plane(), object = target === 'surface' ? s : target === 'array' ? s.knotsU : s.controlPoints[0][0];
    Object.defineProperty(object, key, { get() { reads++; throw new Error('getter invoked'); }, enumerable: true, configurable: true }); inputs.push(s);
  }
  for (const surface of inputs) refused(() => thickenSpec(surface, { t: 2 }), 'VALUE');
  assert.equal(reads, 0);
  // Existing native ranges: nonunit domains, coordinates above 10000 and degree 5 remain admitted.
  const wide = plane(); wide.controlPoints[0][0][0] = 1e6; assert.equal(thickenSpec(wide, { t: 2 }).surface.controlPoints[0][0][0], 1e6);
  const degree5 = { degreeU: 5, degreeV: 1, knotsU: [...Array(6).fill(-2), ...Array(6).fill(6)], knotsV: [1, 1, 7, 7], controlPoints: [], weights: [] };
  for (let u = 0; u < 6; u++) { degree5.controlPoints.push([[u, 0, 0], [u, 1, 0]]); degree5.weights.push([1, 1]); }
  assert.equal(thickenSpec(degree5, { t: 2 }).surface.degreeU, 5);
});

test('public thicken: t binding edits the existing snapshot and native save/read retains the recipe and names', () => {
  const source = part('bound plate').parameter('T', 2), before = source.doc;
  const accepted = source.thicken(plane(), { t: param('T'), side: 'both' }), doc = accepted.doc;
  assert.deepEqual(doc.features[0].thickness, { parameter: 'T' }); plate(accepted, 2, 2, 4);
  const changed = accepted.withParameters({ T: 3 }); plate(changed, 3, 1.5, 4.5);
  assert.deepEqual(changed.doc.features, doc.features); assert.deepEqual(namesOf(changed), namesOf(accepted));
  for (const T of [0, -1]) refused(() => accepted.withParameters({ T }), 'PARAMETER', 'evaluate');
  refused(() => accepted.withParameters({ T: 10001 }), 'FORMAT', 'evaluate');
  const snapshot = evaluateCadPart(doc), text = saveCadPart(snapshot), loaded = loadCadPart(text);
  assert.deepEqual(loaded.document, snapshot.document);
  assert.deepEqual(outputOf(loaded, 'thicken1').brep, outputOf(snapshot, 'thicken1').brep);
  const reopened = part('reopened', loaded.document); plate(reopened, 2, 2, 4); plate(reopened.withParameters({ T: 3 }), 3, 1.5, 4.5);
  assert.deepEqual(namesOf(reopened), namesOf(accepted));
  assert.deepEqual(source.doc, before); assert.deepEqual(accepted.doc, doc);
});

test('public thicken: malformed t/side are VALUE and unknown parameter lookup remains unchanged', () => {
  const source = part().parameter('T', 2), before = source.doc;
  for (const t of [0, -1, NaN, Infinity, 10001, '2', null, undefined, {}]) refused(() => source.thicken(plane(), { t }), 'VALUE');
  for (const side of ['', 'NORMAL', null, 1, {}, param('T')]) refused(() => source.thicken(plane(), { t: 2, side }), 'VALUE');
  refused(() => source.thicken(plane(), { t: param('missing') }), 'PARAMETER_UNKNOWN');
  refused(() => source.thicken(param('T'), { t: 2 }), 'VALUE');
  assert.deepEqual(source.doc, before);
});

test('public thicken: adding a body preserves the chosen witness; a Boolean tool callback follows its new body', () => {
  const witness = part().box({ w: 12, d: 7, h: 5, x: 80, y: -3, z: 1 }).body('extrude1');
  const before = witness.doc, witnessMass = witness.mass({ density: 1 }), witnessNames = witness.select().faces().names();
  const pair = witness.thicken(plane(), { t: 2 });
  assert.deepEqual(pair.bodies(), ['extrude1', 'thicken1']); assert.deepEqual(pair.mass({ density: 1 }), witnessMass);
  assert.ok(Math.abs(witnessMass.volume - 420) < 1e-7);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(witnessMass.centroid[k] - [86, 0.5, 3.5][k]) < 1e-7);
  assert.deepEqual(pair.select().faces().names(), witnessNames); plate(pair.body('thicken1'), 2, 3, 5);
  assert.deepEqual(witness.doc, before);
  const stock = part().box({ w: 80, d: 40, h: 10, y: -10 }), stockDoc = stock.doc;
  const cut = stock.subtract(p => p.thicken(plane(), { t: 2 }).moved(Location.at([0, 0, 1])));
  assert.deepEqual(cut.bodies(), ['difference1']); assert.ok(Math.abs(cut.mass({ density: 1 }).volume - 29600) < 1e-6);
  assert.equal(cut.doc.features.find(f => f.kind === 'translate').target, 'thicken1');
  assert.deepEqual(stock.doc, stockDoc);
});

test('public thicken: existing normal/both fold errors and parameter edits refuse atomically', () => {
  const w = Math.SQRT1_2, quarter = { degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 1], knotsV: [0, 0, 1, 1], controlPoints: [[[10, 0, 0], [10, 10, 0]], [[10, 0, 10], [10, 10, 10]], [[0, 0, 10], [0, 10, 10]]], weights: [[1, 1], [w, w], [1, 1]] };
  const source = part().parameter('T', 2), before = source.doc;
  for (const [side, t] of [['normal', 12], ['both', 21]]) assert.throws(() => source.thicken(quarter, { t, side }), e => e instanceof BarocssError && e.code === 'OFFSET_FOLDS' && e.details?.kernelCode === 'OFFSET_FOLDS' && e.where === 'evaluate' && /\[OFFSET_FOLDS\]/.test(e.message));
  const accepted = source.thicken(quarter, { t: param('T') }), doc = accepted.doc;
  assert.throws(() => accepted.withParameters({ T: 12 }), e => e instanceof BarocssError && e.code === 'OFFSET_FOLDS' && e.details?.kernelCode === 'OFFSET_FOLDS' && /\[OFFSET_FOLDS\]/.test(e.message));
  assert.deepEqual(accepted.doc, doc); assert.deepEqual(source.doc, before);
});
