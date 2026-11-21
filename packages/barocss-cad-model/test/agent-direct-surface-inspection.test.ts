import assert from 'node:assert/strict';
import test from 'node:test';
import { outputSchemaOf } from '../src/chat/contract';
import { directInspectionRevision } from '../src/chat/sweepSource';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { directOps, emptyDirect, importSource } from '../src/engine/direct';
import { emptyDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';

const id = 'get_part_summary';
const nativeSource = `@model rails { version:0;length-unit:mm;
  @curve #first {type:nurbs;degree:1;knots:[2,2,4,4];control-points:[[10,10,0],[40,10,6]];weights:[1,1];}
  @curve #second {type:nurbs;degree:3;knots:[2,2,2,2,4,4,4,4];control-points:[[10,30,3],[18,37,12],[32,25,-3],[40,30,9]];weights:[1,1,1,1];}
}`;
function stateWithSurface(source = nativeSource) {
  const rails = importSource(emptyDirect(), source, 'Rails');
  const direct = directOps.ruledSurface(rails, rails.objects[0].id, rails.objects[1].id);
  const state = { doc: { ...emptyDoc(), direct: { ...direct, objects: [{ ...direct.objects.at(-1)!, id, name: 'inspect' }] } }, bodies: [] };
  return state;
}
const call = (state: ChatState, tool: string, args: Record<string, unknown>) =>
  dispatchTool(state, tool, args, async doc => evaluatePart(doc, 1));
const pinned = (state: ChatState) => ({ surface: id, u: 3, v: .5, expectedDirectRevision: directInspectionRevision(state.doc) });
const read = (state: ChatState, args = pinned(state)) => call(state, 'query', { action: 'inspect', ...args });

async function refuses(state: ChatState, args: Record<string, unknown>, code: string) {
  const original = structuredClone(state);
  const out = await call(state, 'query', { action: 'inspect', ...args });
  assert.equal(out.isError, true, out.content);
  assert.equal(JSON.parse(out.content).code, code);
  assert.equal(out.changed, false);
  assert.equal(out.state, state);
  assert.deepEqual(state, original);
}

test('a surface-only Direct document exposes its literal ID, native domain and revision', async () => {
  const state = stateWithSurface(), before = structuredClone(state);
  const result = await call(state, 'query', { action: 'summary' });
  assert.equal(result.isError, false, result.content);
  const discovered = JSON.parse(result.content);
  assert.equal(discovered.direct_curves, undefined);
  assert.deepEqual(discovered.direct_surfaces, [{ id, name: 'inspect', u: [2, 4], v: [0, 1] }]);
  assert.equal(discovered.direct_revision, pinned(state).expectedDirectRevision);
  const described = await call(state, 'describe', { tool: 'query', action: 'inspect' });
  const { input: schema } = JSON.parse(described.content);
  assert.equal(schema.properties.surface.type, 'string');
  assert.equal(schema.properties.u.type, 'number');
  assert.equal(schema.properties.v.type, 'number');
  assert.equal(outputSchemaOf('inspect')?.properties?.surfacePoint.properties?.normal.type, 'array');

  const out = await read(state);
  assert.equal(out.isError, false, out.content);
  assert.equal(out.changed, false);
  assert.equal(out.state, state);
  const { normal, ...at } = JSON.parse(out.content).surfacePoint;
  assert.deepEqual(at, { surfaceId: id, u: 3, v: .5, point: [25, 20.375, 3.9375], unit: 'mm', revision: discovered.direct_revision });
  const cross = [-.328125, -29.53125, 326.8125], length = Math.hypot(...cross);
  assert.ok(normal.every((component: number, i: number) => Math.abs(component - cross[i] / length) < 1e-12));
  assert.deepEqual(state, before);
  const boundary = await read(state, { ...pinned(state), u: 2, v: 0 });
  assert.equal(boundary.isError, false, boundary.content);
  assert.deepEqual(JSON.parse(boundary.content).surfacePoint.point, [10, 10, 0]);
});

test('surface inspection keeps the revision and geometry refusal boundaries', async () => {
  const state = stateWithSurface(), args = pinned(state);
  for (const change of [{ expectedDirectRevision: undefined }, { u: '3' }, { v: NaN }, { curve: 'first' }, { faces: [] }])
    await refuses(state, { ...args, ...change }, 'DIRECT_SURFACE_INPUT');
  await refuses(state, { ...args, u: 4 + Number.EPSILON * 4 }, 'DIRECT_SURFACE_DOMAIN');
  await refuses(state, { ...args, v: -.01 }, 'DIRECT_SURFACE_DOMAIN');
  await refuses(state, { ...args, surface: 'unknown' }, 'DIRECT_SURFACE_SOURCE');
  await refuses({ ...state, partOf: 'placed' }, args, 'DIRECT_SURFACE_SCOPE');

  const edited = stateWithSurface(nativeSource.replace('[18,37,12]', '[18,39,12]'));
  await refuses(edited, args, 'DIRECT_SURFACE_STALE');
  assert.deepEqual(JSON.parse((await read(edited)).content).surfacePoint.point, [25, 20.75, 3.9375]);

  const renamed = stateWithSurface();
  renamed.doc.direct.objects[0].name = 'Renamed after review';
  await refuses(renamed, args, 'DIRECT_SURFACE_STALE');
  for (const change of [
    [{ ...state.doc.direct.objects[0], hidden: true }],
    [...state.doc.direct.objects, ...state.doc.direct.objects],
    [{ ...state.doc.direct.objects[0], trims: [{ keep: 'inside' as const, uv: [[2, 0], [4, 0], [3, 1]] as [number, number][] }] }],
  ]) {
    const unavailable = { ...state, doc: { ...state.doc, direct: { ...state.doc.direct, objects: change } } };
    const summary = JSON.parse((await call(unavailable, 'query', { action: 'summary' })).content);
    assert.equal(summary.direct_surfaces, undefined);
    assert.equal(summary.direct_revision, undefined);
    await refuses(unavailable, pinned(unavailable), 'DIRECT_SURFACE_SOURCE');
  }
});

test('a degenerate ruled surface reports that its native normal is unavailable', async () => {
  const rails = `@model degenerate { version:0;length-unit:mm;
    @curve #a {type:nurbs;degree:1;knots:[2,2,4,4];control-points:[[0,0,0],[10,0,0]];weights:[1,1];}
    @curve #b {type:nurbs;degree:1;knots:[2,2,4,4];control-points:[[0,0,0],[10,0,0]];weights:[1,1];}
  }`;
  const state = stateWithSurface(rails);
  await refuses(state, pinned(state), 'DIRECT_SURFACE_NORMAL');
});
