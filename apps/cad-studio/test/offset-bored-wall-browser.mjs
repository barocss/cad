import assert from 'node:assert/strict';
import { copyFile, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const [output, input, view = 'Right'] = process.argv.slice(2), app = resolve(import.meta.dirname, '..');
assert.ok(output && input && isAbsolute(output) && relative(resolve(app, '../..'), output).startsWith('../'));
const walls = {
  Right: ['n1.side1', 0, 1, 40],
  Left: ['n1.side3', 0, -1, 0],
  Front: ['n1.side0', 1, -1, 0],
  Back: ['n1.side2', 1, 1, 30],
};
assert.ok(Object.hasOwn(walls, view));
const [faceName, axis, sign, station] = walls[view];
const bytes = await readFile(input), source = JSON.parse(bytes);
const replacement = source.nodes.at(-1), tilt = replacement.kind === 'replace-face';
const capSign = replacement.faces?.[0] === 'n1.bottom' ? -1 : 1;
const fixed = capSign === 1 ? 0 : 10;
const capHeight = (x, y) => fixed + capSign * (8 + x / 10 + y / 5);
const sourceKey = 'b' + (source.nodes.length - 1), resultKey = 'b' + source.nodes.length;
const donorKey = tilt ? 'b' + replacement.target.body.node : undefined;
const bores = source.nodes.filter(node => node.kind === 'hole').map(({ center, radius }) =>
  ({ center, radius, volume: 10 * Math.PI * radius ** 2 }));
assert.ok(bores.length === 1 || bores.length === 2);
assert.ok(!tilt || (view === 'Right' && bores.length === 1 && ['n1.top', 'n1.bottom'].includes(replacement.faces[0])));
const contact = Math.max(...bores.map(({ center, radius }) => sign * (center[axis] - station) + radius));
const positive = 5, negative = -4, centre = [20, 15, 5], normal = [0, 0, 0];
centre[axis] = station;
normal[axis] = sign;
const removedVolume = bores.reduce((sum, bore) => sum + bore.volume, 0);
const volumeAt = distance => {
  if (!tilt) return 12000 + distance * (axis === 0 ? 300 : 400) - removedVolume;
  const width = 40 + distance;
  return 30 * width * (11 + width / 20) - 98.1 * Math.PI;
};
const pins = [
  'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/test/offset-bored-wall-browser.mjs',
  'packages/barocss-cad-model/src/app/nativeOffsetFace.ts', 'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/offsetFaceEdit.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/bored-cap-offset.ts', 'packages/barocss-cad/src/brep/cylindrical-bore.ts',
  'packages/barocss-cad/src/part/part-model.ts',
];
const f = await createFlow({
  name: 'offset-bored-wall', envFrozen: 'BORED_WALL_OFFSET_FROZEN', output, initialFiles: pins, requiredFrozen: pins,
  qualification: `Move the ${view.toLowerCase()} exterior wall and retain all ${bores.length} through bore(s).`,
  limits: [tilt ? 'One rectangular plate with a 40 × 30 mm footprint, one tilted cap, and one straight circular bore.'
    : `One 40 × 30 × 10 mm flat rectangular plate with ${bores.length} straight circular bore(s).`],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, createCylindricalBoreCheck, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), bodies = partBreps(doc);
const donor = bodies.find(({ key }) => key === ${JSON.stringify(donorKey ?? null)});
const key = 'b' + (doc.nodes.length - 1), { brep } = bodies.find(body => body.key === key);
const walls = brep.faces.map(face => ({ face, geometry: faceGeometry(face) })).filter(({ geometry }) => geometry.kind === 'cylinder');
const readDiameter = createCylindricalBoreCheck(brep);
const diameters = ${JSON.stringify(bores.map(({ center }) => center))}.map(([x, y]) => {
  const pair = walls.filter(({ geometry }) => Math.hypot(geometry.c[0] - x, geometry.c[1] - y) < 1e-9);
  return readDiameter(pair.map(({ face }) => face));
});
console.log(JSON.stringify({
  bodies: bodies.length, donor, brep, report: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1),
  diameters,
  supports: Object.fromEntries(brep.faces.map(face => {
    const g = faceGeometry(face);
    return [face.name, g.kind === 'plane' ? [g.n, g.n.reduce((sum, value, i) => sum + value * g.o[i], 0)] : g];
  })),
}));`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const dialog = name => f.page.getByRole('dialog', { name, exact: true });
const offset = panel => panel.getByLabel('Offset', { exact: true });
const status = (panel, state) => panel.locator('.status').filter({ hasText: new RegExp('^' + state + '$') }).waitFor();
const near = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-7, `${value} != ${expected}`);
const incidence = ({ bodies, shells, faces, loops, coedges, edges, vertices }) => [
  bodies, shells, faces.map(({ surface, ...face }) => [face, surface.id]), loops,
  coedges.map(({ pcurve, ...use }) => [use, pcurve.id]), edges.map(({ curve, ...edge }) => [edge, curve.id]),
  vertices.map(vertex => vertex.id),
];

async function measure(label, doc, distance, before) {
  const native = await f.inspect(label, doc), volume = volumeAt(distance), worker = (await f.bodies()).bodies;
  const displayed = worker.find(({ key }) => key === (before ? resultKey : sourceKey));
  assert.ok(native.report.valid, native.report.issues.join('\n'));
  const boreCount = bores.length;
  assert.deepEqual(native.report.counts, { bodies: 1, shells: 1, faces: 6 + 2 * boreCount, loops: 6 + 4 * boreCount,
    coedges: 24 + 12 * boreCount, edges: 12 + 6 * boreCount, vertices: 8 + 4 * boreCount });
  assert.equal(native.report.topology[0].genus, boreCount);
  assert.ok(native.report.maximumPcurveGap < 1e-9 && native.report.maximumEdgeSurfaceGap < 1e-9);
  bores.forEach(({ radius }, index) => near(native.diameters[index], 2 * radius));
  assert.equal(worker.length, tilt ? 2 : 1);
  assert.equal(native.bodies, worker.length);
  near(displayed.volume, volume);
  near(native.mass.volume, volume);
  if (!tilt) {
    const stockCentre = [20, 15], stock = volume + removedVolume;
    stockCentre[axis] += sign * distance / 2;
    const centroid = stockCentre.map((value, k) => {
      const holeMoment = bores.reduce((sum, bore) => sum + bore.volume * bore.center[k], 0);
      return (stock * value - holeMoment) / volume;
    }).concat(5);
    native.mass.centroid.forEach((value, axis) => near(value, centroid[axis]));
  }
  const limit = station + sign * distance;
  if (before) {
    assert.deepEqual(incidence(native.brep), incidence(before.brep));
    if (tilt) assert.deepEqual(native.donor, before.donor);
    for (const [i, { point }] of before.brep.vertices.entries()) {
      const [x, y, z] = point;
      let expected = point.map((value, k) => k === axis && Math.abs(value - station) < 1e-9 ? limit : value);
      if (tilt && Math.abs(x - station) < 1e-9 && Math.abs(z - fixed) > 1e-9) {
        expected = [limit, y, capHeight(limit, y)];
      }
      native.brep.vertices[i].point.forEach((value, k) => near(value, expected[k]));
    }
    const supports = { ...before.supports, [faceName]: [normal, sign * limit] };
    for (const [name, expected] of Object.entries(supports)) {
      const actual = native.supports[name];
      if (Array.isArray(expected)) {
        actual[0].forEach((value, k) => near(value, expected[0][k]));
        near(actual[1], expected[1]);
      } else assert.deepEqual(actual, expected);
    }
  }
  f.report.observations.push({ label, distance, limit, volume, nativeVolume: native.mass.volume,
    workerVolume: displayed.volume, diameters: native.diameters, maximumPcurveGap: native.report.maximumPcurveGap });
  return native;
}

async function offsetWithMcp(distance, checkContact = false) {
  const file = join(output, 'mcp-offset-' + distance + '.bcad');
  await copyFile(input, file);
  return withMcpSession({ app, output, clientName: 'cad-bored-wall-offset', autonomy: 3 }, file, 'offset-wall-' + distance, async call => {
    const faces = [faceName], pin = await call('query', { action: 'render', highlight: faces });
    const edit = { action: 'command', command: 'offset-face', faces, values: { d: distance }, expectedRevision: pin.revision };
    if (checkContact) {
      const refused = await call('features', { ...edit, values: { d: contact } }, true);
      assert.match(JSON.stringify(refused), /reach or cross the bore/i);
      assert.deepEqual(await readFile(file), bytes);
    }
    await call('features', edit);
    const accepted = await readFile(file), summary = await call('query', { action: 'summary' });
    assert.equal(summary.bodies.length, tilt ? 2 : 1);
    assert.ok(Math.abs(summary.bodies.find(({ key }) => key === resultKey).volume - volumeAt(distance)) <= 5e-4);
    const stale = await call('features', edit, true);
    assert.equal(stale.code, 'COMMAND_STALE');
    assert.deepEqual(await readFile(file), accepted);
    f.report.observations.push({ distance, revision: pin.revision, stale: stale.code });
    return { file, doc: JSON.parse(accepted) };
  });
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    return context;
  };
  f.phase = 'Apply outward and inward wall offsets through stdio MCP';
  const outwardAgent = await offsetWithMcp(positive, true), inwardAgent = await offsetWithMcp(negative);
  await f.freshOpen(input, source, 'bored-wall-source');
  const original = await measure('source', source, 0);
  f.phase = 'Select the ' + view.toLowerCase() + ' wall and launch its signed offset';
  await button('View cube directions').click();
  await f.page.getByRole('menuitem', { name: view, exact: true }).click();
  await f.page.waitForFunction(expected => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === expected;
  }, view.toUpperCase());
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), centre);
  assert.ok(pixel?.length === 2);
  await f.page.mouse.click(...pixel);
  const target = f.page.getByLabel('Face property and colour target');
  await target.waitFor();
  assert.ok((await target.innerText()).includes(faceName));
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Offset face');
  const panel = dialog('Offset face');
  await status(panel, 'preview');
  assert.equal(await panel.getByLabel('Mode', { exact: true }).count(), 0);

  f.phase = 'Drag the native outward handle and apply a 5 mm offset';
  const projection = await f.page.evaluate(({ centre, normal }) => {
    const a = window.__studioScreenOf(centre), b = window.__studioScreenOf(centre.map((value, k) => value + normal[k]));
    return [b[0] - a[0], b[1] - a[1]];
  }, { centre, normal });
  assert.ok(Math.hypot(...projection) > 2);
  const handle = await f.page.locator('g.gizmo-handle[data-handle="d"] polygon').evaluate(polygon => {
    const svg = polygon.closest('svg').getBoundingClientRect(), points = [...polygon.points];
    return [svg.x + points.reduce((sum, point) => sum + point.x, 0) / points.length,
      svg.y + points.reduce((sum, point) => sum + point.y, 0) / points.length];
  });
  const start = Number(await offset(panel).inputValue());
  await f.page.mouse.move(...handle);
  await f.page.mouse.down();
  await f.page.mouse.move(...handle.map((value, i) => value + (positive - start) * projection[i]), { steps: 6 });
  await f.page.mouse.up();
  assert.equal(Number(await offset(panel).inputValue()), positive);
  await status(panel, 'preview');
  await f.same(source);
  await button('Apply', panel).click();
  await f.changed(source);
  const outward = await f.doc(), edit = outward.nodes.at(-1);
  assert.deepEqual(outward, outwardAgent.doc);
  assert.equal(edit.kind, 'offset-face');
  assert.deepEqual(edit.faces, [faceName]);
  await measure('outward', outward, positive, original);
  await f.snapshot('bored-wall-outward');

  f.phase = 'Refuse bore contact and apply a 4 mm inward offset in History';
  await f.openFeatureEditor(source.nodes.length, 'bored wall offset');
  await button('Edit offset', f.editor()).click();
  const history = dialog('Edit Offset face');
  await offset(history).fill(String(contact));
  await status(history, 'refused');
  const error = history.locator('.hud-error'), kernel = error.locator('summary');
  if (await kernel.count()) await kernel.click();
  assert.match(await error.innerText(), /reach or cross the bore/i);
  assert.ok(await button('Apply', history).isDisabled());
  await f.same(outward);
  await f.snapshot('bored-wall-contact-refused');
  await offset(history).fill(String(negative));
  await status(history, 'preview');
  await button('Apply', history).click();
  await f.changed(outward);
  const inward = await f.doc();
  assert.deepEqual(inward, inwardAgent.doc);
  assert.deepEqual(inward.nodes.at(-1), { ...edit, distance: negative });
  await measure('inward', inward, negative, original);
  await f.undo(); await f.same(outward);
  await f.redo(); await f.same(inward);
  const saved = await f.save('bored-wall-offset');
  await f.freshOpen(saved.file, inward, 'bored-wall-reopened');
  await measure('reopened', inward, negative, original);
  await f.freshOpen(inwardAgent.file, inwardAgent.doc, 'bored-wall-mcp-reopened');
  await measure('mcp-file', inwardAgent.doc, negative, original);
  assert.deepEqual(await readFile(input), bytes);
});
