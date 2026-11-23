import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/editable-step-copy-browser.mjs',
  'apps/cad-studio/src/files/useModelExports.ts',
  'apps/cad-studio/src/files/editableStepPreparation.ts',
  'apps/cad-studio/src/files/StepExportPanel.tsx',
  'apps/cad-studio/src/engine/engine.worker.ts',
  'packages/barocss-cad-model/src/engine/editableStepCopy.ts',
  'packages/barocss-cad/src/io/step-import.ts',
];
const f = await createFlow({
  name: 'editable-step-copy', output: process.argv[2], envFrozen: 'D1842_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Review, cancel, invalidate and save numeric and named native copies of one anonymous STEP plate in desktop Studio.',
  limits: ['One positive writer-profile plate; no recovery of original history, external reader, or arbitrary STEP support.'],
  inspectorSource: `
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { exportStudioStep } from '@barocss/cad-model/engine/evaluate';
import { partSnapshot } from '@barocss/cad-model/engine/part';
if (process.argv[3]) {
  const output = JSON.parse(process.argv[3]);
  const stock = rectanglePart(40, 30, 10);
  const stepOf = doc => exportStudioStep(doc, { name: 'Anonymous', timestamp: '2026-11-24T00:00:00' }).text.replace(/'(?:[^']|'')*'/g, "''");
  const plate = withNode(stock, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [11, 9], radius: 3 });
  writeFileSync(join(output, 'unlabelled.step'), stepOf(plate).replace(/#(\\d+)/g, (_, n) => '#' + (Number(n) + 1000)));
  writeFileSync(join(output, 'plain-stock.step'), stepOf(stock));
  console.log('{}');
} else {
  const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(partSnapshot(doc).outputs.map(out => ({
    check: checkBrep(out.brep, { strict: true }), mass: massPropertiesOf(out),
    walls: out.brep.faces.flatMap(face => {
      const geometry = faceGeometry(face);
      if (geometry.kind !== 'cylinder' || face.surface.kind !== 'surface') return [];
      const heights = face.surface.controlPoints.flat().map(point => point[2]);
      return [{ geometry, span: [Math.min(...heights), Math.max(...heights)] }];
    }),
    vertices: out.brep.vertices.map(vertex => vertex.point),
  }))));
}
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const pickFile = async (path, kind) => {
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles(path);
  await f.page.waitForFunction(kind => window.__studioDoc?.nodes.at(-1)?.kind === kind, kind);
  await f.ready();
};
const near = (value, expected) => assert.ok(Number.isFinite(value) && Math.abs(value - expected) < 1e-8, `${value} != ${expected}`);

async function physical(label, doc, height, x, radius, y = 9) {
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const [out] = rows;
  const bore = Math.PI * radius ** 2, area = 1200 - bore, expected = area * height;
  assert.ok(out.check.valid, JSON.stringify(out.check.issues));
  assert.equal(out.check.topology[0].genus, 1);
  near(out.mass.volume, expected);
  const centroid = [(24000 - x * bore) / area, (18000 - y * bore) / area, height / 2];
  out.mass.centroid.forEach((value, i) => near(value, centroid[i]));
  const max = [40, 30, height];
  max.forEach((dimension, i) => {
    near(Math.min(...out.vertices.map(point => point[i])), 0);
    near(Math.max(...out.vertices.map(point => point[i])), dimension);
  });
  assert.equal(out.walls.length, 2);
  for (const { geometry: { c, a, r, out: sense }, span } of out.walls) {
    near(c[0], x); near(c[1], y); near(r, radius); near(Math.abs(a[2]), 1);
    assert.equal(sense, -1); assert.deepEqual(span, [0, height]);
  }
  f.report.observations.push({ label, expected, volume: out.mass.volume, centroid: out.mass.centroid, walls: out.walls });
}

async function editableTool() {
  const tool = button('Review editable STEP copy');
  if (!(await tool.isVisible())) await button('More tools').click();
  assert.equal(await tool.locator('[data-ui-icon="file_copy"]').count(), 1);
  return tool;
}

const reviewPanel = () => f.page.getByRole('region', { name: 'Editable STEP copy', exact: true });
async function beginReview() {
  await (await editableTool()).click();
  const panel = reviewPanel();
  await panel.waitFor();
  return panel;
}
async function saveCopy(panel, file) {
  const save = button('Save copy', panel);
  await f.page.waitForFunction(() => !document.querySelector('[aria-label="Editable STEP copy"] button[type=submit]')?.disabled);
  const [download] = await Promise.all([f.page.waitForEvent('download'), save.click()]);
  assert.equal(download.suggestedFilename(), 'unlabelled-editable.bcad');
  await download.saveAs(file);
  await panel.waitFor({ state: 'hidden' });
  await f.waitToast(/Editable copy written/);
  return JSON.parse(await readFile(file, 'utf8'));
}

await f.run(async () => {
  await f.inspect('00-anonymous-source-generation', {}, f.output);
  const sourceFile = join(f.output, 'unlabelled.step'), original = await readFile(sourceFile);
  await f.newPage();
  await pickFile(sourceFile, 'import');
  const source = await f.doc();
  assert.equal(source.nodes.length, 1);
  assert.equal(source.nodes[0].step, original.toString());
  await physical('01-source-native', source, 10, 11, 3);
  await f.snapshot('01-imported-step');
  const copyFile = join(f.output, 'unlabelled-editable.bcad'), plainFile = join(f.output, 'plain-stock.step');
  const plainBytes = await readFile(plainFile, 'utf8');
  let panel = await beginReview();
  await panel.getByText('Sketch, Extrude, Hole', { exact: true }).waitFor();
  assert.equal(f.report.downloads.length, 0);
  await f.same(source);
  await f.snapshot('01a-review-no-download');
  await button('Cancel', panel).click();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(f.report.downloads.length, 0);
  await f.same(source);
  panel = await beginReview();
  await panel.getByText('Sketch, Extrude, Hole', { exact: true }).waitFor();
  await pickFile(plainFile, 'import');
  await f.page.waitForFunction(step => window.__studioDoc?.nodes[0]?.step === step, plainBytes);
  await panel.waitFor({ state: 'hidden' });
  assert.equal(f.report.downloads.length, 0);
  await f.snapshot('01b-changed-source-cancels-review');
  await pickFile(sourceFile, 'import');
  await f.same(source);
  panel = await beginReview();
  const copy = await saveCopy(panel, copyFile);
  await f.same(source);
  await f.snapshot('02-copy-written-source-unchanged');
  assert.deepEqual(copy.nodes.map(node => [node.id, node.kind]), [['n0', 'sketch'], ['n1', 'extrude'], ['n2', 'hole']]);
  assert.deepEqual(copy.parameters, {});
  await pickFile(copyFile, 'hole');
  await f.same(copy);
  await physical('03-copy-native', copy, 10, 11, 3);
  await f.snapshot('03-separate-editable-history');
  await f.openFeatureEditor(1, 'Extrude');
  const distance = f.editor().getByRole('spinbutton', { name: 'Distance', exact: true });
  assert.equal(await distance.inputValue(), '10');
  await distance.fill('14');
  const taller = (await f.applyEditor(copy, '04-plate-height-14')).doc;
  assert.deepEqual(taller.nodes, copy.nodes.map((node, i) => i === 1 ? { ...node, height: 14 } : node));
  await physical('04-height-native', taller, 14, 11, 3);
  await f.openFeatureEditor(2, 'Hole');
  const diameter = f.editor().getByRole('spinbutton', { name: 'Diameter', exact: true });
  const centre = f.editor().getByRole('spinbutton', { name: 'Centre X', exact: true });
  assert.equal(await diameter.inputValue(), '6');
  await diameter.fill('8'); await centre.fill('14');
  await f.snapshot('05-hole-size-and-position');
  const moved = (await f.applyEditor(taller, '06-hole-updated')).doc;
  assert.deepEqual(moved.nodes, taller.nodes.map((node, i) => i === 2 ? { ...node, center: [14, 9], radius: 4 } : node));
  await physical('06-hole-native', moved, 14, 14, 4);

  await f.openFeatureEditor(2, 'Hole outside stock');
  await centre.fill('80');
  await button('Apply', f.editor()).click();
  await f.editor().getByText('The hole misses the body', { exact: true }).waitFor();
  await f.same(moved);
  await f.snapshot('07-refused-edit-last-good');
  await f.closeEditor();
  await f.undo(); await f.same(taller);
  await f.redo(); await f.same(moved);
  const saved = await f.save('edited-plate');
  await f.freshOpen(saved.file, saved.doc, '08-fresh-open-edited');
  await physical('08-reopened-native', moved, 14, 14, 4);
  await f.openFeatureEditor(1, 'Extrude after fresh Open');
  await f.editor().getByRole('spinbutton', { name: 'Distance', exact: true }).fill('12');
  const reopenedEdit = (await f.applyEditor(moved, '09-second-height-edit')).doc;
  await physical('09-second-height-native', reopenedEdit, 12, 14, 4);

  await pickFile(sourceFile, 'import');
  await f.same(source);
  assert.deepEqual(await readFile(sourceFile), original);
  panel = await beginReview();
  const namedOption = panel.getByRole('checkbox', { name: 'Named thickness and hole centre', exact: true });
  await namedOption.check();
  await f.snapshot('09a-review-with-named-drivers');
  const namedFile = join(f.output, 'named-copy.bcad');
  const named = await saveCopy(panel, namedFile);
  await f.same(source);
  assert.deepEqual(named.parameters, { plateThickness: 10, holeCentreX: 11, holeCentreY: 9 });
  assert.deepEqual(named.nodes[1].height, { parameter: 'plateThickness' });
  assert.deepEqual(named.nodes[2].center, [{ parameter: 'holeCentreX' }, { parameter: 'holeCentreY' }]);
  await pickFile(namedFile, 'hole');
  await f.same(named);
  await physical('09-named-initial', named, 10, 11, 3);
  const thickness = (await f.setParameter('plateThickness', 16, '09b-named-thickness')).doc;
  await physical('09-named-thickness-native', thickness, 16, 11, 3);
  await f.setParameter('holeCentreX', 15, '09c-named-centre-x');
  const namedX = await f.doc();
  const namedXY = (await f.setParameter('holeCentreY', 12, '09d-named-centre-y')).doc;
  assert.deepEqual(namedXY.nodes, named.nodes);
  await physical('09-named-centre-native', namedXY, 16, 15, 3, 12);
  await f.undo(); await f.same(namedX);
  await f.redo(); await f.same(namedXY);
  const savedNamed = await f.save('edited-named-plate');
  await f.freshOpen(savedNamed.file, savedNamed.doc, '09e-named-copy-reopened');
  const namedReopen = (await f.setParameter('plateThickness', 13, '09f-named-edit-after-open')).doc;
  assert.deepEqual(namedReopen.nodes, named.nodes);
  await physical('09-named-reopened-native', namedReopen, 13, 15, 3, 12);
  const broken = original.toString().replace(/=LINE\('',#\d+,#(\d+)\);/, "=LINE('',#999,#$1);");
  assert.notEqual(broken, original.toString());
  const brokenFile = join(f.output, 'wrong-line-carrier.step');
  await writeFile(brokenFile, broken.replace('DATA;', "DATA;\n#999=CARTESIAN_POINT('',(100.,200.,300.));"));
  for (const [file, expected, label] of [[plainFile, plainBytes, '10-plain-stock-refused'], [brokenFile, await readFile(brokenFile, 'utf8'), '11-altered-edge-refused']]) {
    await pickFile(file, 'import');
    await f.page.waitForFunction(step => window.__studioDoc?.nodes[0]?.step === step, expected);
    await f.ready();
    const unsupported = await f.doc(), before = f.report.downloads.length;
    const rejected = await beginReview();
    await rejected.getByRole('alert').waitFor();
    assert.equal(await button('Save copy', rejected).isDisabled(), true);
    await f.same(unsupported);
    assert.equal(f.report.downloads.length, before);
    await f.snapshot(label);
  }
  assert.deepEqual(await readFile(sourceFile), original);
  f.report.observations.push({ sourceSHA256: sha256(original), unchanged: true });
});
