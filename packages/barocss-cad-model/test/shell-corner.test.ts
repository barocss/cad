import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import type { StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';

const points: [number, number][] = [[0, 0], [40, 0], [40, 10], [10, 10], [10, 30], [0, 30]];
const doc: StudioDoc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'loop', segments: points.map(start => ({ kind: 'line', start })) },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 20 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const shell = commandById('shell')!;

test('closed L Shell carries explicit corner values through History and native read', () => {
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok);
  const ctx = { doc, bodies: evaluated.bodies, selection: { bodies: [0], faces: [], edges: [] } };
  const defaults = shell.defaults!(ctx);
  assert.equal(defaults.join, 'default');
  assert.equal(shell.fields!(ctx).find(field => field.key === 'join')?.label, 'Inner corner');
  const legacy = shell.build!(ctx, defaults);
  assert.equal(Object.hasOwn(legacy.nodes[2], 'join'), false);
  const sharp = shell.build!(ctx, { ...defaults, join: 'sharp' });
  const field = editFields(sharp.nodes, 2).find(field => field.key === 'join');
  assert.ok(field?.kind === 'choice');
  const round = { ...sharp, nodes: field.set(sharp.nodes, 'arc') };
  const read = readStudioDoc(JSON.stringify(round));
  assert.ok('doc' in read);
  assert.deepEqual(read.doc.nodes, round.nodes);
  assert.deepEqual(field.set(round.nodes, 'default'), legacy.nodes);
  const sharpResult = evaluateDoc(sharp, 2), roundResult = evaluateDoc(read.doc, 3);
  assert.ok(sharpResult.ok && Math.abs(sharpResult.bodies[0].volume! - 6624) < 1e-7);
  assert.ok(roundResult.ok && Math.abs(roundResult.bodies[0].volume! - (6624 - 16 * (4 - Math.PI))) < 1e-7);
  const invalid = { ...round, nodes: [...round.nodes.slice(0, 2), { ...round.nodes[2], join: 'other' }] };
  assert.match((readStudioDoc(JSON.stringify(invalid)) as { error?: string }).error ?? '', /Inner corner|inner corner/);
});

test('either original L end cap admits explicit corners and retains the default path', () => {
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok);
  const faces = evaluated.bodies[0].mesh.faces;
  const top = faces.findIndex(face => face.nativePlaneName === 'n1.top');
  const bottom = faces.findIndex(face => face.nativePlaneName === 'n1.bottom');
  const side = faces.findIndex(face => face.nativePlaneName === 'n1.side0');
  assert.ok(top >= 0 && bottom >= 0 && side >= 0);
  const context = (selected: number[]) => ({
    doc, bodies: evaluated.bodies, selection: { bodies: [], faces: selected.map(face => ({ body: 0, face })), edges: [] },
  });
  for (const cap of [top, bottom]) {
    const ctx = context([cap]), defaults = shell.defaults!(ctx);
    assert.equal(defaults.join, 'default');
    assert.equal(shell.fields!(ctx).some(field => field.key === 'join'), true);
    const legacy = shell.build!(ctx, defaults), opening = legacy.nodes[2];
    assert.ok(opening.kind === 'shell');
    assert.deepEqual(opening.open, [faces[cap].nativePlaneName]);
    assert.equal(Object.hasOwn(opening, 'join'), false);
    const field = editFields(legacy.nodes, 2).find(field => field.key === 'join');
    assert.ok(field?.kind === 'choice');
    for (const join of ['sharp', 'arc'] as const) {
      const made = shell.build!(ctx, { ...defaults, join });
      assert.deepEqual(made.nodes[2], { ...opening, join });
      assert.deepEqual(field.set(legacy.nodes, join), made.nodes);
      const read = readStudioDoc(JSON.stringify(made));
      assert.ok('doc' in read);
      const result = evaluateDoc(read.doc, 2);
      const volume = join === 'sharp' ? 5952 : 5952 - 18 * (4 - Math.PI);
      assert.ok(result.ok && Math.abs(result.bodies[0].volume! - volume) < 1e-7);
    }
  }
  for (const refused of [[side], [top, bottom]]) {
    const unsupported = context(refused);
    assert.equal(shell.fields!(unsupported).some(field => field.key === 'join'), false);
    assert.throws(() => shell.build!(unsupported, { t: 2, join: 'arc' }), /one end cap open/);
  }
});
