import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/panel-opposing-length-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/ui/SketchPanel.tsx','apps/cad-studio/src/ui/ConstraintList.tsx','apps/cad-studio/src/ui/ConstraintTools.tsx','apps/cad-studio/src/sketch/constraintList.ts','apps/cad-studio/src/sketch/constraintInspection.ts','apps/cad-studio/src/viewport/studioSketchViewportActions.ts','packages/barocss-cad-model/src/sketch/rules.ts'];
const f=await createFlow({name:'panel-opposing-length',output:process.argv[2],envFrozen:'PANEL_OPPOSING_LENGTH_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:baseline?'Observe panel opposing-length refusal without recovery target; separately qualify existing canvas recovery.':'Panel and canvas opposing-length refusal recover through exact conflicting row; accepted volume and Undo/Redo.',
 limits:['Synthetic H/V rectangle 40×20 extruded 2 mm only. No arbitrary solver/conflict localization guarantee.','Native evaluator volume is compared with independent rectangular arithmetic 42×20×2; not a separate geometry kernel.','No Save/Open, delayed callback or unrelated constraint families qualified.'],
 inspectorSource:`import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{checkOutput,evaluateCadPart,massPropertiesOf}from'@barocss/cad';import{emptyDoc,withNode}from'@barocss/cad-model/engine/doc';import{toPartDocument}from'@barocss/cad-model/engine/part';import{profileOf}from'@barocss/cad-model/sketch/loops';const input=JSON.parse(readFileSync(process.argv[2],'utf8'));if(input.prepare){const p=profileOf([{kind:'polygon',closed:true,points:[[0,0],[40,0],[40,20],[0,20]],hv:{h:[0,2],v:[1,3]},lengths:{0:40,1:20,2:40}}]);assert.ok('node'in p);console.log(JSON.stringify(withNode(withNode(emptyDoc(),p.node),{kind:'extrude',sketch:0,height:2})));}else{const [body]=evaluateCadPart(toPartDocument(input)).outputs;console.log(JSON.stringify({valid:checkOutput(body).valid,volume:massPropertiesOf(body).volume}));}`});
const button=(scope,name)=>scope.getByRole('button',{name,exact:true});
const jump=()=>button(f.sketchPanel(),'Find conflicting length on edge 3');
const filters=()=>f.sketchPanel().getByRole('group',{name:'Constraint filters',exact:true});
const kind=()=>filters().getByRole('combobox',{name:'Constraint kind',exact:true});
const dimension=()=>f.page.locator('input.dim-edit');
const selection=()=>f.page.evaluate(()=>JSON.parse(JSON.stringify(window.__studioSelection)));
const stages={panel:'NOT_RUN',canvas:'NOT_RUN'};
const draftValues=()=>f.sketchPanel().getByRole('spinbutton').evaluateAll(es=>es.filter(e=>/^(Point \d+ [XY]|Edge \d+ length)$/.test(e.getAttribute('aria-label')??'')).map(e=>({label:e.getAttribute('aria-label'),value:e.value})));
async function open(source){await f.newPage();await f.page.setViewportSize({width:1024,height:800});await f.openFile({name:'synthetic-opposing-length.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))},2);await f.same(source);await f.openFeatureEditor(1);await button(f.editor(),'Edit sketch').click();await f.sketchPanel().waitFor();await f.tool('Select','s');await f.frame([[20,20],[20,0]]);}
async function canvas42(){await f.worldClick([20,0]);await dimension().fill('42');await dimension().press('Enter');await dimension().waitFor({state:'hidden'});}
async function recover(source,route){
 assert.equal(await jump().count(),1);await jump().press('Enter');
 await f.page.waitForFunction(()=>document.activeElement?.getAttribute('data-constraint-id')==='len:2');
 await f.page.waitForFunction(()=>{const marks=[...document.querySelectorAll('.vp-overlay .inspected')];return marks.length===1&&marks[0].getAttribute('data-sketch-entity')==='edge:2';});
 assert.equal(await kind().inputValue(),'Length');await f.snapshot(route+'-02-exact-conflict-target');
 await f.page.keyboard.press('Tab');await f.page.keyboard.press('Enter');
 await button(f.sketchPanel(),'Remove Length edge 3 = 40').waitFor({state:'hidden'});assert.equal(await jump().count(),0);
 if(route==='panel')await f.sketchPanel().getByRole('spinbutton',{name:'Edge 1 length',exact:true}).fill('42');
 else await canvas42();
 const current=(await f.finishSketch(route+'-03-recovered')).doc;
 assert.deepEqual(current.nodes[0].outline.lengths,{0:42,1:20});assert.deepEqual(current.nodes[0].sideTags,source.nodes[0].sideTags);assert.deepEqual(current.nodes[1],source.nodes[1]);
 const native=await f.inspect(route+'-native',current),arithmetic=42*20*2;assert.equal(arithmetic,1680);assert.equal(native.valid,true);assert.ok(Math.abs(native.volume-arithmetic)<1e-7);
 await f.undo();await f.same(source);await f.redo();await f.same(current);
 return{status:'PASS',target:'len:2',entity:'edge:2',volume:native.volume,independentRectangleArithmetic:arithmetic,undoRedo:true};
}
await f.run(async()=>{
 f.report.observations.push({mode:baseline?'BASELINE':'ACTUAL',stages});
 const source=await f.inspect('source',{prepare:true});
 await open(source);const before=await selection(),draftBefore=await draftValues();assert.ok(draftBefore.length>=8);
 f.phase='panel Edge 1 length 42 refusal';await f.sketchPanel().getByRole('spinbutton',{name:'Edge 1 length',exact:true}).fill('42');
 await f.sketchPanel().getByRole('alert').getByText(/Conflict: no shape meets/).waitFor();await f.same(source);assert.deepEqual(await selection(),before);
 const controlledValue=await f.sketchPanel().getByRole('spinbutton',{name:'Edge 1 length',exact:true}).inputValue();assert.equal(controlledValue,'40');assert.deepEqual(await draftValues(),draftBefore);
 await f.snapshot('panel-01-refused');
 if(baseline){assert.equal(await jump().count(),0);stages.panel={status:'PASS',mode:'BASELINE',targetAbsent:true,refusalSourceSelectionPreserved:true,recovery:'NOT_RUN'};}
 else stages.panel=await recover(source,'panel');
 // Fresh context, same document: independent existing canvas route, not a continuation of panel state.
 await open(source);await kind().selectOption('Vertical');await filters().getByRole('checkbox',{name:'Picked only',exact:true}).check();await f.tool('Dimension','d');
 f.phase='existing canvas 42 refusal and recovery';await canvas42();await f.sketchPanel().getByRole('alert').getByText(/Conflict: no shape meets/).waitFor();await f.same(source);await f.snapshot('canvas-01-refused');
 stages.canvas=await recover(source,'canvas');
});
