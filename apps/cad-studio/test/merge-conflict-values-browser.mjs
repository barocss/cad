import assert from 'node:assert/strict';
import { createFlow, sha256 } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/storage/VersionsPanel.tsx', 'apps/cad-studio/src/storage/MergeConflictChoices.tsx', 'apps/cad-studio/src/storage/useProject.ts', 'packages/barocss-cad-model/src/versions/merge.ts', 'apps/cad-studio/test/merge-conflict-values-browser.mjs'];
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 8] }, { id: 'n1', kind: 'extrude', sketch: 0, height: 6 },
  { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [20, 0], max: [30, 8] }, { id: 'n3', kind: 'extrude', sketch: 2, height: 6 },
], outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } }, nextId: 4, bodies: { b1: { name: 'Base' }, b3: { name: 'Sibling', hidden: true } } };
const f = await createFlow({ name: 'merge-conflict-values', output: process.argv[2], envFrozen: 'D1404_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Actual body Merge choices disclose both exact values and require fresh answers for a new target, while preserving explicit apply/Save and existing history boundaries.',
  limits: ['Two synthetic desktop solids; first name branches are authored through public UI. Edge cases load isolated valid stored project fixtures, not working-state injection.', 'No mobile, assistive technology, browser-restart persistence, simultaneous external editing or arbitrary large metadata claim.'],
  snapshotExtra: () => ({ dirty: !!document.querySelector('[aria-label="Unsaved changes"]'), branch: document.querySelector('[aria-label="Branch"]')?.value, conflicts: document.querySelector('[aria-label="Merge conflicts"]')?.textContent ?? null }),
  inspectorSource: String.raw`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeVersions, makeVersion, makeBranch } from '@barocss/cad-model/versions/log';
import { applyMerge } from '@barocss/cad-model/versions/merge';
import { encodeStudioFile, encodeStudioSnapshot } from '@barocss/cad-model/engine/container';
const seed = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const long = '<img src=x onerror="alert(1)"> & ' + 'long body '.repeat(35);
const specs = [
  ['same-name', { name: 'Same', hidden: true }, { name: 'Same', hidden: false, color: '#ff0000' }, 'ours'],
  ['long-name', { name: long }, { name: long + ' other' }, 'theirs'],
  ['empty-name', { name: '' }, {}, 'theirs'],
  ['deleted-metadata', undefined, { name: 'Beta', color: '#ff0000' }, 'ours'],
  ['independent-bodies', { name: 'Base', hidden: true }, { name: 'Base' }, 'automatic'],
];
const fixtures = [];
for (const [index, [label, oursLook, theirsLook, side]] of specs.entries()) {
  const sideDoc = look => { const d = structuredClone(seed); if (look === undefined) delete d.bodies.b1; else d.bodies.b1 = look; return d; };
  const ours = sideDoc(oursLook), theirs = sideDoc(theirsLook);
  if (side === 'automatic') theirs.bodies.b3.hidden = false;
  let log = makeBranch(makeVersions(seed, { at: '2026-11-15T00:00:00Z' }), 'name-side');
  log = makeVersion(log, ours, { at: '2026-11-15T00:01:00Z' }).log;
  log = makeVersion({ ...log, current: 'name-side' }, theirs, { at: '2026-11-15T00:02:00Z' }).log;
  log = { ...log, current: 'main' };
  const r = applyMerge(log, { from: 'name-side', working: ours, at: '2026-11-15T00:03:00Z', resolve: side === 'automatic' ? undefined : { 'bodies:b1': side } }); assert.ok('doc' in r);
  const { snapshots, ...indexLog } = log, file = 'edge.bcad';
  const files = { [file]: Array.from(encodeStudioFile(ours)), ['.barocss/versions/' + file + '.json']: Array.from(new TextEncoder().encode(JSON.stringify(indexLog))) };
  for (const [key, doc] of Object.entries(snapshots)) files['.barocss/snapshots/' + key + '.bcad'] = Array.from(encodeStudioSnapshot(doc, key));
  fixtures.push({ index, label, ours, theirs, side, expected: r.doc, files, file });
}
console.log(JSON.stringify(fixtures));
` });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const conflicts = () => panel().getByRole('alert', { name: 'Merge conflicts', exact: true });
const conflict = () => conflicts().getByLabel('Conflict bodies:b1', { exact: true });
const dirty = () => f.page.getByLabel('Unsaved changes', { exact: true });
let projectName, file;
async function attach() {
  if (!await panel().isVisible()) await button('Project and versions').click();
  await panel().getByLabel('Browser project name', { exact: true }).fill(projectName);
  await button('Project in this browser', panel()).click(); await panel().getByLabel('Project', { exact: true }).waitFor();
}
async function readFiles() {
  return f.page.evaluate(async project => {
    const root = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('projects')).getDirectoryHandle(project), files = {};
    async function read(dir, prefix = '') {
      for await (const [name, handle] of dir.entries()) {
        const path = prefix + name;
        if (path.startsWith('.barocss/autosave/')) continue;
        if (handle.kind === 'directory') await read(handle, path + '/');
        else files[path] = Array.from(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
      }
    }
    await read(root); return files;
  }, projectName);
}
async function state() {
  await f.ready();
  return { doc: await f.doc(), files: await readFiles(), ui: await f.page.evaluate(() => ({
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    undo: document.querySelector('button[aria-label="Undo"]')?.disabled,
    redo: document.querySelector('button[aria-label="Redo"]')?.disabled,
    history: [...document.querySelectorAll('.history .hs')].map(e => e.getAttribute('aria-label')),
  })) };
}
async function stable(before) { assert.deepEqual(await state(), before); }
async function startMerge(from) {
  await panel().getByLabel('Merge from', { exact: true }).selectOption(from); await button('Merge', panel()).click(); await conflicts().waitFor();
  assert.ok(await button('Merge with these answers', conflicts()).isDisabled());
  assert.ok(!await conflict().getByRole('radio', { name: 'bodies:b1 ours', exact: true }).isChecked());
  assert.ok(!await conflict().getByRole('radio', { name: 'bodies:b1 theirs', exact: true }).isChecked());
}
async function choose(side, keyboard = false) {
  const radio = conflict().getByRole('radio', { name: `bodies:b1 ${side}`, exact: true });
  if (keyboard) { await radio.focus(); await radio.press('Space'); await radio.press('Tab'); } else await radio.check();
  assert.ok(await radio.isChecked()); assert.ok(await button('Merge with these answers', conflicts()).isEnabled());
}
async function details() { for (const item of await conflict().locator('details').all()) { await item.locator('summary').click(); assert.ok(await item.getAttribute('open') !== null); } }
async function apply(expected, before, alreadyApplied = false) {
  if (!alreadyApplied) await button('Merge with these answers', conflicts()).click(); await f.same(expected); await dirty().waitFor();
  const after = await readFiles(); assert.deepEqual(after[file], before.files[file], 'primary file changes only on Save');
  const key = '.barocss/versions/' + file + '.json', oldLog = JSON.parse(Buffer.from(before.files[key]).toString()), log = JSON.parse(Buffer.from(after[key]).toString());
  assert.equal(log.versions.length, oldLog.versions.length + 1);
  const current = log.versions.find(v => v.id === log.branches.find(b => b.name === log.current).head); assert.equal(current.parents.length, 2);
  for (const [path, bytes] of Object.entries(before.files)) if (path !== key) assert.deepEqual(after[path], bytes, 'existing bytes remain immutable');
  await f.undo(); await f.same(before.doc); await f.redo(); await f.same(expected);
  await button('Save').click(); await dirty().waitFor({ state: 'hidden' });
  const saved = await readFiles(); assert.deepEqual(JSON.parse(Buffer.from(saved[file]).toString()), expected);
  return saved;
}
async function reopen(width, expected, files) {
  await button('Close project', panel()).click(); await f.page.reload(); await f.ready();
  await f.page.setViewportSize({ width, height: 900 }); await attach();
  await button('Open ' + file, panel()).click(); await f.same(expected); await dirty().waitFor({ state: 'hidden' });
  const reopened = await readFiles(); for (const [path, bytes] of Object.entries(files)) assert.deepEqual(reopened[path], bytes);
}
async function makeVersion(name) {
  await panel().getByLabel('Version name', { exact: true }).fill(name); await button('Make version', panel()).click();
  await panel().getByLabel('Version ' + name, { exact: true }).waitFor(); await dirty().waitFor({ state: 'hidden' }); return f.doc();
}
async function branch(name) { await panel().getByLabel('Branch name', { exact: true }).fill(name); await button('Make branch', panel()).click(); await panel().getByLabel('Branch', { exact: true }).locator(`option[value="${name}"]`).waitFor({ state: 'attached' }); }
async function switchTo(name, expected) { await panel().getByLabel('Branch', { exact: true }).selectOption(name); await f.same(expected); }
async function rename(name) {
  const before = await f.doc(); await f.page.locator('.ol-row').filter({ has: f.page.locator('button.ol-eye') }).locator('button.ol').first().dblclick();
  const edit = f.page.getByRole('textbox', { name: 'Body name', exact: true }); await edit.fill(name); await edit.press('Enter'); await f.changed(before);
}
await f.run(async () => {
  const fixtures = await f.inspect('edge-fixtures', seed);
  for (const width of [1024, 1440]) {
    f.phase = `${width} public branch name conflict and changed target`;
    await f.newPage(); await f.page.setViewportSize({ width, height: 900 });
    const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
    await chooser.setFiles({ name: 'body-names.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }); await f.same(seed);
    projectName = `D1404 names ${width}`; file = 'body-names.bcad'; await attach(); await makeVersion('Base');
    await branch('name-side'); await branch('gamma-side');
    await rename('Alpha'); const alpha = await makeVersion('Alpha');
    await switchTo('name-side', seed); await rename('Beta'); await makeVersion('Beta');
    await switchTo('gamma-side', seed); await rename('Gamma'); const gamma = await makeVersion('Gamma');
    await switchTo('main', alpha); await button('Save').click(); await dirty().waitFor({ state: 'hidden' });
    const before = await state(); await startMerge('name-side');
    const shown = await conflict().innerText(); for (const name of ['main', 'name-side', 'Alpha', 'Beta', 'Choose all body settings']) assert.ok(shown.includes(name), name);
    await stable(before); await details(); await stable(before); await choose('theirs', true); await stable(before); await f.snapshot(`${width}-alpha-beta-choice`);
    await panel().getByLabel('Merge from', { exact: true }).selectOption('gamma-side'); await conflicts().waitFor({ state: 'hidden' }); await stable(before);
    await button('Merge', panel()).click(); await conflicts().waitFor();
    assert.ok(await button('Merge with these answers', conflicts()).isDisabled()); assert.ok(!await conflict().getByRole('radio', { name: 'bodies:b1 theirs', exact: true }).isChecked());
    const changed = await conflict().innerText(); assert.ok(changed.includes('Gamma')); assert.ok(!changed.includes('Beta')); await stable(before);
    await choose('theirs', true); await stable(before); await f.snapshot(`${width}-alpha-gamma-fresh-choice`);
    const expected = { ...alpha, bodies: { ...alpha.bodies, b1: gamma.bodies.b1 } };
    const saved = await apply(expected, before); await f.snapshot(`${width}-gamma-applied-saved`); await reopen(width, expected, saved); await f.snapshot(`${width}-gamma-reopened`);
    f.report.observations.push({ width, source: 'public UI branch/version/name edits', targetAnswerReset: true, exactWholeObject: true, beforeFilesSHA256: sha256(JSON.stringify(before.files)), savedFilesSHA256: sha256(JSON.stringify(saved)) });
    for (const fixture of fixtures) {
      f.phase = `${width} stored ${fixture.label} conflict fixture`;
      await f.newPage(); await f.page.setViewportSize({ width, height: 900 }); projectName = `D1404 ${fixture.label} ${width}`; file = fixture.file;
      await f.page.evaluate(async ({ project, files }) => {
        const root = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('projects', { create: true })).getDirectoryHandle(project, { create: true });
        for (const [path, bytes] of Object.entries(files)) { let dir = root; const names = path.split('/'); for (const name of names.slice(0, -1)) dir = await dir.getDirectoryHandle(name, { create: true }); const writer = await (await dir.getFileHandle(names.at(-1), { create: true })).createWritable(); await writer.write(new Uint8Array(bytes)); await writer.close(); }
      }, { project: projectName, files: fixture.files });
      await attach(); await button('Open ' + file, panel()).click(); await f.same(fixture.ours); const original = await state();
      if (fixture.side === 'automatic') {
        await panel().getByLabel('Merge from', { exact: true }).selectOption('name-side'); await button('Merge', panel()).click();
        await f.same(fixture.expected); assert.ok(!await conflicts().count());
        const saved = await apply(fixture.expected, original, true); await reopen(width, fixture.expected, saved); await f.snapshot(`${width}-independent-bodies-reopened`);
        f.report.observations.push({ width, source: 'isolated stored valid fixture', case: fixture.label, independentAutomaticMerge: true }); continue;
      }
      await startMerge('name-side');
      const text = await conflict().innerText(); assert.ok(text.includes('main') && text.includes('name-side')); assert.ok(text.includes('Choose all body settings'));
      if (fixture.label === 'empty-name') { assert.ok(text.includes('Name: "" (empty)')); assert.ok(text.includes('Name: (not set)')); }
      if (fixture.label === 'deleted-metadata') assert.ok(text.includes('Body metadata deleted'));
      if (fixture.label === 'long-name') { assert.ok(text.includes(JSON.stringify(fixture.ours.bodies.b1.name))); assert.equal(await conflict().locator('img,script').count(), 0); }
      await stable(original); await details(); await stable(original);
      if (fixture.label === 'same-name') { const full = await conflict().innerText(); assert.ok(full.includes('true') && full.includes('false') && full.includes('#ff0000')); }
      await choose(fixture.side, true); await stable(original); await f.snapshot(`${width}-${fixture.label}-choice`);
      const saved = await apply(fixture.expected, original); await reopen(width, fixture.expected, saved); await f.snapshot(`${width}-${fixture.label}-reopened`);
      f.report.observations.push({ width, source: 'isolated stored valid fixture', case: fixture.label, side: fixture.side, exactDocument: true, primaryOnlyOnSave: true });
    }
  }
});
