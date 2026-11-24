import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/state/useStudioModelEvaluation.ts', 'apps/cad-studio/test/parameter-geometry-retry-browser.mjs'];
const f = await createFlow({
  name: 'parameter-geometry-retry', output: process.argv[2], envFrozen: 'PARAMETER_RETRY_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'A refused geometry candidate leaves the next valid parameter edit usable on its first submission.',
  limits: ['Desktop Chrome 1024/1440; one width-bound rectangular extrusion; no full-suite or CI claim.'],
});
const fixture = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { Width: 40 }, configurations: { Base: { Width: 40 } }, nodes: [
  { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [{ parameter: 'Width' }, 20], id: 'n0' },
  { kind: 'extrude', sketch: 0, height: 5, id: 'n1' },
], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
await f.run(async () => {
  for (const width of [1024, 1440]) {
    await f.newPage(); await f.page.setViewportSize({ width, height: 900 });
    const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), f.page.getByRole('button', { name: 'Open', exact: true }).click()]);
    await chooser.setFiles({ name: 'bound-parameter.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await f.same(fixture); await f.ready(); await f.openParameters();
    const field = f.page.getByRole('complementary', { name: 'Parameters panel', exact: true }).getByLabel('Value of Width', { exact: true });
    for (const target of [50, 60]) {
      const before = await f.doc();
      await field.fill('0'); await field.press('Enter');
      await f.waitToast(/Parameters not changed/); await f.same(before);
      if (target === 50) await f.page.waitForTimeout(1200);
      await field.fill(String(target)); await field.press('Enter');
      // Exactly one submission: no extra UI action or retry may refresh a stale callback.
      await f.page.waitForFunction(value => window.__studioDoc.parameters.Width === value, target, { timeout: 10000 });
      await f.ready(); const after = await f.doc();
      assert.deepEqual(after.nodes, before.nodes); assert.deepEqual(after.configurations, before.configurations);
      assert.ok(Math.abs((await f.bodies()).bodies[0].volume - target * 100) < 1e-7);
      await f.undo(); await f.same(before);
      assert.ok(Math.abs((await f.bodies()).bodies[0].volume - before.parameters.Width * 100) < 1e-7);
      await f.redo(); await f.same(after);
      assert.ok(Math.abs((await f.bodies()).bodies[0].volume - target * 100) < 1e-7);
      await f.snapshot(`${width}-recovered-${target}`);
      f.report.observations.push({ width, target, firstValidSubmissionAccepted: true, undoRedoVolumeVerified: true, configurationsPreserved: true, postRefusalDelayMs: target === 50 ? 1200 : 0 });
    }
  }
});
