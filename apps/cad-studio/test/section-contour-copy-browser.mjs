import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/section-contour-copy-browser.mjs',
  'apps/cad-studio/test/flow-helper.mjs',
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/app/sectionSketch.ts',
  'apps/cad-studio/src/ui/SectionBar.tsx',
  'apps/cad-studio/src/viewport/useSectionEvaluation.ts',
  'packages/barocss-cad-model/src/app/sectionSketchProfile.ts',
];
const width = 40, depth = 30, height = 10, z = 5;
const holes = [{ center: [10, 9], radius: 3 }, { center: [28, 20], radius: 2 }];
// Fixed against the original faceProfile fitting scale and allowance for stored coordinates.
const copyMM = width * 2e-4 + 1e-4;
const nativeMM = 1e-7;
const nativeMM3 = 1e-6;

const f = await createFlow({
  name: 'section-contour-copy',
  output: process.argv[2],
  envFrozen: 'SECTION_CONTOUR_COPY_SOURCE_FROZEN',
  initialFiles: pins,
  requiredFrozen: pins,
  qualification: 'Desktop Studio section contour selection, independent sketch geometry, history, Save and fresh Open.',
  limits: [
    'One 40 × 30 × 10 mm native stock with zero, one or two circular through holes. Positive Z cut at Z = 5 mm.',
    'The malformed cap is a real exact worker reply with added display triangles. This is a controlled failure, not a naturally observed tessellation defect.',
  ],
  snapshotExtra: () => ({ section: window.__studioSection() }),
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve } from '@barocss/cad';
import { readStudioFile } from '@barocss/cad-model/engine/container';
import { partBreps } from '@barocss/cad-model/engine/evaluate';

const { savedFile, native } = JSON.parse(process.argv[3]);
const read = await readStudioFile(readFileSync(savedFile ?? process.argv[2]));
assert.ok(!('error' in read), JSON.stringify(read));
const bodies = native ? partBreps(read.doc).map(({ key, brep }) => {
  const check = checkBrep(brep, { strict: true });
  assert.ok(check.valid, JSON.stringify(check.issues));
  assert.deepEqual(brep.bodies.map(body => body.kind), ['solid']);
  const samples = brep.edges.filter(edge => edge.curve.degree > 1).flatMap(({ curve }) => {
    const [a, b] = curveDomain(curve);
    return [0, .25, .5, .75, 1].map(t => evaluateCurve(curve, a + t * (b - a)));
  });
  return { key, volume: brepMassProperties(brep, 1).volume, samples };
}) : [];
console.log(JSON.stringify({ doc: read.doc, bodies }));
`,
});

function stock(count) {
  const nodes = [
    { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [width, depth], id: 'n0' },
    { kind: 'extrude', sketch: 0, height, id: 'n1' },
    ...holes.slice(0, count).map((hole, index) => ({
      kind: 'hole', parent: { node: index + 1, side: 'solid' }, axis: 'z', ...hole, id: 'n' + (index + 2),
    })),
  ];
  const output = nodes.length - 1;
  return { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes,
    outputs: { ['b' + output]: { node: output, side: 'solid' } }, nextId: nodes.length };
}

function near(actual, expected, tolerance, label) {
  const error = Math.abs(actual - expected);
  assert.ok(error <= tolerance, `${label}: ${actual} versus ${expected} ± ${tolerance}`);
  return error;
}

const distance = (a, b) => Math.hypot(...a.map((coordinate, axis) => coordinate - b[axis]));

function sketchGeometry(doc, source, mode, count) {
  const sketch = doc.nodes.at(-1);
  assert.equal(doc.nodes.length, source.nodes.length + 1);
  assert.deepEqual({ ...doc, nodes: doc.nodes.slice(0, -1), nextId: source.nextId }, source);
  assert.equal(sketch.kind, 'sketch');
  assert.equal(sketch.on, undefined);
  assert.equal(sketch.association, undefined);

  const { origin, normal, xAxis } = sketch.plane;
  near(origin[2], z, nativeMM, 'sketch plane origin Z');
  near(Math.hypot(normal[0], normal[1], Math.abs(normal[2]) - 1), 0, nativeMM, 'sketch plane normal');
  near(Math.hypot(...xAxis), 1, nativeMM, 'sketch X axis length');
  near(xAxis[2], 0, nativeMM, 'sketch X axis lies on the section');
  const [nx, ny, nz] = normal, [ux, uy, uz] = xAxis;
  const vAxis = [ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux];
  const world = ([u, v]) => origin.map((p, i) => p + u * xAxis[i] + v * vAxis[i]);

  const readLoop = loop => {
    if (loop.length === 1 && loop[0].kind === 'arc') {
      const [{ center, start }] = loop;
      return { center: world(center), radius: distance(world(center), world(start)) };
    }
    assert.ok(loop.every(segment => segment.kind === 'line'), 'four straight sides required');
    return { corners: loop.map(segment => world(segment.start)) };
  };
  let main;
  switch (sketch.profile) {
    case 'circle': main = { center: world(sketch.center), radius: sketch.radius }; break;
    case 'loop': main = readLoop(sketch.segments); break;
    case 'polygon': main = { corners: sketch.points.map(world) }; break;
    case 'rectangle': {
      const [minX, minY] = sketch.min, [maxX, maxY] = sketch.max;
      main = { corners: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]].map(world) };
      break;
    }
    default: assert.fail(`Unsupported saved profile ${sketch.profile}`);
  }
  const regions = (sketch.regions ?? []).map(readLoop);
  const voids = (sketch.holes ?? []).map(readLoop);
  assert.equal(regions.length, mode === 'Inner only' ? count - 1 : 0, 'independent extra regions');
  assert.equal(voids.length, mode === 'All' ? count : 0, 'nested voids');

  let cornerErrorMM = null;
  if (mode !== 'Inner only') {
    const known = [[0, 0, z], [width, 0, z], [width, depth, z], [0, depth, z]];
    assert.equal(main.corners?.length, known.length);
    const remaining = new Set(known);
    const errors = main.corners.map(corner => {
      const target = [...remaining].find(point => distance(point, corner) <= copyMM);
      assert.ok(target, `world corner ${corner}`);
      remaining.delete(target);
      return distance(target, corner);
    });
    assert.deepEqual([...remaining], []);
    main.corners.forEach((corner, i) => {
      const next = main.corners[(i + 1) % main.corners.length];
      assert.ok(Math.min(Math.abs(next[0] - corner[0]), Math.abs(next[1] - corner[1])) <= copyMM,
        'successive corners must follow a rectangle side');
    });
    cornerErrorMM = Math.max(...errors);
  }

  const circles = mode === 'Inner only' ? [main, ...regions] : voids;
  const expected = new Set(holes.slice(0, mode === 'Outer only' ? 0 : count));
  const measurements = circles.map(circle => {
    assert.ok(circle.center, 'a circular contour is required');
    const hole = [...expected].find(h => distance([...h.center, z], circle.center) <= copyMM);
    assert.ok(hole, `world centre ${circle.center}`);
    expected.delete(hole);
    return { ...circle, centerErrorMM: distance([...hole.center, z], circle.center),
      radiusErrorMM: near(circle.radius, hole.radius, copyMM, 'world radius') };
  });
  assert.deepEqual([...expected], []);
  return { corners: main.corners ?? [], measurements, cornerErrorMM, regions: regions.length, voids: voids.length };
}

// Arm one actual section reply. Holding or changing this reply leaves the worker and native packets unmodified.
function installSectionReplyGate() {
  const NativeWorker = window.Worker;
  let next = null, held = null;
  const ids = new Map();
  window.__sectionReplyGate = {
    arm(mode) { next = mode; },
    held: () => !!held,
    release() {
      const deliver = held;
      held = null;
      return deliver();
    },
  };
  window.Worker = class extends NativeWorker {
    postMessage(request, ...rest) {
      if (request.type === 'section' && next) {
        ids.set(request.id, next);
        next = null;
      }
      return super.postMessage(request, ...rest);
    }
    set onmessage(listener) {
      super.onmessage = listener ? event => {
        const id = event.data?.id, mode = ids.get(id);
        if (mode && event.data?.result) {
          ids.delete(id);
          held = () => {
            const injection = mode === 'fill-rim' ? fillRim(event.data.result) : null;
            listener.call(this, event);
            return { id, injection };
          };
          return;
        }
        listener.call(this, event);
      } : null;
    }
    get onmessage() { return super.onmessage; }
  };

  function fillRim(result) {
    const body = result.bodies?.find(candidate => candidate.key.endsWith('_positive'));
    const mesh = body?.mesh;
    const cap = mesh?.faces.find(face => face.name.endsWith('.cut.bottom') && face.normal[2] < -0.9);
    if (!cap) throw Error('Expected the real lower cap of the kept positive Z body.');
    const nativeCap = body.sectionCaps?.find(record => record.faceId === cap.id);
    if (nativeCap?.status !== 'known' || nativeCap.boundary.holes.length !== 1)
      throw Error('Expected current native evidence of one bore on the cap.');

    const rim = new Map();
    for (const vertex of mesh.indices) {
      if (mesh.faceOfVertex[vertex] !== cap.index) continue;
      const [x, y, z] = mesh.positions.subarray(3 * vertex, 3 * vertex + 3);
      if (Math.abs(Math.hypot(x - 10, y - 9) - 3) > 1e-7 || Math.abs(z - 5) > 1e-7) continue;
      rim.set([x, y].map(n => Math.round(n * 1e5)).join(','), { angle: Math.atan2(y - 9, x - 10), vertex });
    }
    const ring = [...rim.values()].sort((a, b) => b.angle - a.angle).map(({ vertex }) => vertex);
    if (ring.length < 6) throw Error('Expected the real, indexed R3 cap rim.');
    const additions = [];
    for (let i = 1; i + 1 < ring.length; i++) additions.push(ring[0], ring[i], ring[i + 1]);
    const merged = new Uint32Array(mesh.indices.length + additions.length);
    merged.set(mesh.indices);
    merged.set(additions, mesh.indices.length);
    mesh.indices = merged;
    return { body: body.key, cap: cap.name, nativeCap, rimVertices: ring.length, addedTriangles: additions.length / 3 };
  }
}

const button = name => f.page.getByRole('button', { name, exact: true });
const outlines = () => f.page.getByLabel('Section outlines', { exact: true });
const sectionState = () => f.page.evaluate(() => window.__studioSection());
const historyState = () => f.page.evaluate(() => ({
  entries: [...document.querySelectorAll('.history .hs')].map(item => item.getAttribute('aria-label')),
  undo: document.querySelector('button[aria-label="Undo"]')?.getAttribute('data-tip'),
  redo: document.querySelector('button[aria-label="Redo"]')?.getAttribute('data-tip'),
  undoDisabled: document.querySelector('button[aria-label="Undo"]')?.disabled,
  redoDisabled: document.querySelector('button[aria-label="Redo"]')?.disabled,
}));
const useMode = label => outlines().selectOption({ label });
const waitExact = normal => f.page.waitForFunction(expected => {
  const section = window.__studioSection();
  return section?.exact && section.bodies === 1 && section.planes.length === 1 &&
    section.planes[0].normal.every((n, axis) => n === expected[axis]);
}, normal);

async function open(count) {
  f.phase = `Open ${count}-hole stock`;
  await f.newPage();
  const source = stock(count);
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({
    name: `section-${count}-holes.bcad`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  return source;
}

async function startSection() {
  await button('Section view').click();
  await outlines().waitFor();
  assert.equal(await outlines().locator('option:checked').textContent(), 'All');
  await button('Section across Z').click();
  await waitExact([0, 0, 1]);
  near((await sectionState()).planes[0].offset, z, nativeMM, 'section offset');
}

async function preserve(source, history, section) {
  await f.same(source);
  assert.deepEqual(await historyState(), history);
  assert.deepEqual(await sectionState(), section);
  assert.equal(await f.sketchPanel().count(), 0);
}

async function extrudeInner(sketchDoc, source) {
  f.phase = 'Extrude the independent R3 inner contour by 2 mm';
  const index = sketchDoc.nodes.length - 1;
  await f.page.getByRole('group', { name: 'History', exact: true }).locator('.hs.sketch').click();
  await f.editor().waitFor();
  await f.closeEditor();
  assert.deepEqual(await f.page.evaluate(() => window.__studioSelection.selection.sketches), [index]);
  await f.openExtrudeHud();
  const accepted = (await f.applyExtrude({ distance: 2, previous: sketchDoc, label: 'one-inner-r3' })).doc;
  assert.deepEqual(accepted.nodes.slice(0, -1), sketchDoc.nodes);
  assert.equal(accepted.nodes.at(-1).kind, 'extrude');
  assert.equal(accepted.nodes.at(-1).sketch, index);
  const newKeys = Object.keys(accepted.outputs).filter(key => !source.outputs[key]);
  assert.equal(newKeys.length, 1);
  const originalKey = Object.keys(source.outputs)[0];
  assert.deepEqual(accepted.outputs[originalKey], source.outputs[originalKey]);

  const saved = await f.save('one-inner-r3-extruded');
  const native = await f.inspect('one-inner-r3-native', saved.doc, { savedFile: saved.file, native: true });
  assert.deepEqual(native.doc, accepted);
  assert.equal(native.bodies.length, 2);
  const original = native.bodies.find(body => body.key === originalKey);
  const cylinder = native.bodies.find(body => body.key === newKeys[0]);
  near(original.volume, (width * depth - 9 * Math.PI) * height, nativeMM3, 'original bored solid volume in mm³');
  const volumeErrorMM3 = near(cylinder.volume, 18 * Math.PI, nativeMM3, 'independent native cylinder volume in mm³');
  assert.ok(cylinder.samples.length > 0);
  const levels = cylinder.samples.map(point => point[2]);
  for (const [x, y] of cylinder.samples) near(Math.hypot(x - 10, y - 9), 3, copyMM, 'native wall radius in mm');
  const end = z + 2 * sketchDoc.nodes[index].plane.normal[2];
  near(Math.min(...levels), Math.min(z, end), nativeMM, 'native cylinder base Z');
  near(Math.max(...levels), Math.max(z, end), nativeMM, 'native cylinder tip Z');
  await f.freshOpen(saved.file, saved.doc, 'one-inner-r3-extruded-reopened');
  f.report.observations.push({ label: 'independent-native-extrusion', originalVolumeMM3: original.volume,
    cylinderVolumeMM3: cylinder.volume, volumeErrorMM3, zExtentMM: [Math.min(...levels), Math.max(...levels)] });
}

await f.run(async () => {
  const origin = new URL(f.server.resolvedUrls.local[0]).origin;
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== origin ? route.abort() : route.continue();
    });
    await context.addInitScript(installSectionReplyGate);
    return context;
  };
  f.report.observations.push({ label: 'fixed-tolerances', copyMM, nativeMM, nativeMM3 });

  for (const count of [0, 1, 2]) {
    const modes = count ? ['All', 'Outer only', 'Inner only'] : ['All', 'Outer only'];
    for (const mode of modes) {
      const source = await open(count);
      const tag = count + '-' + mode.toLowerCase().replace(' ', '-');
      f.phase = `Open the Z section and choose ${mode} for the ${count}-hole stock`;
      const history = await historyState();
      await startSection();
      const cut = await sectionState();
      await useMode(mode);
      await preserve(source, history, cut);

      if (count === 0 && mode === 'All') {
        f.phase = 'Refuse Inner only when the complete exact cap has no holes';
        await useMode('Inner only');
        await button('Sketch the section').click();
        await f.waitToast(/has no inner outlines/i);
        await preserve(source, history, cut);
        await f.snapshot('no-inner-refusal');
        await useMode('All');
      }
      if (count === 2 && mode === 'Inner only') {
        f.phase = 'Cancel the prepared two-region inner sketch';
        await button('Sketch the section').click();
        await f.sketchPanel().waitFor();
        await f.page.keyboard.press('Escape');
        await f.sketchPanel().waitFor({ state: 'hidden' });
        await f.same(source);
        assert.deepEqual(await historyState(), history);
        assert.equal((await sectionState()).mode, null);
        await f.snapshot('inner-cancelled');
        await startSection();
        await useMode(mode);
      }

      f.phase = `Start independent sketch ${tag}`;
      await button('Sketch the section').click();
      await f.sketchPanel().waitFor();
      assert.deepEqual(await f.doc(), source);
      await f.snapshot(tag + '-draft');
      const accepted = (await f.finishSketch(tag + '-finished')).doc;
      const geometry = sketchGeometry(accepted, source, mode, count);
      f.phase = `Undo and Redo ${tag}`;
      await f.undo();
      await f.same(source);
      await f.redo();
      await f.same(accepted);
      const saved = await f.save(tag);
      const decoded = await f.inspect(tag + '-decoded', accepted, { savedFile: saved.file, native: false });
      assert.deepEqual(decoded.doc, accepted);
      assert.deepEqual(sketchGeometry(decoded.doc, source, mode, count), geometry);
      const reopened = await f.freshOpen(saved.file, saved.doc, tag + '-reopened');
      assert.equal(reopened.section.mode, null);
      assert.deepEqual(sketchGeometry(reopened.doc, source, mode, count), geometry);
      f.report.observations.push({ label: tag, cutMeshVolumeMM3: cut.volume, ...geometry,
        sourcePreserved: true, undoRedo: true, freshOpen: true });
      if (count === 1 && mode === 'Inner only') await extrudeInner(reopened.doc, source);
    }
  }

  const staleSource = await open(1);
  await startSection();
  f.phase = 'Refuse a cut request overtaken by a newer section plane';
  const staleHistory = await historyState();
  await f.page.evaluate(() => window.__sectionReplyGate.arm('hold'));
  await button('Flip the section').click();
  await f.page.waitForFunction(() => window.__sectionReplyGate.held());
  const pending = await sectionState();
  assert.equal(pending.exact, false);
  near(pending.planes[0].offset, -z, nativeMM, 'pending section offset');
  await useMode('Inner only');
  await button('Sketch the section').click();
  await f.waitToast(/still being cut/i);
  await preserve(staleSource, staleHistory, pending);
  await f.snapshot('stale-refusal');
  await button('Section across X').click();
  const staleReply = await f.page.evaluate(() => window.__sectionReplyGate.release());
  await waitExact([1, 0, 0]);
  const recovered = await f.snapshot('newer-section-recovered');
  near(recovered.section.planes[0].offset, width / 2, nativeMM, 'newer section offset');
  assert.deepEqual(recovered.doc, staleSource);
  assert.deepEqual(await historyState(), staleHistory);
  f.report.observations.push({ label: 'overtaken-exact-worker-reply', ...staleReply });

  const malformedSource = await open(1);
  f.phase = 'Refuse three copy modes when displayed triangles hide one known native rim';
  const malformedHistory = await historyState();
  await button('Section view').click();
  await waitExact([0, 1, 0]);
  await f.page.evaluate(() => window.__sectionReplyGate.arm('fill-rim'));
  await button('Section across Z').click();
  await f.page.waitForFunction(() => window.__sectionReplyGate.held());
  const malformedReply = await f.page.evaluate(() => window.__sectionReplyGate.release());
  assert.ok(malformedReply.injection.addedTriangles > 0);
  await waitExact([0, 0, 1]);
  const malformed = await sectionState();
  for (const mode of ['All', 'Outer only', 'Inner only']) {
    await useMode(mode);
    await button('Sketch the section').click();
    await f.waitToast(/outline could not be read/i);
    await preserve(malformedSource, malformedHistory, malformed);
    await f.snapshot('malformed-' + mode.toLowerCase().replace(' ', '-'));
    await f.dismissToasts();
  }
  f.report.observations.push({ label: 'injected-exact-worker-reply', ...malformedReply });
});
