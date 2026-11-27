import assert from 'node:assert/strict';

/** Observe real input, the worker transport, and renderer body replacement without changing their payloads. */
export async function installFilletTimingObserver() {
  const { GpuRenderer } = await import('/src/viewport/gpuRenderer.ts');
  const post = Worker.prototype.postMessage, setBodies = GpuRenderer.prototype.setBodies;
  const wireNodes = new WeakMap(), observed = new WeakSet();
  let sample = null, raf = 0;
  const time = () => performance.now();

  Worker.prototype.postMessage = function (message, ...rest) {
    if (!observed.has(this)) {
      observed.add(this);
      const receive = this.onmessage;
      if (receive) this.onmessage = function (event) {
        const result = event.data?.result;
        const request = result && sample?.requests.find(row => row.id === event.data.id);
        if (request && request.revision === result.revision) {
          request.reply = time();
          request.workerMs = result.wallTime * 1000;
          request.ok = result.ok;
        }
        return receive.call(this, event);
      };
      wireNodes.set(this, new Map());
    }
    const nodes = wireNodes.get(this);
    for (const [id, node] of message?.doc?.added ?? []) if (node.kind === 'fillet') nodes.set(id, node.radius);
    if (sample && message?.type === 'preview') sample.requests.push({ id: message.id,
      revision: message.revision, radius: nodes.get(message.doc.ids.at(-1)) ?? null, post: time() });
    return post.call(this, message, ...rest);
  };
  GpuRenderer.prototype.setBodies = function (bodies) {
    const result = setBodies.call(this, bodies);
    if (sample) {
      const face = bodies[0]?.mesh.faces.find(item => item.name === 'n2.face');
      if (face?.exact?.kind === 'cylinder') sample.geometry.push({ radius: face.exact.r, at: time() });
    }
    return result;
  };
  const canvas = document.querySelector('canvas.vp-canvas');
  for (const type of ['pointerdown', 'pointermove', 'pointerup']) canvas.addEventListener(type, event => {
    if (!sample || !event.isTrusted || event.pointerType !== 'mouse') return;
    sample.pointer.push({ type, at: time(), y: event.clientY, buttons: event.buttons });
  }, { capture: true });

  function readFrame() {
    if (!sample) return;
    const input = document.querySelector('.hud input[aria-label="Radius"]');
    const hud = document.querySelector('.hud .status');
    const readout = document.querySelector('.gizmo-readout');
    if (input && hud) {
      const row = { at: time(), radius: Number(input.value), status: hud.textContent.trim(), readout: readout?.textContent ?? '' };
      const prior = sample.frames.at(-1);
      if (!prior || prior.radius !== row.radius || prior.status !== row.status || prior.readout !== row.readout) sample.frames.push(row);
    }
    raf = requestAnimationFrame(readFrame);
  }
  window.__filletTiming = {
    start() {
      if (sample) throw new Error('Previous timing sample is still open');
      sample = { pointer: [], frames: [], requests: [], geometry: [] };
      raf = requestAnimationFrame(readFrame);
    },
    stop() { cancelAnimationFrame(raf); const result = sample; sample = null; return result; },
  };
}

const near = (a, b) => Math.abs(a - b) < 1e-7;

function summarizeTrace(trace, targets) {
  const moves = trace.pointer.filter(item => item.type === 'pointermove' && item.buttons === 1);
  const lifts = trace.pointer.filter(item => item.type === 'pointerup');
  assert.equal(moves.length, targets.length, 'one trusted browser move per commanded step');
  assert.equal(lifts.length, 1);
  const target = targets.at(-1), last = moves.at(-1), [lift] = lifts;
  const firstMove = moves[0];
  const firstReadout = trace.frames.find(row => row.at >= firstMove.at && row.radius !== 1 && row.readout.includes('Radius'));
  const firstGeometry = trace.geometry.find(row => row.at >= firstMove.at && !near(row.radius, 1));
  assert.ok(firstReadout, 'first changed radius appears in the viewport readout');
  assert.ok(firstGeometry, 'the renderer receives changed Fillet geometry');
  assert.ok(trace.requests.length > 0, 'preview reaches the actual worker');
  for (const row of trace.requests) {
    assert.ok(Number.isFinite(row.radius) && Number.isFinite(row.reply) && Number.isFinite(row.workerMs) && row.workerMs >= 0);
    assert.equal(row.ok, true);
    assert.ok(row.reply >= row.post);
  }
  assert.ok(near(trace.geometry.at(-1)?.radius, target));
  const accepted = trace.requests.find(row => near(row.radius, target) && row.reply >= last.at);
  const ready = trace.frames.find(row => row.radius === target && row.status === 'preview' && row.at >= last.at);
  assert.ok(accepted && ready, 'the final target is evaluated and ready after the last move');
  const installed = trace.geometry.find(row => near(row.radius, target) && row.at >= accepted.reply);
  assert.ok(installed, 'the renderer receives the last accepted target');
  assert.ok(trace.geometry.filter(row => row.at >= installed.at).every(row => near(row.radius, target)),
    'no earlier result replaces the final renderer geometry');
  const requestGapsMs = trace.requests.slice(1).map((row, i) => row.post - trace.requests[i].post);
  const replyGapsMs = trace.requests.slice(1).map((row, i) => row.reply - trace.requests[i].reply);
  const supersededReplies = trace.requests.filter(row => {
    const lastMoveBeforeReply = moves.findLastIndex(move => move.at <= row.reply);
    return lastMoveBeforeReply >= 0 && !near(row.radius, targets[lastMoveBeforeReply]);
  }).length;
  return {
    readoutMs: firstReadout.at - firstMove.at, renderInputMs: firstGeometry.at - firstMove.at,
    releaseSettleMs: Math.max(0, Math.max(ready.at, installed.at) - lift.at),
    releaseBeforeGeometry: lift.at < installed.at,
    requestCount: trace.requests.length, supersededReplies, requestGapsMs, replyGapsMs,
    roundTripsMs: trace.requests.map(row => row.reply - row.post), workerMs: trace.requests.map(row => row.workerMs),
  };
}

/** Use actual mouse events and leave the last correctly settled preview open for an explicit Apply. */
export async function timeFilletDrags(f, { origin: [x, y], pixelsPerMm, prepare, cancel }) {
  const groups = [{ kind: 'warmup', targets: [2], count: 1 },
    { kind: 'single', targets: [2], count: 8 }, { kind: 'reversal', targets: [2, 3, 1, 3, 2], count: 5 }];
  for (const group of groups) {
    for (let i = 0; i < group.count; i++) {
      f.phase = `Timed Fillet ${group.kind} ${i + 1}`;
      await prepare();
      await f.page.mouse.move(x, y);
      await f.page.evaluate(() => window.__filletTiming.start());
      await f.page.mouse.down();
      for (const radius of group.targets) await f.page.mouse.move(x, y - (radius - 1) * pixelsPerMm);
      await f.page.mouse.up();
      const target = group.targets.at(-1);
      await f.page.waitForFunction(expected => Number(document.querySelector('.hud input[aria-label="Radius"]')?.value) === expected &&
        document.querySelector('.hud .status')?.textContent.trim() === 'preview', target);
      const trace = await f.page.evaluate(async () => {
        // Allow frames for renderer installation and observe an old result if one arrives after the ready state.
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))));
        return window.__filletTiming.stop();
      });
      const row = { label: 'timed-fillet', kind: group.kind, sample: i + 1, trace };
      f.report.observations.push(row);
      try { row.metrics = summarizeTrace(trace, group.targets); } finally { await f.persist(); }
      if (group !== groups.at(-1) || i < group.count - 1) await cancel();
    }
  }
}
