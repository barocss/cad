import assert from 'node:assert/strict';
import { resolve, relative } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const output=process.argv[2];assert.ok(output&&relative(resolve(import.meta.dirname,'../../..'),resolve(output)).startsWith('../'));
const pins=['apps/cad-studio/src/state/useVariants.ts','apps/cad-studio/src/ui/VariantsPanel.tsx','apps/cad-studio/test/variant-invalid-input-browser.mjs'];
const f=await createFlow({name:'variant-invalid-input',envFrozen:'VARIANT_INVALID_FROZEN',output,initialFiles:pins,requiredFrozen:pins,
  qualification:'Invalid numeric Variant drafts preserve the last valid box preview and model edit guard.',
  limits:['Synthetic parameter-driven box, not the original assembly mate fixture. Real Chrome controls, native file Save/Open and independent volume/centroid arithmetic.'],
  oracleSource:`import json,math,sys
d=json.load(sys.stdin);b=d['body'];h=d['height']
assert math.isclose(b['volume'],50*h,abs_tol=1e-8)
assert all(math.isclose(x,y,abs_tol=1e-8) for x,y in zip(b['centroid'],[5,2.5,h/2]))
print(json.dumps({'status':'PASS','height':h,'volume':b['volume']}))`});
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{Height:10},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[10,5]},{id:'n1',kind:'extrude',sketch:0,height:{parameter:'Height'}}],outputs:{b1:{node:1,side:'solid'}},nextId:2,variability:{version:1,inputs:[{name:'size',type:'number',unit:'mm',min:1,max:50,default:10,bindings:[{to:'parameter',part:'base',parameter:'Height'}]}],variants:[{name:'high',values:{size:25}}]}};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Variants panel'});
const value=()=>panel().getByLabel('Value of size',{exact:true});
async function geometry(label,height){await f.page.waitForFunction(h=>{const s=window.__studioBodies?.();return window.__studioFresh&&s?.massReady&&Math.abs(s.bodies[0].volume-50*h)<1e-8;},height);await f.runOracle({height,body:(await f.bodies()).bodies[0]},label);}
async function showPanel(){await clickModelCommand(f.page,'Inspect','Variants');await panel().waitFor();}
await f.run(async()=>{
  const origin=new URL(f.server.resolvedUrls.local[0]).origin,newContext=f.browser.newContext.bind(f.browser);
  f.browser.newContext=async options=>{const context=await newContext({...options,serviceWorkers:'block'});await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});return ['http:','https:'].includes(url.protocol)&&url.origin!==origin?route.abort():route.continue();});return context;};
  for(const width of [1024,1440]){
    await f.newPage();await f.page.setViewportSize({width,height:900});
    const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles({name:'variant.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);await showPanel();
    await button('Show high',panel()).click();await f.changed(seed);const high=await f.doc();await geometry(width+'-high',25);
    await value().fill('35');await geometry(width+'-unsaved-valid',35);await f.same(high);
    await value().fill('51');await panel().getByRole('alert').waitFor();await geometry(width+'-invalid-retains35',35);await f.same(high);
    assert.equal(await value().getAttribute('aria-invalid'),'true');const description=await value().getAttribute('aria-describedby');assert.match(await f.page.locator('#'+description).innerText(),/1 to 50.*reset to high/);
    assert.match(await panel().getByLabel('Variant shown').innerText(),/last valid preview/);
    assert.equal(await button('Update high',panel()).isDisabled(),true);await panel().getByLabel('Variant name').fill('invalid');assert.equal(await button('Save variant',panel()).isDisabled(),true);
    await f.snapshot(width+'-invalid');
    await f.openFeatureEditor(1);await f.editor().getByLabel('Width',{exact:true}).fill('11');await button('Apply',f.editor()).click();await f.waitToast(/show the master/i);await f.same(high);await f.dismissToasts();await f.closeEditor();
    await button('Reset to high',panel()).click();await geometry(width+'-reset',25);assert.equal(await value().getAttribute('aria-invalid'),null);
    await value().fill('15');await geometry(width+'-valid15',15);await button('Update high',panel()).click();await f.changed(high);const updated=await f.doc();assert.equal(updated.variability.variants[0].values.size,15);assert.deepEqual(updated.nodes,seed.nodes);
    await f.undo();await f.same(high);await geometry(width+'-undo',25);await f.redo();await f.same(updated);await geometry(width+'-redo',15);
    const saved=await f.save(width+'-updated');await f.newPage();await f.page.setViewportSize({width,height:900});await f.openFile(saved.file,2);await f.same(updated);await geometry(width+'-fresh',15);await showPanel();
    await value().fill('51');await panel().getByRole('alert').waitFor();await geometry(width+'-fresh-invalid',15);await button('Show the master',panel()).click();await geometry(width+'-explicit-master',10);assert.equal(await panel().getByLabel('Variant shown').count(),0);assert.equal(await value().inputValue(),'10');
    await f.openFeatureEditor(1);await f.closeEditor();await f.snapshot(width+'-master-editable');
  }
});
