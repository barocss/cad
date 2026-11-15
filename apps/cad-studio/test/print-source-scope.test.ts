import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { printSourceScope, printSourceScopeHint, printEmptySourceReason, printSourceBodies, printSourceMeshes } from '../src/viewport/printSettings';
const nodes = [{ kind: 'extrude', id: 'n0', sketch: 0, height: 8 }, { kind: 'oring', id: 'n1' }] as unknown as ModelNode[];
const doc = (patch: Partial<StudioDoc> = {}): StudioDoc => ({ ...emptyDoc(), nodes, ...patch });
const body = (key: string, node: number): BodyResult => ({
  key, ref: { node, side: 'solid' },
  mesh: { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) },
}) as BodyResult;
const bodies = [body('cover', 0), body('ring', 1)];
test('scope names actual made roots and visible default-purchased exclusions without changing inputs or meshes', () => {
  const input = doc({ bodies: { cover: { name: 'Cover' }, ring: { name: 'Seal' } } });
  const before = structuredClone({ input, bodies });
  assert.deepEqual(printSourceScope(input, bodies), { included: [{ key: 'cover', name: 'Cover' }], excludedBought: [{ key: 'ring', name: 'Seal' }] });
  assert.deepEqual(printSourceBodies(input, bodies), [bodies[0]]);
  assert.equal(printSourceMeshes(input, bodies)[0], bodies[0].mesh);
  const hint = printSourceScopeHint(input, bodies)!;
  assert.match(hint, /Layer sources: 1 made bodies/);
  assert.match(hint, /Seal \(ring\)/); assert.match(hint, /visible\/selectable/);
  assert.match(hint, /not layer results/); assert.match(hint, /Inspect → BOM/);
  assert.deepEqual({ input, bodies }, before);
});
test('explicit made and bought overrides recompute from the current nodes, including undo-shaped input reuse', () => {
  const base = doc(), changed = doc({ nodes: nodes.map((n, i) => ({ ...n, bought: i === 0 })) as ModelNode[] });
  assert.deepEqual(printSourceScope(changed, bodies).included.map(b => b.key), ['ring']);
  assert.deepEqual(printSourceScope(changed, bodies).excludedBought.map(b => b.key), ['cover']);
  assert.deepEqual(printSourceScope(base, bodies).included.map(b => b.key), ['cover']);
  const allMade = doc({ nodes: nodes.map(n => ({ ...n, bought: false })) as ModelNode[] });
  assert.equal(printSourceScopeHint(allMade, bodies), undefined);
  assert.equal(printSourceScope(allMade, bodies).included.length, 2);
});
test('hidden bought bodies are neither layer sources nor listed exclusions, and all-visible-bought differs from empty', () => {
  const hiddenBought = doc({ bodies: { ring: { hidden: true } } });
  assert.equal(printSourceScopeHint(hiddenBought, bodies), undefined);
  assert.equal(printSourceScope(hiddenBought, bodies).excludedBought.length, 0);
  const hiddenMade = doc({ bodies: { cover: { hidden: true } } });
  assert.match(printEmptySourceReason(hiddenMade, bodies), /All visible root bodies are purchased/);
  assert.match(printEmptySourceReason(hiddenMade, bodies), /Inspect → BOM/);
  assert.equal(printSourceScope(hiddenMade, bodies).included.length, 0);
  const hiddenAll = doc({ bodies: { cover: { hidden: true }, ring: { hidden: true } } });
  assert.equal(printEmptySourceReason(hiddenAll, bodies), 'No visible solid mesh to preview.');
  assert.equal(printEmptySourceReason(doc(), []), 'No visible solid mesh to preview.');
  assert.equal(printEmptySourceReason(doc(), bodies), 'No visible solid mesh to preview.');
});
