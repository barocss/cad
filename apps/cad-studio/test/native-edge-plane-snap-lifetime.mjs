import assert from 'node:assert/strict';

// Hold delivery of one real Worker result. Request, computation and transferred buffers stay intact.
export function installCrossingRebuildHold() {
  const worker = Worker.prototype, send = worker.postMessage;
  const descriptor = Object.getOwnPropertyDescriptor(worker, 'onmessage');
  let armed = false, claimed, held, observed;
  worker.postMessage = function (message, ...rest) {
    if (armed && message?.type === 'evaluate') {
      claimed = { id: message.id, worker: this };
      armed = false;
    }
    return send.call(this, message, ...rest);
  };
  Object.defineProperty(worker, 'onmessage', {
    configurable: true, get: descriptor.get,
    set(fn) {
      descriptor.set.call(this, typeof fn === 'function' ? function (event) {
        if (claimed?.worker === this && event.data?.id === claimed.id && event.data.result) {
          observed = { id: event.data.id, ok: event.data.result.ok, revision: event.data.result.revision };
          held = () => fn.call(this, event);
          claimed = undefined;
          return;
        }
        return fn.call(this, event);
      } : fn);
    },
  });
  window.__crossingRebuild = {
    arm() { if (armed || claimed || held) throw Error('The previous evaluation remains pending'); armed = true; },
    read: () => held ? observed : null,
    release() { if (!held) throw Error('No evaluation is held'); const deliver = held; held = undefined; deliver(); },
  };
}

export async function verifyCrossingLifetime({ f, source, fileName, begin, pixel, hover, cue, target, endpoint, other, saveInProject }) {
  const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
  const openSource = async () => {
    await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
      name: fileName, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
    });
    await f.same(source);
  };
  const assertGridRectangle = (doc, previous, min = other, max = [4, 6]) => {
    assert.deepEqual(doc.nodes.slice(0, -1), previous.nodes);
    assert.equal(doc.nodes.length, previous.nodes.length + 1);
    assert.deepEqual(doc.outputs, previous.outputs);
    const sketch = doc.nodes.at(-1);
    assert.equal(sketch.profile, 'rectangle');
    assert.deepEqual(sketch.min, min);
    assert.deepEqual(sketch.max, max);
    assert.deepEqual(sketch.plane, { origin: [0, 0, 3], normal: [0, 0, 1], xAxis: [1, 0, 0] });
    return sketch;
  };

  f.phase = 'New part clears an existing crossing before the same pointer position is used';
  await begin(3);
  await hover([...target, 3], 'Crossing');
  await f.snapshot('01-crossing-before-new');
  await button('New part').click();
  await f.sketchPanel().waitFor({ state: 'hidden' });
  await cue().waitFor({ state: 'hidden' });
  await f.ready();
  const empty = await f.doc();
  assert.deepEqual(empty.nodes, []);
  await begin(3);
  await f.page.mouse.click(...await hover([...target, 3], null));
  const newEnd = [16, 16];
  await f.page.mouse.click(...await hover([...newEnd, 3], null));
  const afterNew = (await f.finishSketch('02-new-part-uses-grid')).doc;
  assertGridRectangle(afterNew, empty, [4, 6], newEnd);
  await f.undo();
  await f.same(empty);

  f.phase = 'The same document discards the old crossing while its shorter solid evaluates';
  await openSource();
  await begin(3);
  await hover([...target, 3], 'Crossing');
  await button('Model', f.page.locator('.mode')).click();
  await f.sketchPanel().waitFor({ state: 'hidden' });
  await f.openFeatureEditor(1, 'source extrude');
  const distance = f.editor().getByLabel('Distance', { exact: true });
  assert.equal(await distance.inputValue(), '10');
  await distance.fill('2');
  const edited = (await f.applyEditor(source, '03-history-distance-two')).doc;
  assert.deepEqual(edited, { ...source, nodes: [source.nodes[0], { ...source.nodes[1], height: 2 }] });

  // History Apply publishes its already verified result. Redo gives the same document revision a real rebuild.
  await f.undo();
  await f.same(source);
  await begin(3);
  await hover([...target, 3], 'Crossing');
  await button('Model', f.page.locator('.mode')).click();
  await f.sketchPanel().waitFor({ state: 'hidden' });
  await f.page.evaluate(() => window.__crossingRebuild.arm());
  await button('Redo').click();
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.[1]?.height === 2 && window.__crossingRebuild.read()?.ok);
  await button('Sketch', f.page.locator('.mode')).click();
  await f.waitToast(/Change not applied.*Wait for the computation to finish/is);
  const pending = await f.snapshot('04-rebuild-sketch-refused');
  assert.deepEqual(pending.doc, edited);
  assert.equal(pending.sketchPanel, null);
  assert.equal(pending.cue, null);
  assert.equal(pending.bodies.fresh, false);
  assert.equal(pending.bodies.bodies[0].volume, 2800);
  const held = await f.page.evaluate(() => window.__crossingRebuild.read());
  await f.page.evaluate(() => window.__crossingRebuild.release());
  await f.ready();
  await f.dismissToasts();
  await begin(3);
  await f.page.mouse.click(...await hover([...target, 3], null));
  await f.page.mouse.click(...await hover([...other, 3], null));
  const rebuilt = (await f.finishSketch('05-rebuilt-source-uses-grid')).doc;
  assertGridRectangle(rebuilt, edited);
  const [stock] = await f.inspect('short-source-solid', rebuilt, 'extrude');
  assert.ok(stock.valid);
  assert.ok(Math.abs(stock.volume - 560) < 1e-9);
  assert.equal(Math.max(...stock.corners.map(point => point[2])), 2);
  f.report.observations.push({ label: 'actual-held-worker-result', held, oldHeight: 10, currentHeight: 2, volume: stock.volume });
  await f.undo();
  await f.same(edited);
  await f.undo();
  await f.same(source);

  f.phase = 'Rapid clicks accept two separate current crossings after the source is restored';
  await begin(3);
  const opposite = [24.234567, 20.345678], oppositeEnd = [20, 17];
  const clicks = [await pixel([...target, 3]), await pixel([...other, 3]),
    await pixel([...opposite, 3]), await pixel([...oppositeEnd, 3])];
  await hover([...target, 3], 'Crossing');
  for (const click of clicks) await f.page.mouse.click(...click);
  await f.same(source);
  const rapid = (await f.finishSketch('06-rapid-crossings-commit-once')).doc;
  assert.deepEqual(rapid.nodes.slice(0, -1), source.nodes);
  assert.equal(rapid.nodes.length, source.nodes.length + 1);
  assert.deepEqual(rapid.outputs, source.outputs);
  const rectangle = rapid.nodes.at(-1);
  assert.equal(rectangle.profile, 'rectangle');
  assert.deepEqual(rectangle.min, other);
  assert.deepEqual(rectangle.max, endpoint);
  assert.equal(rectangle.regions?.length, 1);
  assert.equal(rectangle.holes, undefined);
  const region = rectangle.regions[0];
  assert.equal(region.length, 4);
  const points = region.map(edge => {
    assert.equal(edge.kind, 'line');
    return edge.start;
  });
  assert.deepEqual(points.sort(), [[20, 17], [20, 20.3457], [24.2346, 17], [24.2346, 20.3457]].sort());
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(rapid);
  const saved = await saveInProject(rapid, 'crossing-lifetime.bcad');
  await f.freshOpen(saved, rapid, '07-rapid-crossings-fresh-open');
}
