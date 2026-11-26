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

import { compileCasualRecipe, previewRecipeDiameter } from '@barocss/cad-model/app/casualRecipe';
const source = `recipe 1
units mm
param width = 64
param rowY = 16
param guideDia = 6
plate bracket width=width depth=42 thickness=7
hole far in=bracket at=(48, rowY) diameter=8
hole near in=bracket at=(12, 12) diameter=guideDia
hole wire in=bracket at=(31, 29) diameter=4
output bracket
`;

test('blank-authorable recipe generates editable native plate with three qualified independent holes', async () => {
  const result = ok(compileCasualRecipe(source));
  assert.equal(result.source, source);
  assert.deepEqual(result.doc.nodes.map(n => n.kind), ['sketch','extrude','hole','hole','hole']);
  assert.deepEqual(result.holes.map(n => [n.name,n.x,n.y,n.diameter]), [['far',48,16,8],['near',12,12,6],['wire',31,29,4]]);
  for (const h of result.holes) {
    const rings = result.scene.mesh.edges.filter(e => result.scene.rimOwners.get(e.edgeId) === h.id);
    const points = rings.flatMap(e => Array.from(e.points));
    for (const [i, center] of [h.x,h.y].entries()) {
      const span = points.filter((_, j) => j % 3 === i);
      assert.ok(span.length > 8);
      near(Math.max(...span) - Math.min(...span), h.diameter);
      near((Math.max(...span) + Math.min(...span))/2, center);
    }
  }
  const restored = await readStudioFile(encodeStudioFile(result.doc));
  if ('error' in restored) assert.fail(restored.error);
  assert.deepEqual(restored.doc.nodes, result.doc.nodes);
  assert.deepEqual(restored.doc.parameters, { width:64,rowY:16,guideDia:6 });
  assert.deepEqual(result.resolvedDiameters,['near']);
  const a = source.split('\n');
  [a[6],a[7]] = [a[7],a[6]];
  const reordered = ok(compileCasualRecipe(a.join('\n')));
  for (const h of result.holes) assert.equal(reordered.holes.find(p => p.name === h.name)?.id, h.id);
});

test('supports a hole-free plate; reports first invalid line and enforces bounded declarations', () => {
  assert.equal(ok(compileCasualRecipe(source.split('\n').filter(l => !l.startsWith('hole ')).join('\n'))).holes.length,0);
  for (const [text,line] of [
    [source.replace('at=(48, rowY)','at=(0, rowY)'),7],
    [source.replace('at=(48, rowY)','at=(12, 12)'),8],
    [source.replace('diameter=8','diameter=unknown'),7],
    [source.replace('diameter=8','diameter=2*4'),7],
    [source + 'console.log("test")',11],
    [source.replace('hole wire','hole near'),9],
    ['x'.repeat(8193),1],
  ] as const) {
    const r = compileCasualRecipe(text);
    if (r.ok) assert.fail('expected refusal');
    assert.equal(r.line,line,r.reason);
  }
});

test('canvas diameter edits preserve original text and update all bound geometry in one proposal', () => {
  const original = source.replace('param guideDia = 6', '\tparam guideDia\t=\t6  # keep this note')
    .replace('diameter=8','diameter=guideDia').replaceAll('\n', '\r\n');
  const base = ok(compileCasualRecipe(original));
  assert.deepEqual([...base.declarations.get('guideDia')!.uses],['far','near']);
  const next = ok(previewRecipeDiameter(base,base.holes[1].id,10));
  assert.equal(next.source,original.replace('=\t6  # keep this note','=\t10  # keep this note'));
  assert.equal(base.source,original);
  assert.deepEqual(next.holes.map(h => h.id),base.holes.map(h => h.id));
  assert.deepEqual(next.holes.map(h => h.diameter),[10,10,4]);
  for (const h of next.holes) {
    const rims = next.scene.mesh.edges.filter(e => next.scene.rimOwners.get(e.edgeId) === h.id);
    const x = rims.flatMap(e => Array.from(e.points).filter((_,i) => i%3 === 0));
    near(Math.max(...x)-Math.min(...x),h.diameter);
  }
  assert.equal(previewRecipeDiameter(base,base.holes[2].id,10).ok,false);
  assert.equal(previewRecipeDiameter(base,base.holes[1].id,40).ok,false);
});

test('same physical numeric value leaves source spelling and snapshot intact', () => {
  const base = ok(compileCasualRecipe(source.replace('guideDia = 6', 'guideDia = 6.00')));
  assert.equal(ok(previewRecipeDiameter(base,base.holes[1].id,6)),base);
  assert.match(base.source,/guideDia = 6\.00/);
});
