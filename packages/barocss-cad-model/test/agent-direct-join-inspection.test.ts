import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { revisionOf } from '../src/util/revision';
import { outputSchemaOf } from '../src/chat/contract';

const curveId = 'get_part_summary';
const source = '@model test { version:0; length-unit:mm; @curve #bend { type:nurbs; degree:2; knots:[0,0,0,1,1,2,2,2]; control-points:[[-20,0,0],[-10,0,0],[0,0,0],[10,14,0],[30,0,0]]; weights:[1,1,1,1,1]; }}';
const makeState = () => ({
  doc: { ...emptyDoc(), direct: { sources: { a: source }, objects: [{ id: curveId, name: 'inspect', source: 'a', geometry: 'bend' }] } },
  bodies: [],
});
const call = (state: ChatState, tool: string, args: Record<string, unknown>) =>
  dispatchTool(state, tool, args, async doc => evaluatePart(doc, 1));
const summary = async (state: ChatState) => {
  const out = await call(state, 'query', { action: 'summary' });
  assert.equal(out.isError, false, out.content);
  return JSON.parse(out.content);
};
const inspect = (state: ChatState, args: Record<string, unknown>) => call(state, 'query', { action: 'inspect', ...args });
const input = async (state: ChatState) => ({ curve: curveId, parameter: 1, expectedDirectRevision: (await summary(state)).direct_revision });

async function refuses(state: ChatState, args: Record<string, unknown>, code: string) {
  const before = structuredClone(state);
  const out = await inspect(state, args);
  assert.equal(out.isError, true, out.content);
  assert.equal(JSON.parse(out.content).code, code);
  assert.equal(out.changed, false);
  assert.equal(out.state, state);
  assert.deepEqual(state, before);
}

test('the public Agent query discovers a literal curve ID and reports the exact point and angle without writing', async () => {
  const state = makeState(), before = structuredClone(state);
  const part = await summary(state);
  assert.match(part.direct_revision, /^[a-f0-9]{64}$/);
  assert.equal(part.direct_curves[0].id, curveId);
  assert.equal(part.direct_curves[0].name, 'inspect');
  const described = await call(state, 'describe', { tool: 'query', action: 'inspect' });
  const { input: schema } = JSON.parse(described.content);
  assert.equal(schema.properties.parameter.type, 'number');
  assert.equal(schema.properties.expectedDirectRevision.pattern, '^[a-f0-9]{64}$');
  assert.equal(outputSchemaOf('inspect')?.properties?.curveJoin.properties?.angleDegrees.type, 'number');

  const args = await input(state);
  const out = await inspect(state, args);
  assert.equal(out.changed, false);
  assert.equal(out.isError, false, out.content);
  assert.equal(out.state, state);
  const { angleDegrees, ...join } = JSON.parse(out.content).curveJoin;
  assert.ok(Math.abs(angleDegrees - Math.atan2(14, 10) * 180 / Math.PI) < 1e-12);
  assert.deepEqual(join, { curveId, parameter: 1, point: [0, 0, 0], unit: 'degrees', revision: part.direct_revision });
  assert.equal((await inspect(state, args)).content, out.content);
  assert.deepEqual(state, before);
});

test('a Direct edit invalidates the pin even though query.rebuild uses the same ordinary part revision', async () => {
  const prior = makeState(), args = await input(prior);
  const changed = makeState();
  changed.doc.direct.sources.a = source.replace('[10,14,0]', '[10,10,0]');
  assert.equal(revisionOf(changed.doc), revisionOf(prior.doc));
  await refuses(changed, args, 'DIRECT_JOIN_STALE');
  const current = await input(changed);
  assert.notEqual(current.expectedDirectRevision, args.expectedDirectRevision);
  const out = await inspect(changed, current);
  assert.equal(JSON.parse(out.content).curveJoin.angleDegrees, 45);

  for (const objects of [[{ ...prior.doc.direct.objects[0], hidden: true }], prior.doc.direct.objects.concat(prior.doc.direct.objects)]) {
    const unavailable = { ...prior, doc: { ...prior.doc, direct: { ...prior.doc.direct, objects } } };
    await refuses(unavailable, args, 'DIRECT_JOIN_STALE');
    const part = await summary(unavailable);
    assert.equal(part.direct_curves, undefined);
    assert.equal(part.direct_revision, undefined);
  }
});

test('incomplete, unsupported and placed-part reads refuse without changing the document', async () => {
  const state = makeState(), args = await input(state);
  for (const change of [{ expectedDirectRevision: undefined }, { curve: '' }, { parameter: '1' }, { parameter: Infinity }, { edges: [] }])
    await refuses(state, { ...args, ...change }, 'DIRECT_JOIN_INPUT');
  await refuses(state, { ...args, parameter: .75 }, 'DIRECT_JOIN_UNAVAILABLE');
  await refuses(state, { ...args, curve: 'unknown' }, 'DIRECT_JOIN_CURVE');
  await refuses({ ...state, partOf: 'placed' }, args, 'DIRECT_JOIN_SCOPE');

  const legacy = await inspect(state, { faces: [], edges: [] });
  assert.equal(legacy.content, '{}');
  assert.equal(legacy.isError, false);
});
