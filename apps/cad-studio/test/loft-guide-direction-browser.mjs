import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = ['apps/cad-studio/test/loft-guide-direction-browser.mjs', 'apps/cad-studio/src/ui/Hud.tsx',
  'apps/cad-studio/src/app/loftGuideFeedback.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad/src/features/loft-nurbs-guide.ts'];
const f = await createFlow({
  name: 'loft-guide-direction', envFrozen: 'D1286_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Refuse invalid guide directions and heights, then reverse the same source in Studio and save the corrected Loft.',
  limits: ['Two 1 × 1 mm rectangular XY sections at Z=18 and Z=20, with native polynomial Direct guide inputs.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { toPartDocument } from '@barocss/cad-model/engine/part';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [out] = evaluateCadPart(toPartDocument(doc)).outputs;
console.log(JSON.stringify({ geometry: checkBrep(out.brep, { strict: true }), mass: massPropertiesOf(out) }));
`,
});
const arcPoints = [[30, 2, 20], [30.125, 1.5, 19.5], [30.1875, 1, 19], [30.125, 0.5, 18.5], [30, 0, 18]];
const levelPoints = [[30, 0, 18], [30.125, 0.5, 18], [30.1875, 1, 19], [30.125, 1.5, 19.5], [30, 2, 20]];
const cubicKnots = [0, 0, 0, 0, 0.5, 1, 1, 1, 1], quarticKnots = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];
const source = (name, controls, knots, degree) => `@model ${name} { version: 0; length-unit: mm;
  @curve #curve { type: nurbs; degree: ${degree}; knots: ${JSON.stringify(knots)}; control-points: ${JSON.stringify(controls)}; weights: [1,1,1,1,1]; }
}`;
const section = (id, y, z) => ({ id, kind: 'sketch', profile: 'rectangle', min: [30, y], max: [31, y + 1],
  plane: { origin: [0, 0, z], normal: [0, 0, 1], xAxis: [1, 0, 0] },
});
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [section('n0', 0, 18), section('n1', 2, 20)], outputs: {},
  direct: {
    sources: { down: source('down', arcPoints, cubicKnots, 3), level: source('level', levelPoints, quarticKnots, 4) },
    objects: [
      { id: 'down', name: 'Downward guide', source: 'down', geometry: 'curve' },
      { id: 'level', name: 'Flat control height', source: 'level', geometry: 'curve' },
    ],
  },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Loft', exact: true });
const picker = () => hud().getByLabel('Guide (copied)', { exact: true });
const status = text => hud().locator('.status').filter({ hasText: text }).waitFor();
const start = async () => {
  await button('Sketch 1').click();
  await button('Sketch 2').click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft');
  await status(/^preview$/);
};

async function refuse(value, message, label) {
  await picker().selectOption(value);
  await status(/^refused$/);
  const notice = hud().getByRole('status');
  await notice.getByText(message, { exact: true }).waitFor();
  assert.equal(await notice.count(), 1);
  assert.equal(await picker().getAttribute('aria-invalid'), 'true');
  assert.equal(await picker().getAttribute('aria-describedby'), await notice.getAttribute('id'));
  const name = await picker().locator('option:checked').textContent();
  assert.equal(await hud().getByText(name, { exact: true }).count(), 1);
  assert.equal(await button('Apply', hud()).isEnabled(), false);
  assert.equal(await hud().locator('.hud-error-feature, details').count(), 0);
  await f.same(seed);
  await f.snapshot(label);
}

async function verify(doc, label) {
  const actual = await f.inspect(label, doc);
  assert.equal(actual.geometry.valid, true);
  assert.equal(actual.geometry.counts.bodies, 1);
  assert.ok(Math.abs(actual.mass.volume - 2) < 1e-8);
  assert.ok(Math.abs((await f.bodies()).bodies[0].volume - 2) < 1e-8);
  f.report.observations.push({ label, volume: actual.mass.volume, topology: actual.geometry.counts });
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'loft-guide-direction.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await start();
  f.phase = 'Refuse the downward guide at its input';
  await refuse('down', 'This curve runs toward the lower section. Reverse it in Direct geometry or choose another guide.', 'downward-refusal');
  f.phase = 'Refuse the non-rising guide at the same input';
  await refuse('level', 'Choose another guide. Each control point must be higher than the previous one along the section normal.', 'height-refusal');

  f.phase = 'Reverse the original guide through Direct geometry and build';
  await button('Cancel', hud()).click();
  await button('Downward guide').click();
  await button('Reverse', f.page.getByRole('complementary', { name: 'Direct geometry' })).click();
  await f.changed(seed);
  const reversed = await f.doc();
  assert.deepEqual(reversed.nodes, seed.nodes);
  await start();
  await picker().selectOption({ label: 'Downward guide · reversed' });
  await status(/^preview$/);
  assert.equal(await picker().getAttribute('aria-invalid'), null);
  assert.equal(await hud().getByRole('status').count(), 0);
  await f.same(reversed);
  await f.snapshot('corrected-preview');
  await button('Apply', hud()).click();
  await f.changed(reversed);
  const accepted = await f.doc();
  assert.deepEqual(accepted.nodes.at(-1).from, [0, 1]);
  assert.deepEqual(accepted.nodes.at(-1).guide.controlPoints, [...arcPoints].reverse());
  await verify(accepted, 'accepted');
  await f.undo();
  await f.same(reversed);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('loft-guide-direction');
  await f.freshOpen(saved.file, accepted, 'reopened');
  await verify(accepted, 'reopened');
});
