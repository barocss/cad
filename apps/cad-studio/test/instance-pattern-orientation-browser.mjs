import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const f = await createFlow({
  name: 'instance-pattern-orientation',
  envFrozen: 'PATTERN_ORIENTATION_FROZEN',
  output: process.argv[2],
  qualification: 'Circular instance orientation on one asymmetric native box in desktop Studio.',
  initialFiles: [
    'apps/cad-studio/test/instance-pattern-orientation-browser.mjs',
    'apps/cad-studio/test/fixtures/instance-pattern.bcad',
    'apps/cad-studio/src/ui/InstancePattern.tsx',
    'packages/barocss-cad-model/src/assembly/patterns.ts',
    'packages/barocss-cad-model/src/assembly/patternCheck.ts',
  ],
  limits: ['Cardinal Z axis, 90 degree spacing; posed viewport bounds, BOM, and native project Save/Open. No pending-state races, drawing or exchange export in this flow.'],
});
const panel = () => f.page.getByRole('complementary', { name: 'Instance', exact: true });
const form = () => panel().getByRole('group', { name: 'Instance pattern', exact: true });
const button = name => form().getByRole('button', { name, exact: true });
const orientation = () => form().getByLabel('Pattern orientation', { exact: true });
const pick = async id => {
  await f.page.locator(`[data-browser-instance-path="${id}"]`).click();
  await panel().waitFor();
};
const positions = [[20, 5, 0], [10, 15, 0], [0, 5, 0], [10, -5, 0]];
const axisOffsets = [[0, 0, 10, 4], [-4, 0, 0, 10], [-10, -4, 0, 0], [0, -10, 4, 0]];
const axisMarkers = [[10, 0], [0, 10], [-10, 0], [0, -10]];
async function check(label, turns, kept, indices = [0, 1, 2, 3]) {
  const doc = await f.doc();
  const pattern = doc.instancePatterns[0];
  assert.equal(pattern.kind, kept ? 'circular-fixed' : 'circular');
  assert.deepEqual(pattern.origin, [10, 5, 0]);
  assert.deepEqual(pattern.axis, [0, 0, 1]);
  assert.equal(pattern.angle, 90);
  const ids = indices.map(k => k === 0 ? 'cube' : `${pattern.id}-${k}`);
  assert.deepEqual(doc.instances.map(i => i.id), ids);
  const expected = indices.map((k, index) => {
    const [x, y, z] = positions[k];
    const turn = kept ? turns : (turns + k) % 4;
    const [left, bottom, right, top] = axisOffsets[turn];
    return { id: ids[index], min: [x + left, y + bottom, z], max: [x + right, y + top, z + 2] };
  });
  const markers = doc.instances.map((i, index) => {
    const k = indices[index];
    const [turnX, turnY, turnZ] = i.rotation;
    assert.equal(turnX, 0);
    assert.equal(turnY, 0);
    assert.equal((Math.round(turnZ / 90) + 4) % 4, kept ? turns : (turns + k) % 4);
    assert.deepEqual(i.position, positions[k]);
    assert.deepEqual(i.part, doc.instances[0].part);
    assert.deepEqual(i.doc, doc.instances[0].doc);
    const [dx, dy] = axisMarkers[(Math.round(turnZ / 90) + 4) % 4];
    return [i.position[0] + dx, i.position[1] + dy, i.position[2]];
  });
  await f.page.waitForFunction(expected => {
    const bounds = window.__studioInstanceBounds?.();
    return bounds?.length === expected.length && expected.every(e => {
      const actual = bounds.find(b => b.id === e.id);
      return ['min', 'max'].every(key => e[key].every((v, i) => Math.abs(v - actual?.[key]?.[i]) < 1e-6));
    });
  }, expected);
  f.report.observations.push({ label, kept, expected, markers });
  return doc;
}

await f.run(async () => {
  const fixture = JSON.parse(await readFile(join(import.meta.dirname, 'fixtures/instance-pattern.bcad')));
  const [seed] = fixture.instances;
  seed.name = 'Bracket';
  seed.position = positions[0];
  seed.rotation = [0, 0, 90];
  seed.doc.nodes[0].max = [10, 4];
  seed.doc.nodes[1].height = 2;
  const file = join(f.output, 'bracket-fixture.bcad');
  await writeFile(file, JSON.stringify(fixture));
  await f.newPage();
  await f.openFile(file, 2);
  await pick('cube');
  const before = await f.doc();
  await panel().getByRole('button', { name: 'Pattern…', exact: true }).click();
  await form().getByLabel('Pattern kind').selectOption('circular');
  await form().getByLabel('Pattern count').fill('4');
  await form().getByLabel('Pattern angle').fill('90');
  await form().getByLabel('Pattern axis').selectOption('Z');
  await form().getByLabel('Pattern origin X').fill('10');
  await form().getByLabel('Pattern origin Y').fill('5');
  assert.equal(await orientation().count(), baseline ? 0 : 1);
  if (!baseline) {
    assert.equal(await orientation().inputValue(), 'rotate');
    await button('Cancel').click();
    await f.same(before);
    await panel().getByRole('button', { name: 'Pattern…', exact: true }).click();
  }
  await button('Make pattern').click();
  await f.changed(before);
  const rotating = await check('rotate', 1, false);
  await f.snapshot('01-rotate-with-pattern');
  await f.save('rotating');
  if (baseline) return;

  await orientation().selectOption('keep');
  await button('Apply').click();
  await f.changed(rotating);
  const kept = await check('keep', 1, true);
  assert.deepEqual(kept.instances.map(({ rotation: _rotation, ...instance }) => instance), rotating.instances.map(({ rotation: _rotation, ...instance }) => instance));
  await f.snapshot('02-keep-seed-orientation');
  await f.undo();
  await f.same(rotating);
  assert.equal(await orientation().inputValue(), 'rotate');
  await f.redo();
  await f.same(kept);
  assert.equal(await orientation().inputValue(), 'keep');

  await pick('pat1-2');
  await panel().getByRole('button', { name: 'Skip', exact: true }).click();
  await f.changed(kept);
  const skipped = await check('skip', 1, true, [0, 1, 3]);
  assert.deepEqual(skipped.instancePatterns[0].skip, [2]);
  await pick('cube');
  await f.snapshot('03-skip-preserves-mode');
  const saved = await f.save('fixed');
  await f.freshOpen(saved.file, saved.doc, '04-fresh-open');
  await pick('cube');
  assert.equal(await orientation().inputValue(), 'keep');
  await check('reopened', 1, true, [0, 1, 3]);
  await clickModelCommand(f.page, 'Inspect', 'BOM');
  const bomPanel = f.page.getByRole('complementary', { name: 'BOM panel' });
  const rows = bomPanel.getByRole('row', { name: /^BOM line/ }).filter({ hasText: 'Bracket' });
  await rows.first().waitFor();
  assert.equal(await rows.count(), 1);
  const cells = await rows.getByRole('cell').allTextContents();
  assert.equal(Number(cells[2].trim()), 3);
  f.report.observations.push({ label: 'BOM after Open', rows: 1, quantity: 3 });
  await f.snapshot('07-bom-after-open');
  await bomPanel.getByRole('button', { name: 'Close BOM', exact: true }).click();
  await button('Restore occurrence 3').click();
  await f.changed(skipped);
  const restored = await check('restored', 1, true);
  const seedZ = panel().getByLabel('Instance Z', { exact: true }).last();
  await seedZ.fill('0');
  await seedZ.press('Enter');
  await f.changed(restored);
  const seedTurned = await check('seed changed', 0, true);
  await f.snapshot('05-seed-rotation-follows');

  await form().getByLabel('Pattern count').fill('3');
  await orientation().selectOption('rotate');
  await button('Apply').click();
  await f.changed(seedTurned);
  await check('rotate again with count 3', 0, false, [0, 1, 2]);
  await f.snapshot('06-rotate-again');
});
