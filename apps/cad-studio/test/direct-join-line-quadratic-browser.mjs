import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const cubicJoin = process.argv.includes('--cubic');
const agentInspect = process.argv.includes('--agent-inspect');
const inspectAngle = agentInspect || process.argv.includes('--inspect-angle');
const cubicInspection = cubicJoin && inspectAngle;
const line = cubicInspection ? [[19, 1, -18], [25, 10, 0]] : [[10, 10, 0], [25, 10, 0]];
const other = cubicJoin
  ? [[25, 10, 0], cubicInspection ? [43, -2, 6] : [35, 24, 0], [47, 7, 5], [55, 21, 0]]
  : [[25, 10, 0], [35, 24, 0], [50, 18, 0]];
const degree = other.length - 1, label = cubicJoin ? 'Cubic' : 'Quadratic';
const firstDomain = cubicJoin ? [2, 4] : [0, 1], secondDomain = cubicJoin ? [10, 14] : [0, 1];
const [start, knot] = firstDomain, end = knot + secondDomain[1] - secondDomain[0];
const insideLine = start + (knot - start) * .75, insideCurve = knot + (end - knot) * .25;
function source(points, [from, to]) {
  const count = points.length;
  return `@model join_input {version:0;length-unit:mm;@curve #path {type:nurbs;degree:${count - 1};knots:[${Array(count).fill(from)},${Array(count).fill(to)}];control-points:${JSON.stringify(points)};weights:[${Array(count).fill(1)}];}}`;
}
function bezier(points, t) {
  // Independent de Casteljau interpolation from the authored control points.
  while (points.length > 1)
    points = points.slice(1).map((right, index) => right.map((value, axis) => (1 - t) * points[index][axis] + t * value));
  return points[0];
}
const doc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: {
    sources: { a: source(line, firstDomain), b: source(other, secondDomain) },
    objects: [{ id: 'a', name: 'Straight reference', source: 'a', geometry: 'path' },
      { id: 'b', name: label + ' reference', source: 'b', geometry: 'path' }],
  },
};
const pins = [
  'apps/cad-studio/test/direct-join-line-quadratic-browser.mjs', 'apps/cad-studio/src/ui/TwoCurveRoles.tsx',
  'apps/cad-studio/src/ui/joinEndpointGuidance.ts', 'packages/barocss-cad-model/src/engine/direct.ts',
  ...(agentInspect ? ['packages/barocss-cad-model/src/chat/part/views.ts', 'packages/barocss-cad-model/src/chat/sweepSource.ts',
    'apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs'] : []),
];
const f = await createFlow({
  name: 'join-line-' + label.toLowerCase(), output: process.argv[2],
  envFrozen: cubicInspection ? 'D1620_SOURCE_FROZEN' : cubicJoin ? 'D1617_SOURCE_FROZEN' : agentInspect ? 'D1615_SOURCE_FROZEN' : inspectAngle ? 'D1614_SOURCE_FROZEN' : 'D1605_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: `Join the exact line end to the ${label.toLowerCase()} start, preserve both spans and reopen the single native curve.`,
  limits: [`One unit-weight line and one unit-weight ${label.toLowerCase()} Bézier with an exact shared endpoint.`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { evaluateCurve } from '@barocss/cad';
import { geometryOf } from '@barocss/cad-model/engine/direct';
const value = JSON.parse(readFileSync(process.argv[2], 'utf8')).direct;
const [item] = value.objects.filter(item => !item.hidden);
const curve = geometryOf(value, item);
if (curve.kind !== 'curve') throw Error('Expected one visible native curve');
console.log(JSON.stringify({ item: item.id, degree: curve.degree, knots: curve.knots, weights: curve.weights,
  samples: Array.from({ length: 65 }, (_, i) =>
    evaluateCurve(curve, i <= 32 ? ${start} + (${knot} - ${start}) * i / 32 : ${knot} + (${end} - ${knot}) * (i - 32) / 32)) }));

`,
});
const panel = () => f.page.getByRole('complementary', { name: 'Direct geometry' });
const group = () => panel().getByRole('group', { name: 'Join endpoints', exact: true });
const button = (parent, name) => parent.getByRole('button', { name, exact: true });
const row = name => f.page.locator('.outliner .ol.direct').filter({ hasText: name });

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext(options);
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin || !['http:', 'https:'].includes(url.protocol) ? route.continue() : route.abort();
    });
    return context;
  };
  const file = join(f.output, `line-and-${label.toLowerCase()}.bcad`);
  await writeFile(file, JSON.stringify(doc));
  await f.freshOpen(file, doc, '01-two-native-curves');
  await button(f.page, 'Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await row(label + ' reference').click();
  await row('Straight reference').click({ modifiers: ['Shift'] });
  f.phase = 'refuse the opposite order and keep both selected source curves';
  const before = await f.page.locator('.ol.direct.sel').allTextContents();
  await group().getByText(/endpoints match in the opposite order/).waitFor();
  await button(panel(), 'Join').click();
  await f.waitToast(/exactly numerically equal/);
  await f.same(doc);
  assert.deepEqual(await f.page.locator('.ol.direct.sel').allTextContents(), before);
  await f.snapshot('02-wrong-order-refused');
  await f.dismissToasts();
  f.phase = 'explicitly swap the order and join the two exact spans';
  await button(panel(), 'Swap curve order').click();
  await group().getByText(/Gap: 0 mm/).waitFor();
  assert.doesNotMatch(await group().innerText(), /same native degree/);
  await button(panel(), 'Join').click();
  await f.changed(doc);
  const joined = await f.doc();
  assert.deepEqual(joined.direct.objects.slice(0, 2), doc.direct.objects.map(item => ({ ...item, hidden: true })));
  assert.equal(joined.direct.sources.a, doc.direct.sources.a);
  assert.equal(joined.direct.sources.b, doc.direct.sources.b);
  const native = await f.inspect('joined-native', joined);
  assert.equal(Object.keys(joined.direct.sources).length, 3);
  assert.equal(native.degree, degree);
  assert.deepEqual(native.knots, [...Array(degree + 1).fill(start), ...Array(degree).fill(knot), ...Array(degree + 1).fill(end)]);
  assert.deepEqual(native.weights, Array(2 * degree + 1).fill(1));
  const error = Math.max(...native.samples.map((point, i) => {
    const t = i <= 32 ? i / 32 : i / 32 - 1;
    const predicted = bezier(i <= 32 ? line : other, t);
    return Math.hypot(...point.map((value, j) => value - predicted[j]));
  }));
  assert.ok(error < 1e-10);
  assert.deepEqual(native.samples[32], line[1]);
  f.report.observations.push({ errorMm: error, joinPoint: native.samples[32], degree: native.degree, domains: [[start, knot], [knot, end]] });
  await f.snapshot('03-joined-curve');
  await f.undo();
  await f.same(doc);
  await f.redo();
  await f.same(joined);
  const saved = await f.save(`joined-line-${label.toLowerCase()}`);
  await f.freshOpen(saved.file, joined, '04-reopened-joined-curve');
  assert.deepEqual(await f.inspect('reopened-native', joined), native);
  await button(f.page, 'Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await row('Joined curve').click();
  await f.snapshot('05-reopened-native-selection');
  if (inspectAngle) {
    f.phase = 'inspect both sides of the exact join parameter after native Open';
    const at = panel().getByLabel('At t', { exact: true });
    const angle = panel().locator('.kv').filter({ hasText: /^Tangent angle/ });
    const radius = panel().locator('.kv').filter({ hasText: /^Radius/ });
    // For the 3D fixture the original endpoint directions have dot 108 and cross (270, 288, -234).
    const expected = (cubicInspection ? Math.atan2(Math.sqrt(210600), 108) : Math.atan2(14, 10)) * 180 / Math.PI;
    await at.fill(String(knot));
    await angle.waitFor();
    await expectAngle();
    await angle.scrollIntoViewIfNeeded();
    await f.snapshot('06-tangent-angle-at-join');

    await at.fill(String(insideLine));
    await angle.waitFor({ state: 'hidden' });
    await radius.getByText('straight', { exact: true }).waitFor();
    await f.snapshot('07-radius-inside-straight-span');
    await at.fill(String(insideCurve));
    await angle.waitFor({ state: 'hidden' });
    await radius.getByText(/^\d+(?:\.\d+)? mm$/).waitFor();
    await at.fill(String(knot));
    await expectAngle();
    await f.same(joined);
    const displayedAngle = await angle.locator('b').innerText();
    f.report.observations.push({ expectedAngleDeg: expected, displayedAngle });
    if (agentInspect) await compareAgent(saved.file, joined, expected, displayedAngle);

    async function expectAngle() {
      await radius.getByText(/Unavailable at join/).waitFor();
      await angle.getByText(Math.round(expected * 1000) / 1000 + '°', { exact: true }).waitFor();
    }
  }
});

async function compareAgent(file, doc, expected, displayedAngle) {
  f.phase = 'compare the local Agent with the reopened Studio inspector';
  const bytes = await readFile(file);
  const session = { app: f.app, output: f.output, clientName: 'barocss-direct-join-inspection' };
  const [visible] = doc.direct.objects.filter(object => !object.hidden);
  const args = { action: 'inspect', curve: visible.id, parameter: knot };
  const measurement = await withMcpSession(session, file, 'agent-reopened-join', async call => {
    const described = await call('describe', { tool: 'query', action: 'inspect' });
    assert.equal(described.input.properties.expectedDirectRevision.pattern, '^[a-f0-9]{64}$');
    const summary = await call('query', { action: 'summary' });
    assert.match(summary.direct_revision, /^[a-f0-9]{64}$/);
    assert.equal(summary.direct_curves[0].id, visible.id);
    const pinned = { ...args, expectedDirectRevision: summary.direct_revision };
    const { curveJoin } = await call('query', pinned);
    assert.deepEqual(curveJoin.point, line[1]);
    assert.equal(curveJoin.curveId, visible.id);
    assert.equal(curveJoin.revision, summary.direct_revision);
    assert.equal(curveJoin.unit, 'degrees');
    assert.ok(Math.abs(curveJoin.angleDegrees - expected) < 1e-12);
    assert.equal(displayedAngle, Math.round(curveJoin.angleDegrees * 1000) / 1000 + '°');
    assert.equal((await call('query', args, true)).code, 'DIRECT_JOIN_INPUT');
    assert.equal((await call('query', { ...pinned, parameter: insideLine }, true)).code, 'DIRECT_JOIN_UNAVAILABLE');
    assert.deepEqual(await call('query', pinned), { curveJoin });
    return curveJoin;
  });

  const edited = structuredClone(doc);
  edited.direct.objects.find(object => object.id === visible.id).name = 'Renamed joined curve';
  const editedFile = join(f.output, 'renamed-join.bcad');
  await writeFile(editedFile, JSON.stringify(edited));
  await withMcpSession(session, editedFile, 'agent-refuses-stale-join', async call => {
    const summary = await call('query', { action: 'summary' });
    assert.notEqual(summary.direct_revision, measurement.revision);
    assert.equal((await call('query', { ...args, expectedDirectRevision: measurement.revision }, true)).code, 'DIRECT_JOIN_STALE');
    assert.equal((await call('query', { ...args, expectedDirectRevision: summary.direct_revision })).curveJoin.angleDegrees, measurement.angleDegrees);
  });
  assert.deepEqual(await readFile(file), bytes);
  await f.same(doc);
  f.report.observations.push({ curveJoin: measurement, displayedAngle, nativeFileUnchanged: true });
  await f.snapshot('08-studio-angle-confirmed-by-agent');
}
