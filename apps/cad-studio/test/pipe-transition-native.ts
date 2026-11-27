import assert from 'node:assert/strict';
import {
  brepMassProperties, checkBrep, curveDomain, diagnoseMesh, evaluateCurve, evaluateSurface, faceGeometry,
  surfaceDomain, tessellateBrep, type Brep, type BrepFace, type Point,
} from '@barocss/cad';
import { emptyDoc, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';

export const fixture = {
  lower: { center: [0, 0], z: 0, outer: 12, inner: 10 },
  upper: { center: [8, 0], z: 30, outer: 8, inner: 6 },
  mid: { center: [4, 0], z: 15, outer: 10, inner: 8 },
  pipeRun: 8,
} as const;
type Station = typeof fixture.lower | typeof fixture.upper | typeof fixture.mid;
const tolerance = 1e-6;
const samples = [0, 0.125, 0.25, 0.5, 0.75, 0.875, 1];
const close = (a: number, b: number) => Math.abs(a - b) < tolerance;

function circle(doc: StudioDoc, z: number, center: readonly [number, number], radius: number) {
  return withNode(doc, { kind: 'sketch', profile: 'circle', radius, center: [...center],
    ...(z === 0 ? {} : { plane: { origin: [0, 0, z], normal: [0, 0, 1], xAxis: [1, 0, 0] } }),
  });
}

function pipe(doc: StudioDoc, z: number, station: Station) {
  const sketch = doc.nodes.length, drawn = circle(doc, z, station.center, station.outer);
  const stock = withNode(drawn, { kind: 'extrude', sketch, height: fixture.pipeRun });
  return withNode(stock, {
    kind: 'hole', parent: { node: sketch + 1, side: 'solid' }, axis: 'z', side: 'max', radius: station.inner, center: [...station.center],
  });
}

export function pipeTransitionFixture() {
  const { lower, upper, pipeRun } = fixture;
  const inlet = pipe(emptyDoc(), lower.z - pipeRun, lower);
  let doc = pipe(inlet, upper.z, upper);
  for (const radius of ['outer', 'inner'] as const) {
    for (const station of [lower, upper]) doc = circle(doc, station.z, station.center, station[radius]);
  }
  return { ...doc, bodies: { b1: { name: 'Inlet pipe', color: '#53798f' }, b4: { name: 'Outlet pipe', color: '#53798f' } } };
}

function readRing(brep: Brep, cap: BrepFace, station: Station, kind: 'outer' | 'inner') {
  const loop = brep.loops.find(item => cap.loops.includes(item.id) && item.kind === kind);
  assert.ok(loop);
  assert.equal(loop.coedges.length, 4);
  const twins: string[] = [], radii: number[] = [];
  for (const id of loop.coedges) {
    const use = brep.coedges.find(edge => edge.id === id)!;
    const twin = brep.coedges.find(edge => edge.id === use.twin)!;
    assert.equal(twin.twin, id);
    assert.notEqual(twin.sense, use.sense);
    twins.push(brep.loops.find(item => item.id === twin.loop)!.face);
    const edge = brep.edges.find(item => item.id === use.edge)!;
    const [lo, hi] = curveDomain(edge.curve);
    for (const t of samples) {
      const [x, y, z] = evaluateCurve(edge.curve, lo + (hi - lo) * t);
      assert.ok(close(z, station.z));
      const radius = Math.hypot(x - station.center[0], y - station.center[1]);
      assert.ok(close(radius, station[kind]), JSON.stringify({ kind, z, radius }));
      radii.push(radius);
    }
  }
  assert.equal(new Set(twins).size, 4);
  return { walls: twins.sort(), diameter: 2 * radii.reduce((sum, radius) => sum + radius, 0) / radii.length };
}

function readMidWall(brep: Brep, ids: readonly string[], kind: 'outer' | 'inner') {
  const { lower, upper, mid } = fixture;
  const radii: number[] = [];
  function radial([x, y]: Point) { return Math.hypot(x - mid.center[0], y - mid.center[1]); }
  for (const id of ids) {
    const face = brep.faces.find(item => item.id === id)!;
    const { surface } = face;
    assert.ok(surface.kind === 'surface');
    assert.deepEqual([surface.degreeU, surface.degreeV, face.sense], [2, 1, kind === 'outer' ? 'forward' : 'reversed']);
    assert.ok(surface.weights.every(([lo, hi]) => lo === hi));
    for (const [[x0, y0, z0], [x1, y1, z1]] of surface.controlPoints) {
      assert.ok(close(z0, lower.z) && close(z1, upper.z));
      assert.ok(close((x0 - lower.center[0]) / lower[kind], (x1 - upper.center[0]) / upper[kind]));
      assert.ok(close((y0 - lower.center[1]) / lower[kind], (y1 - upper.center[1]) / upper[kind]));
    }
    const { u, v } = surfaceDomain(surface), station = (v[0] + v[1]) / 2;
    for (const fraction of samples) {
      const p = evaluateSurface(surface, u[0] + (u[1] - u[0]) * fraction, station);
      assert.ok(close(p[2], mid.z));
      assert.ok(close(radial(p), mid[kind]), JSON.stringify({ kind, p }));
      radii.push(radial(p));
    }
  }
  return { min: Math.min(...radii), max: Math.max(...radii) };
}

/** Measure the native trims independently of the tessellation and the authored recipe. */
function transitionEvidence(brep: Brep) {
  const check = checkBrep(brep, { strict: true });
  assert.ok(check.valid, JSON.stringify(check.issues));
  assert.equal(check.topology.length, 1);
  assert.deepEqual([check.topology[0].genus, check.counts.shells, check.counts.faces], [1, 1, 10]);
  const capFaces = brep.faces.flatMap(face => {
    const surface = faceGeometry(face);
    return surface.kind === 'plane' ? [{ face, surface }] : [];
  }).sort((a, b) => a.surface.o[2] - b.surface.o[2]);
  assert.equal(capFaces.length, 2);
  const rims = [fixture.lower, fixture.upper].map((station, index) => {
    const { face, surface } = capFaces[index];
    assert.ok(close(surface.o[2], station.z));
    assert.ok(close(surface.n[2], index ? 1 : -1));
    assert.equal(face.loops.length, 2);
    return { face: face.name, z: station.z, outer: readRing(brep, face, station, 'outer'), inner: readRing(brep, face, station, 'inner') };
  });
  for (const wall of ['inner', 'outer'] as const) assert.deepEqual(rims[0][wall].walls, rims[1][wall].walls);
  assert.equal(new Set([...rims[0].inner.walls, ...rims[0].outer.walls]).size, 8);
  const outer = readMidWall(brep, rims[0].outer.walls, 'outer');
  const inner = readMidWall(brep, rims[0].inner.walls, 'inner');
  const minSectionWall = outer.min - inner.max;
  assert.ok(close(minSectionWall, 2));
  const { volume } = brepMassProperties(brep, 1);
  assert.ok(close(volume, 1080 * Math.PI), JSON.stringify(volume));
  const mesh = tessellateBrep(brep);
  const diagnosis = diagnoseMesh(mesh.positions, mesh.indices, { weldDistance: 1e-7 });
  assert.deepEqual([diagnosis.closed, diagnosis.pieces, diagnosis.selfIntersections], [true, 1, 0]);
  return { check, volume, rims, mid: { inner, outer, minSectionWall }, diagnosis };
}

export function inspectPipeTransition(doc: StudioDoc, transitionKey?: string) {
  return partBreps(doc).map(({ key, brep }) => ({ key, sha256: digestOf(brep),
    ...(key === transitionKey ? { transition: transitionEvidence(brep) } : { volume: brepMassProperties(brep, 1).volume }),
  }));
}
