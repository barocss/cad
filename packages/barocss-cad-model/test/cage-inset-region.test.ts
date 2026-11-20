import test from 'node:test';
import assert from 'node:assert/strict';
import { SubdError } from '@barocss/cad';
import {
  commitDrag, insetCageSelection, redoSession, startSession, undoSession,
  type CageSession, type StudioCage,
} from '../src/subd/cageEdit';

const skewPatch: StudioCage = {
  positions: [0, 0, 0, 4, 0, 0, 10, 0, 0, 16, 8, 0, 4, 8, 0, 0, 8, 0],
  faces: [[0, 1, 4, 5], [1, 2, 3, 4]],
  creases: [[2, 3], [5, 0]],
};
// The slanted boundary is 4x - 3y = 40. Its inward parallel at 1 mm is 4x - 3y = 35.
const skewInner = [[1, 1, 0], [4, 1, 0], [9.5, 1, 0], [14, 7, 0], [4, 7, 0], [1, 7, 0]];

function picked(cage: StudioCage, faces: number[], mirror?: CageSession['mirror']): CageSession {
  return { ...startSession(0, cage, mirror), mode: 'face', sel: { vertices: [], edges: [], faces } };
}

function selectedFaces(session: CageSession): number[][] {
  return session.sel.faces.map(face => session.cage.faces[face]);
}

function findSelectedVertices(session: CageSession, expected: readonly number[][]): number[] {
  const candidates = [...new Set(selectedFaces(session).flat())];
  assert.equal(candidates.length, expected.length);
  return expected.map(point => {
    const matches = candidates.filter(vertex =>
      Math.hypot(...point.map((value, axis) => session.cage.positions[3 * vertex + axis] - value)) < 1e-10);
    assert.equal(matches.length, 1, `expected one selected vertex at (${point.join(', ')})`);
    return matches[0];
  });
}

function sortedFace(face: readonly number[]): string {
  return [...face].sort((a, b) => a - b).join(',');
}

function assertSelectedTopology(session: CageSession, expected: number[][]): void {
  assert.deepEqual(selectedFaces(session).map(sortedFace).sort(), expected.map(sortedFace).sort());
}

function openEdges(faces: readonly number[][]): string[] {
  const edges = new Map<string, number[][]>();
  for (const face of faces) {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length];
      const key = sortedFace([a, b]);
      edges.set(key, [...(edges.get(key) ?? []), [a, b]]);
    });
  }
  const boundary: string[] = [];
  for (const [key, uses] of edges) {
    assert.ok(uses.length < 3, `edge ${key} has ${uses.length} uses`);
    if (uses.length === 1) boundary.push(key);
    else assert.deepEqual(uses[0], [uses[1][1], uses[1][0]], `edge ${key} has opposite winding`);
  }
  return boundary.sort();
}

function areaXY(cage: StudioCage, face: readonly number[]): number {
  return face.reduce((sum, a, i) => {
    const b = face[(i + 1) % face.length];
    return sum + cage.positions[3 * a] * cage.positions[3 * b + 1]
      - cage.positions[3 * b] * cage.positions[3 * a + 1];
  }, 0) / 2;
}

function totalAreaXY(cage: StudioCage, faces = cage.faces): number {
  const areas = faces.map(face => areaXY(cage, face));
  assert.ok(areas.every(area => area > 0));
  return areas.reduce((sum, area) => sum + area, 0);
}

function grid(size: number): StudioCage {
  const stride = size + 1;
  const positions = Array.from({ length: stride ** 2 }, (_, v) => [4 * (v % stride), 4 * Math.floor(v / stride), 0]).flat();
  const faces = Array.from({ length: size ** 2 }, (_, f) => {
    const v = (f % size) + Math.floor(f / size) * stride;
    return [v, v + 1, v + 1 + stride, v + stride];
  });
  return { positions, faces };
}

test('one inset around two skew quads preserves the outer boundary and selects the smooth inner patch', () => {
  const cage: StudioCage = {
    ...skewPatch,
    positions: [...skewPatch.positions, -3, 0, 0, -3, 8, 0],
    faces: [...skewPatch.faces, [6, 0, 5, 7]],
  };
  const session = picked(cage, [1, 0]);
  const before = structuredClone(session);
  const result = insetCageSelection(session, 1);
  assert.deepEqual(insetCageSelection(picked(cage, [0, 1]), 1).cage, result.cage);
  const inner = findSelectedVertices(result, skewInner);

  assert.equal(result.mode, 'face');
  assert.deepEqual(result.sel.edges, []);
  assert.deepEqual(result.sel.vertices, []);
  assert.deepEqual(result.cage.positions.slice(0, cage.positions.length), cage.positions);
  assert.deepEqual(result.cage.creases, cage.creases);
  assert.ok(result.cage.faces.some(face => sortedFace(face) === sortedFace(cage.faces[2])));
  assert.equal(result.cage.positions.length, cage.positions.length + 3 * 6);
  assert.equal(result.cage.faces.length, 3 + 6);
  assert.ok(result.cage.faces.every(face => face.length === 4));
  assertSelectedTopology(result, skewPatch.faces.map(face => face.map(v => inner[v])));
  assert.deepEqual(openEdges(result.cage.faces), openEdges(cage.faces));
  assert.ok(Math.abs(totalAreaXY(result.cage) - 128) < 1e-10);
  assert.ok(Math.abs(totalAreaXY(result.cage, selectedFaces(result)) - 64.5) < 1e-10);
  assert.deepEqual(session, before);

  assert.equal(result.undo.length, 1);
  const undone = undoSession(result);
  assert.deepEqual(undone.cage, session.cage);
  assert.deepEqual(undone.sel, session.sel);
  assert.deepEqual(redoSession(undone), result);

  const raised = commitDrag(result, [0, 0, 3], true);
  const top = findSelectedVertices(raised, skewInner.map(([x, y]) => [x, y, 3]));
  assertSelectedTopology(raised, skewPatch.faces.map(face => face.map(v => top[v])));
  assert.equal(raised.cage.faces.length, result.cage.faces.length + 6);
  assert.deepEqual(raised.cage.positions.slice(0, result.cage.positions.length), result.cage.positions);
  assert.deepEqual(openEdges(raised.cage.faces), openEdges(cage.faces));
  assert.equal(raised.undo.length, 2);
});

test('four quad neighbors retain a shared interior vertex at the center of the inset patch', () => {
  const cage = grid(2);
  const result = insetCageSelection(picked(cage, [3, 0, 2, 1]), 1);
  const inner = findSelectedVertices(result, [1, 4, 7].flatMap(y => [1, 4, 7].map(x => [x, y, 0])));

  assertSelectedTopology(result, cage.faces.map(face => face.map(v => inner[v])));
  assert.equal(selectedFaces(result).filter(face => face.includes(inner[4])).length, 4);
  assert.equal(result.cage.faces.length, 4 + 8);
  assert.deepEqual(openEdges(result.cage.faces), openEdges(cage.faces));
  assert.ok(Math.abs(totalAreaXY(result.cage) - 64) < 1e-10);
  assert.ok(Math.abs(totalAreaXY(result.cage, selectedFaces(result)) - 36) < 1e-10);
});

test('a rigidly tilted region retains the 1 mm offset', () => {
  // An orthonormal 3-4-5 rotation about X followed by translation.
  const tilt = ([x, y]: number[]) => [x + 15, 0.6 * y - 3, 0.8 * y + 2];
  const cage = {
    ...skewPatch,
    positions: skewPatch.positions.flatMap((_, i, positions) => i % 3 === 0 ? tilt(positions.slice(i, i + 3)) : []),
  };
  const result = insetCageSelection(picked(cage, [0, 1], 'x'), 1);
  const inner = findSelectedVertices(result, skewInner.map(tilt));

  assertSelectedTopology(result, skewPatch.faces.map(face => face.map(v => inner[v])));
  assert.deepEqual(result.cage.positions.slice(0, cage.positions.length), cage.positions);
  assert.deepEqual(openEdges(result.cage.faces), openEdges(cage.faces));
  assert.equal(result.mirror, 'x');
});

test('unsupported regions and collapse reject without changing the session', () => {
  const folded = { ...skewPatch, positions: [...skewPatch.positions] };
  folded.positions[11] = 1.2;
  folded.positions[8] = 0.6;
  const cases: [string, CageSession, number][] = [
    ['concave boundary', picked(grid(2), [0, 1, 2]), 1],
    ['hole', picked(grid(3), [0, 1, 2, 3, 5, 6, 7, 8]), 1],
    ['vertex contact only', picked(grid(2), [0, 3]), 1],
    ['coplanarity', picked(folded, [0, 1]), 1],
    ['repeated face', picked(skewPatch, [0, 1, 1]), 1],
    ['overlapping faces', picked({ ...skewPatch, faces: [skewPatch.faces[0], skewPatch.faces[0]] }, [0, 1]), 1],
    ['inconsistent shared edge', picked({ ...skewPatch, faces: [skewPatch.faces[0], [...skewPatch.faces[1]].reverse()] }, [0, 1]), 1],
    ['nonfinite distance', picked(skewPatch, [0, 1]), Infinity],
    ['reversed boundary segment', picked({
      ...skewPatch, positions: skewPatch.positions.map((v, i) => i === 3 || i === 12 ? 0.5 : v),
    }, [0, 1]), 1],
    ['invalid face index', picked(skewPatch, [0, 2]), 1],
    ['invalid vertex index', picked({ ...skewPatch, faces: [skewPatch.faces[0], [1, 2, 14, 4]] }, [0, 1]), 1],
    ['shared crease', picked({ ...skewPatch, creases: [[1, 4]] }, [0, 1]), 1],
    ['mirror seam', picked(skewPatch, [0, 1], 'x'), 1],
    ['collapse', picked(skewPatch, [0, 1]), 4],
  ];
  for (const [label, session, distance] of cases) {
    const before = structuredClone(session);
    assert.throws(() => insetCageSelection(session, distance), error => error instanceof SubdError && /inset: .+/.test(error.message), label);
    assert.deepEqual(session, before, label);
  }
});

test('world-coordinate rounding cannot move an inset off its plane', () => {
  const origin = 2 ** 52 + 1000;
  const cage = {
    positions: [[0, 0], [4, 0], [10, 0], [10, 10], [4, 10], [0, 10]]
      .flatMap(([x, y]) => [x, origin + 0.6 * y, origin + 0.8 * y]),
    faces: skewPatch.faces,
  };
  // A requested 1.4 mm offset rounds (0.84, 1.12) to (1, 1).
  // Its tangent projection is still 1.4 mm, but the normal error is 0.2 mm.
  for (const faces of [[0], [0, 1]]) {
    const session = picked(cage, faces), before = structuredClone(session);
    assert.throws(() => insetCageSelection(session, 1.4), /result coordinates exceed the supported precision/);
    assert.deepEqual(session, before);
  }
});
