import assert from 'node:assert/strict';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, input] = process.argv.slice(2), app = resolve(import.meta.dirname, '..');
assert.ok(output && input && isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
const sourceBytes = await readFile(input), source = JSON.parse(sourceBytes);
const cap = 'n3.top', stockCap = 'n1.top', stockVolume = 12000, sourceVolume = stockVolume + 54 * Math.PI;
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/test/delete-boss-face-browser.mjs',
  'packages/barocss-cad-model/src/app/deleteFaceCommand.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/bored-cap-offset.ts', 'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'delete-boss-face', envFrozen: 'DELETE_BOSS_CAP_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: 'Heal the stock plane by deleting the selected top of the exact cylindrical boss.',
  limits: ['One cylindrical boss fully within the top of a straight rectangular plate.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), [{ brep }] = partBreps(doc);
console.log(JSON.stringify({ brep, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (value, wanted) => assert.ok(Math.abs(value - wanted) < 1e-7, `${value} != ${wanted}`);

async function inspect(label, doc, expected, before) {
  const native = await f.inspect(label, doc), worker = (await f.bodies()).bodies;
  assert.equal(native.report.valid, true, native.report.issues.join(', '));
  assert.equal(native.report.topology[0].genus, 0);
  assert.ok(native.report.maximumPcurveGap < 1e-9 && native.report.maximumEdgeSurfaceGap < 1e-9);
  assert.equal(worker.length, 1);
  near(worker[0].volume, expected);
  near(native.mass.volume, expected);
  if (before) {
    assert.deepEqual(native.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    assert.deepEqual(native.mass.centroid, [20, 15, 5]);
    const retainedLoops = new Set(native.brep.loops.map(loop => loop.id));
    for (const face of native.brep.faces) {
      const original = before.brep.faces.find(item => item.id === face.id);
      assert.deepEqual(face, { ...original, loops: original.loops.filter(id => retainedLoops.has(id)) });
    }
    assert.deepEqual(native.brep.faces.map(face => face.name).sort(),
      ['n1.bottom', 'n1.side0', 'n1.side1', 'n1.side2', 'n1.side3', stockCap]);
    for (const key of ['coedges', 'edges', 'loops', 'vertices']) {
      for (const item of native.brep[key]) assert.deepEqual(item, before.brep[key].find(candidate => candidate.id === item.id));
    }
  }
  f.report.observations.push({ label, volume: native.mass.volume, workerVolume: worker[0].volume, counts: native.report.counts });
  return native;
}

async function pickFace(point, name) {
  const pixel = await f.page.evaluate(position => window.__studioScreenOf(position), point);
  assert.ok(pixel?.length === 2);
  await f.page.mouse.click(...pixel);
  const target = f.page.getByLabel('Face property and colour target');
  await target.waitFor();
  assert.ok((await target.innerText()).includes(name));
  await f.page.evaluate(() => document.activeElement?.blur());
}

async function healAgent() {
  const file = join(output, 'mcp-healed-boss.bcad');
  await copyFile(input, file);
  return withMcpSession({ app, output, clientName: 'delete-boss-face', autonomy: 3 }, file, 'boss-heal', async call => {
    const faces = [cap], pin = await call('query', { action: 'render', highlight: faces });
    const edit = { action: 'command', command: 'delete-face', faces, expectedRevision: pin.revision };
    const failure = await call('features', { ...edit, faces: [stockCap] }, true);
    assert.match(JSON.stringify(failure), /cylindrical boss top/i);
    assert.deepEqual(await readFile(file), sourceBytes);
    await call('features', edit);
    const bytes = await readFile(file), summary = await call('query', { action: 'summary' });
    assert.equal(summary.bodies.length, 1);
    assert.equal(summary.bodies[0].volume, stockVolume);
    assert.equal((await call('features', edit, true)).code, 'COMMAND_STALE');
    assert.deepEqual(await readFile(file), bytes);
    return { file, doc: JSON.parse(bytes) };
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
  f.phase = 'Require the boss cap by name through stdio MCP';
  const agent = await healAgent();
  await f.freshOpen(input, source, 'boss-source');
  const original = await inspect('source', source, sourceVolume);

  f.phase = 'Refuse the stock plane and select the exact boss top';
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  await f.page.waitForFunction(() => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === 'TOP';
  });
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  if (!(await filter.innerText()).includes('Faces')) await filter.click();
  await pickFace([30, 21, 10], stockCap);
  await f.page.keyboard.press('Space');
  await f.page.locator('.palette input').fill('Delete face');
  const entry = f.page.locator('.palette .pl-item[data-value="delete-face"]');
  await entry.waitFor();
  assert.match(await entry.getAttribute('class'), /off/);
  assert.match(await entry.innerText(), /cylindrical boss top/i);
  await f.page.keyboard.press('Enter');
  await f.same(source);
  await f.snapshot('delete-stock-plane-refused');
  await f.page.keyboard.press('Escape');
  await f.page.locator('.palette').waitFor({ state: 'hidden' });

  f.phase = 'Apply one Delete face to the cylindrical boss';
  await pickFace([11, 9, 16], cap);
  await f.command('Delete face');
  const panel = f.page.getByRole('dialog', { name: 'Delete face', exact: true }), apply = button('Apply', panel);
  await apply.waitFor();
  await f.same(source);
  await apply.click();
  await f.changed(source);
  const healed = await f.doc(), edit = healed.nodes.at(-1);
  assert.deepEqual(healed, agent.doc);
  assert.equal(edit.kind, 'delete-face');
  assert.deepEqual(edit.faces, [cap]);
  assert.deepEqual(edit.parent, { node: 4, side: 'solid' });
  assert.equal(edit.sigs[cap].k, 'plane');
  const result = await inspect('healed', healed, stockVolume, original);
  await f.undo(); await f.same(source);
  await f.redo(); await f.same(healed);
  const saved = await f.save('healed-boss');
  await f.freshOpen(saved.file, healed, 'boss-healed-reopened');
  assert.deepEqual((await inspect('reopened', healed, stockVolume, original)).brep, result.brep);
  await f.freshOpen(agent.file, agent.doc, 'boss-healed-mcp-reopened');
  assert.deepEqual((await inspect('mcp-file', agent.doc, stockVolume, original)).brep, result.brep);
  assert.deepEqual(await readFile(input), sourceBytes);

  f.phase = 'Refuse a saved cap signature that points in the wrong direction';
  const wrong = structuredClone(healed), wrongFile = join(output, 'wrong-boss-cap.bcad');
  wrong.nodes.at(-1).sigs[cap].d = [0, 0, -1];
  await writeFile(wrongFile, JSON.stringify(wrong));
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(wrongFile);
  await f.waitToast(/part is unchanged/i);
  await f.same(healed);
  await f.snapshot('boss-cap-file-refused');
});
