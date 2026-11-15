import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/viewport/useViewportPicking.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/app/sweepPathFeedback.ts'];
const f = await createFlow({
  name: 'sweep-closed-path', output: process.argv[2], envFrozen: 'D1313_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Explain a closed Sweep path and recover an open path while preserving the profile and document.',
  limits: ['Desktop WebGPU 1024x800. Two circular profiles, two straight paths and a closed polygon. Faceted New body only.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkOutput, evaluateCadPart } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = evaluateCadPart(toPartDocument(doc)).outputs.find(body => body.id === doc.nodes[3].id);
const points = out.brep.vertices.map(vertex => vertex.point);
const axis = doc.nodes[3].path.controlPoints, [first, last] = axis;
const rings = [first[2], last[2]].map(z => points.filter(p => Math.abs(p[2] - z) < 1e-7).map(p => Math.hypot(p[0] - first[0], p[1] - first[1])));
console.log(JSON.stringify({ valid: checkOutput(out).valid, count: out.bodyCount, bounds: [0,1,2].map(k => [Math.min(...points.map(p => p[k])), Math.max(...points.map(p => p[k]))]),
  rings: rings.map(r => ({ count: r.length, min: Math.min(...r), max: Math.max(...r) })) }));
`,
});
const railA = [[0, 0, 0], [0, 0, 32]], railB = [[30, 0, 0], [30, 0, 22]];
const source = (name, points) => `@model ${name} { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 1; knots: [0,0,1,1]; control-points: [${points.map(p => '[' + p.join(',') + ']').join(',')}]; weights: [1,1]; } }`;
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 4,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 3 },
    { id: 'n1', kind: 'sketch', profile: 'circle', center: [30, 0], radius: 6 },
    { id: 'n3', kind: 'sketch', profile: 'circle', center: [70, 0], radius: 2 },
  ],
  outputs: {},
  direct: {
    sources: { closed: '@model loop { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 1; knots: [0,0,1,2,3,4,4]; control-points: [[0,0,0],[10,0,0],[10,10,0],[0,10,0],[0,0,0]]; weights: [1,1,1,1,1]; } }', ra: source('railA', railA), rb: source('railB', railB),
      surface: '@model plane { version: 0; length-unit: mm; @surface #plate { type: nurbs; degree-u: 1; degree-v: 1; knots-u: [0,0,1,1]; knots-v: [0,0,1,1]; control-points: [[[70,0,0],[70,5,0]],[[75,0,0],[75,5,0]]]; weights: [[1,1],[1,1]]; } }' },
    objects: [{ id: 'closed', name: 'Closed rail', source: 'closed', geometry: 'rail' }, { id: 'path-a', name: 'Rail A', source: 'ra', geometry: 'rail' }, { id: 'path-b', name: 'Rail B', source: 'rb', geometry: 'rail' },
      { id: 'plate', name: 'Test surface', source: 'surface', geometry: 'plate' }],
  },
};
if (process.argv.includes('--circle')) {
  seed.direct.sources.closed = '@model loop { version: 0; length-unit: mm; @curve #rail { type: nurbs; degree: 2; knots: [0,0,0,1,1,2,2,3,3,4,4,4]; control-points: [[5,0,0],[5,5,0],[0,5,0],[-5,5,0],[-5,0,0],[-5,-5,0],[0,-5,0],[5,-5,0],[5,0,0]]; weights: [1,0.707106781,1,0.707106781,1,0.707106781,1,0.707106781,1]; } }';
  f.report.limits.push('R5 rational circle replaces closed polygon for original-path regression.');
}
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (a, b) => Math.abs(a - b) < 1e-7;
const hud = () => f.page.getByRole('dialog', { name: 'Sweep', exact: true });
const read = () => f.page.evaluate(() => ({
  sketches: window.__studioSelection.selection.sketches ?? [],
  paths: [...document.querySelectorAll('.ol.direct.sel')].map(el => el.textContent.trim()),
  hud: document.querySelector('.hud')?.textContent ?? null, visibleVolume: window.__studioSection().shownVolume,
}));
const ringVolume = (radius, length) => 16 * radius ** 2 * Math.sin(Math.PI / 16) * length;
async function settle(sketch, name, radius, length, label) {
  f.phase = label;
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await hud().locator('.hud-step').filter({ hasText: 'Profile' }).getByText(`Sketch ${sketch + 1}`, { exact: true }).waitFor();
  await hud().locator('.hud-step').filter({ hasText: 'Path' }).getByText(`${name} · Line`, { exact: true }).waitFor();
  await f.page.waitForFunction(v => Math.abs(window.__studioSection().shownVolume - v) < 0.01, ringVolume(radius, length));
  const state = await read();
  assert.deepEqual([state.sketches, state.paths], [[sketch], [name]]);
  f.report.observations.push({ label, ...state, expectedVolume: ringVolume(radius, length) });
  await f.same(seed);
  await f.snapshot(label);
}
async function verify(doc, label) {
  const node = doc.nodes[3];
  assert.equal(node.kind, 'sweep-curve');
  assert.equal(node.sketch, 0);
  assert.equal(node.name, 'Rail B');
  assert.deepEqual(node.path.controlPoints, railB);
  assert.deepEqual(doc.direct, seed.direct);
  const native = await f.inspect(label, doc);
  f.report.observations.push({ label, node, native });
  assert.ok(native.valid && native.count === 1);
  for (const [axis, expected] of [[0, [27, 33]], [1, [-3, 3]], [2, [0, 22]]]) {
    assert.ok(native.bounds[axis].every((v, i) => near(v, expected[i])), JSON.stringify(native));
  }
  for (const ring of native.rings) assert.ok(ring.count === 32 && near(ring.min, 3) && near(ring.max, 3));
}

await f.run(async () => {
  await f.newPage();
  await f.page.setViewportSize({ width: 1024, height: 800 });
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'D1313-sweep-closed-path.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Sketch 1').click();
  await button('Rail A').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await settle(0, 'Rail A', 3, 32, 'initial-sweep-preview');
  for (let attempt = 0; attempt < 2; attempt++) {
    await button('Closed rail').click();
    await hud().getByRole('status').filter({ hasText: 'Path is closed. Select an open curve.' }).waitFor();
    assert.equal(await button('Apply', hud()).isDisabled(), true);
    assert.equal(await hud().getByText('The kernel could not build this', { exact: true }).count(), 0);
    assert.equal(await hud().locator('.hud-step.done').filter({ hasText: 'Path' }).count(), 0);
    await f.same(seed);
    await f.snapshot(`closed-path-${attempt}`);
    await button('Rail A').click();
    await settle(0, 'Rail A', 3, 32, `open-recovery-${attempt}`);
  }
  await button('Rail B').click();
  await settle(0, 'Rail B', 3, 22, 'rail-b-keeps-profile');
  await button('Test surface').click();
  await f.waitToast(/Sweep input not changed.*path must be a curve/i);
  await settle(0, 'Rail B', 3, 22, 'surface-refusal-keeps-both');
  await button('Sketch 2').click({ modifiers: ['Shift'] });
  await settle(1, 'Rail B', 6, 22, 'new-profile-keeps-rail-b');
  await button('Sketch 1').click({ modifiers: ['Shift'] });
  await settle(0, 'Rail B', 3, 22, 'earlier-profile-keeps-rail-b');
  await button('Apply', hud()).click();
  await f.changed(seed);
  const result = await f.snapshot('sweep-retarget-applied');
  await verify(result.doc, 'retarget-result');
  await f.undo();
  await f.same(seed);
  await f.redo();
  await f.same(result.doc);
  const file = await f.save('sweep-retarget');
  const reopened = await f.freshOpen(file.file, result.doc, 'sweep-retarget-reopened');
  await verify(reopened.doc, 'reopened-native');
  await f.newPage();
  await f.page.setViewportSize({ width: 1024, height: 800 });
  const [closedChooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await closedChooser.setFiles({ name: 'closed-first.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Sketch 1').click();
  await button('Closed rail').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Sweep');
  await hud().getByRole('status').filter({ hasText: 'Path is closed. Select an open curve.' }).waitFor();
  assert.equal(await button('Apply', hud()).isDisabled(), true);
  await f.same(seed);
  await f.snapshot('closed-initial');
  await button('Cancel', hud()).click();
  await hud().waitFor({ state: 'hidden' });
  await f.same(seed);
  await f.snapshot('cancel-preserves-document');
});
