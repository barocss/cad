import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/loft-collapsed-span-browser.mjs', 'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/app/failedFeature.ts', 'apps/cad-studio/src/app/loftGuideFeedback.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts', 'packages/barocss-cad/src/features/loft.ts',
];
const f = await createFlow({
  name: 'loft-collapsed-span',
  output: process.argv[2],
  envFrozen: 'LOFT_COLLAPSE_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Refuse a rectangular span whose guide pairs all four ruling midpoints to one point.',
  limits: ['Desktop Studio. A copied NURBS guide and two rectangular parallel sections.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const midpoints = brep.edges.filter(edge => edge.id.startsWith('l0_')).map(edge => {
  const [start, end] = curveDomain(edge.curve);
  return evaluateCurve(edge.curve, (start + end) / 2);
});
console.log(JSON.stringify({
  digest: digestOf(brep), volume: brepMassProperties(brep, 1).volume,
  valid: checkBrep(brep, { strict: true }).valid, closed: brep.shells.length === 1 && brep.shells[0].closed,
  count: brep.bodies.length, kind: brep.bodies[0].kind, midpoints,
}));
`,
});

const baseline = process.argv.includes('--baseline');
const corner = [-5, -3], opposite = [5, 3], centre = [13, -8], height = 10;
const lower = [centre[0] + corner[0], centre[1] + corner[1], 0];

function fixture(angle) {
  const [cosine, sine] = angle === Math.PI ? [-1, 0] : [Math.cos(angle), Math.sin(angle)];
  const upper = [centre[0] + cosine * corner[0] - sine * corner[1], centre[1] + sine * corner[0] + cosine * corner[1], height];
  const guide = (point) => `@model guide { version: 0; length-unit: mm;
    @curve #rail { type: nurbs; degree: 1; knots: [0,0,1,1];
    control-points: ${JSON.stringify([lower, point])}; weights: [1,1]; } }`;
  return {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: 2,
    nodes: [[1, 0], [cosine, sine]].map(([x, y], index) => ({
      id: `n${index}`, kind: 'sketch', profile: 'rectangle', min: corner, max: opposite,
      plane: { origin: [...centre, index * height], normal: [0, 0, 1], xAxis: [x, y, 0] },
    })),
    direct: {
      sources: { turning: guide(upper), straight: guide([...lower.slice(0, 2), height]) },
      objects: [
        { id: 'turning', name: 'Turning rail', source: 'turning', geometry: 'rail' },
        { id: 'straight', name: 'Straight rail', source: 'straight', geometry: 'rail' },
      ],
    },
  };
}

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Loft', exact: true });
const status = (mode) => hud().locator('.status').filter({ hasText: new RegExp(`^${mode}$`) });
const guidePicker = (scope) => scope.getByLabel('Guide (copied)', { exact: true });
const difference = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));

async function open(doc, label) {
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: `${label}.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
}

async function draft() {
  await button('Sketch 1').click();
  await button('Sketch 2').click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Loft');
}

async function create(previous, guide) {
  await guidePicker(hud()).selectOption({ label: guide });
  await status('preview').waitFor();
  await button('Apply', hud()).click();
  await f.changed(previous);
  return f.doc();
}

async function native(label, doc, valid, volume) {
  const result = await f.inspect(label, doc);
  assert.deepEqual([result.valid, result.closed, result.count, result.kind], [valid, true, 1, 'solid']);
  assert.ok(Math.abs(result.volume - volume) < 1e-7, JSON.stringify(result));
  assert.equal(result.midpoints.length, 4);
  f.report.observations.push({ label, ...result });
  return result;
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const openContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await openContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const source = fixture(Math.PI);
  await open(source, 'half-turn-sections');
  await draft();

  f.phase = 'check the exact half-turn guide while creating a Loft';
  if (baseline) {
    const bad = await create(source, 'Turning rail');
    const result = await native('invalid-created-loft', bad, false, 200);
    assert.ok(result.midpoints.every(point => difference(point, [...centre, height / 2]) < 1e-9));
    await f.snapshot('baseline-invalid-created');
    await f.undo();
    await f.same(source);
    await draft();
  } else {
    await guidePicker(hud()).selectOption({ label: 'Turning rail' });
    await status('refused').waitFor();
    await hud().getByText('The Loft guide collapses a span', { exact: true }).waitFor();
    assert.equal(await button('Apply', hud()).isDisabled(), true);
    await f.page.evaluate(() => document.activeElement?.blur());
    await f.page.keyboard.press('Enter');
    await f.same(source);
    await f.snapshot('half-turn-refused-create');
  }

  const good = await create(source, 'Straight rail');
  const original = await native('valid-straight-loft', good, true, 600);
  f.phase = 'check the same exact half-turn guide in History';
  await f.openFeatureEditor(good.nodes.length - 1, 'valid straight Loft');
  await guidePicker(f.editor()).selectOption({ label: 'Turning rail' });
  if (baseline) {
    const bad = (await f.applyEditor(good, 'baseline-invalid-history')).doc;
    assert.equal((await native('invalid-history-loft', bad, false, 200)).midpoints.length, 4);
    return;
  }

  await button('Apply', f.editor()).click();
  await f.editor().getByText('The Loft guide collapses a span', { exact: true }).waitFor();
  await f.same(good);
  await f.snapshot('half-turn-refused-history');
  await f.closeEditor();
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(good);
  const saved = await f.save('valid-straight-loft');
  await f.freshOpen(saved.file, good, 'half-turn-valid-reopened');
  assert.equal((await native('valid-straight-reopened-native', good, true, 600)).digest, original.digest);

  f.phase = 'verify a valid 179-degree span';
  const angle = 179 * Math.PI / 180;
  const nearby = fixture(angle);
  await open(nearby, 'near-half-turn-sections');
  await draft();
  const accepted = await create(nearby, 'Turning rail');
  const expected = 600 * (2 + Math.cos(angle)) / 3;
  const result = await native('near-half-turn-native', accepted, true, expected);
  const distances = result.midpoints.flatMap((point, index) => result.midpoints.slice(index + 1).map(other => difference(point, other)));
  assert.ok(Math.abs(Math.min(...distances) - 6 * Math.cos(angle / 2)) < 1e-8);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('near-half-turn-valid');
});
