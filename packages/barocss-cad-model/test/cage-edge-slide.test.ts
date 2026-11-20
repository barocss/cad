import test from 'node:test';
import assert from 'node:assert/strict';
import { boxCage } from '../src/app/primitives';
import {
  cageEdgeSlideDirections, redoSession, runOp, select, slideCageSelection, startSession, undoSession,
  type CageSelection, type CageSession, type StudioCage,
} from '../src/subd/cageEdit';

const strip: StudioCage = {
  positions: [
    0, 0, 0,  4, 0, 0,  10, 0, 0,
    0, 4, 0,  5, 4, 0,  12, 4, 0,
    0, 8, 0,  6, 8, 0,  14, 8, 0,
  ],
  faces: [[0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7]],
  creases: [[1, 4], [1, 2], [6, 7]],
};
const loop: CageSelection['edges'] = [[1, 4], [4, 7]];
const selected = (cage = strip, edges = loop): CageSession => ({
  ...startSession(7, cage),
  mode: 'edge',
  sel: { vertices: [], edges, faces: [] },
});
const xyz = (cage: StudioCage, vertex: number) => cage.positions.slice(3 * vertex, 3 * vertex + 3);

function assertOnlyPositionsChanged(original: CageSession, result: CageSession, moved: ReadonlySet<number>) {
  assert.equal(result.cage.positions.length, original.cage.positions.length);
  for (let vertex = 0; vertex < original.cage.positions.length / 3; vertex++) {
    if (!moved.has(vertex)) assert.deepEqual(xyz(result.cage, vertex), xyz(original.cage, vertex));
  }
  assert.deepEqual(result.cage.faces, original.cage.faces);
  assert.deepEqual(result.cage.creases, original.cage.creases);
  assert.deepEqual(result.sel, original.sel);
  assert.equal(result.mode, original.mode);
  assert.equal(result.start, original.start);
  assert.equal(result.node, original.node);
}

test('an open quad strip follows each unequal rail from its baseline in either direction', () => {
  const s = selected();
  const before = structuredClone(s);
  assert.deepEqual(cageEdgeSlideDirections(s), { anchor: [1, 4], positive: [0, 3], negative: [2, 5] });
  for (const [ratio, expectedX] of [[.25, [3, 3.75, 4.5]], [-.5, [7, 8.5, 10]]] as const) {
    const moved = slideCageSelection(s, ratio);
    assert.deepEqual([1, 4, 7].map(vertex => [
      moved.cage.positions[3 * vertex], moved.cage.positions[3 * vertex + 1], moved.cage.positions[3 * vertex + 2],
    ]), expectedX.map((x, row) => [x, 4 * row, 0]));
    assertOnlyPositionsChanged(s, moved, new Set([1, 4, 7]));
    assert.equal(moved.undo.length, 1);
  }
  assert.deepEqual(s, before);
});

test('the regular closed box loop moves all 16 vertices and retains the cage connectivity', () => {
  const cage = boxCage(30, 20, 16, 4, [0, 0, 0]);
  const topSeed = cage.faces.flatMap(face => face.map((a, i) => [a, face[(i + 1) % face.length]]))
    .find(([a, b]) => [a, b].every(v => xyz(cage, v)[0] === 0 && xyz(cage, v)[2] === 16));
  assert.ok(topSeed);
  const [a, b] = topSeed;
  const seed = select(startSession(7, cage), { kind: 'edge', a, b }, false);
  const s = runOp(seed, 'select-loop');
  assert.equal(s.sel.edges.length, 16);
  const movedVertices = new Set(s.sel.edges.flat());
  assert.equal(movedVertices.size, 16);
  const { positive, negative } = cageEdgeSlideDirections(s);
  const positiveX = xyz(cage, positive[0])[0];
  assert.equal(Math.abs(positiveX), 7.5);
  assert.equal(xyz(cage, positive[1])[0], positiveX);
  for (const vertex of negative) assert.equal(xyz(cage, vertex)[0], -positiveX);

  for (const [ratio, targetX] of [[.25, Math.sign(positiveX) * 1.875], [-.5, -Math.sign(positiveX) * 3.75]]) {
    const moved = slideCageSelection(s, ratio);
    for (const vertex of movedVertices) {
      const [x, y, z] = xyz(cage, vertex);
      assert.equal(x, 0);
      assert.deepEqual(xyz(moved.cage, vertex), [targetX, y, z]);
    }
    assertOnlyPositionsChanged(s, moved, movedVertices);
  }
});

test('slide records one undo step and zero leaves the baseline and redo intact', () => {
  const s = selected();
  const moved = slideCageSelection(s, .25);
  assert.equal(moved.undo.length, 1);
  assert.equal(moved.redo.length, 0);
  const undone = undoSession(moved);
  assert.deepEqual(undone.cage, s.cage);
  assert.deepEqual(undone.sel, s.sel);
  assert.deepEqual(undone.undo, s.undo);
  assert.deepEqual(redoSession(undone), moved);
  assert.equal(slideCageSelection(undone, 0), undone);
  assert.equal(slideCageSelection(undone, -0), undone);
  const replacement = slideCageSelection(undone, -.5);
  assert.equal(replacement.undo.length, 1);
  assert.equal(replacement.redo.length, 0);
  assert.deepEqual(undoSession(replacement).cage, s.cage);
});

test('endpoint contact, crossing, and non-finite ratios preserve selection and redo', () => {
  const s = undoSession(slideCageSelection(selected(), .25));
  const before = structuredClone(s);
  for (const ratio of [-1, 1, -1.01, 1.01, NaN, -Infinity, Infinity]) {
    assert.throws(() => slideCageSelection(s, ratio), String(ratio));
    assert.deepEqual(s, before);
  }
});

test('ambiguous topology and degenerate rails refuse the whole slide', () => {
  const collapsedRail = structuredClone(strip);
  collapsedRail.positions.splice(3 * 3, 3, ...xyz(strip, 4));
  const nonFinite = structuredClone(strip);
  nonFinite.positions[3 * 5] = Infinity;
  const ngon = structuredClone(strip);
  ngon.positions.push(0, 2, 0);
  ngon.faces[0] = [0, 1, 4, 3, 9];
  const triangles = { ...strip, faces: [[0, 1, 4], [0, 4, 3], ...strip.faces.slice(1)] };
  const cube = boxCage(30, 20, 16, 1, [0, 0, 0]);
  const [poleA, poleB] = cube.faces[0];

  for (const [reason, s] of [
    ['boundary edge', selected(strip, [[0, 1]])],
    ['empty selection', selected(strip, [])],
    ['stale selection', selected(strip, [[1, 99]])],
    ['vertex pair with no edge', selected(strip, [[1, 7]])],
    ['branched selection', selected(strip, [...loop, [4, 5]])],
    ['non-manifold strip', selected({ ...strip, faces: [...strip.faces, strip.faces[0]] })],
    ['collapsed rail', selected(collapsedRail)],
    ['non-finite rail', selected(nonFinite)],
    ['triangle in the strip', selected(triangles)],
    ['n-gon in the strip', selected(ngon)],
    ['closed valence-three pole', selected(cube, [[poleA, poleB]])],
  ] as const) {
    const before = structuredClone(s);
    assert.throws(() => slideCageSelection(s, .25), reason);
    assert.deepEqual(s, before, reason);
  }
});

test('selection order and endpoint order do not reverse the ratio sign', () => {
  const s = selected();
  const reversed = selected(strip, [[7, 4], [4, 1]]);
  assert.deepEqual(cageEdgeSlideDirections(reversed), cageEdgeSlideDirections(s));
  assert.deepEqual(slideCageSelection(reversed, .25).cage, slideCageSelection(s, .25).cage);
});

test('a tilted planar strip interpolates along the full 3D rail', () => {
  const tilted = structuredClone(strip);
  for (let i = 0; i < tilted.positions.length; i += 3) {
    tilted.positions[i + 2] = tilted.positions[i] + 2 * tilted.positions[i + 1];
  }
  const s = selected(tilted);
  const moved = slideCageSelection(s, .25);
  assert.deepEqual([1, 4, 7].map(vertex => xyz(moved.cage, vertex)), [
    [3, 0, 3], [3.75, 4, 11.75], [4.5, 8, 20.5],
  ]);
  assertOnlyPositionsChanged(s, moved, new Set([1, 4, 7]));
});

test('mirror and warped rail refusals preserve the original cage and history', () => {
  const mirrored = { ...selected(), mirror: 'x' as const };
  const warped = structuredClone(strip);
  warped.positions[3 * 4 + 2] = 1;
  for (const s of [mirrored, selected(warped)]) {
    const before = structuredClone(s);
    assert.throws(() => cageEdgeSlideDirections(s));
    assert.throws(() => slideCageSelection(s, .25));
    assert.deepEqual(s, before);
  }
});

test('a rounded endpoint or off-rail advance cannot commit', () => {
  const tiltedAtLargeX = structuredClone(strip);
  const origin = 2 ** 52;
  for (let i = 0; i < tiltedAtLargeX.positions.length; i += 3) {
    const [x, y] = tiltedAtLargeX.positions.slice(i, i + 2);
    tiltedAtLargeX.positions[i] = origin + x;
    tiltedAtLargeX.positions[i + 2] = x + 2 * y;
  }
  const large = selected(tiltedAtLargeX);
  const baseline = structuredClone(large);
  assert.throws(() => slideCageSelection(large, .25), /coordinate precision/);
  assert.deepEqual(large, baseline);
  const ordinary = selected();
  for (const ratio of [1 - Number.EPSILON, Number.EPSILON - 1]) {
    assert.throws(() => slideCageSelection(ordinary, ratio), /endpoint|collapses/);
    assert.equal(ordinary.undo.length, 0);
  }
});

test('an inserted support loop can slide without inserting or splitting additional faces', () => {
  const cage = boxCage(30, 20, 16, 4, [0, 0, 0]);
  const base = selected(cage);
  const rail = cage.faces.flatMap(face => face.map((a, i) => [a, face[(i + 1) % face.length]]))
    .find(([a, b]) => {
      const [ax, ay, az] = xyz(cage, a), [bx, by, bz] = xyz(cage, b);
      return ax === 0 && bx === 7.5 && ay === by && az === 16 && bz === 16;
    });
  assert.ok(rail);
  const inserted = runOp(select(base, { kind: 'edge', a: rail[0], b: rail[1] }, false), 'insert-loop', 0.01, .25);
  assert.equal(inserted.sel.edges.length, 16);
  assert.equal(inserted.undo.length, 1);
  const { positive } = cageEdgeSlideDirections(inserted);
  const moved = slideCageSelection(inserted, .5);
  const targetX = xyz(inserted.cage, positive[0])[0];
  assert.ok(targetX === 0 || targetX === 7.5);
  const loopVertices = new Set(inserted.sel.edges.flat());
  for (const vertex of loopVertices) {
    const [x, y, z] = xyz(inserted.cage, vertex);
    assert.ok(x === 1.875 || x === 5.625);
    assert.deepEqual(xyz(moved.cage, vertex), [(x + targetX) / 2, y, z]);
  }
  assertOnlyPositionsChanged(inserted, moved, loopVertices);
  assert.deepEqual(undoSession(moved).cage, inserted.cage);
});
