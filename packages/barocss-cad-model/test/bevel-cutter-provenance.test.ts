import test from 'node:test';
import assert from 'node:assert/strict';
import { bevelGearDimensions } from '@barocss/cad';
import { emptyDoc, type ModelNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { editFields } from '../src/app/editFields';

type Bevel = Extract<ModelNode, { kind: 'bevel-gear' }>;
const straight = (): Bevel => ({ id: 'n0', kind: 'bevel-gear', module: 3, teeth: 20, mateTeeth: 40, faceWidth: 20, bore: 10, center: [0, 0], generator: 'bevel-gear@0' });
const spiral = (radius: number, flag?: boolean): Bevel => ({ ...straight(), spiral: { angle: 35, hand: 'right', cutterRadius: radius, ...(flag === undefined ? {} : { cutterEstimate: flag }) } });
function edit(node: Bevel, key: string, value: number): Bevel {
  const field = editFields([node], 0).find(f => f.key === key);
  assert.ok(field?.kind === 'number');
  const result = field.set([node], value)[0];
  assert.equal(result.kind, 'bevel-gear');
  return result as Bevel;
}
function body(node: Bevel) {
  const result = evaluateDoc({ ...emptyDoc(), nodes: [node] }, 1);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.bodies.length, 1);
  return result.bodies[0];
}

test('beta edits retain explicit cutter radii and absent/false/true provenance without mutation', () => {
  for (const radius of [40, 60]) for (const flag of [undefined, false, true]) {
    const before = spiral(radius, flag), snapshot = structuredClone(before), after = edit(before, 'beta', 30);
    assert.deepEqual(after, { ...before, spiral: { ...before.spiral!, angle: 30 } });
    assert.equal(Object.hasOwn(after.spiral!, 'cutterEstimate'), flag !== undefined);
    assert.deepEqual(before, snapshot);
    assert.notEqual(after, before); assert.notEqual(after.spiral, before.spiral);
  }
});

test('an explicit rc edit removes estimation and a subsequent beta edit does not restore it', () => {
  const before = spiral(60, true), snapshot = structuredClone(before);
  const manual = edit(before, 'rc', 40), after = edit(manual, 'beta', 30);
  assert.deepEqual(manual.spiral, { angle: 35, hand: 'right', cutterRadius: 40 });
  assert.deepEqual(after.spiral, { angle: 30, hand: 'right', cutterRadius: 40 });
  assert.deepEqual(before, snapshot);
});

test('straight to spiral initializes the existing estimate and returning to straight removes the law', () => {
  const before = straight(), snapshot = structuredClone(before), after = edit(before, 'beta', 35);
  const d = bevelGearDimensions({ module: 3, teeth: 20, mateTeeth: 40, shaftAngle: 90, faceWidth: 20 });
  assert.deepEqual(after.spiral, { angle: 35, hand: 'left', cutterRadius: +((d.Re + d.Ri) / 2).toFixed(3), cutterEstimate: true });
  assert.deepEqual(edit(after, 'beta', 0), before);
  assert.deepEqual(edit(after, 'beta', -1), before);
  assert.deepEqual(before, snapshot);
});

test('evaluation agrees with a direct angle edit: cutter provenance changes notes, not geometry', () => {
  for (const radius of [40, 60]) {
    const source = spiral(radius), edited = body(edit(source, 'beta', 30));
    const direct = body({ ...source, spiral: { ...source.spiral!, angle: 30 } });
    assert.deepEqual(edited.notes, direct.notes);
    assert.deepEqual(edited.mesh.positions, direct.mesh.positions);
    assert.deepEqual(edited.mesh.indices, direct.mesh.indices);
    assert.equal(edited.volume, direct.volume);
    const manualNote = edited.notes!.find(n => n.text.startsWith('Spiral β_m'))!;
    assert.ok(manualNote); assert.doesNotMatch(manualNote.text, /an estimate/); assert.equal(manualNote.warning, undefined);
    const estimated = body(edit(spiral(radius, true), 'beta', 30));
    assert.equal(estimated.volume, direct.volume);
    assert.deepEqual(estimated.mesh.positions, direct.mesh.positions);
    assert.deepEqual(estimated.mesh.indices, direct.mesh.indices);
    const estimateNote = estimated.notes!.find(n => n.text.startsWith('Spiral β_m'))!;
    assert.match(estimateNote.text, /an estimate: the mean cone distance/); assert.equal(estimateNote.warning, true);
  }
});
