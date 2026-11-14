import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/viewport/Viewport.tsx', 'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/arcSweepMixedDisplay.ts', 'packages/barocss-cad-model/src/engine/arcSweepMixedBore.ts',
  'packages/barocss-cad/src/brep/exact-sweep.ts'];
const f = await createFlow({
  name: 'arc-bore-display', output: process.argv[2], envFrozen: 'D1303_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Measure the displayed contours of an uncut circular Sweep with a bore.',
  limits: ['Top, Front and Left orthographic views in desktop Chrome WebGPU.'],
});
const baseline = process.argv.includes('--baseline');
const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { boreEdgeX: 9 }, nextId: 2,
  nodes: [{
    id: 'n0', kind: 'sketch', profile: 'loop',
    segments: [
      { kind: 'line', start: [2,3] },
      { kind: 'arc', start: [12,3], center: [12,8], direction: 'ccw' },
      { kind: 'line', start: [12,13] },
      { kind: 'line', start: [2,13] },
    ],
    holes: [[{ kind: 'arc', start: [{ parameter: 'boreEdgeX' },7], center: [8,7], direction: 'cw' }]],
    sideTags: { outer: ['base','round','roof','back'], holes: [['bore']] },
  }, {
    id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Quarter rail', mode: 'exact',
    path: { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[33,-7,4],[33,13,4],[13,13,4]], weights: [1,Math.SQRT1_2,1] },
  }],
  outputs: { b1: { node: 1, side: 'solid' } },
};
const halfDisk = 12.5 * Math.PI;
const area = 100 + halfDisk;
const cx = (700 + 12 * halfDisk + 250 / 3) / area;
const major = 20 + 8 - cx;
const contours = {
  inner: { radius: 20 + 2 - cx, centre: [13,-7,4], u: [1,0,0], v: [0,1,0], inner: true },
  outer: { radius: 20 + 17 - cx, centre: [13,-7,4], u: [1,0,0], v: [0,1,0], inner: false },
};
const mouth = (radius, end = false) => ({ radius, inner: true, v: [0,0,1],
  centre: end ? [13, -7 + major, 5] : [13 + major, -7, 5], u: end ? [0,1,0] : [1,0,0], axis: end ? 0 : 1 });
const button = name => f.page.getByRole('button', { name, exact: true });
const settle = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const project = point => f.page.evaluate(p => window.__studioScreenOf(p), point);
const polar = ({ centre, u, v }, r, angle = Math.PI / 4) => centre.map((value, i) => value + r * (u[i] * Math.cos(angle) + v[i] * Math.sin(angle)));

async function open(file, expected) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
  await f.same(expected);
  await verifyMass(expected.parameters.boreEdgeX - 8);
}

async function verifyMass(radius) {
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  const volume = Math.PI / 2 * (area * 20 - Math.PI * radius ** 2 * major);
  assert.ok(Math.abs(bodies[0].volume - volume) < 1e-7);
}

async function pose(name) {
  if (name === 'Left') {
    await button('View cube directions').click();
    await f.page.getByRole('menuitem', { name, exact: true }).click();
  } else await button(name).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await settle();
}

async function measure(label, contour) {
  f.phase = label;
  const read = await f.page.evaluate(({ centre, u, v, inner, radius, axis }) => {
    const project = p => window.__studioScreenOf(p), hit = p => {
      const point = window.__studioSurfacePoint(p);
      return axis === undefined ? !!point : !!point && Math.abs(point[axis] - centre[axis]) < 1e-3;
    };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const point = (r, theta) => centre.map((value, i) => value + r * (u[i] * Math.cos(theta) + v[i] * Math.sin(theta)));
    const scale = dist(project(centre), project(point(1, 0)));
    const samples = axis === undefined ? 29 : 97;
    const lowerHits = !inner;
    const error = Array.from({ length: samples }, (_, i) => {
      const angle = axis === undefined ? (38 + i / 2) * Math.PI / 180 : i * 2 * Math.PI / samples;
      let lo = radius - .5, hi = radius + .5;
      if (hit(point(lo, angle)) !== lowerHits || hit(point(hi, angle)) === lowerHits) return null;
      for (let n = 0; n < 15; n++) {
        const r = (lo + hi) / 2;
        if (hit(point(r, angle)) === lowerHits) lo = r;
        else hi = r;
      }
      return dist(project(point(radius, angle)), project(point((lo + hi) / 2, angle)));
    });
    return { scale, errorCSS: error.every(x => x !== null) ? Math.max(...error) : null,
      vertices: window.__studioSweepCylinderMesh().length / 3 };
  }, contour);
  const result = { label, radius: contour.radius, ...read };
  assert.ok(read.errorCSS !== null, JSON.stringify(result));
  if (!baseline) assert.ok(read.errorCSS < .25, JSON.stringify(result));
  if (contour.axis === undefined) {
    const screenshot = PNG.sync.read(await f.page.screenshot());
    const sums = [];
    for (const sign of [1, -1]) {
      const radius = contour.radius + (contour.inner ? 1 : -1) * sign * 8 / read.scale;
      const [x,y] = await project(polar(contour, radius));
      const offset = (Math.round(y) * screenshot.width + Math.round(x)) * 4;
      sums.push(screenshot.data[offset] + screenshot.data[offset + 1] + screenshot.data[offset + 2]);
    }
    assert.ok(sums[0] - sums[1] > 85, JSON.stringify(sums));
    result.insideRGBSum = sums[0];
    result.outsideRGBSum = sums[1];
  }
  f.report.observations.push(result);
  await f.snapshot(label);
  return result;
}

async function pickMouth(label, contour, scale) {
  f.phase = label;
  const point = polar(contour, contour.radius);
  const hit = await f.page.evaluate(p => window.__studioEdgeAt(p, 4), point);
  assert.ok(hit?.segments.length > 0);
  let chordError = 0;
  const { centre, axis, radius } = contour;
  const r = point => Math.hypot(point[1 - axis] - centre[1 - axis], point[2] - centre[2]);
  for (const [ax,ay,az,bx,by,bz] of hit.segments) {
    for (const p of [[ax,ay,az], [bx,by,bz]]) assert.ok(Math.abs(p[axis] - centre[axis]) < 1e-7 && Math.abs(r(p) - radius) < 1e-7);
    chordError = Math.max(chordError, radius - r([(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]));
  }
  assert.ok(chordError > 0 && (baseline || chordError * scale < .25));
  const pixel = await project(point);
  assert.ok(await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
  const owner = { body: hit.body, edge: hit.edge };
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(e => window.__studioSelection?.selection.edges.some(x => x.body === e.body && x.edge === e.edge), owner);
  f.report.observations.push({ label, ...owner, chordError, chordErrorCSS: chordError * scale, segments: hit.segments.length });
  await f.snapshot(label);
  await f.page.keyboard.press('Escape');
  return owner;
}

async function zoomOn(contour) {
  const target = contour.axis === undefined ? polar(contour, contour.radius) : contour.centre;
  await f.page.mouse.move(...await project(target));
  await f.page.mouse.wheel(0, -760);
  await settle();
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const make = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async args => {
    const context = await make({ ...args, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (url.origin !== origin) return route.abort();
      if (!baseline || !url.pathname.endsWith('/engine/evaluate.ts')) return route.continue();
      const response = await route.fetch(), source = await response.text();
      const original = 'arcSweepMixedDisplayMesh(arcSweepDisplayMesh(body.mesh, brep), brep)';
      assert.equal(source.split(original).length, 2);
      const body = source.replace(original, 'arcSweepDisplayMesh(body.mesh, brep)');
      f.report.observations.push({ label: 'canonical-mesh', sourceSHA: sha256(source), servedSHA: sha256(body) });
      return route.fulfill({ response, body });
    });
    return context;
  };
  await f.newPage();
  await open({ name: 'curved-sweep-bore.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, seed);

  for (const [label, contour] of Object.entries(contours)) {
    await pose('Top');
    const fit = await measure(label + '-fit', contour);
    await zoomOn(contour);
    const zoom = await measure(label + '-zoom', contour);
    assert.ok(zoom.scale > 2 * fit.scale && zoom.vertices === fit.vertices);
  }
  await pose('Front');
  const fit = await measure('mouth-fit', mouth(1));
  const owner = await pickMouth('mouth-pick-fit', mouth(1), fit.scale);
  await zoomOn(mouth(1));
  const zoom = await measure('mouth-zoom', mouth(1));
  assert.ok(zoom.scale > 2 * fit.scale && zoom.vertices === fit.vertices);
  assert.deepEqual(await pickMouth('mouth-pick-zoom', mouth(1), zoom.scale), owner);
  await pose('Left');
  const end = await measure('end-mouth-fit', mouth(1, true));
  const endOwner = await pickMouth('end-mouth-pick', mouth(1, true), end.scale);
  assert.notDeepEqual(endOwner, owner);
  if (baseline) {
    assert.ok(f.report.observations.some(item => item.label === 'canonical-mesh'));
    assert.ok(zoom.errorCSS > .25);
    return;
  }

  const edited = (await f.setParameter('boreEdgeX', 9.5, 'edit-bore')).doc;
  assert.deepEqual(edited.nodes, seed.nodes);
  await verifyMass(1.5);
  const saved = await f.save('curved-sweep-bore');
  await f.newPage();
  await open(saved.file, edited);
  await pose('Front');
  await zoomOn(mouth(1.5));
  const reopened = await measure('mouth-reopened-zoom', mouth(1.5));
  assert.deepEqual(await pickMouth('mouth-reopened-pick', mouth(1.5), reopened.scale), owner);
  await pose('Left');
  await zoomOn(mouth(1.5, true));
  const reopenedEnd = await measure('end-mouth-reopened-zoom', mouth(1.5, true));
  assert.deepEqual(await pickMouth('end-mouth-reopened-pick', mouth(1.5, true), reopenedEnd.scale), endOwner);
});
