import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-arc-centerline-closeout-browser.mjs',
  'packages/barocss-cad-model/src/drawing/types.ts',
  'packages/barocss-cad-model/src/drawing/savedAnnotationRefs.ts',
  'packages/barocss-cad-model/src/engine/savedDrawing.ts',
];

const f = await createFlow({
  name: 'arc-centerline-closeout',
  output: process.argv[2],
  envFrozen: 'D2019_SOURCE_FROZEN',
  qualification: 'Closeout verification for #242: real Chrome Open of malformed .bcad copies carrying sig={} on arcCenterlines, centerMarkGroups, bisectorCenterlines, virtualSharps, and ordinateGroups returns an explicit DRAWING_OPTIONS signature error (never "is not iterable") while preserving the currently open valid Shell 4 mm + arcCenterline ac1 document across subsequent Save, plus multi-sheet arcCenterline ownership across Save/Open.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic Shell 4 mm arc-centerline fixture and malformed sig={} copies in desktop Studio Chrome; older-version re-save compatibility remains disclosed in the Export compatibility note.'],
  inspectorSource: `
import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { brepsFor, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { pickArcCenterlineEdge, newArcCenterlineId } from '@barocss/cad-model/drawing/arcCenterline';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';

let doc = rectanglePart(40, 40, 14);
const b0 = brepsFor(doc);
if (!('breps' in b0)) throw Error('No box');
const vById = new Map(b0.breps[0].vertices.map(v => [v.id, v.point]));
const corner = b0.breps[0].edges.find(e => {
  const a = vById.get(e.vertices[0]), b = vById.get(e.vertices[1]);
  return a && b && Math.abs(a[0] - 40) < 1e-4 && Math.abs(a[1] - 40) < 1e-4 && Math.abs(b[0] - 40) < 1e-4 && Math.abs(b[1] - 40) < 1e-4;
})?.name;
doc = withNode(doc, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [corner], radius: 14 });
const topFace = brepsFor(doc);
if (!('breps' in topFace)) throw Error('No fillet');
const openFace = topFace.breps[0].faces.find(fa => fa.name.endsWith('.top'))?.name ?? 'n1.top';
doc = withNode(doc, { kind: 'shell', parent: { node: 2, side: 'solid' }, open: [openFace], thickness: 4 });
const ev = evaluateDoc(doc, 1);
if (!ev.ok) throw Error('Eval failed');
const b2 = brepsFor(doc);
if (!('breps' in b2)) throw Error('No shell');
const proj = projectViews(b2.breps, b2.prefixes);
if (!proj.ok) throw Error('Proj failed');
const arcs = proj.views.top.edges.filter(e => e.circle && e.pieces.some(p => p.visible && p.curve.kind === 'arc')).sort((a, b) => a.circle.radius - b.circle.radius);
const r1 = pickArcCenterlineEdge(proj.views.top, arcs[0], 'top');
const r2 = pickArcCenterlineEdge(proj.views.top, arcs[arcs.length - 1], 'top');
if (!r1.ok || !r2.ok) throw Error('Could not pick arcs');
doc = {
  ...doc,
  drawing: {
    ...defaultDrawing(),
    scale: 1,
    arcCenterlines: [{ id: newArcCenterlineId(), view: 'top', first: r1.ref, second: r2.ref }],
    dimensions: [],
  },
};
doc = captureSignatures(doc, ev.bodies);
console.log(JSON.stringify({ doc }));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const tab = name => f.page.getByRole('tab', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
const wait = predicate => f.page.waitForFunction(predicate);

async function download(name, filename) {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button(name).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return readFile(path, 'utf8');
}

await f.run(async () => {
  f.phase = 'open valid Shell 4 mm + arcCenterline ac1 document in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'arc-valid.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => document.querySelectorAll('g.arc-centerline[data-arc-centerline="ac1"] path').length === 1);
  await f.snapshot('01-valid-arc-centerline');

  f.phase = 'reject malformed sig={} copies with explicit DRAWING_OPTIONS message while preserving open doc';
  const malformedArc = structuredClone(info.doc);
  malformedArc.nodes[3].thickness = 2;
  malformedArc.drawing.scale = 2;
  malformedArc.drawing.arcCenterlines[0].first.sig = {};
  await field('Model file').setInputFiles({ name: 'arc-bad-sig.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(malformedArc)) });
  await f.page.locator('.toast').filter({ hasText: /Could not open this file/i }).waitFor();
  const toastText = await f.page.locator('.toast').innerText();
  assert.match(toastText, /invalid reference signature/i, `expected clear signature error, got: ${toastText}`);
  assert.doesNotMatch(toastText, /is not iterable/i, `must never leak raw TypeError: ${toastText}`);
  await f.snapshot('02-rejected-malformed-sig-toast');

  // Verify open doc was completely preserved and Save writes original Shell 4 mm + scale 1 + ac1
  const savedAfterReject = JSON.parse(await download('Save', 'after-reject.bcad'));
  assert.equal(savedAfterReject.nodes[3].thickness, 4);
  assert.equal(savedAfterReject.drawing.scale, 1);
  assert.equal(savedAfterReject.drawing.arcCenterlines.length, 1);

  f.phase = 'verify multi-sheet arcCenterline ownership across Sheet 1 / Sheet 2 and Save/Open';
  const multiDoc = structuredClone(info.doc);
  multiDoc.drawing.sheets = [{ id: 's2', name: 'Top sheet', views: ['top'] }];
  await field('Model file').setInputFiles({ name: 'arc-multisheet.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(multiDoc)) });
  await f.ready();
  await button('Drawing').click();
  // Sheet 1 does not show top -> no ac1 on Sheet 1
  await wait(() => window.__studioDoc?.drawing?.sheets?.length === 1);
  assert.equal(await f.page.locator('g.arc-centerline[data-arc-centerline="ac1"]').count(), 0);
  // Switch to Sheet 2 -> top view & ac1 render cleanly
  await tab('Top sheet').click();
  await wait(() => document.querySelectorAll('g.arc-centerline[data-arc-centerline="ac1"] path').length === 1);
  await f.snapshot('03-multisheet-sheet2-ac1');

  const savedMulti = await download('Save', 'arc-multisheet-saved.bcad');
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'arc-multisheet-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedMulti) });
  await f.ready();
  await button('Drawing').click();
  await tab('Top sheet').click();
  await wait(() => document.querySelectorAll('g.arc-centerline[data-arc-centerline="ac1"] path').length === 1);

  return { verified: true, multiSheetPreserved: true };
});
