// Roadmap 10 ⑥ (#2251): assembly instruction steps in the actual Studio. Fixture apps/cad-studio/test/fixtures/assembly-steps.bcad: a base plate and four occurrences of three
// definitions — Block 1 and Block 2 (one "block"), Post, Cap (resting on the post). Real clicks and keys: the palette "Assembly steps"; the outliner rows; New step from selection,
// Add selected parts to this step, the step name box (Enter), Step explode, Capture view; Prev / Next / a step row / Go to its step; the Instance panel's Remove (refused);
// Undo / Redo, Save, a fresh Open, Close steps.
// Checks: three steps (Blocks: Block 1 + Block 2; Post; Cap) built through the panel; Prev / Next / a direct jump give the same step (position and parts); Go to its step from
// Block 2 lands on step 1; removing Post, which a step names, is refused in words and changes nothing. The independent Python oracle (python3 -I, zero product imports) reads the
// stored steps and checks every instance (placement, definition) and base part against the original. The test also checks occurrence visibility,
// step highlighting, explode transforms and the saved camera in submitted WebGPU frames across three navigation paths.
// Root must freeze all sources first. Run from apps/cad-studio:
//   ASSEMBLY_STEPS_SOURCE_FROZEN=1 PW_DIR=/Users/user/.cache/barocss-playwright/node_modules/playwright \
//   CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node test/assembly-steps-browser.mjs /absolute/artifacts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installAssemblyRenderObserver } from './assembly-render-observer.mjs';
import { createFlow } from './flow-helper.mjs';

const oracleSource = String.raw`"""Three instruction steps over four occurrences, presentation only. Product imports: zero."""
import json, sys
d = json.load(sys.stdin); doc = d['doc']; original = d['original']; want = d['want']
steps = doc.get('assemblySteps') or []
assert [s['name'] for s in steps] == [w['name'] for w in want], [s['name'] for s in steps]
for s, w in zip(steps, want):
    assert s['add'] == w['add'], (s['name'], s['add'], w['add'])
    assert (s.get('explode') or 0) == w['explode'], (s['name'], s.get('explode'))
    if w['view']:
        v = s['view']; assert all(len(v[k]) == 3 and all(isinstance(x, (int, float)) for x in v[k]) for k in ('eye', 'target', 'up')), v
        assert v['eye'] != v['target'], v
    else: assert 'view' not in s, (s['name'], s.get('view'))
ids = [p for s in steps for p in s['add']]; assert len(ids) == len(set(ids)), ('a part in one step only', ids)
assert doc['instances'] == original['instances'], 'steps never move, re-define or re-order a part'
assert doc['nodes'] == original['nodes'] and doc.get('mates') == original.get('mates'), 'the base part and mates untouched'
print(json.dumps({'status': 'PASS', 'productImports': 0, 'steps': [[s['name'], s['add']] for s in steps]}))
`;
const fixture = join(import.meta.dirname, 'fixtures', 'assembly-steps.bcad');
const f = await createFlow({ name: 'assembly-steps', envFrozen: 'ASSEMBLY_STEPS_SOURCE_FROZEN', output: process.argv[2], qualification: 'ASSEMBLY_STEPS', oracleSource,
  limits: ['Submitted WebGPU mesh and camera state with screenshots. Top-level occurrences only.'],
  initialFiles: ['apps/cad-studio/test/assembly-steps-browser.mjs', 'apps/cad-studio/test/assembly-render-observer.mjs', 'apps/cad-studio/test/flow-helper.mjs', 'apps/cad-studio/test/fixtures/assembly-steps.bcad', 'apps/cad-studio/src/ui/AssemblyStepsPanel.tsx',
    'apps/cad-studio/src/app/assemblySteps.ts', 'packages/barocss-cad-model/src/assembly/steps.ts', 'packages/barocss-cad-model/src/assembly/explode.ts'],
  extraFrozen: ['packages/barocss-gpu/src/viewer/viewer.ts', 'packages/barocss-gpu/src/viewer/scene.ts'],
  requiredFrozen: ['packages/barocss-cad-model/src/assembly/steps.ts', 'apps/cad-studio/src/viewport/gpuRenderer.ts', 'apps/cad-studio/src/viewport/displayPolicy.ts'] });

const panel = () => f.page.getByRole('complementary', { name: 'Assembly steps panel', exact: true });
const button = name => panel().getByRole('button', { name, exact: true });
const pick = async name => { await f.page.locator('.ol.instance:not(.nested)').filter({ hasText: name }).first().click(); await f.page.getByRole('complementary', { name: 'Instance', exact: true }).waitFor(); };
const shown = async () => ({ position: (await panel().getByRole('status', { name: 'Step position', exact: true }).textContent()).trim(),
  parts: await panel().getByRole('group', { name: 'Parts of this step', exact: true }).locator('[data-part]').evaluateAll(n => n.map(x => x.getAttribute('data-part'))) });
const gizmos = () => f.page.locator('g.gizmo-arrow, g.gizmo-handle').count();
// (The button's text holds its icon name too: read the label without the icon.)
const explodeLabel = () => f.page.getByRole('button', { name: 'Explode', exact: true }).evaluate(b => [...b.childNodes].filter(n => !(n.nodeType === 1 && n.classList.contains('ms'))).map(n => n.textContent).join('').trim());
async function edit(act) { const before = await f.doc(); await act(); await f.changed(before); return f.doc(); }
const want = (explode, view) => [{ name: 'Blocks', add: ['b1', 'b2'], explode: 0, view: false }, { name: 'Post', add: ['post'], explode: 0, view }, { name: 'Cap', add: ['cap'], explode, view: false }];

const go = (n, name) => () => button(`Go to step ${n}: ${name}`).click();
const stepExplode = value => () => panel().getByLabel('Step explode', { exact: true }).selectOption(value);
const readFrame = () => window.__assemblyRenderObserver.read();

async function rendered(label, action) {
  f.phase = label;
  const previousFrame = (await f.page.evaluate(readFrame))?.frame ?? 0;
  await action();
  await f.ready();
  await f.page.waitForFunction(frame => window.__assemblyRenderObserver.read()?.frame > frame, previousFrame, { timeout: 10000 });
  return (await f.snapshot(label, () => ({ scene: window.__assemblyRenderObserver.read(),
    currentStepId: document.querySelector('[aria-label="Assembly steps panel"] [aria-current="step"]')?.dataset.step ?? null })));
}

function sceneOf({ renderer, instances, visibleIds, highlightedIds, selectedIds, camera }) {
  const materialState = ({ meshId: _meshId, ...state }) => state;
  return { renderer, visibleIds, highlightedIds, selectedIds, camera, instances: instances.filter(i => visibleIds.includes(i.id)).map(i => ({
    id: i.id, surfaces: i.surfaces.map(materialState), edges: i.edges.map(materialState),
  })) };
}

function closeVector(actual, expected, label) {
  assert.equal(actual.length, expected.length, label);
  assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) <= 1e-5), `${label}: observed ${actual}; expected ${expected}`);
}

function assertStepScene(scene, visible, highlighted, view) {
  assert.equal(scene.renderer, 'webgpu');
  assert.deepEqual(scene.visibleIds, visible);
  assert.deepEqual(scene.highlightedIds, highlighted);
  assert.deepEqual(scene.selectedIds, [], 'step highlighting is present with no selected occurrence');
  closeVector(scene.camera.position, view.eye, 'saved camera eye');
  closeVector(scene.camera.target, view.target, 'saved camera target');
}

// The fixture spans [0, 0, -4] to [100, 60, 33]. Explode ×1 moves each part by
// its own box centre minus the assembly box centre [50, 30, 14.5] mm.
const explodedOffsets = { b1: [-30, -10, -9.5], b2: [30, -10, -9.5], post: [0, -10, 0.5], cap: [0, -10, 17] };

function assertExplode(scene, flatScene) {
  for (const id of scene.visibleIds) {
    const instance = scene.instances.find(i => i.id === id);
    const flat = flatScene.instances.find(i => i.id === id);
    for (const kind of ['surfaces', 'edges']) {
      assert.equal(instance[kind].length, flat[kind].length, `${id} ${kind} count`);
      assert.ok(instance[kind].length > 0, `${id} has renderer ${kind}`);
      instance[kind].forEach((mesh, i) => {
        const expected = flat[kind][i].transform.map((value, axis) => axis >= 12 && axis <= 14 ? value + explodedOffsets[id][axis - 12] : value);
        closeVector(mesh.transform, expected, `${id} ${kind} exploded transform`);
      });
    }
  }
}

const history = async () => Promise.all(['Undo', 'Redo'].map(async name => {
  const control = f.page.getByRole('button', { name, exact: true });
  return { enabled: await control.isEnabled(), action: await control.getAttribute('data-tip') };
}));

async function replaySteps(flatScene, original) {
  f.phase = 'author distinct step cameras and explode';
  await f.command('Assembly steps'); await panel().waitFor();
  const views = f.page.getByRole('group', { name: 'Views', exact: true });
  for (const [index, name, preset] of [[1, 'Blocks', 'Front'], [2, 'Post', 'Iso'], [3, 'Cap', 'Right']]) {
    await go(index, name)();
    await views.getByRole('button', { name: preset, exact: true }).click();
    await edit(() => button('Capture view').click());
  }
  await go(2, 'Post')();
  const doc = await edit(stepExplode('1'));
  const [first, target, last] = doc.assemblySteps;
  assert.notDeepEqual(first.view.eye, target.view.eye);
  assert.notDeepEqual(last.view.eye, target.view.eye);
  await go(3, 'Cap')();
  const later = await edit(stepExplode('0.5'));
  await f.undo(); await f.same(doc);
  const before = await f.save('09-replay-before');
  const beforeHistory = await history();
  assert.deepEqual(beforeHistory.map(h => h.enabled), [true, true]);

  const { scene: initial, currentStepId: initialId } = await rendered('10-replay-start', go(1, 'Blocks'));
  assert.equal(initialId, first.id);
  assertStepScene(initial, ['b1', 'b2'], ['b1', 'b2'], first.view);
  const { scene: next, currentStepId: nextId } = await rendered('11-replay-sequential', () => button('Next step').click());
  assert.equal(nextId, target.id);
  assertStepScene(next, ['b1', 'b2', 'post'], ['post'], target.view);
  assertExplode(next, flatScene);

  const { scene: sequentialCap, currentStepId: sequentialCapId } = await rendered('11b-replay-sequential-cap', () => button('Next step').click());
  assert.equal(sequentialCapId, last.id);
  assertStepScene(sequentialCap, ['b1', 'b2', 'cap', 'post'], ['cap'], last.view);
  assertExplode(sequentialCap, flatScene);

  const { scene: repeatedStart, currentStepId: repeatedId } = await rendered('12-replay-start-again', go(1, 'Blocks'));
  assert.equal(repeatedId, first.id);
  assert.deepEqual(sceneOf(repeatedStart), sceneOf(initial), 'same initial renderer state before both routes');
  const { scene: directCap, currentStepId: directCapId } = await rendered('12b-replay-direct-cap', go(3, 'Cap'));
  assert.equal(directCapId, last.id);
  assert.deepEqual(sceneOf(directCap), sceneOf(sequentialCap), 'jumping over Post and visiting Post reach the same Cap scene');

  const { scene: postStart, currentStepId: postStartId } = await rendered('12c-replay-start-for-post', go(1, 'Blocks'));
  assert.equal(postStartId, first.id);
  assert.deepEqual(sceneOf(postStart), sceneOf(initial), 'same initial renderer state before the direct Post route');
  const { scene: direct, currentStepId: directId } = await rendered('13-replay-direct', go(2, 'Post'));
  assert.equal(directId, target.id);
  assert.deepEqual(sceneOf(direct), sceneOf(next), 'direct and sequential routes reach the same scene');

  const { scene: detour, currentStepId: detourId } = await rendered('14-replay-detour', go(3, 'Cap'));
  assert.equal(detourId, last.id);
  assertStepScene(detour, ['b1', 'b2', 'cap', 'post'], ['cap'], last.view);
  assertExplode(detour, flatScene);
  const { scene: returned, currentStepId: returnedId } = await rendered('15-replay-returned', () => button('Previous step').click());
  assert.equal(returnedId, target.id);
  assert.deepEqual(sceneOf(returned), sceneOf(next), 'return from a step with a different camera reaches the same scene');
  f.report.observations.push({ fixture, firstStepId: first.id, targetStepId: target.id, detourStepId: last.id,
    routes: ['11-replay-sequential', '13-replay-direct', '15-replay-returned'],
    capRoutes: ['11b-replay-sequential-cap', '12b-replay-direct-cap'], explodedOffsets, beforeHistory });

  const { scene: selected } = await rendered('16-replay-ordinary-selection', () => pick('Block 1'));
  assert.deepEqual(selected.selectedIds, ['b1']);
  assert.deepEqual(selected.highlightedIds, ['b1', 'post']);
  await f.same(doc);
  assert.deepEqual(await history(), beforeHistory, 'navigation preserves the available Undo and Redo');
  const after = await f.save('17-replay-after');
  assert.deepEqual(await readFile(after.file), await readFile(before.file), 'native Save bytes before and after navigation');
  const { assemblySteps, ...source } = after.doc;
  assert.deepEqual(source, original, 'step edits and navigation preserve the original model, including instances and mates');
  assert.deepEqual(assemblySteps, doc.assemblySteps);
  f.phase = 'replay preserves history';
  await f.redo(); await f.same(later);
  await f.undo(); await f.same(doc);
}

await f.run(async () => {
  for (const [width, height] of [[1024, 800], [1440, 900]]) {
    await f.newPage(); await f.page.setViewportSize({ width, height });
    await f.openFile(fixture, 2); const initial = await f.doc();
    await f.page.evaluate(() => document.activeElement?.blur());
    await f.command('Assembly steps');
    await pick('Block 1'); await edit(() => button('New step from selection').click());
    await pick('Post'); await edit(() => button('New step from selection').click());
    const before = await f.doc();
    await button('Previous step').click();
    assert.equal(await button('Collapse Steps').locator('[data-slot="badge"]').count(), 0);
    await button('Collapse Steps').click();
    assert.match(await button('Expand Steps').innerText(), /1\/2/);
    await button('Expand Steps').click();
    await button('Go to its step').click();
    assert.equal((await shown()).position, 'Step 2 of 2');
    await button('Previous step').click(); await pick('Cap');
    await panel().getByText('Cap is in no step. Hidden until the last step. Use Add selected to include it here.', { exact: true }).waitFor();
    assert.equal(await gizmos(), 0);
    const details = panel().getByRole('button', { name: /^Details: 1 notice$/ });
    await details.focus(); await f.page.keyboard.press('Enter');
    await panel().getByLabel('Show waiting parts faded').check();
    await panel().getByText('Cap is in no step. Shown faded until the last step. Use Add selected to include it here.', { exact: true }).waitFor();
    await panel().getByLabel('Show waiting parts faded').uncheck();
    await f.snapshot(`${width}-unassigned-hidden`);
    await button('Next step').click();
    await panel().getByText('Cap is in no step. Shown at this last step. Use Add selected to include it here.', { exact: true }).waitFor();
    assert.deepEqual(await f.doc(), before, 'navigation and fade do not edit document');
    await button('Previous step').click();
    const assigned = await edit(() => button('Add selected parts to this step').click());
    assert.ok(assigned.assemblySteps[0].add.includes('cap'));
    assert.deepEqual(assigned.instances, initial.instances); assert.deepEqual(assigned.nodes, initial.nodes); assert.deepEqual(assigned.mates, initial.mates);
    await f.undo(); await f.same(before); await f.redo(); await f.same(assigned);
    const saved = await f.save(`${width}-assigned`);
    await f.freshOpen(saved.file, saved.doc, `${width}-assigned-reopened`);
  }
  await f.newPage(); await f.openFile(fixture, 2); const original = await f.doc(); await f.snapshot('01-opened');

  assert.equal(await explodeLabel(), 'Explode', 'explode off before the steps');
  f.phase = 'build three steps'; await f.command('Assembly steps'); await panel().waitFor();
  await pick('Block 1'); await edit(() => button('New step from selection').click());
  const name = panel().getByLabel('Step name', { exact: true }); await name.fill('Blocks'); await edit(() => name.press('Enter'));
  await pick('Block 2'); await edit(() => button('Add selected parts to this step').click());
  assert.deepEqual(await shown(), { position: 'Step 1 of 1', parts: ['b1', 'b2'] });
  await pick('Post'); await edit(() => button('New step from selection').click());
  await name.fill('Post'); await edit(() => name.press('Enter'));
  await edit(() => button('Capture view').click());
  await pick('Cap'); await edit(() => button('New step from selection').click());
  await name.fill('Cap'); await edit(() => name.press('Enter'));
  const flat = await f.doc(); await f.runOracle({ doc: flat, original, want: want(0, true) }, '02-three-steps');
  const exploded = await edit(() => panel().getByLabel('Step explode', { exact: true }).selectOption('1'));
  await f.runOracle({ doc: exploded, original, want: want(1, true) }, '03-cap-exploded'); await f.ready(); await f.snapshot('03-step3-cap-exploded');

  f.phase = 'navigate'; const seen = {};
  await button('Previous step').click(); seen.prev2 = await shown(); await f.snapshot('04-step2');
  await button('Previous step').click(); seen.prev1 = await shown(); await f.snapshot('05-step1');
  // (Cap, still selected, waits at step 1: hidden, so no gizmo and no outline for it.)
  assert.equal(await gizmos(), 0, 'no gizmo for a hidden waiting part');
  await button('Next step').click(); seen.next2 = await shown();
  await button('Go to step 3: Cap').click(); seen.jump3 = await shown();
  // (Step 3 is exploded, and an exploded view shows no gizmo at all: only the explode label is checked here.)
  assert.equal(await explodeLabel(), 'Explode ×1', 'the step explode is shown');
  await button('Go to step 2: Post').click(); seen.jump2 = await shown();
  await pick('Cap'); assert.equal(await gizmos(), 0, 'Cap waits at step 2: no gizmo'); await pick('Post'); assert.ok(await gizmos() > 0, 'Post shown at step 2: its gizmo is there');
  f.report.observations.push({ seen });
  assert.deepEqual(seen.prev2, { position: 'Step 2 of 3', parts: ['post'] }); assert.deepEqual(seen.prev1, { position: 'Step 1 of 3', parts: ['b1', 'b2'] });
  assert.deepEqual(seen.next2, seen.prev2, 'Next and Prev reach the same step 2'); assert.deepEqual(seen.jump2, seen.prev2, 'a direct jump reaches the same step 2');
  assert.deepEqual(seen.jump3, { position: 'Step 3 of 3', parts: ['cap'] });
  await f.same(exploded); // (navigating is the session's: the document never changes)

  f.phase = 'go to its step'; await pick('Block 2'); await button('Go to its step').click();
  assert.deepEqual(await shown(), { position: 'Step 1 of 3', parts: ['b1', 'b2'] });

  f.phase = 'remove refused'; await pick('Post');
  await f.page.getByRole('complementary', { name: 'Instance', exact: true }).getByRole('button', { name: 'Remove', exact: true }).click();
  const notice = await f.waitToast(/step/i); f.report.observations.push({ removeRefused: notice }); await f.same(exploded); await f.dismissToasts();

  f.phase = 'undo, redo'; await f.undo(); await f.same(flat); await f.redo(); await f.same(exploded);
  f.phase = 'save, fresh open'; const saved = await f.save('assembly-steps'); assert.deepEqual(saved.doc, exploded);
  await f.freshOpen(saved.file, exploded, '06-fresh-open'); await f.runOracle({ doc: await f.doc(), original, want: want(1, true) }, '06-fresh-open');

  f.phase = 'close steps'; await f.command('Assembly steps'); await panel().waitFor(); await f.ready(); await f.snapshot('07-reopened');
  await installAssemblyRenderObserver(f.page);
  const { scene: flatScene } = await rendered('08-closed-all-parts', () => button('Close steps').click());
  await panel().waitFor({ state: 'hidden' });
  assert.deepEqual(flatScene.visibleIds, ['b1', 'b2', 'cap', 'post']);
  assert.deepEqual(flatScene.highlightedIds, []);
  assert.equal(await explodeLabel(), 'Explode', 'closing the steps puts the explode back'); await f.same(exploded);
  await replaySteps(flatScene, original);
});
