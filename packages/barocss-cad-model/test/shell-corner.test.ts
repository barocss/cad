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

test('an open face selection keeps the old uniform path and rejects an explicit corner value', () => {
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok);
  const top = evaluated.bodies[0].mesh.faces.findIndex(face => face.nativePlaneName === 'n1.top');
  assert.ok(top >= 0);
  const ctx = { doc, bodies: evaluated.bodies, selection: { bodies: [], faces: [{ body: 0, face: top }], edges: [] } };
  assert.equal(shell.fields!(ctx).some(field => field.key === 'join'), false);
  const opening = shell.build!(ctx, { t: 2 }).nodes[2];
  assert.ok(opening.kind === 'shell');
  assert.deepEqual(opening.open, ['n1.top']);
  assert.throws(() => shell.build!(ctx, { t: 2, join: 'arc' }), /closed Shell/);
});
