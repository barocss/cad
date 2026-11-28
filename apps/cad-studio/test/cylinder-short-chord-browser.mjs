import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/cylinder-short-chord-browser.mjs',
  'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
];
const f = await createFlow({
  name: 'cylinder-short-chord', output: process.argv[2], envFrozen: 'CYLINDER_SHORT_CHORD_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Subtract a sphere from a cylinder with an existing short boundary shared with a cone.',
  limits: ['The reduced 20261023 case 131 on the original native analytic faces.'],
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify(outputs.map(output => ({
  report: checkBrep(output.brep, { strict: true }),
  mass: massPropertiesOf(output),
  digest: createHash('sha256').update(JSON.stringify(output.brep)).digest('hex'),
}))));
`,
});
const ref = node => ({ node, side: 'solid' });
const plane = { origin: [0, 0, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] };
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2 },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 8 },
    { id: 'n2', kind: 'translate', parent: ref(1), offset: [-2, 3, -3] },
    { id: 'n3', kind: 'sketch', profile: 'loop', segments: [[0, 0], [3, 0], [0, 2]].map(start => ({ kind: 'line', start })), plane },
    { id: 'n4', kind: 'revolve', sketch: 3, axis: 'y', angle: 360 },
    { id: 'n5', kind: 'rotate', parent: ref(4), axis: 'z', angle: 180 },
    { id: 'n6', kind: 'translate', parent: ref(5), offset: [-3, 1, 2] },
    { id: 'n7', kind: 'union', left: ref(2), right: ref(6) },
    { id: 'n8', kind: 'sketch', profile: 'loop', plane, segments: [
      { kind: 'line', start: [0, -3] }, { kind: 'arc', start: [0, 3], center: [0, 0], direction: 'cw' },
    ] },
    { id: 'n9', kind: 'revolve', sketch: 8, axis: 'y', angle: 360 },
    { id: 'n10', kind: 'rotate', parent: ref(9), axis: 'y', angle: 270 },
    { id: 'n11', kind: 'rotate', parent: ref(10), axis: 'y', angle: 90 },
    { id: 'n12', kind: 'translate', parent: ref(11), offset: [1, 1, -2] },
  ],
  outputs: { b7: ref(7), b12: ref(12) }, nextId: 13,
};
const filename = 'cylinder-short-chord.bcad', project = 'Cylinder chord in Difference';
const button = (name, owner = f.page) => owner.getByRole('button', { name, exact: true });
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 2e-6, `${actual} vs ${expected}`);
async function attachProject() {
  if (!(await versions().isVisible())) await button('Project and versions').click();
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}
async function verifyResult(doc, label) {
  const [native, ...rest] = await f.inspect(label, doc);
  assert.equal(rest.length, 0);
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  assert.equal(native.report.counts.bodies, 1);
  near(native.mass.volume, 105.31824275002164);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, native.mass.volume);
  return native;
}

await f.run(async () => {
  await f.newPage();
  await f.openFile({ name: filename, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stock)) }, stock.nodes.length);
  await f.same(stock);
  const incoming = await f.inspect('incoming', stock);
  assert.equal(incoming.length, 2);
  assert.ok(incoming.every(body => body.report.valid));
  near(incoming[0].mass.volume, 113.46767502997365);
  const rows = f.page.locator('.outliner .ol-row > button.ol');
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Shift'] });
  await frame();
  await clickModelCommand(f.page, 'Combine', 'Subtract');
  if (baseline) {
    await f.waitToast(/straight edge on a cylinder runs across its axis direction/);
    await f.same(stock);
    await f.page.locator('.toast').getByText('Details', { exact: true }).click();
    await f.snapshot('cylinder-chord-refusal');
    return;
  }
  await f.changed(stock);
  const result = await f.doc();
  assert.deepEqual(result.nodes.at(-1), { id: 'n13', kind: 'difference', parent: ref(7), tool: ref(12) });
  const native = await verifyResult(result, 'cylinder-chord-native');
  await frame();
  await f.snapshot('cylinder-chord-accepted');
  await f.undo();
  await f.same(stock);
  await f.redo();
  await f.same(result);
  await attachProject();
  await button('Save').click();
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(filename, { exact: true }).waitFor();
  await button('Close project', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await attachProject();
  await button('Open ' + filename, versions()).click();
  await f.same(result);
  assert.equal((await verifyResult(result, 'cylinder-chord-reopened-native')).digest, native.digest);
  await frame();
  await f.snapshot('cylinder-chord-reopened');
  assert.deepEqual(f.report.downloads, []);
  f.report.observations.push({ volume: native.mass.volume, strict: native.report.valid, digest: native.digest });
});
