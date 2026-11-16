import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const f = await createFlow({ name: 'band-history-highlight', output: process.argv[2], envFrozen: 'BAND_HISTORY_HIGHLIGHT_FROZEN',
 initialFiles: ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/app/bandHighlight.ts', 'apps/cad-studio/test/band-history-highlight-browser.mjs'],
 qualification: 'Real History Band re-picks and source-edge cyan pixels; no product selection mutation hooks.',
 limits: ['Coaxial cylinder fixture only; screenshot cyan is a display observation, not a native topology proof.'] });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.locator('.hud');
const ready = () => hud().locator('.status').filter({ hasText: /^preview$/ }).waitFor();
async function sample(label, world) {
 await f.page.mouse.move(8, 8);
 await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
 const point = await f.page.evaluate(p => window.__studioScreenOf(p), world);
 const bytes = await f.page.screenshot({ path: `${f.output}/${label}.png` });
 const pixels = await f.page.evaluate(async ({ data, point }) => {
  const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  const x = Math.round(point[0]), y = Math.round(point[1]), radius = 12;
  const rgba = ctx.getImageData(x-radius,y-radius,2*radius+1,2*radius+1).data;
  let cyan = 0; for (let i=0;i<rgba.length;i+=4) if (rgba[i+1]>130 && rgba[i+2]>140 && rgba[i+1]-rgba[i]>45 && rgba[i+2]-rgba[i]>45) cyan++;
  return {cyan,x,y,radius};
 }, { data: bytes.toString('base64'), point });
 f.report.observations.push({label,world,...pixels,hud:await hud().innerText()});
 return pixels.cyan;
}
await f.run(async () => {
 const raw = JSON.parse(await readFile(new URL('./fixtures/band-pairing-owner.bcad',import.meta.url),'utf8'));
 const doc = {...raw,nodes:raw.nodes.slice(0,5),outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'},b4:{node:4,side:'solid'}},nextId:5};
 await f.newPage(); await f.page.setViewportSize({width:1440,height:900});
 await f.openFile({name:'band-history-highlight.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},5);
 await button('Iso',f.page.locator('.views')).click(); if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();
 await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 const filter=button('Selection filter'); for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();
 // Positive control: same named original rim, creation command, accepted preview.
 await f.worldClick([0,-20,10]); await f.page.waitForFunction(()=>window.__studioSelection.selection.edges.length===1);
 await f.command('Band surface'); await f.worldClick([0,-10,40]); await ready();
 const control=await sample('01-creation-control',[0,-20,10]); assert.ok(control>3,`creation cyan control ${control}`);
 await button('Cancel',hud()).click(); await f.same(doc);
 await f.page.locator('.history .hs[data-node-index="4"]').click(); await ready();
 await sample('02-history-keep',[0,-20,10]);
 await hud().getByLabel('Re-pick',{exact:true}).selectOption('a');
 await hud().getByText('pick edges or a face on a body',{exact:true}).waitFor();
 await f.worldClick([0,-20,10]); await ready(); assert.match(await hud().innerText(),/on b1/);
 const actual=await sample('03-history-repick-a',[0,-20,10]); await f.same(doc);
 if(baseline) assert.equal(actual,0,'baseline has no cyan source rim'); else assert.ok(actual>3,`History A cyan ${actual}`);
 await hud().getByLabel('Re-pick',{exact:true}).selectOption('b');
 await hud().getByText('click the second chain (edges, or a face for all its edges)',{exact:true}).waitFor();
 await f.worldClick([0,-10,40]); await ready();
 const b=await sample('04-history-repick-b',[0,-10,40]);
 if(!baseline)assert.ok(b>3,`History B cyan ${b}`);
 await hud().getByLabel('Re-pick',{exact:true}).selectOption('keep'); await ready();
 await sample('05-history-restored-keep',[0,-20,10]);
 await button('Cancel',hud()).click(); await f.same(doc);
 if(!baseline){
  await f.page.locator('.history .hs[data-node-index="4"]').click(); await ready();
  await hud().getByLabel('Flip',{exact:true}).selectOption('yes'); await ready();
  await button('Apply',hud()).click(); await f.changed(doc); const applied=await f.doc();
  assert.equal(applied.nodes[4].flip,true); await f.undo(); await f.same(doc); await f.redo(); await f.same(applied);
 }
 assert.equal(f.report.downloads.length,0);
});
