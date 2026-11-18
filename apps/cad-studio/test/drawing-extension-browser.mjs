import assert from 'node:assert/strict';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createFlow, sha256 } from './flow-helper.mjs';

const f = await createFlow({
  name: 'drawing-extension', output: process.argv[2], envFrozen: 'DRAWING_EXTENSION_FROZEN',
  initialFiles: ['apps/cad-studio/test/drawing-extension-browser.mjs','apps/cad-studio/test/drawing-extension-reader.py'],
  qualification: '#240 actual manual front linear dimension extension A/B controls, Undo/Redo, native Save/fresh Open, SVG/DXF downloads.',
  limits: ['Synthetic source-only starter document with references obtained from actual native projected snap points; dimension creation itself is fixture setup, not a tested mouse-authoring flow.', 'Whole part, manual horizontal front view only. No assembly, lost-reference, scoped-body, vertical/aligned, or mixed-sheet claim.', 'Download bytes and hashes retained for independent parser review; this driver alone does not qualify a downstream DXF viewer.'],
  snapshotExtra: () => ({ drawing: window.__studioDrawing?.() ?? null }),
  inspectorSource: `
import assert from 'node:assert/strict';
import {starterDoc} from '@barocss/cad-model/engine/doc';
import {brepsFor} from '@barocss/cad-model/engine/evaluate';
import {projectViews} from '@barocss/cad-model/drawing/project';
import {snapPoints} from '@barocss/cad-model/drawing/dimensions';
import {defaultDrawing,readDrawing} from '@barocss/cad-model/drawing/types';
const doc=starterDoc(), source=brepsFor(doc);assert.ok('breps' in source);
const projected=projectViews(source.breps,source.prefixes);assert.ok(projected.ok);
const points=snapPoints(projected.views.front);
const at=(x,z)=>{const p=points.find(p=>Math.abs(p.at[0]-x)<1e-9&&Math.abs(p.at[1]-z)<1e-9);assert.ok(p);return p.ref;};
const dim={id:'manual-width',kind:'linear',view:'front',orient:'horizontal',a:at(0,0),b:at(64,0),place:[32,-12]};
console.log(JSON.stringify({...doc,drawing:readDrawing({...defaultDrawing(),scope:{kind:'part'},scale:1,dimensions:[dim]})}));
` });
const button = name => f.page.getByRole('button', { name, exact: true });
const hideName = side => side ? `Hide extension ${side.toUpperCase()}` : 'Show both extension lines';
async function drawing() {
  if (!await f.page.locator('.dw[aria-label="Drawing"]').count()) await button('Drawing').click();
  await f.page.waitForFunction(() => { const d=window.__studioDrawing?.()?.dimensions; return d?.length===1&&d[0].id==='manual-width'&&d[0].value===64; });
  await f.page.locator('.dw-dims .dw-annotation-select').click();
  await button('Hide extension A').waitFor({state:'visible'});
  await f.page.waitForFunction(() => !document.querySelector('[aria-label="Hide extension A"]')?.disabled);
}
async function state(expected, label) {
  await f.same(expected);
  const select=f.page.locator('.dw-dims .dw-annotation-select');
  if (await select.getAttribute('aria-pressed')!=='true') await select.click();
  await f.page.waitForFunction(() => window.__studioDrawing?.()?.dimensions?.[0]?.value===64);
  assert.equal(await button(hideName(expected.drawing.dimensions[0].hideExtension)).getAttribute('aria-pressed'),'true');
  const markers=f.page.locator('[aria-label="Dimension endpoint roles"]');
  assert.equal(await markers.count(),1);
  assert.deepEqual(await markers.locator('text').allTextContents(),['A','B']);
  await writeFile(join(f.output,`${label}-document.json`),JSON.stringify(await f.doc(),null,2));
  await f.snapshot(label);
}
async function downloads(label) {
  for (const [kind,name] of [['svg','Export SVG'],['dxf','Export DXF']]) {
    const pending=f.page.waitForEvent('download'); await button(name).click(); const download=await pending;
    const file=join(f.output,`${label}.${kind}`); await download.saveAs(file);
    assert.equal(await download.failure(),null);
    const bytes=await readFile(file); assert.ok(bytes.length>0);
    const text=bytes.toString(kind==='dxf'?'latin1':'utf8');
    assert.ok(!text.includes('Dimension endpoint roles')&&!text.includes('Extension endpoint'),'editing overlay is not exported');
    f.report.files.push({label,kind,file,name:download.suggestedFilename(),bytes:bytes.length,sha256:sha256(bytes),boundary:'actual browser download saved without byte rewriting'});
  }
  await f.persist();
}
async function preview(side) {
  await button(hideName(side)).hover();
  await f.page.waitForFunction(side => document.querySelector('[aria-label="Extension endpoint '+side.toUpperCase()+'"] circle')?.getAttribute('r')==='1.8',side);
  const a=f.page.locator('[aria-label="Extension endpoint A"] circle');
  const b=f.page.locator('[aria-label="Extension endpoint B"] circle');
  assert.equal(await a.getAttribute('r'),side==='a'?'1.8':'1.1');
  assert.equal(await b.getAttribute('r'),side==='b'?'1.8':'1.1');
}
await f.run(async () => {
  const seed=await f.inspect('prepare',{}); await f.newPage();
  await f.page.setViewportSize({width:1440,height:1000});
  await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'extension-lines.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
  await f.same(seed); await drawing();
  const baseline=await f.doc();
  const changed=side=>({...baseline,drawing:{...baseline.drawing,dimensions:[{...baseline.drawing.dimensions[0],hideExtension:side}]}});
  const hiddenA=changed('a'),hiddenB=changed('b');
  await state(baseline,'01-both'); await downloads('01-both');
  await preview('a'); await button('Hide extension A').click();
  await state(hiddenA,'02-hide-a'); await downloads('02-hide-a');
  await f.undo(); await state(baseline,'03-undo-a');
  await f.redo(); await state(hiddenA,'04-redo-a');
  await preview('b'); await button('Hide extension B').click();
  await state(hiddenB,'05-hide-b'); await downloads('05-hide-b');
  await f.undo(); await state(hiddenA,'06-undo-b');
  await f.redo(); await state(hiddenB,'07-redo-b');
  await button('Show both extension lines').click(); await state(baseline,'08-restore-both'); await downloads('08-restore-both');
  await f.undo(); await state(hiddenB,'09-undo-restore');
  await f.redo(); await state(baseline,'10-redo-restore');
  await button('Hide extension A').click(); await state(hiddenA,'11-before-save');
  const saved=await f.save('drawing-extension');
  await f.freshOpen(saved.file,hiddenA,'12-fresh-open'); await drawing();
  await state(hiddenA,'13-persisted-a'); await downloads('13-persisted-a');
  await button('Show both extension lines').click(); await state(baseline,'14-post-open-restore'); await downloads('14-post-open-restore');
  await f.undo(); await state(hiddenA,'15-post-open-undo');
  await f.redo(); await state(baseline,'16-post-open-redo');
  const input={files:[['01-both',null],['02-hide-a','a'],['05-hide-b','b'],['08-restore-both',null],['13-persisted-a','a'],['14-post-open-restore',null]].map(([label,hide])=>({file:join(f.output,label+'.dxf'),svg:join(f.output,label+'.svg'),hide,measurement:64}))};
  await writeFile(join(f.output,'independent-reader-input.json'),JSON.stringify(input,null,2));
  const oracle=spawnSync('/Users/user/.cache/barocss-ezdxf/bin/python',['-I',join(import.meta.dirname,'drawing-extension-reader.py')],{input:JSON.stringify(input),encoding:'utf8'});
  await writeFile(join(f.output,'independent-reader.json'),oracle.stdout??'');await writeFile(join(f.output,'independent-reader.stderr.txt'),oracle.stderr??'');
  assert.equal(oracle.status,0,oracle.stderr);assert.equal(JSON.parse(oracle.stdout).status,'PASS');
  f.report.observations.push({id:'manual-width',value:64,referenceRoles:'saved a/b, not left/right inference',exactDocumentComparisons:true,oneUndoPerToggle:true,nativeSaveFreshOpen:true,originalDownloadFiles:true,independentDXFParser:'installed ezdxf read + regeneration, XML marks comparison'});
});
