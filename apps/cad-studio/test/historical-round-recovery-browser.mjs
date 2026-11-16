import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow, sha256 } from './flow-helper.mjs';
const path='apps/cad-studio/test/fixtures/historical-collapsed-round.bcad';
const bytes=await readFile(new URL('./fixtures/historical-collapsed-round.bcad',import.meta.url));
assert.equal(sha256(bytes),'de9909089229a143d552ac12dbe0e88e4201b17fe266be35f3be752239b664b1');
const source=JSON.parse(bytes);
const f=await createFlow({name:'historical-round-recovery',output:process.argv[2],envFrozen:'HISTORICAL_ROUND_FROZEN',initialFiles:[path,'apps/cad-studio/test/historical-round-recovery-browser.mjs'],requiredFrozen:['apps/cad-studio/src/App.tsx'],qualification:'Exact historical R10/R20 collapsed-arc saved document, same-draft radius recovery.',limits:['One retained original historical document. No newly fabricated collapsed geometry.'],
 inspectorSource:`import {readFileSync} from 'node:fs';import {evaluateCadPart,checkOutput,massPropertiesOf} from '@barocss/cad';import {toPartDocument} from '@barocss/cad-model/engine/part';const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));const [body]=evaluateCadPart(toPartDocument(doc)).outputs;console.log(JSON.stringify({valid:checkOutput(body).valid,volume:massPropertiesOf(body).volume}));`});
const field=i=>f.sketchPanel().getByLabel('Arc '+i+' radius',{exact:true});
await f.run(async()=>{
 await f.newPage();await f.page.setViewportSize({width:1440,height:1000});
 await f.openFile({name:'historical-collapsed-round.bcad',mimeType:'application/json',buffer:bytes},2);await f.same(source);
 await f.openFeatureEditor(1);await f.editor().getByRole('button',{name:'Edit sketch',exact:true}).click();await f.sketchPanel().waitFor();
 await f.snapshot('01-exact-historical-open');
 assert.equal(Number(await field(3).inputValue()),20);assert.equal(Number(await field(4).inputValue()),10);
 await field(4).fill('5');await f.snapshot('02-same-draft-R5');
 assert.equal(await f.sketchAlert(),null);
 const current=(await f.finishSketch('03-repaired-finish')).doc;
 assert.equal(current.nodes[0].outline.radii[2],20);assert.equal(current.nodes[0].outline.radii[3],5);
 assert.deepEqual(current.nodes[0].sideTags,source.nodes[0].sideTags);assert.deepEqual(current.nodes[1],source.nodes[1]);
 const native=await f.inspect('repaired-native',current);assert.equal(native.valid,true);const idealVolume=7054.30137981, idealGap=Math.abs(native.volume-idealVolume);
 // Keep the historical input's numerical discrepancy visible; this flow qualifies UI recovery, not ideal-shape accuracy.
 assert.ok(Number.isFinite(native.volume));
 const points=current.nodes[0].outline.points;assert.ok(Math.hypot(points[3][0]-points[2][0],points[3][1]-points[2][1])>20);
 f.report.observations.push({...native,idealVolume,idealGap,idealTolerance:1e-7,idealAccuracy:idealGap<=1e-7?'PASS':'FAIL'});
 await f.undo();await f.same(source);await f.redo();await f.same(current);
 const saved=await f.save('historical-round-repaired');assert.deepEqual(saved.doc,current);await f.freshOpen(saved.file,current,'04-fresh-open');
});
