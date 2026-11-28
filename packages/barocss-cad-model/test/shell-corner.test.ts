import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import type { StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
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
const cylinder: StudioDoc = { ...doc, nodes: [
  { kind: 'sketch', id: 'n0', profile: 'circle', center: [14, 9], radius: 15 },
  { kind: 'extrude', id: 'n1', sketch: 0, from: 3, height: 20 },
] };

test('closed cylinder Shell admits two independent caps without exposing an L corner mode', async () => {
  const stock = cylinder;
  const original = evaluateDoc(stock, 1);
  assert.ok(original.ok);
  const ctx = { doc: stock, bodies: original.bodies, selection: { bodies: [0], faces: [], edges: [] } };
  const defaults = shell.defaults!(ctx);
  assert.equal(defaults.wallMode, 'uniform');
  const values = { ...defaults, wallMode: 'separate-caps', t: 2, floorThickness: 3, ceilingThickness: 5 };
  const fields = shell.fields!(ctx, values).map(field => field.key);
  assert.deepEqual(fields, ['wallMode', 't', 'floorThickness', 'ceilingThickness']);
  assert.throws(() => shell.build!(ctx, { ...values, join: 'sharp' }), /original upright L-shaped extrusion/);
  const top = original.bodies[0].mesh.faces.findIndex(face => face.nativePlaneName === 'n1.top');
  assert.ok(top >= 0);
  const opened = { ...ctx, selection: { bodies: [], faces: [{ body: 0, face: top }], edges: [] } };
  assert.deepEqual(shell.fields!(opened, values).map(field => field.key), ['wallMode', 't']);
  assert.throws(() => shell.build!(opened, values), /no open faces/);
  const closed = shell.build!(ctx, values), result = evaluateDoc(closed, 2);
  assert.ok(result.ok && Math.abs(result.bodies[0].volume! - 2472 * Math.PI) < 1e-7);
  const floor = editFields(closed.nodes, 2).find(field => field.key === 'floorThickness');
  assert.ok(floor?.kind === 'number');
  const edited = evaluateDoc({ ...closed, nodes: floor.set(closed.nodes, 4) }, 3);
  assert.ok(edited.ok && Math.abs(edited.bodies[0].volume! - 2641 * Math.PI) < 1e-7);
  const agent = await dispatchTool({ doc: stock, bodies: original.bodies }, 'features', { action: 'command', command: 'shell',
    bodies: ['b1'], values, expectedRevision: revisionOf(stock) }, async next => evaluateDoc(next, 4));
  assert.ok(agent.changed && !agent.isError, agent.content);
  assert.deepEqual(agent.state.doc.nodes[2], closed.nodes[2]);
});

test('top-open cylinder Shell admits one independent floor and retains the original opening in the Agent', async () => {
  const original = evaluateDoc(cylinder, 1);
  assert.ok(original.ok);
  const top = original.bodies[0].mesh.faces.findIndex(face => face.nativePlaneName === 'n1.top');
  const bottom = original.bodies[0].mesh.faces.findIndex(face => face.nativePlaneName === 'n1.bottom');
  assert.ok(top >= 0 && bottom >= 0);
  const ctx = { doc: cylinder, bodies: original.bodies, selection: { bodies: [], faces: [{ body: 0, face: top }], edges: [] } };
  const values = { ...shell.defaults!(ctx), wallMode: 'separate-floor', t: 2, floorThickness: 3 };
  assert.deepEqual(shell.fields!(ctx, values).map(field => field.key), ['wallMode', 't', 'floorThickness']);
  assert.throws(() => shell.build!(ctx, { ...values, join: 'sharp' }), /original upright L-shaped extrusion/);
  const unsupported = { ...ctx, selection: { ...ctx.selection, faces: [{ body: 0, face: bottom }] } };
  assert.deepEqual(shell.fields!(unsupported, values).map(field => field.key), ['t']);
  assert.throws(() => shell.build!(unsupported, values), /original top cap/);
  const opened = shell.build!(ctx, values);
  const node = opened.nodes[2];
  assert.ok(node.kind === 'shell');
  assert.deepEqual([node.open, node.floorThickness, node.ceilingThickness, node.join], [['n1.top'], 3, undefined, undefined]);
  const result = evaluateDoc(opened, 2);
  assert.ok(result.ok && Math.abs(result.bodies[0].volume! - 1627 * Math.PI) < 1e-7);
  const agent = await dispatchTool({ doc: cylinder, bodies: original.bodies }, 'features', { action: 'command', command: 'shell',
    faces: ['n1.top'], values, expectedRevision: revisionOf(cylinder) }, async next => evaluateDoc(next, 3));
  assert.ok(agent.changed && !agent.isError, agent.content);
  const agentNode = agent.state.doc.nodes[2];
  assert.ok(agentNode.kind === 'shell');
  const { sigs, ...command } = agentNode;
  assert.deepEqual(command, node);
  assert.deepEqual(Object.keys(sigs ?? {}), ['n1.top']);
  assert.deepEqual(sigs?.['n1.top']?.d, [0, 0, 1]);
  assert.deepEqual(partBreps(agent.state.doc)[0].brep, partBreps(opened)[0].brep);
});

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

test('a separate ceiling binds the original bottom, carries History and rejects invalid Agent ownership', async () => {
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok);
  const bottom = evaluated.bodies[0].mesh.faces.findIndex(face => face.nativePlaneName === 'n1.bottom');
  assert.ok(bottom >= 0);
  const ctx = { doc, bodies: evaluated.bodies, selection: { bodies: [], edges: [], faces: [{ body: 0, face: bottom }] } };
  const values = { wallMode: 'separate-ceiling', t: 2, ceilingThickness: 3, join: 'sharp' } as const;
  const fields = shell.fields!(ctx, values);
  assert.ok(fields.some(field => field.key === 'ceilingThickness' && field.label === 'Ceiling thickness'));
  assert.ok(fields.some(field => field.key === 'join'));
  assert.ok(!fields.some(field => field.key === 'floorThickness'));
  const candidate = shell.build!(ctx, { ...shell.defaults!(ctx), ...values });
  const node = candidate.nodes[2];
  assert.ok(node.kind === 'shell' && node.join === 'sharp' && node.ceilingThickness === 3);
  assert.deepEqual(node.open, ['n1.bottom']);
  assert.ok(!Object.hasOwn(node, 'floorThickness'));
  assert.throws(() => shell.build!(ctx, { ...values, wallMode: 'separate-floor', floorThickness: 3 }), /original top cap/);
  const field = editFields(candidate.nodes, 2).find(option => option.key === 'ceilingThickness');
  assert.ok(field?.kind === 'number');
  const read = readStudioDoc(JSON.stringify({ ...candidate, nodes: field.set(candidate.nodes, 4) }));
  assert.ok('doc' in read && read.doc.schema === doc.schema);
  const edited = read.doc.nodes[2];
  assert.ok(edited.kind === 'shell' && edited.ceilingThickness === 4 && edited.join === 'sharp');
  for (const invalid of [{ ...node, ceilingThickness: '3' }, { ...node, floorThickness: 3 }])
    assert.ok('error' in readStudioDoc(JSON.stringify({ ...candidate, nodes: [...doc.nodes, invalid] })));

  const state = { doc, bodies: evaluated.bodies };
  const expectedRevision = revisionOf(doc);
  const request = { action: 'command', command: 'shell', faces: ['n1.bottom'], values, expectedRevision };
  for (const invalid of [{ ...request, expectedRevision: undefined },
    { ...request, faces: ['n1.top'] }, { ...request, values: { ...values, ceilingThickness: '3' } }]) {
    const refused = await dispatchTool(state, 'features', invalid, async () => assert.fail('a refused ceiling must not evaluate'));
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state.doc, doc);
  }
  const outcome = await dispatchTool(state, 'features', request, async next => evaluateDoc(next, 2));
  assert.ok(!outcome.isError && outcome.changed, outcome.content);
  const accepted = outcome.state.doc.nodes[2];
  assert.ok(accepted.kind === 'shell');
  assert.deepEqual([accepted.parent, accepted.open, accepted.thickness, accepted.ceilingThickness, accepted.join],
    [node.parent, node.open, node.thickness, node.ceilingThickness, node.join]);
  const rebuilt = evaluateDoc(read.doc, 3);
  assert.ok(rebuilt.ok);
  assert.ok(Math.abs(outcome.state.bodies[0].volume! - (12000 - 336 * 17)) < 1e-7);
  assert.ok(Math.abs(rebuilt.bodies[0].volume! - (12000 - 336 * 16)) < 1e-7);
});

test('a closed L Shell edits both cap thicknesses and reviews the same native result through the Agent', async () => {
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok);
  const selection = { bodies: [0], faces: [], edges: [] };
  const ctx = { doc, bodies: evaluated.bodies, selection };
  const values = { wallMode: 'separate-caps', t: 2, floorThickness: 3, ceilingThickness: 4, join: 'sharp' };
  const fields = shell.fields!(ctx, values);
  assert.deepEqual(fields.map(field => field.key), ['wallMode', 't', 'join', 'floorThickness', 'ceilingThickness']);
  const built = shell.build!(ctx, values), node = built.nodes[2];
  assert.ok(node.kind === 'shell');
  assert.deepEqual([node.open, node.floorThickness, node.ceilingThickness], [[], 3, 4]);
  const history = editFields(built.nodes, 2);
  const floor = history.find(field => field.key === 'floorThickness');
  const ceiling = history.find(field => field.key === 'ceilingThickness');
  assert.ok(floor?.kind === 'number' && ceiling?.kind === 'number');
  const edited = { ...built, nodes: floor.set(ceiling.set(built.nodes, 5), 4) };
  const reopened = readStudioDoc(JSON.stringify(edited));
  assert.ok('doc' in reopened && reopened.doc.schema === doc.schema);
  assert.deepEqual(reopened.doc.nodes[2], { ...node, floorThickness: 4, ceilingThickness: 5 });
  const result = evaluateDoc(reopened.doc, 2);
  assert.ok(result.ok && Math.abs(result.bodies[0].volume! - (12000 - 336 * 11)) < 1e-7);
  const invalid = { ...built, nodes: [...doc.nodes, { ...node, open: ['n1.top'] }] };
  assert.ok('error' in readStudioDoc(JSON.stringify(invalid)));

  const state = { doc, bodies: evaluated.bodies };
  const request = { action: 'command', command: 'shell', bodies: ['b1'], values, expectedRevision: revisionOf(doc) };
  for (const args of [{ ...request, expectedRevision: undefined }, { ...request, expectedRevision: '0'.repeat(16) },
    { ...request, faces: ['n1.top'] }, { ...request, bodies: ['b1', 'b1'] },
    { ...request, values: { ...values, ceilingThickness: '4' } }, { ...request, values: { ...values, floorThickness: undefined } }]) {
    const refused = await dispatchTool(state, 'features', args, async () => assert.fail('an unqualified cap pair must not evaluate'));
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state.doc, doc);
  }
  const outcome = await dispatchTool(state, 'features', request, async next => evaluateDoc(next, 2));
  assert.ok(!outcome.isError && outcome.changed, outcome.content);
  assert.deepEqual(outcome.state.doc.nodes[2], node);
  assert.ok(Math.abs(outcome.state.bodies[0].volume! - (12000 - 336 * 13)) < 1e-7);
});
