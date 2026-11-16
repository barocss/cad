import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['packages/barocss-cad-model/src/app/threads.ts', 'packages/barocss-cad-model/src/drawing/threads.ts', 'packages/barocss-cad-model/src/engine/part.ts'];
const f = await createFlow({ name: 'tapped-pattern-marks', output: process.argv[2], envFrozen: 'TAPPED_MARKS_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Every tapped copy retains model ring input and actual drawing three-quarter thread marks after History edits.',
  limits: ['Stored M6×1 blind holes; circular Z and linear X patterns at two widths. Renderer input is checked, not occluded ring pixels; WebGL2 and new size-table authoring not run.'],
  inspectorSource: `import { readFileSync } from 'node:fs';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { threadsOf, threadLines } from '@barocss/cad-model/app/threads';
import { checkBrep } from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), result=evaluateDoc(doc,1);
if(!result.ok)throw Error(JSON.stringify(result.error));
const threads=threadsOf(doc.nodes,{}), lines=threadLines(threads,result.bodies[0].mesh);
console.log(JSON.stringify({checks:partBreps(doc).map(b=>checkBrep(b.brep,{strict:true})),lines,threads:[...threads.keys()]}));` });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const mode = name => button(name, f.page.locator('.mode')).click();
function fixture(axis) {
  return { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0,0], max: [60,60] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 60 },
    { id: 'n2', kind: 'hole', parent: { node: 1, side: 'solid' }, axis, side: 'max', center: axis === 'z' ? [45,30] : [8,30], radius: 2.5, depth: 6, thread: 'M6×1', pattern: axis === 'z' ? { count: 4, about: [30,30] } : { count: 4, step: [8,0] } } ], outputs: { b2: { node: 2, side: 'solid' } }, nextId: 3,
    drawing: { sheet: 'A3', projection: 'third', hidden: true, scale: 1, dimensions: [], views: ['front','top','right'] } };
}
async function verify(axis, count, label) {
  const doc = await f.doc(), checked = await f.inspect(label, doc);
  assert.ok(checked.checks.every(c => c.valid)); assert.equal(checked.threads.length, count);
  assert.equal(checked.lines.length / (6 * 32), count * 6);
  const coords = axis === 'z' ? [0,1] : [1,2];
  for (let k = 0; k < count; k++) {
    const center = axis === 'z' ? [30+15*Math.cos(2*Math.PI*k/count),30+15*Math.sin(2*Math.PI*k/count)] : [8+k*8,30];
    let vertices=0;
    for(let i=0;i<checked.lines.length;i+=3) if(Math.abs(Math.hypot(checked.lines[i+coords[0]]-center[0],checked.lines[i+coords[1]]-center[1])-2.5*.985)<1e-4)vertices++;
    assert.equal(vertices,6*32*2);
  }
  await mode('Drawing');
  await f.page.locator('svg[aria-label="Drawing sheet"]').waitFor();
  await f.page.waitForFunction(() => !!window.__studioDrawing?.() && !document.querySelector('.dw-busy'));
  const view = axis === 'z' ? 'top' : 'right';
  const paths = await f.page.locator(`svg[aria-label="Drawing sheet"] g.view[data-view="${view}"] path`).evaluateAll(es => es.map(e => e.getAttribute('d')));
  const marks=paths.filter(d=>/A3 3 0 1 [01] /.test(d) && (d.match(/A/g)||[]).length===1);
  assert.equal(marks.length,count,JSON.stringify(paths));
  await f.snapshot(label); await mode('Model'); await f.same(doc);
}
await f.run(async () => {
  for(const width of [1024,1440]) for(const axis of ['z','x']) {
    f.phase=`${width} ${axis} all-copy thread marks`;
    await f.newPage(); await f.page.setViewportSize({width,height:width===1024?800:900});
    await f.openFile({name:'tapped-pattern.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture(axis)))},3);
    const before=await f.doc(); await verify(axis,4,`${width}-${axis}-four`);
    await f.openFeatureEditor(2,'tapped pattern'); await f.editor().getByLabel('Copies',{exact:true}).fill('6');
    await f.applyEditor(before,`${width}-${axis}-six`); const after=await f.doc();
    await verify(axis,6,`${width}-${axis}-six-marks`);
    await f.undo(); await f.same(before); await verify(axis,4,`${width}-${axis}-undo`);
    await f.redo(); await f.same(after); await verify(axis,6,`${width}-${axis}-redo`);
    const saved=await f.save(`${width}-${axis}-six`); await f.freshOpen(saved.file,after,`${width}-${axis}-reopened`);
    await f.page.setViewportSize({width,height:width===1024?800:900});
    await verify(axis,6,`${width}-${axis}-reopened-marks`);
  }
});
