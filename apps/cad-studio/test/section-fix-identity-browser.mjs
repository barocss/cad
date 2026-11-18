import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'section-fix-identity',output:process.argv[2],envFrozen:'SECTION_FIX_IDENTITY_FROZEN',initialFiles:['apps/cad-studio/test/section-fix-identity-browser.mjs','packages/barocss-cad-model/src/drawing/issues.ts'],qualification:'Automatic section fixes must not reuse a retained cut identity.',limits:['Hidden shaft/keyway dimension fix with one retained dimension; no topology repair.'],inspectorSource:`import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';import {emptyDoc,type StudioDoc} from '@barocss/cad-model/engine/doc';import {commands,type Ctx} from '@barocss/cad-model/app/commands';import {drawingInputs} from '@barocss/cad-model/chat/drawing';import {autoLayout} from '@barocss/cad-model/drawing/layout';import {issueContext} from '@barocss/cad-model/drawing/issues';import {readDrawing,type DrawingSettings} from '@barocss/cad-model/drawing/types';const blank: Ctx = { doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } };
const cmd = (id: string) => commands.find(c => c.id === id)!;
const evaluated = (doc: StudioDoc) => { const r = evaluateDoc(doc, 1); assert.ok(r.ok, r.ok ? '' : r.error.detail); return r.bodies; };
function run(doc: StudioDoc, id: string, pick: { bodies?: number[]; face?: string }, values: Record<string, number | string> = {}) {
  const bodies = evaluated(doc);
  const faces = pick.face ? [(() => { const body = bodies.findIndex(b => b.mesh.faces.some(f => f.name === pick.face)); return { body, face: bodies[body].mesh.faces.findIndex(f => f.name === pick.face) }; })()] : [];
  const ctx: Ctx = { doc, bodies, selection: { faces, edges: [], bodies: (pick.bodies ?? []).map(node => bodies.findIndex(b => b.ref?.node === node)) } }, c = cmd(id), ok = c.available(ctx);
  assert.ok(ok.ok, ok.ok ? '' : \`\${id}: \${ok.reason}\`);
  return c.build!(ctx, { ...c.defaults!(ctx), ...values });
}
function scene(): StudioDoc {
  let doc = cmd('shaft').build!(blank, cmd('shaft').defaults!(blank));
  const tube = cmd('tube'); doc = tube.build!({ ...blank, doc }, { ...tube.defaults!(blank), r: 20, ri: 10, h: 22, x: 0, y: 0, z: 4 });
  doc = run(doc, 'keyway', { face: \`n\${doc.nodes.length - 1}.hole0.side0\` }, { b: 6, t2: 2.8 });
  return run(doc, 'key', { bodies: [0] }, { h: 6 });
}
/** The scene with its key made, not bought (the person's override): a body of the part, drawn and cut (O174). */
const madeKey = (doc: StudioDoc): StudioDoc => ({ ...doc, nodes: doc.nodes.map(n => n.kind === 'key' ? { ...n, bought: false } : n) });
const inputs = (doc: StudioDoc, extra: Partial<DrawingSettings> = {}) => { const i = drawingInputs(doc, { ...readDrawing(doc.drawing), sheet: 'A3', ...extra }); assert.ok(typeof i !== 'string', String(i)); return { ...i, meta: { ...i.meta, date: '2026-10-22' } }; };
const input=JSON.parse(readFileSync(process.argv[2],'utf8'));if(input.nodes){const ctx=issueContext(inputs(input,input.drawing));console.log(JSON.stringify({held:ctx.sheet.dimensions.find(d=>d.dim.id==='held-old-cut')}));}else{const doc=scene(),original=autoLayout(inputs(doc,{sections:[{id:'B',view:'top',at:-14}]})).settings;const held=original.dimensions.find(d=>d.view==='section:B');const normal=autoLayout(inputs(doc)).settings;console.log(JSON.stringify({...doc,drawing:readDrawing({...normal,title:'Automatic section identity',dimensions:[...normal.dimensions,{...held,id:'held-old-cut',auto:false}]})}));}`});
const button=name=>f.page.getByRole('button',{name,exact:true});
await f.run(async()=>{
 const fixture=await f.inspect('fixture',{});await f.newPage();await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'section-fix.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.title==='Automatic section identity');await f.ready();await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();const before=await f.doc();const initial=await f.inspect('before',before);assert.equal(initial.held.ok,false);await f.snapshot('before');
 const fix=f.page.getByRole('button',{name:/^Fix: .*section .*square to its axis/}).first();await fix.click();await f.changed(before);const after=await f.doc(),result=await f.inspect('after',after);f.report.observations.push({before:initial,after:result,sections:after.drawing.sections});await f.snapshot('after');assert.equal(result.held.ok,false,'retained old cut dimension must not resolve on newly generated section');assert.deepEqual(after.drawing.dimensions.find(d=>d.id==='held-old-cut'),before.drawing.dimensions.find(d=>d.id==='held-old-cut'));assert.deepEqual(after.nodes,before.nodes);
 await f.undo();await f.same(before);await f.redo();await f.same(after);await button('Model').click();const saved=await f.save('section-fix');await f.freshOpen(saved.file,saved.doc,'reopened');const opened=await f.inspect('opened',await f.doc());assert.equal(opened.held.ok,false);await button('Drawing').click();await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor();await f.snapshot('final');
});
