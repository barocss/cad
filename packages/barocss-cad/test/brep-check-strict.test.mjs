import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBrep, lineCurve, checkBrep, evaluateCadPart, checkOutput } from '../dist/index.js';

// A sheet of one planar face bounded by line edges through `pts` (in order), on the plane z = 0 unless `surface` is given.
function sheet(pts, { surface, tol } = {}) {
  const vertices = pts.map((p, k) => ({ id: `v${k}`, point: p }));
  const edges = pts.map((p, k) => ({ id: `e${k}`, curve: lineCurve(`e${k}`, p, pts[(k + 1) % pts.length]), vertices: [`v${k}`, `v${(k + 1) % pts.length}`] }));
  const plane = surface ?? { kind: 'surface', id: 'p', degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], controlPoints: [[[-20, -20, 0], [-20, 20, 0]], [[20, -20, 0], [20, 20, 0]]], weights: [[1, 1], [1, 1]] };
  return buildBrep({ source: { family: 'test', id: 's' }, vertices, edges, ...(tol ? { tolerance: tol } : {}),
    bodies: [{ id: 'b', kind: 'sheet', shells: [{ id: 's', closed: false, faces: [{ id: 'f', surface: plane, sense: 'forward', loops: [{ kind: 'outer', uses: edges.map(e => ({ edge: e.id, sense: 'forward' })) }] }] }] }] });
}
const square = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]];

test('strict L0: a clean sheet and the corpus\'s models pass; the default check stays as it was', () => {
  const r = checkBrep(sheet(square), { strict: true });
  assert.equal(r.valid, true, r.issues[0]); assert.equal(r.maximumEdgeSurfaceGap, 0);
  const box = evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [{ id: 's', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 5 }, { id: 'c', kind: 'extrude', sketch: 's', height: 10 }] }).outputs[0].brep;
  assert.equal(checkBrep(box, { strict: true }).valid, true);
  assert.equal(checkBrep(box).maximumEdgeSurfaceGap, 0, 'not measured unless strict');
});

test('strict L0: an edge off its face\'s surface, a crossing loop, a sliver and a blown-up tolerance are each reported', () => {
  // The face's plane lifted 0.5 mm: every edge is off it.
  const lifted = { kind: 'surface', id: 'p', degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], controlPoints: [[[-20, -20, 0.5], [-20, 20, 0.5]], [[20, -20, 0.5], [20, 20, 0.5]]], weights: [[1, 1], [1, 1]] };
  const off = checkBrep(sheet(square, { surface: lifted }), { strict: true });
  assert.ok(off.issues.some(i => /^geometry: edge e\d is 5\.00e-1 mm off the surface of face \S*f$/.test(i)), off.issues[0]);
  assert.ok(Math.abs(off.maximumEdgeSurfaceGap - 0.5) < 1e-12);
  // A bow tie: its loop crosses itself.
  const bow = checkBrep(sheet([[0, 0, 0], [10, 10, 0], [10, 0, 0], [0, 10, 0]]), { strict: true });
  assert.ok(bow.issues.some(i => /loops cross or touch/.test(i)), bow.issues.join('; '));
  // 10 mm long, 1e-9 mm wide.
  const sliver = checkBrep(sheet([[0, 0, 0], [10, 0, 0], [10, 1e-9, 0], [0, 1e-9, 0]], { tol: 1e-7 }), { strict: true });
  assert.ok(sliver.issues.some(i => /is a sliver/.test(i)), sliver.issues.join('; '));
  // A tolerance of 1 mm on a 10 mm sheet (the cap: 1e-3 of the size).
  const loose = checkBrep(sheet(square, { tol: 1 }), { strict: true });
  assert.ok(loose.issues.some(i => /^tolerance: edge e0 tolerance 1 mm is past the cap/.test(i)), loose.issues.join('; '));
  for (const r of [off, bow, sliver, loose]) assert.equal(r.valid, false);
});

// A sheet on z = 0 bounded by `parts`, each a line (its two points) or an arc ({ r, from, to } in degrees about the
// origin, one rational quadratic span per at most 90°); consecutive parts share their ends.
function curvedSheet(parts) {
  const at = (r, deg) => [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180), 0];
  const curve = (id, p) => {
    if (Array.isArray(p)) return lineCurve(id, p[0], p[1]);
    const spans = Math.ceil(Math.abs(p.to - p.from) / 90), dt = (p.to - p.from) / spans, w = Math.cos(Math.abs(dt) * Math.PI / 360), cp = [at(p.r, p.from)], wt = [1], knots = [0, 0, 0];
    for (let k = 0; k < spans; k++) { cp.push(at(p.r / w, p.from + dt * (k + 0.5)), at(p.r, p.from + dt * (k + 1))); wt.push(w, 1); if (k < spans - 1) knots.push((k + 1) / spans, (k + 1) / spans); }
    return { kind: 'curve', id, degree: 2, knots: [...knots, 1, 1, 1], controlPoints: cp, weights: wt };
  };
  const curves = parts.map((p, k) => curve(`e${k}`, p)), vertices = curves.map((c, k) => ({ id: `v${k}`, point: c.controlPoints[0] }));
  const edges = curves.map((c, k) => ({ id: `e${k}`, curve: c, vertices: [`v${k}`, `v${(k + 1) % curves.length}`] }));
  const plane = { kind: 'surface', id: 'p', degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], controlPoints: [[[-20, -20, 0], [-20, 20, 0]], [[20, -20, 0], [20, 20, 0]]], weights: [[1, 1], [1, 1]] };
  return buildBrep({ source: { family: 'test', id: 's' }, vertices, edges,
    bodies: [{ id: 'b', kind: 'sheet', shells: [{ id: 's', closed: false, faces: [{ id: 'f', surface: plane, sense: 'forward', loops: [{ kind: 'outer', uses: edges.map(e => ({ edge: e.id, sense: 'forward' })) }] }] }] }] });
}
const deg = (r, d) => [r * Math.cos(d * Math.PI / 180), r * Math.sin(d * Math.PI / 180), 0];

test('strict L0: a strip thinner than a curve\'s chord sagitta is not a crossing; a line across an arc still is (D191)', () => {
  // A 0.01 mm strip inside a quarter arc of radius 10: its 9-sample chords dip 0.048 mm inside the arc, across the
  // inner arc's samples (taken at other angles), though the edges themselves are 0.01 mm apart (L4 fuzz 83, 93).
  const strip = checkBrep(curvedSheet([{ r: 10, from: 0, to: 90 }, [deg(10, 90), deg(9.99, 85)], { r: 9.99, from: 85, to: 5 }, [deg(9.99, 5), deg(10, 0)]]), { strict: true });
  assert.equal(strip.valid, true, strip.issues.join('; '));
  // A line from the arc's end across it, out to (8, 8) and back: the loop crosses itself at (4.7, 8.8).
  const across = checkBrep(curvedSheet([{ r: 10, from: 0, to: 90 }, [deg(10, 90), [8, 8, 0]], [[8, 8, 0], deg(10, 0)]]), { strict: true });
  assert.ok(across.issues.some(i => /loops cross or touch/.test(i)), across.issues.join('; '));
});

// A sheet on z = 0: `points` its vertices, `loops` each a list of vertex indices (the first outer, the rest holes),
// joined by lines.
function loopSheet(points, loops) {
  const vertices = points.map((p, k) => ({ id: `v${k}`, point: [...p, 0] })), edges = [];
  const uses = loops.map(l => l.map((v, k) => { const w = l[(k + 1) % l.length], id = `e${edges.length}`; edges.push({ id, curve: lineCurve(id, [...points[v], 0], [...points[w], 0]), vertices: [`v${v}`, `v${w}`] }); return { edge: id, sense: 'forward' }; }));
  const plane = { kind: 'surface', id: 'p', degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1], controlPoints: [[[-20, -20, 0], [-20, 20, 0]], [[20, -20, 0], [20, 20, 0]]], weights: [[1, 1], [1, 1]] };
  return buildBrep({ source: { family: 'test', id: 's' }, vertices, edges,
    bodies: [{ id: 'b', kind: 'sheet', shells: [{ id: 's', closed: false, faces: [{ id: 'f', surface: plane, sense: 'forward', loops: uses.map((u, k) => ({ kind: k ? 'inner' : 'outer', uses: u })) }] }] }] });
}

test('strict L0: a loop through one vertex twice, or a hole touching its outer loop at a shared vertex, is a face (D194)', () => {
  const touch = /loops cross or touch/;
  // Two triangles meeting at v0 (5, 5), one loop through it twice: the crescent ring's shape (prismatic solids).
  const eight = checkBrep(loopSheet([[5, 5], [0, 0], [10, 0], [10, 10], [0, 10]], [[0, 1, 2, 0, 3, 4]]), { strict: true });
  assert.equal(eight.valid, true, eight.issues.join('; '));
  assert.equal(eight.topology[0].genus, null, 'a pinched boundary does not have an orientable manifold genus');
  // A square with a triangular hole whose corner is v1 (5, 0), a vertex of the square's side.
  const hole = checkBrep(loopSheet([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10], [4, 3], [6, 3]], [[0, 1, 2, 3, 4], [1, 5, 6]]), { strict: true });
  assert.equal(hole.valid, true, hole.issues.join('; '));
  assert.equal(hole.topology[0].genus, null, 'touching boundary components keep their validity without an invented genus');
  // Still touches: the loop crossing itself at v0 (its two passes alternate about it); the hole's corner a vertex of its
  // own at the same point (identity decides, never nearness); the hole's corner inside the square's side; v0 passed
  // three times.
  for (const [name, b] of [
    ['crossing at a vertex', loopSheet([[5, 5], [0, 0], [10, 0], [10, 10], [0, 10]], [[0, 1, 2, 0, 4, 3]])],
    ['a distinct vertex at the point', loopSheet([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10], [4, 3], [6, 3], [5, 0]], [[0, 1, 2, 3, 4], [7, 5, 6]])],
    ['inside a segment', loopSheet([[0, 0], [10, 0], [10, 10], [0, 10], [4, 3], [6, 3], [5, 0]], [[0, 1, 2, 3], [6, 4, 5]])],
    ['three passes', loopSheet([[5, 5], [0, 0], [4, 0], [6, 0], [10, 0], [10, 10], [0, 10]], [[0, 1, 2, 0, 3, 4, 0, 5, 6]])],
  ]) { const r = checkBrep(b, { strict: true }); assert.ok(r.issues.some(i => touch.test(i)), `${name}: ${r.issues.join('; ')}`); }
});

// Exact unit rectangles sharing complete native edges, with no geometric tolerance used to join topology.
function cellSheet(cells, separateShells = false) {
  const vertices = new Map(), edges = new Map();
  const faces = cells.map(([x, y], i) => {
    const p = [[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]], ids = p.map(point => `v${point[0]}_${point[1]}`);
    p.forEach((point, k) => vertices.set(ids[k], { id: ids[k], point }));
    const uses = ids.map((start, k) => {
      const end = ids[(k + 1) % 4], pair = [start, end].sort(), id = pair.join('__');
      if (!edges.has(id)) edges.set(id, { id, vertices: pair, curve: lineCurve(id, vertices.get(pair[0]).point, vertices.get(pair[1]).point) });
      return { edge: id, sense: start === pair[0] ? 'forward' : 'reversed' };
    });
    return { id: `f${i}`, surface: { kind: 'surface', id: `p${i}`, degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1],
      controlPoints: [[p[0], p[3]], [p[1], p[2]]], weights: [[1, 1], [1, 1]] }, sense: 'forward', loops: [{ kind: 'outer', uses }] };
  });
  const shells = separateShells ? faces.map((face, i) => ({ id: `s${i}`, closed: false, faces: [face] })) : [{ id: 's', closed: false, faces }];
  return buildBrep({ source: { family: 'test-open-genus', id: 'rectangles' }, vertices: [...vertices.values()], edges: [...edges.values()], bodies: [{ id: 'b', kind: 'sheet', shells }] });
}

function storedSheet(name, keep = () => true, declaredClosed = false) {
  const brep = JSON.parse(readFileSync(new URL(`./fixtures/legacy-inputs/${name}.json`, import.meta.url), 'utf8'));
  brep.faces = brep.faces.filter(face => keep(face, brep));
  const faceIds = new Set(brep.faces.map(face => face.id));
  brep.loops = brep.loops.filter(loop => faceIds.has(loop.face));
  const loopIds = new Set(brep.loops.map(loop => loop.id));
  brep.coedges = brep.coedges.filter(use => loopIds.has(use.loop));
  const useIds = new Set(brep.coedges.map(use => use.id));
  for (const use of brep.coedges) if (!useIds.has(use.twin)) use.twin = null;
  const edgeIds = new Set(brep.coedges.map(use => use.edge)); brep.edges = brep.edges.filter(edge => edgeIds.has(edge.id));
  const vertexIds = new Set(brep.edges.flatMap(edge => edge.vertices)); brep.vertices = brep.vertices.filter(vertex => vertexIds.has(vertex.id));
  for (const shell of brep.shells) { shell.faces = shell.faces.filter(id => faceIds.has(id)); shell.closed = declaredClosed; }
  for (const body of brep.bodies) body.kind = 'sheet';
  return brep;
}

test('open orientable sheets report boundary-corrected genus for a disk, adjacent rectangles and holes', () => {
  const adjacent = cellSheet([[0, 0], [1, 0]]);
  const annulus = loopSheet([[0, 0], [10, 0], [10, 10], [0, 10], [2, 2], [2, 8], [8, 8], [8, 2]], [[0, 1, 2, 3], [4, 5, 6, 7]]);
  const twoHoles = loopSheet([[0, 0], [10, 0], [10, 10], [0, 10], [1, 1], [1, 3], [3, 3], [3, 1], [6, 6], [6, 8], [8, 8], [8, 6]], [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11]]);
  for (const brep of [sheet(square), adjacent, annulus, twoHoles]) for (const strict of [false, true]) {
    const before = structuredClone(brep), report = checkBrep(brep, { strict });
    assert.equal(report.valid, true, report.issues.join('; ')); assert.equal(report.topology[0].genus, 0);
    assert.deepEqual(brep, before, 'reporting does not mutate native input');
    assert.equal(JSON.parse(JSON.stringify(report)).topology[0].genus, 0);
  }
  assert.deepEqual(checkBrep(adjacent).topology[0], { body: 'b', vertices: 6, edges: 7, faces: 2, loops: 2, shells: 1, genus: 0 });
  adjacent.bodies[0].kind = 'solid';
  const openSolid = checkBrep(adjacent, { strict: true });
  assert.equal(openSolid.valid, true, openSolid.issues.join('; ')); assert.equal(openSolid.topology[0].genus, 0, 'body kind alone does not invent a boundary cap');
});

test('periodic native cylinder sheet keeps a paired same-face seam and two single-edge boundary circles', () => {
  const brep = storedSheet('brep-cylinder', face => face.id.endsWith('_wall'));
  const report = checkBrep(brep, { strict: true });
  assert.equal(report.valid, true, report.issues.join('; '));
  assert.deepEqual(report.topology[0], { body: 'circle-prism', vertices: 2, edges: 3, faces: 1, loops: 1, shells: 1, genus: 0 });
  assert.equal(brep.edges.filter(edge => edge.vertices[0] === edge.vertices[1]).length, 2);
  const seamUses = brep.coedges.filter(use => use.twin !== null); assert.equal(seamUses.length, 2);
  const unpaired = structuredClone(brep);
  for (const use of unpaired.coedges) use.twin = null;
  const uncertain = checkBrep(unpaired, { strict: true });
  assert.equal(uncertain.valid, true, uncertain.issues.join('; '));
  assert.equal(uncertain.topology[0].genus, null, 'two unpaired uses are not free boundary edges');
});

test('closed sheets retain numerical genus regardless of the closed tag; a punctured handle retains genus one', () => {
  for (const declaredClosed of [false, true]) for (const [name, genus] of [['brep-cube', 0], ['brep-hole-plate', 1]]) {
    const report = checkBrep(storedSheet(name, undefined, declaredClosed), { strict: true });
    assert.equal(report.valid, true, report.issues.join('; ')); assert.equal(report.topology[0].genus, genus);
  }
  const plate = storedSheet('brep-hole-plate');
  const removed = plate.faces.find(face => face.loops.length === 1 && plate.loops.find(loop => loop.id === face.loops[0]).coedges.length === 4);
  assert.ok(removed, 'stored genus-one plate has a disk face');
  const punctured = storedSheet('brep-hole-plate', face => face.id !== removed.id), report = checkBrep(punctured, { strict: true });
  assert.equal(report.valid, true, report.issues.join('; ')); assert.equal(report.topology[0].genus, 1);
});

test('multiple open shells sum their genera; shared or disconnected incidence remains undefined without new validity errors', () => {
  const disjoint = checkBrep(cellSheet([[0, 0], [3, 0]], true), { strict: true });
  assert.equal(disjoint.valid, true, disjoint.issues.join('; ')); assert.equal(disjoint.topology[0].shells, 2); assert.equal(disjoint.topology[0].genus, 0);
  const touching = checkBrep(cellSheet([[0, 0], [1, 1]], true), { strict: true });
  assert.equal(touching.valid, true, touching.issues.join('; ')); assert.equal(touching.topology[0].genus, null);
  assert.equal(JSON.parse(JSON.stringify(touching)).topology[0].genus, null);
  const disconnected = checkBrep(cellSheet([[0, 0], [3, 0]]));
  assert.equal(disconnected.valid, false); assert.ok(disconnected.issues.some(issue => /is not connected/.test(issue)));
  assert.equal(disconnected.topology[0].genus, null);
  const duplicate = cellSheet([[0, 0]]); duplicate.vertices.push(structuredClone(duplicate.vertices[0]));
  const invalid = checkBrep(duplicate); assert.equal(invalid.valid, false); assert.equal(invalid.topology[0].genus, null);
  const dangling = cellSheet([[0, 0]]); dangling.coedges[0].twin = dangling.coedges[0].id;
  const broken = checkBrep(dangling); assert.equal(broken.valid, false); assert.equal(broken.topology[0].genus, null);
});

test('strict L0 at a pole: an edge along a sphere patch\'s meridian from its pole is on it (no false gap)', () => {
  // Every edge of a box filleted all round: the corner balls' patches have poles; their edges lie on them exactly.
  const D = f => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: f });
  const box = [{ id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] }, { id: 'e', kind: 'extrude', sketch: 's', height: 10 }];
  const edges = evaluateCadPart(D(box)).outputs[0].brep.edges.map(e => e.name);
  const r = checkOutput(evaluateCadPart(D([...box, { id: 'f', kind: 'fillet', target: 'e', edges, radius: 2 }])).outputs[0]);
  assert.equal(r.valid, true, r.issues[0]); assert.ok(r.maximumEdgeSurfaceGap < 1e-8, `${r.maximumEdgeSurfaceGap}`);
});
