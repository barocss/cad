import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const file = process.argv[3], doc = JSON.parse(await readFile(file));
const triangular = process.argv.includes("--triangle");
const faceCounts = triangular ? [5] : [18, 6];
const f = await createFlow({
  name: 'smooth-turn-step', output: process.argv[2], envFrozen: 'TURN_STEP_FROZEN',
  qualification: 'Inspect STEP written by actual Studio from the approved compact Smooth Turn.',
  initialFiles: ['apps/cad-studio/test/smooth-turn-step-browser.mjs', 'apps/cad-studio/test/smooth-turn-step-oracle.py',
    'apps/cad-studio/test/part21-prism-check.py', 'apps/cad-studio/src/files/useModelExports.ts', 'apps/cad-studio/src/files/StepExportPanel.tsx', 'packages/barocss-cad-model/src/engine/evaluate.ts'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ brep }) => ({
  check: checkBrep(brep, { strict: true }), volume: brepMassProperties(brep, 1).volume,
  faceNames: brep.faces.map(face => face.name),
}))));
`,
});
const b = name => f.page.getByRole('button', { name, exact: true });
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.addInitScript(() => {
      const blobs = new Map(), priorUrl = URL.createObjectURL, click = HTMLAnchorElement.prototype.click;
      URL.createObjectURL = function (blob) {
        const href = priorUrl.call(URL, blob);
        blobs.set(href, blob);
        return href;
      };
      HTMLAnchorElement.prototype.click = function () {
        const blob = blobs.get(this.href);
        if (!blob || !this.download.endsWith('.step')) return click.call(this);
        blobs.delete(this.href);
        window.stepOutput = blob.text();
      };
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.freshOpen(file, doc, 'approved-turn-opened');
  await b('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (await b('AO').getAttribute('aria-pressed') === 'true') await b('AO').click();
  const nativeDisplay = triangular ? await f.page.evaluate(() => window.__studioLoftDisplay?.(0)) : null;
  if (triangular) assert.deepEqual(nativeDisplay, { kind: 'smooth-turn', triangles: 690, baseTriangles: 224 });
  f.phase = 'read STEP preparation and loss disclosure in Studio';
  await b('Export STEP').click();
  const panel = f.page.getByLabel('STEP export', { exact: true });
  await panel.getByLabel('STEP loss report', { exact: true }).waitFor();
  const report = await panel.innerText();
  assert.match(report, /STEP AP214 · B-rep geometry · mm/);
  assert.match(report, /feature history/i);
  assert.match(await panel.getByLabel('STEP included bodies').innerText(), new RegExp('^' + faceCounts.length + ' output bod(?:y|ies)'));
  await f.snapshot('approved-turn-step-losses');
  f.phase = 'capture the local STEP bytes actually produced by Studio';
  await panel.getByRole('button', { name: 'Export', exact: true }).click();
  await panel.waitFor({ state: 'hidden' });
  const text = await f.page.evaluate(() => window.stepOutput);
  assert.ok(text?.startsWith('ISO-10303-21;'));
  const artifact = join(f.output, 'approved-turn-from-studio.step');
  await writeFile(artifact, text);
  await f.same(doc);
  const oracle = ['-BI', join(f.app, 'test/smooth-turn-step-oracle.py'), artifact];
  if (triangular) oracle.push('--triangle');
  const graph = JSON.parse(execFileSync('python3', oracle, { encoding: 'utf8' }));
  const before = await f.inspect('approved-native', doc);
  assert.deepEqual(before.map(body => body.check.counts.faces), faceCounts);
  assert.ok(before.every(body => body.check.valid));
  assert.ok(Math.abs(before.at(-1).volume - graph.smoothVolumeMM3) < 1e-7);
  f.report.observations.push({ report, graph, before });

  f.phase = 'fresh Open the exact AP214 bytes in Studio';
  await f.newPage();
  await f.openFile(artifact, 1);
  const loaded = await f.doc();
  assert.equal(loaded.nodes[0].kind, 'import');
  assert.equal(loaded.nodes[0].solids ?? 1, faceCounts.length);
  assert.equal(loaded.nodes[0].step, text);
  assert.ok(!loaded.proposals?.length && !loaded.history?.length);
  const imported = await f.inspect('step-opened-native', loaded);
  assert.equal(imported.length, faceCounts.length);
  const { bodies } = await f.bodies();
  for (const [i, body] of imported.entries()) {
    assert.ok(body.check.valid);
    assert.deepEqual(body.check.counts, before[i].check.counts);
    assert.deepEqual(body.faceNames, before[i].faceNames.map(name => loaded.nodes[0].id + '.' + name));
    assert.ok(Math.abs(body.volume - before[i].volume) < 1e-7);
    assert.ok(Math.abs(bodies[i].volume - body.volume) < 1e-7);
  }
  assert.deepEqual(f.report.downloads, []);
  await b('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (await b('AO').getAttribute('aria-pressed') === 'true') await b('AO').click();
  const reopenedDisplay = triangular ? await f.page.evaluate(() => window.__studioLoftDisplay?.(0)) : null;
  if (triangular) assert.equal(reopenedDisplay, null);
  f.report.observations.push({ imported, noNativeFeatureHistory: true, nativeDisplay, reopenedDisplay });
  await f.snapshot('approved-turn-step-reopened');
});
