// D760/B05-04: actual concentric and distance mates on the existing pin-and-holder recipes.
import assert from 'node:assert/strict';
import { createFlow, sha256 } from './flow-helper.mjs';
import { inspectorSource, oracleSource } from './static-assembly-axial-mate-oracles.mjs';

const pins = [
  'apps/cad-studio/test/static-assembly-axial-mate-browser.mjs', 'apps/cad-studio/test/static-assembly-axial-mate-oracles.mjs', 'apps/cad-studio/src/ui/MatePanel.tsx',
  'apps/cad-studio/src/assembly/useAssembly.ts', 'packages/barocss-cad-model/src/assembly/mates.ts',
  'packages/barocss-cad-model/src/assembly/faces.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
];
const f = await createFlow({
  name: 'static-assembly-axial-mate', envFrozen: 'D760_SOURCE_FROZEN', output: process.argv[2],
  qualification: 'Concentric and distance mates on one ordinary pin and holder',
  initialFiles: pins, requiredFrozen: pins, inspectorSource,
  limits: ['One unrotated pin and holder with an existing Ø8 through bore. No interference or fit certification.'],
  snapshotExtra: () => ({
    bounds: window.__studioInstanceBounds?.() ?? [],
    freedom: document.querySelector('[aria-label="Freedom"]')?.textContent ?? null,
    refusal: document.querySelector('[aria-label="Mate refused"]')?.textContent ?? null,
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
  }),
  oracleSource,
});

await f.run(async () => {
  const fixture = await f.inspect('fixture', {}, 'fixture');
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  await f.newPage();
  const page = f.page, button = name => page.getByRole('button', { name, exact: true });
  const mates = page.getByRole('complementary', { name: 'Mates', exact: true });
  const freedom = mates.getByLabel('Freedom', { exact: true });
  const selectPin = () => page.locator('.ol.instance:not(.nested)').filter({ hasText: 'Pin' }).click();
  const choose = async (part, face) => {
    await mates.getByLabel('Reference part', { exact: true }).selectOption(part);
    await mates.getByLabel('Reference geometry', { exact: true }).selectOption(face);
    await mates.getByRole('button', { name: 'Pick mate reference', exact: true }).click();
  };
  const start = async (kind, distance) => {
    await mates.getByRole('button', { name: 'Add mate', exact: true }).click();
    await mates.getByLabel('Mate type', { exact: true }).selectOption(kind);
    if (kind === 'distance') {
      await mates.getByLabel('Mate flip', { exact: true }).setChecked(false);
      if (distance !== undefined) {
        const field = mates.getByLabel('Mate distance', { exact: true });
        await field.fill(String(distance));
        await field.press('Enter');
      }
    }
  };
  const distanceRefs = async () => { await choose('base', 'n1.top'); await choose('pin', 'n1.bottom'); };
  const binding = async (label, z, distance) => {
    await page.waitForFunction(z => {
      const b = window.__studioInstanceBounds?.()?.find(row => row.id === 'pin');
      return b?.min?.[0] === 28 && b.min[1] === 12 && b.min[2] === z && b.max?.[2] === z + 20;
    }, z);
    const state = await f.snapshot(label);
    const native = await f.inspect(label, state.doc, 'read');
    await f.runOracle({ doc: state.doc, native, bounds: state.bounds, z, distance }, label);
    return state;
  };
  const waitFreedom = text => freedom.getByText(text, { exact: true }).waitFor();

  f.phase = 'Open the native holder and pin';
  const file = 'pin-and-holder.bcad', bytes = Buffer.from(JSON.stringify(fixture));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: file, mimeType: 'application/json', buffer: bytes });
  await page.waitForFunction(() => window.__studioDoc?.instances?.[0]?.id === 'pin');
  await f.ready();
  await selectPin();
  f.report.observations.push({ sourceSHA256: sha256(bytes) });
  await f.snapshot('native-pin-and-holder');

  f.phase = 'Make the pin and bore concentric';
  await start('concentric');
  await choose('base', 'n2.side0');
  await choose('pin', 'n1.side0');
  await page.waitForFunction(() => window.__studioDoc?.mates?.length === 1);
  await waitFreedom('free: 1 slide · 1 turn');
  await binding('concentric-pin', 0);

  f.phase = 'Add zero Distance, then edit the signed distance to 3 mm';
  await start('distance', 0);
  await distanceRefs();
  await page.waitForFunction(() => window.__studioDoc?.mates?.length === 2);
  await waitFreedom('free: 1 turn');
  const zero = await binding('distance-zero', 8, 0);
  const editDistance = async value => {
    const field = mates.getByLabel('Mate distance', { exact: true });
    if (!(await field.count())) await mates.locator('button.ol.mate').filter({ hasText: 'Distance' }).click();
    await field.fill(String(value));
    await field.press('Enter');
    await page.waitForFunction(value => window.__studioDoc?.mates?.[1]?.distance === value, value);
  };
  await editDistance(3);
  const three = await binding('distance-three', 11, 3);

  f.phase = 'Refuse a conflicting 5 mm distance and verify first Undo and Redo';
  await start('distance', 5);
  await distanceRefs();
  await mates.getByRole('status', { name: 'Mate refused', exact: true }).waitFor();
  const refused = await binding('distance-five-conflict', 11, 3);
  assert.match(refused.refusal, /Distance.*2 mm/);
  assert.deepEqual(refused.doc, three.doc);
  assert.equal(refused.dirty, three.dirty);
  await mates.getByRole('button', { name: 'Cancel', exact: true }).click();
  await button('Undo').click();
  await f.same(zero.doc);
  await binding('first-undo-restores-zero', 8, 0);
  await button('Redo').click();
  await f.same(three.doc);
  await binding('redo-restores-three', 11, 3);

  f.phase = 'Save, reopen and edit the mate again';
  const project = 'D760 axial static assembly', panel = () => page.getByRole('complementary', { name: 'Versions panel', exact: true });
  const attach = async () => {
    if (!(await panel().isVisible())) await button('Project and versions').click();
    await panel().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
    await panel().getByRole('button', { name: 'Project in this browser', exact: true }).click();
    await panel().getByLabel('Project', { exact: true }).waitFor();
  };
  await attach();
  await button('Save').click();
  await panel().getByRole('list', { name: 'Project documents', exact: true }).getByText(file, { exact: true }).waitFor();
  const saved = await page.evaluate(async ([project, file]) => {
    const root = await navigator.storage.getDirectory();
    const dir = await (await root.getDirectoryHandle('projects')).getDirectoryHandle(project);
    return (await (await dir.getFileHandle(file)).getFile()).text();
  }, [project, file]);
  assert.deepEqual(JSON.parse(saved), three.doc);
  f.report.files.push({ name: file, sha256: sha256(saved) });
  await panel().getByRole('button', { name: 'Close project', exact: true }).click();
  await panel().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await page.reload();
  await f.ready();
  await attach();
  await panel().getByRole('button', { name: 'Open ' + file, exact: true }).click();
  await f.same(three.doc);
  await selectPin();
  await waitFreedom('free: 1 turn');
  await binding('fresh-open-distance-three', 11, 3);
  await editDistance(0);
  await f.same(zero.doc);
  await binding('fresh-open-edit-distance-zero', 8, 0);
  assert.deepEqual(f.report.downloads, []);
});
