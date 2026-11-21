import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const file = process.argv[3], doc = JSON.parse(await readFile(file, 'utf8'));
const grid = process.argv.includes('--grid');
const polygon = process.argv.find(arg => arg.startsWith('--polygon='));
const sides = polygon ? Number(polygon.slice('--polygon='.length)) : 4;
assert.ok(Number.isInteger(sides) && sides >= 4 && sides <= 64);
const viewFile = process.argv.find(arg => arg.startsWith('--camera='));
const camera = viewFile ? JSON.parse(await readFile(viewFile.slice('--camera='.length), 'utf8')).camera : null;
const pins = [
  'apps/cad-studio/test/smooth-screw-depth-browser.mjs',
  'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/camera.ts',
  'packages/barocss-cad-model/src/engine/loftDisplay.ts',
  ...(grid || polygon ? ['packages/barocss-cad-model/src/engine/screwDisplay.ts'] : []),
  'packages/barocss-cad/src/brep/brep-tessellate.ts',
];
const f = await createFlow({
  name: 'screw-depth-probe', output: process.argv[2], envFrozen: 'SCREW_DEPTH_FROZEN',
  qualification: 'Capture Model camera and the equivalent native solid and display geometry.',
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { bodyMesh } from '@barocss/cad-model/engine/mesh';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const base = evaluateDoc(doc, 1, 8, true).bodies[0].mesh, detail = base.loftDetail;
const canonical = bodyMesh(brep, 0, 24);
if (!${grid || !!polygon} && JSON.stringify([...canonical.positions]) !== JSON.stringify([...detail.positions])) throw new Error('Geometry packet differs');
if (!${grid || !!polygon} && JSON.stringify([...canonical.indices]) !== JSON.stringify([...detail.indices])) throw new Error('Triangle packet differs');
const packet = mesh => ({ positions: [...mesh.positions], indices: [...mesh.indices], owners: [...mesh.faceOfVertex], faces: mesh.faces.map(face => face.id) });
const live = ${!!polygon} ? { ...base, ...detail } : { ...canonical, ...detail };
const meshes = { q24: packet(canonical), live: packet(live) };
if (!${!!polygon}) meshes.q48 = packet(bodyMesh(brep, 0, 48));
console.log(JSON.stringify({ digest: digestOf(brep), valid: checkBrep(brep, { strict: true }).valid, faces: brep.faces,
  meshes, baseTriangles: base.indices.length / 3, axis: doc.nodes[0]?.plane?.normal ?? [0, 0, 1] }));
`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin, newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const target = new URL(route.request().url());
      if (target.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      if (target.origin !== origin) return route.abort();
      if (!camera || !target.pathname.endsWith('/Viewport.tsx')) return route.continue();
      const response = await route.fetch({ headers: { ...route.request().headers(), 'if-none-match': '' } });
      const source = await response.text(), pattern = /w\.__studioCamera\s*=\s*\(\)\s*=>/g;
      if ([...source.matchAll(pattern)].length !== 1) return route.fulfill({ response });
      const patch = 'w.__studioScrewDepthCamera = state => { Object.assign(camera.current, state); requestRef.current(); }; w.__studioCamera = () =>';
      return route.fulfill({ response, body: source.replace(pattern, patch) });
    });
    return context;
  };
  await f.newPage();
  if (polygon) await f.page.locator('.viewport[data-renderer="webgpu"]').waitFor();
  await f.openFile(file, doc.nodes.length);
  await f.same(doc);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const ao = button('AO');
  if (await ao.getAttribute('aria-pressed') === 'true') await ao.click();
  await f.page.getByRole('button', { name: 'AO', exact: true, pressed: false }).waitFor();
  if (camera) {
    await f.page.waitForFunction(() => typeof window.__studioScrewDepthCamera === 'function');
    await f.page.evaluate(value => window.__studioScrewDepthCamera(value), camera);
  }
  await f.page.mouse.move(1030, 900);
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const view = await f.page.evaluate(() => ({
    camera: window.__studioCamera(), eye: window.__studioEye(),
    canvas: document.querySelector('canvas.vp-canvas').getBoundingClientRect().toJSON(),
    packet: window.__studioLoftDisplay?.(0), devicePixelRatio: window.devicePixelRatio,
  }));
  if (!polygon) {
    if (grid) assert.ok(view.packet.triangles > 1092 && view.packet.triangles <= 1876);
    else assert.equal(view.packet.triangles, 1092);
  }
  if (camera) assert.deepEqual(view.camera, camera);
  assert.equal(view.devicePixelRatio, 1);
  f.report.observations.push(view);
  await writeFile(join(f.output, 'view.json'), JSON.stringify(view));
  await f.snapshot('exact-camera');
  const geometry = await f.inspect('geometry', doc);
  assert.ok(geometry.valid);
  if (polygon) {
    assert.equal(geometry.faces.length, sides + 2);
    if (grid) {
      assert.ok(view.packet.triangles > geometry.baseTriangles);
      assert.equal(view.packet.triangles, geometry.meshes.live.indices.length / 3);
    } else {
      assert.equal(view.packet, null);
      assert.equal(geometry.meshes.live.indices.length / 3, geometry.baseTriangles);
    }
  } else assert.equal(geometry.digest, 'c91e769225d1c08554ca7556ca23ed70b32cbac73530d0f4ee1278889f02a661');
});
