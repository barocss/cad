import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { twoGuideInspector } from './loft-two-guides-oracle.mjs';

const stepExchange = process.argv.includes('--step');
const framed = process.argv.includes('--framed');
const baseline = process.argv.includes('--baseline');
const shifted = process.argv.includes('--shifted');
assert.ok(!framed || !stepExchange);
assert.ok(!baseline || framed);
assert.ok(!shifted || framed);
const output = resolve(process.argv[2]);
assert.ok(relative(resolve(import.meta.dirname, '../../..'), output).startsWith('../'));
const pins = [
  'apps/cad-studio/test/two-guide-loft-taper-browser.mjs', 'apps/cad-studio/test/loft-two-guides-oracle.mjs',
  'packages/barocss-cad/src/features/loft-two-guides.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/editFields.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  ...(framed ? ['packages/barocss-cad/src/part/part-profile-solid.ts', 'packages/barocss-cad-model/src/app/profiles.ts'] : []),
  ...(stepExchange ? [
    'apps/cad-studio/test/two-guide-loft-step-oracle.py',
    'apps/cad-studio/test/smooth-turn-step-oracle.py',
    'apps/cad-studio/test/part21-prism-check.py',
    'apps/cad-studio/src/files/useModelExports.ts',
    'apps/cad-studio/src/files/StepExportPanel.tsx',
    'packages/barocss-cad/src/io/step.ts',
    'packages/barocss-cad/src/io/step-import.ts',
  ] : []),
];
const f = await createFlow({
  name: 'two-guide-loft-taper', output, envFrozen: 'D1280_SOURCE_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: stepExchange ? 'Author, edit, export and reopen the two exact unequal two-guide Loft sizes.'
    : 'Build and edit a two-guide Loft between rectangular sections of different widths and depths.',
  limits: [`10 × 6 and 14 × 4 mm rectangular sections, ${framed ? '10 mm apart in one tilted orientation' : '12 mm apart'}, with linear depth-to-width ratio.`],
  inspectorSource: twoGuideInspector,
});
const height = framed ? 10 : 12;
// At this origin both authored and carried upper corners reconstruct identically in binary64.
const frameY = shifted ? -6 : -10;
const world = ([x, y, z]) => framed ? [20 + x, frameY + 0.6 * y + 0.8 * z, 7 - 0.8 * y + 0.6 * z] : [x, y, z];
const normal = framed ? [0, 0.8, 0.6] : [0, 0, 1];
const upperShift = shifted ? 5 : 0;
const plane = (z, shift = 0) => ({ origin: world([shift, 0, z]), normal, xAxis: [1, 0, 0] });
const guidePoints = (start, mid, end, midY = 0) => [[start, 0, 0], [mid, midY, height / 2], [end, 0, height]].map(world);
const bezier = (name, start, mid, end) => `@model ${name} {
  version: 0; length-unit: mm;
  @curve #curve { type: nurbs; degree: 2; knots: [0,0,0,1,1,1]; control-points:
    ${JSON.stringify(guidePoints(start, mid, end))}; weights: [1,1,1]; }
}`;
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2, outputs: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 6], ...(framed ? { plane: plane(0) } : {}) },
    { id: 'n1', kind: 'sketch', profile: 'rectangle', min: [0 - upperShift, 0], max: [14 - upperShift, 4], plane: plane(height, upperShift) },
  ],
  direct: {
    sources: { a: bezier('left', 0, 2, 0), b: bezier('right', 10, 16, 14) },
    objects: [{ id: 'a', name: 'Rail A', source: 'a', geometry: 'curve' }, { id: 'b', name: 'Rail B', source: 'b', geometry: 'curve' }],
  },
};
const truth = {
  16: { volume: 29016 / 35, centroid: [891196 / 126945, 36886306 / 13329225, 250724 / 42315], inertiaDiagonal: [11.517192331390, 20.885914535959, 13.820989492616] },
  18: { volume: 161272 / 175, centroid: [1042239 / 141113, 43398851 / 14816865, 833844 / 141113], inertiaDiagonal: [12.716299203386, 24.365613158835, 17.224922734439] },
};
const sideways = { volume: 162047 / 175, centroid: [685313819 / 95283636, 229215251 / 68059740, 6701652 / 1134329] };
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Loft', exact: true });
const near = (a, b) => Math.abs(a - b) < 1e-8;
const nearPoint = (a, b) => a.length === 3 && a.every((x, k) => near(x, b[k]));
async function verify(doc, middleX, label, middleY = 0) {
  const guides = [guidePoints(0, 2, 0), guidePoints(10, middleX, 14, middleY)];
  const feature = doc.nodes.at(-1);
  if (feature.kind === 'loft') {
    assert.deepEqual(feature.guides.map(guide => guide.controlPoints), guides);
    if (framed) {
      assert.deepEqual(feature.from, [0, 1]);
      assert.deepEqual(feature.sections.map(section => section.frame), [0, height].map(z => ({
        origin: world([z === 0 ? 0 : upperShift, 0, z]), xAxis: [1, 0, 0], yAxis: [0, 0.6, -0.8],
      })));
    }
  }
  else assert.equal(feature.kind, 'import');
  const actual = await f.inspect(label, doc);
  assert.ok(actual.report.valid, JSON.stringify(actual.report.issues));
  assert.equal(actual.report.counts.faces, 6);
  assert.equal(actual.report.topology[0].genus, 0);
  assert.ok(actual.report.maximumPcurveGap < 1e-8);
  const [worker] = (await f.bodies()).bodies;
  assert.equal(worker.key, actual.key);
  const expected = middleY === 0 ? truth[middleX] : sideways;
  const volume = expected.volume * height / 12;
  const centroid = world([expected.centroid[0], expected.centroid[1], expected.centroid[2] * height / 12]);
  assert.ok(near(actual.mass.volume, volume) && near(worker.volume, volume));
  assert.ok(nearPoint(actual.mass.centroid, centroid));
  if (!framed) assert.ok(nearPoint(actual.mass.inertia.map((row, i) => row[i]), expected.inertiaDiagonal));
  const left = actual.edges.find(edge => nearPoint(edge.controls[0], guides[0][0]));
  const right = actual.edges.find(edge => nearPoint(edge.controls[0], guides[1][0]));
  assert.deepEqual([left.controls, right.controls], guides);
  assert.equal(left.uses, 2);
  assert.equal(right.uses, 2);
  assert.equal(actual.sides.length, 4);
  for (const [i, t] of [0,.25,.5,.75,1].entries()) {
    const width = middleX === 16 ? 10 + 8 * t - 4 * t ** 2 : 10 + 12 * t - 8 * t ** 2;
    const y = middleY * 2 * t * (1 - t), aspect = 3 / 5 - 11 / 35 * t;
    const dx = -y * aspect, dy = width * aspect;
    const x0 = 4 * t * (1 - t), z = height * t;
    const ring = [[x0,0,z], [x0+width,y,z], [x0+width+dx,y+dy,z], [x0+dx,dy,z]].map(world);
    assert.ok(nearPoint(left.samples[i], ring[0]) && nearPoint(right.samples[i], ring[1]));
    const matched = new Set();
    for (const side of actual.sides) {
      const [a, m, b] = side.samples[i], corner = ring.findIndex((point, j) => nearPoint(a, point) && nearPoint(b, ring[(j + 1) % 4]));
      assert.ok(corner >= 0 && !matched.has(corner), JSON.stringify({ t, side, ring }));
      matched.add(corner);
      assert.ok(nearPoint(m, a.map((x, k) => (x + b[k]) / 2)));
    }
  }
  f.report.observations.push({ label, expected: { volume, centroid }, volume: actual.mass.volume, worker: worker.volume, centroid: actual.mass.centroid });
  return actual;
}

async function exportTaper(doc, middle, label) {
  f.phase = 'Prepare exact STEP for guide control X' + middle;
  await f.page.waitForFunction(() => window.__studioLoftDisplay?.(0)?.triangles > 0);
  const display = await f.page.evaluate(() => window.__studioLoftDisplay(0));
  assert.ok(display.triangles > display.baseTriangles && display.error <= 0.01);
  await button('Export STEP').click();
  const panel = f.page.getByLabel('STEP export', { exact: true });
  await panel.getByLabel('STEP loss report', { exact: true }).waitFor();
  assert.match(await panel.innerText(), /STEP AP214 · B-rep geometry · mm/);
  assert.match(await panel.innerText(), /native feature history/i);
  assert.match(await panel.getByLabel('STEP included bodies').innerText(), /^1 output bod(?:y|ies)\b/);
  await f.snapshot(label + '-step-ready');
  await button('Export', panel).click();
  await panel.waitFor({ state: 'hidden' });
  const text = await f.page.evaluate(() => window.taperStepOutput);
  assert.ok(text?.startsWith('ISO-10303-21;'));
  const path = join(f.output, label + '.step');
  await writeFile(path, text);
  await f.same(doc);
  const oracle = join(f.app, 'test/two-guide-loft-step-oracle.py');
  const independent = JSON.parse(execFileSync('python3', ['-BI', oracle, path, String(middle)], { encoding: 'utf8' }));
  assert.equal(independent.status, 'PASS');
  assert.throws(() => execFileSync('python3', ['-BI', oracle, path, middle === 16 ? '18' : '16'], { stdio: 'pipe' }));
  f.report.observations.push({ label, independent, wrongGuideControlDetected: true, nativeDisplay: display });
  return { path, text, middle, label };
}

async function openTaper({ path, text, middle, label }) {
  f.phase = 'Fresh Studio Open of exact generated STEP bytes';
  await f.newPage();
  await f.openFile(path, 1);
  const imported = await f.doc();
  assert.equal(imported.nodes[0].step, text);
  assert.equal(imported.nodes[0].kind, 'import');
  assert.equal(imported.nodes[0].solids ?? 1, 1);
  assert.ok(!imported.direct && !imported.history?.length);
  const actual = await verify(imported, middle, label + '-reopened-native');
  assert.deepEqual(actual.report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  const display = await f.page.evaluate(() => window.__studioLoftDisplay?.(0) ?? null);
  f.report.observations.push({ label, importedDisplay: display });
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot(label + '-step-opened');
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    if (stepExchange) await context.addInitScript(() => {
      const urls = new Map(), originalUrl = URL.createObjectURL, originalClick = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = function (blob) {
        const url = originalUrl.call(URL, blob);
        urls.set(url, blob);
        return url;
      };
      HTMLAnchorElement.prototype.click = function () {
        const blob = urls.get(this.href);
        if (!blob || !this.download.endsWith('.step')) return originalClick.call(this);
        urls.delete(this.href);
        window.taperStepOutput = blob.text();
      };
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Open unequal rectangular sections and apply Loft with both copied guides';
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'unequal-loft.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await button('Sketch 2').click();
  await button('Sketch 1').click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft');
  await hud().getByLabel('Guide (copied)', { exact: true }).selectOption('a');
  await hud().getByLabel('Second guide (copied)', { exact: true }).selectOption('b');
  if (baseline) {
    await hud().locator('.status').filter({ hasText: /^refused$/ }).waitFor();
    if (shifted) {
      const reason = hud().getByText(/exact offset along the common normal/).first();
      assert.match(await reason.textContent(), /require an exact offset along the common normal/);
    } else await hud().getByText(/must face \+Z for a two-guide loft/).first().waitFor();
    await f.same(seed);
    await f.snapshot(shifted ? '00-previous-shifted-loft-refusal' : '00-previous-tilted-loft-refusal');
    return;
  }
  await hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor({ timeout: 15000 });
  await f.same(seed);
  await button('Apply', hud()).click();
  await f.changed(seed);
  const made = await f.doc();
  await verify(made, 16, 'original');
  if (framed || process.argv.includes('--check-display')) {
    await f.page.waitForFunction(() => window.__studioLoftDisplay?.()?.triangles > 0);
    const display = await f.page.evaluate(() => window.__studioLoftDisplay(0));
    assert.ok(display.triangles > display.baseTriangles && display.error <= 0.01);
    f.report.observations.push({ label: 'original-display', display });
  }
  if (framed) {
    await button('Iso').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  }
  await f.snapshot('original');
  const exported = stepExchange ? [await exportTaper(made, 16, 'initial-taper')] : [];

  f.phase = 'Edit the second guide and check that both authored sections stay exact';
  await f.openFeatureEditor(4, 'Loft with unequal sections');
  const guideX = f.editor().getByLabel(framed ? 'Guide 2 middle section X' : 'Guide 2 middle X', { exact: true });
  const sectionX = x => String(x - upperShift / 2);
  assert.equal(await guideX.inputValue(), sectionX(16));
  if (framed) {
    f.phase = 'Refuse crossed guides and keep the accepted solid';
    await guideX.fill(sectionX(1));
    await button('Apply', f.editor()).click();
    await f.editor().getByText('The Loft guides are too close', { exact: true }).waitFor();
    await f.same(made);
    await f.snapshot('crossed-guides-refused');
  }
  await guideX.fill(sectionX(18));
  const edited = (await f.applyEditor(made, 'edited')).doc;
  const actual = await verify(edited, 18, 'edited');
  await f.undo();
  await f.same(made);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('loft-between-unequal-rectangles');
  await f.freshOpen(saved.file, edited, 'reopened');
  assert.deepEqual(await verify(await f.doc(), 18, 'reopened'), actual);
  await f.openFeatureEditor(4, 'Reopened Loft with unequal sections');
  for (const [i, points] of [guidePoints(0, 2, 0), guidePoints(10, 18, 14)].entries())
    await f.editor().getByText(`Guide ${i + 1} · (${points[0].join(', ')}) → (${points[2].join(', ')}) mm`, { exact: true }).waitFor();
  await f.snapshot('reopened-guide-history');
  if (framed) {
    const guideY = f.editor().getByLabel('Guide 2 middle section Y', { exact: true });
    assert.equal(await guideY.inputValue(), '0');
    await guideY.fill('2.5');
    const afterOpen = (await f.applyEditor(edited, 'reopened-guide-y-edited')).doc;
    await verify(afterOpen, 18, 'post-open-section-y', 2.5);
    await f.undo();
    await f.same(edited);
  }
  if (stepExchange) {
    await f.closeEditor();
    exported.push(await exportTaper(await f.doc(), 18, 'edited-taper'));
    for (const file of exported) await openTaper(file);
  }
});
