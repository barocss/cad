import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dist = new URL('../../../cad-studio/dist/', import.meta.url);
const out = process.argv[2]; assert.ok(out, 'provide an output directory');
const fixture = join(import.meta.dirname,'rover-assembly.bcad');
const server = createServer(async (req,res) => {
  const url = new URL(req.url,'http://localhost'), path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!/^(index\.html|assets\/[\w.-]+)$/.test(path)) { res.writeHead(404).end(); return; }
  try {
    const bytes = await readFile(new URL(path,dist));
    res.setHeader('content-type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.wasm') ? 'application/wasm' : 'text/html; charset=utf-8');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,page;
try {
  browser = await chromium.launch({executablePath:process.env.CHROME_PATH || undefined,args:['--enable-unsafe-webgpu']});
  page = await browser.newPage({viewport:{width:1540,height:1020},acceptDownloads:true});
  page.setDefaultTimeout(12_000);
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByLabel('Model file',{exact:true}).setInputFiles(fixture);
  await page.getByRole('button',{name:'Explode',exact:true}).waitFor({timeout:15_000});
  await page.getByText(/(?:Perspective|Orthographic) · \d+ solids?/).waitFor({timeout:15_000});
  const explode=page.getByRole('button',{name:'Explode',exact:true});
  await explode.waitFor();
  assert.equal(await page.locator('.ol.instance:not(.nested)').count(),24);
  const frameAll = page.getByTitle('Frame all (F)',{exact:true});
  const settle = async () => { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); };
  // Root status counts only the base body; wait for occurrence meshes through frame-all before capture.
  await frameAll.click(); await settle();
  await page.screenshot({path:join(out,'01-assembled.png')});
  await explode.click();
  await explode.click();
  await explode.getByText(/×1$/).waitFor();
  await frameAll.click(); await settle();
  await page.screenshot({path:join(out,'02-exploded.png')});
  // Restore presentation state before viewing the stored instructions.
  for (let i=0;i<2;i++) await explode.click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  await page.locator('.palette input').fill('Assembly steps');
  await page.keyboard.press('Enter');
  const panel=page.getByRole('complementary',{name:'Assembly steps panel',exact:true});
  await panel.getByRole('button',{name:'Go to step 4: Front range sensor'}).waitFor();
  await panel.getByRole('button',{name:'Go to step 2: Upper deck and standoffs'}).click();
  assert.equal(await panel.getByRole('status',{name:'Step position'}).textContent(),'Step 2 of 4');
  await frameAll.click(); await settle();
  await page.screenshot({path:join(out,'03-assembly-step.png')});
  await panel.getByRole('button',{name:'Go to step 4: Front range sensor'}).click();
  assert.equal(await panel.getByRole('status',{name:'Step position'}).textContent(),'Step 4 of 4');
  assert.deepEqual(errors,[]);
  console.log('PASS: 25 solids in Studio, exploded view, four stored assembly steps');
} catch (error) {
  console.error((await page?.locator('body').innerText())?.slice(-6500));
  await page?.screenshot({path:join(out,'debug.png')});
  throw error;
} finally {
  await browser?.close();
  server.close();
}
