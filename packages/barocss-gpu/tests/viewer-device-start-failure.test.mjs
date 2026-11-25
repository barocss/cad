// Device-start and initialization failures use local fakes only; no browser, GPU, or shared resources.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Viewer } from '../dist/viewer/index.js';

function createTrackedHarness(options = {}) {
  const counts = {
    adapterRequests: 0,
    devicesAcquired: 0,
    devicesDestroyed: 0,
    configured: 0,
    unconfigured: 0,
    buffersCreated: 0,
    buffersDestroyed: 0,
    texturesCreated: 0,
    texturesDestroyed: 0,
    observersCreated: 0,
    observersDisconnected: 0,
    framesScheduled: 0,
    framesCancelled: 0,
  };
  const activeListeners = new Map();
  const activeListenerCount = () => {
    let total = 0;
    for (const set of activeListeners.values()) total += set.size;
    return total;
  };
  const pendingFrames = new Map();
  let nextFrameId = 1;
  const lostResolvers = [];
  const devices = [];

  const makeDevice = () => {
    let resolveLost;
    const lost = new Promise(resolve => { resolveLost = resolve; });
    lostResolvers.push(resolveLost);
    let destroyed = false;
    const device = {
      limits: { maxTextureDimension2D: 8192 },
      onuncapturederror: null,
      lost,
      queue: {
        writeBuffer() {},
        writeTexture(destination) {
          options.onWriteTexture?.(destination, counts);
        },
        copyExternalImageToTexture() {},
        submit() {},
        onSubmittedWorkDone: async () => {},
      },
      createBuffer(descriptor) {
        options.onCreateBuffer?.(descriptor, counts);
        counts.buffersCreated++;
        let freed = false;
        return {
          size: descriptor.size,
          destroy() {
            assert.equal(freed, false, `double-destroy on buffer ${descriptor.label}`);
            freed = true;
            counts.buffersDestroyed++;
          },
          mapAsync: async () => {},
          getMappedRange: () => new ArrayBuffer(0),
          unmap() {},
        };
      },
      createTexture(descriptor) {
        options.onCreateTexture?.(descriptor, counts);
        counts.texturesCreated++;
        let freed = false;
        return {
          width: descriptor.size?.[0] ?? 1,
          height: descriptor.size?.[1] ?? 1,
          format: descriptor.format ?? 'rgba8unorm',
          createView: () => ({}),
          destroy() {
            assert.equal(freed, false, `double-destroy on texture ${descriptor.label}`);
            freed = true;
            counts.texturesDestroyed++;
          },
        };
      },
      createSampler: () => ({}),
      createShaderModule(descriptor) {
        return {
          getCompilationInfo: async () => ({
            messages: options.shaderError && descriptor.label === 'viewer line'
              ? [{ type: 'error', lineNum: 1, message: 'injected shader error' }]
              : [],
          }),
        };
      },
      createBindGroupLayout: () => ({}),
      createPipelineLayout: () => ({}),
      createBindGroup: () => ({}),
      createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
      createRenderPipelineAsync: async descriptor => {
        options.onCreateRenderPipelineAsync?.(descriptor, counts);
        return { getBindGroupLayout: () => ({}) };
      },
      createComputePipelineAsync: async () => ({ getBindGroupLayout: () => ({}) }),
      createCommandEncoder: () => ({
        beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }),
        beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
        copyTextureToBuffer() {},
        finish: () => ({}),
      }),
      pushErrorScope() {},
      popErrorScope: async () => null,
      destroy() {
        assert.equal(destroyed, false, 'device.destroy() must not be called twice');
        destroyed = true;
        counts.devicesDestroyed++;
      },
    };
    devices.push(device);
    return device;
  };

  const gpu = {
    requestAdapter: async () => {
      counts.adapterRequests++;
      return {
        requestDevice: async () => {
          counts.devicesAcquired++;
          return makeDevice();
        },
      };
    },
    getPreferredCanvasFormat: () => 'bgra8unorm',
  };

  let listenerAddCount = 0;
  const canvas = {
    width: 64,
    height: 64,
    clientWidth: 128,
    clientHeight: 96,
    getContext(kind) {
      assert.equal(kind, 'webgpu');
      if (options.contextMode === 'null') return null;
      if (options.contextMode === 'throw') throw options.sentinel;
      return {
        configure() {
          counts.configured++;
          if (options.contextMode === 'configure') throw options.sentinel;
        },
        unconfigure() {
          counts.unconfigured++;
        },
        getCurrentTexture: () => ({ createView: () => ({}), destroy() {} }),
      };
    },
    addEventListener(type, fn, opts) {
      listenerAddCount++;
      if (options.throwOnListenerAdd === listenerAddCount) throw options.sentinel;
      let set = activeListeners.get(type);
      if (!set) { set = new Set(); activeListeners.set(type, set); }
      set.add(fn);
      void opts;
    },
    removeEventListener(type, fn) {
      activeListeners.get(type)?.delete(fn);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 128, height: 96 }),
  };

  class FakeResizeObserver {
    constructor(callback) {
      this.callback = callback;
      counts.observersCreated++;
    }
    observe() {
      if (options.throwOnObserve) throw options.sentinel;
    }
    disconnect() {
      counts.observersDisconnected++;
    }
  }

  const requestAnimationFrame = callback => {
    const id = nextFrameId++;
    counts.framesScheduled++;
    pendingFrames.set(id, callback);
    return id;
  };
  const cancelAnimationFrame = id => {
    if (pendingFrames.delete(id)) counts.framesCancelled++;
  };

  return {
    counts,
    gpu,
    canvas,
    devices,
    activeListenerCount,
    pendingFrames,
    ResizeObserver: FakeResizeObserver,
    requestAnimationFrame,
    cancelAnimationFrame,
    triggerAllLost() {
      for (const resolve of lostResolvers) resolve({ reason: 'destroyed', message: 'late device lost' });
    },
  };
}

async function withGlobals(harness, fn) {
  const keys = ['navigator', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { gpu: harness.gpu } });
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: harness.ResizeObserver });
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: harness.requestAnimationFrame });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: harness.cancelAnimationFrame });
    return await fn();
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('viewer destroys the acquired device once when its canvas context is unavailable or throws', async () => {
  for (const mode of ['null', 'throw', 'configure']) {
    const sentinel = new Error(`${mode} original failure`);
    const harness = createTrackedHarness({ contextMode: mode, sentinel });
    await withGlobals(harness, async () => {
      await assert.rejects(
        Viewer.create(harness.canvas, { controls: false, autoResize: false }),
        error => (mode === 'null' ? error?.code === 'NO_CONTEXT' : error === sentinel),
      );
      harness.triggerAllLost();
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.equal(harness.counts.devicesAcquired, 1, mode);
    assert.equal(harness.counts.devicesDestroyed, 1, mode);
    assert.equal(harness.counts.configured, mode === 'configure' ? 1 : 0, mode);
    assert.equal(harness.counts.unconfigured, 0, mode);
    assert.equal(harness.counts.adapterRequests, 1, mode);
    assert.equal(harness.devices[0].onuncapturederror, null, mode);
  }
});

test('viewer releases every partial buffer, texture, context, and device on mid-start setup failures', async () => {
  const cases = [
    { name: 'shader-error', config: { shaderError: true }, check: error => error?.code === 'SHADER' },
    {
      name: 'pipeline-async-reject',
      config: { onCreateRenderPipelineAsync(descriptor) { if (descriptor.label?.includes('line')) throw this.sentinel; } },
      check: error => error?.code === 'PIPELINE' && error.message.includes('pipeline-async-reject failure'),
    },
    {
      name: 'shadow-buffer-mid-loop',
      config: { onCreateBuffer(descriptor) { if (descriptor.label === 'viewer shadow frame 2') throw this.sentinel; } },
    },
    {
      name: 'white-texture-write-throw',
      config: { onWriteTexture(_dest, counts) { if (counts.texturesCreated === 1) throw this.sentinel; } },
    },
    {
      name: 'brdf-lut-throw',
      config: { onCreateTexture(descriptor) { if (descriptor.label === 'viewer BRDF table') throw this.sentinel; } },
    },
    {
      name: 'object-buffer-throw',
      config: { onCreateBuffer(descriptor) { if (descriptor.label === 'viewer objects') throw this.sentinel; } },
    },
  ];

  for (const item of cases) {
    const sentinel = new Error(`${item.name} failure`);
    const errors = [];
    const harness = createTrackedHarness({ ...item.config, sentinel });
    await withGlobals(harness, async () => {
      await assert.rejects(
        Viewer.create(harness.canvas, { controls: false, autoResize: false, onError: msg => errors.push(msg) }),
        item.check ?? (error => error === sentinel),
      );
      harness.triggerAllLost();
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.equal(harness.counts.devicesAcquired, 1, item.name);
    assert.equal(harness.counts.devicesDestroyed, 1, item.name);
    assert.equal(harness.counts.configured, 1, item.name);
    assert.equal(harness.counts.unconfigured, 1, item.name);
    assert.equal(harness.counts.buffersDestroyed, harness.counts.buffersCreated, `${item.name}: buffers leaked`);
    assert.equal(harness.counts.texturesDestroyed, harness.counts.texturesCreated, `${item.name}: textures leaked`);
    assert.equal(harness.counts.adapterRequests, 1, `${item.name}: late device.lost resurrected viewer`);
    assert.equal(harness.devices[0].onuncapturederror, null, item.name);
    assert.deepEqual(errors, [], item.name);
  }
});

test('viewer releases device, controls, resize observer, and frames when post-start create steps throw', async () => {
  const cases = [
    { name: 'controls-partial-listener', harnessOpts: { throwOnListenerAdd: 4 }, viewerOpts: { controls: true, autoResize: true } },
    { name: 'resize-observer-observe', harnessOpts: { throwOnObserve: true }, viewerOpts: { controls: true, autoResize: true } },
    {
      name: 'resize-onRequestRender',
      harnessOpts: {},
      viewerOpts: sentinel => ({ controls: true, autoResize: true, onRequestRender() { throw sentinel; } }),
    },
  ];

  for (const item of cases) {
    const sentinel = new Error(`${item.name} failure`);
    const errors = [];
    const harness = createTrackedHarness({ ...item.harnessOpts, sentinel });
    const opts = typeof item.viewerOpts === 'function' ? item.viewerOpts(sentinel) : item.viewerOpts;
    await withGlobals(harness, async () => {
      await assert.rejects(
        Viewer.create(harness.canvas, { ...opts, onError: msg => errors.push(msg) }),
        error => error === sentinel,
      );
      harness.triggerAllLost();
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    assert.equal(harness.counts.devicesAcquired, 1, item.name);
    assert.equal(harness.counts.devicesDestroyed, 1, item.name);
    assert.equal(harness.counts.configured, 1, item.name);
    assert.equal(harness.counts.unconfigured, 1, item.name);
    assert.equal(harness.counts.buffersDestroyed, harness.counts.buffersCreated, `${item.name}: buffers leaked`);
    assert.equal(harness.counts.texturesDestroyed, harness.counts.texturesCreated, `${item.name}: textures leaked`);
    assert.equal(harness.activeListenerCount(), 0, `${item.name}: DOM listeners leaked`);
    assert.equal(harness.counts.observersDisconnected, harness.counts.observersCreated, `${item.name}: ResizeObserver leaked`);
    assert.equal(harness.pendingFrames.size, 0, `${item.name}: animation frames leaked`);
    assert.equal(harness.counts.adapterRequests, 1, `${item.name}: late device.lost resurrected viewer`);
    assert.equal(harness.devices[0].onuncapturederror, null, item.name);
    assert.deepEqual(errors, [], item.name);
  }
});

test('repeated Viewer initialization failures do not accumulate live resources', async () => {
  let liveDevices = 0, liveBuffers = 0, liveTextures = 0, liveObservers = 0;
  const scenarios = [
    { contextMode: 'null' },
    { contextMode: 'configure' },
    { onCreateTexture(descriptor) { if (descriptor.label === 'viewer BRDF table') throw this.sentinel; } },
    { throwOnListenerAdd: 3 },
    { throwOnObserve: true },
  ];
  for (const scenario of scenarios) {
    const sentinel = new Error('repeat failure');
    const harness = createTrackedHarness({ ...scenario, sentinel });
    await withGlobals(harness, async () => {
      await assert.rejects(Viewer.create(harness.canvas, { controls: true, autoResize: true }));
      harness.triggerAllLost();
      await new Promise(resolve => setTimeout(resolve, 5));
    });
    liveDevices += harness.counts.devicesAcquired - harness.counts.devicesDestroyed;
    liveBuffers += harness.counts.buffersCreated - harness.counts.buffersDestroyed;
    liveTextures += harness.counts.texturesCreated - harness.counts.texturesDestroyed;
    liveObservers += harness.counts.observersCreated - harness.counts.observersDisconnected;
    assert.equal(harness.activeListenerCount(), 0);
    assert.equal(harness.pendingFrames.size, 0);
  }
  assert.deepEqual({ liveDevices, liveBuffers, liveTextures, liveObservers }, { liveDevices: 0, liveBuffers: 0, liveTextures: 0, liveObservers: 0 });
});
