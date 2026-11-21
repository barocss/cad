import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const backend = process.argv.includes('--webgl2') ? 'webgl2' : 'webgpu';
const imported = process.argv.includes('--step');
const triangular = process.argv.includes('--triangle');
const turnIndex = triangular ? 0 : 1;
const file = process.argv[3];
const input = JSON.parse(await readFile(imported ? process.argv[4] : file, 'utf8'));
const doc = imported ? input.doc : input;
const f = await createFlow({
  name: 'smooth-turn-rail-display', output: process.argv[2], envFrozen: 'TURN_PROJECT_FROZEN',
  qualification: 'Project the native corner rails and the matched display polylines using the actual Model camera.',
  initialFiles: [
    'apps/cad-studio/test/smooth-turn-rail-display-browser.mjs',
    'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/src/App.tsx',
    'packages/barocss-cad-model/src/engine/evaluate.ts', 'packages/barocss-cad-model/src/engine/loftDisplay.ts',
    'packages/barocss-cad-model/src/engine/mesh.ts', 'packages/barocss-cad-model/src/engine/meshWire.ts',
    'packages/barocss-cad/src/internal/step-turn-display.ts',
  ],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { bodyMesh } from '@barocss/cad-model/engine/mesh';
import { evaluateCurve, curveDomain, checkBrep, brepMassProperties } from '@barocss/cad';
import { digestOf } from '@barocss/cad-model/util/digest';
const source = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const result = partBreps(source).find(body => body.brep.faces.length === ${triangular ? 5 : 6})!;
const evaluated = evaluateDoc(source, 1, 8, true);
assert.ok(evaluated.ok);
const baseline = evaluated.bodies.find(body => body.key === result.key)!.mesh;
const native = result.brep.edges.filter(edge => edge.curve.degree === 3 && edge.curve.controlPoints.length === ${triangular ? 16 : 13});
assert.equal(native.length, ${triangular ? 3 : 4});
const data = [baseline, bodyMesh(result.brep, 1, 24)].map(mesh => ({
  quality: mesh.quality, triangles: mesh.indices.length / 3, rails: native.map(edge => {
    const index = mesh.edges.find(view => view.nativeJoint?.edgeId === edge.id)!.index;
    const lines = [];
    for (let i = 0; i < mesh.edgeLines.length / 6; i++) {
      if (mesh.edgeOfSegment[i * 2] !== index) continue;
      lines.push([...mesh.edgeLines.subarray(i * 6, i * 6 + 3)], [...mesh.edgeLines.subarray(i * 6 + 3, i * 6 + 6)]);
    }
    const [a, b] = curveDomain(edge.curve);
    const samples = Array.from({ length: 1001 }, (_, i) => evaluateCurve(edge.curve, a + (b - a) * i / 1000));
    return { id: edge.id, lines, samples };
  }),
}));
const check = checkBrep(result.brep, { strict: true });
assert.ok(check.valid);
console.log(JSON.stringify({ data, digest: digestOf(result.brep), counts: check.counts,
  volume: brepMassProperties(result.brep, 1).volume, canonical: baseline.edges.map(edge => edge.nativeJoint?.edgeId) }));
`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
function shortest(p, [a, b]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], u = p[0] - a[0], v = p[1] - a[1];
  const t = Math.max(0, Math.min(1, (u * dx + v * dy) / (dx * dx + dy * dy)));
  return Math.hypot(u - t * dx, v - t * dy);
}
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  await f.newPage();
  if (backend === 'webgl2') await f.page.goto(new URL('?renderer=webgl2', origin).href);
  await f.page.locator(`.viewport[data-renderer="${backend}"]`).waitFor();
  await f.openFile(file, doc.nodes.length);
  await f.same(doc);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  if (await button('AO').getAttribute('aria-pressed') === 'true') await button('AO').click();
  await f.snapshot('turn-model-measured-view');
  const camera = await f.page.evaluate(() => window.__studioCamera());
  f.report.observations.push({ camera, backend, baseline });
  const read = await f.inspect('rails-and-tiers', doc);
  const detail = await f.page.evaluate(index => window.__studioLoftDisplay?.(index), turnIndex);
  if (!triangular) assert.equal(await f.page.evaluate(() => window.__studioLoftDisplay?.(0)), null);
  if (baseline) assert.equal(detail, null);
  else assert.deepEqual(detail, {
    triangles: read.data[1].triangles, baseTriangles: read.data[0].triangles, kind: 'smooth-turn',
  });
  const projected = await f.page.evaluate(tiers => tiers.map(tier => ({ ...tier, rails: tier.rails.map(rail => ({ id: rail.id,
    lines: rail.lines.map(p => window.__studioScreenOf(p)), samples: rail.samples.map(p => window.__studioScreenOf(p)),
  })) })), read.data);
  for (const tier of projected) {
    const maxima = tier.rails.map(({ id, lines, samples }) => {
      assert.ok(lines.every(point => point?.length === 2) && samples.every(point => point?.length === 2));
      const segments = lines.flatMap((p, i) => i % 2 === 0 ? [[p, lines[i + 1]]] : []);
      const errors = samples.map(p => Math.min(...segments.map(segment => shortest(p, segment))));
      const maximumPixels = Math.max(...errors), at = errors.indexOf(maximumPixels);
      return { id, maximumPixels, t: at / (samples.length - 1), pixel: samples[at] };
    });
    f.report.observations.push({ quality: tier.quality, triangles: tier.triangles, maxima });
  }
  await button('Display and previews').click();
  await f.page.getByLabel('CAD display mode', { exact: true }).selectOption('wireframe');
  await button('Display and previews').click();
  await f.page.locator('.viewport[data-display-mode-effective="wireframe"]').waitFor();
  await f.same(doc);
  assert.deepEqual(await f.page.evaluate(() => window.__studioCamera()), camera);
  await f.snapshot('turn-wireframe-measured-view');

  const hit = await f.page.evaluate(({ rails, turnIndex, canonical }) => {
    for (const rail of rails) {
      for (const point of rail.samples.filter((_, i) => i % 10 === 0).slice(5, -5)) {
        const hit = window.__studioEdgeAt(point, 3);
        if (hit?.body === turnIndex && hit.segments.length && canonical[hit.edge] === rail.id) {
          const pixel = window.__studioScreenOf(point);
          if (document.elementFromPoint(...pixel)?.matches('canvas.vp-canvas')) return { rail: rail.id, hit, pixel };
        }
      }
    }
    return null;
  }, { rails: read.data[0].rails, turnIndex, canonical: read.canonical });
  assert.ok(hit, 'A native Smooth Turn rail is pickable in the actual renderer');
  assert.equal(read.canonical[hit.hit.edge], hit.rail);
  const expected = read.data[baseline ? 0 : 1].rails.find(rail => rail.id === hit.rail).lines;
  assert.deepEqual(hit.hit.segments.flat(), expected.flat());
  const filter = button('Selection filter');
  for (let i = 0; i < 5 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.page.mouse.click(...hit.pixel);
  await f.page.waitForFunction(pick => window.__studioSelection.selection.edges.some(edge =>
    edge.body === pick.body && edge.edge === pick.edge), { body: hit.hit.body, edge: hit.hit.edge });
  await f.same(doc);
  const bodies = (await f.bodies()).bodies;
  assert.ok(Math.abs(bodies[turnIndex].volume - read.volume) < 1e-7);
  const { digest, counts, volume } = read;
  f.report.observations.push({ body: hit.hit.body, edge: hit.hit.edge, rail: hit.rail, segments: hit.hit.segments.length,
    detail, native: { digest, counts, volume } });
  await f.snapshot('turn-rail-picked');
});
