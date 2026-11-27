import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installAssemblyRenderObserver } from './assembly-render-observer.mjs';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const fixture = 'apps/cad-studio/test/fixtures/assembly-steps.bcad';
const pins = [fixture, 'apps/cad-studio/test/assembly-render-observer.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/scripts/cad-mcp.mjs', 'apps/cad-studio/server/cadDoc.ts', 'apps/cad-studio/src/app/assemblySteps.ts',
  'packages/barocss-cad-model/src/chat/assemblyStepPresentation.ts', 'packages/barocss-gpu/src/viewer/viewer.ts'];
const f = await createFlow({
  name: 'repeated-assembly-presentation', output: process.argv[2], envFrozen: 'REPEATED_ASSEMBLY_PRESENTATION_FROZEN',
  qualification: 'A static review distinguishes two same-definition occurrences and preserves native output.',
  limits: ['First-party synthetic assembly and reference, top-level occurrences and static Model workspace lighting.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, importStep } from '@barocss/cad';
import { splitBodies } from '../../packages/barocss-cad/src/part/part-model.ts';
import { brepBounds } from '../../packages/barocss-cad/src/brep/brep-bounds.ts';
import { lockPart } from '@barocss/cad-model/assembly/edit';
const value = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (value.step) {
  console.log(JSON.stringify(splitBodies(importStep(value.step)).map(brep => {
    assert.ok(checkBrep(brep, { strict: true }).valid && brep.shells.every(shell => shell.closed));
    return { bounds: brepBounds(brep), volume: brepMassProperties(brep, 1).volume };
  }).sort((a, b) => a.bounds.min[0] - b.bounds.min[0])));
} else {
  const result = lockPart(value, { part: 'post', to: 'base' });
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.doc.instances, value.instances);
  console.log(JSON.stringify(result.doc));
}
`,
});

// The reference is hand-authored for the fixture. These front outlines are independent of the Studio renderer.
const reference = '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="210" viewBox="-2 -36 104 42"><g fill="#dce0e6" stroke="#10141a" stroke-width=".3"><rect x="0" y="0" width="100" height="4"/><rect id="left" x="10" y="-10" width="20" height="10"/><rect id="right" x="70" y="-10" width="20" height="10"/><rect x="47" y="-30" width="6" height="30"/><rect x="15" y="-33" width="70" height="3"/></g></svg>';
const checklist = {
  source: 'First-party synthetic front outline of the repository assembly-steps fixture',
  reference_digest: sha256(reference),
  checks: [
    { id: 'left-position', occurrence: 'b1', observation: 'Block to the left of the post' },
    { id: 'right-position', occurrence: 'b2', observation: 'Matching block to the right of the post' },
    { id: 'plate-design-gauge', classification: 'native-only', expectation_mm: 5 },
    { id: 'hidden-fastener', classification: 'unknown', observation: 'The front outline does not establish internal fasteners' },
  ],
};
const evidence = { reference_digest: checklist.reference_digest, checklist_digest: sha256(JSON.stringify(checklist)) };
const btn = (name, within = f.page) => within.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Assembly steps panel', exact: true });
const stepBtn = name => btn(name, panel());
const members = () => panel().getByRole('group', { name: 'Parts of this step', exact: true });
const pick = (id, name = 'Shared block') => btn(`Select step part ${name} (${id})`, members());
const presentationArgs = (step_index, evidencePins = evidence) => ({ action: 'get', include_steps: true, step_index, step_presentation: evidencePins });
const presentation = async (call, index, pins) => (await call('assembly', presentationArgs(index, pins))).assembly_step_presentation;
const mcp = (file, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-repeated-static-assembly-test' }, file, label, run);
async function nativeCheck(call) {
  const { policy, ...report } = await call('requirements', { action: 'check' });
  assert.equal(policy.best.hard_fulfilled, false);
  return report;
}
const sceneRead = () => window.__assemblyRenderObserver.read();
const near = (now, expected) => assert.ok(now.length === expected.length && now.every((value, i) => Math.abs(value - expected[i]) < 1e-5), `${now} != ${expected}`);
const blockTops = [[20, 20, 10], [80, 20, 10]];

async function checkPickSamples(points, ids) {
  const actual = await f.page.evaluate(points => points.map(point => window.__studioInstanceAt(point)?.id ?? null), points);
  assert.deepEqual(actual, ids);
}

async function capture(label, shown, selected, manifest) {
  f.phase = label;
  await f.page.waitForFunction(({ shown, selected }) => {
    const scene = window.__assemblyRenderObserver.read();
    return scene && JSON.stringify(scene.visibleIds) === JSON.stringify(shown)
      && JSON.stringify(scene.selectedIds) === JSON.stringify(selected);
  }, { shown, selected });
  const { scene, lighting } = await f.snapshot(label, () => {
    const { environment, lights } = window.__studioViewer;
    return { scene: window.__assemblyRenderObserver.read(), lighting: { environment, lights } };
  });
  assert.deepEqual(scene.visibleIds, shown);
  assert.deepEqual(scene.selectedIds, selected);
  if (manifest?.camera) {
    near(scene.camera.position, manifest.camera.eye);
    near(scene.camera.target, manifest.camera.target);
  }
  return { image: label + '.png', sha256: sha256(await readFile(join(f.output, label + '.png'))),
    step: manifest?.step.id ?? null, presentation_revision: manifest?.revision ?? null, shown, selected, camera: scene.camera, lighting };
}

async function exportStep(label) {
  f.phase = label;
  if (await btn('Export STEP').isVisible()) await btn('Export STEP').click();
  else {
    await btn('More tools').click();
    await f.page.getByRole('menuitem', { name: 'Export STEP', exact: true }).click();
  }
  const view = f.page.getByRole('region', { name: 'STEP export', exact: true });
  const scope = view.getByLabel('STEP included bodies', { exact: true });
  await scope.getByText(/5 output bodies/).waitFor();
  const [download] = await Promise.all([f.page.waitForEvent('download'), btn('Export', view).click()]);
  const path = join(f.output, label + '.step');
  await download.saveAs(path);
  const text = await readFile(path, 'utf8');
  const data = text.match(/\nDATA;\n[\s\S]+\nENDSEC;/)?.[0];
  assert.ok(data, 'AP214 STEP DATA pins all geometry entities');
  return { data, solids: await f.inspect(label + '-read', { step: text }) };
}

await f.run(async () => {
  const source = JSON.parse(await readFile(join(f.repo, fixture), 'utf8'));
  for (const part of source.instances.slice(0, 2)) part.name = 'Shared block';
  const model = await f.inspect('lock-known-post', source);
  assert.deepEqual(model.instances, source.instances);
  assert.equal(model.mates[0].kind, 'lock');
  assert.deepEqual(model.instances[0].part, model.instances[1].part);
  assert.deepEqual(model.instances[0].doc, model.instances[1].doc);
  const view = { eye: [164, -201, 130], target: [50, 24, 8], up: [0, 0, 1] };
  const seed = { ...model, requirements: [
    { id: 'plate-design-gauge', hard: true, source: 'Synthetic negative control: a 5 mm base gauge',
      check: { op: '==', query: { fn: 'bbox', axis: 'z' }, unit: 'mm', value: 5 } },
    { id: 'hidden-fastener', hard: true, source: 'Synthetic unknown control: an internal bore',
      check: { op: '==', query: { fn: 'hole_diameter', face: 'unobserved-bore' }, unit: 'mm', value: 3 } },
  ], assemblySteps: [
    { id: 'left', name: 'Set left block', add: ['b1'], view },
    { id: 'right', name: 'Set right block', add: ['b2'], view },
    { id: 'close', name: 'Fit post and cover', add: ['post', 'cap'], view },
  ] };
  const file = async (label, doc) => {
    const path = join(f.output, label + '.bcad');
    await writeFile(path, JSON.stringify(doc));
    return path;
  };
  const input = await file('static-reference', seed);
  await writeFile(join(f.output, 'reference.svg'), reference);
  const read = await mcp(input, 'baseline', async call => ({
    left: await presentation(call, 0), right: await presentation(call, 1), check: await nativeCheck(call),
  }));
  assert.deepEqual(read.left.active, ['b1']);
  assert.deepEqual(read.right.active, ['b2']);
  assert.equal(read.check.summary.pass, 0);
  assert.equal(read.check.failures.find(row => row.req_id === 'plate-design-gauge').measured, 4);
  assert.ok(read.check.unknowns.some(row => row.req_id === 'hidden-fastener'));
  await f.freshOpen(input, seed, '01-open-source');
  await installAssemblyRenderObserver(f.page);
  await btn('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const shots = [await capture('02-assembled', ['b1', 'b2', 'cap', 'post'], [])];
  const before = await exportStep('baseline-native');

  await f.command('Assembly steps');
  await pick('b1').click();
  const left = await capture('03-select-left', ['b1'], ['b1'], read.left);
  shots.push(left);
  assert.equal(await pick('b2').count(), 0);
  await stepBtn('Next step').click();
  await pick('b2').click();
  assert.equal(await pick('b2').getAttribute('aria-pressed'), 'true');
  shots.push(await capture('04-select-right', ['b1', 'b2'], ['b2'], read.right));
  await checkPickSamples(blockTops, ['b1', 'b2']);
  await f.same(seed);
  const flat = await f.page.evaluate(sceneRead);
  await panel().getByLabel('Step explode', { exact: true }).selectOption('1');
  await f.changed(seed);
  const changed = await f.doc();
  assert.deepEqual(changed, { ...seed, assemblySteps: seed.assemblySteps.map((step, i) => i === 1 ? { ...step, explode: 1 } : step) });
  await f.page.waitForFunction(previous => {
    const scene = window.__assemblyRenderObserver.read();
    const x = scene?.instances.find(part => part.id === 'b2')?.surfaces[0].transform[12];
    return x !== undefined && Math.abs(x - previous) > 0.1;
  }, flat.instances.find(part => part.id === 'b2').surfaces[0].transform[12]);
  const saved = await f.save('static-exploded');
  const right = await mcp(saved.file, 'exploded', async call => {
    const report = await presentation(call, 1);
    assert.equal(report.explode_scale, 1);
    assert.equal(report.model_revision, read.right.model_revision);
    assert.deepEqual(await nativeCheck(call), read.check);
    return report;
  });
  shots.push(await capture('05-exploded-right', ['b1', 'b2'], ['b2'], right));
  const explodedTops = [[-10, 10, .5], [110, 10, .5]];
  await checkPickSamples(explodedTops, ['b1', 'b2']);
  const after = await exportStep('exploded-native');
  assert.equal(after.data, before.data);
  assert.deepEqual(after.solids, before.solids);
  const expected = [
    { bounds: { min: [0, 0, -4], max: [100, 60, 0] }, volume: 24000 },
    { bounds: { min: [10, 10, 0], max: [30, 30, 10] }, volume: 4000 },
    { bounds: { min: [15, 10, 30], max: [85, 30, 33] }, volume: 4200 },
    { bounds: { min: [47, 17, 0], max: [53, 23, 30] }, volume: 1080 },
    { bounds: { min: [70, 10, 0], max: [90, 30, 10] }, volume: 4000 },
  ];
  assert.equal(after.solids.length, expected.length);
  for (const [i, solid] of after.solids.entries()) {
    near(solid.bounds.min, expected[i].bounds.min);
    near(solid.bounds.max, expected[i].bounds.max);
    near([solid.volume], [expected[i].volume]);
  }

  await f.freshOpen(saved.file, saved.doc, '06-reopened');
  await installAssemblyRenderObserver(f.page);
  await f.command('Assembly steps');
  await stepBtn('Go to step 2: Set right block').click();
  shots.push(await capture('07-reopened-right', ['b1', 'b2'], [], right));
  await f.same(saved.doc);
  const expectedPin = { ...evidence, expected_revision: right.revision };
  async function stale(call, altered = expectedPin) {
    assert.equal((await call('assembly', presentationArgs(1, altered), true)).code, 'STEP_PRESENTATION_STALE');
  }
  const missing = structuredClone(changed);
  missing.instances = missing.instances.filter(part => part.id !== 'b2');
  const missingPath = await file('missing-right-occurrence', missing);
  const controls = {
    membership: d => { [d.assemblySteps[0].add, d.assemblySteps[1].add] = [d.assemblySteps[1].add, d.assemblySteps[0].add]; },
    camera: d => { d.assemblySteps[1].view = { ...view, eye: [174, -201, 130] }; },
    visibility: d => { d.instances[1].hidden = true; },
    geometry: d => { d.instances[1].position[0] += 3; },
  };
  for (const [label, alter] of Object.entries(controls)) {
    const d = structuredClone(changed);
    alter(d);
    await mcp(await file(label, d), label, call => stale(call));
  }
  await mcp(input, 'no-explode-control', call => stale(call));
  const unrelated = structuredClone(changed);
  unrelated.assemblySteps[2].note = 'New note for the last step';
  await mcp(await file('other-step', unrelated), 'other-step', async call => {
    assert.deepEqual(await presentation(call, 1, expectedPin), right);
    await stale(call, { ...expectedPin, reference_digest: sha256('new reference') });
    await stale(call, { ...expectedPin, checklist_digest: sha256('new checklist') });
  });
  const held = await mcp(missingPath, 'held-right', async call => {
    await stale(call);
    const current = await presentation(call, 1);
    assert.deepEqual(current.unresolved, ['b2']);
    assert.deepEqual(current.active, []);
    assert.deepEqual(current.visibility.shown, ['b1']);
    return current;
  });
  await f.freshOpen(missingPath, missing, '08-missing-open');
  await installAssemblyRenderObserver(f.page);
  await f.command('Assembly steps');
  await stepBtn('Next step').click();
  const missingRow = members().locator('[data-part="b2"]');
  assert.match(await missingRow.innerText(), /missing/);
  assert.equal(await pick('b2', 'b2').isDisabled(), true);
  shots.push(await capture('09-held-reference', ['b1'], [], held));
  await checkPickSamples([explodedTops[1]], [null]);
  const failedReview = {
    left_position: 'pass', right_position: 'unknown',
    reason: 'The targeted right occurrence is absent. The matching left occurrence supplies no evidence for it.',
  };
  await f.same(missing);
  const savedMissing = await f.save('saved-held-reference');
  await mcp(savedMissing.file, 'held-after-save', async call => assert.deepEqual(await presentation(call, 1), held));
  const review = { checklist, evidence, model_revision: right.model_revision, shots, static_checks: {
    left_position: 'pass', right_position: 'pass', held_revision: failedReview, native: read.check,
  }, native_step: { bytes: Buffer.byteLength(after.data), data_sha256: sha256(after.data), solids: after.solids } };
  await writeFile(join(f.output, 'review-manifest.json'), JSON.stringify(review, null, 2));
  f.report.observations.push(review);
});
