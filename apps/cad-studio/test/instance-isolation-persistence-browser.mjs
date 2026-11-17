import assert from 'node:assert/strict';
import { createFlow, sha256 } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const f = await createFlow({ name: 'instance-isolation-persistence', output: process.argv[2], envFrozen: 'ISOLATION_PERSISTENCE_FROZEN',
  initialFiles: ['apps/cad-studio/test/instance-isolation-persistence-browser.mjs'],
  qualification: '#235 actual OPFS Save/fresh Open and complete BOM remain independent of session isolation.',
  limits: ['One synthetic four-instance assembly. BOM UI consumer only; no export/download or native CLI. Hidden-part BOM policy is observed, not changed.'] });
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 10 }], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  instances: ['A', 'B', 'C', 'D'].map((name, i) => ({ id: `p${i + 1}`, name, doc: structuredClone(part), position: [i * 20, 0, 0], rotation: [0, 0, 0],
    part: { id: `own-${name}`, rev: 'A', source: `own-${name}.bcad` }, ...(name === 'D' ? { hidden: true } : {}) })) };
const project = 'Isolation persistence acceptance', file = 'isolation-parts.bcad';
const button = name => f.page.getByRole('button', { name, exact: true });
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
async function attach() {
  if (!await versions().isVisible()) await button('Project and versions').click();
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await versions().getByRole('button', { name: 'Project in this browser', exact: true }).click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}
async function bytes() { return f.page.evaluate(async ([project, file]) => {
  const root = await navigator.storage.getDirectory();
  const dir = await (await root.getDirectoryHandle('projects')).getDirectoryHandle(project);
  return (await (await dir.getFileHandle(file)).getFile()).text();
}, [project, file]); }
async function save() {
  const before = await f.page.evaluate(() => window.__isolationWrites);
  await button('Save').click(); await f.page.waitForFunction(n => window.__isolationWrites > n, before);
  return bytes();
}
async function bom() {
  await clickModelCommand(f.page, 'Inspect', 'BOM');
  const panel = f.page.getByRole('complementary', { name: 'BOM panel', exact: true });
  await panel.getByLabel('BOM totals', { exact: true }).waitFor();
  const result = { rows: await panel.getByRole('table', { name: 'BOM lines', exact: true }).getByRole('row').allTextContents(),
    totals: await panel.getByLabel('BOM totals', { exact: true }).textContent(),
    quantities: await panel.locator('[aria-label^="BOM line "]').evaluateAll(rows => rows.map(row => row.querySelectorAll('td')[2]?.textContent)) };
  // Existing BOM includes hidden top-level occurrences and groups these identical solids.
  assert.deepEqual(result.quantities, ['4']); assert.match(result.totals, /^4 parts/);
  await panel.getByRole('button', { name: 'Close BOM', exact: true }).click(); return result;
}
await f.run(async () => {
  const original = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await original(options);
    await context.addInitScript(file => {
      window.__isolationWrites = 0; const create = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = async function (...args) {
        const stream = await create.apply(this, args); if (this.name !== file) return stream;
        const close = stream.close.bind(stream); stream.close = async (...args) => {
          const result = await close(...args); window.__isolationWrites++; return result;
        }; return stream;
      };
    }, file); return context;
  };
  await f.newPage(); await f.page.setViewportSize({ width: 1440, height: 900 });
  await f.page.setInputFiles('input[aria-label="Model file"]', { name: file, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed); await f.page.waitForFunction(() => window.__studioInstanceBounds?.()?.length === 3);
  await button('Top').click(); await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  f.phase = 'Baseline OPFS file and BOM before isolation';
  await attach(); const baseline = await save(); assert.deepEqual(JSON.parse(baseline), seed);
  const beforeBom = await bom(); assert.ok(beforeBom.rows.length > 1);
  await button('Display and previews').click();
  await f.page.locator('[data-browser-instance-path="p1"]').click(); await button('Isolate selection').click();
  await button('Add B to isolation').click(); assert.equal(await button('Add A to isolation').isDisabled(), true);
  assert.equal(await button('Add B to isolation').isDisabled(), true); assert.equal(await button('Add C to isolation').isEnabled(), true);
  f.phase = 'Isolated A+B Save bytes and full BOM unchanged';
  assert.equal(await save(), baseline); const isolatedBom = await bom(); assert.deepEqual(isolatedBom, beforeBom); await f.same(seed);
  assert.equal(await button('Add B to isolation').isDisabled(), true); await f.snapshot('01-isolated-save-bom-preserved');
  await versions().getByRole('button', { name: 'Close project', exact: true }).click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload(); await f.ready(); await attach();
  f.phase = 'Fresh OPFS Open keeps full authored source and resets isolation';
  await versions().getByRole('button', { name: 'Open ' + file, exact: true }).click(); await f.same(seed);
  await f.page.waitForFunction(() => window.__studioInstanceBounds?.()?.length === 3);
  assert.equal(await bytes(), baseline); assert.equal(await f.page.locator('[data-add-isolation]').count(), 0);
  const reopenedBom = await bom(); assert.deepEqual(reopenedBom, beforeBom); await f.same(seed);
  await f.snapshot('02-fresh-open-full-assembly');
  f.report.files.push({ name: file, bytes: Buffer.byteLength(baseline), sha256: sha256(baseline), method: 'Actual named OPFS writable.close completion before baseline/isolated raw-byte reads; fresh Open exact Doc and bytes' });
  f.report.observations.push({ beforeBom, isolatedBom, reopenedBom, fullAuthoredInstances: seed.instances.map(i => ({ id: i.id, hidden: !!i.hidden, part: i.part })) });
  assert.deepEqual(f.report.downloads, []);
});
