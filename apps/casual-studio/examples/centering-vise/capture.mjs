import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dist = new URL('../../../cad-studio/dist/', import.meta.url);
const out = process.argv[2]; assert.ok(out, 'provide an output directory');
const fixture = join(out, 'centering-vise.bcad');
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
  await page.getByText(/(?:Perspective|Orthographic) · 3 solids/).waitFor();
  await page.getByText('Bounds 120 × 60 × 27', { exact: true }).waitFor();
  for (const name of ['Vise base','Left jaw','Right jaw']) {
    await page.locator('.ol-row button[data-browser-body-key]').getByText(name, {exact:false}).waitFor();
  }
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByRole('button', { name: 'Variants', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Variants panel' });
  const input = panel.getByRole('spinbutton', { name: 'Value of opening' });
  assert.equal(await input.inputValue(), '40');
  assert.equal(await input.getAttribute('min'), '40');
  assert.equal(await input.getAttribute('max'), '60');
  const frameAll = page.getByTitle('Frame all (F)', { exact: true });
  const settle = async () => { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); };
  await frameAll.click(); await settle();
  await page.screenshot({ path: join(out, '01-40-mm.png') });
  await panel.getByRole('button', { name: 'Show 60 mm opening', exact: true }).click();
  await panel.getByRole('status', { name: 'Variant shown' }).getByText('60 mm opening', { exact: false }).first().waitFor();
  assert.equal(await input.inputValue(), '60');
  await page.getByText('Bounds 120 × 60 × 27', { exact: true }).waitFor();
  await page.getByText(/(?:Perspective|Orthographic) · 3 solids/).waitFor();
  await settle();
  await page.screenshot({ path: join(out, '02-60-mm.png') });
  await panel.getByRole('button', { name: 'Show the master', exact: true }).click();
  assert.equal(await input.inputValue(), '40');
  await page.getByText('Bounds 120 × 60 × 27', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: CAD Studio desktop opens three native solids, opens the shared 40–60 mm input, shows the 60 mm variant and returns to 40 mm.');
} catch (error) {
  console.error((await page?.locator('body').innerText())?.slice(-6500));
  await page?.screenshot({path:join(out,'debug.png')});
  throw error;
} finally {
  await browser?.close();
  server.close();
}
