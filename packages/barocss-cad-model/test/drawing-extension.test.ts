import test from 'node:test';
import assert from 'node:assert/strict';
import { starterDoc } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { projectViews } from '../src/drawing/project';
import { snapPoints } from '../src/drawing/dimensions';
import { defaultDrawing, readDrawing, type DrawingDimension } from '../src/drawing/types';
import { buildSheet } from '../src/drawing/sheet';
import { modelAnnotations } from '../src/drawing/annotations3d';
import { sheetPdf } from '../src/io/pdf';
import { layoutSheet } from '../src/drawing/views';
import { sheetDxfDocument } from '../src/io/dxf';
import { checkSavedExtension } from '../src/drawing/savedExtension';
import { assertSavedDrawingDocument } from '../src/engine/savedDrawing';

const doc = starterDoc(), evaluated = brepsFor(doc); assert.ok('breps' in evaluated);
const result = projectViews(evaluated.breps, evaluated.prefixes); assert.ok(result.ok);
const views = result.views, points = snapPoints(views.front);
const at = (x: number, z: number) => points.find(p => Math.abs(p.at[0] - x) < 1e-9 && Math.abs(p.at[1] - z) < 1e-9)!.ref;
const dim: Extract<DrawingDimension, {kind:'linear'}> = { id:'manual', kind:'linear', view:'front', a:at(0,0), b:at(64,8), orient:'horizontal', place:[32,20] };
function built(d: typeof dim) {
  const s = {...defaultDrawing(), dimensions:[d]}, layout=layoutSheet(views,s);
  return {s,layout,sheet:buildSheet(views,layout,s,{title:'Extension role',date:'2026-11-18'})};
}
for (const reversed of [false,true]) for (const orient of ['horizontal','vertical','aligned'] as const) for (const side of ['a','b'] as const) test(`${reversed ? "reversed" : "forward"}/${orient}/${side}: only the reference-role extension changes`,()=>{
  const original = {...dim,orient,...(reversed?{a:dim.b,b:dim.a}:{})}, base=built(original), changed=built({...original,hideExtension:side});
  const marks=(b:ReturnType<typeof built>)=>b.sheet.groups.find(g=>g.id===dim.id && g.role==='dimension')!.marks;
  const isExtension=(m:ReturnType<typeof marks>[number])=>m.kind==='line' && m.role==='extension';
  const before=marks(base), after=marks(changed), extensions=before.filter(isExtension);
  assert.equal(extensions.length,2);assert.deepEqual(after.filter(isExtension),[extensions[side==='a'?1:0]]);
  assert.deepEqual(after.filter(m=>!isExtension(m)),before.filter(m=>!isExtension(m)));
  const a=base.sheet.dimensions[0],b=changed.sheet.dimensions[0];assert.ok(a.ok&&b.ok);assert.equal(a.value,b.value);
  const entity=sheetDxfDocument(changed.sheet,changed.layout).entities.find(e=>e.type==='dimension');assert.ok(entity?.type==='dimension');
  assert.equal(entity.suppressExtension,side==='a'?'p1':'p2');
  assert.deepEqual(readDrawing(changed.s),changed.s);
  assert.deepEqual(original,{...dim,orient,...(reversed?{a:dim.b,b:dim.a}:{})});
});
test('new field is strict, unmarked legacy settings unchanged, nested raw Open refuses malformed values',()=>{
  const raw={...defaultDrawing(),dimensions:[{...dim,hideExtension:'a'}]};
  assert.deepEqual(checkSavedExtension(raw),[]);assertSavedDrawingDocument({...doc,drawing:raw});
  for(const patch of [{hideExtension:false},{hideExtension:'both'},{kind:'angle'},{auto:true},{view:'iso'},{view:'section:A'},{a:{at:'pcd'}}]){
    const drawing={...raw,dimensions:[{...raw.dimensions[0],...patch}]};
    assert.ok(checkSavedExtension(drawing).length);assert.throws(()=>assertSavedDrawingDocument({...doc,drawing}));
    assert.throws(()=>assertSavedDrawingDocument({...doc,instances:[{id:'p',doc:{...doc,drawing}}]}));
  }
  assert.ok(checkSavedExtension({...raw,scope:{kind:'assembly'}}).length);
  assert.deepEqual(checkSavedExtension({...defaultDrawing(),dimensions:[dim]}),[]);
});

test('the PDF stream and 3D annotation each omit just the selected extension', () => {
  const before = built(dim), after = built({ ...dim, hideExtension: 'a' });
  const marks = before.sheet.groups.find(group => group.id === dim.id && group.role === 'dimension')!.marks;
  const line = marks.find(mark => mark.kind === 'line' && mark.role === 'extension');
  assert.ok(line?.kind === 'line');
  const operators = (sheet: typeof before.sheet) => {
    const pdf = Buffer.from(sheetPdf(sheet, 'Witness selection')).toString('latin1');
    const stream = /\nstream\n([\s\S]+?)endstream/.exec(pdf);
    assert.ok(stream);
    return stream[1].trimEnd().split('\n');
  };
  const original = operators(before.sheet), hidden = operators(after.sheet);
  const [x0, y0, x1, y1] = [...line.a, ...line.b].map(point => Number(point.toFixed(4)));
  const lineOps = ` ${x0} ${y0} m ${x1} ${y1} l S`;
  const suppressed = original.filter(operator => operator.endsWith(lineOps));
  assert.equal(suppressed.length, 1);
  assert.deepEqual(hidden, original.filter(operator => operator !== suppressed[0]));

  const item = ({ sheet, layout, s }: typeof before) => modelAnnotations({ views, sheet, layout, settings: s })
    .items.find(annotation => annotation.id === dim.id)!;
  const original3d = item(before);
  const extensions = original3d.lines.filter(mark => mark.role === 'extension');
  assert.equal(extensions.length, 2);
  assert.deepEqual(item(after), { ...original3d, lines: original3d.lines.filter(mark => mark !== extensions[0]) });
});
