import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blindDrillPointHeight, brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve,
  faceGeometry, loadCadPart, massPropertiesOf, projectBrepHiddenLines, reevaluate, revolveMassProperties, revolveProfile, saveCadPart,
  surfaceDomain, transformBrep,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';

const near = (a, b, tolerance = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}, tolerance ${tolerance}`);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normal = (face, d) => { const n = cross(d.du, d.dv), l = Math.hypot(...n), sign = face.sense === 'forward' ? 1 : -1; return n.map(v => sign * v / l); };
const slope = Math.tan(118 * Math.PI / 360);
const doc = () => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { thickness: 20, radius: 4, depth: 9 }, features: [
  { id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [32, 24] },
  { id: 'stock', kind: 'extrude', sketch: 's', height: { parameter: 'thickness' } },
  { id: 'drill', kind: 'blind-drill-hole', target: 'stock', center: [10, 9], radius: { parameter: 'radius' }, depth: { parameter: 'depth' }, face: 'stock.top' },
] });

function rim(brep, loop, z, radius) {
  assert.equal(loop.coedges.length, 2);
  const points = [];
  for (const id of loop.coedges) {
    const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge), [lo, hi] = curveDomain(edge.curve);
    const twin = brep.coedges.find(other => other.id === use.twin);
    assert.equal(twin.twin, use.id); assert.notEqual(twin.sense, use.sense);
    for (const f of [0, .25, .5, .75, 1]) {
      const p = evaluateCurve(edge.curve, lo + f * (hi - lo)); points.push(p);
      near(p[2], z); near(Math.hypot(p[0] - 10, p[1] - 9), radius);
    }
  }
  for (const [axis, c] of [[0, 10], [1, 9]]) {
    near(Math.min(...points.map(p => p[axis])), c - radius); near(Math.max(...points.map(p => p[axis])), c + radius);
  }
}

function verify(snapshot) {
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, check = checkBrep(brep, { strict: true });
  assert.equal(output.id, 'drill'); assert.equal(output.bodyCount, 1); assert.equal(output.representation, 'curved');
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1); assert.equal(check.topology[0].shells, 1); assert.equal(check.topology[0].genus, 0);
  const { thickness: T, radius: r, depth: d } = snapshot.document.parameters, h = r / slope;
  const removed = Math.PI * r ** 2 * (d + h / 3), full = 32 * 24 * T, volume = full - removed;
  const depthCentroid = (d ** 2 / 2 + d * h / 3 + h ** 2 / 12) / (d + h / 3);
  const removedCenter = [10, 9, T - depthCentroid], stockCenter = [16, 12, T / 2];
  const centroid = stockCenter.map((x, i) => (full * x - removed * removedCenter[i]) / volume);
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume); mass.centroid.forEach((x, i) => near(x, centroid[i]));
  }
  const bottom = brep.faces.filter(face => face.name === 'stock.bottom'); assert.equal(bottom.length, 1);
  const bottomGeometry = faceGeometry(bottom[0]); assert.equal(bottomGeometry.kind, 'plane'); near(bottomGeometry.n[2], -1); near(bottomGeometry.o[2], 0);
  assert.equal(bottom[0].loops.length, 1);
  const bottomLoop = brep.loops.find(loop => loop.id === bottom[0].loops[0]); assert.equal(bottomLoop.coedges.length, 4);
  const bottomPoints = bottomLoop.coedges.flatMap(id => { const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge);
    assert.equal(edge.curve.degree, 1); assert.equal(edge.curve.controlPoints.length, 2); return edge.curve.controlPoints;
  }).map(p => p.map(x => Math.abs(x) < 1e-12 ? 0 : x));
  const corners = [...new Map(bottomPoints.map(p => [JSON.stringify(p), p])).values()];
  assert.deepEqual(corners.sort(), [[0, 0, 0], [0, 24, 0], [32, 0, 0], [32, 24, 0]].sort());
  const top = brep.faces.filter(face => face.name === 'stock.top'); assert.equal(top.length, 1); assert.equal(top[0].loops.length, 2);
  const entry = top[0].loops.map(id => brep.loops.find(loop => loop.id === id)).find(loop => loop.kind === 'inner');
  assert.ok(entry); rim(brep, entry, T, r);
  const horizontal = brep.faces.filter(face => { const g = faceGeometry(face); return g.kind === 'plane' && Math.abs(g.n[2]) === 1; });
  assert.deepEqual(horizontal.map(face => face.name).sort(), ['stock.bottom', 'stock.top']);
  const walls = brep.faces.filter(face => face.name?.startsWith('drill.wall'));
  const points = brep.faces.filter(face => face.name?.startsWith('drill.point'));
  assert.equal(walls.length, 2); assert.equal(points.length, 2);
  for (const face of walls) {
    const g = faceGeometry(face); assert.equal(g.kind, 'cylinder'); near(g.r, r); near(g.c[0], 10); near(g.c[1], 9); assert.equal(g.out, -1);
  }
  for (const face of points) {
    assert.equal(faceGeometry(face).kind, 'other'); // A rational cone with a collapsed apex, not a new geometry enum.
    const { u, v } = surfaceDomain(face.surface);
    for (const a of [.19, .43, .79]) for (const b of [.23, .67]) {
      const d1 = evaluateSurfaceD1(face.surface, u[0] + a * (u[1] - u[0]), v[0] + b * (v[1] - v[0]));
      const x = d1.point[0] - 10, y = d1.point[1] - 9, rho = Math.hypot(x, y), apex = T - d - h;
      assert.ok(d1.point[2] > apex && d1.point[2] < T - d); near(rho, slope * (d1.point[2] - apex));
      const expected = [-x / rho, -y / rho, slope].map(x => x / Math.hypot(1, slope));
      normal(face, d1).forEach((x, i) => near(x, expected[i]));
    }
  }
  const apex = brep.vertices.filter(vertex => Math.hypot(vertex.point[0] - 10, vertex.point[1] - 9, vertex.point[2] - (T - d - h)) < 1e-7);
  assert.equal(apex.length, 1); assert.ok(brep.loops.every(loop => loop.coedges.length > 0));
  const faceOfLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face])));
  const joints = brep.edges.filter(edge => {
    const faces = brep.coedges.filter(use => use.edge === edge.id).map(use => faceOfLoop.get(use.loop));
    return faces.some(face => face.name?.startsWith('drill.wall')) && faces.some(face => face.name?.startsWith('drill.point'));
  });
  assert.equal(joints.length, 2);
  for (const edge of joints) {
    const uses = brep.coedges.filter(use => use.edge === edge.id); assert.equal(uses.length, 2); assert.equal(uses[0].twin, uses[1].id);
    const [lo, hi] = curveDomain(edge.curve);
    for (const f of [0, .25, .5, .75, 1]) {
      const p = evaluateCurve(edge.curve, lo + f * (hi - lo)); near(p[2], T - d); near(Math.hypot(p[0] - 10, p[1] - 9), r);
    }
  }
  return output;
}

test('one whole native Revolve cutter has a strict shared apex and independently calibrated cylinder/cone mass', () => {
  const r = 4, d = 9, over = .09, T = 20, h = r / slope;
  near(blindDrillPointHeight(r), h, 1e-14);
  const input = { id: 'tool', profile: [[0, -over], [r, -over], [r, d], [0, d + h]].map(start => ({ kind: 'line', start })), axis: { origin: [0, 0], direction: [0, 1] }, angle: 360 };
  const raw = revolveProfile(input), cutter = transformBrep(raw, { matrix: [1, 0, 0, 0, 0, 1, 0, -1, 0], offset: [10, 9, T] });
  const check = checkBrep(cutter, { strict: true }); assert.ok(check.valid, check.issues.join('\n')); assert.equal(check.topology[0].genus, 0);
  const volume = Math.PI * r ** 2 * (d + over + h / 3);
  const centroidDepth = ((d + over) * (d - over) / 2 + h / 3 * (d + h / 4)) / (d + over + h / 3);
  const native = brepMassProperties(cutter, 1); near(native.volume, volume); near(native.centroid[0], 10); near(native.centroid[1], 9); near(native.centroid[2], T - centroidDepth);
  near(revolveMassProperties(input, 1).volume, volume);
  assert.equal(cutter.vertices.filter(vertex => Math.hypot(vertex.point[0] - 10, vertex.point[1] - 9, vertex.point[2] - (T - d - h)) < 1e-7).length, 1);
});

test('the fixed 118° blind drill keeps the original entrance, the cylinder/cone seam and the untouched bottom', () => {
  const input = doc(), before = structuredClone(input), initial = evaluateCadPart(input), output = verify(initial);
  near(massPropertiesOf(output).volume, 14867.340592676277);
  const flat = doc(); flat.features[2].kind = 'hole';
  const flatOutput = evaluateCadPart(flat).outputs[0], T = 20, r = 4, d = 9;
  near(massPropertiesOf(flatOutput).volume, 32 * 24 * T - Math.PI * r ** 2 * d);
  near(massPropertiesOf(flatOutput).volume - massPropertiesOf(output).volume, Math.PI * r ** 2 * (r / slope) / 3);
  const flatTop = flatOutput.brep.faces.find(face => face.name === 'stock.top');
  rim(flatOutput.brep, flatTop.loops.map(id => flatOutput.brep.loops.find(loop => loop.id === id)).find(loop => loop.kind === 'inner'), T, r);
  assert.deepEqual(input, before); assert.deepEqual(initial.document, before);
  const reopened = loadCadPart(saveCadPart(initial)); assert.deepEqual(reopened.document, initial.document); assert.deepEqual(verify(reopened).brep, output.brep);
});

test('thickness and radius edits rebuild physical depth safely, with immutable refusal and native replay', () => {
  const initial = evaluateCadPart(doc()), saved = saveCadPart(initial);
  assert.throws(() => reevaluate(initial, { parameters: { thickness: 11 } }), e => e instanceof CadPartError && e.feature === 'drill' && e.code === 'GEOMETRY' && /118° point.*stock thickness/.test(e.message));
  assert.equal(saveCadPart(initial), saved);
  for (const parameters of [{ thickness: 24 }, { radius: 3 }, { depth: 7 }, { thickness: 11, radius: 3 }]) {
    const edited = reevaluate(initial, { parameters }); verify(edited);
    const reopened = loadCadPart(saveCadPart(edited)); assert.deepEqual(verify(reopened).brep, edited.outputs[0].brep);
  }
  assert.deepEqual(verify(reevaluate(initial, { parameters: {} })).brep, initial.outputs[0].brep);
});

test('unsupported faces, rims, source history and extra shape modes fail without flattening to a legacy Hole', () => {
  const refused = (change, code) => { const input = doc(); change(input); const before = structuredClone(input);
    assert.throws(() => evaluateCadPart(input), e => e instanceof CadPartError && e.feature === 'drill' && e.code === code); assert.deepEqual(input, before);
  };
  for (const face of [undefined, 'stock.bottom', 'stock.side0', 'stock.top#1']) refused(input => { input.features[2].face = face; }, 'REFERENCE');
  for (const center of [[4, 9], [3, 9], [30, 9]]) refused(input => { input.features[2].center = center; }, 'GEOMETRY');
  for (const [key, value] of [['axis', 'z'], ['side', 'min'], ['countersink', 12], ['bottom', 'flat'], ['angle', 90], ['pattern', { count: 2 }]])
    refused(input => { input.features[2][key] = value; }, 'INPUT');
  for (const [key, value] of [['radius', 0], ['radius', .005], ['depth', 0], ['depth', .00005]]) refused(input => { input.parameters[key] = value; }, 'PARAMETER');
  refused(input => { input.features[1].draft = 5; }, 'CAPABILITY');
  refused(input => { input.features[0].holes = [[{ kind: 'arc', center: [24, 16], start: [25, 16], direction: 'ccw' }]]; }, 'CAPABILITY');
  refused(input => { input.features.splice(2, 0, { id: 'moved', kind: 'translate', target: 'stock', offset: [0, 0, 0] }); input.features.at(-1).target = 'moved'; }, 'CAPABILITY');
});

test('the blind-drill Top projection preserves the complete entrance and omits the smooth cone meridians', () => {
  const { brep } = verify(evaluateCadPart(doc()));
  const sides = brep.faces.filter(face => face.name.startsWith('drill.point'));
  const owners = new Set(sides.map(face => face.id));
  const faceByLoop = new Map(brep.loops.map(loop => [loop.id, loop.face]));
  const meridians = brep.edges.filter(edge => {
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    return uses.length === 2 && uses.every(use => owners.has(faceByLoop.get(use.loop)));
  });
  assert.equal(meridians.length, 2);
  const meridianIds = new Set(meridians.map(edge => edge.id));
  const meridianNames = new Set(meridians.map(edge => edge.name));
  const renamed = {
    ...brep,
    faces: brep.faces.map(face => owners.has(face.id) ? { ...face, name: 'unrelated-' + face.id } : face),
    edges: brep.edges.map(edge => meridianIds.has(edge.id) ? {
      ...edge, vertices: [...edge.vertices].reverse(),
      curve: { ...edge.curve, controlPoints: [...edge.curve.controlPoints].reverse() },
    } : edge),
    coedges: brep.coedges.map(use => meridianIds.has(use.edge) ? {
      ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward',
    } : use),
  };
  assert.ok(checkBrep(renamed, { strict: true }).valid);
  const view = { toward: [0, 0, 1], up: [0, 1, 0] };
  for (const source of [brep, renamed]) for (const segmentsPerQuarter of [6, 12, 24]) for (const tangentEdges of [false, true]) {
    const { edges } = projectBrepHiddenLines([source], view, { segmentsPerQuarter, tangentEdges });
    assert.ok(edges.every(edge => !meridianNames.has(edge.name.replace(/~sil$/, ''))));
    const rims = edges.filter(edge => /^drill\.wall#\d+\|stock\.top$/.test(edge.name));
    assert.equal(rims.length, 2);
    let sweep = 0;
    for (const rim of rims) for (const { curve, visible } of rim.pieces) {
      assert.ok(visible);
      assert.equal(curve.kind, 'arc');
      near(curve.center[0], 10);
      near(curve.center[1], 9);
      near(Math.hypot(...curve.u), 4);
      near(Math.hypot(...curve.v), 4);
      sweep += curve.t1 - curve.t0;
    }
    near(sweep, 2 * Math.PI);
    assert.equal(edges.filter(edge => edge.kind === 'line' && edge.pieces.some(piece => piece.visible)).length, 4);
  }
});

test('an exposed cone keeps its true Front silhouettes and sharp base projection', () => {
  const h = blindDrillPointHeight(4);
  const native = revolveProfile({ id: 'cone', profile: [[0, 0], [4, 0], [0, h]].map(start => ({ kind: 'line', start })),
    axis: { origin: [0, 0], direction: [0, 1] }, angle: 360 });
  const cone = transformBrep(native, { matrix: [1, 0, 0, 0, 0, -1, 0, 1, 0], offset: [0, 0, 0] });
  assert.ok(checkBrep(cone, { strict: true }).valid);
  for (const tangentEdges of [false, true]) {
    const { edges } = projectBrepHiddenLines([cone], { toward: [0, -1, 0], up: [0, 0, 1] }, { tangentEdges });
    const visible = edges.flatMap(edge => edge.pieces.filter(piece => piece.visible && piece.ink !== false).map(piece => ({ edge, curve: piece.curve })));
    const silhouettes = visible.filter(({ edge }) => edge.kind === 'silhouette');
    assert.equal(silhouettes.length, 2);
    for (const x of [-4, 4]) assert.ok(silhouettes.some(({ curve }) => curve.kind === 'line' &&
      [curve.a, curve.b].some(p => Math.hypot(p[0] - x, p[1]) < 1e-9) &&
      [curve.a, curve.b].some(p => Math.hypot(p[0], p[1] - h) < 1e-9)));
    assert.ok(visible.some(({ edge, curve }) => edge.kind === 'circle' && curve.kind === 'line' &&
      Math.abs(Math.hypot(curve.a[0] - curve.b[0], curve.a[1] - curve.b[1]) - 8) < 1e-9));
  }
});
