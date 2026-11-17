import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/sketch-clear-side-identity-browser.mjs','apps/cad-studio/src/sketch/useSketchActions.ts','apps/cad-studio/src/sketch/draftHistory.ts','apps/cad-studio/src/sketch/clearedProfileIdentity.ts','packages/barocss-cad-model/src/sketch/types.ts'];
const f=await createFlow({name:'sketch-clear-side-identity',output:process.argv[2],envFrozen:'SKETCH_CLEAR_SIDE_IDENTITY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Observe named downstream identity after deleting and redrawing an entire tagged source outline.',limits:['Observation baseline, not an assertion that an accepted redraw is a product defect. Single translated triangle and constant R1 top-edge Fillet. No new reference resolution or schema capability.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {brepMassProperties,checkBrep} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
const rows=partBreps(doc).map(({key,brep})=>({key,volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true}),vertices:brep.vertices.map(v=>v.point),faces:brep.faces.map(f=>({name:f.name,surface:f.surface}))}));
console.log(JSON.stringify(rows));
`});
const edge='n1.side[e1]|n1.top';
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'polygon',points:[[0,0],[40,0],[8,30]],sideTags:{outer:['e1','e2','e3']}},{id:'n1',kind:'extrude',sketch:0,height:10},{id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:[edge],radius:1,sigs:{[edge]:{k:'line',p:[20,0,10],d:[1,0,0],s:40}}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const button=name=>f.page.getByRole('button',{name,exact:true});
const upstream=doc=>({...doc,nodes:doc.nodes.slice(0,2),outputs:{b1:{node:1,side:'solid'}},nextId:2});
async function inspect(doc,label){const result=await f.inspect(label,doc);assert.ok(result.every(b=>b.check.valid),JSON.stringify(result.map(b=>b.check)));return result;}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'tagged-triangle-fillet.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);await f.ready();
 const originalNative=await inspect(source,'01-original-finish'),originalUpstream=await inspect(upstream(source),'01-original-upstream');await f.snapshot('01-original');
 await f.openFeatureEditor(1);await f.editor().getByRole('button',{name:'Edit sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.frame([[0,0],[40,0],[8,30],[0,8],[40,8],[8,38]]);
 const originalDraft=await f.page.locator('.vp-overlay .sk-shape').evaluateAll(es=>es.map(e=>e.outerHTML));
 await button('Clear profile').click();assert.equal(await f.page.locator('.vp-overlay .sk-shape').count(),0);await f.same(source);await f.snapshot('02-cleared-draft');
 await f.tool('Line','l');for(const p of [[0,8],[40,8],[8,38],[0,8]])await f.worldClick(p);
 await f.snapshot('03-redrawn-before-finish');await f.same(source);
 const previousToast=await f.page.locator('.toast').allTextContents();await f.page.locator('.topbar button.finish').click();
 await f.page.waitForFunction(({old,toast})=>JSON.stringify(window.__studioDoc)!==old||!!document.querySelector('.sk-panel [role="alert"]')||JSON.stringify([...document.querySelectorAll('.toast')].map(e=>e.textContent))!==JSON.stringify(toast),{old:JSON.stringify(source),toast:previousToast},{timeout:30000});
 const finished=await f.snapshot('04-finish-observed'),after=await f.doc();const accepted=JSON.stringify(after)!==JSON.stringify(source);
 const observation={label:'clear-and-redraw-side-identity',accepted,originalTags:source.nodes[0].sideTags,newTags:after.nodes[0].sideTags,originalReference:source.nodes[2],newReference:after.nodes[2],originalNative,originalUpstream,sketchPanel:await f.sketchPanelText(),snapshot:finished};
 if(accepted){await f.ready();observation.newUpstream=await inspect(upstream(after),'05-redrawn-upstream');try{observation.newNative=await inspect(after,'05-redrawn-finish');}catch(error){observation.newNativeError=String(error);}observation.reusedDeletedTags=source.nodes[0].sideTags.outer.filter(tag=>after.nodes[0].sideTags?.outer?.includes(tag));observation.points=after.nodes[0].points;await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('06-result-iso');}
 else{await f.same(source);observation.refusalPreservedNative=await inspect(source,'05-refused-source-preserved');observation.toasts=await f.toasts();assert.ok(observation.toasts.some(t=>/reference|edge|selection|missing|removed|not found/i.test(t)),JSON.stringify(observation.toasts));}
 f.report.observations.push(observation);await f.persist();
 if(baseline)return;
 assert.equal(accepted,false,'deleted side reference must not be inherited by a replacement outline');assert.deepEqual(observation.refusalPreservedNative,originalNative);
 await f.dismissToasts();
 // Draft Undo must traverse the redraw and Clear, restoring the actual old profile.
 let restored=false;
 for(let i=0;i<12;i++){await button('Undo').click();const geometry=await f.page.locator('.vp-overlay .sk-shape').evaluateAll(es=>es.map(e=>e.outerHTML));if(JSON.stringify(geometry)===JSON.stringify(originalDraft)){restored=true;break;}}
 assert.equal(restored,true,'Undo Clear restores the original rendered profile');await f.same(source);await f.snapshot('07-draft-undo-restored');
 await f.page.locator('.topbar button.finish').focus();await f.page.keyboard.press('Escape');if(await button('Discard').count())await button('Discard').click();await f.sketchPanel().waitFor({state:'hidden'});await f.same(source);assert.deepEqual(await inspect(source,'08-cancel-original'),originalNative);
 // Without a downstream reference the replacement is valid but owns fresh side IDs.
 const plain=upstream(source);await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'plain-tagged-triangle.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plain))});await f.same(plain);await f.ready();
 await f.openFeatureEditor(1);await f.editor().getByRole('button',{name:'Edit sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.frame([[0,0],[40,0],[8,30],[0,8],[40,8],[8,38]]);await button('Clear profile').click();await f.tool('Line','l');for(const point of [[0,8],[40,8],[8,38],[0,8]])await f.worldClick(point);
 const replacement=(await f.finishSketch('09-plain-redraw')).doc;assert.deepEqual(replacement.nodes[0].points,[[0,8],[40,8],[8,38]]);const ids=replacement.nodes[0].sideTags.outer;assert.equal(ids.length,3);assert.equal(new Set(ids).size,3);assert.ok(ids.every(id=>!plain.nodes[0].sideTags.outer.includes(id)),JSON.stringify(ids));assert.deepEqual(replacement.nodes[1],plain.nodes[1]);
 const replacementNative=await inspect(replacement,'10-plain-native');assert.ok(Math.abs(replacementNative[0].volume-6000)<1e-7);for(const z of [0,10])for(const [x,y] of [[0,8],[40,8],[8,38]])assert.ok(replacementNative[0].vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<1e-9));
 await f.undo();await f.same(plain);await f.redo();await f.same(replacement);assert.deepEqual(await inspect(replacement,'11-redo-native'),replacementNative);
 const saved=await f.save('fresh-side-identities');await f.freshOpen(saved.file,saved.doc,'12-reopened');await f.same(replacement);assert.deepEqual(await inspect(replacement,'13-reopened-native'),replacementNative);await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('14-final-iso');
 f.report.observations.push({label:'plain-replacement-fresh-identities',oldTags:plain.nodes[0].sideTags.outer,newTags:ids,undoRedo:true,reopened:true});await f.persist();
});
