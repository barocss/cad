import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { evaluateDoc } from '../src/engine/evaluate';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { revisionOf } from '../src/util/revision';

// A body's surface area from the kernel's exact surfaces (as mass properties integrate them), not the display mesh's
// triangles: a cylinder r 10 × 20 is 600π, a box 40 × 30 × 10 is 3800, the D84 pipe clamp its conformance value
// 11 019.522 (the mesh's sum reads about 0.11 % low there); mass_properties reports the same, labelled when a fallback.

const root = resolve(import.meta.dirname, '..'), evaluate = async (doc: StudioDoc) => evaluateDoc(doc, 1);
const meshSum = (b: { mesh: { faces: { area: number }[] } }) => b.mesh.faces.reduce((t, f) => t + f.area, 0);
const extrude = (sketch: object, h: number) => withNode(withNode(emptyDoc(), sketch as never), { kind: 'extrude', sketch: 0, height: h } as never);

test('surface area exact: a cylinder r 10 × 20 — 600π to 1e-9, the mesh\'s sum below it; a box 40 × 30 × 10 — 3800; mass_properties the same', async () => {
  for (const [doc, want, curved] of [[extrude({ kind: 'sketch', profile: 'circle', center: [0, 0], radius: 10 }, 20), 600 * Math.PI, true], [extrude({ kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] }, 10), 3800, false]] as const) {
    const r = await evaluate(doc); assert.ok(r.ok); const b = r.bodies[0];
    assert.equal(b.areaBasis, 'exact'); assert.ok(Math.abs(b.area! - want) <= 1e-9 * want, `${b.area} vs ${want}`);
    if (curved) assert.ok(meshSum(b) < want - 1e-6, 'the mesh reads low on the curve');
    const m = JSON.parse((await dispatchTool({ doc, bodies: r.bodies } as ChatState, 'mass_properties', {}, evaluate)).content);
    assert.ok(Math.abs(m.bodies[0].area - Math.round(want * 1000) / 1000) <= 1e-3, JSON.stringify(m.bodies[0])); assert.equal(m.bodies[0].area_basis, undefined);
  }
});

test('surface area exact: the D84 pipe clamp — its conformance area 11 019.522 within 1e-4, where the display mesh\'s triangles read about 0.11 % low', async () => {
  const { calls } = JSON.parse(readFileSync(join(root, 'test/fixtures/subd-pipe-clamp.calls.json'), 'utf8')) as { calls: { tool: string; args: Record<string, unknown> }[] };
  let s: ChatState = { doc: emptyDoc(), bodies: [] };
  for (const c of calls) { const r = await dispatchTool(s, c.tool, c.args, evaluate); assert.ok(!r.isError, `${c.tool}: ${r.content}`); s = r.state; }
  const b = s.bodies[0];
  assert.equal(b.areaBasis, 'exact'); assert.ok(Math.abs(b.area! / 11019.522 - 1) <= 1e-4, String(b.area));
  assert.ok(meshSum(b) / 11019.522 < 1 - 5e-4, `the mesh ${meshSum(b)}`);
});

test('full area reads a current Model revision and leaves the compact reply unchanged', async () => {
  const doc = extrude({ kind: 'sketch', profile: 'circle', center: [0, 0], radius: 10 }, 20);
  const result = await evaluate(doc);
  assert.ok(result.ok);
  const state: ChatState = { doc, bodies: result.bodies };
  const ask = (args: Record<string, unknown>) => dispatchTool(state, 'query', { action: 'mass', ...args }, evaluate);
  const expectedRevision = revisionOf(doc);
  const compact = JSON.parse((await ask({})).content);
  assert.equal(compact.bodies[0].area, 1884.956);
  for (const [args, code] of [
    [{ areaPrecision: 'full' }, 'MASS_INPUT'],
    [{ areaPrecision: 'full', expectedRevision: 'bad' }, 'MASS_INPUT'],
    [{ areaPrecision: 'full', expectedRevision: '0'.repeat(16) }, 'MASS_STALE'],
  ] as const) {
    const refused = await ask(args);
    assert.ok(refused.isError && !refused.changed);
    assert.equal(refused.state, state);
    assert.equal(JSON.parse(refused.content).code, code);
    assert.equal(JSON.parse(refused.content).bodies, undefined);
  }
  const full = await ask({ areaPrecision: 'full', expectedRevision });
  const answer = JSON.parse(full.content);
  assert.ok(!full.isError && !full.changed, full.content);
  assert.equal(full.state, state);
  assert.equal(answer.revision, expectedRevision);
  assert.deepEqual(answer.bodies[0], { ...compact.bodies[0], area: state.bodies[0].area, area_basis: 'native surfaces' });
  const meshArea = 11.123456789;
  const fallback = { ...state, bodies: [{ ...state.bodies[0], area: meshArea, areaBasis: 'display mesh' as const }] };
  const mesh = await dispatchTool(fallback, 'query', { action: 'mass', areaPrecision: 'full', expectedRevision }, evaluate);
  assert.equal(JSON.parse(mesh.content).bodies[0].area, meshArea);
  assert.match(JSON.parse(mesh.content).bodies[0].area_basis, /display mesh/);
});

test('full area also pins Direct geometry when the Model revision excludes it', async () => {
  const part = extrude({ kind: 'sketch', profile: 'circle', center: [0, 0], radius: 10 }, 20);
  const direct = (end: number) => ({
    sources: { source: `@model test { version:0; length-unit:mm; @curve #rail { type:nurbs; degree:1; knots:[0,0,1,1]; control-points:[[0,0,0],[${end},0,0]]; weights:[1,1]; }}` },
    objects: [{ id: 'rail', name: 'Rail', source: 'source', geometry: 'rail' }],
  });
  const doc = { ...part, direct: direct(10) };
  const result = await evaluate(doc);
  assert.ok(result.ok);
  const base = { doc, bodies: result.bodies };
  const current = { ...base, doc: { ...doc, direct: direct(20) } };
  const ask = (state: ChatState, action: string, args: Record<string, unknown> = {}) =>
    dispatchTool(state, 'query', { action, ...args }, evaluate);
  const expectedRevision = revisionOf(doc);
  assert.equal(revisionOf(current.doc), expectedRevision);
  const previousPin = JSON.parse((await ask(base, 'summary')).content).direct_revision;
  const currentPin = JSON.parse((await ask(current, 'summary')).content).direct_revision;
  assert.match(currentPin, /^[a-f0-9]{64}$/);
  assert.notEqual(currentPin, previousPin);
  const args = { areaPrecision: 'full', expectedRevision };
  const missing = await ask(current, 'mass', args);
  const stale = await ask(current, 'mass', { ...args, expectedDirectRevision: previousPin });
  assert.equal(JSON.parse(missing.content).code, 'MASS_INPUT');
  assert.equal(JSON.parse(stale.content).code, 'MASS_STALE');
  assert.equal(stale.state, current);
  const accepted = await ask(current, 'mass', { ...args, expectedDirectRevision: currentPin });
  assert.ok(!accepted.isError && !accepted.changed, accepted.content);
  assert.equal(JSON.parse(accepted.content).direct_revision, currentPin);
});
