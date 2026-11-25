import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, loadCadPart, massPropertiesOf, reevaluate, saveCadPart,
} from '../dist/index.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}`);
const mask = (left = 17, right = 29, low = 5, high = 23) => ({ points: [[left, low], [right, low], [right, high], [left, high]] });
const document = () => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { cx: 10, cy: 10, r: 2, pitchX: 8, pitchY: 8, right: 28 }, features: [
  { id: 'stockSketch', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] },
  { id: 'stock', kind: 'extrude', sketch: 'stockSketch', height: 10 },
  { id: 'circleSketch', kind: 'sketch', profile: 'circle', center: [{ parameter: 'cx' }, { parameter: 'cy' }], radius: { parameter: 'r' }, sideTags: { outer: ['round'] } },
  { id: 'circleTool', kind: 'extrude', sketch: 'circleSketch', height: 10 },
  { id: 'first', kind: 'difference', target: 'stock', tool: 'circleTool' },
  { id: 'laterSketch', kind: 'sketch', profile: 'rectangle', min: [24, 8], max: [{ parameter: 'right' }, 10], sideTags: { outer: ['a', 'b', 'c', 'd'] } },
  { id: 'laterTool', kind: 'extrude', sketch: 'laterSketch', height: 10 },
  { id: 'second', kind: 'difference', target: 'first', tool: 'laterTool' },
  { id: 'repeat', kind: 'fill-feature-pattern', target: 'second', source: 'first', region: mask(), anchor: [10, 10],
    spacing: { parameter: 'pitchX' }, count: 2, spacing2: { parameter: 'pitchY' }, count2: 2 },
] });
const baseCells = [[0, 0], [1, 0], [1, 1]];
const laterWalls = brep => brep.faces.filter(face => face.name?.startsWith('laterTool.side')).map(face => ({ name: face.name, geometry: faceGeometry(face) })).sort((a, b) => a.name.localeCompare(b.name));

/** Cells are literal independent mask oracles; this reader never calls the product placement planner. */
function verify(snapshot, cells = baseCells) {
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true });
  assert.equal(output.id, 'repeat'); assert.equal(output.bodyCount, 1); assert.equal(brep.source.family, 'prismatic-solid');
  assert.ok(report.valid, report.issues.join('\n'));
  const { cx, cy, r, pitchX, pitchY, right } = snapshot.document.parameters, n = cells.length;
  const centers = cells.map(([i, j]) => ({ center: [cx + pitchX * i, cy + pitchY * j], suffix: i || j ? `@${i},${j}` : '' }));
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].shells, 1); assert.equal(report.topology[0].genus, n + 1);
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 10 + 2 * n, loops: 12 + 4 * n, coedges: 48 + 12 * n, edges: 24 + 6 * n, vertices: 16 + 4 * n });
  const rectangleVolume = 20 * (right - 24), circleVolume = 10 * Math.PI * r ** 2, volume = 24000 - rectangleVolume - n * circleVolume;
  const centroid = [(720000 - rectangleVolume * (24 + right) / 2 - circleVolume * centers.reduce((sum, { center }) => sum + center[0], 0)) / volume,
    (480000 - rectangleVolume * 9 - circleVolume * centers.reduce((sum, { center }) => sum + center[1], 0)) / volume, 5];
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume); mass.centroid.forEach((x, i) => near(x, centroid[i]));
  }
  const cylinders = brep.faces.map(face => ({ face, g: faceGeometry(face) })).filter(({ g }) => g.kind === 'cylinder');
  assert.equal(cylinders.length, 2 * n);
  for (const { center, suffix } of centers) {
    const walls = cylinders.filter(({ g }) => Math.hypot(g.c[0] - center[0], g.c[1] - center[1]) < 1e-8);
    assert.equal(walls.length, 2);
    for (const { face, g } of walls) {
      near(g.r, r); near(Math.abs(g.a[2]), 1); near(g.a[0], 0); near(g.a[1], 0); assert.equal(g.out, -1);
      const prefix = `circleTool.side[round]${suffix}`;
      assert.ok(face.name === prefix || (face.name.startsWith(prefix + '#') && /^\d+$/.test(face.name.slice(prefix.length + 1))));
      assert.equal(face.name.includes('@'), !!suffix);
    }
  }
  for (const z of [0, 10]) {
    const caps = brep.faces.filter(face => { const g = faceGeometry(face); return g.kind === 'plane' && Math.abs(g.n[2]) === 1 && g.o[2] === z; });
    assert.equal(caps.length, 1); near(faceGeometry(caps[0]).n[2], z ? 1 : -1);
    const loops = caps[0].loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.equal(loops.filter(loop => loop.kind === 'outer').length, 1);
    const holes = loops.filter(loop => loop.kind === 'inner'); assert.equal(holes.length, n + 1);
    const roundHoles = holes.filter(loop => loop.coedges.every(id => brep.edges.find(edge => edge.id === brep.coedges.find(use => use.id === id).edge).curve.degree === 2));
    assert.equal(roundHoles.length, n);
    for (const { center } of centers) assert.equal(roundHoles.filter(loop => loop.coedges.every(id => {
      const use = brep.coedges.find(use => use.id === id), curve = brep.edges.find(edge => edge.id === use.edge).curve, [lo, hi] = curveDomain(curve);
      return [0, .23, .61, 1].every(f => { const p = evaluateCurve(curve, lo + f * (hi - lo));
        return Math.abs(p[2] - z) < 1e-8 && Math.abs(Math.hypot(p[0] - center[0], p[1] - center[1]) - r) < 1e-8; });
    })).length, 1);
  }
  for (const use of brep.coedges) {
    assert.ok(use.pcurve);
    const edge = brep.edges.find(edge => edge.id === use.edge), face = brep.faces.find(face => face.loops.includes(use.loop));
    const twin = brep.coedges.find(peer => peer.id === use.twin); assert.equal(twin.twin, use.id); assert.notEqual(twin.sense, use.sense);
    const [lo, hi] = curveDomain(edge.curve);
    for (const f of [0, .31, .79, 1]) {
      const t = lo + f * (hi - lo), uv = evaluateCurve(use.pcurve, t), p = evaluateCurve(edge.curve, t), q = evaluateSurface(face.surface, uv[0], uv[1]);
      near(Math.hypot(...p.map((x, i) => x - q[i])), 0);
    }
  }
  return output;
}

test('captured Fill cells retain the out-of-mask original, complete circular tools and stable native grid owners', () => {
  const input = document(), before = structuredClone(input), initial = evaluateCadPart(input), output = verify(initial);
  const mass = massPropertiesOf(output), volume = 23920 - 120 * Math.PI;
  near(mass.volume, volume); near(mass.centroid[0], (717920 - 1840 * Math.PI) / volume); near(mass.centroid[1], (479280 - 1520 * Math.PI) / volume);
  assert.ok(!output.brep.faces.some(face => face.name?.includes('@0,1')));
  const current = document(); current.features.pop();
  assert.deepEqual(laterWalls(output.brep), laterWalls(evaluateCadPart(current).outputs[0].brep));
  assert.deepEqual(input, before); assert.deepEqual(initial.document, before);
  const reopened = loadCadPart(saveCadPart(initial));
  assert.deepEqual(reopened.document, initial.document); assert.deepEqual(verify(reopened).brep, output.brep);
});

test('omitting a colliding candidate is safe while admitting the same candidate is refused', () => {
  const doc = document(); doc.features.at(-1).count = 3; doc.features.at(-1).region = mask(17, 23);
  const accepted = evaluateCadPart(doc), saved = saveCadPart(accepted), output = verify(accepted);
  assert.ok(!output.brep.faces.some(face => face.name?.includes('@2,')));
  const admitted = structuredClone(doc); admitted.features.at(-1).region = mask();
  assert.throws(() => reevaluate(accepted, { document: admitted }), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');
  assert.equal(saveCadPart(accepted), saved);
  assert.deepEqual(verify(loadCadPart(saved)).brep, output.brep);
});

test('mask, signed spacing and source dependencies keep only the captured native identities across replay', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  for (const parameters of [{ pitchY: 11 }, { r: 3 }, { cx: 11 }, { right: 30 }]) {
    const edited = reevaluate(initial, { parameters }); verify(edited);
    assert.deepEqual(verify(loadCadPart(saveCadPart(edited))).brep, edited.outputs[0].brep);
  }
  const negative = document(); negative.parameters.pitchX = -6; negative.features.at(-1).region = mask(3, 5);
  verify(evaluateCadPart(negative));
  const omittedRow = reevaluate(initial, { parameters: { pitchY: 14 } }); verify(omittedRow, [[0, 0], [1, 0]]);
  assert.ok(!omittedRow.outputs[0].brep.faces.some(face => face.name?.includes('@1,1')));
  assert.equal(saveCadPart(initial), saved);
  assert.deepEqual(verify(reevaluate(initial, { parameters: {} })).brep, initial.outputs[0].brep);
});

test('no captured copies retains the original and still applies all native original-source guards', () => {
  const single = document(); single.features.at(-1).region = mask(40, 45, 30, 35);
  const accepted = evaluateCadPart(single), output = verify(accepted, [[0, 0]]);
  near(massPropertiesOf(output).volume, 23920 - 40 * Math.PI); assert.ok(!output.brep.faces.some(face => face.name?.includes('@')));
  const prefix = structuredClone(single); prefix.features.pop();
  assert.deepEqual(laterWalls(output.brep), laterWalls(evaluateCadPart(prefix).outputs[0].brep));
  for (const id of ['circleTool', 'laterTool']) {
    const partial = structuredClone(single); partial.features.find(f => f.id === id).height = 5;
    assert.throws(() => evaluateCadPart(partial), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'CAPABILITY');
  }
});

test('admitted unsafe tools, overlaps, invalid bounds and unsupported history remain refused without changing accepted history', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  for (const parameters of [{ pitchX: 12 }, { pitchX: 16 }, { r: 4 }, { cx: 17 }]) {
    assert.throws(() => reevaluate(initial, { parameters }), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');
    assert.equal(saveCadPart(initial), saved);
  }
  const overlap = document(); overlap.parameters.pitchX = 3; overlap.features.at(-1).region = mask(12, 14);
  assert.throws(() => evaluateCadPart(overlap), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');
  const refused = (change, codes = ['CAPABILITY', 'REFERENCE']) => {
    const doc = document(); change(doc); const before = structuredClone(doc);
    assert.throws(() => evaluateCadPart(doc), e => e instanceof CadPartError && e.feature === 'repeat' && codes.includes(e.code));
    assert.deepEqual(doc, before);
  };
  refused(doc => { doc.parameters.pitchX = 0; }, ['PARAMETER']);
  refused(doc => { Object.assign(doc.features.at(-1), { count: 65, count2: 1 }); }, ['INPUT']);
  refused(doc => { doc.features.at(-1).source = 'first/0'; });
  refused(doc => { doc.features.splice(4, 0, { id: 'movedTool', kind: 'translate', target: 'circleTool', offset: [0, 0, 0] }); doc.features.find(f => f.id === 'first').tool = 'movedTool'; });
  refused(doc => { doc.features[2].holes = [[{ kind: 'arc', center: [10, 10], start: [11, 10], direction: 'ccw' }]]; doc.features[2].sideTags.holes = [['island']]; });
  refused(doc => { doc.features.splice(-1, 0, { id: 'extraSketch', kind: 'sketch', profile: 'circle', center: [42, 22], radius: 2 },
    { id: 'extraTool', kind: 'extrude', sketch: 'extraSketch', height: 10 }, { id: 'third', kind: 'difference', target: 'second', tool: 'extraTool' }); doc.features.at(-1).target = 'third'; });
  refused(doc => { Object.assign(doc.features.at(-1), { kind: 'curve-feature-pattern', path: { degree: 1, knots: [0, 0, 1, 1], controlPoints: [[0, 0, 0], [8, 0, 1]], weights: [1, 1] } }); });
});

test('omitted source still patterns only the newer rectangular cutter at the captured Fill locations', () => {
  const ordinary = document(); delete ordinary.features.at(-1).source;
  const output = evaluateCadPart(ordinary).outputs[0], report = checkBrep(output.brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n')); assert.equal(report.topology[0].genus, 4);
  near(massPropertiesOf(output).volume, 23760 - 40 * Math.PI);
  assert.equal(output.brep.faces.filter(face => faceGeometry(face).kind === 'cylinder').length, 2);
  assert.ok(output.brep.faces.some(face => face.name === 'laterTool.side[a]@1,0'));
  assert.ok(output.brep.faces.some(face => face.name === 'laterTool.side[a]@1,1'));
  assert.ok(!output.brep.faces.some(face => face.name?.includes('@0,1') || face.name?.startsWith('circleTool.side[round]@')));
});
