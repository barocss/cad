import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    {
      id: 'n0', kind: 'sketch', profile: 'polygon',
      points: [[0, 0], [40, 0], [40, 20], [0, 20]],
      outline: {
        points: [[0, 0], [40, 0], [40, 20], [0, 20]],
        hv: { h: [0, 2], v: [1, 3] },
        rules: [
          { kind: 'fix', point: 1, at: [40, 0] },
          { kind: 'fix', point: 2, at: [40, 20] },
        ],
      },
      sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] },
    },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};

const pins = [
  'apps/cad-studio/test/fixed-edge-length-conflict-browser.mjs',
  'apps/cad-studio/src/sketch/constraintList.ts',
  'apps/cad-studio/src/viewport/studioSketchViewportActions.ts',
];
const f = await createFlow({
  name: 'fixed-edge-length-conflict', output: process.argv[2], envFrozen: 'D1994_SOURCE_FROZEN',
  qualification: 'Straight edge length conflict between two explicit fixed endpoints identifies both Fix constraints in Sketch panel and recovers cleanly.',
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1) }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const sketchPanel = () => f.page.getByRole('complementary', { name: 'Sketch', exact: true });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);

async function native(label, doc, expectedVolume) {
  const { check, mass } = await f.inspect(label, doc);
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, 0);
  near(mass.volume, expectedVolume);
  f.report.observations.push({ label, volume: mass.volume, expectedVolume });
}

await f.run(async () => {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'fixed-edge-length-conflict.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  await native('initial', seed, 8000);

  f.phase = 'reopen sketch n0 via Extrude History and trigger Edge 2 = 25 mm conflict in Sketch panel';
  await f.openFeatureEditor(1, 'Extrude');
  await button('Edit sketch', f.editor()).click();
  await sketchPanel().waitFor();

  const edge2 = sketchPanel().getByLabel('Edge 2 length', { exact: true });
  await edge2.fill('25');
  const alert = sketchPanel().locator('[role="alert"]');
  await alert.waitFor();
  const find2 = button('Find fixed point 2', sketchPanel());
  const find3 = button('Find fixed point 3', sketchPanel());

  if (baseline) {
    assert.equal(await find2.count(), 0, 'Previous Studio offers no Find fixed point 2 button for Edge 2 length conflict');
    assert.equal(await find3.count(), 0, 'Previous Studio offers no Find fixed point 3 button for Edge 2 length conflict');
    await f.snapshot('00-previous-no-fixed-point-targets');
    return;
  }

  f.phase = 'verify named fixed-point conflict message and both Find fixed point recovery buttons';
  const alertText = await alert.textContent();
  assert.match(alertText ?? '', /Length of edge 2 = 25 mm conflicts with the 20 mm distance set by fixed points 2 and 3\./);
  await find2.waitFor();
  await find3.waitFor();
  await f.same(seed);
  await f.snapshot('01-panel-fixed-edge-conflict');

  f.phase = 'locate Fixed point 3 via conflict button, remove it, and apply Edge 2 = 25 mm';
  await find3.click();
  const focusedRow = sketchPanel().locator('[data-constraint-id="rule:1"]');
  await f.page.waitForFunction(() => document.activeElement?.getAttribute('data-constraint-id') === 'rule:1');
  await f.snapshot('02-focused-fixed-point-3');
  await focusedRow.locator('button.x').click();
  await f.page.waitForFunction(() => !document.querySelector('[data-constraint-id="rule:1"]'));

  await edge2.fill('25');
  await f.page.waitForFunction(() => {
    const input = document.querySelector('.sk-panel input[aria-label="Edge 2 length"]');
    return input && Number(input.value) === 25;
  });
  await f.snapshot('03-edge-2-applied-25');

  f.phase = 'Finish sketch and verify updated 40 x 25 x 10 mm native solid, Undo/Redo, Save and fresh Open';
  await f.page.locator('.topbar button.finish').click();
  await sketchPanel().waitFor({ state: 'hidden' });
  await f.changed(seed);
  await f.ready();
  const applied = (await f.snapshot('04-extrude-10000')).doc;
  assert.deepEqual(applied.nodes[0].points, [[0, 0], [40, 0], [40, 25], [0, 25]]);
  assert.equal(applied.nodes[0].outline.lengths[1], 25);
  assert.equal(applied.nodes[0].outline.rules.length, 1);
  assert.deepEqual(applied.nodes[0].outline.rules[0], { kind: 'fix', point: 1, at: [40, 0] });
  await native('applied-25', applied, 10000);

  await f.undo();
  await f.same(seed);
  await native('undo-8000', await f.doc(), 8000);
  await f.redo();
  await f.same(applied);
  await native('redo-10000', await f.doc(), 10000);

  const saved = await f.save('fixed-edge-length-recovered');
  const reopened = await f.freshOpen(saved.file, applied, '05-fresh-open');
  await native('fresh-open-10000', reopened.doc, 10000);
});
