import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createFlow, sha256 } from './flow-helper.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

const pins = [
  'apps/cad-studio/test/direct-agent-visual-review-browser.mjs', 'apps/cad-studio/test/mcp-browser-session.mjs',
  'apps/cad-studio/server/cadMcp.ts', 'packages/barocss-cad-model/src/chat/part/views.ts',
  'packages/barocss-cad-model/src/chat/views.ts', 'packages/barocss-cad-model/src/chat/contract.ts',
  'packages/barocss-cad-model/src/chat/groups.ts', 'packages/barocss-cad-model/src/engine/direct.ts',
];
const f = await createFlow({
  name: 'direct-agent-visual-review', output: process.argv[2], envFrozen: 'D1626_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Match the local MCP Direct review to visible desktop Studio curves and sheet before and after a rail is hidden.',
  limits: ['One straight rail, one cubic rail and their native Ruled sheet. Top-view coverage check and desktop WebGPU.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { directOps } from '@barocss/cad-model/engine/direct';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify({ ...doc, direct: directOps.ruledSurface(doc.direct, 'a', 'b') }));
`,
});
const input = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  direct: {
    sources: {
      a: '@model rails {version:0;length-unit:mm;@curve #straight {type:nurbs;degree:1;knots:[2,2,4,4];control-points:[[10,10,0],[40,10,6]];weights:[1,1];}}',
      b: '@model rails {version:0;length-unit:mm;@curve #crown {type:nurbs;degree:3;knots:[2,2,2,2,4,4,4,4];control-points:[[10,30,3],[18,34,12],[32,34,-3],[40,30,9]];weights:[1,1,1,1];}}',
    },
    objects: [{ id: 'a', name: 'Straight rail', source: 'a', geometry: 'straight' },
      { id: 'b', name: 'Crown rail', source: 'b', geometry: 'crown' }],
  },
};
const topScale = 444 / 30;
const viewCenter = [750, 250];
const crown = [25, 33, 4.875], straight = [25, 10, 3], middle = [25, 21.5, 3.9375];
const sheetColor = [171, 199, 228], curveColor = [23, 101, 125], white = [255, 255, 255];
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const options = { app: f.app, output: f.output, clientName: f.name };

function topWitnesses(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]], [1000, 1000, 8, 2]);
  const compressed = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(compressed));
  assert.equal(pixels.length, 3_001_000);
  const around = ([x, y]) => {
    // The rails span x = 10–40 and y = 10–33 mm. The Crown rail peaks at u = 3 by the Bernstein polynomial.
    const px = Math.floor(viewCenter[0] + (x - 25) * topScale), py = Math.floor(viewCenter[1] - (y - 21.5) * topScale);
    const result = [];
    for (let row = py - 2; row <= py + 2; row++) {
      assert.equal(pixels[row * 3001], 0, 'PNG row has no filter');
      for (let col = px - 2; col <= px + 2; col++) {
        const start = row * 3001 + 1 + col * 3;
        result.push([...pixels.subarray(start, start + 3)]);
      }
    }
    return result;
  };
  const same = (a, b) => a.every((value, i) => value === b[i]);
  return { sheet: around(middle).every(pixel => same(pixel, sheetColor)),
    outside: around([25, 35]).every(pixel => same(pixel, white)),
    straight: around(straight).some(pixel => same(pixel, curveColor)),
    crown: around(crown).some(pixel => same(pixel, curveColor)) };
}

async function review(file, label, expectedObjects, stale) {
  const before = await readFile(file);
  const result = await withMcpSession(options, file, label, async (call, request) => {
    const { input: described } = await call('describe', { tool: 'query', action: 'render' });
    assert.equal(described.properties.expectedDirectRevision.pattern, '^[a-f0-9]{64}$');
    const { direct_revision: revision } = await call('query', { action: 'summary' });
    const render = expectedDirectRevision => request('tools/call', { name: 'query', arguments: { action: 'render', expectedDirectRevision } });
    if (stale) {
      assert.notEqual(revision, stale);
      const refusal = await render(stale);
      assert.equal(refusal.isError, true);
      assert.deepEqual(refusal.content.map(block => block.type), ['text']);
      const { code, expectedDirectRevision, revision: current } = JSON.parse(refusal.content[0].text);
      assert.deepEqual([code, expectedDirectRevision, current], ['DIRECT_RENDER_STALE', stale, revision]);
    }
    const reply = await render(revision);
    assert.equal(reply.isError, false, JSON.stringify(reply.content[0]));
    const meta = JSON.parse(reply.content[0].text);
    assert.deepEqual(reply.structuredContent, meta);
    assert.deepEqual(Object.keys(meta.views), ['front', 'top', 'right', 'iso']);
    assert.deepEqual([meta.revision, meta.views.top.mm_per_px, meta.directObjects], [revision, 0.0676, expectedObjects]);
    assert.deepEqual(reply.content.map(block => block.type), ['text', 'image']);
    assert.equal(reply.content[1].mimeType, 'image/png');
    const png = Buffer.from(reply.content[1].data, 'base64'), digest = sha256(png);
    assert.equal(meta.imageSha256, digest);
    const witnesses = topWitnesses(png);
    assert.deepEqual(witnesses, { sheet: true, outside: true, straight: true, crown: !stale });
    await writeFile(join(f.output, label + '.png'), png);
    return { revision, digest, witnesses, bytes: png.length };
  });
  assert.deepEqual(await readFile(file), before);
  return result;
}

async function pick(point, name) {
  const xy = await f.page.evaluate(point => window.__studioScreenOf(point), point);
  assert.ok(xy && await f.page.evaluate(xy => document.elementFromPoint(...xy)?.matches('canvas.vp-canvas'), xy));
  await f.page.mouse.click(...xy);
  await f.page.locator('.ol.direct.sel').filter({ hasText: name }).waitFor({ timeout: 5000 });
}

await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async args => {
    const context = await newContext({ ...args, serviceWorkers: 'block' });
    const origin = new URL(f.server.resolvedUrls.local[0]).origin;
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType: 'text/css', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    return context;
  };
  const doc = await f.inspect('fixture', input), file = join(f.output, 'direct-rails.bcad');
  await writeFile(file, JSON.stringify(doc));
  const objects = doc.direct.objects.map(({ id, name }, i) => ({ id, name, kind: i === 2 ? 'surface' : 'curve' }));
  await f.freshOpen(file, doc, '01-open');
  f.phase = 'Match projected sheet fill and both traces to actual Studio picks';
  await button('Top').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('02-studio-two-rails');
  const initial = await review(file, '02-mcp-two-rails', objects);
  await pick(straight, 'Straight rail');
  await pick(middle, 'Ruled surface');
  await pick(crown, 'Crown rail');

  f.phase = 'Hide the Crown rail in Studio and refuse the old review pin';
  await button('Hide', f.page.getByRole('complementary', { name: 'Direct geometry' })).click();
  await f.changed(doc);
  const edited = await f.doc();
  assert.equal(edited.direct.objects[1].hidden, true);
  assert.deepEqual(edited.direct.sources, doc.direct.sources);
  assert.deepEqual(edited.direct.objects[2], doc.direct.objects[2]);
  await f.snapshot('03-studio-hidden-crown');
  const saved = await f.save('hidden-crown');
  const current = await review(saved.file, '03-mcp-hidden-crown', [objects[0], objects[2]], initial.revision);
  assert.notEqual(current.digest, initial.digest);
  await f.freshOpen(saved.file, edited, '04-fresh-open');
  await f.page.locator('.ol.direct.hidden-obj').filter({ hasText: 'Crown rail' }).waitFor();
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), doc);
  f.report.observations.push({ initial, current, originUnchanged: true, staleReplyImages: 0 });
});
