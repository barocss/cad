import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const rectangleDisk = process.argv.includes('--rectangle-disk');
const polygonDisk = process.argv.includes('--polygon-disk');
const polygonRim = polygonDisk && process.argv.includes('--rim-contact');
const finishNotice = process.argv.includes('--finish-notice');
const disk = rectangleDisk || polygonDisk || process.argv.includes('--disk');
const circle = !rectangleDisk && !polygonDisk && (disk || process.argv.includes('--circle'));
const sourceCenter = polygonDisk ? [29 / 3, 28 / 3] : disk ? [11, 10] : [5, 4];
const sourceRadius = disk ? 8 : 2;
const sourceSize = rectangleDisk ? 5 : sourceRadius;
const profile = polygonDisk ? 'polygon' : circle ? 'circle' : 'rectangle';
const pins = [
  'apps/cad-studio/test/reversed-extrude-end-face-browser.mjs',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/engine/faceEndExtrude.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
];
const f = await createFlow({
  name: 'reversed-extrude-end-face', output: process.argv[2], envFrozen: polygonDisk ? 'D1976_SOURCE_FROZEN' : finishNotice ? 'D1966_SOURCE_FROZEN' : rectangleDisk ? 'D1964_SOURCE_FROZEN' : disk ? 'D1958_SOURCE_FROZEN' : circle ? 'D1932_SOURCE_FROZEN' : 'D1896_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: `Extrude a ${profile} profile from an exact -Z sketch plane to the original top face.`,
  limits: ['One top-level upright rectangular or circular target Extrude and one literal source in desktop Studio.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { toPartDocument } from '@barocss/cad-model/engine/part';
import { checkBrep, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const part = toPartDocument(doc), result = evaluateCadPart(part);
console.log(JSON.stringify({
  extrude: part.features.find(feature => feature.id === 'n3'),
  solids: result.outputs.map(({ id, brep, ...output }) => ({
    id, strict: checkBrep(brep, { strict: true }), bodyCount: output.bodyCount,
    mass: massPropertiesOf({ id, brep, ...output }),
    corners: brep.vertices.map(vertex => vertex.point),
    cylinders: brep.faces.map(faceGeometry).filter(geometry => geometry.kind === 'cylinder'),
    caps: brep.faces.filter(face => face.name === id + '.top' || face.name === id + '.bottom')
      .map(face => ({ name: face.name, geometry: faceGeometry(face) })),
  })),
}));
`,
  snapshotExtra: () => ({
    undo: document.querySelector('button[aria-label="Undo"]')?.getAttribute('data-tip'),
    redo: document.querySelector('button[aria-label="Redo"]')?.getAttribute('data-tip'),
  }),
});
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    disk ? { id: 'n0', kind: 'sketch', profile: 'circle', center: [10, 10], radius: 10 }
      : { id: 'n0', kind: 'sketch', profile: 'rectangle', min: circle ? [0, 0] : [-5, -5], max: circle ? [10, 10] : [15, 15] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 5 },
    { id: 'n2', kind: 'sketch', ...(circle ? { profile: 'circle', center: disk ? [10, -8] : [5, -4], radius: sourceRadius }
      : polygonDisk ? { profile: 'polygon', points: [[1, -8], [10, 0], [15, polygonRim ? -16 : -14]] }
        : rectangleDisk ? { profile: 'rectangle', min: [9, -16], max: [14, -12], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'] } }
        : { profile: 'rectangle', min: [2, -6], max: [8, -2] }),
      plane: { origin: disk ? [1, 2, 20] : [0, 0, 20], normal: [0, 0, -1], xAxis: [1, 0, 0] } },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 3,
};
const fileName = polygonDisk ? 'downward-polygon-to-original-disk.bcad' : rectangleDisk ? 'downward-rectangle-to-original-disk.bcad' : disk ? 'downward-circle-to-original-disk.bcad' : circle ? 'reversed-circle-extrude-end-face.bcad' : 'reversed-extrude-end-face.bcad';
const feature = { id: 'n3', kind: 'face-end-extrude', sketch: 2,
  target: { body: { node: 1, side: 'solid' }, feature: 'n1', face: 'n1.top' } };
function sourceAt(size) {
  if (size === sourceSize) return seed.nodes[2];
  if (rectangleDisk) return { ...seed.nodes[2], max: [9 + size, -12] };
  return { ...seed.nodes[2], radius: size, sideTags: { outer: ['e1'] } };
}
const bound = (height, size = sourceSize) => ({
  ...seed, nodes: [seed.nodes[0], { ...seed.nodes[1], height }, sourceAt(size), feature],
  outputs: { ...seed.outputs, b3: { node: 3, side: 'solid' } }, nextId: 4,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (label, scope) => scope.getByLabel(label, { exact: true });
const equal = (a, b) => Math.abs(a - b) <= 1e-8;

async function verify(label, height, size = sourceSize) {
  const expected = bound(height, size), travel = 20 - height;
  await f.page.waitForFunction(height => window.__studioDoc?.nodes?.length === 4 && window.__studioDoc.nodes[1].height === height, height);
  await f.ready();
  const doc = await f.doc();
  if (rectangleDisk && size !== sourceSize) {
    const { outline, ...profile } = doc.nodes[2];
    assert.equal(outline?.lengths?.[0], size);
    assert.deepEqual({ ...doc, nodes: doc.nodes.map((node, i) => i === 2 ? profile : node) }, expected);
  } else assert.deepEqual(doc, expected);
  const { extrude, solids } = await f.inspect(label, doc);
  assert.deepEqual(extrude, { id: 'n3', kind: 'extrude', sketch: 'n2', height: travel });
  assert.deepEqual(solids.map(solid => solid.id), ['n1', 'n3']);
  const [stock, added] = solids;
  for (const solid of solids) {
    assert.equal(solid.strict.valid, true, solid.strict.issues.join('\n'));
    assert.equal(solid.bodyCount, 1);
  }
  if (disk) {
    assert.equal(stock.cylinders.length, 2);
    for (const support of stock.cylinders) {
      assert.ok(equal(support.r, 10) && equal(support.c[0], 10) && equal(support.c[1], 10));
    }
    assert.ok(equal(stock.mass.volume, 100 * Math.PI * height));
  } else {
    assert.equal(stock.corners.length, 8);
    assert.ok(equal(stock.mass.volume, (circle ? 100 : 400) * height));
  }
  const area = polygonDisk ? 83 : rectangleDisk ? size * 4 : circle ? size ** 2 * Math.PI : 24;
  const centre = rectangleDisk ? [10 + size / 2, 16] : sourceCenter;
  assert.ok(equal(added.mass.volume, area * travel));
  [...centre, (20 + height) / 2].forEach((value, i) => assert.ok(equal(added.mass.centroid[i], value)));
  if (circle) {
    assert.equal(added.cylinders.length, 2);
    for (const support of added.cylinders) {
      sourceCenter.forEach((value, i) => assert.ok(equal(support.c[i], value)));
      assert.ok(equal(support.r, size) && equal(Math.abs(support.a[2]), 1));
      assert.equal(support.out, 1);
    }
    for (const point of added.corners) {
      assert.ok(equal(Math.hypot(point[0] - sourceCenter[0], point[1] - sourceCenter[1]), size));
      assert.ok(equal(point[2], height) || equal(point[2], 20));
    }
  } else if (polygonDisk) {
    assert.equal(added.corners.length, 6);
    assert.equal(added.strict.counts.faces, 5);
    const footprint = [[2, 10], [11, 2], [16, 16]];
    for (const [x, y] of footprint) for (const z of [height, 20])
      assert.ok(added.corners.some(point => point.every((value, axis) => equal(value, [x, y, z][axis]))));
  } else {
    assert.equal(added.corners.length, 8);
    const xs = rectangleDisk ? [10, 10 + size] : [2, 8];
    const ys = rectangleDisk ? [14, 18] : [2, 6];
    for (const x of xs) for (const y of ys) for (const z of [height, 20])
      assert.ok(added.corners.some(point => point.every((value, axis) => equal(value, [x, y, z][axis]))));
  }
  const lower = added.caps.find(({ geometry }) => geometry.kind === 'plane' && geometry.n[2] === -1);
  const upper = added.caps.find(({ geometry }) => geometry.kind === 'plane' && geometry.n[2] === 1);
  assert.ok(lower && equal(lower.geometry.o[2], height));
  assert.ok(upper && equal(upper.geometry.o[2], 20));
  const target = stock.caps.find(cap => cap.name === 'n1.top')?.geometry;
  assert.ok(target?.kind === 'plane' && target.n[2] === 1 && equal(target.o[2], height));
  f.report.observations.push({ label, targetTop: height, travel, volume: added.mass.volume, centroid: added.mass.centroid });
}

async function editDistance(height, accepted) {
  await f.openFeatureEditor(1, 'original target Extrude');
  await field('Distance', f.editor()).fill(String(height));
  await button('Apply', f.editor()).click();
  if (accepted) {
    await f.page.waitForFunction(height => window.__studioDoc?.nodes?.[1]?.height === height, height);
    await f.closeEditor();
  } else {
    const refusal = f.editor().locator('.hud-error');
    await refusal.waitFor();
    const details = refusal.locator('details:not([open]) > summary');
    if (await details.count()) await details.click();
    assert.match(await refusal.innerText(), height < 0 ? /stay forward.*authored end cap/i : /ahead.*positive extrusion direction/i);
    return await f.snapshot('refused-target-height-' + height);
  }
}

async function saveAndReopen() {
  const accepted = await f.doc(), project = 'Downward end face ' + randomUUID();
  const versions = f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
  await button('Project and versions').click();
  await versions.getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', versions).click();
  await field('Project', versions).waitFor();
  await button('Save').click();
  await versions.getByRole('list', { name: 'Project documents', exact: true }).getByText(fileName, { exact: true }).waitFor();
  await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  const bytes = Buffer.from(await f.page.evaluate(async ([project, name]) => {
    const projects = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
    const folder = await projects.getDirectoryHandle(project);
    const file = await (await folder.getFileHandle(name)).getFile();
    return Array.from(new Uint8Array(await file.arrayBuffer()));
  }, [project, fileName]));
  assert.deepEqual(JSON.parse(bytes), accepted);
  const file = join(f.output, fileName);
  await writeFile(file, bytes);
  f.report.files.push({ name: fileName, bytes: bytes.length, sha256: sha256(bytes) });
  await f.freshOpen(file, accepted, '04-reopened-linked-extrude');
}

async function editCircleDiameter(height) {
  f.phase = 'Refuse contact then edit the reopened circle diameter';
  const original = await f.doc();
  await f.openFeatureEditor(3, 'linked face termination');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  const diameter = f.sketchPanel().locator('input#sk-diameter');
  await diameter.fill(disk ? '18' : '8');
  await diameter.press('Tab');
  await f.page.locator('.topbar button.finish').click();
  await f.waitToast(disk ? /contain the entire projected profile/ : /strictly contain the entire projected circle/);
  await f.same(original);
  await f.snapshot('06-circle-contact-refused');
  await diameter.fill(disk ? '15' : '5');
  await diameter.press('Tab');
  await f.finishSketch('07-reopened-circle-diameter-edited');
  await verify('reopened-radius-edit', height, disk ? 7.5 : 2.5);
}

async function editRectangleWidth(height) {
  f.phase = 'Refuse a tangent rectangle then edit the reopened width';
  const original = await f.doc();
  const notice = f.page.locator('.toast[role="alert"]').filter({ hasText: /contain the entire projected profile/ });
  const reopen = async () => {
    await f.openFeatureEditor(3, 'linked face termination');
    await button('Edit sketch', f.editor()).click();
    await f.sketchPanel().waitFor();
    return f.sketchPanel().getByLabel('Edge 1 length', { exact: true });
  };
  const refuse = async width => {
    await width.fill('6');
    await width.press('Tab');
    await f.page.locator('.topbar button.finish').click();
    await f.waitToast(/contain the entire projected profile/);
    await f.same(original);
  };
  let width = await reopen();
  await refuse(width);
  await f.snapshot('06-rectangle-contact-refused');
  if (finishNotice) {
    const model = button('Model', f.page.getByRole('group', { name: 'Mode', exact: true }));
    const prompt = f.page.getByRole('dialog', { name: 'Discard sketch changes?', exact: true });
    await model.click();
    await button('Keep editing', prompt).click();
    await prompt.waitFor({ state: 'hidden' });
    await notice.waitFor();
    await f.snapshot('06a-keep-refused-sketch');
    await model.click();
    await button('Discard changes', prompt).click();
    await f.sketchPanel().waitFor({ state: 'hidden' });
    await notice.waitFor({ state: 'hidden' });
    await f.same(original);
    await f.snapshot('06b-discard-retires-refusal');
    width = await reopen();
    await refuse(width);
  }
  await width.fill('4');
  await width.press('Tab');
  if (finishNotice) await notice.waitFor({ state: 'hidden' });
  await f.finishSketch('07-reopened-rectangle-width-edited');
  await verify('reopened-width-edit', height, 4);
}

await f.run(async () => {
  await f.newPage();
  if (circle && process.env.D1932_EDIT_FROM) {
    await f.openFile(process.env.D1932_EDIT_FROM, 4);
    const height = (await f.doc()).nodes[1].height;
    await verify('before-reopened-diameter-change', height);
    await editCircleDiameter(height);
    return;
  }
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: fileName, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button(`Sketch · ${profile}`, f.page.getByRole('group', { name: 'History', exact: true })).click();
  await f.editor().waitFor();
  await f.closeEditor();
  await f.openExtrudeHud();
  const hud = f.hud(), depth = field('Depth', hud);
  if (baseline && (!disk || polygonDisk)) {
    assert.equal(await depth.count(), 0);
    assert.equal(await field('Distance', hud).inputValue(), '8');
    await f.snapshot('00-reversed-source-fixed-distance-only');
    await button('Cancel', hud).click();
    await f.same(seed);
    return;
  }

  f.phase = 'Pick the original top face from the reversed sketch';
  await depth.selectOption('to-face');
  if (polygonDisk && await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('Top', f.page.locator('.views')).click();
  await f.page.waitForFunction(() => {
    const labels = [...document.querySelectorAll('.view-cube .vc-label')];
    return labels.length === 1 && labels[0].textContent === 'TOP';
  });
  const pick = await f.page.evaluate(point => {
    const xy = window.__studioScreenOf(point);
    return xy && document.elementFromPoint(...xy)?.closest('.vp-canvas') ? xy : null;
  }, disk ? [2, 10, 5] : circle ? [8, 8, 5] : [12, 12, 5]);
  assert.ok(pick);
  await f.page.mouse.click(...pick);
  if (baseline) {
    const refusal = hud.locator('.hud-error');
    await refusal.waitFor();
    const details = refusal.locator('details:not([open]) > summary');
    if (await details.count()) await details.click();
    assert.match(await refusal.innerText(), /original upper cap.*forward upright rectangular extrusion/i);
    await f.snapshot(rectangleDisk ? '00-previous-downward-rectangle-to-disk-refused' : '00-previous-downward-circle-to-disk-refused');
    await button('Cancel', hud).click();
    await f.same(seed);
    return;
  }
  if (polygonRim) {
    await hud.locator('.status').getByText('refused', { exact: true }).waitFor();
    const refusal = hud.locator('.hud-error');
    const details = refusal.locator('details:not([open]) > summary');
    if (await details.count()) await details.click();
    assert.match(await refusal.innerText(), /contain the entire projected profile/i);
    assert.equal(await button('Apply', hud).isDisabled(), true);
    await f.same(seed);
    await f.snapshot('01-polygon-corner-contact-refused');
    return;
  }
  await hud.getByText('n1.top', { exact: true }).waitFor();
  await f.page.waitForFunction(() => document.querySelector('.hud .status')?.textContent === 'preview');
  await f.snapshot('01-picked-top-face-preview');
  await button('Apply', hud).click();
  await verify('applied-native', 5);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const accepted = await f.snapshot('02-extruded-down');

  f.phase = 'Reject a reversed or unreachable target and preserve accepted history';
  for (const badHeight of [-5, 20, 25]) {
    const refused = await editDistance(badHeight, false);
    for (const key of ['doc', 'bodies', 'history', 'undo', 'redo']) assert.deepEqual(refused[key], accepted[key], key);
    await f.closeEditor();
  }
  await editDistance(8, true);
  await verify('target-height-eight', 8);
  await f.snapshot('03-linked-top-face-moved');
  await f.undo();
  await verify('undo-target-height-five', 5);
  await f.redo();
  await verify('redo-target-height-eight', 8);
  await saveAndReopen();
  assert.deepEqual(f.report.downloads, []);
  await verify('reopened-native', 8);
  await editDistance(6, true);
  await verify('reopened-edit', 6);
  await f.snapshot('05-reopened-target-edit');
  if (rectangleDisk) await editRectangleWidth(6);
  if (circle) await editCircleDiameter(6);
});
