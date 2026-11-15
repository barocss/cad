import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { printOpenSurfaceWarnings, printSourceBodies, printSourceMeshes } from '../src/viewport/printSettings';
const nodes = [{ kind: 'extrude', sketch: 0, height: 8 }, { kind: 'oring', id: 'n1' }] as unknown as ModelNode[];
const doc = (patch: Partial<StudioDoc> = {}): StudioDoc => ({ ...emptyDoc(), nodes, ...patch });
const body = (key: string, node: number, topology?: BodyResult['topology']): BodyResult => ({
  key, ref: { node, side: 'solid' }, topology,
  mesh: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) },
}) as BodyResult;
const open = { kind: 'sheet' as const, openShells: 1, boundaryEdges: 4 };

test('warnings name and key only actual made visible print sources; meshes and inputs remain unchanged', () => {
  const bodies = [body('cover', 0, open), body('hidden', 0, open), body('ring', 1, open)];
  const input = doc({ bodies: { cover: { name: 'Open cover' }, hidden: { hidden: true } } });
  const beforeDoc = JSON.stringify(input), beforeBodies = structuredClone(bodies);
  assert.deepEqual(printSourceBodies(input, bodies), [bodies[0]]);
  assert.equal(printSourceMeshes(input, bodies)[0], bodies[0].mesh);
  const warnings = printOpenSurfaceWarnings(input, bodies);
  assert.equal(warnings.length, 1); assert.match(warnings[0], /Open cover \(cover\), 4 native boundary edges/);
  assert.match(warnings[0], /may be incomplete; open chains are omitted/);
  assert.equal(JSON.stringify(input), beforeDoc); assert.deepEqual(bodies, beforeBodies);
  const made = doc({ nodes: nodes.map((n, i) => i === 1 ? { ...n, bought: false } : n) as ModelNode[] });
  assert.equal(printOpenSurfaceWarnings(made, bodies).length, 3);
});

test('closed, closed sheet and unknown topology never become confirmed open warnings', () => {
  const bodies = [body('solid', 0, { kind: 'solid', openShells: 0, boundaryEdges: 0 }),
    body('closed-sheet', 0, { kind: 'sheet', openShells: 0, boundaryEdges: 0 }), body('legacy', 0),
    body('unknown', 0, { kind: 'unknown', openShells: null, boundaryEdges: null })];
  assert.deepEqual(printOpenSurfaceWarnings(doc(), bodies), []);
  assert.deepEqual(printSourceMeshes(doc(), bodies), bodies.map(b => b.mesh));
});

test('mixed open native bodies and either positive native indication warn without inferring contour counts', () => {
  const bodies = [body('mixed', 0, { kind: 'mixed', openShells: 1, boundaryEdges: 8 }),
    body('one-edge', 0, { kind: 'sheet', openShells: 0, boundaryEdges: 1 }),
    body('shell', 0, { kind: 'sheet', openShells: 1, boundaryEdges: null })];
  const warnings = printOpenSurfaceWarnings(doc(), bodies);
  assert.equal(warnings.length, 3); assert.match(warnings[0], /mixed \(mixed\), 8 native boundary edges/);
  assert.match(warnings[1], /1 native boundary edge\./); assert.match(warnings[2], /count unavailable/);
  assert.ok(warnings.every(w => w.includes('Native edge counts are not layer contour counts.')));
});
