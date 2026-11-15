import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['apps/cad-studio/src/ui/DirectPanel.tsx', 'apps/cad-studio/src/ui/curveAnalysisError.ts', 'packages/barocss-cad-model/src/engine/direct.ts'];
const f = await createFlow({ name: 'curve-join-inspection', output: process.argv[2], envFrozen: 'D1312_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Explain a two-span curve join refusal and recover radius inspection without editing geometry.',
  limits: ['Desktop Chrome; one two-span circular curve and straight control; no kernel changes.'] });
const doc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: { sources: { src: `@model test { version: 0; length-unit: mm;
@curve #rail { type: nurbs; degree: 2; knots: [0,0,0,1,1,2,2,2]; control-points: [[20,0,0],[20,20,0],[0,20,0],[-20,20,0],[-20,0,0]]; weights: [1,0.707106781,1,0.707106781,1]; }
@curve #joined { type: nurbs; degree: 2; knots: [0,0,0,1,1,2,2,2]; control-points: [[10,10,0],[17.5,10,0],[25,10,0],[32.5,10,0],[40,10,0]]; weights: [1,1,1,1,1]; }
@curve #line { type: nurbs; degree: 1; knots: [0,0,1,1]; control-points: [[-20,-10,0],[20,-10,0]]; weights: [1,1]; } }` },
objects: [{ id: 'joined', name: 'Joined line', source: 'src', geometry: 'joined' }, { id: 'rail', name: 'Two-span rail', source: 'src', geometry: 'rail' }, { id: 'line', name: 'Straight control', source: 'src', geometry: 'line' }] } };
await f.run(async () => {
  await f.newPage();
  if (process.argv.includes('--narrow')) await f.page.setViewportSize({ width: 1024, height: 800 });
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), f.page.getByRole('button', { name: 'Open', exact: true }).click()]);
  await chooser.setFiles({ name: 'curve-join.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
  const panel = f.page.getByRole('complementary', { name: 'Direct geometry' });
  const row = name => f.page.locator('.outliner .ol.direct').filter({ hasText: name });
  f.phase = 'join guidance and repeated span recovery';
  await row('Two-span rail').click();
  const note = panel.getByText(/Unavailable at join/);
  await note.waitFor();
  await panel.getByText('0, 20, 0', { exact: true }).waitFor();
  await note.scrollIntoViewIfNeeded();
  await f.snapshot('join-guidance');
  for (const t of ['0.99', '1.01', '1', '0.5']) {
    await panel.getByLabel('At t', { exact: true }).fill(t);
    if (t === '1') await note.waitFor();
    else { await note.waitFor({ state: 'hidden' }); await panel.getByText('20 mm', { exact: true }).waitFor(); }
  }
  f.phase = 'selection replacement clears stale guidance';
  await panel.getByLabel('At t', { exact: true }).fill('1');
  await note.waitFor();
  await row('Straight control').click();
  await note.waitFor({ state: 'hidden' });
  await panel.getByText('straight', { exact: true }).waitFor();
  await f.same(doc);
  await f.snapshot('straight-control');
  await row('Two-span rail').click();
  await note.waitFor();
  await f.same(doc);
  await panel.getByText('0, 20, 0', { exact: true }).waitFor();
  await note.scrollIntoViewIfNeeded();
  await f.snapshot('join-reselected');
  f.phase = 'issue 498 joined line point and adjacent parameters';
  await row('Joined line').click();
  await panel.getByText('25, 10, 0', { exact: true }).waitFor();
  await note.waitFor();
  for (const [t, point] of [['0.5', '17.5, 10, 0'], ['1.5', '32.5, 10, 0']]) {
    await panel.getByLabel('At t', { exact: true }).fill(t);
    await panel.getByText(point, { exact: true }).waitFor();
    await panel.getByText('straight', { exact: true }).waitFor();
  }
  await panel.getByLabel('At t', { exact: true }).fill('1');
  await note.scrollIntoViewIfNeeded();
  await panel.getByText('25, 10, 0', { exact: true }).waitFor();
  await f.same(doc);
  await f.snapshot('joined-line-point');
  const saved = await f.save('join-inspection');
  await f.freshOpen(saved.file, saved.doc, 'reopened');
  if (process.argv.includes('--narrow')) await f.page.setViewportSize({ width: 1024, height: 800 });
  const nextPanel = f.page.getByRole('complementary', { name: 'Direct geometry' });
  await f.page.locator('.outliner .ol.direct').filter({ hasText: 'Two-span rail' }).click();
  await nextPanel.getByText('0, 20, 0', { exact: true }).waitFor();
  await nextPanel.getByText(/Unavailable at join/).waitFor();
  await nextPanel.getByLabel('At t', { exact: true }).fill('1.5');
  await nextPanel.getByText('20 mm', { exact: true }).waitFor();
  assert.equal((await f.doc()).direct.sources.src, doc.direct.sources.src);
  await f.same(doc);
  await f.snapshot('reopened-span');
});
