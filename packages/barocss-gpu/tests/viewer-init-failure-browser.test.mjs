// Chrome WebGPU. Set CHROME, PW_DIR and optionally GPU_INIT_FAILURE_EVIDENCE_DIR.
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
<style>body{margin:16px;background:#1e1e1e;color:#eee;font:14px sans-serif}canvas{display:block;width:240px;height:120px}#proof{display:grid;grid-template-columns:repeat(2,max-content);gap:16px;margin-top:12px}figure{margin:0}figcaption{margin-bottom:4px}</style>
<h3>Viewer Initialization Failure Cleanup (Real WebGPU)</h3>
<canvas id="accepted"></canvas><div id="proof"></div>`;

test('rejected public createViewer releases every real WebGPU device, buffer, texture, listener, and observer without harming an accepted Viewer', { timeout: 120000 }, async t => {
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
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    if (!await page.evaluate(async () => !!await navigator.gpu?.requestAdapter())) { t.skip('no WebGPU adapter'); return; }

    const data = await page.evaluate(async () => {
      const { createViewer } = await import('/viewer/index.js');
      const bound = (promise, label) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), 15000))]);

      // Track real GPUAdapter.requestDevice, GPUDevice.destroy, buffers, and textures globally.
      const adapter = await navigator.gpu.requestAdapter();
      let adapterProto = Object.getPrototypeOf(adapter);
      while (adapterProto && !Object.getOwnPropertyDescriptor(adapterProto, 'requestDevice')) adapterProto = Object.getPrototypeOf(adapterProto);
      const reqDesc = Object.getOwnPropertyDescriptor(adapterProto, 'requestDevice');
      const nativeRequestDevice = reqDesc.value;
      const nativeDestroyDevice = GPUDevice.prototype.destroy;
      const nativeCreateBuffer = GPUDevice.prototype.createBuffer;
      const nativeDestroyBuffer = GPUBuffer.prototype.destroy;
      const nativeCreateTexture = GPUDevice.prototype.createTexture;
      const nativeDestroyTexture = GPUTexture.prototype.destroy;

      const deviceMeta = new WeakMap();
      const bufferMeta = new WeakMap();
      const textureMeta = new WeakMap();
      const allDevices = [];
      let injectBufferFailureOnLabel = null;
      let bufferSentinel = null;

      Object.defineProperty(adapterProto, 'requestDevice', {
        ...reqDesc,
        value: function (...args) {
          return Reflect.apply(nativeRequestDevice, this, args).then(device => {
            const record = { device, destroyed: 0, buffersCreated: 0, buffersDestroyed: 0, texturesCreated: 0, texturesDestroyed: 0 };
            deviceMeta.set(device, record);
            allDevices.push(record);
            return device;
          });
        },
      });
      GPUDevice.prototype.destroy = function (...args) {
        const record = deviceMeta.get(this);
        if (record) record.destroyed++;
        return Reflect.apply(nativeDestroyDevice, this, args);
      };
      GPUDevice.prototype.createBuffer = function (descriptor) {
        if (injectBufferFailureOnLabel && descriptor?.label === injectBufferFailureOnLabel) {
          injectBufferFailureOnLabel = null;
          throw bufferSentinel;
        }
        const buffer = Reflect.apply(nativeCreateBuffer, this, [descriptor]);
        const record = deviceMeta.get(this);
        if (record) {
          record.buffersCreated++;
          bufferMeta.set(buffer, { record, destroyed: 0 });
        }
        return buffer;
      };
      GPUBuffer.prototype.destroy = function (...args) {
        const meta = bufferMeta.get(this);
        if (meta && meta.destroyed === 0) { meta.destroyed++; meta.record.buffersDestroyed++; }
        return Reflect.apply(nativeDestroyBuffer, this, args);
      };
      GPUDevice.prototype.createTexture = function (descriptor) {
        const texture = Reflect.apply(nativeCreateTexture, this, [descriptor]);
        const record = deviceMeta.get(this);
        if (record) {
          record.texturesCreated++;
          textureMeta.set(texture, { record, destroyed: 0 });
        }
        return texture;
      };
      GPUTexture.prototype.destroy = function (...args) {
        const meta = textureMeta.get(this);
        if (meta && meta.destroyed === 0) { meta.destroyed++; meta.record.texturesDestroyed++; }
        return Reflect.apply(nativeDestroyTexture, this, args);
      };

      const liveDeviceCount = () => allDevices.filter(r => r.destroyed === 0).length;
      const liveBuffersOf = record => record.buffersCreated - record.buffersDestroyed;
      const liveTexturesOf = record => record.texturesCreated - record.texturesDestroyed;

      const acceptedCanvas = document.getElementById('accepted');
      acceptedCanvas.width = 240; acceptedCanvas.height = 120;
      const acceptedReports = [];
      const accepted = await createViewer(acceptedCanvas, {
        controls: false, autoResize: false, antialias: false, pixelRatio: 1, background: '#111111', lights: [],
        camera: { position: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0], projection: 'orthographic', fovY: 2 * Math.atan(1.4 / 5) * 180 / Math.PI },
        environment: { sky: '#000000', ground: '#000000', ambient: 0, toneMapping: 'none' },
        onRequestRender() {}, onError: msg => acceptedReports.push(msg),
      });
      const acceptedDevice = accepted.computeDevice;
      const quad = accepted.createGeometry({
        positions: [-1, -0.7, 0, 1, -0.7, 0, 1, 0.7, 0, -1, 0.7, 0],
        indices: [0, 1, 2, 0, 2, 3],
      });
      accepted.add(quad, { material: { color: [42 / 255, 187 / 255, 94 / 255], unlit: true, doubleSided: true } });

      const sampleAccepted = async label => {
        const frame = await accepted.capture();
        const figure = document.createElement('figure');
        const caption = document.createElement('figcaption');
        const copy = document.createElement('canvas');
        copy.width = frame.width; copy.height = frame.height;
        caption.textContent = `${label} (live devices: ${liveDeviceCount()})`;
        copy.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
        figure.append(caption, copy);
        document.getElementById('proof').append(figure);
        const cx = Math.floor(frame.width / 2), cy = Math.floor(frame.height / 2);
        const at = (cy * frame.width + cx) * 4;
        return [...frame.data.slice(at, at + 4)];
      };

      const makeCandidateCanvas = () => {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        document.body.append(c);
        return c;
      };

      try {
        const initialPixel = await sampleAccepted('1. Accepted baseline');
        const devicesBefore = liveDeviceCount();

        // Scenario A: candidate canvas.getContext('webgpu') === null after real requestDevice()
        const cNull = makeCandidateCanvas();
        Object.defineProperty(cNull, 'getContext', { configurable: true, value: () => null });
        let nullError = null;
        try { await createViewer(cNull, { controls: false, autoResize: false }); }
        catch (error) { nullError = { code: error?.code ?? null, message: error?.message ?? String(error) }; }
        const nullRecord = allDevices[allDevices.length - 1];
        const nullLoss = await bound(nullRecord.device.lost, 'no-context candidate device lost');
        const afterNullLive = liveDeviceCount();
        const afterNullPixel = await sampleAccepted('2. After NO_CONTEXT reject');
        cNull.remove();

        // Scenario B: mid-start setup failure (real configure + real pipelines + outputBuffer, then throw on 'viewer frame')
        const cMid = makeCandidateCanvas();
        bufferSentinel = new Error('injected viewer frame buffer failure');
        injectBufferFailureOnLabel = 'viewer frame';
        let midErrorSame = false;
        try { await createViewer(cMid, { controls: false, autoResize: false }); }
        catch (error) { midErrorSame = error === bufferSentinel; }
        const midRecord = allDevices[allDevices.length - 1];
        const midLoss = await bound(midRecord.device.lost, 'mid-start candidate device lost');
        const afterMid = {
          midErrorSame,
          lossReason: midLoss.reason,
          liveDevices: liveDeviceCount(),
          buffersCreated: midRecord.buffersCreated,
          liveBuffers: liveBuffersOf(midRecord),
          liveTextures: liveTexturesOf(midRecord),
        };
        cMid.remove();

        // Scenario C: post-start ResizeObserver failure after full real start() + real OrbitControls
        const cObs = makeCandidateCanvas();
        const activeListeners = new Map();
        const countListeners = () => { let n = 0; for (const set of activeListeners.values()) n += set.size; return n; };
        const origAdd = cObs.addEventListener.bind(cObs);
        const origRemove = cObs.removeEventListener.bind(cObs);
        cObs.addEventListener = (type, fn, opts) => {
          let set = activeListeners.get(type);
          if (!set) { set = new Set(); activeListeners.set(type, set); }
          set.add(fn);
          return origAdd(type, fn, opts);
        };
        cObs.removeEventListener = (type, fn, opts) => {
          activeListeners.get(type)?.delete(fn);
          return origRemove(type, fn, opts);
        };
        const obsSentinel = new Error('injected ResizeObserver.observe failure');
        const origObserve = ResizeObserver.prototype.observe;
        const origDisconnect = ResizeObserver.prototype.disconnect;
        let obsDisconnects = 0;
        ResizeObserver.prototype.observe = function () { throw obsSentinel; };
        ResizeObserver.prototype.disconnect = function (...args) { obsDisconnects++; return Reflect.apply(origDisconnect, this, args); };
        let obsErrorSame = false;
        const countBeforeObs = allDevices.length;
        try { await createViewer(cObs, { controls: true, autoResize: true }); }
        catch (error) { obsErrorSame = error === obsSentinel; }
        finally {
          ResizeObserver.prototype.observe = origObserve;
          ResizeObserver.prototype.disconnect = origDisconnect;
        }
        const obsRecord = allDevices[allDevices.length - 1];
        const obsLoss = await bound(obsRecord.device.lost, 'post-start candidate device lost');
        // Wait briefly to confirm late device.lost does not resurrect the rejected Viewer.
        await new Promise(resolve => setTimeout(resolve, 100));
        const afterObs = {
          obsErrorSame,
          lossReason: obsLoss.reason,
          devicesSpawned: allDevices.length - countBeforeObs,
          liveDevices: liveDeviceCount(),
          buffersCreated: obsRecord.buffersCreated,
          texturesCreated: obsRecord.texturesCreated,
          liveBuffers: liveBuffersOf(obsRecord),
          liveTextures: liveTexturesOf(obsRecord),
          activeListeners: countListeners(),
          obsDisconnects,
        };
        const afterMidAndObsPixel = await sampleAccepted('3. After mid-setup & ResizeObserver rejects');
        cObs.remove();

        // Scenario D: 3 repeated failures confirm zero accumulation
        const repeatLives = [];
        for (let i = 0; i < 3; i++) {
          const cRep = makeCandidateCanvas();
          Object.defineProperty(cRep, 'getContext', { configurable: true, value: () => null });
          try { await createViewer(cRep, { controls: false, autoResize: false }); } catch { /* expected */ }
          const rec = allDevices[allDevices.length - 1];
          await bound(rec.device.lost, `repeat ${i} lost`);
          repeatLives.push(liveDeviceCount());
          cRep.remove();
        }
        const afterRepeatPixel = await sampleAccepted('4. After 3 repeated rejects');

        // Finally dispose the accepted Viewer and confirm zero live devices/buffers/textures remain.
        const acceptedStillSameDevice = accepted.computeDevice === acceptedDevice && accepted.ready;
        const acceptedRecord = deviceMeta.get(acceptedDevice);
        accepted.dispose();
        const acceptedLoss = await bound(acceptedDevice.lost, 'accepted viewer dispose lost');
        return {
          devicesBefore,
          initialPixel,
          nullError,
          nullLossReason: nullLoss.reason,
          nullDestroyCalls: nullRecord.destroyed,
          afterNullLive,
          afterNullPixel,
          afterMid,
          afterObs,
          afterMidAndObsPixel,
          repeatLives,
          afterRepeatPixel,
          acceptedStillSameDevice,
          acceptedLossReason: acceptedLoss.reason,
          finalLiveDevices: liveDeviceCount(),
          acceptedLiveBuffers: liveBuffersOf(acceptedRecord),
          acceptedLiveTextures: liveTexturesOf(acceptedRecord),
          acceptedReports,
        };
      } finally {
        accepted.dispose();
        Object.defineProperty(adapterProto, 'requestDevice', reqDesc);
        GPUDevice.prototype.destroy = nativeDestroyDevice;
        GPUDevice.prototype.createBuffer = nativeCreateBuffer;
        GPUBuffer.prototype.destroy = nativeDestroyBuffer;
        GPUDevice.prototype.createTexture = nativeCreateTexture;
        GPUTexture.prototype.destroy = nativeDestroyTexture;
      }
    });

    const output = process.env.GPU_INIT_FAILURE_EVIDENCE_DIR;
    if (output) {
      await mkdir(output, { recursive: true });
      await writeFile(join(output, 'viewer-init-failure.json'), JSON.stringify({ data, errors }, null, 2));
      await page.screenshot({ path: join(output, 'viewer-init-failure.png'), fullPage: true });
    }
    t.diagnostic(JSON.stringify({ data, errors }));

    const expectGreen = pixel => [42, 187, 94, 255].forEach((want, i) => assert.ok(Math.abs(pixel[i] - want) <= 2, JSON.stringify({ pixel, want })));
    assert.equal(data.devicesBefore, 1);
    expectGreen(data.initialPixel);
    assert.equal(data.nullError?.code, 'NO_CONTEXT');
    assert.equal(data.nullLossReason, 'destroyed');
    assert.equal(data.nullDestroyCalls, 1);
    assert.equal(data.afterNullLive, 1);
    expectGreen(data.afterNullPixel);

    assert.equal(data.afterMid.midErrorSame, true);
    assert.equal(data.afterMid.lossReason, 'destroyed');
    assert.equal(data.afterMid.liveDevices, 1);
    assert.ok(data.afterMid.buffersCreated >= 1, 'mid-start must allocate at least outputBuffer before failing');
    assert.equal(data.afterMid.liveBuffers, 0);
    assert.equal(data.afterMid.liveTextures, 0);

    assert.equal(data.afterObs.obsErrorSame, true);
    assert.equal(data.afterObs.lossReason, 'destroyed');
    assert.equal(data.afterObs.devicesSpawned, 1, 'late device.lost must not resurrect rejected viewer');
    assert.equal(data.afterObs.liveDevices, 1);
    assert.ok(data.afterObs.buffersCreated >= 5 && data.afterObs.texturesCreated >= 5);
    assert.equal(data.afterObs.liveBuffers, 0);
    assert.equal(data.afterObs.liveTextures, 0);
    assert.equal(data.afterObs.activeListeners, 0);
    assert.equal(data.afterObs.obsDisconnects, 1);
    expectGreen(data.afterMidAndObsPixel);

    assert.deepEqual(data.repeatLives, [1, 1, 1]);
    expectGreen(data.afterRepeatPixel);
    assert.equal(data.acceptedStillSameDevice, true);
    assert.equal(data.acceptedLossReason, 'destroyed');
    assert.equal(data.finalLiveDevices, 0);
    assert.equal(data.acceptedLiveBuffers, 0);
    assert.equal(data.acceptedLiveTextures, 0);
    assert.deepEqual(data.acceptedReports, []);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
