import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/editable-step-copy-browser.mjs',
  'apps/cad-studio/src/files/useModelExports.ts',
  'apps/cad-studio/src/engine/engine.worker.ts',
  'packages/barocss-cad-model/src/engine/editableStepCopy.ts',
  'packages/barocss-cad/src/io/step-import.ts',
];
const f = await createFlow({
  name: 'editable-step-copy', output: process.argv[2], envFrozen: 'D1841_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Edit the separate native copy of one anonymous STEP plate with one through bore in desktop Studio.',
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

async function physical(label, doc, height, x, radius) {
  const rows = await f.inspect(label, doc);
  assert.equal(rows.length, 1);
  const [out] = rows;
  const bore = Math.PI * radius ** 2, area = 1200 - bore, expected = area * height;
  assert.ok(out.check.valid, JSON.stringify(out.check.issues));
  assert.equal(out.check.topology[0].genus, 1);
  near(out.mass.volume, expected);
  const centroid = [(24000 - x * bore) / area, (18000 - 9 * bore) / area, height / 2];
  out.mass.centroid.forEach((value, i) => near(value, centroid[i]));
  const max = [40, 30, height];
  max.forEach((dimension, i) => {
    near(Math.min(...out.vertices.map(point => point[i])), 0);
    near(Math.max(...out.vertices.map(point => point[i])), dimension);
  });
  assert.equal(out.walls.length, 2);
  for (const { geometry: { c, a, r, out: sense }, span } of out.walls) {
    near(c[0], x); near(c[1], 9); near(r, radius); near(Math.abs(a[2]), 1);
    assert.equal(sense, -1); assert.deepEqual(span, [0, height]);
  }
  f.report.observations.push({ label, expected, volume: out.mass.volume, centroid: out.mass.centroid, walls: out.walls });
}

async function editableTool() {
  const tool = button('Save editable STEP copy');
  if (!(await tool.isVisible())) await button('More tools').click();
  assert.equal(await tool.locator('[data-ui-icon="file_copy"]').count(), 1);
  return tool;
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
  const tool = await editableTool();
  const [download] = await Promise.all([f.page.waitForEvent('download'), tool.click()]);
  assert.equal(download.suggestedFilename(), 'unlabelled-editable.bcad');
  const copyFile = join(f.output, download.suggestedFilename());
  await download.saveAs(copyFile);
  await f.waitToast(/Editable copy written/);
  await f.same(source);
  await f.snapshot('02-copy-written-source-unchanged');
  const copy = JSON.parse(await readFile(copyFile, 'utf8'));
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
  await f.waitToast(/hole|cut|material/i);
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
  const plainFile = join(f.output, 'plain-stock.step');
  const plainBytes = await readFile(plainFile, 'utf8');
  const broken = original.toString().replace(/=LINE\('',#\d+,#(\d+)\);/, "=LINE('',#999,#$1);");
  assert.notEqual(broken, original.toString());
  const brokenFile = join(f.output, 'wrong-line-carrier.step');
  await writeFile(brokenFile, broken.replace('DATA;', "DATA;\n#999=CARTESIAN_POINT('',(100.,200.,300.));"));
  for (const [file, expected, label] of [[plainFile, plainBytes, '10-plain-stock-refused'], [brokenFile, await readFile(brokenFile, 'utf8'), '11-altered-edge-refused']]) {
    await pickFile(file, 'import');
    await f.page.waitForFunction(step => window.__studioDoc?.nodes[0]?.step === step, expected);
    await f.ready();
    const unsupported = await f.doc(), before = f.report.downloads.length;
    await (await editableTool()).click();
    await f.waitToast(/Could not make an editable copy/);
    await f.same(unsupported);
    assert.equal(f.report.downloads.length, before);
    await f.snapshot(label);
  }
  f.report.observations.push({ sourceSHA256: sha256(original), unchanged: true });
});
