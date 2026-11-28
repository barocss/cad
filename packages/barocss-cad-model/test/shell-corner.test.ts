import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import type { StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';
import { dispatchTool } from '../src/chat/tools';
import { revisionOf } from '../src/util/revision';

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

test('a literal top-open L floor edits independently and needs a revision-pinned exact face in the Agent', async () => {
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok);
  const top = evaluated.bodies[0].mesh.faces.findIndex(face => face.nativePlaneName === 'n1.top');
  assert.ok(top >= 0);
  const ctx = { doc, bodies: evaluated.bodies, selection: { bodies: [], edges: [], faces: [{ body: 0, face: top }] } };
  const defaults = shell.defaults!(ctx);
  const fields = shell.fields!(ctx, { wallMode: 'separate-floor' });
  assert.ok(fields.some(field => field.key === 'floorThickness'));
  assert.ok(fields.some(field => field.key === 'join'));
  const values = { wallMode: 'separate-floor', t: 2, floorThickness: 3 };
  const candidate = shell.build!(ctx, { ...defaults, ...values });
  const exact = candidate.nodes[2];
  assert.ok(exact.kind === 'shell' && exact.floorThickness === 3 && exact.join === undefined);
  const field = editFields(candidate.nodes, 2).find(field => field.key === 'floorThickness');
  assert.ok(field?.kind === 'number');
  const heightChange = { ...candidate, nodes: field.set(candidate.nodes, 4) };
  const read = readStudioDoc(JSON.stringify(heightChange));
  assert.ok('doc' in read);
  assert.equal((read.doc.nodes[2] as typeof exact).floorThickness, 4);
  assert.ok('error' in readStudioDoc(JSON.stringify({ ...candidate, nodes: [...doc.nodes, { ...exact, floorThickness: '3' }] })));
  for (const join of ['sharp', 'arc'] as const) {
    const corner = editFields(heightChange.nodes, 2).find(candidate => candidate.key === 'join');
    assert.ok(corner?.kind === 'choice');
    const edited = { ...heightChange, nodes: corner.set(heightChange.nodes, join) };
    const opened = readStudioDoc(JSON.stringify(edited));
    assert.ok('doc' in opened);
    const feature = opened.doc.nodes[2];
    assert.ok(feature.kind === 'shell');
    assert.equal(feature.floorThickness, 4);
    assert.equal(feature.join, join);
  }

  const state = { doc, bodies: evaluated.bodies };
  const evaluate = async (next: StudioDoc) => evaluateDoc(next, 2);
  const arg = { action: 'command', command: 'shell', faces: ['n1.top'], values };
  for (const invalid of [arg, { ...arg, faces: ['n1.bottom'], expectedRevision: revisionOf(doc) },
    { ...arg, values: { ...values, floorThickness: '3' }, expectedRevision: revisionOf(doc) }]) {
    const refused = await dispatchTool(state, 'features', invalid, async () => assert.fail('a refused floor must not evaluate'));
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state.doc, doc);
  }
  const outcome = await dispatchTool(state, 'features', { ...arg, expectedRevision: revisionOf(doc) }, evaluate);
  assert.ok(!outcome.isError && outcome.changed, outcome.content);
  const agent = outcome.state.doc.nodes[2];
  assert.ok(agent.kind === 'shell');
  assert.deepEqual([agent.parent, agent.open, agent.thickness, agent.floorThickness, agent.join],
    [exact.parent, exact.open, exact.thickness, exact.floorThickness, exact.join]);
  const preview = evaluateDoc(candidate, 2), next = evaluateDoc(read.doc, 3);
  assert.ok(preview.ok && next.ok);
  const cavityArea = (40 - 4) * (10 - 4) + (10 - 4) * (30 - 10) + 4 - Math.PI;
  assert.ok(Math.abs(preview.bodies[0].volume! - (12000 - cavityArea * 17)) < 1e-7);
  assert.ok(Math.abs(next.bodies[0].volume! - preview.bodies[0].volume! - cavityArea) < 1e-7);
  assert.ok(Math.abs(outcome.state.bodies[0].volume! - preview.bodies[0].volume!) < 1e-7);
  for (const join of ['sharp', 'arc'] as const) {
    const manual = shell.build!(ctx, { ...defaults, ...values, join });
    const requested = await dispatchTool(state, 'features', { ...arg, values: { ...values, join }, expectedRevision: revisionOf(doc) }, evaluate);
    assert.ok(!requested.isError && requested.changed, requested.content);
    const direct = evaluateDoc(manual, 2);
    assert.ok(direct.ok);
    const node = requested.state.doc.nodes[2];
    assert.ok(node.kind === 'shell' && node.floorThickness === 3 && node.join === join);
    const authored = manual.nodes[2];
    assert.ok(authored.kind === 'shell');
    assert.deepEqual([node.parent, node.open, node.thickness, node.floorThickness, node.join],
      [authored.parent, authored.open, authored.thickness, authored.floorThickness, authored.join]);
    assert.equal(requested.state.bodies[0].volume, direct.bodies[0].volume);
  }
});
