import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/fixed-edge-pair-conflict-browser.mjs',
  'apps/cad-studio/src/ui/ConstraintTools.tsx',
  'apps/cad-studio/src/ui/ConstraintList.tsx',
  'apps/cad-studio/src/sketch/constraintList.ts',
];
const f = await createFlow({
  name: 'fixed-edge-pair-conflict', output: process.argv[2], envFrozen: 'FIXED_EDGE_PAIR_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'A refused Parallel or Perpendicular constraint identifies its fixed endpoints and can be applied after releasing one target point.',
});

const button = (name, scope = f.sketchPanel()) => scope.getByRole('button', { name, exact: true });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} vs ${expected}`);
const points = [[0, 0], [40, 0], [46, 20], [10, 20], [10, 34], [0, 34]];
const targetHit = [43, 10];

async function selectPair(referenceHit, edge) {
  await f.worldClick(targetHit);
  await f.page.keyboard.down('Shift');
  try { await f.worldClick(referenceHit); } finally { await f.page.keyboard.up('Shift'); }
  await f.sketchPanel().getByText(`edge 2, edge ${edge + 1}`, { exact: true }).waitFor();
}

await f.run(async () => {
  for (const [direction, edge, referenceHit] of [['Parallel', 3, [10, 27]], ['Perpendicular', 4, [5, 34]]]) {
    const kind = direction.toLowerCase();
    const fixed = [1, 2, edge, edge + 1];
    const rules = fixed.map(point => ({ kind: 'fix', point, at: points[point] }));
    const seed = {
      format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
      nodes: [
        { id: 'n0', kind: 'sketch', profile: 'polygon', points, outline: { points, hv: { h: [2], v: [] }, rules },
          sideTags: { outer: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'] } },
        { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
      ],
      outputs: { b1: { node: 1, side: 'solid' } },
    };
    f.phase = `Open and refuse ${direction} between the fixed edges`;
    await f.newPage();
    await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
      name: `${kind}-fixed-edges.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
    });
    await f.same(seed);
    near((await f.bodies()).bodies[0].volume, 10000);
    await f.openFeatureEditor(1, 'Extrude');
    await button('Edit sketch', f.editor()).click();
    await f.sketchPanel().waitFor();
    await f.tool('Select', 's');
    await f.frame([targetHit, referenceHit]);
    await selectPair(referenceHit, edge);
    await button(direction).click();
    const alert = f.sketchPanel().getByRole('alert');
    await alert.waitFor();
    const find = fixed.map(point => button(`Find fixed point ${point + 1}`));
    await f.same(seed);
    if (baseline) {
      assert.match(await alert.textContent(), /Bounded local solve did not meet fixed residual tolerances/);
      for (const locator of find) assert.equal(await locator.count(), 0);
      await f.snapshot(`${kind}-baseline-refusal`);
      continue;
    }

    f.phase = `Find and release the target Fix, then apply ${direction}`;
    assert.match(await alert.textContent(), new RegExp(`Edges 2 and ${edge + 1} cannot be ${kind}`));
    for (const locator of find) await locator.waitFor();
    await f.snapshot(`${kind}-fixed-points-named`);
    await find[1].click();
    await f.page.waitForFunction(() => document.activeElement?.getAttribute('data-constraint-id') === 'rule:1');
    await f.snapshot(`${kind}-fixed-point-focused`);
    await f.sketchPanel().locator('[data-constraint-id="rule:1"] button.x').click();
    await find[1].waitFor({ state: 'hidden' });
    await f.sketchPanel().getByLabel('Constraint kind', { exact: true }).selectOption('');
    await selectPair(referenceHit, edge);
    await button(direction).click();
    await button(new RegExp('Remove ' + direction)).waitFor();
    await f.snapshot(`${kind}-applied`);
    await f.page.locator('.topbar button.finish').click();
    await f.sketchPanel().waitFor({ state: 'hidden' });
    await f.changed(seed);
    const accepted = await f.doc(), outline = accepted.nodes[0].outline;
    assert.deepEqual(outline.rules, [rules[0], rules[2], rules[3], { kind, a: 1, b: edge }]);
    near(outline.points[2][0], 40);
    const height = outline.points[2][1];
    if (kind === 'parallel') near(height, 20);
    assert.ok(height > 0 && height < 34, 'The free shoulder remains inside the outline');
    near(outline.points[3][1], height);
    near(outline.points[3][0], 10);
    assert.deepEqual(outline.points.slice(4), points.slice(4));
    const volume = (40 * height + 10 * (34 - height)) * 10;
    near((await f.bodies()).bodies[0].volume, volume);
    f.report.observations.push({ kind, height, volume });
    await f.undo();
    await f.same(seed);
    await f.redo();
    await f.same(accepted);
    const saved = await f.save(`${kind}-recovery`);
    await f.freshOpen(saved.file, accepted, `${kind}-reopened`);
    near((await f.bodies()).bodies[0].volume, volume);
  }
});
