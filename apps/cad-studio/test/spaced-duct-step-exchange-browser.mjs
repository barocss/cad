import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

assert.ok(process.argv[3], 'Provide the accepted D1739 X2 inlet trim as a .bcad file.');
const source = resolve(process.argv[3]);
const doc = JSON.parse(await readFile(source, 'utf8'));
const name = 'trimmed-spaced-duct';
const pins = [
  'apps/cad-studio/test/spaced-duct-step-exchange-browser.mjs', 'apps/cad-studio/src/files/StepExportPanel.tsx',
  'apps/cad-studio/src/files/importedFile.ts', 'apps/cad-studio/src/engine/engine.worker.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts', 'packages/barocss-cad/src/io/step.ts',
];
const f = await createFlow({
  name: 'spaced-duct-step-exchange', output: process.argv[2], envFrozen: 'D1742_SOURCE_FROZEN',
  initialFiles: [...pins, source], requiredFrozen: pins,
  qualification: 'Preview STEP losses and fresh-open the X2 trimmed S-bend from the native writer.',
  limits: ['The writer creates a local sample. The Studio Export download and external readers are NOT_RUN.'],
  inspectorSource: `
import { readFileSync, writeFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry, importStep, measureBrepEdgeContinuity } from '@barocss/cad';
import { exportStudioStep, partBreps } from '@barocss/cad-model/engine/evaluate';
const { doc, name, file } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [original] = partBreps(doc);
const { text, omitted, scope } = exportStudioStep(doc, { name, meshes: 'auto' });
writeFileSync(file, text);

function measure(brep) {
  const check = checkBrep(brep, { strict: true });
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const sample = edge => {
    const [a, b] = curveDomain(edge.curve);
    return [0, .25, .5, .75, 1].map(t => evaluateCurve(edge.curve, a + t * (b - a)));
  };
  const caps = brep.faces.flatMap(face => {
    const plane = faceGeometry(face);
    if (plane.kind !== 'plane' || Math.abs(plane.n[0]) < .999999 || face.loops.length !== 2) return [];
    return [{ plane, boundaries: face.loops.map(id => {
      const loop = loops.get(id);
      return { kind: loop.kind, edges: loop.coedges.map(id => sample(edges.get(uses.get(id).edge))) };
    }) }];
  });
  const joints = [12, 20].map(y => brep.edges.filter(edge => {
    const p = sample(edge);
    return p.every(v => Math.abs(v[1] - y) < 1e-7 && Math.abs(v[0] - p[0][0]) < 1e-7);
  }).map(edge => {
    const result = measureBrepEdgeContinuity(brep, edge.id);
    return result.status === 'measured' ? { angle: result.maximumAngleDegrees } : { reason: result.reason };
  }));
  return { check, caps, joints, volume: brepMassProperties(brep, 1).volume };
}

const before = measure(original.brep);
let after, readError;
try { after = measure(importStep(text)); }
catch (error) { readError = error instanceof Error ? error.message : String(error); }
console.log(JSON.stringify({ before, after, readError, omitted, scope,
  millimetres: /SI_UNIT\\(\\.MILLI\\.,\\.METRE\\.\\)/.test(text),
  solidRecords: [...text.matchAll(/= *MANIFOLD_SOLID_BREP\\s*\\(/g)].length,
  faces: [...text.matchAll(/= *ADVANCED_FACE\\s*\\(/g)].length }));
`,
});

const button = (label, scope = f.page) => scope.getByRole('button', { name: label, exact: true });
const near = (value, expected, tolerance = 1e-6) => assert.ok(Math.abs(value - expected) <= tolerance,
  JSON.stringify({ value, expected, tolerance }));
const inset = 2;
const integral = r => (r ** 2 * Math.asin(inset / r) + inset * Math.sqrt(r ** 2 - inset ** 2)) / 2;
const expectedVolume = 16 * (15 * Math.PI + 8) - (6 * (integral(14) - integral(10)) - 4 * (integral(13) - integral(11)));
const intercept = radius => 12 - Math.sqrt(radius ** 2 - inset ** 2);

function verifyNative(native) {
  assert.equal(native.check.valid, true, native.check.issues.join('\n'));
  assert.equal(native.check.counts.bodies, 1);
  assert.equal(native.check.topology[0].genus, 1);
  assert.equal(native.check.counts.faces, 18);
  assert.equal(native.caps.length, 2);
  near(native.volume, expectedVolume);
  for (const { x, sign, trim } of [{ x: inset, sign: -1, trim: true }, { x: 30, sign: 1, trim: false }]) {
    const cap = native.caps.find(item => Math.abs(item.plane.o[0] - x) < 1e-6);
    assert.ok(cap, 'missing rectangular end at X=' + x);
    near(cap.plane.n[0], sign);
    assert.deepEqual(cap.boundaries.map(loop => loop.kind).sort(), ['inner', 'outer']);
    for (const loop of cap.boundaries) {
      const inner = loop.kind === 'inner';
      const y = trim ? (inner ? [intercept(13), intercept(11)] : [intercept(14), intercept(10)])
        : inner ? [37, 39] : [36, 40];
      const z = inner ? 2 : 3;
      assert.equal(loop.edges.length, 4);
      const points = loop.edges.flat();
      for (const point of points) near(point[0], x);
      near(Math.min(...points.map(point => point[1])), y[0]);
      near(Math.max(...points.map(point => point[1])), y[1]);
      near(Math.min(...points.map(point => point[2])), -z);
      near(Math.max(...points.map(point => point[2])), z);
    }
  }
}

async function observeMouth(view, x, y, sign, label) {
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: view, exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.page.waitForFunction(view => {
    const captions = [...document.querySelectorAll('.view-cube .vc-label')];
    return captions.length === 1 && captions[0].textContent === view;
  }, view.toUpperCase());
  const hit = await f.page.evaluate(([x, y]) => ({
    opening: window.__studioSurfacePoint([x, y, 0]), land: window.__studioSurfacePoint([x, y, 2.5]),
  }), [x, y]);
  assert.ok(hit.land);
  near(hit.land[0], x, 1e-4);
  assert.ok(!hit.opening || sign * (x - hit.opening[0]) > .5, JSON.stringify(hit));
  f.report.observations.push({ label, x, ...hit });
  await f.snapshot(label);
}

await f.run(async () => {
  assert.equal(doc.parameters.InletTrim, inset);
  await f.freshOpen(source, doc, '01-native-trimmed-duct');
  f.phase = 'Prepare STEP in Studio and read loss disclosure';
  await button('Export STEP').click();
  const panel = f.page.getByRole('region', { name: 'STEP export', exact: true });
  await panel.getByLabel('STEP included bodies').waitFor();
  assert.match(await panel.getByLabel('STEP included bodies').innerText(), /1 output bodies: 1 root bodies/);
  const losses = await panel.getByLabel('STEP loss report').innerText();
  assert.match(losses, /Native feature history is not included/);
  assert.match(losses, /Native parameters and expressions are not included/);
  assert.match(await panel.getByLabel('STEP continuity inspection').innerText(), /native face parameter curves are not retained/);
  assert.ok(await button('Export', panel).isEnabled());
  await f.same(doc);
  await f.snapshot('02-step-preview-and-losses');
  await button('Close STEP export', panel).click();
  await panel.waitFor({ state: 'hidden' });

  f.phase = 'Write the STEP with the Studio worker exporter and independently check the section';
  const file = join(f.output, name + '.step');
  const read = await f.inspect('writer-and-self-read', { doc, file, name });
  verifyNative(read.before);
  assert.ok(read.millimetres);
  assert.equal(read.scope.nativeBodies, 1);
  assert.equal(read.solidRecords, 1);
  assert.equal(read.faces, 18);
  assert.deepEqual(read.before.joints.map(edges => edges.length), [4, 4]);
  for (const joint of read.before.joints.flat()) near(joint.angle, 0, 1e-6);

  f.phase = 'Open the generated STEP in a fresh desktop Studio';
  await f.newPage();
  const bytes = await readFile(file);
  await f.page.setInputFiles('input[aria-label="Model file"]', file);
  await f.waitToast(/STEP opened.*1 solid.*millimetres/s, 60000);
  await f.page.waitForFunction(text => window.__studioDoc?.nodes.length === 1 && window.__studioDoc.nodes[0].step === text,
    bytes.toString('utf8'));
  await f.ready();
  const authored = await f.doc();
  assert.equal(authored.nodes[0].kind, 'import');
  assert.equal(Object.keys(authored.parameters).length, 0);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, expectedVolume);
  assert.ok(read.after, read.readError);
  verifyNative(read.after);
  assert.deepEqual(read.after.joints.map(edges => edges.length), [4, 4]);
  assert.ok(read.after.joints.flat().every(joint => joint.reason === 'missing-pcurve'));
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('03-step-fresh-open');
  await observeMouth('Left', inset, (intercept(13) + intercept(11)) / 2, -1, '04-reopened-inlet');
  await observeMouth('Right', 30, 38, 1, '05-reopened-outlet');
  f.report.observations.push({ sha256: sha256(bytes), losses, expectedVolume, studioVolume: bodies[0].volume,
    nativeVolume: read.after.volume, importedContinuity: read.after.joints });
  assert.deepEqual(f.report.downloads, []);
});
