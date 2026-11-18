import { forSheet } from '../src/drawing/sheets';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDoc } from '../src/engine/evaluate';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { commands, type Ctx } from '../src/app/commands';
import { drawingInputs } from '../src/chat/drawing';
import { autoLayout } from '../src/drawing/layout';
import { applyFix, drawingIssues, issueContext } from '../src/drawing/issues';
import { readDrawing, sectionsOf, type DrawingSettings } from '../src/drawing/types';

// Fixture from the existing X2 shaft/keyway section contract.
// O148 X2: dimensions on sections — the shaft-and-hub scene of O146 (its keyseat under the hub, hidden in every standard
// view) with B–B square to the top view's depth through the keyseat's middle (z 15): Auto-dimension finds b 6 and d − t1
// 16.5 on the section with visible ends, so DIM_ON_HIDDEN no longer fires (the hub's d + t2 22.8 too, its bore end hidden from the top by the Ø25 step); drawn and checked
// as a view's; a dimension on a section the sheet lacks is lost, said; turning the front with one is refused, typed.
const blank: Ctx = { doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } };
const cmd = (id: string) => commands.find(c => c.id === id)!;
const evaluated = (doc: StudioDoc) => { const r = evaluateDoc(doc, 1); assert.ok(r.ok, r.ok ? '' : r.error.detail); return r.bodies; };
function run(doc: StudioDoc, id: string, pick: { bodies?: number[]; face?: string }, values: Record<string, number | string> = {}) {
  const bodies = evaluated(doc);
  const faces = pick.face ? [(() => { const body = bodies.findIndex(b => b.mesh.faces.some(f => f.name === pick.face)); return { body, face: bodies[body].mesh.faces.findIndex(f => f.name === pick.face) }; })()] : [];
  const ctx: Ctx = { doc, bodies, selection: { faces, edges: [], bodies: (pick.bodies ?? []).map(node => bodies.findIndex(b => b.ref?.node === node)) } }, c = cmd(id), ok = c.available(ctx);
  assert.ok(ok.ok, ok.ok ? '' : `${id}: ${ok.reason}`);
  return c.build!(ctx, { ...c.defaults!(ctx), ...values });
}
function scene(): StudioDoc {
  let doc = cmd('shaft').build!(blank, cmd('shaft').defaults!(blank));
  const tube = cmd('tube'); doc = tube.build!({ ...blank, doc }, { ...tube.defaults!(blank), r: 20, ri: 10, h: 22, x: 0, y: 0, z: 4 });
  doc = run(doc, 'keyway', { face: `n${doc.nodes.length - 1}.hole0.side0` }, { b: 6, t2: 2.8 });
  return run(doc, 'key', { bodies: [0] }, { h: 6 });
}
/** The scene with its key made, not bought (the person's override): a body of the part, drawn and cut (O174). */
const inputs = (doc: StudioDoc, extra: Partial<DrawingSettings> = {}) => { const i = drawingInputs(doc, { ...readDrawing(doc.drawing), sheet: 'A3', ...extra }); assert.ok(typeof i !== 'string', String(i)); return { ...i, meta: { ...i.meta, date: '2026-10-22' } }; };

test('automatic section fix must not reconnect retained dimension to a newly generated cut', () => {
 const doc=scene(), original=autoLayout(inputs(doc,{sections:[{id:'B',view:'top',at:-14}]})).settings;
 const held=original.dimensions.find(d=>d.view==='section:B')!;assert.ok(held);
 const normal=autoLayout(inputs(doc)).settings;
 const settings={...normal,dimensions:[...normal.dimensions,{...held,id:'held-old-cut',auto:false}]};
 const ctx=issueContext(inputs(doc,settings));
 const before=ctx.sheet.dimensions.find(d=>d.dim.id==='held-old-cut');assert.ok(before&&!before.ok);
 const candidate=drawingIssues(ctx).find(x=>x.code==='DIM_ON_HIDDEN'&&x.fix?.kind==='add-section');assert.ok(candidate?.fix);
 const next=applyFix(ctx,candidate.fix), after=issueContext(inputs(doc,next)).sheet.dimensions.find(d=>d.dim.id==='held-old-cut');
 console.log(JSON.stringify({fix:candidate.fix,before,after}));
 assert.deepEqual(next.dimensions,settings.dimensions);assert.ok(after&&!after.ok,'retained dimension must remain unresolved, not silently bind to new cut');
});

test('stale fix reserves other-sheet references without cleaning old duplicates', () => {
 const doc=scene(),normal=autoLayout(inputs(doc)).settings;
 const held={...normal.dimensions[0],id:'old',view:'section:B' as const};
 const whole:DrawingSettings={...normal,dimensions:[...normal.dimensions,held,{...held,id:'old-duplicate'}],sheets:[{id:'S2',name:'Old section',views:['section:B']}]};
 const before=structuredClone(whole),local=forSheet(whole,0);assert.ok(local.sheetContext?.sectionLetters?.includes('B'));
 const ctx=issueContext(inputs(doc,local)),stale={kind:'add-section' as const,id:'B',view:'top' as const,at:-15};
 const fixed=applyFix(ctx,stale);assert.equal(sectionsOf(fixed)[0].id,'C');assert.deepEqual(whole,before);assert.deepEqual(fixed.dimensions,local.dimensions);
 const current=issueContext(inputs(doc,{...normal,sections:[{id:'B',view:'top',at:-15}]}));
 assert.equal(applyFix(current,stale),current.settings,'existing section fix stays a no-op');
});
