import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const pins = ['apps/cad-studio/src/viewport/Viewport.tsx', 'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/arcSweepExteriorDetail.ts', 'packages/barocss-cad-model/src/engine/arcSweepMixedDisplay.ts',
  'packages/barocss-cad-model/src/engine/mesh.ts', 'packages/barocss-cad-model/src/engine/meshWire.ts',
  'packages/barocss-cad/src/brep/exact-sweep.ts'];
const f = await createFlow({
  name: 'arc-bore-fillet-display', output: process.argv[2], envFrozen: 'D1304_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Measure the exterior and cap contact of a circular Sweep after the fitted bore fillet.',
  limits: ['Top and Front orthographic views in desktop Chrome WebGPU.'],
});
const baseline = process.argv.includes('--baseline');
const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [{
    id: 'n0', kind: 'sketch', profile: 'loop',
    segments: [
      { kind: 'line', start: [2,3] },
      { kind: 'arc', start: [12,3], center: [12,8], direction: 'ccw' },
      { kind: 'line', start: [12,13] },
      { kind: 'line', start: [2,13] },
    ],
    holes: [[{ kind: 'arc', start: [9,7], center: [8,7], direction: 'cw' }]],
    sideTags: { outer: ['base', 'round', 'roof', 'back'], holes: [['bore']] },
  }, {
    id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Quarter rail', mode: 'exact',
    path: { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[33,-7,4],[33,13,4],[13,13,4]], weights: [1,Math.SQRT1_2,1] },
  }, {
    id: 'n2', kind: 'fillet', parent: { node: 1, side: 'solid' },
    edges: ['n1.side[bore]#1|n1.start', 'n1.side[bore]#2|n1.start'], radius: .2,
  }],
  outputs: { b2: { node: 2, side: 'solid' } },
};
const volumeByRadius = new Map([[.2, 4281.516087396291], [.25, 4281.483417133829]]);
const halfDisk = 12.5 * Math.PI;
const area = 100 + halfDisk;
const cx = (700 + 12 * halfDisk + 250 / 3) / area;
const major = 20 + 8 - cx;
const contours = {
  inner: { radius: 20 + 2 - cx, centre: [13,-7,4], u: [1,0,0], v: [0,1,0], inner: true },
  outer: { radius: 20 + 17 - cx, centre: [13,-7,4], u: [1,0,0], v: [0,1,0], inner: false },
};
const button = name => f.page.getByRole('button', { name, exact: true });
const settle = () => f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const project = point => f.page.evaluate(p => window.__studioScreenOf(p), point);
const polar = ({ centre, u, v }, r, angle = Math.PI / 4) => centre.map((value, i) => value + r * (u[i] * Math.cos(angle) + v[i] * Math.sin(angle)));

async function open(file, expected) {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(file);
  await f.same(expected);
  await verifyMass(expected.nodes.at(-1).radius);
}

async function verifyMass(radius) {
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  assert.ok(Math.abs(bodies[0].volume - volumeByRadius.get(radius)) < 1e-7);
}

async function pose(name) {
  await button(name).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await settle();
}

async function measure(label, contour) {
  f.phase = label;
  const read = await f.page.evaluate(({ centre, u, v, inner, radius }) => {
    const project = p => window.__studioScreenOf(p), hit = p => !!window.__studioSurfacePoint(p);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const point = (r, theta) => centre.map((value, i) => value + r * (u[i] * Math.cos(theta) + v[i] * Math.sin(theta)));
    const scale = dist(project(centre), project(point(1, 0)));
    const lowerHits = !inner;
    const error = Array.from({ length: 29 }, (_, i) => {
      const angle = (38 + i / 2) * Math.PI / 180;
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
  f.report.observations.push(result);
  await f.snapshot(label);
  return result;
}

async function zoomOn(contour) {
  await f.page.mouse.move(...await project(polar(contour, contour.radius)));
  await f.page.mouse.wheel(0, -760);
  await settle();
}

async function pickInsideEdge(label, scale) {
  f.phase = label;
  const p = polar(contours.inner, contours.inner.radius);
  p[2] = 9;
  const hit = await f.page.evaluate(point => window.__studioEdgeAt(point, 5), p);
  assert.ok(hit?.segments.length);
  let error = 0;
  for (const [ax,ay,az,bx,by,bz] of hit.segments) {
    for (const [x,y,z] of [[ax,ay,az],[bx,by,bz]]) {
      assert.ok(Math.abs(z - 9) < 1e-7 && Math.abs(Math.hypot(x - 13, y + 7) - contours.inner.radius) < 1e-7);
    }
    error = Math.max(error, contours.inner.radius - Math.hypot((ax + bx) / 2 - 13, (ay + by) / 2 + 7));
  }
  if (!baseline) assert.ok(error * scale < .25);
  const pixel = await project(p);
  assert.ok(await f.page.evaluate(p => document.elementFromPoint(...p)?.matches('canvas.vp-canvas'), pixel));
  const owner = { body: hit.body, edge: hit.edge };
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(e => window.__studioSelection?.selection.edges.some(x => x.body === e.body && x.edge === e.edge), owner);
  f.report.observations.push({ label, ...owner, segments: hit.segments.length, errorCSS: error * scale });
  await f.snapshot(label);
  await f.page.keyboard.press('Escape');
  return owner;
}

async function checkFilletContact(fRadius, label) {
  f.phase = label;
  await pose('Front');
  const capEdge = t => {
    const rho = major + (1 + fRadius) * Math.cos(t);
    return [13 + Math.sqrt(rho ** 2 - fRadius ** 2), -7, 5 + (1 + fRadius) * Math.sin(t)];
  };
  const centre = [13 + major, -7, 5];
  await f.page.mouse.move(...await project(centre));
  await f.page.mouse.wheel(0, -760);
  await settle();
  const ideal = Array.from({ length: 97 }, (_, i) => capEdge(i * 2 * Math.PI / 97));
  const read = await f.page.evaluate(({ ideal, centre }) => {
    const project = p => window.__studioScreenOf(p);
    const dist = (a,b) => Math.hypot(a[0]-b[0],a[1]-b[1]);
    const scale = dist(project(centre), project([centre[0]+1, centre[1], centre[2]]));
    const capHit = p => {
      const hit = window.__studioSurfacePoint(p);
      return !!hit && Math.abs(hit[1] - centre[1]) < 1e-5;
    };
    const misses = [];
    const errors = ideal.map((p, index) => {
      const r = Math.hypot(p[0]-centre[0], p[2]-centre[2]);
      const ray = q => centre.map((c, i) => c + (p[i] - c) * q / r);
      let lo = r - .16, hi = r + .24;
      if (capHit(ray(lo)) || !capHit(ray(hi))) { misses.push(index); return null; }
      for (let i = 0; i < 17; i++) {
        const middle = (lo + hi) / 2;
        if (capHit(ray(middle))) hi = middle;
        else lo = middle;
      }
      return dist(project(p), project(ray((lo + hi) / 2)));
    });
    const edges = [...new Set(ideal.map(p => window.__studioEdgeAt(p, 4)?.edge ?? null))];
    return { scale, errors: errors.filter(v => v !== null), misses, edges };
  }, { ideal, centre });
  assert.equal(read.errors.length, 97, JSON.stringify(read));
  assert.deepEqual(read.edges, [null]);
  f.report.observations.push({ label, radius: fRadius, scale: read.scale,
    maxCSS: Math.max(...read.errors), missed: read.misses, visibleOwners: read.edges });
  if (fRadius === .25) assert.ok(Math.max(...read.errors) < .36);
  await f.snapshot(label);
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
      if (!baseline || !url.pathname.endsWith('/viewport/Viewport.tsx')) return route.continue();
      const response = await route.fetch(), source = await response.text();
      const existing = '!!source[0].mesh.arcSweepExteriorDetail';
      assert.equal(source.split(existing).length, 2);
      const body = source.replace(existing, 'false');
      f.report.observations.push({ label: 'canonical-mesh', sourceSHA: sha256(source), servedSHA: sha256(body) });
      return route.fulfill({ response, body });
    });
    return context;
  };
  await f.newPage();
  await open({ name: 'curved-sweep-fillet.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, seed);
  let owner;
  for (const [label, contour] of Object.entries(contours)) {
    await pose('Top');
    const fit = await measure(label + '-fit', contour);
    await zoomOn(contour);
    const zoom = await measure(label + '-zoom', contour);
    assert.ok(zoom.scale > 2 * fit.scale && zoom.vertices === fit.vertices);
    if (label === 'inner' && !baseline) owner = await pickInsideEdge('selected-inner-zoom', zoom.scale);
  }

  await checkFilletContact(.2, 'initial-hidden-fillet-contact');
  await f.openFeatureEditor(2, 'edit the curved bore fillet');
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.25');
  const edited = (await f.applyEditor(seed, 'edited-fillet')).doc;
  assert.equal(edited.nodes.at(-1).radius, .25);
  assert.deepEqual(edited.nodes.slice(0, 2), seed.nodes.slice(0, 2));
  const saved = await f.save('curved-bore-fillet-display');
  await f.newPage();
  await open(saved.file, edited);
  await pose('Top');
  await zoomOn(contours.inner);
  const reopened = await measure('inner-reopened-zoom', contours.inner);
  if (baseline) assert.ok(reopened.errorCSS > .25);
  else assert.deepEqual(await pickInsideEdge('selected-inner-reopened', reopened.scale), owner);
  await checkFilletContact(.25, 'reopened-hidden-fillet-contact');
});
