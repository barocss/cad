// Chrome WebGPU. Set CHROME, PW_DIR and optionally GPU_IMAGE_LIFETIME_EVIDENCE_DIR.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gpu = fileURLToPath(new URL('../dist/', import.meta.url));
const cad = fileURLToPath(new URL('../../barocss-cad/dist/', import.meta.url));
const html = `<meta charset="utf-8"><script type="importmap">{"imports":{"@barocss/cad":"/cad/index.js"}}</script>
<style>body{margin:16px;background:#222;color:#fff;font:16px sans-serif}canvas{display:block;width:360px;height:120px}#proof{display:grid;grid-template-columns:repeat(2,max-content);gap:16px}figure{margin:0}</style>
<canvas id="viewport"></canvas><div id="proof"></div>`;

test('public Viewer releases replaced maps and restores only live maps after WebGPU loss', { timeout: 120000 }, async t => {
  if (!process.env.CHROME || !process.env.PW_DIR) { t.skip('CHROME and PW_DIR required'); return; }
  const server = createServer(async (request, response) => {
    const url = request.url ?? '/';
    if (url === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); return; }
    if (url === '/favicon.ico') { response.writeHead(204).end(); return; }
    const isCad = url.startsWith('/cad/'), base = isCad ? cad : gpu;
    const file = resolve(base, '.' + (isCad ? url.slice(4) : url));
    if (!file.startsWith(resolve(base) + sep) || !file.endsWith('.js')) { response.writeHead(404).end(); return; }
    try {
      const bytes = await readFile(file);
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { chromium } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright');
    browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--enable-unsafe-webgpu'] });
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const data = await page.evaluate(async () => {
      const { createViewer, translation } = await import('/viewer/index.js');
      const reports = [];
      const canvas = document.getElementById('viewport');
      const viewer = await createViewer(canvas, {
        controls: false, autoResize: false, antialias: false, pixelRatio: 1, background: '#111111', lights: [],
        camera: { position: [0, 0, 6], target: [0, 0, 0], up: [0, 1, 0], projection: 'orthographic', fovY: 2 * Math.atan(1.6 / 6) * 180 / Math.PI },
        environment: { sky: '#000000', ground: '#000000', ambient: 0, toneMapping: 'none' },
        onRequestRender() {}, onError: message => reports.push(message),
      });
      const textureRecords = [], records = new WeakMap();
      const makeTexture = GPUDevice.prototype.createTexture, destroyTexture = GPUTexture.prototype.destroy;
      GPUDevice.prototype.createTexture = function (options) {
        const texture = makeTexture.call(this, options);
        if (options.label === 'viewer map') {
          const record = { device: this, destroyed: 0 };
          textureRecords.push(record);
          records.set(texture, record);
        }
        return texture;
      };
      GPUTexture.prototype.destroy = function () {
        const record = records.get(this);
        if (record) record.destroyed++;
        return destroyTexture.call(this);
      };

      const green = [42, 187, 94, 255], purple = [131, 66, 211, 255], orange = [241, 129, 35, 255];
      const image = color => viewer.createTexture({ width: 1, height: 1, data: Uint8Array.from(color) }, { mipmaps: false, filter: 'nearest' });
      const material = map => ({ map, color: '#ffffff', unlit: true, doubleSided: true });
      const geometry = viewer.createGeometry({
        positions: [-.8,-.6,0, .8,-.6,0, .8,.6,0, -.8,.6,0],
        uvs: [0,0,1,0,1,1,0,1], indices: [0,1,2,0,2,3],
      });
      const shared = image(green), other = image(purple);
      const left = viewer.add(geometry, { material: material(shared), transform: translation([-2, 0, 0]) });
      viewer.add(geometry, { material: material(shared) });
      viewer.add(geometry, { material: material(other), transform: translation([2, 0, 0]) });
      const sample = async label => {
        const frame = await viewer.capture();
        const figure = document.createElement('figure'), caption = document.createElement('figcaption'), copy = document.createElement('canvas');
        copy.width = frame.width;
        copy.height = frame.height;
        caption.textContent = label;
        copy.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
        figure.append(caption, copy);
        document.getElementById('proof').append(figure);
        const projection = viewer.camera.viewProjection(frame.width / frame.height);
        return [-2, 0, 2].map(x => {
          const clipW = projection[3] * x + projection[15];
          const px = (.5 + .5 * (projection[0] * x + projection[12]) / clipW) * frame.width;
          const py = (.5 - .5 * (projection[1] * x + projection[13]) / clipW) * frame.height;
          const at = (Math.round(py) * frame.width + Math.round(px)) * 4;
          return [...frame.data.slice(at, at + 4)];
        });
      };
      try {
        const initial = await sample('Shared accepted maps');
        const replacement = image(orange);
        left.material = material(replacement);
        const changed = await sample('One replacement map');
        const candidate = records.get(replacement.gpu.texture);
        const next = new Promise((resolve, reject) => {
          requestAnimationFrame(() => sample('Queued draw after removal').then(resolve, reject));
        });
        replacement.dispose();
        replacement.dispose();
        const removed = await next;
        left.material = material(shared);
        const beforeUpload = image([200, 40, 120, 255]);
        const uploaded = textureRecords.length;
        beforeUpload.dispose();
        const registry = viewer.textures.size;
        const old = viewer.computeDevice, lost = old.lost;
        viewer.loseDeviceForTesting();
        const loss = await lost;
        if (viewer.recovery) await viewer.recovery;
        const recovered = viewer.computeDevice;
        const afterLoss = await sample('Accepted maps after device recovery');
        const recoveryMaps = textureRecords.filter(record => record.device === recovered);
        viewer.dispose();
        return {
          initial, changed, removed, afterLoss, registry, reports, loss: loss.reason,
          replacedDevice: recovered !== old, candidateDestroyed: candidate.destroyed,
          oldUploads: uploaded, recreatedMaps: recoveryMaps.length,
          finalMapDestroys: recoveryMaps.map(record => record.destroyed),
          released: [replacement.gpu, beforeUpload.gpu].every(value => value === null),
          finalRegistry: viewer.textures.size,
        };
      } finally {
        viewer.dispose();
        GPUDevice.prototype.createTexture = makeTexture;
        GPUTexture.prototype.destroy = destroyTexture;
      }
    });
    const output = process.env.GPU_IMAGE_LIFETIME_EVIDENCE_DIR;
    if (output) {
      await mkdir(output, { recursive: true });
      await writeFile(join(output, 'viewer-image-lifetime.json'), JSON.stringify({ data, errors }, null, 2));
      await page.screenshot({ path: join(output, 'viewer-image-lifetime.png') });
    }
    t.diagnostic(JSON.stringify({ data, errors }));
    const green = [42, 187, 94, 255], purple = [131, 66, 211, 255];
    const expectColors = (actual, wanted) => actual.forEach((pixel, slot) =>
      pixel.forEach((value, axis) => assert.ok(Math.abs(value - wanted[slot][axis]) <= 2, JSON.stringify({ actual, wanted }))));
    expectColors(data.initial, [green, green, purple]);
    expectColors(data.changed, [[241, 129, 35, 255], green, purple]);
    expectColors(data.removed, [[255, 255, 255, 255], green, purple]);
    expectColors(data.afterLoss, [green, green, purple]);
    assert.deepEqual([data.registry, data.oldUploads, data.candidateDestroyed, data.recreatedMaps], [2, 3, 1, 2]);
    assert.ok(data.replacedDevice && data.released);
    assert.deepEqual(data.finalMapDestroys, [1, 1]);
    assert.equal(data.finalRegistry, 0);
    assert.deepEqual([...data.reports, ...errors], []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
