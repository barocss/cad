import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { installAssemblyRenderObserver } from './assembly-render-observer.mjs';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = [
  'apps/cad-studio/test/assembly-render-observer.mjs',
  'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/scripts/cad-mcp.mjs',
  'apps/cad-studio/server/cadDoc.ts',
  'apps/cad-studio/src/app/assemblySteps.ts',
  'apps/cad-studio/src/ui/AssemblyStepsPanel.tsx',
  'packages/barocss-gpu/src/viewer/viewer.ts',
  'packages/barocss-cad-model/src/assembly/steps.ts',
  'packages/barocss-cad-model/src/chat/assembly.ts',
  'packages/barocss-cad-model/src/chat/assemblyStepPresentation.ts',
  'packages/barocss-cad-model/src/chat/contract.ts',
  'packages/barocss-cad-model/src/chat/groups.ts',
];
const f = await createFlow({
  name: 'photo-assembly-presentation',
  output: process.argv[2],
  envFrozen: 'PHOTO_ASSEMBLY_PRESENTATION_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Match local MCP presentation readback with submitted Studio frames for the accepted four-part draft.',
  limits: ['Synthetic reference and saved static top-level steps. No pixel classification, engineering approval or animation.'],
});
const panel = () => f.page.getByRole('complementary', { name: 'Assembly steps panel', exact: true });
const button = name => panel().getByRole('button', { name, exact: true });
const explode = () => panel().getByLabel('Step explode', { exact: true });
const currentFrame = () => window.__assemblyRenderObserver.read();
const camera = { eye: [340, -427, -77], target: [0, 0, -85], up: [0, 0, 1] };
const near = (actual, expected) => {
  assert.equal(actual.length, expected.length);
  assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) < 1e-5), `${actual} != ${expected}`);
};

async function sceneAfter(action, shown, highlighted) {
  const previous = (await f.page.evaluate(currentFrame))?.frame ?? 0;
  await action();
  await f.page.waitForFunction(({ previous, shown, highlighted }) => {
    const scene = window.__assemblyRenderObserver.read();
    return scene?.frame > previous && JSON.stringify(scene.visibleIds) === JSON.stringify(shown)
      && JSON.stringify(scene.highlightedIds) === JSON.stringify(highlighted);
  }, { previous, shown, highlighted });
  return f.page.evaluate(currentFrame);
}

await f.run(async () => {
  const sourceFile = process.argv[3], source = JSON.parse(await readFile(sourceFile, 'utf8'));
  assert.deepEqual(source.instances.map(({ id, name }) => [id, name]),
    [['p1', 'Ring head'], ['p2', 'Handle'], ['p3', 'Filter cap'], ['p4', 'Button']]);
  const accepted = source.proposals.find(proposal => proposal.status === 'accepted');
  const referenceDigest = accepted?.plan.match(/Trace ([a-f0-9]{64})\./)?.[1];
  assert.equal(referenceDigest, '737a65a47af9084d818d1a74d38769c288589c3ae69bb442a32356435d90bcf6');
  const checklist = { id: 'handle-and-cap-layout-v1', referenceDigest, step: 'step2', features: [
    { part: 'p2', feature: 'Handle below the ring', class: 'visible outline' },
    { part: 'p3', feature: 'Filter cap below the handle', class: 'visible outline' },
    { part: 'p3', feature: 'Thread fit and construction', class: 'unknown' },
  ] };
  const evidence = { reference_digest: referenceDigest, checklist_digest: sha256(JSON.stringify(checklist)) };
  const input = { action: 'get', include_steps: true, step_index: 1 };
  const mcp = (path, label, run) => withMcpSession({ app: f.app, output: f.output, clientName: 'barocss-saved-assembly-review-test' }, path, label, run);
  const read = (call, pins = evidence) => call('assembly', { ...input, step_presentation: pins });
  await f.freshOpen(sourceFile, source, '01-source-open');
  await installAssemblyRenderObserver(f.page);
  await f.page.locator('.views').getByRole('button', { name: 'Right', exact: true }).click();
  await sceneAfter(() => f.page.getByTitle('Frame all (F)', { exact: true }).click(), ['p1', 'p2', 'p3', 'p4'], []);
  await f.snapshot('01-assembled', () => ({ scene: window.__assemblyRenderObserver.read() }));
  const seed = { ...source, assemblySteps: [
    { id: 'step1', name: 'Ring opening', add: ['p1'] },
    { id: 'step2', name: 'Handle and filter cap', add: ['p2', 'p3'], view: camera },
    { id: 'step3', name: 'Button on the right', add: ['p4'] },
  ] };
  const seedFile = join(f.output, 'steps.bcad');
  await writeFile(seedFile, JSON.stringify(seed));
  const flat = await mcp(seedFile, 'flat', async call => {
    const legacy = await call('assembly', input);
    assert.equal('assembly_step_presentation' in legacy, false);
    const { assembly_step_presentation: manifest, ...rest } = await read(call);
    assert.deepEqual(rest, legacy);
    assert.deepEqual(manifest.evidence, evidence);
    assert.deepEqual(manifest.step, { index: 1, id: 'step2', name: 'Handle and filter cap' });
    assert.deepEqual(manifest.visibility.shown, ['p1', 'p2', 'p3']);
    assert.deepEqual(manifest.active, ['p2', 'p3']);
    assert.deepEqual(manifest.waiting, ['p4']);
    assert.deepEqual(manifest.unresolved, []);
    assert.deepEqual(manifest.camera, camera);
    assert.equal(manifest.explode_scale, 0);
    assert.deepEqual(legacy.instances.map(part => [part.id, part.name]), source.instances.map(part => [part.id, part.name]));
    return manifest;
  });

  await f.freshOpen(seedFile, seed, '02-steps-open');
  await installAssemblyRenderObserver(f.page);
  await f.command('Assembly steps');
  const flatScene = await sceneAfter(() => button('Next step').click(), flat.visibility.shown, flat.active);
  near(flatScene.camera.position, flat.camera.eye);
  near(flatScene.camera.target, flat.camera.target);
  assert.deepEqual(flatScene.selectedIds, []);
  assert.equal(Number(await explode().inputValue()), flat.explode_scale);
  await f.same(seed);
  await f.snapshot('03-step2-focus', () => ({ scene: window.__assemblyRenderObserver.read() }));

  f.phase = 'author saved explode with native state preserved';
  const scale = panel().getByLabel('Step explode scale', { exact: true });
  const explodedScene = await sceneAfter(async () => {
    await scale.fill('0.65');
    await scale.press('Enter');
    await f.changed(seed);
    await f.page.waitForFunction(() => window.__studioDoc.assemblySteps[1].explode === .65);
  }, flat.visibility.shown, flat.active);
  const edited = await f.doc();
  assert.deepEqual(edited.instances, source.instances);
  assert.deepEqual(edited.nodes, source.nodes);
  assert.deepEqual(edited.mates, source.mates);
  assert.deepEqual(edited.proposals, source.proposals);
  near(explodedScene.camera.position, flat.camera.eye);
  const offsets = Object.fromEntries(flat.visibility.shown.map(id => {
    const before = flatScene.instances.find(part => part.id === id).surfaces[0].transform;
    const after = explodedScene.instances.find(part => part.id === id).surfaces[0].transform;
    const offset = after.slice(12, 15).map((v, i) => v - before[12 + i]);
    assert.ok(Math.hypot(...offset) > 0.1, id);
    return [id, offset];
  }));
  await f.snapshot('04-step2-exploded', () => ({ scene: window.__assemblyRenderObserver.read() }));
  await f.undo();
  await f.same(seed);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('saved-static-assembly');
  const manifest = await mcp(saved.file, 'exploded', async call => {
    const { assembly_step_presentation: current } = await read(call);
    assert.equal(current.model_revision, flat.model_revision);
    assert.notEqual(current.revision, flat.revision);
    assert.equal(current.explode_scale, .65);
    assert.deepEqual(current.camera, flat.camera);
    assert.deepEqual(current.evidence, flat.evidence);
    for (const pins of [{ ...evidence, expected_revision: flat.revision },
      { ...evidence, checklist_digest: sha256('changed checklist'), expected_revision: current.revision }]) {
      const refused = await call('assembly', { ...input, step_presentation: pins }, true);
      assert.equal(refused.code, 'STEP_PRESENTATION_STALE');
      assert.equal('assembly_step_presentation' in refused, false);
    }
    assert.deepEqual((await read(call, { ...evidence, expected_revision: current.revision })).assembly_step_presentation, current);
    return current;
  });

  await f.freshOpen(saved.file, saved.doc, '05-fresh-open');
  await installAssemblyRenderObserver(f.page);
  await f.command('Assembly steps');
  const reopened = await sceneAfter(() => button('Next step').click(), manifest.visibility.shown, manifest.active);
  near(reopened.camera.position, manifest.camera.eye);
  near(reopened.camera.target, manifest.camera.target);
  assert.equal(Number(await explode().inputValue()), manifest.explode_scale);
  for (const id of manifest.visibility.shown) {
    const transform = scene => scene.instances.find(part => part.id === id).surfaces[0].transform;
    near(transform(reopened), transform(explodedScene));
  }
  await f.snapshot('06-reopened-exploded', () => ({ scene: window.__assemblyRenderObserver.read() }));
  await f.same(saved.doc);
  const nativeAgain = await f.save('reopened-static-assembly');
  assert.deepEqual(nativeAgain.doc, saved.doc);
  await mcp(nativeAgain.file, 'reopened', async call => {
    assert.deepEqual((await read(call)).assembly_step_presentation, manifest);
  });
  const review = { checklist, manifest, flat, offsets, screenshots: ['01-assembled.png', '03-step2-focus.png', '04-step2-exploded.png', '06-reopened-exploded.png'] };
  await writeFile(join(f.output, 'static-review.json'), JSON.stringify(review, null, 2));
  f.report.observations.push(review);
});
