import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const file = process.argv[3], original = JSON.parse(await readFile(file));
const variants = ['--triangle', '--screw-positive', '--screw-negative',
  '--triangular-screw-positive', '--triangular-screw-negative',
  '--pentagon-screw-positive', '--pentagon-screw-negative', '--hexagon-screw-positive', '--hexagon-screw-negative',
  '--trapezoid-screw-positive', '--trapezoid-screw-negative', '--skew-quadrilateral-screw-positive', '--skew-quadrilateral-screw-negative']
  .filter(option => process.argv.includes(option));
assert.ok(variants.length <= 1);
const [variant] = variants;
const triangularScrew = variant?.startsWith('--triangular-screw-');
const triangular = variant === '--triangle' || triangularScrew;
const polygonProfile = variant?.slice(2).split('-screw-')[0];
const polygonSides = { pentagon: 5, hexagon: 6, trapezoid: 4, 'skew-quadrilateral': 4 }[polygonProfile] ?? 0;
const screw = triangularScrew || polygonSides > 0 || variant?.startsWith('--screw-');
const faceCounts = polygonSides ? [polygonSides + 2] : triangular ? [5] : screw ? [6] : [18, 6];
const f = await createFlow({
  name: 'smooth-turn-step', output: process.argv[2], envFrozen: 'TURN_STEP_FROZEN',
  qualification: 'Independently read the AP214 bytes Studio writes for the approved compact Turn or Screw.',
  initialFiles: ['apps/cad-studio/test/smooth-turn-step-browser.mjs', 'apps/cad-studio/test/smooth-turn-step-oracle.py',
    'apps/cad-studio/test/part21-prism-check.py', 'apps/cad-studio/src/files/useModelExports.ts', 'apps/cad-studio/src/files/StepExportPanel.tsx', 'packages/barocss-cad-model/src/engine/evaluate.ts'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties, curveDomain, evaluateCurve } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
function rails(brep) {
  const axial = ([, y, z]) => .6 * y + .8 * z;
  return brep.edges.filter(({ curve }) => curve.degree === 3 && curve.controlPoints.length === 16).map(({ curve }) => {
    const [a, b] = curveDomain(curve);
    const samples = Array.from({ length: 121 }, (_, i) => evaluateCurve(curve, a + (b - a) * i / 120));
    return axial(samples[0]) < axial(samples.at(-1)) ? samples : samples.reverse();
  });
}
console.log(JSON.stringify(partBreps(doc).map(({ brep }) => ({
  check: checkBrep(brep, { strict: true }), volume: brepMassProperties(brep, 1).volume,
  faceNames: brep.faces.map(face => face.name), ...(${polygonSides > 0} ? { rails: rails(brep) } : {}),
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
  let doc = original;
  await f.freshOpen(file, doc, 'approved-turn-opened');
  if ((triangularScrew || polygonSides) && variant.endsWith('-positive')) {
    const terminal = doc.nodes.length - 1;
    await f.openFeatureEditor(terminal, 'reverse the approved Screw before STEP export');
    const winding = f.editor().getByLabel('Turn angle', { exact: true });
    assert.equal(Number(await winding.inputValue()), -450);
    assert.equal(Number(await f.editor().getByLabel('Pitch per revolution', { exact: true }).inputValue()), 40);
    await winding.fill('450');
    const reversed = (await f.applyEditor(doc, 'positive-winding-applied')).doc;
    assert.deepEqual(reversed.nodes[terminal], doc.nodes[terminal]);
    doc = reversed;
  }
  await b('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (await b('AO').getAttribute('aria-pressed') === 'true') await b('AO').click();
  const nativeDisplay = triangular || screw ? await f.page.evaluate(() => window.__studioLoftDisplay?.(0)) : null;
  if (triangular || screw) assert.ok(nativeDisplay?.kind === 'smooth-turn' && nativeDisplay.triangles > nativeDisplay.baseTriangles);
  if (polygonSides) await f.snapshot('approved-polygon-screw-native');
  f.phase = 'read STEP preparation and loss disclosure in Studio';
  await b('Export STEP').click();
  const panel = f.page.getByLabel('STEP export', { exact: true });
  await panel.getByLabel('STEP loss report', { exact: true }).waitFor();
  const report = await panel.innerText();
  assert.match(report, /STEP AP214 · B-rep geometry · mm/);
  assert.match(report, /feature history/i);
  assert.match(report, /semantic PMI or named datum system transfer/i);
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
  if (variant) oracle.push(variant);
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
  let worstRoundTripRailErrorMM = 0;
  for (const [i, body] of imported.entries()) {
    assert.ok(body.check.valid);
    assert.deepEqual(body.check.counts, before[i].check.counts);
    assert.deepEqual(body.faceNames, before[i].faceNames.map(name => loaded.nodes[0].id + '.' + name));
    assert.ok(Math.abs(body.volume - before[i].volume) < 1e-7);
    assert.ok(Math.abs(bodies[i].volume - body.volume) < 1e-7);
    if (polygonSides) {
      const distance = (a, b) => Math.hypot(...a.map((x, j) => x - b[j]));
      assert.equal(body.rails.length, polygonSides);
      assert.equal(before[i].rails.length, polygonSides);
      const matched = new Set();
      for (const rail of before[i].rails) {
        const index = body.rails.findIndex(samples => distance(rail[0], samples[0]) < 1e-8);
        assert.ok(index >= 0 && !matched.has(index));
        matched.add(index);
        for (const [j, point] of rail.entries()) {
          worstRoundTripRailErrorMM = Math.max(worstRoundTripRailErrorMM, distance(point, body.rails[index][j]));
        }
      }
      assert.ok(worstRoundTripRailErrorMM < 1e-8);
    }
  }
  assert.deepEqual(f.report.downloads, []);
  await b('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (await b('AO').getAttribute('aria-pressed') === 'true') await b('AO').click();
  const reopenedDisplay = triangular || screw ? await f.page.evaluate(() => window.__studioLoftDisplay?.(0)) : null;
  if (variant === '--triangle') assert.ok(reopenedDisplay?.kind === 'smooth-turn' && reopenedDisplay.triangles > reopenedDisplay.baseTriangles);
  const shownVertices = screw ? await f.page.evaluate(() => window.__studioSweepCylinderMesh?.()?.length / 3) : undefined;
  if (screw) assert.ok(shownVertices > 0);
  f.report.observations.push({ imported, noNativeFeatureHistory: true, nativeDisplay, reopenedDisplay, shownVertices,
    ...(polygonSides ? { worstRoundTripRailErrorMM } : {}) });
  await f.snapshot('approved-turn-step-reopened');
});
