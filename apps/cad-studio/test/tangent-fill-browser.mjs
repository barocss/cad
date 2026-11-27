import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const f = await createFlow({
  name: 'tangent-fill', envFrozen: 'TANGENT_FILL_FROZEN', output: process.argv[2],
  qualification: '#751 desktop Direct Tangent Fill with one exact native G1 seam',
  limits: ['One bilinear planar donor, four exact polynomial boundary curves and one G1 seam. No trimming, sewing or solid generation.'],
  initialFiles: ['apps/cad-studio/test/tangent-fill-browser.mjs'],
  requiredFrozen: [
    'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/useDirectFill.ts', 'apps/cad-studio/src/ui/DirectFillPanel.tsx',
    'packages/barocss-cad-model/src/engine/direct.ts', 'packages/barocss-cad-model/src/engine/planarTangentFill.ts',
  ],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { geometryOf } from '@barocss/cad-model/engine/direct';
import { surfaceD1Evaluator, evaluateSurface } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const geometry = name => geometryOf(doc.direct, doc.direct.objects.find(o => o.name === name));
const donor = geometry('Donor'), filled = geometry(JSON.parse(process.argv[3]));
const seam = surfaceD1Evaluator(filled), original = surfaceD1Evaluator(donor);
const angle = ({ du, dv }) => {
  const cross = [du[1]*dv[2]-du[2]*dv[1],du[2]*dv[0]-du[0]*dv[2],du[0]*dv[1]-du[1]*dv[0]];
  return Math.atan2(Math.hypot(cross[0], cross[1]), Math.abs(cross[2])) * 180 / Math.PI;
};
const distances = [], angles = [], donorAngles = [], jacobians = [];
for (let u = 0; u <= 20; u++) for (let v = 0; v <= 20; v++) {
  const { du, dv } = seam(u / 20, v / 20);
  jacobians.push(du[0]*dv[1]-du[1]*dv[0]);
}
for (let i = 0; i <= 32; i++) {
  const t = i / 32;
  const exact = [[30*t,0,0],[30*t,24,32*t*(1-t)],[0,24*t,0],[30,24*t,0]];
  const got = [[t,0],[t,1],[0,t],[1,t]].map(([u,v]) => evaluateSurface(filled,u,v));
  got.forEach((p, j) => distances.push(Math.hypot(...p.map((x,k) => x-exact[j][k]))));
  angles.push(angle(seam(t,0)));
  donorAngles.push(angle(original(t,1)));
}
console.log(JSON.stringify({ maxBoundaryError: Math.max(...distances), maxNormalAngle: Math.max(...angles), maxDonorAngle: Math.max(...donorAngles),
  minProjectedJacobian: Math.min(...jacobians), degree: [filled.degreeU, filled.degreeV], controls: filled.controlPoints }));
`,
});
const clamp = p => [...Array(p + 1).fill(0), ...Array(p + 1).fill(1)];
const curves = {
  Seam: [[0, 0, 0], [15, 0, 0], [30, 0, 0]],
  Right: [[30, 0, 0], [30, 8, 0], [30, 16, 0], [30, 24, 0]],
  Crown: [[0, 24, 0], [15, 24, 16], [30, 24, 0]],
  Left: [[0, 0, 0], [0, 8, 0], [0, 16, 0], [0, 24, 0]],
};
const sources = Object.fromEntries(Object.entries(curves).map(([id, poles]) => [id, `@model fixture { version:0; length-unit:mm;
  @curve #shape { type:nurbs; degree:${poles.length-1}; knots:${JSON.stringify(clamp(poles.length-1))};
  control-points:${JSON.stringify(poles)}; weights:${JSON.stringify(poles.map(() => 1))}; } }`]));
sources.Donor = '@model fixture { version:0; length-unit:mm; @surface #shape { type:nurbs; degree-u:1; degree-v:1; knots-u:[0,0,1,1]; knots-v:[0,0,1,1]; control-points:[[[0,-24,0],[0,0,0]],[[30,-24,0],[30,0,0]]]; weights:[[1,1],[1,1]]; } }';
const doc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: { sources, objects: Object.keys(sources).map(id => ({ id, name: id, geometry: 'shape', source: id })) } };
await f.run(async () => {
  await f.newPage();
  f.phase = 'Open four-boundary case and original planar donor';
  await f.openFile({ name: 'fill-baseline.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }, 0);
  await f.same(doc);
  await f.page.getByRole('button', { name: 'Iso', exact: true }).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const row = name => f.page.locator('.outliner .ol.direct').getByText(name, { exact: true });
  const choose = async names => {
    await row(names[0]).click();
    for (const name of names.slice(1)) await row(name).click({ modifiers: ['Shift'] });
  };
  const basePicks = ['Seam', 'Right', 'Crown', 'Left'];
  await choose(basePicks);
  await f.page.getByRole('button', { name: 'Fill the loop', exact: true }).click();
  await f.changed(doc);
  const filled = await f.doc(), numbers = await f.inspect('g0-oracle', filled, 'Filled surface');
  assert.deepEqual(filled.direct.objects.slice(0, -1), doc.direct.objects);
  assert.ok(numbers.maxBoundaryError < 1e-12);
  assert.equal(numbers.maxDonorAngle, 0);
  assert.ok(Math.abs(numbers.maxNormalAngle - 180 / Math.PI * Math.atan(1 / 3)) < 1e-12);
  f.report.observations.push({ mode: 'G0', ...numbers });
  await f.snapshot('01-existing-g0-fill');

  await f.undo();
  await f.same(doc);

  f.phase = 'Choose original donor and reject the wrong seam';
  await choose(['Donor', 'Left', 'Crown', 'Right', 'Seam']);
  const button = name => f.page.getByRole('button', { name, exact: true });
  const panel = () => f.page.getByRole('complementary', { name: 'Tangent Fill', exact: true });
  const apply = () => panel().getByRole('button', { name: 'Apply', exact: true });
  const seam = () => panel().getByLabel('G1 seam');
  const history = async () => [await button('Undo').isEnabled(), await button('Redo').isEnabled()];
  const before = await history();
  await button('Tangent Fill').click();
  assert.equal(await apply().isEnabled(), false);
  assert.match(await panel().innerText(), /Adjacent surface\s+Donor/);
  await seam().selectOption('Crown');
  assert.match(await panel().getByRole('alert').innerText(), /seam|boundary|edge/i);
  assert.equal(await apply().isEnabled(), false);
  await f.same(doc);
  assert.deepEqual(await history(), before);
  await f.snapshot('02-wrong-boundary-refusal');

  f.phase = 'Preview, cancel and apply Tangent Fill';
  await seam().selectOption('Seam');
  assert.equal(await apply().isEnabled(), true);
  await f.same(doc);
  assert.deepEqual(await history(), before);
  const hit = await f.page.evaluate(() => window.__studioDirectAt([15, 12, 3]));
  assert.equal(hit, null, 'preview is not a selectable Direct object');
  await f.snapshot('03-g1-preview');
  await panel().getByRole('button', { name: 'Cancel' }).click();
  await panel().waitFor({ state: 'hidden' });
  await f.same(doc);
  assert.deepEqual(await history(), before);
  await button('Tangent Fill').click();
  await seam().selectOption('Seam');
  await apply().click();
  await f.changed(doc);
  const accepted = await f.doc(), { direct, ...part } = accepted;
  const { direct: original, ...unchanged } = doc;
  assert.deepEqual(part, unchanged);
  assert.equal(direct.objects.length, original.objects.length + 1);
  assert.deepEqual(direct.objects.slice(0, -1), original.objects);
  for (const [key, text] of Object.entries(original.sources)) assert.equal(direct.sources[key], text);
  const g1 = await f.inspect('g1-oracle', accepted, 'Tangent Fill');
  assert.deepEqual(g1.degree, [2, 3]);
  assert.ok(g1.maxBoundaryError < 1e-12, 'all four authored boundaries remain in place');
  assert.ok(g1.maxNormalAngle < 1e-10, 'whole sampled seam normal matches the XY donor');
  assert.ok(Math.abs(g1.minProjectedJacobian - 720) < 1e-9, 'the analytic fixture remains regular');
  const [x, y] = numbers.controls[1][1];
  assert.deepEqual(g1.controls[1][1], [x, y, 0], 'the interior pole changes only along the donor normal');
  await f.snapshot('04-g1-applied');
  await f.undo();
  await f.same(doc);
  await f.redo();
  await f.same(accepted);
  assert.deepEqual(await f.inspect('g1-redo', await f.doc(), 'Tangent Fill'), g1);
  const saved = await f.save('tangent-fill');
  await f.freshOpen(saved.file, accepted, '05-g1-fresh-open');
  assert.deepEqual(await f.inspect('g1-reopened', await f.doc(), 'Tangent Fill'), g1);
  f.report.observations.push({ mode: 'G1', ...g1 });
});
