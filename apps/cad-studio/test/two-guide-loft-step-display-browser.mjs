import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const backend = process.argv.includes('--webgl2') ? 'webgl2' : 'webgpu';
const pins = [
  'apps/cad-studio/test/two-guide-loft-step-display-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/viewport/Viewport.tsx',
  'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad-model/src/engine/loftDisplay.ts',
  'packages/barocss-cad/src/internal/two-guide-loft-display.ts',
  'packages/barocss-cad/src/internal/two-guide-loft-step-display.ts',
];
const f = await createFlow({
  name: 'two-guide-loft-step-display', output: process.argv[2], envFrozen: 'D1839_SOURCE_FROZEN',
  qualification: 'Measure an imported exact Loft rail and click it in the current desktop display.',
  limits: ['D1838 exact AP214 taper files at X16 and X18. Right orthographic view.'], initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateDoc,partBreps} from '@barocss/cad-model/engine/evaluate';
import {checkBrep,brepMassProperties} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
const [{brep}]=partBreps(doc);
const canonical=evaluateDoc(doc,1,8,false), refined=evaluateDoc(doc,1,8,true);
assert.ok(canonical.ok&&refined.ok);
const a=canonical.bodies[0].mesh,b=refined.bodies[0].mesh;
assert.deepEqual(a.edges,b.edges);assert.deepEqual(a.faces,b.faces);
assert.deepEqual(a.positions,b.positions);assert.deepEqual(a.edgeLines,b.edgeLines);
assert.ok(!a.loftDetail&&b.loftDetail);
const edge=a.edges.find(e=>e.a.every((v,i)=>v===[10,6,0][i])&&e.b.every((v,i)=>v===[14,4,12][i]));
assert.ok(edge?.nativeJoint);
const segments=[];
for(let i=0;i<a.edgeLines.length;i+=6) if(a.edgeOfSegment[i/3]===edge.index) segments.push(Array.from(a.edgeLines.slice(i,i+6)));
console.log(JSON.stringify({report:checkBrep(brep,{strict:true}),mass:brepMassProperties(brep,1),edge,segments}));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const toSegment = (p, [a, b]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const distanceToCurve = (curve, edges) => Math.max(...curve.map(p => Math.min(...edges.map(s => toSegment(p, s)))));
function rail(t, middle) {
  const x = 4 * t * (1 - t), width = 10 + 4 * t + 2 * (middle - 14) * t * (1 - t);
  return [x + width, width * (3 / 5 - 11 * t / 35), 12 * t];
}
await f.run(async () => {
  const source = resolveSource(process.argv[3]);
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  for (const [label, middle, expected] of [['initial-taper', 16, 29016 / 35], ['edited-taper', 18, 161272 / 175]]) {
    await f.newPage();
    if (backend === 'webgl2') await f.page.goto(origin + '/?renderer=webgl2');
    await f.page.locator('.viewport[data-renderer="' + backend + '"]').waitFor();
    const file = join(source, label + '.step');
    await f.openFile(file, 1);
    const opened = await f.doc();
    assert.equal(opened.nodes[0].step, await readFile(file, 'utf8'));
    const canonical = await f.inspect(label + '-native', opened);
    assert.ok(canonical.report.valid && Math.abs(canonical.mass.volume - expected) < 1e-8);
    const detail = await f.page.waitForFunction(() => window.__studioLoftDisplay?.()).then(h => h.jsonValue());
    assert.ok(detail.triangles > detail.baseTriangles && detail.error <= 0.01);
    await button('Right').click();
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    await f.page.waitForFunction(() => {
      const eye = window.__studioEye?.(), camera = window.__studioCamera?.();
      return camera?.ortho && eye?.[0] > 15 && Math.abs(eye[1] - camera.target[1]) < 0.001;
    });
    const curve = Array.from({ length: 257 }, (_, i) => rail(i / 256, middle));
    const middlePoint = curve[128];
    const measurement = await f.page.evaluate(({ points, middle, base }) => {
      const project = window.__studioScreenOf;
      const hit = window.__studioEdgeAt(middle, 4);
      const projectSegments = segments => segments.map(segment => [project(segment.slice(0, 3)), project(segment.slice(3))]);
      return { hit, camera: window.__studioCamera(), point: project(middle), curve: points.map(project),
        base: projectSegments(base), display: hit ? projectSegments(hit.segments) : [] };
    }, { points: curve, middle: middlePoint, base: canonical.segments });
    assert.equal(measurement.hit?.edge, canonical.edge.index);
    const baseError = distanceToCurve(measurement.curve, measurement.base);
    const displayError = distanceToCurve(measurement.curve, measurement.display);
    assert.ok(baseError >= 2 * displayError && displayError <= 0.8, JSON.stringify({ baseError, displayError }));
    assert.ok(await f.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.matches('canvas.vp-canvas'), measurement.point));
    await f.page.mouse.click(...measurement.point);
    const edge = { body: 0, edge: canonical.edge.index };
    await f.page.waitForFunction(e => window.__studioSelection?.selection.edges.some(p => p.body === e.body && p.edge === e.edge), edge);
    await f.same(opened);
    f.report.observations.push({ label, backend, ...detail, baseErrorCSS: baseError, displayErrorCSS: displayError,
      viewportHeightCSS: Math.abs(measurement.curve[0][1] - measurement.curve.at(-1)[1]),
      canonicalId: canonical.edge.nativeJoint.edgeId, selection: edge, camera: measurement.camera });
    await f.snapshot(label + '-rail-picked');
  }
});

function resolveSource(path) {
  assert.ok(path, 'Supply the D1838 STEP evidence folder');
  return path;
}
