// D764/B08-01: named Restore is a dirty edit until explicit Save.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const compare = process.argv.includes('--compare');
const fixture = join(import.meta.dirname, 'fixtures', 'bracket.bcad');
const pins = [
  'apps/cad-studio/test/project-named-version-restore-browser.mjs', 'apps/cad-studio/test/fixtures/bracket.bcad',
  'apps/cad-studio/handover/roadmap-tracks/16-b08-evidence-ledger.md',
  'apps/cad-studio/src/storage/useProject.ts', 'apps/cad-studio/src/storage/project.ts', 'apps/cad-studio/src/storage/VersionsPanel.tsx',
  'packages/barocss-cad-model/src/versions/log.ts',
  'apps/cad-studio/src/App.tsx',
  ...(process.argv.includes('--comparison-hook') ? ['apps/cad-studio/src/storage/useWorkingVersionComparison.ts'] : []),
];

const f = await createFlow({
  name: 'project-named-version-restore', envFrozen: 'D764_SOURCE_FROZEN', output: process.argv[2],
  qualification: compare ? 'Working and saved comparisons keep their correct overlay owner, native version bytes and fresh project Open.'
    : 'B08-01 named version, dirty Restore, explicit Save and current geometry',
  initialFiles: pins, requiredFrozen: pins,
  limits: ['One rectangular extrusion and one browser project. Branch and autosave failure groups are separate.'],
  inspectorSource: String.raw`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
const result = evaluateDoc(JSON.parse(readFileSync(process.argv[2], 'utf8')), 0);
assert.equal(result.ok, true, JSON.stringify(result.error));
assert.equal(result.bodies.length, 1);
const body = result.bodies[0];
console.log(JSON.stringify({ volume: body.volume, centroid: body.centroid, bounds: body.mesh.bounds }));
`,
  oracleSource: String.raw`
import json, math, sys
x = json.load(sys.stdin)
d, h = x["doc"], x["height"]
assert d["nodes"][0]["min"] == [0,0] and d["nodes"][0]["max"] == [30,12]
assert d["nodes"][1]["height"] == h
for read in (x["native"], x["current"]):
    assert math.isclose(read["volume"], 30*12*h, rel_tol=1e-9)
    assert all(abs(v-w) <= 1e-9 for v,w in zip(read["centroid"], [15,6,h/2], strict=True))
assert x["native"]["bounds"] == {"min":[0,0,0],"max":[30,12,h]}
print(json.dumps({"status":"PASS","height":h,"volume":360*h}))
`,
  snapshotExtra: () => ({
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    versions: [...document.querySelectorAll('[aria-label="Versions"] > li')].map(row => row.getAttribute('aria-label')),
    activePath: document.querySelector('[aria-label="Project documents"] [data-active="true"]')?.textContent ?? null,
    comparison: document.querySelector('[aria-label="Compared changes"]')?.textContent ?? null,
    overlay: window.__studioCompareOverlay?.() ?? null,
  }),
});

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, acceptDownloads: false, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  const page = f.page, button = name => page.getByRole('button', { name, exact: true });
  const versions = page.getByRole('complementary', { name: 'Versions panel', exact: true });
  const project = 'D764 named version', file = 'bracket.bcad', versionName = 'Reference height 6';
  const attach = async () => {
    if (!(await versions.isVisible())) await button('Project and versions').click();
    await versions.getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
    await versions.getByRole('button', { name: 'Project in this browser', exact: true }).click();
    await versions.getByLabel('Project', { exact: true }).waitFor();
  };
  const readNative = path => page.evaluate(async ([project, path]) => {
    const root = await navigator.storage.getDirectory();
    let dir = await (await root.getDirectoryHandle('projects')).getDirectoryHandle(project);
    for (const segment of path.slice(0, -1)) dir = await dir.getDirectoryHandle(segment);
    return (await (await dir.getFileHandle(path.at(-1))).getFile()).text();
  }, [project, path]);
  const readPart = () => readNative([file]);
  const readLog = () => readNative(['.barocss', 'versions', file + '.json']);
  const dirty = page.getByLabel('Unsaved changes', { exact: true });
  const save = async () => {
    await button('Save').click();
    await versions.getByRole('list', { name: 'Project documents', exact: true }).getByText(file, { exact: true }).waitFor();
    await dirty.waitFor({ state: 'hidden' });
  };
  const binding = async (label, height, isDirty) => {
    await f.ready();
    const state = await f.snapshot(label);
    assert.equal(state.dirty, isDirty);
    assert.equal(state.activePath, file);
    assert.deepEqual(state.versions, ['Version ' + versionName]);
    const native = await f.inspect(label, state.doc);
    assert.equal(state.bodies.bodies.length, 1);
    await f.runOracle({ doc: state.doc, native, current: state.bodies.bodies[0], height }, label);
    return state.doc;
  };
  const editHeight = async (height, before) => {
    await f.openFeatureEditor(1);
    await f.editor().getByLabel('Distance', { exact: true }).fill(String(height));
    await f.editor().getByRole('button', { name: 'Apply', exact: true }).click();
    await f.changed(before);
    await f.closeEditor();
  };

  f.phase = 'Save the source and make an immutable named version';
  const source = await readFile(fixture);
  await f.openFile(fixture, 2);
  await page.waitForFunction(() => window.__studioDoc.nodes?.[1]?.height === 6);
  await attach();
  await save();
  await versions.getByLabel('Version name', { exact: true }).fill(versionName);
  await versions.getByRole('button', { name: 'Make version', exact: true }).click();
  await versions.getByLabel('Version ' + versionName, { exact: true }).waitFor();
  const baseline = await binding('named-H6', 6, false);
  const logText = await readLog();
  const log = JSON.parse(logText);
  const [named] = log.versions;
  assert.equal(log.versions.length, 1);
  assert.equal(named.name, versionName);
  const readSnapshot = () => readNative(['.barocss', 'snapshots', named.snapshot + '.bcad']);
  const snapshotText = await readSnapshot();
  assert.deepEqual(JSON.parse(snapshotText), baseline);
  assert.deepEqual(JSON.parse(await readPart()), baseline);
  f.report.observations.push({ sourceSHA256: sha256(source), versionId: named.id, snapshotKey: named.snapshot, logSHA256: sha256(logText), snapshotSHA256: sha256(snapshotText) });

  f.phase = 'Edit to height 8, Save, then Restore only the working document';
  await editHeight(8, baseline);
  await save();
  const newer = await binding('saved-H8', 8, false);
  const newerBytes = await readPart();
  assert.deepEqual(JSON.parse(newerBytes), newer);

  if (compare) {
    f.phase = 'Create a second saved version and a later working revision';
    await versions.getByLabel('Version name', { exact: true }).fill('Reference height 8');
    await versions.getByRole('button', { name: 'Make version', exact: true }).click();
    await versions.getByLabel('Version Reference height 8', { exact: true }).waitFor();
    await editHeight(10, newer);
    await save();
    const working = await f.doc(), storedLog = await readLog(), storedPart = await readPart();
    const storedSnapshots = await Promise.all(JSON.parse(storedLog).versions.map(v => readNative(['.barocss', 'snapshots', v.snapshot + '.bcad'])));
    assert.equal(working.nodes[1].height, 10);
    const toggle = () => versions.getByRole('button', { name: 'Compare ' + versionName, exact: true }).click();
    const noOverlay = () => page.waitForFunction(() => window.__studioCompareOverlay?.() === null);
    const workingOverlay = () => page.waitForFunction(() => {
      const result = window.__studioCompareOverlay?.();
      return result?.method === 'boolean' && Math.abs(result.added - 1440) < 1e-7 && (result.removed === 0 || result.removed === null);
    });
    const changes = () => versions.getByRole('status', { name: 'Compared changes', exact: true });

    f.phase = 'Switch between working geometry and a saved version';
    await toggle();
    await workingOverlay();
    assert.match(await changes().innerText(), /From the version to the working document/);
    const visible = await f.snapshot('working-comparison');
    assert.equal(visible.bodies.bodies[0].volume, 3600);
    const target = versions.getByLabel('Compare to', { exact: true });
    await target.selectOption({ label: 'Reference height 8' });
    await noOverlay();
    assert.match(await changes().innerText(), /Reference height 6 → Reference height 8 · saved versions/);
    await f.same(working);
    await f.snapshot('saved-comparison');
    await target.selectOption({ label: 'Working document' });
    await workingOverlay();

    f.phase = 'Hide and then close the project while its comparison is visible';
    await toggle();
    await noOverlay();
    await changes().waitFor({ state: 'hidden' });
    await f.same(working);
    await f.snapshot('hidden-comparison');
    await toggle();
    await workingOverlay();
    await versions.getByRole('button', { name: 'Close project', exact: true }).click();
    await noOverlay();
    await page.reload();
    await f.ready();
    await attach();
    await versions.getByRole('button', { name: 'Open ' + file, exact: true }).click();
    await f.same(working);
    await noOverlay();
    await changes().waitFor({ state: 'hidden' });
    await f.snapshot('project-reopened');
    assert.equal(await readPart(), storedPart);
    assert.equal(await readLog(), storedLog);
    for (const [index, v] of JSON.parse(storedLog).versions.entries()) {
      assert.equal(await readNative(['.barocss', 'snapshots', v.snapshot + '.bcad']), storedSnapshots[index]);
    }
    f.report.observations.push({ workingVolume: 3600, added: 1440, method: 'boolean',
      workingSHA256: sha256(storedPart), versionLogSHA256: sha256(storedLog), snapshots: storedSnapshots.map(sha256) });
    return;
  }

  await versions.getByRole('button', { name: 'Restore ' + versionName, exact: true }).click();
  await f.same(baseline);
  await dirty.waitFor();
  await binding('restored-H6-dirty', 6, true);
  assert.equal(await readPart(), newerBytes);
  assert.equal(await readLog(), logText);
  assert.equal(await readSnapshot(), snapshotText);

  f.phase = 'Explicitly save, reopen and edit the restored native part';
  await save();
  const saved = await readPart();
  assert.deepEqual(JSON.parse(saved), baseline);
  assert.equal(await readLog(), logText);
  assert.equal(await readSnapshot(), snapshotText);
  f.report.files.push({ name: file, restoredSHA256: sha256(saved), beforeRestoreSHA256: sha256(newerBytes) });
  await versions.getByRole('button', { name: 'Close project', exact: true }).click();
  await versions.getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await page.reload();
  await f.ready();
  await attach();
  await versions.getByRole('button', { name: 'Open ' + file, exact: true }).click();
  await f.same(baseline);
  await binding('fresh-open-H6', 6, false);
  await editHeight(10, baseline);
  await binding('post-open-H10', 10, true);
  assert.equal(await readPart(), saved);
  assert.equal(await readLog(), logText);
  assert.equal(await readSnapshot(), snapshotText);
  assert.deepEqual(f.report.downloads, []);
});
