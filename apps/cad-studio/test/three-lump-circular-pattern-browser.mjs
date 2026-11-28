import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/three-lump-circular-pattern-browser.mjs',
  'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad-model/src/app/bodyPatternCommands.ts',
  'packages/barocss-cad/src/part/part-transform.ts',
];
const f = await createFlow({
  name: 'three-lump-circular-pattern', output: process.argv[2], envFrozen: 'THREE_LUMP_PATTERN_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Check three circular copies that meet at a common box edge and preserve three separate sphere copies.',
  limits: ['A 5 × 4 × 2 mm box, a disjoint radius 2 mm sphere and a fused circular pattern around Z at 120 degree steps.'],
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
const { outputs } = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const [{ brep }] = outputs;
if (outputs.length !== 1) throw Error('Expected one native output');
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), mass: massPropertiesOf(outputs[0]),
  digest: createHash('sha256').update(JSON.stringify(brep)).digest('hex') }));
`,
});
const ref = node => ({ node, side: 'solid' });
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [5, 4] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 2 },
    { id: 'n2', kind: 'rotate', parent: ref(1), axis: 'x', angle: 90 },
    { id: 'n3', kind: 'translate', parent: ref(2), offset: [0, 0, -3] },
    { id: 'n4', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [0, -2] }, { kind: 'arc', start: [0, 2], center: [0, 0], direction: 'cw' },
    ], plane: { origin: [0, 0, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] } },
    { id: 'n5', kind: 'revolve', sketch: 4, axis: 'y', angle: 360 },
    { id: 'n6', kind: 'translate', parent: ref(5), offset: [20, 20, -1] },
  ],
  outputs: { b3: ref(3), b6: ref(6) }, nextId: 7,
};
const name = 'three-lump-pattern.bcad', project = 'Three touching circular copies';
const button = (name, owner = f.page) => owner.getByRole('button', { name, exact: true });
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);
async function attachProject() {
  if (!(await versions().isVisible())) await button('Project and versions').click();
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}
async function inspect(doc, pieces, label) {
  const native = await f.inspect(label, doc);
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.equal(native.check.counts.bodies, pieces);
  assert.ok(native.check.topology.every(body => body.shells === 1 && body.genus === 0));
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, native.mass.volume);
  return native;
}

await f.run(async () => {
  await f.newPage();
  await f.openFile({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stock)) }, stock.nodes.length);
  await f.same(stock);
  const rows = f.page.locator('.outliner .ol-row > button.ol');
  await rows.nth(0).click();
  await rows.nth(1).click({ modifiers: ['Shift'] });
  await clickModelCommand(f.page, 'Combine', 'Union');
  await f.changed(stock);
  const joined = await f.doc();
  near((await inspect(joined, 2, 'union-input')).mass.volume, 40 + 32 * Math.PI / 3);
  await frame();
  await rows.first().click();
  await clickModelCommand(f.page, 'Pattern', 'Circular pattern');
  const hud = f.page.getByRole('dialog', { name: 'Circular pattern', exact: true });
  assert.equal(await hud.getByLabel('Axis', { exact: true }).inputValue(), 'z');
  assert.equal(await hud.getByLabel('Result', { exact: true }).inputValue(), 'one');
  await hud.getByLabel('Count', { exact: true }).fill('3');
  await hud.getByLabel('Spread over', { exact: true }).fill('360');
  if (baseline) {
    const error = hud.locator('.hud-error');
    await error.getByText('Kernel detail', { exact: true }).click();
    assert.match(await error.textContent(), /has 6 uses/);
    assert.equal(await button('Apply', hud).isDisabled(), true);
    await f.same(joined);
    await f.snapshot('three-lump-pattern-refusal');
    return;
  }
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent.trim() === 'preview');
  await button('Apply', hud).click();
  await f.changed(joined);
  const pattern = await f.doc();
  assert.deepEqual(pattern.nodes.at(-1), {
    id: 'n8', kind: 'circular-pattern', parent: ref(7), axis: 'z', angle: 120, count: 3, span: 360,
  });
  const native = await inspect(pattern, 6, 'three-lump-pattern-native');
  near(native.mass.volume, 120 + 32 * Math.PI);
  native.mass.centroid.forEach((value, axis) => near(value, [0, 0, -1][axis]));
  await frame();
  await f.snapshot('three-lump-pattern-accepted');
  await f.undo();
  await f.same(joined);
  await f.redo();
  await f.same(pattern);
  await attachProject();
  await button('Save').click();
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(name, { exact: true }).waitFor();
  await button('Close project', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await attachProject();
  await button('Open ' + name, versions()).click();
  await f.same(pattern);
  assert.equal((await inspect(pattern, 6, 'three-lump-pattern-reopened-native')).digest, native.digest);
  await frame();
  await f.snapshot('three-lump-pattern-reopened');
  f.report.observations.push({ volume: native.mass.volume, centroid: native.mass.centroid, topology: native.check.topology });
  assert.deepEqual(f.report.downloads, []);
});
