import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const surface = {
  degreeU: 1, degreeV: 1, knotsU: [-2, -2, 6, 6], knotsV: [1, 1, 7, 7],
  controlPoints: [[[10, -6, 3], [16, 24, 11]], [[34, -6, 35], [34, 24, 35]]], weights: [[2, 2], [2, 2]],
};
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [
    { id: 'n0', kind: 'thicken', name: 'Tilted trapezoid', thickness: 4, side: 'both', mode: 'exact-planar', surface },
    { id: 'n1', kind: 'sketch', profile: 'rectangle', min: [20, 1], max: [27, 7] },
    { id: 'n2', kind: 'extrude', sketch: 1, from: -15, height: 70 },
  ],
  outputs: { b0: { node: 0, side: 'solid' }, b2: { node: 2, side: 'solid' } },
};
const pins = [
  'apps/cad-studio/test/exact-thicken-through-cut-browser.mjs', 'apps/cad-studio/test/model-rail-helper.mjs',
  'packages/barocss-cad-model/src/app/commands.ts', 'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad/src/part/part-model.ts', 'packages/barocss-cad/src/brep/thicken-planar.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts',
];
const f = await createFlow({
  name: 'exact-thicken-through-cut', output: process.argv[2], envFrozen: 'D1631_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Cut a tilted exact-planar Thicken solid with a vertical box, edit its thickness and reopen the native feature chain.',
  limits: ['One tilted trapezoid and one fully crossing rectangular cutter. Desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ key, brep }) => {
  const report = checkBrep(brep, { strict: true });
  const edges = new Map(brep.edges.map(e => [e.id, e])), coedges = new Map(brep.coedges.map(e => [e.id, e]));
  const loops = new Map(brep.loops.map(l => [l.id, l])), points = new Map(brep.vertices.map(v => [v.id, v.point]));
  const caps = brep.faces.filter(f => f.name === 'n0.normal' || f.name === 'n0.reverse').map(f => ({
    name: f.name,
    inner: f.loops.map(id => loops.get(id)).filter(loop => loop.kind === 'inner').map(loop => loop.coedges.map(id => {
      const coedge = coedges.get(id), edge = edges.get(coedge.edge);
      return points.get(edge.vertices[coedge.sense === 'forward' ? 0 : 1]);
    })),
  }));
  return { key, valid: report.valid, genus: report.topology[0]?.genus, counts: report.counts, family: brep.source.family,
    names: brep.faces.map(f => f.name).sort(), caps, volume: brepMassProperties(brep, 1).volume, digest: digestOf(brep) };
})));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-8, `${value} != ${expected}`);
const outerFaces = ['normal', 'reverse', 'u-max', 'u-min', 'v-max', 'v-min'].map(name => 'n0.' + name);

async function check(label, doc, t) {
  assert.deepEqual(doc.nodes.slice(0, 3), [{ ...seed.nodes[0], thickness: t }, ...seed.nodes.slice(1)]);
  assert.deepEqual(doc.nodes[3], { id: 'n3', kind: 'difference', parent: { node: 0, side: 'solid' }, tool: { node: 2, side: 'solid' } });
  assert.deepEqual(doc.outputs, { b3: { node: 3, side: 'solid' } });
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const [part] = rows;
  assert.deepEqual([part.key, part.valid, part.genus, part.counts.faces, part.counts.vertices], ['b3', true, 1, 10, 16]);
  assert.ok(outerFaces.every(name => part.names.includes(name)));
  assert.deepEqual(part.names.filter(name => !outerFaces.includes(name)), ['n2.side0', 'n2.side1', 'n2.side2', 'n2.side3']);
  const measured = (1050 - 42 / .6) * t;
  close(part.volume, measured);
  const [{ volume }] = (await f.bodies()).bodies;
  close(volume, measured);
  assert.equal(part.caps.length, 2);
  for (const cap of part.caps) {
    const distance = cap.name === 'n0.normal' ? t / 2 : -t / 2;
    assert.equal(cap.inner.length, 1);
    assert.equal(cap.inner[0].length, 4);
    for (const x of [20, 27]) for (const y of [1, 7]) {
      const z = (-6.2 + .8 * x + distance) / .6;
      const hits = cap.inner[0].filter(p => Math.hypot(p[0] - x, p[1] - y, p[2] - z) < 1e-8);
      assert.equal(hits.length, 1, `${cap.name}: [${x}, ${y}, ${z}]`);
    }
  }
  return part;
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const file = join(f.output, 'thicken-and-cutter.bcad');
  await writeFile(file, JSON.stringify(seed));
  await f.freshOpen(file, seed, '01-input');
  await button('Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const bodies = f.page.locator('.outliner .ol-row > button.ol');
  assert.equal(await bodies.count(), 2);
  await bodies.filter({ hasText: 'Tilted trapezoid' }).click();
  await bodies.nth(1).click({ modifiers: ['Shift'] });
  await f.snapshot('02-ordered-cut-operands');

  f.phase = 'Subtract the vertical box from the inclined Thicken plate';
  await clickModelCommand(f.page, 'Combine', 'Subtract');
  await f.changed(seed);
  const cut = await f.doc(), first = await check('04-cut-native', cut, 4);
  await f.snapshot('03-through-cut');

  f.phase = 'Change thickness and retain the two Boolean operands and native face names';
  await f.openFeatureEditor(0, 'source exact-planar Thicken');
  const thickness = f.editor().getByLabel('Thickness', { exact: true });
  assert.equal(await thickness.inputValue(), '4');
  await thickness.fill('6');
  await f.applyEditor(cut, '05-thickness-edited');
  const edited = await f.doc(), second = await check('06-edited-native', edited, 6);
  assert.deepEqual(second.names, first.names);
  const saved = await f.save('through-cut');
  await f.freshOpen(saved.file, edited, '07-fresh-open');
  assert.deepEqual(await check('08-reopened-native', await f.doc(), 6), second);
  await button('Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('09-reopened-through-cut');
  f.report.observations.push({ thicknesses: [4, 6], volumes: [first.volume, second.volume], families: [first.family, second.family],
    genus: second.genus, names: second.names, digest: second.digest });
});
