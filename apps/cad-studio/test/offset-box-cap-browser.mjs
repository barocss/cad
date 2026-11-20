import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, input, side = 'upper', legacy] = process.argv.slice(2), app = resolve(import.meta.dirname, '..');
assert.ok(output && input && isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
assert.ok(['upper', 'lower'].includes(side));
const upper = side === 'upper', sign = upper ? 1 : -1, station = upper ? 30 : 0;
const faceName = upper ? 'n1.top' : 'n1.bottom', view = upper ? 'Top' : 'Bottom';
const bytes = await readFile(input), source = JSON.parse(bytes);
const pins = [
  'packages/barocss-cad-model/src/app/nativeOffsetFace.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/offsetFaceEdit.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/drafted-cap-offset.ts', 'packages/barocss-cad/src/part/part-model.ts',
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/test/offset-box-cap-browser.mjs',
];
const f = await createFlow({
  name: 'offset-box-cap', envFrozen: 'BOX_NATIVE_TOP_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: `Move the ${side} cap of a 10 × 20 × 30 mm box and preserve native identity and edit history.`,
  limits: ['One authored straight rectangular extrusion with an original Z-facing cap.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), [{ brep }] = partBreps(doc);
const { bodies, shells, faces, loops, coedges, edges, vertices } = brep;
const identities = [bodies, shells, loops, faces.map(({ surface, ...face }) => [face, surface.id]),
  coedges.map(({ pcurve, ...use }) => [use, pcurve?.id]), edges.map(({ curve, ...edge }) => [edge, curve.id]),
  vertices.map(vertex => vertex.id)];
const planes = Object.fromEntries(faces.map(face => {
  const { o, n } = faceGeometry(face);
  return [face.name, [n, n.reduce((sum, value, i) => sum + value * o[i], 0)]];
}));
console.log(JSON.stringify({ brep, identities, planes, mass: brepMassProperties(brep, 1), report: checkBrep(brep, { strict: true }) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const dialog = name => f.page.getByRole('dialog', { name, exact: true });
const distance = panel => panel.getByLabel('Offset', { exact: true });
const status = (panel, text) => panel.locator('.status').filter({ hasText: new RegExp('^' + text + '$') }).waitFor();
const near = (actual, value) => assert.ok(Math.abs(actual - value) < 1e-8, actual + ' != ' + value);

async function measure(label, doc, offset, original) {
  const native = await f.inspect(label, doc), z = station + sign * offset, volume = 200 * (30 + offset);
  near(native.mass.volume, volume);
  near((await f.bodies()).bodies[0].volume, volume);
  native.mass.centroid.forEach((value, k) => near(value, [5, 10, 15 + sign * offset / 2][k]));
  assert.ok(native.report.valid, native.report.issues.join(', '));
  assert.deepEqual(native.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.ok(native.report.maximumPcurveGap < 1e-9 && native.report.maximumEdgeSurfaceGap < 1e-9);
  if (original) {
    assert.deepEqual(native.identities, original.identities);
    assert.deepEqual(native.planes, { ...original.planes, [faceName]: [[0, 0, sign], sign * z || 0] });
    assert.deepEqual(native.brep.vertices.map(({ point }) => point), original.brep.vertices.map(({ point: [x, y, h] }) =>
      [x, y, h === station ? z : h]));
  }
  f.report.observations.push({ label, offset, volume: native.mass.volume, z, maximumPcurveGap: native.report.maximumPcurveGap });
  return native;
}

async function mcpOffset(offset, verifyContact = false) {
  const file = join(output, 'mcp-box-' + offset + '.bcad');
  await copyFile(input, file);
  return withMcpSession({ app, output, clientName: 'offset-box-cap', autonomy: 3 }, file, 'mcp-box-' + offset, async call => {
    const faces = [faceName], pin = await call('query', { action: 'render', highlight: faces });
    const edit = { action: 'command', command: 'offset-face', faces, values: { d: offset }, expectedRevision: pin.revision };
    if (verifyContact) {
      const failure = await call('features', { ...edit, values: { d: -30 } }, true);
      assert.match(JSON.stringify(failure), /reach or cross the opposite cap/);
      assert.deepEqual(await readFile(file), bytes);
    }
    await call('features', edit);
    const saved = await readFile(file), summary = await call('query', { action: 'summary' });
    assert.equal(summary.bodies.length, 1);
    near(summary.bodies[0].volume, 200 * (30 + offset));
    assert.equal((await call('features', edit, true)).code, 'COMMAND_STALE');
    assert.deepEqual(await readFile(file), saved);
    return { file, doc: JSON.parse(saved) };
  });
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Apply both offsets through stdio MCP';
  const agentOut = await mcpOffset(5, true), agentIn = await mcpOffset(-5);
  await f.freshOpen(input, source, 'box-original');
  const original = await measure('original', source, 0);

  f.phase = 'Select the original cap and apply the signed offset';
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: view, exact: true }).click();
  await f.page.waitForFunction(expected => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === expected;
  }, view.toUpperCase());
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  if (!(await filter.innerText()).includes('Faces')) await filter.click();
  const pixel = await f.page.evaluate(z => window.__studioScreenOf([5, 10, z]), station);
  assert.ok(pixel?.length === 2);
  await f.page.mouse.click(...pixel);
  const selection = f.page.getByLabel('Face property and colour target');
  await selection.waitFor();
  assert.ok((await selection.innerText()).includes(faceName));
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = dialog('Offset face');
  assert.equal(await panel.getByLabel('Mode', { exact: true }).count(), 0);
  await distance(panel).fill('5');
  await status(panel, 'preview');
  await f.same(source);
  await button('Apply', panel).click();
  await f.changed(source);
  const outward = await f.doc(), edit = outward.nodes.at(-1);
  assert.deepEqual(outward, agentOut.doc);
  assert.equal(outward.nodes.length, source.nodes.length + 1);
  assert.equal(edit.kind, 'offset-face');
  assert.deepEqual(edit.faces, [faceName]);
  await measure('outward', outward, 5, original);
  await f.snapshot('box-native-outward');

  f.phase = 'Refuse exact collapse and apply the inward History edit';
  await f.openFeatureEditor(source.nodes.length, 'native box cap');
  await button('Edit offset', f.editor()).click();
  const history = dialog('Edit Offset face');
  await distance(history).fill('-30');
  await status(history, 'refused');
  const error = history.locator('.hud-error');
  if (await error.locator('summary').count()) await error.locator('summary').click();
  assert.match(await error.innerText(), /reach or cross the opposite cap/);
  assert.ok(await button('Apply', history).isDisabled());
  await f.same(outward);
  await f.snapshot('box-cap-collapse-refused');
  await distance(history).fill('-5');
  await status(history, 'preview');
  await button('Apply', history).click();
  await f.changed(outward);
  const inward = await f.doc();
  assert.deepEqual(inward, agentIn.doc);
  assert.deepEqual(inward.nodes.at(-1), { ...edit, distance: -5 });
  const accepted = await measure('inward', inward, -5, original);
  await f.undo(); await f.same(outward);
  await f.redo(); await f.same(inward);
  const saved = await f.save('box-cap-native-offset');
  await f.freshOpen(saved.file, inward, 'box-cap-reopened');
  assert.deepEqual((await measure('reopened', inward, -5, original)).brep, accepted.brep);
  await f.freshOpen(agentIn.file, agentIn.doc, 'box-cap-mcp-reopened');
  assert.deepEqual((await measure('mcp-reopened', agentIn.doc, -5, original)).brep, accepted.brep);
  assert.deepEqual(await readFile(input), bytes);

  if (legacy) {
    const legacyBytes = await readFile(legacy), legacyDoc = JSON.parse(legacyBytes);
    await f.freshOpen(legacy, legacyDoc, 'legacy-box-cap-opened');
    assert.equal(legacyDoc.nodes.at(-1).kind, 'union');
    near((await f.bodies()).bodies[0].volume, 7000);
    await f.openFeatureEditor(legacyDoc.nodes.length - 1, 'legacy box offset');
    await button('Edit offset', f.editor()).click();
    const priorEdit = dialog('Edit Offset face');
    await distance(priorEdit).fill('4');
    await status(priorEdit, 'preview');
    await button('Apply', priorEdit).click();
    await f.changed(legacyDoc);
    const revised = await f.doc();
    assert.equal(revised.nodes.at(-1).kind, 'union');
    near((await f.bodies()).bodies[0].volume, 6800);
    assert.deepEqual(await readFile(legacy), legacyBytes);
    await f.snapshot('legacy-box-cap-edited');
  }
});
