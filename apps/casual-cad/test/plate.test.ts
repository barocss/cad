import assert from 'node:assert/strict';
import test from 'node:test';
import { commitCasualPreview, inspectCasualPlate, newCasualPlate, previewCasualDiameter, type PlateDocument } from '@barocss/cad-model/app/casualPlate';
import { readStudioFile, encodeStudioFile } from '@barocss/cad-model/engine/container';
import { parseDiameterCode } from '../src/code';
const ok = <T>(r: { ok: true; value: T } | { ok: false; reason: string }): T => {
  if (!r.ok) assert.fail(r.reason);
  return r.value;
};

function measured(plate: PlateDocument, id: string) {
  const rings = plate.scene.mesh.edges.filter(e => plate.scene.rimOwners.get(e.edgeId) === id);
  const xs = rings.flatMap(e => Array.from(e.points).filter((_, i) => i % 3 === 0));
  assert.ok(xs.length > 8, 'no native ring tessellation');
  return { centerX: (Math.max(...xs) + Math.min(...xs)) / 2, dia: Math.max(...xs) - Math.min(...xs) };
}
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} is not ${b}`);
test('the two native hole IDs own distinct wall faces and top rims; preview only updates A', () => {
  const base = ok(inspectCasualPlate(newCasualPlate()));
  const [a, b] = base.scene.holes;
  for (const h of [a, b]) {
    assert.ok([...base.scene.wallOwners.values()].includes(h.id));
    assert.ok([...base.scene.rimOwners.values()].includes(h.id));
  }
  const p = ok(previewCasualDiameter(base, a.id, 8));
  near(measured(base, a.id).dia, 6); near(measured(base, b.id).dia, 6);
  near(measured(p.next, a.id).dia, 8); near(measured(p.next, b.id).dia, 6);
  near(measured(p.next, b.id).centerX - measured(p.next, a.id).centerX, 30);
  assert.deepEqual(p.next.doc.nodes.filter((_, i) => i !== a.index), base.doc.nodes.filter((_, i) => i !== a.index));
  assert.equal(commitCasualPreview(base, p, b.id), null);
  assert.equal(commitCasualPreview(ok(inspectCasualPlate(base.doc)), p, a.id), null, 'reopened snapshot may not adopt old preview');
  assert.equal(commitCasualPreview(base, p, a.id), p.next);
  assert.equal(previewCasualDiameter(base, 'not-a-hole', 8).ok, false);
  assert.equal(previewCasualDiameter(base, a.id, 100).ok, false);
});
test('native file round trip preserves shared Centre Y and permits a later Studio-side parameter edit', async () => {
  const baseDoc = newCasualPlate();
  const bound = { ...baseDoc, parameters: { rowY: 20 }, nodes: baseDoc.nodes.map(n => n.kind === 'hole' ? { ...n, center: [n.center[0], { parameter: 'rowY' }] as typeof n.center } : n) };
  const base = ok(inspectCasualPlate(bound));
  const preview = ok(previewCasualDiameter(base, base.scene.holes[0].id, 8));
  const reopened = await readStudioFile(encodeStudioFile(preview.next.doc));
  if ('error' in reopened) assert.fail(reopened.error);
  assert.deepEqual(reopened.doc.nodes, preview.next.doc.nodes);
  const moved = ok(inspectCasualPlate({ ...reopened.doc, parameters: { rowY: 22 } }));
  assert.deepEqual(moved.scene.holes.map(h => [h.label, h.x, h.y, h.diameter]), [['A', 15, 22, 8], ['B', 45, 22, 6]]);
});
test('unsupported features are refused without altering the supplied document; no code evaluation', () => {
  const base = newCasualPlate();
  const unsupported = { ...base, nodes: base.nodes.map(n => n.kind === 'hole' ? { ...n, depth: 2 } : n) };
  const prior = JSON.stringify(unsupported);
  assert.equal(inspectCasualPlate(unsupported).ok, false);
  assert.equal(JSON.stringify(unsupported), prior);
  assert.deepEqual(parseDiameterCode('holeB.diameter = 8.5;'), { label: 'B', diameter: 8.5 });
  for (const bad of ['holeC.diameter = 8', 'holeA.diameter = 2*4', 'holeA.diameter = 8; alert(1)', 'holeA.diameter = 0', 'holeA.radius = 4']) assert.equal(parseDiameterCode(bad), null);
});
