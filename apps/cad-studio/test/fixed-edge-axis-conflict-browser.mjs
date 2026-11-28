import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/fixed-edge-axis-conflict-browser.mjs',
  'apps/cad-studio/src/ui/ConstraintTools.tsx',
  'apps/cad-studio/src/ui/ConstraintList.tsx',
  'apps/cad-studio/src/sketch/constraintList.ts',
];
const f = await createFlow({
  name: 'fixed-edge-axis-conflict', output: process.argv[2], envFrozen: 'FIXED_EDGE_AXIS_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'A refused straight-edge axis constraint locates the two explicit Fix rows and preserves the sketch.',
});

const button = (name, scope = f.sketchPanel()) => scope.getByRole('button', { name, exact: true });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} vs ${expected}`);
const sourcePoints = [[0, 0], [40, 0], [46, 20], [0, 20]];
const select = (direction, [x, y]) => direction === 'Vertical' ? [x, y] : [0 - y, x];

await f.run(async () => {
  for (const direction of ['Vertical', 'Horizontal']) {
    const vertical = direction === 'Vertical', label = direction.toLowerCase();
    const points = sourcePoints.map(point => select(direction, point));
    const hv = vertical ? { h: [0, 2], v: [3] } : { h: [3], v: [0, 2] };
    const rules = [{ kind: 'fix', point: 1, at: points[1] }, { kind: 'fix', point: 2, at: points[2] }];
    const seed = {
      format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
      nodes: [
        { id: 'n0', kind: 'sketch', profile: 'polygon', points, outline: { points, hv, rules },
          sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } },
        { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
      ],
      outputs: { b1: { node: 1, side: 'solid' } },
    };
    f.phase = `Open the tilted fixed edge and request ${direction}`;
    await f.newPage();
    await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
      name: `${label}-fixed-edge.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
    });
    await f.same(seed);
    near((await f.bodies()).bodies[0].volume, 8600);
    await f.openFeatureEditor(1, 'Extrude');
    await button('Edit sketch', f.editor()).click();
    await f.sketchPanel().waitFor();
    await f.tool('Select', 's');
    const hit = select(direction, [43, 10]);
    await f.frame([hit]);
    await f.worldClick(hit);
    await f.sketchPanel().getByText('edge 2', { exact: true }).waitFor();
    await button(direction).click();
    const error = f.sketchPanel().getByRole('alert');
    await error.waitFor();
    const find2 = button('Find fixed point 2'), find3 = button('Find fixed point 3');
    await f.same(seed);
    if (baseline) {
      assert.match(await error.textContent(), /conflict|cannot|would|impossible/i);
      assert.equal(await find2.count(), 0);
      assert.equal(await find3.count(), 0);
      await f.snapshot(`${label}-baseline-refusal`);
      continue;
    }

    f.phase = `Locate the blocking Fix and retry ${direction}`;
    assert.match(await error.textContent(), new RegExp(`Edge 2 cannot be ${label}.*fixed points 2 and 3.*6 mm`));
    await find2.waitFor();
    await find3.waitFor();
    await f.snapshot(`${label}-fixed-points-named`);
    await find3.click();
    await f.page.waitForFunction(() => document.activeElement?.getAttribute('data-constraint-id') === 'rule:1');
    await f.snapshot(`${label}-fixed-point-focused`);
    await f.sketchPanel().locator('[data-constraint-id="rule:1"] button.x').click();
    await find3.waitFor({ state: 'hidden' });
    await f.sketchPanel().getByLabel('Constraint kind', { exact: true }).selectOption('');
    await f.worldClick(hit);
    await button(direction).click();
    await button(`Remove ${direction} edge 2`).waitFor();
    await f.snapshot(`${label}-axis-applied`);
    await f.page.locator('.topbar button.finish').click();
    await f.sketchPanel().waitFor({ state: 'hidden' });
    await f.changed(seed);
    const accepted = await f.doc();
    const outline = accepted.nodes[0].outline;
    assert.deepEqual(outline.rules, rules.slice(0, 1));
    assert.ok(outline.hv[vertical ? 'v' : 'h'].includes(1));
    for (let i = 0; i < 2; i++) near(outline.points[2][i], select(direction, [40, 20])[i]);
    near((await f.bodies()).bodies[0].volume, 8000);
    await f.undo();
    await f.same(seed);
    await f.redo();
    await f.same(accepted);
    const saved = await f.save(`${label}-axis-recovery`);
    await f.freshOpen(saved.file, accepted, `${label}-reopened`);
    near((await f.bodies()).bodies[0].volume, 8000);
  }
});
