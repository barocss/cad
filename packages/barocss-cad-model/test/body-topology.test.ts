import test from 'node:test';
import assert from 'node:assert/strict';
import { subdBrep } from '@barocss/cad';
import { boxCage } from '../src/app/primitives';
import { nativeBodyTopology } from '../src/engine/bodyTopology';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { deferMasses, evaluateDoc, evaluatePart, evaluatePreview, forgetSnapshots } from '../src/engine/evaluate';
const box = () => boxCage(30, 20, 16, 2, [0, 0, 0]);
const hole = () => { const cage = box(); return { ...cage, faces: cage.faces.slice(1) }; };
const doc = (open: boolean): StudioDoc => ({ ...emptyDoc(), nodes: [{ kind: 'subd', name: 'Topology box', cage: open ? hole() : box() }] });

test('native closed and open SubD classifications preserve input and count native boundary edges', () => {
  const closed = subdBrep(box()), open = subdBrep(hole());
  const before = JSON.stringify(open);
  assert.deepEqual(nativeBodyTopology(closed), { kind: 'solid', openShells: 0, boundaryEdges: 0 });
  const result = nativeBodyTopology(open);
  assert.equal(result.kind, 'sheet'); assert.equal(result.openShells, 1);
  const expected = new Set(open.coedges.filter(c => c.twin === null).map(c => c.edge)).size;
  assert.ok(expected > 0); assert.equal(result.boundaryEdges, expected);
  assert.equal(JSON.stringify(open), before);
});

test('missing or contradictory native topology is unknown; mixed native body kinds are not called solid', () => {
  const closed = subdBrep(box());
  const unknown = { kind: 'unknown', openShells: null, boundaryEdges: null };
  assert.deepEqual(nativeBodyTopology(null), unknown); assert.deepEqual(nativeBodyTopology(undefined), unknown);
  assert.deepEqual(nativeBodyTopology({ ...closed, bodies: [] }), unknown);
  assert.deepEqual(nativeBodyTopology({ ...closed, shells: [] }), unknown);
  assert.deepEqual(nativeBodyTopology({ ...closed, shells: closed.shells.map(s => ({ ...s, closed: false })) }), unknown);
  const open = subdBrep(hole(), { id: 'other-sheet' });
  const mixed = { ...closed, bodies: [...closed.bodies, ...open.bodies], shells: [...closed.shells, ...open.shells],
    faces: [...closed.faces, ...open.faces], loops: [...closed.loops, ...open.loops],
    coedges: [...closed.coedges, ...open.coedges], edges: [...closed.edges, ...open.edges], vertices: [...closed.vertices, ...open.vertices] };
  assert.deepEqual(nativeBodyTopology(mixed), { kind: 'mixed', openShells: 1, boundaryEdges: nativeBodyTopology(open).boundaryEdges });
  const closedSheet = { ...closed, bodies: closed.bodies.map(b => ({ ...b, kind: 'sheet' as const })) };
  assert.deepEqual(nativeBodyTopology(closedSheet), { kind: 'sheet', openShells: 0, boundaryEdges: 0 });
});

test('main, part and preview evaluations carry topology without using volume or deferred mass', () => {
  for (const open of [false, true]) {
    const input = doc(open), before = JSON.stringify(input);
    const main = evaluateDoc(input, 101), part = evaluatePart(input, 102), preview = evaluatePreview(input, 103);
    assert.ok(main.ok); assert.ok(part.ok); assert.ok(preview.ok);
    assert.equal(main.bodies.length, 1);
    const expected = main.bodies[0].topology;
    assert.equal(expected?.kind, open ? 'sheet' : 'solid');
    assert.deepEqual(part.bodies[0].topology, expected); assert.deepEqual(preview.bodies[0].topology, expected);
    assert.equal(preview.bodies[0].volume, null);
    forgetSnapshots(); deferMasses(true);
    try { const pending = evaluateDoc(input, 104); assert.ok(pending.ok); assert.deepEqual(pending.bodies[0].topology, expected); }
    finally { deferMasses(false); forgetSnapshots(); }
    assert.equal(JSON.stringify(input), before);
  }
});
