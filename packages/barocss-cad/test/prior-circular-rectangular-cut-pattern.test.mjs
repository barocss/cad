import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, loadCadPart, massPropertiesOf, reevaluate, saveCadPart,
} from '../dist/index.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}`);
const document = () => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { cx: 10, cy: 10, r: 2, pitchX: 8, pitchY: 8, right: 28 }, features: [
  { id: 'stockSketch', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] },
  { id: 'stock', kind: 'extrude', sketch: 'stockSketch', height: 10 },
  { id: 'circleSketch', kind: 'sketch', profile: 'circle', center: [{ parameter: 'cx' }, { parameter: 'cy' }], radius: { parameter: 'r' }, sideTags: { outer: ['round'] } },
  { id: 'circleTool', kind: 'extrude', sketch: 'circleSketch', height: 10 },
  { id: 'first', kind: 'difference', target: 'stock', tool: 'circleTool' },
  { id: 'laterSketch', kind: 'sketch', profile: 'rectangle', min: [24, 8], max: [{ parameter: 'right' }, 10], sideTags: { outer: ['a', 'b', 'c', 'd'] } },
  { id: 'laterTool', kind: 'extrude', sketch: 'laterSketch', height: 10 },
  { id: 'second', kind: 'difference', target: 'first', tool: 'laterTool' },
  { id: 'repeat', kind: 'rectangular-feature-pattern', target: 'second', source: 'first', axis: 'x', spacing: { parameter: 'pitchX' }, count: 2,
    axis2: 'y', spacing2: { parameter: 'pitchY' }, count2: 2 },
] });
const laterWalls = brep => brep.faces.filter(face => face.name?.startsWith('laterTool.side')).map(face => ({ name: face.name, geometry: faceGeometry(face) })).sort((a, b) => a.name.localeCompare(b.name));

function verify(snapshot) {
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true });
  assert.equal(output.id, 'repeat'); assert.equal(output.bodyCount, 1); assert.ok(report.valid, report.issues.join('\n'));
  const { cx, cy, r, right } = snapshot.document.parameters, recipe = snapshot.document.features.at(-1), n = recipe.count * recipe.count2;
  const value = dim => typeof dim === 'number' ? dim : snapshot.document.parameters[dim.parameter];
  const centers = [];
  for (let j = 0; j < recipe.count2; j++) for (let i = 0; i < recipe.count; i++) {
    const center = [cx, cy]; center[recipe.axis === 'x' ? 0 : 1] += value(recipe.spacing) * i;
    center[recipe.axis2 === 'x' ? 0 : 1] += value(recipe.spacing2) * j;
    centers.push({ center, suffix: i || j ? `@${i},${j}` : '' });
  }
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
      assert.ok(face.name.startsWith(`circleTool.side[round]${suffix}`));
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

test('the earlier circular cut uses the exact 2×2 row-major native grid and keeps the later rectangle unchanged', () => {
  const input = document(), before = structuredClone(input), initial = evaluateCadPart(input), output = verify(initial);
  const mass = massPropertiesOf(output), volume = 23920 - 160 * Math.PI;
  near(mass.volume, volume); near(mass.centroid[0], (717920 - 2240 * Math.PI) / volume); near(mass.centroid[1], (479280 - 2240 * Math.PI) / volume);
  const current = document(); current.features.pop();
  assert.deepEqual(laterWalls(output.brep), laterWalls(evaluateCadPart(current).outputs[0].brep));
  assert.deepEqual(input, before); assert.deepEqual(initial.document, before);
  const reopened = loadCadPart(saveCadPart(initial));
  assert.deepEqual(reopened.document, initial.document); assert.deepEqual(verify(reopened).brep, output.brep);
});

test('axis swap changes tagged cell ownership while signed raw Kernel spacing and the 64-cell limit keep native proofs', () => {
  const swap = document(); swap.parameters.pitchY = 12;
  Object.assign(swap.features.at(-1), { axis: 'y', spacing: { parameter: 'pitchY' }, axis2: 'x', spacing2: { parameter: 'pitchX' } });
  verify(evaluateCadPart(swap));
  for (const [pitchX, pitchY] of [[-6, 8], [8, -6], [-6, -6]]) {
    const doc = document(); Object.assign(doc.parameters, { pitchX, pitchY }); verify(evaluateCadPart(doc));
  }
  const maximum = document(); Object.assign(maximum.parameters, { r: .1, pitchX: .4, pitchY: .4 });
  Object.assign(maximum.features.at(-1), { count: 8, count2: 8 }); verify(evaluateCadPart(maximum));
});

test('source size, later size and each grid spacing remain independent dependencies through replay and reopen', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  for (const parameters of [{ r: 3 }, { cx: 11 }, { right: 30 }, { pitchX: 10 }, { pitchY: 12 }]) {
    const edited = reevaluate(initial, { parameters }); verify(edited);
    assert.deepEqual(verify(loadCadPart(saveCadPart(edited))).brep, edited.outputs[0].brep);
  }
  assert.equal(saveCadPart(initial), saved);
  assert.deepEqual(verify(reevaluate(initial, { parameters: {} })).brep, initial.outputs[0].brep);
});

test('contacts, overlap, stock contact and the genuinely diagonal-only collision refuse before any cut is applied', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  for (const parameters of [{ pitchX: 4 }, { pitchY: 4 }, { pitchX: 12 }, { pitchX: 16 }, { pitchX: -8 }, { pitchY: -8 }]) {
    assert.throws(() => reevaluate(initial, { parameters }), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');
    assert.equal(saveCadPart(initial), saved);
  }
  const diagonal = document(); Object.assign(diagonal.parameters, { cy: 4, pitchX: 16, pitchY: 5 });
  for (const axis of ['row', 'column']) {
    const safe = structuredClone(diagonal); safe.features.at(-1)[axis === 'row' ? 'count2' : 'count'] = 1;
    verify(evaluateCadPart(safe));
  }
  assert.throws(() => evaluateCadPart(diagonal), e => e instanceof CadPartError && e.feature === 'repeat' && e.code === 'GEOMETRY');
  assert.equal(saveCadPart(initial), saved);
});

test('omitted source repeats the current rectangle while unsupported original families and Path stay refused', () => {
  const ordinary = document(); delete ordinary.features.at(-1).source;
  const output = evaluateCadPart(ordinary).outputs[0], report = checkBrep(output.brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n')); assert.equal(report.topology[0].genus, 5);
  near(massPropertiesOf(output).volume, 23680 - 40 * Math.PI);
  assert.equal(output.brep.faces.filter(face => faceGeometry(face).kind === 'cylinder').length, 2);
  assert.ok(output.brep.faces.some(face => face.name === 'laterTool.side[a]@1,1'));
  assert.ok(!output.brep.faces.some(face => face.name?.startsWith('circleTool.side[round]@')));
  const refused = (change, codes = ['CAPABILITY', 'REFERENCE']) => {
    const doc = document(); change(doc); const before = structuredClone(doc);
    assert.throws(() => evaluateCadPart(doc), e => e instanceof CadPartError && e.feature === 'repeat' && codes.includes(e.code));
    assert.deepEqual(doc, before);
  };
  for (const id of ['circleTool', 'laterTool']) refused(doc => { doc.features.find(f => f.id === id).height = 5; });
  for (const count2 of [1, 2]) refused(doc => { Object.assign(doc.features.at(-1), { axis2: 'z', count2 }); });
  refused(doc => { doc.features.at(-1).axis2 = 'x'; }, ['INPUT']);
  refused(doc => { Object.assign(doc.features.at(-1), { count: 9, count2: 8 }); }, ['INPUT']);
  refused(doc => { doc.parameters.pitchX = 0; }, ['PARAMETER']);
  refused(doc => { doc.features.splice(4, 0, { id: 'movedTool', kind: 'translate', target: 'circleTool', offset: [0, 0, 0] }); doc.features.find(f => f.id === 'first').tool = 'movedTool'; });
  refused(doc => { doc.features[2].holes = [[{ kind: 'arc', center: [10, 10], start: [11, 10], direction: 'ccw' }]]; doc.features[2].sideTags.holes = [['island']]; });
  refused(doc => { doc.features.splice(-1, 0, { id: 'extraSketch', kind: 'sketch', profile: 'rectangle', min: [40, 20], max: [44, 24] },
    { id: 'extraTool', kind: 'extrude', sketch: 'extraSketch', height: 10 }, { id: 'third', kind: 'difference', target: 'second', tool: 'extraTool' }); doc.features.at(-1).target = 'third'; });
  refused(doc => {
    Object.assign(doc.features.at(-1), { kind: 'fill-feature-pattern', region: { points: [[0, 0], [60, 0], [60, 40], [0, 40]] }, anchor: [10, 10] });
    Object.assign(doc.features[5], { profile: 'circle', center: [26, 9], radius: 1, sideTags: { outer: ['laterRound'] } });
  });
  refused(doc => { Object.assign(doc.features.at(-1), { kind: 'curve-feature-pattern', path: { degree: 1, knots: [0, 0, 1, 1], controlPoints: [[0, 0, 0], [8, 0, 0]], weights: [1, 1] } }); });
});
